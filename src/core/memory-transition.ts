/**
 * The shared skeleton of every Memory state-transition verb (task-045-memory-submit; reused by
 * `memory approve`/`reject`/`deprecate`, task-046/047/048, and by `memory amend`, task-127, whose
 * edge is the self-loop of the current state).
 *
 * A transition verb always does the same two things around its own verb-specific rules:
 *
 * 1. {@link prepareMemoryTransition} — find the document by its bare id (spec-008-cli-grammar §7), read
 *    its declared `type` and current `status`, and resolve the legal target for the verb, **all at
 *    `HEAD`**: the committed `memory.yaml` (task-091, `bug-081`, `dl-080` (B)) and the committed
 *    document (task-247, `bug-187`); the working tree supplies the content to commit and is checked to
 *    be the same element `HEAD` records. Every expected
 *    refusal is returned as a `CoreResult.error` (exit `1`), **before anything is written**, so "the
 *    state is unchanged" (P1.6 sc.2, REQ-STATE-01) holds by construction.
 * 2. {@link commitMemoryTransition} — write the new bytes and turn them into exactly one commit scoped
 *    to that one document.
 *
 * What happens in between (required-field checks, which fields change, the commit message) is the
 * verb's own business; see `memorySubmitFn` in `./index.ts`.
 */
import { existsSync, lstatSync } from 'fs';
import { join } from 'path';

import {
  E_INVALID_TRANSITION,
  findMemoryDocumentById,
  findMemoryDocumentByIdAtRev,
  loadMemoryDocumentSummary,
  loadMemoryDocumentSummaryAtRev,
  resolveStateMachine,
  resolveSupersedeTarget,
  resolveTypeTransition,
  validateFrontmatterState,
  verifyDocumentEdit,
} from '../memory';
import type { DocumentScope, MemoryYaml, StateMachine, TransitionOp } from '../memory';
import { commitPaths, pathPorcelainStatus, readDocument, readPathAtRev, writeDocument } from '../storage';
import { ValidationError } from '../validation';

import { requireConfinedWriteTarget } from './confinement';
import { requireGitIdentity, type GitIdentity } from './git-identity';
import { loadMemoryYamlAtRev, MEMORY_YAML_PATH } from './loaders';
import { atHeadOr, resolveRevision } from './revision';
import { coreErr, coreOk, type CoreResult } from './types';
import {
  requireInspectableTarget,
  requireNoDivergentStage,
  requireUnmodifiedTarget,
  undeclaredCommittedPaths,
  type WriteTargetContract,
} from './write-guard';

/** A document located and cleared for one transition — everything the verb needs to finish it. */
export interface PreparedMemoryTransition {
  /**
   * The `memory.yaml` this transition was resolved against — **the one committed at `HEAD`**, never
   * the working tree's (task-091, `bug-081`). It rides the result rather than being re-loaded by the
   * verb so that a single command cannot decide its transition from one copy and its follow-up facts
   * (`memory submit`'s `template.frontmatter.required`) from another.
   */
  readonly memoryYaml: MemoryYaml;
  readonly id: string;
  /** The document's declared frontmatter `type` (a registered `memory.yaml` type). */
  readonly type: string;
  /** Root-relative POSIX path of the document. */
  readonly path: string;
  /**
   * The document's parsed frontmatter **in the working tree** (not schema-validated) — the content a
   * verb checks and commits. Its `id` and `type` equal `HEAD`'s; its `status` may not, and never
   * decides anything: `from` is the committed one (task-247).
   */
  readonly frontmatter: Readonly<Record<string, unknown>>;
  /** The full working-tree file content, the base for the verb's edit. */
  readonly content: string;
  readonly from: string;
  readonly to: string;
  /**
   * The commit `HEAD` resolved to when this transition was decided — the one sha the machine, the
   * document and `from` were read at. A follow-up decision in the same command (the `supersedes:`
   * trigger, task-162) reads at this sha too, so the two cannot come from two commits.
   */
  readonly sha: string;
  /**
   * The document's frontmatter **as `HEAD` records it** — the copy a decision reads (task-247,
   * `command-baseline` 1.4), where {@link frontmatter} is the working tree's content to commit.
   */
  readonly committedFrontmatter: Readonly<Record<string, unknown>>;
}

/**
 * What a transition is resolved for: a verb, `amend` (the self-loop of the current state, task-127),
 * or `supersede` — the `supersedes:` engine trigger, which is not a verb and whose only target is
 * `superseded` (`resolveSupersedeTarget`, task-162).
 */
export type TransitionResolution = TransitionOp | 'amend' | 'supersede';

/**
 * A second sentence for a refusal, appended **only** when the working tree's `memory.yaml` and the
 * committed one actually differ — the diagnostic half of `task-090`'s `workingTreeWouldGrant`, on
 * this surface.
 *
 * Under a committed baseline a refusal can contradict the file open in the user's editor, and
 * `memory.yaml` is precisely the file an author edits while designing a new type or machine
 * (`bug-081`'s Notes: "a half-finished edit is an ordinary state to be in"). So when the two copies
 * disagree, say which one decided. It is computed *after* the decision and is empty on any failure
 * to ask git, so no branch of it can change an outcome.
 */
function uncommittedMachineNote(root: string): string {
  try {
    if (pathPorcelainStatus(root, MEMORY_YAML_PATH) === '') return '';
  } catch {
    return '';
  }
  return (
    ` — note that '${MEMORY_YAML_PATH}' carries uncommitted modifications and the state machine is read from the ` +
    `committed copy (dl-080); commit '${MEMORY_YAML_PATH}' first if this transition depends on that change`
  );
}

/** Whether `full` names a directory entry at all — `lstat`, so a link is present even when dangling. */
function isPresent(full: string): boolean {
  try {
    lstatSync(full);
    return true;
  } catch {
    return false;
  }
}

/**
 * The working-tree path of a document carrying frontmatter `id`, or `undefined` — read only to
 * **explain** a refusal already decided at `HEAD`, never to decide one (the `command-baseline`
 * directive: "the working tree may be read to explain a refusal, never to decide one"). Any failure
 * to scan (a document elsewhere whose frontmatter does not parse) yields `undefined`, so the
 * refusal keeps its plain wording and no branch of this read can change an outcome.
 */
function uncommittedDocumentPath(root: string, memoryYaml: MemoryYaml, id: string): string | undefined {
  try {
    return findMemoryDocumentById(root, memoryYaml, id)?.path;
  } catch {
    return undefined;
  }
}

/**
 * The frontmatter `id` commit `sha` records for `path`, or `undefined` when the commit does not hold
 * the path. Like {@link uncommittedDocumentPath}, it only words a refusal. It needs no guard against
 * an unparsable document: it runs after a full scan at the same sha found nothing, and that scan has
 * already parsed (or thrown on) every document the commit holds under the scan roots.
 */
function recordedIdAt(root: string, sha: string, path: string): string | undefined {
  const id = loadMemoryDocumentSummaryAtRev(root, sha, path)?.frontmatter.id;
  return id === undefined ? undefined : String(id);
}

/**
 * Locate document `id` and resolve verb `op` on it, **at `HEAD`**: the `memory.yaml`, the document
 * the id names and its current `status` are all read from the one commit `HEAD` resolves to, once
 * (`resolveRevision`, then `loadMemoryYamlAtRev` and `findMemoryDocumentByIdAtRev` at that sha).
 *
 * The baseline is the point (`spec-006-core-domain-api` §6 item 1, `dl-080` option (B)). This
 * function takes no `MemoryYaml` and no document: a caller cannot hand it a working-tree machine or a
 * working-tree `status` even by accident. Two defects motivated it. An uncommitted edit to a type's
 * `sequence` used to decide the transition a verb performed (task-091, `bug-081`); and until task-247
 * (`bug-187`) the id was looked up by scanning the working tree and `from` was the working-tree
 * frontmatter's `status`, so an element already past `draft` at `HEAD` but edited back to `draft` on
 * disk was submitted again, and a hand-made document no commit holds was transitioned as if `memory
 * add` had registered it.
 *
 * **Content from the working tree, state from `HEAD`.** The `content` and `frontmatter` this returns
 * are the working tree's, because that is what `memory submit` and `memory amend` commit; `from`, the
 * `type` and the target are `HEAD`'s. The working tree must still carry the same `id` and `type` the
 * commit records — a verb decides on one element and writes that element.
 *
 * Refusals, all returned (never thrown) and all exit `1`:
 *
 * - `HEAD` holds no `memory.yaml` (or there is no commit) → `VALIDATION`, fail-closed: with no
 *   committed machine there is no `from → to` to record, and the only fail-open available is the
 *   working tree, which is the defect. `wingfoil init` commits the scaffold, so no legitimate flow
 *   reaches this;
 * - the committed `memory.yaml` does not parse or validate → `VALIDATION`, same reasoning;
 * - no document at `HEAD` carries that frontmatter `id` → `NOT_FOUND` `document not found: <id>`
 *   (P1.6 sc.3); when a working-tree document carries it, the message says so and names `memory add`
 *   (task-247), since a transition acts only on an element a commit records — or, when `HEAD` holds
 *   that path under another id, `VALIDATION` naming the renamed `id` field;
 * - `HEAD` holds the document but the working tree deleted it → `VALIDATION`, naming the path;
 * - the working tree changes the document's `id` or `type` → `VALIDATION`;
 * - its `type` is not registered → `NOT_FOUND` with `memory add`'s unknown-type message;
 * - its committed `status` is not a state of the type → `VALIDATION` `invalid state '<s>' for type
 *   '<t>'` (task-036's `validateFrontmatterState`);
 * - the verb is illegal from that state → `INVALID_TRANSITION` with the `dl-032` contract message
 *   (`resolveTypeTransition`), the engine's explanation in `details.issues[0].detail`. `amend`
 *   (task-127) never takes this branch: its target is the current state.
 *
 * The unknown-type, invalid-state and illegal-transition refusals keep their pinned messages
 * verbatim as the first sentence; {@link uncommittedMachineNote} may append a second one.
 */
export function prepareMemoryTransition(
  root: string,
  id: string,
  op: TransitionOp | 'amend',
): CoreResult<PreparedMemoryTransition> {
  // Resolved ONCE: every read below is at this sha, so the machine and the document cannot come from
  // two commits even if `HEAD` moves while the verb runs (task-137). No commit at all is the same
  // answer as a commit without `memory.yaml`.
  const sha = atHeadOr(() => resolveRevision(root, 'HEAD'), null);
  let memoryYaml: MemoryYaml | null;
  try {
    memoryYaml = sha === null ? null : loadMemoryYamlAtRev(root, sha);
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
    return coreErr({
      code: 'VALIDATION',
      message:
        `cannot resolve the state machine: the committed '${MEMORY_YAML_PATH}' (at HEAD) is not readable as a Memory ` +
        `configuration: ${error.message}. A transition is decided by the machine the repository records (dl-080), so ` +
        'the committed file must be valid; fix it and commit the fix, then retry.',
      details: { issues: error.issues },
    });
  }
  if (sha === null || memoryYaml === null) {
    return coreErr({
      code: 'VALIDATION',
      message:
        `cannot resolve the state machine: '${MEMORY_YAML_PATH}' is not committed at HEAD. A transition is decided by ` +
        `the machine the repository records, not by a working tree (dl-080); commit '${MEMORY_YAML_PATH}' first, then retry.`,
    });
  }
  return prepareMemoryTransitionAtRev(root, sha, memoryYaml, id, op);
}

/**
 * The body of {@link prepareMemoryTransition}, at a sha and a committed `memory.yaml` the caller has
 * already resolved: locate document `id` at `sha`, check the working tree carries the same element,
 * and resolve `op` on its committed `status`. Every refusal {@link prepareMemoryTransition} documents
 * past the `memory.yaml` read comes from here, unchanged.
 *
 * It exists so that a second decision in one command reads the same commit as the first: the
 * `supersedes:` trigger (task-162) prepares the superseded element at the sha its superseding
 * element's approve was decided at, with `op` `supersede`. With `expectedType`, a document of another
 * type is refused (`VALIDATION`) before its own machine is consulted, since the caller's rule is about
 * the type, not about that machine's states.
 */
export function prepareMemoryTransitionAtRev(
  root: string,
  sha: string,
  memoryYaml: MemoryYaml,
  id: string,
  op: TransitionResolution,
  expectedType?: string,
): CoreResult<PreparedMemoryTransition> {
  let found: ReturnType<typeof findMemoryDocumentByIdAtRev>;
  try {
    found = findMemoryDocumentByIdAtRev(root, sha, memoryYaml, id);
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
    // The scan parses every committed document in path order until it meets the id, so one that does
    // not parse refuses every transition behind it. Say which, as HEAD names it (the reader labels it
    // with the resolved sha), at exit 1 rather than as a raw throw.
    const message = error.message.split(`${sha}:`).join('HEAD:');
    return coreErr({
      code: 'VALIDATION',
      message:
        `cannot resolve ${id} at HEAD: a Memory document committed at HEAD does not parse — ${message}. A transition ` +
        'reads the documents the repository records (spec-006 §6 item 1); fix that document and commit the fix, then retry.',
      details: { issues: error.issues },
    });
  }
  if (!found) {
    const onDisk = uncommittedDocumentPath(root, memoryYaml, id);
    if (onDisk !== undefined) {
      // A document reached through a symbolic link (its own name, or its type directory) is not a
      // tree entry under the scan roots at HEAD, so the HEAD lookup cannot find it; the refusal is
      // already decided, and the filesystem guard words it truthfully (bug-117, bug-120 D2).
      const confined = requireConfinedWriteTarget(root, onDisk, 'write');
      if (!confined.ok) return confined;
      const inspectable = requireInspectableTarget(root, onDisk, TRANSITION_CONTRACT);
      if (!inspectable.ok) return inspectable;
      const recorded = recordedIdAt(root, sha, onDisk);
      if (recorded !== undefined) {
        return coreErr({
          code: 'VALIDATION',
          message:
            `refusing to ${op} ${id}: the working tree changes frontmatter field 'id' of ${onDisk}, which HEAD records ` +
            `as '${recorded}'. A transition acts on the element the commit records; restore the id, then retry.`,
        });
      }
      return coreErr({
        code: 'NOT_FOUND',
        message:
          `document not found: ${id} — ${onDisk} is not committed at HEAD, though it carries that id in the working tree. ` +
          'A transition is decided by the status the repository records (spec-006 §6 item 1, dl-080), so it acts only ' +
          'on a committed element; register a new element with `memory add`, then retry.',
      });
    }
    return coreErr({ code: 'NOT_FOUND', message: `document not found: ${id}${uncommittedMachineNote(root)}` });
  }

  const path = found.path;
  // `lstat`, which never follows a link: a symbolic link in place of the document is present even when
  // it dangles. A live one reaches the write-side guards `commitMemoryTransition` runs (REQ-SEC-06,
  // `bug-120`); a dangling one is refused here, because the content read below would fail on it first
  // (task-247 review).
  const present = isPresent(join(root, path));
  if (present && !existsSync(join(root, path))) {
    return coreErr({
      code: 'VALIDATION',
      message:
        `refusing to ${op} ${id}: its document '${path}' is a symbolic link whose target does not exist in the working ` +
        `tree. Restore the committed file (git restore --source=HEAD --staged --worktree -- ${path}) and retry.`,
    });
  }
  if (!present) {
    // `--source=HEAD --staged --worktree`: a plain `git restore -- <path>` restores from the index,
    // which no longer holds the path after `git rm` or `git mv` (task-247 review).
    return coreErr({
      code: 'VALIDATION',
      message:
        `refusing to ${op} ${id}: its document '${path}' is held by HEAD but deleted in the working tree. Restore it ` +
        `(git restore --source=HEAD --staged --worktree -- ${path}) and retry.`,
    });
  }

  const type = found.frontmatter.type;
  if (expectedType !== undefined && type !== expectedType) {
    return coreErr({
      code: 'VALIDATION',
      message: `${id}, which is a '${String(type)}', not an '${expectedType}': only an element of the same type can be ${op}d`,
    });
  }
  if (typeof type !== 'string' || memoryYaml.types[type] === undefined) {
    return coreErr({
      code: 'NOT_FOUND',
      message: `unknown memory type '${String(type)}' (not defined in memory.yaml)${uncommittedMachineNote(root)}`,
    });
  }

  // Always resolves: the type is registered (checked immediately above), and since task-071
  // (`bug-030-init-memory-yaml-has-no-state-machine`) a registered type with no `states` and no
  // `defaults.states` falls back to the engine's built-in `DEFAULT_STATE_MACHINE` (REQ-STATE-08)
  // instead of throwing. The `VALIDATION` refusal that used to guard this call is therefore gone with
  // the condition it reported — the only throw left in `resolveStateMachine` is for an UNregistered
  // type, which the `NOT_FOUND` above has already returned for.
  const machine: StateMachine = resolveStateMachine(memoryYaml, type);

  const status = found.frontmatter.status;
  // A missing or non-string `status` is reported as an invalid state, never as the text 'undefined'.
  const from = typeof status === 'string' ? status : String(status ?? '');
  try {
    validateFrontmatterState(machine, type, from, path);
    // `amend` moves no state (`dl-108`): its edge is the self-loop `[s → s]` in every state, so no
    // machine lookup can refuse it. Whether the TYPE may be amended is the verb's own check.
    const to =
      op === 'amend'
        ? from
        : op === 'supersede'
          ? resolveSupersedeTarget(memoryYaml, type, from, path)
          : resolveTypeTransition(memoryYaml, type, from, op, path);
    // Content from the working tree: what `submit` and `amend` commit, and what the other verbs'
    // unmodified-document guard compares with `HEAD`.
    const { frontmatter } = loadMemoryDocumentSummary(root, path);
    const changed = (['id', 'type'] as const).filter((key) => frontmatter[key] !== found.frontmatter[key]);
    if (changed.length > 0) {
      return coreErr({
        code: 'VALIDATION',
        message:
          `refusing to ${op} ${id}: the working tree changes ${changed.map((key) => `frontmatter field '${key}'`).join(' and ')} ` +
          `of ${path}, which HEAD records as ${changed.map((key) => `'${String(found.frontmatter[key])}'`).join(' and ')}. ` +
          'A transition acts on the element the commit records; restore the recorded value, then retry.',
      });
    }
    const content = readDocument(join(root, path));
    return coreOk({ memoryYaml, id, type, path, frontmatter, content, from, to, sha, committedFrontmatter: found.frontmatter });
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
    const code = error.issues.some((issue) => issue.code === E_INVALID_TRANSITION) ? 'INVALID_TRANSITION' : 'VALIDATION';
    const message = error.issues.map((issue) => issue.message).join('; ') + uncommittedMachineNote(root);
    return coreErr({ code, message, details: { issues: error.issues } });
  }
}

/**
 * A {@link PreparedMemoryTransition} together with the git identity that will carry it out — the
 * result of {@link beginMemoryTransition}, and the only thing {@link commitMemoryTransition} accepts,
 * so a transition cannot be committed under an identity other than the one its pre-flight checked.
 */
export interface BegunMemoryTransition extends PreparedMemoryTransition {
  /**
   * The identity `requireGitIdentity` resolved and validated (REQ-SEC-01). The one "who" of the whole
   * operation: the authority check takes it (REQ-SEC-03), the `Approver:` line is built from it, and
   * {@link commitMemoryTransition} pins it as the commit's `--author` (`dl-064` B.1, task-132,
   * `bug-149`).
   */
  readonly identity: GitIdentity;
}

/**
 * The shared preamble of every state-moving `memory` verb — `submit`, `approve`, `reject`,
 * `deprecate`, `amend` — written once (task-132, `bug-142`): resolve the git identity
 * (`requireGitIdentity`, REQ-SEC-01, exit `1`), then locate the document and resolve verb `op` on it
 * ({@link prepareMemoryTransition}, exit `1`). The first refusal is returned unchanged; nothing is
 * written either way.
 *
 * The identity is read here ONCE and rides the result, so no verb reads it again (the structural test
 * `test/core/memory-transition-preamble.test.ts` holds every registered transition verb to that).
 * The order matches `spec-006` §7: a verb's usage checks run before it calls this (task-125,
 * `bug-172`), and an approver-gated verb's authority check runs after it, because that check's
 * message names the document's type, which only this step knows.
 */
export function beginMemoryTransition(
  root: string,
  id: string,
  op: TransitionOp | 'amend',
): CoreResult<BegunMemoryTransition> {
  const identity = requireGitIdentity(root);
  if (!identity.ok) return identity;
  const prepared = prepareMemoryTransition(root, id, op);
  if (!prepared.ok) return prepared;
  return coreOk({ ...prepared.value, identity: identity.value });
}

/**
 * Refuse, before anything is written, a document that already carries modifications this transition
 * does not own (task-088, `bug-076`; AC2 option (b)).
 *
 * `commitPaths` bounds a commit by **pathspec**, not by content: `git add -- <path>` stages the whole
 * file, so an uncommitted body paragraph or an unowned frontmatter field rode into an approval under a
 * subject declaring only a state change — and the old post-condition could not see it, because it
 * compared the rendering against the same dirty file. Every recorded fact in such a commit is true
 * (`P1.7`'s approver, timestamp and reason are all present and all correct); the commit is simply
 * larger than what it claims.
 *
 * **Why refusing rather than committing only the status hunk.** Partial staging is undefined here
 * before it is difficult: there are two candidate baselines on disk (the index and the working tree)
 * and they can disagree, so "only the status hunk" does not say onto which text. Worse, a
 * hand-edited-but-uncommitted `status` riding along would have the commit record `draft → approved`
 * under a subject declaring `pending → approved` (the subject's `from` is `HEAD`'s since task-247) —
 * the audit trail asserting something that did not happen, which is the defect, not a fix for it. And the edits a
 * partial commit left behind would be invisible, deferred, and swept into whatever commits next. A
 * refusal costs the user two commands, now, on a document this function has provably not touched.
 *
 * Runs only under `declared-fields-only`; `memory submit` is entitled to carry content and is
 * therefore not guarded (see {@link DocumentScope}). The verb's own writes — `reject`'s
 * `rejection_reason`, every verb's `status` — happen *after* this check, on text it has just certified
 * equal to `HEAD`, so no verb is caught by its own guard.
 *
 * Since `task-092` the gate itself lives in {@link requireUnmodifiedTarget} (`./write-guard.ts`),
 * shared with the six non-transition write verbs `dl-080` reaches through `bug-078`; only the wording
 * below is this call site's own, so the two families cannot drift apart on what "modified" means.
 */
const TRANSITION_CONTRACT: WriteTargetContract = {
  noun: 'document',
  owner: 'transition',
  records: 'A state-transition commit records the status change and nothing else',
};

function requireUnmodifiedDocument(root: string, prepared: PreparedMemoryTransition): CoreResult<undefined> {
  return requireUnmodifiedTarget(root, prepared.path, TRANSITION_CONTRACT, prepared.content);
}

/**
 * Verify what the new commit **contains**, by diffing it against its own parent (task-088, AC3).
 *
 * This is the half that makes the guard above checkable rather than hopeful. Reading the file on disk
 * answers "does the document now say `approved`?" — true no matter what else rode along; `HEAD~1..HEAD`
 * is not. Same shape as `task-080`'s lockfile guard: assert the diff, not the end state. The parent is
 * `<sha>^`, or git's empty tree for a root commit, so the check is total rather than conditional.
 *
 * It is an **alarm, not a rollback**: it can only run once the commit exists, and rewriting history
 * behind the user's back is a worse failure than reporting one (`dl-035` points the same way). With
 * {@link requireUnmodifiedDocument} in place it should be unreachable, which is the point.
 */
export function verifyCommittedScope(
  root: string,
  sha: string,
  path: string,
  expected: Readonly<Record<string, string | undefined>>,
  scope: DocumentScope,
): string[] {
  // The "did anything else ride in" half is shared with `verifyCommittedPaths` (task-092), so the
  // Memory and configuration post-conditions cannot disagree about what a commit's scope is.
  const { parent, problems } = undeclaredCommittedPaths(root, sha, [path]);

  const after = readPathAtRev(root, sha, path);
  if (after === null) return [...problems, `it does not contain '${path}'`];
  return [...problems, ...verifyDocumentEdit(readPathAtRev(root, parent, path) ?? '', after, expected, scope)];
}

/**
 * The pre-write half of {@link commitMemoryTransition} — its checks 1 to 3 (confinement, an
 * unmodified working tree under `declared-fields-only` or no divergent stage under
 * `carries-content`, and the rendering's post-condition), with nothing written. A command that makes
 * more than one commit runs it on every document first, so a refusal of any of them leaves the
 * repository as it was (the `supersedes:` trigger, task-162). {@link commitMemoryTransition} runs it
 * again before its own write, so calling it first is never required for safety.
 */
export function checkMemoryTransition(
  root: string,
  prepared: PreparedMemoryTransition,
  content: string,
  expected: Readonly<Record<string, string | undefined>> = {},
  scope: DocumentScope = 'declared-fields-only',
): CoreResult<undefined> {
  const owned = { status: prepared.to, ...expected };
  const confined = requireConfinedWriteTarget(root, prepared.path, 'write');
  if (!confined.ok) return confined;
  const unmodified =
    scope === 'declared-fields-only'
      ? requireUnmodifiedDocument(root, prepared)
      : requireNoDivergentStage(root, prepared.path, TRANSITION_CONTRACT);
  if (!unmodified.ok) return unmodified;

  const problems = verifyDocumentEdit(prepared.content, content, owned, 'declared-fields-only');
  if (problems.length > 0) {
    return coreErr({
      code: 'VALIDATION',
      message: `refusing to write ${prepared.path}: the rendered document failed its post-condition: ${problems.join('; ')}`,
    });
  }
  return coreOk(undefined);
}

/**
 * Write `content` over the prepared document and commit exactly that one path with `message`,
 * returning the new commit's sha (`commitPaths`, task-018; scoped to that path even when other changes
 * are staged, bug-027). The commit's author is pinned to `prepared.identity` — the identity the
 * pre-flight checked, and the one any `Approver:` line names — so git's own author resolution cannot
 * substitute another (task-132, `bug-149`). `prepared` comes from {@link beginMemoryTransition}, which
 * is how the git-identity pre-flight (REQ-SEC-01) is guaranteed to have run; callers run every other
 * refusal check first, and this step is the only write.
 *
 * Four checks bound what reaches the repository, in this order — they are not redundant, they catch
 * different defects:
 *
 * 1. **The document is the project's to write** ({@link requireConfinedWriteTarget}, REQ-SEC-06) —
 *    catches a wrong *place*, in the two shapes a write can meet it. A type directory that is a
 *    symlink out of the project puts the document outside the root (`bug-117`), where `writeDocument`
 *    rewrites a file the repository does not own and `git add` then fails with its own text; and a
 *    **document** that is itself a symlink does the same with no symlinked directory anywhere,
 *    because `writeFileSync` follows the link that `unlinkSync` would merely remove (`bug-120` D2,
 *    measured on all four verbs). `bug-117` reports the first for `memory add`, whose target is
 *    resolved by `resolveConfinedMemoryPath`; these four verbs never ask that resolver anything —
 *    they locate an existing document — so both questions are asked here, about the path they are
 *    about to write. It runs **first**, and for every `scope`: the question "is this file ours at
 *    all" precedes every question about its content, and check 2 cannot stand in for it (`git status
 *    --porcelain` reports a path beyond a symbolic link as clean, which is `bug-118`).
 * 2. **The working tree is unmodified** ({@link requireUnmodifiedDocument}, `declared-fields-only`
 *    only) — catches a wrong *baseline*: content that was already on disk before the verb ran
 *    (`bug-076`). Under `carries-content` the working tree IS the content, so the check narrows to
 *    `requireNoDivergentStage`: a staged version differing from both `HEAD` and the working tree,
 *    which `git add` would silently discard, is refused (task-131, `bug-182`). Both shapes first
 *    refuse a document behind a symlinked directory, which git cannot report on (`bug-118`).
 * 3. **The rendering is in scope** ({@link verifyDocumentEdit} against the prepared document) —
 *    catches a defect in the *editor*: `status` must be the prepared target, every field in `expected`
 *    must have its value (`undefined` = absent), and no other field and no byte of the body may have
 *    moved (the `bug-041` class). Runs under `declared-fields-only` for **every** verb, `submit`
 *    included: `renderSubmitDocument` owns `status` and `rejection_reason` alone, and the content
 *    `submit` carries is already in the prepared document it is compared against.
 * 4. **The commit contains only the declared change** ({@link verifyCommittedScope} against
 *    `HEAD~1`) — the post-condition proper, and the only one that measures the artefact of record.
 *
 * Checks 1–3 report a `VALIDATION` error (exit 1) with nothing written or committed. Check 4 can
 * only report; see {@link verifyCommittedScope}.
 *
 * Check 1 resolves on the **working tree**, not at `HEAD`: it is the filesystem-effect read
 * `command-baseline` and `spec-006-core-domain-api` §6 declare, ratified in
 * `dl-086-a-guard-over-a-filesystem-effect-resolves-on-the-filesystem` from `task-102`'s argument,
 * which is cited rather than re-made: it predicts where `writeDocument` will land, and that follows
 * the symlinks on disk rather than the ones a commit records.
 *
 * @param scope - How much of the document this operation owns; defaults to the strict
 *   `declared-fields-only`, so a new verb is guarded unless it opts out deliberately.
 */
export function commitMemoryTransition(
  root: string,
  prepared: BegunMemoryTransition,
  content: string,
  message: string,
  expected: Readonly<Record<string, string | undefined>> = {},
  scope: DocumentScope = 'declared-fields-only',
): CoreResult<string> {
  const checked = checkMemoryTransition(root, prepared, content, expected, scope);
  if (!checked.ok) return checked;
  const owned = { status: prepared.to, ...expected };
  writeDocument(join(root, prepared.path), content);
  const sha = commitPaths(root, [prepared.path], message, { author: prepared.identity });

  const leaked = verifyCommittedScope(root, sha, prepared.path, owned, scope);
  if (leaked.length > 0) {
    return coreErr({
      code: 'VALIDATION',
      message: `commit ${sha} carries more than the change it declares: ${leaked.join('; ')}`,
    });
  }
  return coreOk(sha);
}
