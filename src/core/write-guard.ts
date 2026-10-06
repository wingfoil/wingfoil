/**
 * The write-side half of `dl-080-which-baseline-each-command-reads`, ratified as option **(B)**:
 * *a write refuses while its target carries modifications the command does not own*
 * (task-092-writes-refuse-a-dirty-target, `bug-078`).
 *
 * `task-088` landed that rule for the four gated Memory transition verbs, where the target is a
 * Memory document and "what the verb owns" is a named set of frontmatter fields. `commitPaths` has
 * six other callers — `dna set`, `directive create`, `directive assign`, `directive remove`,
 * `wingfoil init`'s scaffold and `memory add` — whose targets are ordinary config files and brand-new
 * documents, so the same rule needs two shapes rather than one:
 *
 * - {@link requireUnmodifiedTarget} — for a target the command **edits in place**. It must be
 *   identical in `HEAD`, in the index and in the working tree; anything else is a modification the
 *   command did not make and must not commit.
 * - {@link requireAbsentTarget} — for a target the command **creates**. "Unmodified" is the wrong
 *   question there: the path is supposed to be new, so the rule is that nothing may already occupy
 *   it, in `HEAD`, in the index or in the working tree.
 *
 * Both are composed from the same primitives `task-088` introduced for the transition verbs —
 * `pathPorcelainStatus`, `readPathAtRev`, `commitParent`, `changedPathsBetween` (`../storage`) and
 * `describeDocumentChanges` (`../memory`) — and `requireUnmodifiedDocument` in `./memory-transition.ts`
 * is itself re-expressed as a call into {@link requireUnmodifiedTarget}, so there is **one** gate in
 * the codebase rather than two that can drift. What varies per call site is only the wording of the
 * refusal, carried in a {@link WriteTargetContract}.
 *
 * **Why git's own answer decides "is it modified".** `pathPorcelainStatus` runs `git status
 * --porcelain -- <path>`: git owns index refresh, `core.autocrlf` and `.gitattributes` filters, and
 * an answer re-derived from bytes would disagree with `git status` on exactly the machines where
 * that matters.
 *
 * **Why the guard is per-path and never per-tree.** `commitPaths` commits with
 * `git commit --only -- <paths>` (`bug-027`), so an unrelated dirty file cannot ride into the commit
 * in the first place. Refusing on one would be `dl-080`'s option (D), which its ratification
 * rejected: "an unrelated uncommitted edit blocks a verb, so designing a new type in `memory.yaml`
 * would prevent approving an element that has nothing to do with it".
 *
 * **What git cannot see, the guard refuses** (task-131, `bug-118`). `git status --porcelain` prints
 * nothing for a path that lies beyond a symbolic link — `git ls-files` carries the link blob and never
 * what it points at — so "no output" there means *invisible*, not *clean*. Every guard here therefore
 * asks {@link requireInspectableTarget} first, on the filesystem (`dl-086`: a guard over an imminent
 * syscall resolves where the syscall will land), and refuses a target git cannot report on, whether
 * the link points inside the project (`bug-124`) or out of it.
 *
 * **Exit code.** Every refusal here is a `CoreResult.error` with `code: 'VALIDATION'`, which
 * `exitCodeForError` maps to **1**. `spec-005-cli-command-contract` § "1. Exit-code contract
 * (REQ-INT-04)" reserves `2` for a malformed *invocation*; a dirty target is a repository-state
 * precondition, and re-typing the command cannot help. That is the ruling recorded on `bug-076`.
 */
import { existsSync, lstatSync } from 'node:fs';
import { join } from 'node:path';

import { describeDocumentChanges } from '../memory';
import {
  changedPathsBetween,
  commitParent,
  committedBlobMatches,
  pathPorcelainStatus,
  readDocument,
  readPathAtRev,
  splitFrontmatter,
} from '../storage';

import { coreErr, coreOk, type CoreResult } from './types';

/** How a refusal names the operation whose commit a dirty target would otherwise enlarge. */
export interface WriteTargetContract {
  /** What the file is called in the message — `'document'` for Memory, `'file'` for configuration. */
  readonly noun: string;
  /** Fills "modifications this `<owner>` does not own" — e.g. `'transition'`, `'operation'`. */
  readonly owner: string;
  /** One clause saying what this kind of commit records, without a trailing separator. */
  readonly records: string;
}

/** The contract every non-transition write verb refuses under (`dna set`, the `directive` verbs, `init`). */
export const CONFIG_WRITE_CONTRACT: WriteTargetContract = {
  noun: 'file',
  owner: 'operation',
  records: 'A `wf(...)` commit records the change its subject declares and nothing else',
};

/**
 * Name, in a form a person can act on, how `after` differs from `before` at `HEAD`.
 *
 * Delegates to {@link describeDocumentChanges} — which reports the frontmatter fields that moved and
 * whether the body moved — but only for a file that actually HAS a frontmatter block. `dna.yaml` and
 * `roles.yaml` have none (`splitFrontmatter` returns `{frontmatter: null}` and puts the whole file in
 * `body`), and reporting "the body" for a YAML configuration file reads wrong; those get the honest
 * `'the file content'` instead. Directive documents DO carry frontmatter, so they keep the
 * field-level detail.
 */
function describeTargetChanges(before: string | null, after: string, noun: string): string[] {
  if (before === null) return [`the ${noun} is not tracked at HEAD`];
  if (before === after) return [];
  if (splitFrontmatter(before).frontmatter === null && splitFrontmatter(after).frontmatter === null) {
    return [`the ${noun} content`];
  }
  return describeDocumentChanges(before, after);
}

/** The working-tree text of `path`, or `null` when it is absent from the working tree. */
function readWorktree(root: string, path: string): string | null {
  const absolute = join(root, path);
  return existsSync(absolute) ? readDocument(absolute) : null;
}

/**
 * Why git cannot report on `path`, or `null` when it can: the first proper ancestor of `path` — a
 * directory on the way to it, never `path` itself — that is a symbolic link, or that the filesystem
 * refuses to `lstat` (a directory without search permission). Stops at the first missing segment: a
 * path whose parent does not exist yet is not beyond anything (the creating verbs `mkdir` it).
 *
 * The leaf is deliberately excluded. A target that is ITSELF a symlink is one git does track (as a
 * mode-120000 blob) and reports on, which is what keeps `directive remove` of a symlinked directive
 * file working (`bug-044`'s benign case); whether a *write* may follow such a leaf is the confinement
 * module's question (`requireConfinedWriteTarget`, `bug-120`), not this guard's.
 */
function uninspectableAncestor(root: string, path: string): string | null {
  const segments = path.split('/').filter((segment) => segment.length > 0);
  for (let end = 1; end < segments.length; end += 1) {
    const ancestor = segments.slice(0, end).join('/');
    try {
      if (lstatSync(join(root, ancestor)).isSymbolicLink()) return `'${ancestor}' is a symbolic link`;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' || code === 'ENOTDIR') return null;
      return `'${ancestor}' cannot be read (${String(code)})`;
    }
  }
  return null;
}

/**
 * Refuse, before anything is written, a target git **cannot report on** because a directory on the
 * way to it is a symbolic link (task-131, `bug-118`, `bug-124`) — or cannot be read at all.
 *
 * For a path behind a symlink `git status --porcelain` is empty whether the file is modified or not,
 * and the `git add` that `commitPaths` runs afterwards fails ("beyond a symbolic link") — after the
 * write or the unlink has already happened. "I have nothing to report about this path" is not "this
 * path is clean"; this is the check that keeps the two apart, so the guards below never read silence
 * as consent. Exit `1` (`VALIDATION`), naming the path and the reason.
 */
export function requireInspectableTarget(
  root: string,
  path: string,
  contract: WriteTargetContract = CONFIG_WRITE_CONTRACT,
): CoreResult<undefined> {
  const reason = uninspectableAncestor(root, path);
  if (reason === null) return coreOk(undefined);
  return coreErr({
    code: 'VALIDATION',
    message:
      `refusing to commit ${path}: ${reason}, and git cannot stage or inspect a path beyond a symbolic link or an ` +
      `unreadable directory, so whether this ${contract.noun} carries modifications this ${contract.owner} does not ` +
      'own cannot be inspected. Nothing has been written; replace a symbolic link with the directory it points ' +
      'to, then retry.',
  });
}

/**
 * Refuse, before anything is written, a target whose **index** holds a version that differs from both
 * `HEAD` and the working tree (task-131, `bug-182`) — the one loss a content-carrying verb can still
 * cause.
 *
 * `memory submit` and `memory amend` own the whole document: its working-tree bytes are the content of
 * record, so {@link requireUnmodifiedTarget} cannot apply to them. But `commitPaths` runs
 * `git add -- <path>` before committing, and that silently overwrites a staged version the user
 * prepared separately. When the staged version equals `HEAD` (nothing staged) or the working tree
 * (the user staged what is about to be committed) nothing is lost and the verb proceeds; only the
 * three-way divergence — git's own `XY` with both columns set — is refused. The answer is git's
 * (`pathPorcelainStatus`), for the reason the module header gives. Also asks
 * {@link requireInspectableTarget} first, since an empty porcelain is not an answer behind a symlink.
 *
 * @param path - Root-relative POSIX path of the document the verb is about to commit.
 */
export function requireNoDivergentStage(
  root: string,
  path: string,
  contract: WriteTargetContract = CONFIG_WRITE_CONTRACT,
): CoreResult<undefined> {
  const inspectable = requireInspectableTarget(root, path, contract);
  if (!inspectable.ok) return inspectable;

  // Porcelain `XY`: X is index vs HEAD, Y is working tree vs index. Both set (and X not the
  // untracked/ignored marker) is the three-way divergence; '' (clean) has neither.
  const porcelain = pathPorcelainStatus(root, path);
  if (' ?!'.includes(porcelain.charAt(0)) || porcelain.charAt(1) === ' ') return coreOk(undefined);
  return coreErr({
    code: 'VALIDATION',
    message:
      `refusing to commit ${path}: the index holds a staged version that differs from both HEAD and the working ` +
      `tree [git status '${porcelain}']. This ${contract.owner} commits the working-tree ${contract.noun}, so staging ` +
      `it would silently discard the staged version; run 'git restore --staged -- ${path}' to drop it, or ` +
      `'git add -- ${path}' to keep the working tree, then retry.`,
  });
}

/**
 * Refuse, before anything is written, a target that already carries modifications this operation
 * does not own — `dl-080`'s ratified write rule for a command that **edits a file in place**.
 *
 * Both of the user's declarations are inspected, the index (`:0`) and the working tree, because they
 * can disagree and `commitPaths`'s `git add -- <path>` would silently replace the former with the
 * latter. The refusal names the `git status` code and what is different, so the user can act on it
 * without re-deriving it.
 *
 * **Why refusing rather than committing only the operation's own hunk.** Settled by `task-088` and
 * ratified by `dl-080`, not re-argued here: partial staging is undefined before it is difficult
 * (there are two candidate baselines on disk and "only my hunk" does not say onto which), and the
 * edits it would leave behind are invisible, deferred, and swept into whatever commits next. A
 * refusal costs two commands, now, on a file this function has provably not touched.
 *
 * @param worktree - The working-tree text when the caller has already read it (the transition verbs
 *   have); omitted, it is read here.
 */
export function requireUnmodifiedTarget(
  root: string,
  path: string,
  contract: WriteTargetContract = CONFIG_WRITE_CONTRACT,
  worktree?: string,
): CoreResult<undefined> {
  const inspectable = requireInspectableTarget(root, path, contract);
  if (!inspectable.ok) return inspectable;
  // Empty porcelain means clean only for a path git can see — guaranteed by the check above.
  const porcelain = pathPorcelainStatus(root, path);
  if (porcelain === '') return coreOk(undefined);

  const atHead = readPathAtRev(root, 'HEAD', path);
  const named = new Set<string>();
  const candidates: readonly (readonly [string | null, string])[] = [
    [readPathAtRev(root, ':0', path), `the ${contract.noun} is not in the index`],
    [worktree ?? readWorktree(root, path), `the ${contract.noun} is not in the working tree`],
  ];
  for (const [candidate, absent] of candidates) {
    if (candidate === null) {
      named.add(absent);
      continue;
    }
    for (const change of describeTargetChanges(atHead, candidate, contract.noun)) named.add(change);
  }
  return coreErr({
    code: 'VALIDATION',
    message:
      `refusing to commit ${path}: it carries uncommitted modifications this ${contract.owner} does not own ` +
      `[git status '${porcelain}'] — ${[...named].sort().join(', ')}. ${contract.records}; commit or stash ` +
      'these changes first, then retry.',
  });
}

/** {@link requireUnmodifiedTarget} over several targets, refusing on the first one that is dirty. */
export function requireUnmodifiedTargets(
  root: string,
  paths: readonly string[],
  contract: WriteTargetContract = CONFIG_WRITE_CONTRACT,
): CoreResult<undefined> {
  for (const path of paths) {
    const clean = requireUnmodifiedTarget(root, path, contract);
    if (!clean.ok) return clean;
  }
  return coreOk(undefined);
}

/**
 * Refuse, before anything is written, a target that is supposed to be **new** but is already
 * occupied — `dl-080`'s write rule in the shape a *creating* command needs (`memory add`).
 *
 * "Unmodified" is the wrong question for a command whose contract is to register a new element: the
 * path is normally absent, so the modification it does not own is any pre-existing content at all.
 * `pathPorcelainStatus` cannot answer this on its own — it reports the empty string both for an
 * absent path and for a clean, tracked one — so each of the three places a file can live is checked
 * explicitly.
 *
 * Reachable because an id can land on an occupied path. A slug-only `id_pattern` (`note-{slug}`)
 * does whenever a title repeats. A `{n}` id does when the occupant is a **git-ignored** file: since
 * task-128 `nextSequenceNumber` takes the highest number every ref and the working tree hold, but
 * the working tree as git sees it, so an ignored file reserves no number. (Before task-128 it counted
 * the working tree's files, so a gap reissued a taken number, `bug-087`.) The guard refuses; it never
 * overwrites. The write that follows is unconditional, and the
 * commit's diff would then be `HEAD` → scaffold rather than absent → scaffold. A commit whose subject
 * says "add" and whose diff removes lines is `bug-078` at its sharpest.
 *
 * @param path - Root-relative POSIX path of the file about to be created.
 */
export function requireAbsentTarget(root: string, path: string): CoreResult<undefined> {
  // Beyond a symlink, `HEAD` and the index report nothing and `git add` refuses after the write
  // (task-131, the `bug-124` order in `memory add`'s shape).
  const inspectable = requireInspectableTarget(root, path);
  if (!inspectable.ok) return inspectable;
  const occupied: string[] = [];
  if (readPathAtRev(root, 'HEAD', path) !== null) occupied.push('at HEAD');
  if (readPathAtRev(root, ':0', path) !== null) occupied.push('in the index');
  if (existsSync(join(root, path))) occupied.push('in the working tree');
  if (occupied.length === 0) return coreOk(undefined);

  return coreErr({
    code: 'VALIDATION',
    message:
      `refusing to create ${path}: something already exists there (${occupied.join(', ')}). This operation ` +
      'registers a NEW element, so writing over an existing file would produce a commit carrying changes its ' +
      'subject does not declare; move or commit what is there first, or choose a different title.',
  });
}

/**
 * The paths a commit changed against its own parent that are **not** among `declared`, with the
 * parent it was compared against. The parent is `<sha>^`, or git's empty tree for a root commit, so
 * the comparison is total rather than conditional.
 *
 * Extracted so `verifyCommittedScope` (the Memory transition post-condition, `./memory-transition.ts`)
 * and {@link verifyCommittedPaths} (its content-agnostic sibling, below) share one answer to "did
 * anything else ride in".
 */
export function undeclaredCommittedPaths(
  root: string,
  sha: string,
  declared: readonly string[],
): { parent: string; problems: string[] } {
  const parent = commitParent(root, sha);
  const problems = changedPathsBetween(root, parent, sha)
    .filter((changed) => !declared.includes(changed))
    .map((changed) => `it also contains '${changed}'`);
  return { parent, problems };
}

/**
 * Verify what a commit **contains**, by diffing it against its own parent — the content-agnostic
 * sibling of `verifyCommittedScope` (`./memory-transition.ts`), for targets that carry no declared
 * frontmatter fields.
 *
 * `verifyCommittedScope` delegates its content half to `verifyDocumentEdit`, which compares *owned
 * frontmatter fields* and a body. `dna.yaml` and `roles.yaml` have no frontmatter block at all, so
 * for them the right — and strictly stronger — question is content equality: the commit must carry, for
 * each declared path, exactly the text this operation wrote, and nothing else. "Exactly" is judged as
 * git stores it: when the bytes differ from `git show`'s, the written text is hashed through git's
 * filters for that path and compared with the committed blob (`committedBlobMatches`), so a CRLF file
 * that `core.autocrlf=true` stores LF is not reported as a foreign change (task-193 review).
 *
 * Same shape as `task-080`'s lockfile guard and `task-088`'s post-condition: assert the diff, not the
 * end state. Reading the file back from disk answers "does `dna.yaml` now say `Renamed`?" — true no
 * matter what else rode along.
 *
 * It is an **alarm, not a rollback**: it can only run once the commit exists, and rewriting history
 * behind the user's back is a worse failure than reporting one (`dl-035` points the same way). With
 * {@link requireUnmodifiedTarget} in place no argument to a verb can reach it; a repository-local
 * `pre-commit` hook that rewrites and re-stages the file still can, which is precisely what it is for.
 *
 * @param expected - Each root-relative path the commit must carry, mapped to the exact content it
 *   must have there, or `null` when the commit must have **removed** it. Iterated in insertion order
 *   (REQ-SYS-07: a caller's fixed order produces a fixed problem order).
 * @returns The problems found, empty when the commit carries exactly the declared change.
 */
export function verifyCommittedPaths(
  root: string,
  sha: string,
  expected: ReadonlyMap<string, string | null>,
): string[] {
  const { problems } = undeclaredCommittedPaths(root, sha, [...expected.keys()]);
  for (const [path, content] of expected) {
    const after = readPathAtRev(root, sha, path);
    if (content === null) {
      if (after !== null) problems.push(`it still contains '${path}', which this operation removed`);
    } else if (after === null) {
      problems.push(`it does not contain '${path}'`);
    } else if (after !== content && !committedBlobMatches(root, sha, path, content)) {
      // A byte difference alone is not a foreign change: git may have stored the written text through
      // its filters (`core.autocrlf=true` keeps a CRLF file LF in the blob, task-193 review). Only a
      // blob that the written bytes do not hash to, under those same filters, is one.
      problems.push(`'${path}' at the commit differs from what this operation wrote`);
    }
  }
  return problems;
}

/**
 * {@link verifyCommittedPaths} for the common single-path case, rendered as the `CoreResult.error`
 * every caller returns — `undefined` when the commit is exactly what was declared.
 *
 * @param content - The text the operation wrote, or `null` when it removed the path.
 */
export function committedScopeError(
  root: string,
  sha: string,
  path: string,
  content: string | null,
): CoreResult<never> | undefined {
  const leaked = verifyCommittedPaths(root, sha, new Map([[path, content]]));
  if (leaked.length === 0) return undefined;
  return coreErr({
    code: 'VALIDATION',
    message: `commit ${sha} carries more than the change it declares: ${leaked.join('; ')}`,
  });
}
