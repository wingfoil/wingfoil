/**
 * `wingfoil verify` — the governance check over a commit range (task-365, `spec-020`, `dl-222` (a), `dl-212` D1).
 *
 * The generic subject, bracket, body, authority, state and trailer rules of the governance check, as one rule module
 * split in two (`spec-020` §4.13):
 *
 * - **A history reader** ({@link HistoryReader}, built over a repository by {@link createGitHistoryReader}) — the only
 *   part that calls git. It reads the range's commits, their touched paths and renames and the committed blobs §4.1
 *   names, batched, and keeps behind it the reads that are git walks by nature: the consistency walk
 *   (`verifyTransitionConsistency`), the frontmatter walk (`reconstructMemoryTransitions`) and the `sync` citation.
 * - **The checks** — {@link checkSubject} … {@link checkTrailerParagraph}, one exported function per check of §4, each
 *   of one commit, a {@link HistoryReader} and a {@link CheckContext}, with no git call or file read of its own, so a
 *   test drives them with an in-memory reader.
 *
 * {@link governanceCheck} assembles §7's report from the two; the operation in `CORE_MODULES` adds the revision
 * refusals of §8.2 and the starting-mode warning of §5.1. Every predicate and message is the one
 * `scripts/check-governance.cjs` wrote when `spec-020` was approved, so this repository's history reads the same through
 * either (§9 T-30), with the spec's departures: `memory.yaml` is read at the first parent (§4.1, OQ-3), the starting
 * mode is the invocation's (§5.1), and every finding carries `check`.
 *
 * Deterministic (REQ-SYS-07, §3): no clock, no randomness; commits in `git log --reverse` order, findings sorted by
 * commit, category and message, documents walked in sorted path order, every `git log` with `--no-show-signature`.
 */
import { basename } from 'path';

import type { DnaYaml as DnaYamlValue } from '../dna/schema';
import { DnaYaml } from '../dna/schema';
import {
  CONFIGURATION_SCOPES,
  computeMemoryContentRoots,
  DEPRECATED_STATE,
  describeCommittedSubmitContent,
  isCarriesItem,
  isMachineEdge,
  linesOutsideReasonBlock,
  loadMemoryDocumentsAtRev,
  MEMORY_OPERATIONS,
  type MemoryTransition,
  MemoryYaml,
  orderCarriesItems,
  parseApprovalMetadata,
  parseBracketHops,
  parseCarriesContent,
  parseCommitReason,
  parseMemoryOperation,
  reasonRefusalMessage,
  reconstructMemoryTransitions,
  resolveStateMachine,
  SUPERSEDED_STATE,
  supersedesEdgeFrom,
  transitionConsistencyFindings,
  type TransitionFinding,
} from '../memory';
import type { MemoryYaml as MemoryYamlValue, StateMachine } from '../memory/schema';
import { AGENT_TRAILER_LINE_RE, APPROVER_LINE_RE, readBlobs, readRevisionPaths, requireCommitName, runGitRead, splitFrontmatter } from '../storage';
import { isNewerFormatError, MEMORY_TEMPLATE_FORMAT, newerFormatIssue, parseYaml, ValidationError } from '../validation';

import { APPROVER_ROLE, hasApproverRole } from './approval-authority';
import { resolveRevision } from './revision';

// --- Types ---------------------------------------------------------------------------------------------------------

/** One commit of the range, as the checks read it (`spec-020` §4.13). */
export interface HistoryCommit {
  /** The commit's full sha. */
  readonly sha: string;
  /** Its parents' full shas, first parent first; empty for a root commit, two or more for a merge. */
  readonly parents: readonly string[];
  readonly authorName: string;
  readonly authorEmail: string;
  readonly subject: string;
  /** The body (`%b`), its trailing whitespace trimmed. */
  readonly body: string;
}

/** A configuration blob read and validated against its schema only: the value, or the first issue's message. */
export type ConfigRead<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: string };

/** One file change of a non-merge commit, renames followed: `from` `null` for an addition, `to` `null` for a deletion. */
export interface FileChange {
  readonly from: string | null;
  readonly to: string | null;
}

/**
 * What the checks ask of a repository's history (`spec-020` §4.13). The only implementation that calls git is
 * {@link createGitHistoryReader}; a test answers the same questions from a model of the history.
 */
export interface HistoryReader {
  /** The full sha of `HEAD`. */
  readonly head: string;
  /** The range's commits, oldest first (`git log --reverse` order). */
  commits(): readonly HistoryCommit[];
  /** The paths `sha` touches, a rename as two paths (`--no-renames --name-only`); none for a merge. */
  touchedPaths(sha: string): readonly string[];
  /** The file changes of the non-merge commit `sha`, renames followed (`-M`); none for a merge. */
  fileChanges(sha: string): readonly FileChange[];
  /** Where a path some commit of the range wrote ended up at `HEAD`, renames inside the range followed forward. */
  pathAtHead(path: string): string;
  /** Whether `HEAD` holds `path`. */
  existsAtHead(path: string): boolean;
  /** The text of `<rev>:<path>`, or `null` when the revision or the path is absent. */
  blob(rev: string, path: string): string | null;
  /** `.wingfoil/memory.yaml` at `rev`, schema only and silent (§4.1); `null` for a `null` revision or an absent file. */
  memoryYamlAt(rev: string | null): ConfigRead<MemoryYamlValue> | null;
  /** `.wingfoil/dna.yaml` at `rev`, the same way. */
  dnaYamlAt(rev: string | null): ConfigRead<DnaYamlValue> | null;
  /**
   * The consistency walk of the document at `path` (at `HEAD`) under `machine` (`verifyTransitionConsistency`).
   *
   * @throws `ValidationError` when a revision's frontmatter does not parse or is written in a newer format.
   */
  transitionFindings(path: string, machine?: StateMachine): readonly TransitionFinding[];
  /**
   * The frontmatter walk of the document at `path` (`reconstructMemoryTransitions`, strict).
   *
   * @throws `ValidationError` on the same revisions as {@link HistoryReader.transitionFindings}.
   */
  transitions(path: string): readonly MemoryTransition[];
  /** Whether `token`, a hex token of a body, names a commit whose subject reads as a `reject` (§4.6 row 5). */
  isRejectCommit(token: string): boolean;
  /** The `status:` of the document whose `id` is `id` at `HEAD`: `null` without one, `undefined` when no document has the id. */
  headDocumentStatus(id: string): string | null | undefined;
  /**
   * Whether a proper ancestor of `sha` carries a body line starting exactly `Carries content: ` outside its `Reason:`
   * block (`spec-020` §4.14, `task-378`): from then on a submit that carries content and declares none is a finding.
   */
  carriesLineBefore(sha: string): boolean;
}

/** What a check knows of the commit beyond the history: whether it is gated under the starting mode (§5.1). */
export interface CheckContext {
  readonly gated: boolean;
}

/** A finding's category (`spec-020` §0), in the order findings are sorted within a commit (§3). */
export type GovernanceRule = 'subject' | 'bracket' | 'body' | 'authority' | 'state';

/** One finding of one check on one commit, before the report names the commit. */
export interface CheckFinding {
  readonly rule: GovernanceRule;
  readonly check: string;
  readonly message: string;
}

/** What one check found on one commit: its findings, and what it could not judge (the `stateUnchecked` reasons). */
export interface CheckOutcome {
  readonly findings: readonly CheckFinding[];
  readonly stateUnchecked: readonly string[];
}

/** One check of a commit, as every exported check is shaped. */
export type GovernanceCheckFn = (commit: HistoryCommit, reader: HistoryReader, context: CheckContext) => CheckOutcome;

/** One entry of the report's `checks` list (`spec-020` §7). */
export interface GovernanceCheckEntry {
  readonly check: string;
  readonly rule: GovernanceRule;
  readonly since: string;
}

/** One finding of the report (`spec-020` §7), keys in this order. */
export interface GovernanceFinding {
  readonly sha: string;
  readonly subject: string;
  readonly rule: GovernanceRule;
  readonly check: string;
  readonly message: string;
  readonly gated: boolean;
}

/** One commit a check could not judge, with why (`spec-020` §4.5). */
export interface StateUncheckedEntry {
  readonly sha: string;
  readonly subject: string;
  readonly reason: string;
}

/** The report of `wingfoil verify` (`spec-020` §7), keys in this order. */
export interface GovernanceReport {
  readonly head: string;
  readonly base: string | null;
  readonly introducedAt: string | null;
  readonly checks: readonly GovernanceCheckEntry[];
  readonly commits: { readonly range: number; readonly memory: number; readonly other: number; readonly gated: number };
  readonly findings: readonly GovernanceFinding[];
  readonly stateUnchecked: readonly StateUncheckedEntry[];
  readonly verdict: 'pass' | 'fail';
}

// --- Constants -----------------------------------------------------------------------------------------------------

/** The version that first ships every check of `spec-020` §4 (§5.3). */
const SINCE = '0.4.0';

/**
 * The checks the build ships, in `spec-020` §4's order, each with its category and `since` (§7's `checks` list).
 * `workflow-record-authority` is listed under its first category, `body`; its findings carry `body` or `authority`.
 */
export const GOVERNANCE_CHECKS: readonly GovernanceCheckEntry[] = Object.freeze(
  (
    [
      ['subject', 'subject'],
      ['bracket', 'bracket'],
      ['body', 'body'],
      ['authority', 'authority'],
      ['state', 'state'],
      ['verb-edge', 'state'],
      ['status-outside-wf', 'state'],
      ['supersedes-pair', 'state'],
      ['approval-agent-trailer', 'body'],
      ['workflow-record-authority', 'body'],
      ['trailer-paragraph', 'body'],
      ['carries-content', 'body'],
    ] as const
  ).map(([check, rule]) => Object.freeze({ check, rule, since: SINCE })),
);

/** The warning of a whole-history run (`spec-020` §5.1, §8.2): its code included, without the `warning: ` prefix. */
export const VERIFY_WHOLE_HISTORY =
  'W_VERIFY_WHOLE_HISTORY: no --base and no --introduced-at, so every commit reachable from HEAD is judged and gated; pass --base <rev> to judge a range, or --introduced-at <rev> to report older history without failing';

const MEMORY_YAML_PATH = '.wingfoil/memory.yaml';
const DNA_YAML_PATH = '.wingfoil/dna.yaml';

/** The categories in the order findings are sorted within a commit (§3). */
const RULES: readonly GovernanceRule[] = ['subject', 'bracket', 'body', 'authority', 'state'];

/** The subject's `wf({scope}): {verb}` head, read as `src/memory/audit.ts`'s own reader reads it. */
const WF_HEAD_RE = /^wf\(([^)]*)\):\s*(\S+)/;
/** The canonical bracket: U+2192 arrows with single spaces, closing the subject. */
const CANONICAL_BRACKET_RE = / \[([^\s[\]]+(?: → [^\s[\]]+)+)\]$/;
/** Any bracket in the subject, written or not as a transition. */
const ANY_BRACKET_RE = /[[\]]/;
/** The id list after the verb: ids separated by `, `. */
const ID_LIST_RE = /^[^\s,[\]]+(?:, [^\s,[\]]+)*$/;
/** The ids of a canonical `assign` subject. */
const ASSIGN_IDS_RE = / to (.+)$/;
/** A `Reason:` key line, any letter case. */
const REASON_KEY_RE = /^reason:/i;
/** The subject of a record written outside the `wf()` grammar by `workflow finalize|adopt|rekey` (`spec-017`). */
const WORKFLOW_RECORD_RE = /^workflow: (?:finalize|adopt|rekey)(?: |$)/;
/** A `WingFoil-*` trailer key at the start of a line (`git-conventions` §8). */
const WINGFOIL_TRAILER_RE = /^(wingfoil-[a-z0-9-]+):/i;
/** A token of a body that may be a commit sha. */
const SHA_TOKEN_RE = /\b[0-9a-f]{7,64}\b/g;

/** The verbs that record an approval, and therefore need `Approver:` and authority. */
const APPROVAL_VERBS: ReadonlySet<string> = new Set(['approve', 'reject', 'amend']);
/** The verbs whose subject carries no bracket (`spec-008` §2). */
const BRACKETLESS_VERBS: ReadonlySet<string> = new Set(['add', 'submit', 'assign']);
/** The verbs that record a reason but no approval: `park`. */
const REASON_VERBS: ReadonlySet<string> = new Set(['park']);
/** The verbs whose single hop `verb-edge` pairs with a kind of edge (`spec-008` §2). */
const PAIRED_VERBS: ReadonlySet<string> = new Set(['approve', 'start', 'finalize', 'reject']);
/** The verb whose fixed bracket the bracket rule pins, so the machine does not judge its hop. */
const EDGE_EXEMPT_VERB = 'amend';

const NO_NAMED_DOCUMENT = 'no document it touches is named by its subject';

// --- Shared reading of one commit ----------------------------------------------------------------------------------

const isMerge = (commit: HistoryCommit): boolean => commit.parents.length > 1;
const firstParent = (commit: HistoryCommit): string | null => commit.parents[0] ?? null;

/** Whether `commit` is a Memory `wf()` commit (§0): `wf(` and no configuration scope. Merges included. */
function isMemoryCommit(commit: HistoryCommit): boolean {
  if (!commit.subject.startsWith('wf(')) return false;
  const scope = WF_HEAD_RE.exec(commit.subject)?.[1];
  return scope === undefined || !CONFIGURATION_SCOPES.includes(scope);
}

/** Whether `commit` is an other commit (§0): not a merge and not a Memory `wf()` commit. */
function isOtherCommit(commit: HistoryCommit): boolean {
  return !isMerge(commit) && !isMemoryCommit(commit);
}

const hasOwn = (record: object, key: string): boolean => Object.prototype.hasOwnProperty.call(record, key);

/** The ids a subject names: after the verb (without the bracket), or after `to` for `assign`; `null` when unlisted. */
function subjectIds(subject: string, verb: string): string[] | null {
  // `parseMemoryOperation` reads `assign` only in its canonical form, which always has ` to {ids}`.
  if (verb === 'assign') return ((ASSIGN_IDS_RE.exec(subject) as RegExpExecArray)[1] as string).split(', ');
  const rest = subject.replace(WF_HEAD_RE, '').replace(/\s*\[[^\]]*\]\s*$/, '').trim();
  return ID_LIST_RE.test(rest) ? rest.split(', ') : null;
}

/** The subject and bracket reading of a Memory `wf()` commit (§4.2, §4.3), and the operation it parsed to. */
function readSubject(commit: HistoryCommit, memoryYaml: ConfigRead<MemoryYamlValue> | null): { findings: CheckFinding[]; op: string | null; ids: string[] } {
  const findings: CheckFinding[] = [];
  const add = (rule: 'subject' | 'bracket', message: string): void => {
    findings.push({ rule, check: rule, message });
  };
  const { subject } = commit;
  const head = WF_HEAD_RE.exec(subject);
  if (!head) {
    add('subject', 'not in the wf({type}): {verb} {ids} grammar');
    return { findings, op: null, ids: [] };
  }
  const scope = head[1] as string;
  const verb = head[2] as string;
  const op = parseMemoryOperation(subject);
  if (op === null) {
    add(
      'subject',
      verb === 'assign'
        ? 'an assign subject must be `wf({type}): assign release {version} to {ids}`, with no bracket'
        : `'${verb}' is not one of the declared verbs (${MEMORY_OPERATIONS.join(', ')})`,
    );
    return { findings, op: null, ids: [] };
  }
  if (memoryYaml !== null && memoryYaml.ok && !hasOwn(memoryYaml.value.types, scope)) {
    add('subject', `'${scope}' is not a type of the memory.yaml committed at this commit`);
  }
  const parsedIds = subjectIds(subject, op);
  if (parsedIds === null || parsedIds.length === 0) add('subject', "the ids after the verb must be a list separated by ', '");
  const ids = parsedIds ?? [];

  if (BRACKETLESS_VERBS.has(op)) {
    if (ANY_BRACKET_RE.test(subject.slice(head[0].length))) add('bracket', `'${op}' carries no bracket`);
    return { findings, op, ids };
  }
  const bracket = CANONICAL_BRACKET_RE.exec(subject);
  if (!bracket) {
    add(
      'bracket',
      ANY_BRACKET_RE.test(subject)
        ? 'the bracket is not canonical: [from → to], with the U+2192 arrow and single spaces, closing the subject'
        : `'${op}' needs a [from → to] bracket`,
    );
    return { findings, op, ids };
  }
  const states = (bracket[1] as string).split(' → ');
  if (states.length > 2 && op !== 'sync') add('bracket', `only 'sync' may chain states; '${op}' brackets one hop`);
  if (op === 'deprecate' && states[states.length - 1] !== DEPRECATED_STATE) add('bracket', "'deprecate' ends in 'deprecated'");
  if (op === 'amend' && (states.length !== 2 || states[0] !== states[1])) add('bracket', "'amend' brackets the unchanged state, [s → s]");
  if (op === 'park' && (states.length !== 2 || states[0] === states[1])) add('bracket', "'park' brackets one hop between two different states, [from → to]");
  return { findings, op, ids };
}

/** The lines of `body` that start `Approver:`, any letter case. */
const approverLinesOf = (body: string): string[] => body.split('\n').filter((line) => APPROVER_LINE_RE.test(line));

/** The grammar of a commit's `Approver:` lines (at least one), shared by `body` and `workflow-record-authority`. */
function approverGrammarMessages(approverLines: readonly string[], body: string): string[] {
  const messages: string[] = [];
  const approval = parseApprovalMetadata(body);
  if (approval === null) messages.push('the Approver: line must be the first body line, as `Approver: Name <email> (role)`');
  else if (approval.approverRole !== APPROVER_ROLE) messages.push(`the Approver: role is '${approval.approverRole}', not 'approver'`);
  if (approverLines.length > 1) messages.push(`${approverLines.length} Approver: lines; an approval records one`);
  return messages;
}

/** The authority of a commit that records an approval, against the `dna.yaml` of its first parent (§4.4). */
function authorityMessages(commit: HistoryCommit, dna: ConfigRead<DnaYamlValue> | null): string[] {
  const messages: string[] = [];
  if (dna === null) {
    messages.push(`no ${DNA_YAML_PATH} is committed before this commit, so no approval authority can be established`);
  } else if (!dna.ok) {
    messages.push(`the ${DNA_YAML_PATH} committed before this commit does not validate (${dna.error})`);
  } else if (!hasApproverRole(dna.value, commit.authorEmail)) {
    messages.push(`the author <${commit.authorEmail}> holds no approver role in team.members (dl-094)`);
  }
  const approval = parseApprovalMetadata(commit.body);
  if (approval !== null && approval.approverEmail.toLowerCase() !== commit.authorEmail.toLowerCase()) {
    messages.push(`the Approver: line names <${approval.approverEmail}>, but <${commit.authorEmail}> authored the commit (dl-094)`);
  }
  return messages;
}

/** Whether a Memory `wf()` commit records an approval (§4.4): an approval verb, or an `Approver:` line. */
const recordsApproval = (op: string, body: string): boolean => APPROVAL_VERBS.has(op) || approverLinesOf(body).length > 0;

/** A Markdown text's frontmatter fields, as the checks read them; `null` without a text. */
interface FrontmatterFields {
  readonly status: string | null;
  readonly type: string | null;
  readonly supersedes: string | null;
  readonly id: string | null;
  readonly unreadable?: string;
  readonly newer?: true;
}

/**
 * A Markdown text's frontmatter `status`, `type`, `supersedes` and `id`: `null` when there is no text, `unreadable`
 * when the frontmatter does not parse, `unreadable` and `newer` when it is written in a newer element format.
 */
function readFrontmatterFields(text: string | null, label: string): FrontmatterFields | null {
  if (text === null) return null;
  const { frontmatter } = splitFrontmatter(text);
  if (!frontmatter) return { status: null, type: null, supersedes: null, id: null };
  let parsed: unknown;
  try {
    parsed = parseYaml(frontmatter, label);
  } catch (error) {
    return { status: null, type: null, supersedes: null, id: null, unreadable: firstLine(error) };
  }
  const newer = newerFormatIssue(parsed, MEMORY_TEMPLATE_FORMAT, label);
  if (newer !== null) return { status: null, type: null, supersedes: null, id: null, unreadable: `${newer.code}: ${newer.message}`, newer: true };
  const field = (name: string): string | null => {
    if (parsed === null || typeof parsed !== 'object') return null;
    const value = (parsed as Record<string, unknown>)[name];
    return typeof value === 'string' ? value : null;
  };
  return { status: field('status'), type: field('type'), supersedes: field('supersedes'), id: field('id') };
}

/** The first line of an error's message. */
function firstLine(error: unknown): string {
  return (error as Error).message.split('\n')[0] as string;
}

/** The kinds of edge `from → to` is in `machine`: `forward`, `reject`, `returns`, `deprecate`. */
function edgeKinds(machine: StateMachine, from: string, to: string): string[] {
  const kinds: string[] = [];
  const index = machine.sequence.indexOf(from);
  if (index !== -1 && machine.sequence[index + 1] === to) kinds.push('forward');
  if ((machine.gates ?? {})[from]?.reject === to) kinds.push('reject');
  if ((machine.returns ?? {})[from] === to) kinds.push('returns');
  if (to === DEPRECATED_STATE) kinds.push('deprecate');
  return kinds;
}

/** A document a Memory `wf()` commit touches, keyed by its path at `HEAD`. */
interface TouchedDocument {
  /** Whether the subject names it (§4.5's `isNamed`). */
  readonly named: boolean;
  /** The path the commit wrote it at under the name the subject gives it: present exactly when `named`. */
  readonly writtenAt?: string;
}

/** The state reading of a Memory `wf()` commit whose subject has the `wf()` head (§4.5–§4.8). */
interface MemoryReading {
  readonly op: string | null;
  readonly type: string;
  readonly memoryYaml: ConfigRead<MemoryYamlValue> | null;
  readonly machine: StateMachine | undefined;
  readonly bracketed: boolean;
  readonly hops: readonly { readonly from: string; readonly to: string }[] | null;
  /** The touched Markdown documents, by path at `HEAD`, in the order the commit touches them. */
  readonly documents: ReadonlyMap<string, TouchedDocument>;
}

/**
 * §4.5's naming rule: whether the subject of a commit names the document at a path. Every token of the subject, not
 * only the parsed id list `ids`, names a document: by its full id or by its short id.
 */
function subjectNames(subject: string, ids: readonly string[]): (path: string) => boolean {
  const named = new Set([...ids, ...subject.split(/[\s,[\]]+/)]);
  return (path) => {
    const id = basename(path, '.md');
    return named.has(id) || [...named].some((token) => token !== '' && id.startsWith(`${token}-`));
  };
}

/** The state reading of `commit`, or `null` when it is no Memory `wf()` commit with a `wf()` head. */
function readMemoryCommit(commit: HistoryCommit, reader: HistoryReader): MemoryReading | null {
  if (!isMemoryCommit(commit)) return null;
  const head = WF_HEAD_RE.exec(commit.subject);
  if (!head) return null;
  const memoryYaml = reader.memoryYamlAt(firstParent(commit));
  const { op, ids } = readSubject(commit, memoryYaml);
  const type = head[1] as string;
  const machine = memoryYaml !== null && memoryYaml.ok && hasOwn(memoryYaml.value.types, type) ? resolveStateMachine(memoryYaml.value, type) : undefined;
  const bracketed = ANY_BRACKET_RE.test(commit.subject);
  const hops = bracketed ? parseBracketHops(commit.subject) : null;
  const isNamed = subjectNames(commit.subject, ids);
  const documents = new Map<string, TouchedDocument>();
  for (const path of reader.touchedPaths(commit.sha).filter((candidate) => candidate.endsWith('.md'))) {
    const atHead = reader.pathAtHead(path);
    const previous = documents.get(atHead);
    const writtenAt = isNamed(path) ? path : previous?.writtenAt;
    documents.set(atHead, writtenAt === undefined ? { named: false } : { named: true, writtenAt });
  }
  return { op, type, memoryYaml, machine, bracketed, hops, documents };
}

/** Whether a path is a Markdown file under the content roots of `memoryYaml` (§4.1, `computeMemoryContentRoots`). */
function contentRootTest(memoryYaml: MemoryYamlValue): (path: string | null) => boolean {
  const roots = computeMemoryContentRoots(memoryYaml);
  return (path) => path !== null && path.endsWith('.md') && roots.some((root) => path.startsWith(`${root}/`));
}

/** The one-line form of a consistency-walk finding (§4.5). */
function describeTransitionFinding(finding: TransitionFinding, path: string, type: string): string {
  switch (finding.kind) {
    case 'mismatch':
      return `${path}: the bracket declares ${finding.declared.from} → ${finding.declared.to}, the frontmatter went ${finding.derived.from} → ${finding.derived.to}`;
    case 'illegal-hop':
      return `${path}: the hop ${finding.hop.from} → ${finding.hop.to} is not an edge of the '${type}' machine at this commit`;
    default:
      return `${path}: the bracket does not read as a transition`;
  }
}

/** The `stateUnchecked` reason of a walk that threw on an unreadable revision, or `undefined` for any other throw. */
function unreadableReason(path: string, error: unknown): string | undefined {
  if (!(error instanceof ValidationError)) return undefined;
  const why = isNewerFormatError(error) ? 'a revision is written in a newer format' : "a revision's frontmatter does not parse";
  return `${path}: ${why} (${firstLine(error)})`;
}

const EMPTY: CheckOutcome = Object.freeze({ findings: Object.freeze([]), stateUnchecked: Object.freeze([]) }) as CheckOutcome;

const outcome = (findings: CheckFinding[], stateUnchecked: string[] = []): CheckOutcome =>
  findings.length === 0 && stateUnchecked.length === 0 ? EMPTY : { findings, stateUnchecked };

// --- The checks ----------------------------------------------------------------------------------------------------

/**
 * `subject` (`spec-020` §4.2): every Memory `wf()` commit, merges included, follows `wf({type}): {verb} {ids}` with a
 * declared verb (`assign` in its canonical form), a type of the first parent's `memory.yaml` and a `, `-separated id list.
 */
export const checkSubject: GovernanceCheckFn = (commit, reader) => {
  if (!isMemoryCommit(commit)) return EMPTY;
  return outcome(readSubject(commit, reader.memoryYamlAt(firstParent(commit))).findings.filter((finding) => finding.rule === 'subject'));
};

/**
 * `bracket` (`spec-020` §4.3): the same commits, once the verb parsed — no bracket on `add`, `submit` and `assign`,
 * the canonical `[from → to]` elsewhere; only `sync` chains, `deprecate` ends in `deprecated`, `amend` is `[s → s]`,
 * `park` is one hop between two different states.
 */
export const checkBracket: GovernanceCheckFn = (commit, reader) => {
  if (!isMemoryCommit(commit)) return EMPTY;
  return outcome(readSubject(commit, reader.memoryYamlAt(firstParent(commit))).findings.filter((finding) => finding.rule === 'bracket'));
};

/**
 * `body` (`spec-020` §4.4, category `body`): an approval carries `Approver: Name <email> (approver)` as its first body
 * line and a `Reason:` block, `park` a `Reason:` block, `assign` no `Approver:`; any `Reason:` is recordable under
 * `dl-067`; at most one line of each key.
 */
export const checkBody: GovernanceCheckFn = (commit) => {
  if (!isMemoryCommit(commit)) return EMPTY;
  const op = WF_HEAD_RE.test(commit.subject) ? parseMemoryOperation(commit.subject) : null;
  if (op === null) return EMPTY;
  const messages: string[] = [];
  const lines = commit.body.split('\n');
  const approverLines = approverLinesOf(commit.body);
  const reasonLines = lines.filter((line) => REASON_KEY_RE.test(line));
  if (op === 'assign' && approverLines.length > 0) {
    messages.push("'assign' is not an approval: it carries no Approver: line");
  } else if (recordsApproval(op, commit.body)) {
    if (approverLines.length === 0) messages.push(`'${op}' needs an Approver: line`);
    else messages.push(...approverGrammarMessages(approverLines, commit.body));
    if (APPROVAL_VERBS.has(op) && reasonLines.length === 0) messages.push(`'${op}' needs a Reason: block`);
  }
  if (REASON_VERBS.has(op) && reasonLines.length === 0) messages.push(`'${op}' needs a Reason: block`);
  if (reasonLines.length > 1) messages.push(`${reasonLines.length} Reason: lines; a commit records one Reason: block`);
  if (reasonLines.some((line) => !line.startsWith('Reason:'))) messages.push('the Reason: key is written `Reason:`');
  if (reasonLines.length > 0 && lines.some((line) => line.startsWith('Reason:'))) {
    const reason = parseCommitReason(commit.body);
    const refusal = reason === null ? 'must not be blank' : reasonRefusalMessage(reason);
    if (refusal !== null) messages.push(`the Reason: block ${refusal.replace(/^invalid flag value: --reason /, '')} (dl-067)`);
  }
  return outcome(messages.map((message) => ({ rule: 'body', check: 'body', message })));
};

/**
 * `authority` (`spec-020` §4.4, category `authority`): a Memory `wf()` commit that records an approval (not `assign`)
 * is authored by a holder of `approver` in the first parent's `dna.yaml`, and its `Approver:` line names that author.
 */
export const checkAuthority: GovernanceCheckFn = (commit, reader) => {
  if (!isMemoryCommit(commit)) return EMPTY;
  const op = WF_HEAD_RE.test(commit.subject) ? parseMemoryOperation(commit.subject) : null;
  if (op === null || op === 'assign' || !recordsApproval(op, commit.body)) return EMPTY;
  const dna = firstParent(commit) === null ? null : reader.dnaYamlAt(firstParent(commit));
  return outcome(authorityMessages(commit, dna).map((message) => ({ rule: 'authority', check: 'authority', message })));
};

/**
 * `state` (`spec-020` §4.5): on a Memory `wf()` commit, against the first parent's machine — a gated commit with no
 * valid `memory.yaml` there; a single hop that is no edge (`park`'s: no `returns` edge); the consistency walk of each
 * named, bracketed document; and, from the frontmatter, a document the subject does not name whose status changed,
 * `assign` changing a status, `add` leaving the initial state, `submit` moving along no edge. What it cannot judge is
 * returned as `stateUnchecked`: first what the subject and paths decide, then each unreadable revision by path.
 */
export const checkState: GovernanceCheckFn = (commit, reader, context) => {
  const reading = readMemoryCommit(commit, reader);
  if (reading === null) return EMPTY;
  const { op, type, memoryYaml, machine, bracketed, hops, documents } = reading;
  const findings: CheckFinding[] = [];
  const early: string[] = [];
  const late: string[] = [];
  const add = (message: string): void => {
    findings.push({ rule: 'state', check: 'state', message });
  };

  if (machine === undefined) {
    const why =
      memoryYaml === null
        ? `no ${MEMORY_YAML_PATH} is committed at this commit`
        : !memoryYaml.ok
          ? `the ${MEMORY_YAML_PATH} committed at this commit does not validate (${memoryYaml.error})`
          : `no machine for '${type}' in the ${MEMORY_YAML_PATH} at this commit`;
    if (context.gated && (memoryYaml === null || !memoryYaml.ok)) add(`${why}: its state cannot be checked`);
    else early.push(`${why}: transitions not judged`);
  }
  if (op !== null && machine !== undefined && hops !== null && hops.length === 1 && op !== EDGE_EXEMPT_VERB) {
    const { from, to } = hops[0] as { from: string; to: string };
    if (op === 'park') {
      if ((machine.returns ?? {})[from] !== to) add(`${from} → ${to} is not a returns edge of the '${type}' machine at this commit`);
    } else if (!isMachineEdge(machine, from, to)) {
      add(`${from} → ${to} is not an edge of the '${type}' machine at this commit`);
    }
  }

  if (![...documents.values()].some((document) => document.named)) early.push(NO_NAMED_DOCUMENT);
  const atHead: string[] = [];
  for (const [path, document] of documents) {
    if (reader.existsAtHead(path)) {
      atHead.push(path);
      continue;
    }
    // A named document gone at HEAD is verb-edge's when its bracket can be compared.
    if (document.named && !(machine !== undefined && hops !== null && op !== EDGE_EXEMPT_VERB)) early.push(`${path} does not exist at HEAD`);
  }

  for (const path of atHead.sort()) {
    const document = documents.get(path) as TouchedDocument;
    if (document.named && bracketed) {
      try {
        for (const finding of reader.transitionFindings(path, machine)) {
          if (finding.sha === commit.sha) add(describeTransitionFinding(finding, path, type));
        }
      } catch (error) {
        const reason = unreadableReason(path, error);
        if (reason === undefined) throw error;
        late.push(reason);
      }
      continue;
    }
    if (document.named && !(op !== null && BRACKETLESS_VERBS.has(op))) continue;
    let transitions: readonly MemoryTransition[];
    try {
      transitions = reader.transitions(path);
    } catch (error) {
      const reason = unreadableReason(path, error);
      if (reason === undefined) throw error;
      if (document.named) late.push(reason);
      continue;
    }
    for (const transition of transitions) {
      if (transition.sha !== commit.sha) continue;
      const { fromState: from, toState: to } = transition;
      if (!document.named) {
        if (from !== to) add(`${path}: the subject does not name it, yet its status went ${from} → ${to}`);
      } else if (op === 'assign') {
        if (from !== to) add(`${path}: 'assign' never changes status, yet it went ${from} → ${to}`);
      } else if (op === 'add') {
        const initial = machine?.sequence[0];
        if (initial !== undefined && to !== initial) add(`${path}: 'add' leaves it in the initial state '${initial}', not '${to}'`);
      } else if (op === 'submit' && machine !== undefined && from !== null && to !== null && !isMachineEdge(machine, from, to)) {
        add(`${path}: 'submit' moved it ${from} → ${to}, not an edge of the '${type}' machine at this commit`);
      }
    }
  }
  return outcome(findings, [...early, ...late]);
};

/**
 * `verb-edge` (`spec-020` §4.6, category `state`): a single-hop `approve` along a forward edge, `start` along a forward
 * edge not into the last state, `finalize` along the forward edge into it, `reject` along a `gates` reject edge; a hop
 * of another verb along a reject edge cites the approver's reject commit by sha; a named document gone at `HEAD` has
 * its bracket compared with its frontmatter before and after the commit.
 */
export const checkVerbEdge: GovernanceCheckFn = (commit, reader) => {
  const reading = readMemoryCommit(commit, reader);
  if (reading === null) return EMPTY;
  const { op, type, machine, hops, documents } = reading;
  if (machine === undefined || hops === null) return EMPTY;
  const findings: CheckFinding[] = [];
  const unchecked: string[] = [];
  const add = (message: string): void => {
    findings.push({ rule: 'state', check: 'verb-edge', message });
  };

  if (op !== null && hops.length === 1 && PAIRED_VERBS.has(op)) {
    const { from, to } = hops[0] as { from: string; to: string };
    if (isMachineEdge(machine, from, to)) {
      const kinds = edgeKinds(machine, from, to);
      const last = machine.sequence[machine.sequence.length - 1] as string;
      const what = `${from} → ${to} is a ${kinds.join('/')} edge of the '${type}' machine`;
      if (op === 'approve' && !kinds.includes('forward')) add(`'approve' moves along a forward edge; ${what}`);
      if (op === 'reject' && !kinds.includes('reject')) add(`'reject' moves along a gates reject edge; ${what}`);
      if (op === 'finalize' && (!kinds.includes('forward') || to !== last)) add(`'finalize' moves along the forward edge into the last state '${last}'; ${what}`);
      if (op === 'start' && (!kinds.includes('forward') || to === last)) add(`'start' moves along a forward edge not into the last state '${last}' (that is 'finalize'); ${what}`);
    }
  }

  if (op !== null && !PAIRED_VERBS.has(op)) {
    const crossing = hops.find((hop) => {
      const kinds = edgeKinds(machine, hop.from, hop.to);
      return kinds.includes('reject') && !kinds.includes('forward');
    });
    if (crossing !== undefined) {
      const tokens = [...new Set(commit.body.match(SHA_TOKEN_RE) ?? [])];
      if (!tokens.some((token) => reader.isRejectCommit(token))) {
        add(`${crossing.from} → ${crossing.to} is a reject edge of the '${type}' machine: the body must cite the approver's reject commit by sha (dl-061 B.1)`);
      }
    }
  }

  if (op !== EDGE_EXEMPT_VERB) {
    for (const [atHeadPath, document] of documents) {
      if (!document.named || reader.existsAtHead(atHeadPath)) continue;
      const path = document.writtenAt as string;
      // A machine came from the first parent's memory.yaml, so the commit has a first parent.
      const parent = firstParent(commit) as string;
      const before = readFrontmatterFields(reader.blob(parent, path), `${path}@${parent}`);
      const after = readFrontmatterFields(reader.blob(commit.sha, path), `${path}@${commit.sha}`);
      if (before?.unreadable !== undefined || after?.unreadable !== undefined) {
        const newer = [before, after].find((fields) => fields?.newer === true);
        const reason = newer ? `a revision is written in a newer format (${newer.unreadable})` : "a revision's frontmatter does not parse";
        unchecked.push(`${path}: ${reason}`);
        continue;
      }
      const derivedFrom = before?.status ?? null;
      const derivedTo = after?.status ?? null;
      const declaredFrom = (hops[0] as { from: string }).from;
      const declaredTo = (hops[hops.length - 1] as { to: string }).to;
      if (declaredFrom !== derivedFrom || declaredTo !== derivedTo) {
        add(`${path} (gone at HEAD): the bracket declares ${declaredFrom} → ${declaredTo}, the frontmatter went ${derivedFrom} → ${derivedTo}`);
      }
    }
  }
  return outcome(findings, unchecked);
};

/**
 * `status-outside-wf` (`spec-020` §4.7, category `state`, `dl-139` (a)): an other commit changes no Memory document's
 * `status` and creates none — a Memory document being a `.md` under the content roots of the first parent's
 * `memory.yaml` whose frontmatter `type` is one of its types; renames followed, a deletion not judged.
 */
export const checkStatusOutsideWf: GovernanceCheckFn = (commit, reader) => {
  if (!isOtherCommit(commit)) return EMPTY;
  const parent = firstParent(commit);
  const memoryYaml = reader.memoryYamlAt(parent);
  if (memoryYaml === null || !memoryYaml.ok) return EMPTY;
  const inRoots = contentRootTest(memoryYaml.value);
  const types = memoryYaml.value.types;
  const isMemory = (fields: FrontmatterFields | null): boolean => fields !== null && fields.type !== null && hasOwn(types, fields.type);
  const findings: CheckFinding[] = [];
  for (const change of reader.fileChanges(commit.sha)) {
    if (change.to === null || !(inRoots(change.from) || inRoots(change.to))) continue;
    const before = change.from === null || parent === null ? null : readFrontmatterFields(reader.blob(parent, change.from), change.from);
    const after = readFrontmatterFields(reader.blob(commit.sha, change.to), change.to);
    if (before?.unreadable !== undefined || after?.unreadable !== undefined) continue;
    if (!isMemory(before) && !isMemory(after)) continue;
    const from = before?.status ?? null;
    const to = after?.status ?? null;
    if (from === to) continue;
    findings.push({
      rule: 'state',
      check: 'status-outside-wf',
      message: `${change.to}: its status went ${from ?? '(none)'} → ${to ?? '(none)'} in a commit that is not a wf() Memory operation (dl-139)`,
    });
  }
  return outcome(findings);
};

/**
 * `supersedes-pair` (`spec-020` §4.8, category `state`, `bug-218`): an `approve` that leaves a named document in a
 * state whose forward edge leads to `superseded`, with a non-empty `supersedes:`, needs its target `superseded` at
 * `HEAD`; the finding names the `finalize` that completes the pair.
 */
export const checkSupersedesPair: GovernanceCheckFn = (commit, reader) => {
  const reading = readMemoryCommit(commit, reader);
  if (reading === null || reading.op !== 'approve' || reading.machine === undefined) return EMPTY;
  const { machine, type, documents } = reading;
  const findings: CheckFinding[] = [];
  for (const document of documents.values()) {
    if (!document.named) continue;
    const path = document.writtenAt as string;
    const approved = readFrontmatterFields(reader.blob(commit.sha, path), `${path}@${commit.sha}`);
    if (approved === null || approved.unreadable !== undefined || approved.status === null) continue;
    if (!supersedesEdgeFrom(machine, approved.status)) continue;
    const target = (approved.supersedes ?? '').trim();
    if (target === '') continue;
    const state = reader.headDocumentStatus(target) ?? null;
    if (state === SUPERSEDED_STATE) continue;
    const approvedId = approved.id ?? basename(path, '.md');
    findings.push({
      rule: 'state',
      check: 'supersedes-pair',
      message:
        `${path}: approved into '${approved.status}' with supersedes: ${target}, but ${target} is ${state === null ? 'missing' : `'${state}'`} at HEAD, ` +
        `not '${SUPERSEDED_STATE}': complete the pair with \`wf(${type}): finalize ${target} [${state ?? approved.status} → ${SUPERSEDED_STATE}]\`, ` +
        `Reason: superseded by ${approvedId} (its supersedes: field), approved in ${commit.sha}.`,
    });
  }
  return outcome(findings);
};

/**
 * `approval-agent-trailer` (`spec-020` §4.9, `spec-018` §4, category `body`): on a non-merge commit whose message has a
 * line starting `Approver:` (any case), each agent-trailer line is one finding naming the key as written, a repeated
 * key numbered from its second line. The two patterns are the commit primitive's ({@link APPROVER_LINE_RE},
 * {@link AGENT_TRAILER_LINE_RE}).
 */
export const checkApprovalAgentTrailer: GovernanceCheckFn = (commit) => {
  if (isMerge(commit)) return EMPTY;
  const lines = [commit.subject, ...commit.body.split('\n')];
  if (!lines.some((line) => APPROVER_LINE_RE.test(line))) return EMPTY;
  const seen = new Map<string, number>();
  const findings: CheckFinding[] = [];
  for (const line of lines.filter((candidate) => AGENT_TRAILER_LINE_RE.test(candidate))) {
    const key = line.slice(0, line.indexOf(':'));
    const count = (seen.get(key.toLowerCase()) ?? 0) + 1;
    seen.set(key.toLowerCase(), count);
    findings.push({
      rule: 'body',
      check: 'approval-agent-trailer',
      message:
        'an approval commit (it has an Approver: line) carries no agent trailer (spec-018 §4, git-conventions §7), ' +
        `yet it has ${/^[aeiou]/i.test(key) ? 'an' : 'a'} ${key}: line${count > 1 ? ` (occurrence ${count})` : ''}`,
    });
  }
  return outcome(findings);
};

/**
 * `workflow-record-authority` (`spec-020` §4.10, `bug-444`, categories `body` and `authority`): a non-merge
 * `workflow: finalize|adopt|rekey` record with an `Approver:` line holds it to §4.4's grammar and authority, against the
 * first parent's `dna.yaml`.
 */
export const checkWorkflowRecordAuthority: GovernanceCheckFn = (commit, reader) => {
  if (isMerge(commit) || !WORKFLOW_RECORD_RE.test(commit.subject)) return EMPTY;
  const approverLines = approverLinesOf(commit.body);
  if (approverLines.length === 0) return EMPTY;
  const check = 'workflow-record-authority';
  const dna = firstParent(commit) === null ? null : reader.dnaYamlAt(firstParent(commit));
  return outcome([
    ...approverGrammarMessages(approverLines, commit.body).map((message): CheckFinding => ({ rule: 'body', check, message })),
    ...authorityMessages(commit, dna).map((message): CheckFinding => ({ rule: 'authority', check, message })),
  ]);
};

/**
 * The `WingFoil-*` keys a commit body writes outside its final paragraph (`spec-020` §4.11, `git-conventions` §8,
 * `bug-391`): each distinct key (any letter case, first spelling kept), in the order written, on the lines before the
 * body's final paragraph — the lines after its last blank line, the paragraph the workflow deduction reads.
 * `scripts/check-governance.cjs` re-exports it for `scripts/check-phase-report.cjs` (`task-366` D5).
 *
 * @param body - the commit's body, without its subject.
 * @returns the keys as first written, in the order written; `[]` when every `WingFoil-*` line is in the final paragraph.
 */
export function trailerKeysOutsideFinalParagraph(body: string): string[] {
  const lines = body.split('\n');
  let lastBlank = -1;
  lines.forEach((line, index) => {
    if (line.trim() === '') lastBlank = index;
  });
  const keys = new Map<string, string>();
  for (const line of lines.slice(0, lastBlank + 1)) {
    const key = WINGFOIL_TRAILER_RE.exec(line)?.[1];
    if (key !== undefined && !keys.has(key.toLowerCase())) keys.set(key.toLowerCase(), key);
  }
  return [...keys.values()];
}

/**
 * `trailer-paragraph` (`spec-020` §4.11, `bug-391`, category `body`): on a non-merge commit, each distinct `WingFoil-*`
 * key (any case, first spelling kept) written before the body's final paragraph is one finding, in the order written.
 */
export const checkTrailerParagraph: GovernanceCheckFn = (commit) => {
  if (isMerge(commit)) return EMPTY;
  return outcome(
    trailerKeysOutsideFinalParagraph(commit.body).map((key) => ({
      rule: 'body',
      check: 'trailer-paragraph',
      message: `a ${key}: line sits outside the commit's final paragraph, where the workflow deduction does not read it (git-conventions §8, bug-391)`,
    })),
  );
};

/** A `Carries content:` key line, any letter case (`spec-020` §4.14). */
const CARRIES_KEY_RE = /^carries content:/i;
/** The key as `memory submit` writes it (`spec-008` §2), and the line's prefix with the one space after it. */
const CARRIES_KEY = 'Carries content:';
const CARRIES_LINE_PREFIX = `${CARRIES_KEY} `;
/** The key as `memory submit` writes it, followed by exactly one space and then the items (row 3's spelling). */
const CARRIES_PREFIX_RE = /^Carries content: (?![ \t])/;
/** A key line's key and the blanks after it, any letter case: what the items are read after. */
const CARRIES_KEY_TEXT_RE = /^carries content:[ \t]*/i;
const CARRIES_REF = '(spec-008 §2, bug-287)';

/**
 * `carries-content` (`spec-020` §4.14, `bug-287`, category `body`): on a non-merge Memory `wf()` commit whose verb
 * parsed, a `Carries content:` line outside the `Reason:` block ({@link linesOutsideReasonBlock}) is a submit's alone,
 * written once, with its key spelled `Carries content:` and followed by exactly one space, and
 * items of `spec-008` §2's five forms that equal what the commit carries — computed from the named documents' blobs at
 * the first parent and at the commit ({@link describeCommittedSubmitContent}, their union in the declared order); a
 * submit that carries content declares it, once an ancestor of the commit carries a line
 * ({@link HistoryReader.carriesLineBefore}). A named document absent at either revision is not compared.
 */
export const checkCarriesContent: GovernanceCheckFn = (commit, reader) => {
  // `parseMemoryOperation` reads the `wf()` head as `WF_HEAD_RE` does, so a subject without one is no operation.
  const op = isMerge(commit) || !isMemoryCommit(commit) ? null : parseMemoryOperation(commit.subject);
  if (op === null) return EMPTY;
  // Only the lines the commit writes outside its `Reason:` block: a reason's text never declares content (F1).
  const keyLines = linesOutsideReasonBlock(commit.body).filter((line) => CARRIES_KEY_RE.test(line));
  const messages: string[] = [];
  if (op !== 'submit') {
    if (keyLines.length > 0) messages.push(`'${op}' declares no carried content: only a submit writes a Carries content: line ${CARRIES_REF}`);
    return outcome(messages.map((message) => ({ rule: 'body', check: 'carries-content', message })));
  }
  if (keyLines.length > 1) messages.push(`${keyLines.length} Carries content: lines; a submit declares one ${CARRIES_REF}`);
  if (keyLines.some((line) => !CARRIES_PREFIX_RE.test(line))) messages.push(`the Carries content: key is written \`Carries content:\` ${CARRIES_REF}`);

  // The declaration, read from the first key line whatever its spelling (the spelling is the row above's).
  const first = keyLines[0];
  const declared = first === undefined ? null : (parseCarriesContent(first.replace(CARRIES_KEY_TEXT_RE, `${CARRIES_KEY} `)) as string[]);
  let wellFormed = true;
  if (declared !== null && first !== undefined) {
    const index = declared.findIndex((item) => !isCarriesItem(item));
    if (index !== -1) {
      const written = first.replace(CARRIES_KEY_TEXT_RE, '').split(', ')[index] as string;
      messages.push(`the Carries content: line names '${written}', which is not an item spec-008 §2 declares (bug-287)`);
      wellFormed = false;
    }
  }

  // What the commit carries: the named documents present at the first parent and at the commit.
  const parent = firstParent(commit);
  const isNamed = subjectNames(commit.subject, subjectIds(commit.subject, op) ?? []);
  const items: string[] = [];
  let compared = false;
  for (const change of parent === null ? [] : reader.fileChanges(commit.sha)) {
    if (change.from === null || change.to === null || !change.to.endsWith('.md') || !(isNamed(change.to) || isNamed(change.from))) continue;
    const before = reader.blob(parent as string, change.from);
    const after = reader.blob(commit.sha, change.to);
    if (before === null || after === null) continue;
    const carried = describeCommittedSubmitContent(before, after);
    if (carried === null) continue;
    compared = true;
    items.push(...carried);
  }
  const computed = orderCarriesItems(items);
  if (compared && declared === null && computed.length > 0 && reader.carriesLineBefore(commit.sha)) {
    messages.push(`'submit' carries ${computed.join(', ')} but declares no Carries content: line ${CARRIES_REF}`);
  }
  if (compared && declared !== null && wellFormed && JSON.stringify(declared) !== JSON.stringify(computed)) {
    const carries = computed.length === 0 ? 'nothing beyond its state move' : computed.join(', ');
    messages.push(`the Carries content: line declares ${declared.join(', ')}, but the commit carries ${carries} ${CARRIES_REF}`);
  }
  return outcome(messages.map((message) => ({ rule: 'body', check: 'carries-content', message })));
};

/** Every check, in the order `governanceCheck` runs them on a commit (§4's order). */
const CHECK_FUNCTIONS: readonly GovernanceCheckFn[] = [
  checkSubject,
  checkBracket,
  checkBody,
  checkAuthority,
  checkState,
  checkVerbEdge,
  checkStatusOutsideWf,
  checkSupersedesPair,
  checkApprovalAgentTrailer,
  checkWorkflowRecordAuthority,
  checkTrailerParagraph,
  checkCarriesContent,
];

// --- The git reader ------------------------------------------------------------------------------------------------

/** The range a {@link createGitHistoryReader} reads, every revision a full sha already resolved. */
export interface GitHistoryRange {
  /** The full sha of `HEAD`. */
  readonly head: string;
  /** The full sha `--base` resolved to: the range is `<base>..HEAD`; absent, every commit reachable from `HEAD`. */
  readonly base?: string;
  /** The full sha `--introduced-at` resolved to: it and its ancestors are history (§5.1). */
  readonly introducedAt?: string;
  /**
   * The commits to read instead of a range, in this order (`git log --no-walk=unsorted`): `memory history`'s mark
   * (`spec-020` §4.13, `task-378`). When given, `base` is not read.
   */
  readonly commits?: readonly string[];
  /**
   * Per sha, the only paths {@link HistoryReader.touchedPaths} and {@link HistoryReader.fileChanges} report (a file
   * change when either side is one of them): the mark's element's document, at the commit and at its first parent.
   */
  readonly paths?: ReadonlyMap<string, readonly string[]>;
  /** Frontmatter walks already read, by path at `HEAD`, which answer {@link HistoryReader.transitions} for those paths. */
  readonly walks?: ReadonlyMap<string, readonly MemoryTransition[]>;
}

/** A `<rev>:<path>` read the git reader can batch ahead of the checks. */
export interface BlobRequest {
  readonly rev: string;
  readonly path: string;
}

/** The git reader: a {@link HistoryReader}, plus the history set of the starting mode and a batched blob prefetch. */
export interface GitHistoryReader extends HistoryReader {
  /** `--introduced-at` and its ancestors (`git rev-list`), the commits whose findings are history; empty without it. */
  readonly history: ReadonlySet<string>;
  /** Read every request in one `git cat-file --batch`, so the checks' `blob` calls answer from memory. */
  prefetch(requests: readonly BlobRequest[]): void;
}

/**
 * The {@link HistoryReader} over the repository at `root` — the one function of this module that calls git
 * (`spec-020` §4.13). The range's commits, touched paths, renames and file changes are each one `git log`
 * (`--no-show-signature`, `core.quotePath=false`, renames with `-M` and `diff.renameLimit=0`); the configuration blobs
 * of every first parent are located in one `git cat-file --batch-check` and each distinct one is parsed once; blobs
 * and walks are memoized.
 *
 * @param root - The repository.
 * @param range - The resolved range ({@link GitHistoryRange}).
 * @throws `StorageError` `E_GIT_READ_FAILED` when git cannot answer.
 */
export function createGitHistoryReader(root: string, range: GitHistoryRange): GitHistoryReader {
  const git = (args: readonly string[], input?: string): string =>
    runGitRead(root, ['-c', 'core.quotePath=false', ...args], input === undefined ? {} : { input }).stdout;
  const listed = range.commits;
  // A list of commits is read in its own order (`--no-walk=unsorted`, the shas on stdin); a range oldest first.
  const reverse = listed === undefined ? ['--reverse'] : [];
  const revisions = listed !== undefined ? ['--no-walk=unsorted', '--stdin'] : range.base === undefined ? [range.head] : [`${range.base}..${range.head}`];
  const stdin = listed === undefined ? undefined : `${listed.join('\n')}\n`;
  // An empty list reads nothing: `git log` with no revision would read `HEAD`.
  const logOf = (args: readonly string[], config: readonly string[] = []): string =>
    listed !== undefined && listed.length === 0 ? '' : git([...config, 'log', '--no-show-signature', ...args, ...revisions], stdin);
  const only = range.paths;
  const kept = (sha: string, path: string | null): boolean => only === undefined || (path !== null && (only.get(sha) ?? []).includes(path));

  // The range's commits, oldest first (a list: in its order).
  const fields = logOf([...reverse, '--format=%H%x00%P%x00%an%x00%ae%x00%s%x00%b%x00']).split('\0');
  const commits: HistoryCommit[] = [];
  for (let index = 0; index + 6 <= fields.length; index += 6) {
    const [sha, parents, authorName, authorEmail, subject, body] = fields.slice(index, index + 6) as [string, string, string, string, string, string];
    commits.push({
      sha: requireCommitName(sha.trim(), 'git log --reverse'),
      parents: parents.trim() === '' ? [] : parents.trim().split(' '),
      authorName,
      authorEmail,
      subject,
      body: body.replace(/\s+$/, ''),
    });
  }

  // The paths each commit touches, a rename as two paths.
  const touched = new Map<string, string[]>();
  let current: string[] | null = null;
  let currentSha = '';
  for (const line of logOf(['--no-renames', '--name-only', '--format=%x01%H']).split('\n')) {
    if (line.startsWith('\u0001')) {
      current = [];
      currentSha = requireCommitName(line.slice(1), 'git log --name-only');
      touched.set(currentSha, current);
    } else if (line !== '' && current !== null && kept(currentSha, line)) {
      current.push(line);
    }
  }

  // Where each path renamed inside the range ended up.
  const forward = new Map<string, string>();
  const renames = logOf(['-M', '--diff-filter=R', '--name-status', '--format=%x01%H', ...reverse], ['-c', 'diff.renameLimit=0']);
  let renameSha = '';
  for (const line of renames.split('\n')) {
    if (line.startsWith('\u0001')) {
      renameSha = line.slice(1);
      continue;
    }
    const [status, from, to] = line.split('\t');
    if (status !== undefined && status.startsWith('R') && from && to && (kept(renameSha, from) || kept(renameSha, to))) forward.set(from, to);
  }

  const atHead = new Set(git(['ls-tree', '-r', '--name-only', range.head]).split('\n'));
  const history = new Set(range.introducedAt === undefined ? [] : git(['rev-list', range.introducedAt]).trim().split('\n').filter(Boolean));

  // The file changes of the non-merge commits, read once, on the first question.
  let changes: Map<string, FileChange[]> | undefined;
  const fileChanges = (sha: string): readonly FileChange[] => {
    if (changes === undefined) {
      changes = new Map();
      let list: FileChange[] | null = null;
      let sha = '';
      const log = logOf(['--no-merges', '-M', '--name-status', '--format=%x01%H'], ['-c', 'diff.renameLimit=0']);
      for (const line of log.split('\n')) {
        if (line.startsWith('\u0001')) {
          list = [];
          sha = requireCommitName(line.slice(1), 'git log --name-status');
          changes.set(sha, list);
        } else if (line !== '' && list !== null) {
          // `-M` detects renames only: git reports no copy (`C`) here, `diff.renames=copies` included.
          const [status, first, second] = line.split('\t') as [string, string, string | undefined];
          const change: FileChange = status.startsWith('R')
            ? { from: first, to: second as string }
            : status === 'A'
              ? { from: null, to: first }
              : status === 'D'
                ? { from: first, to: null }
                : { from: first, to: first };
          if (kept(sha, change.from) || kept(sha, change.to)) list.push(change);
        }
      }
    }
    return changes.get(sha) ?? [];
  };

  // Blobs, read in batches and memoized by `<rev>\0<path>`.
  const blobs = new Map<string, string | null>();
  const blobKey = (rev: string, path: string): string => `${rev}\0${path}`;
  const prefetch = (requests: readonly BlobRequest[]): void => {
    const missing = requests.filter(({ rev, path }) => !blobs.has(blobKey(rev, path)));
    if (missing.length === 0) return;
    readRevisionPaths(root, missing).forEach((text, index) => {
      const { rev, path } = missing[index] as BlobRequest;
      blobs.set(blobKey(rev, path), text);
    });
  };
  const blob = (rev: string, path: string): string | null => {
    const key = blobKey(rev, path);
    if (!blobs.has(key)) prefetch([{ rev, path }]);
    return blobs.get(key) ?? null;
  };

  // Configuration blobs: located per revision (one batch for every first parent of the range), parsed once per blob.
  const objectIds = new Map<string, string | null>();
  const locate = (requests: readonly BlobRequest[]): void => {
    const missing = requests.filter(({ rev, path }) => !objectIds.has(blobKey(rev, path)));
    if (missing.length === 0) return;
    const answer = git(['cat-file', '--batch-check=%(objectname) %(objecttype)'], `${missing.map(({ rev, path }) => `${rev}:${path}`).join('\n')}\n`);
    const lines = answer.split('\n');
    missing.forEach(({ rev, path }, index) => {
      const [oid, type] = (lines[index] as string).split(' ');
      objectIds.set(blobKey(rev, path), type === 'blob' ? (oid as string) : null);
    });
  };
  const parents = [...new Set(commits.map((commit) => commit.parents[0]).filter((parent): parent is string => parent !== undefined))];
  locate(parents.flatMap((rev) => [{ rev, path: MEMORY_YAML_PATH }, { rev, path: DNA_YAML_PATH }]));
  const configs = new Map<string, ConfigRead<unknown>>();
  const configAt = <T>(rev: string | null, path: string, schema: { safeParse(input: unknown): { success: true; data: T } | { success: false; error: { issues: readonly { message: string }[] } } }): ConfigRead<T> | null => {
    if (rev === null) return null;
    locate([{ rev, path }]);
    const oid = objectIds.get(blobKey(rev, path)) ?? null;
    if (oid === null) return null;
    const key = `${path}\0${oid}`;
    if (!configs.has(key)) {
      let read: ConfigRead<T>;
      try {
        const result = schema.safeParse(parseYaml(readBlobs(root, [oid]).get(oid) as string, oid));
        // A failed parse carries at least one issue.
        read = result.success ? { ok: true, value: result.data } : { ok: false, error: (result.error.issues[0] as { message: string }).message };
      } catch (error) {
        read = { ok: false, error: firstLine(error) };
      }
      configs.set(key, read);
    }
    return configs.get(key) as ConfigRead<T>;
  };

  // The walks, memoized with their failure.
  const memo = <T>(cache: Map<string, { value: T } | { error: unknown }>, key: string, compute: () => T): T => {
    let entry = cache.get(key);
    if (entry === undefined) {
      try {
        entry = { value: compute() };
      } catch (error) {
        entry = { error };
      }
      cache.set(key, entry);
    }
    if ('error' in entry) throw entry.error;
    return entry.value;
  };
  const consistencyWalks = new Map<string, { value: readonly TransitionFinding[] } | { error: unknown }>();
  const frontmatterWalks = new Map<string, { value: readonly MemoryTransition[] } | { error: unknown }>();
  for (const [path, walk] of range.walks ?? []) frontmatterWalks.set(path, { value: walk });
  const transitions = (path: string): readonly MemoryTransition[] =>
    memo(frontmatterWalks, path, () => reconstructMemoryTransitions(root, path, { strict: true }));
  const rejectCommits = new Map<string, boolean>();

  // The commits a proper ancestor of which carries a `Carries content: ` line outside its `Reason:` block, read on the
  // first question: `--grep` finds every body holding the text, and a hit whose only such line sits in a reason is no
  // line commit ({@link linesOutsideReasonBlock}).
  let afterLine: Set<string> | undefined;
  const carriesLineBefore = (sha: string): boolean => {
    if (afterLine === undefined) {
      const found = new Set<string>();
      const hits = git(['log', '--no-show-signature', '--format=%H%x00%b%x00', '--grep=^Carries content: ', range.head]).split('\0');
      const lines: string[] = [];
      for (let index = 0; index + 2 <= hits.length; index += 2) {
        const body = hits[index + 1] as string;
        if (linesOutsideReasonBlock(body).some((line) => line.startsWith(CARRIES_LINE_PREFIX))) lines.push((hits[index] as string).trim());
      }
      lines.reverse();
      for (const line of lines) {
        if (found.has(line)) continue;
        for (const descendant of git(['rev-list', '--ancestry-path', `${line}..${range.head}`]).split('\n')) {
          if (descendant !== '') found.add(descendant);
        }
      }
      afterLine = found;
    }
    return afterLine.has(sha);
  };

  let headStatuses: Map<string, string | null> | undefined;

  return {
    head: range.head,
    history,
    commits: () => commits,
    touchedPaths: (sha) => touched.get(sha) ?? [],
    fileChanges,
    pathAtHead: (path) => {
      let at = path;
      for (let step = 0; step < forward.size && forward.has(at); step += 1) at = forward.get(at) as string;
      return at;
    },
    existsAtHead: (path) => atHead.has(path),
    blob,
    prefetch,
    memoryYamlAt: (rev) => configAt(rev, MEMORY_YAML_PATH, MemoryYaml),
    dnaYamlAt: (rev) => configAt(rev, DNA_YAML_PATH, DnaYaml),
    // The consistency walk is computed from the frontmatter walk of the same path, one walk per document (`task-378`).
    transitionFindings: (path, machine) =>
      memo(consistencyWalks, `${path}\0${JSON.stringify(machine ?? null)}`, () => transitionConsistencyFindings(transitions(path), machine)),
    transitions,
    carriesLineBefore,
    isRejectCommit: (token) => {
      let cited = rejectCommits.get(token);
      if (cited === undefined) {
        // A token that names no commit (or an ambiguous one) is git's exit 128: no citation.
        const run = runGitRead(root, ['log', '--no-show-signature', '-1', '--format=%s', `${token}^{commit}`, '--'], { accepted: [0, 128] });
        cited = run.status === 0 && parseMemoryOperation(run.stdout.trim()) === 'reject';
        rejectCommits.set(token, cited);
      }
      return cited;
    },
    headDocumentStatus: (id) => {
      if (headStatuses === undefined) {
        headStatuses = new Map();
        const memoryYaml = configAt(range.head, MEMORY_YAML_PATH, MemoryYaml);
        const documents = memoryYaml !== null && memoryYaml.ok ? loadMemoryDocumentsAtRev(root, range.head, memoryYaml.value) : [];
        for (const document of documents) {
          const documentId = document.frontmatter.id;
          if (typeof documentId !== 'string' || headStatuses.has(documentId)) continue;
          const status = document.frontmatter.status;
          headStatuses.set(documentId, typeof status === 'string' ? status : null);
        }
      }
      return headStatuses.has(id) ? (headStatuses.get(id) as string | null) : undefined;
    },
  };
}

// --- The report ----------------------------------------------------------------------------------------------------

/** The options of {@link governanceCheck}: `wingfoil verify`'s `--base` and `--introduced-at`. */
export interface GovernanceCheckOptions {
  readonly base?: string;
  readonly introducedAt?: string;
}

/** The requests `status-outside-wf` will read, so the git reader reads them in one batch (a hint, never a decision). */
function statusOutsideWfRequests(reader: HistoryReader, commits: readonly HistoryCommit[]): BlobRequest[] {
  const requests: BlobRequest[] = [];
  for (const commit of commits) {
    const parent = firstParent(commit);
    if (!isOtherCommit(commit) || parent === null) continue;
    const memoryYaml = reader.memoryYamlAt(parent);
    if (memoryYaml === null || !memoryYaml.ok) continue;
    const inRoots = contentRootTest(memoryYaml.value);
    for (const change of reader.fileChanges(commit.sha)) {
      if (change.to === null || !(inRoots(change.from) || inRoots(change.to))) continue;
      if (change.from !== null) requests.push({ rev: parent, path: change.from });
      requests.push({ rev: commit.sha, path: change.to });
    }
  }
  return requests;
}

/** `items` with only the first item of each `key` kept, in their order. */
function firstOfEach<T>(items: readonly T[], key: (item: T) => string): T[] {
  const unique = new Map<string, T>();
  for (const item of items) if (!unique.has(key(item))) unique.set(key(item), item);
  return [...unique.values()];
}

/**
 * §3's order of the findings of one commit, as a comparator over `findings` (listed in the order written): by category,
 * a `trailer-paragraph` finding after the other `body` findings and among them in the order written, the others by
 * message.
 */
function commitFindingOrder<T extends CheckFinding>(findings: readonly T[]): (a: T, b: T) => number {
  const written = new Map(findings.map((finding, index) => [finding, index]));
  const isTrailer = (finding: T): number => (finding.check === 'trailer-paragraph' ? 1 : 0);
  return (a, b) =>
    RULES.indexOf(a.rule) - RULES.indexOf(b.rule) ||
    isTrailer(a) - isTrailer(b) ||
    (isTrailer(a) === 1 ? (written.get(a) as number) - (written.get(b) as number) : a.message < b.message ? -1 : a.message > b.message ? 1 : 0);
}

/**
 * Judge every commit `reader` lists with every check, and assemble `spec-020` §7's report: findings de-duplicated by
 * commit, category and message (the first kept), sorted by commit order, category and message — a commit's
 * `trailer-paragraph` findings after its other `body` findings in the order written (§3); `gated` iff the commit is not
 * in `history` (§5.1).
 *
 * @param reader - The range's history.
 * @param range - What the report names: the resolved `base` and `introducedAt` (`null` when not given).
 * @param history - The commits whose findings are history: `introducedAt` and its ancestors.
 */
export function buildGovernanceReport(
  reader: HistoryReader,
  range: { readonly base: string | null; readonly introducedAt: string | null },
  history: ReadonlySet<string>,
): GovernanceReport {
  const commits = reader.commits();
  const order = new Map(commits.map((commit, index) => [commit.sha, index]));
  const collected: GovernanceFinding[] = [];
  const stateUnchecked: StateUncheckedEntry[] = [];
  for (const commit of commits) {
    const gated = !history.has(commit.sha);
    for (const check of CHECK_FUNCTIONS) {
      const result = check(commit, reader, { gated });
      for (const { rule, check: name, message } of result.findings) collected.push({ sha: commit.sha, subject: commit.subject, rule, check: name, message, gated });
      for (const reason of result.stateUnchecked) stateUnchecked.push({ sha: commit.sha, subject: commit.subject, reason });
    }
  }

  const deduplicated = firstOfEach(collected, (finding) => `${finding.sha}\0${finding.rule}\0${finding.message}`);
  const withinCommit = commitFindingOrder(deduplicated);
  const findings = deduplicated.sort((a, b) => (order.get(a.sha) as number) - (order.get(b.sha) as number) || withinCommit(a, b));

  return {
    head: reader.head,
    base: range.base,
    introducedAt: range.introducedAt,
    checks: GOVERNANCE_CHECKS.map((entry) => ({ check: entry.check, rule: entry.rule, since: entry.since })),
    commits: {
      range: commits.length,
      memory: commits.filter(isMemoryCommit).length,
      other: commits.filter(isOtherCommit).length,
      gated: commits.filter((commit) => !history.has(commit.sha)).length,
    },
    findings,
    stateUnchecked,
    verdict: findings.some((finding) => finding.gated) ? 'fail' : 'pass',
  };
}

/**
 * `wingfoil verify`'s run over the repository at `root` (`spec-020` §4.13): resolve `HEAD`, `--base` and
 * `--introduced-at` (`resolveRevision`), read the range through {@link createGitHistoryReader} and assemble the report
 * ({@link buildGovernanceReport}). It writes nothing and reads neither the working tree nor the index.
 *
 * @param root - The repository.
 * @param options - `--base` and `--introduced-at`, each a revision naming one commit.
 * @throws `RevisionError` when a revision is malformed or names no commit; `StorageError` when git cannot answer.
 */
export function governanceCheck(root: string, options: GovernanceCheckOptions = {}): GovernanceReport {
  const head = resolveRevision(root, 'HEAD');
  const base = options.base === undefined ? undefined : resolveRevision(root, options.base);
  const introducedAt = options.introducedAt === undefined ? undefined : resolveRevision(root, options.introducedAt);
  const reader = createGitHistoryReader(root, { head, ...(base === undefined ? {} : { base }), ...(introducedAt === undefined ? {} : { introducedAt }) });
  reader.prefetch(statusOutsideWfRequests(reader, reader.commits()));
  return buildGovernanceReport(reader, { base: base ?? null, introducedAt: introducedAt ?? null }, reader.history);
}

/** One commit `memory history` lists for an element: its sha, and the element's path there and at its first parent. */
export interface UnverifiedEntry {
  readonly sha: string;
  readonly path: string;
  readonly parentPath: string | null;
}

/** The element whose history {@link unverifiedFindings} marks. */
export interface UnverifiedElement {
  /** The full sha of `HEAD`; resolved from the repository when absent. */
  readonly head?: string;
  /** The element's document, at `HEAD`. */
  readonly path: string;
  /** The commits `memory history` lists, oldest first. */
  readonly entries: readonly UnverifiedEntry[];
  /** The frontmatter walk `memory history` read at `path` (`reconstructMemoryTransitions`), reused when no revision of it is unreadable. */
  readonly walk?: readonly MemoryTransition[];
}

/**
 * `memory history`'s unverified mark (`spec-020` §4.13, `task-378`, `bug-496`): every check of §4 run with
 * `gated: true` on each commit the element's history lists, through the git reader created for those commits
 * ({@link GitHistoryRange.commits}) and limited, within each commit, to the element's own document
 * ({@link GitHistoryRange.paths}); the history's walk answers the element's frontmatter walk. The answer maps each sha
 * whose commit the checks flag to its findings, de-duplicated by category and message and ordered as §3 orders one
 * commit's; a sha with none is absent, and a `stateUnchecked` reason is not a mark. Map order: the entries' order.
 *
 * @throws `StorageError` when git cannot answer.
 */
export function unverifiedFindings(root: string, element: UnverifiedElement): ReadonlyMap<string, readonly CheckFinding[]> {
  const marks = new Map<string, readonly CheckFinding[]>();
  if (element.entries.length === 0) return marks;
  const head = element.head ?? resolveRevision(root, 'HEAD');
  const paths = new Map<string, string[]>();
  for (const entry of element.entries) {
    const list = paths.get(entry.sha) ?? [];
    for (const path of [entry.path, entry.parentPath]) if (path !== null && !list.includes(path)) list.push(path);
    paths.set(entry.sha, list);
  }
  const walk = element.walk;
  const reader = createGitHistoryReader(root, {
    head,
    commits: [...paths.keys()],
    paths,
    ...(walk !== undefined && walk.every((transition) => transition.unreadable === undefined) ? { walks: new Map([[element.path, walk]]) } : {}),
  });
  reader.prefetch(statusOutsideWfRequests(reader, reader.commits()));
  for (const commit of reader.commits()) {
    const collected = CHECK_FUNCTIONS.flatMap((check) => check(commit, reader, { gated: true }).findings.map(({ rule, check: name, message }): CheckFinding => ({ rule, check: name, message })));
    const findings = firstOfEach(collected, (finding) => `${finding.rule}\0${finding.message}`);
    if (findings.length === 0) continue;
    marks.set(commit.sha, findings.sort(commitFindingOrder(findings)));
  }
  return marks;
}

/** `rule count, …` of `findings`, in §3's category order, the categories with none left out. */
function countByRule(findings: readonly GovernanceFinding[]): string {
  return RULES.map((rule): [string, number] => [rule, findings.filter((finding) => finding.rule === rule).length])
    .filter(([, count]) => count > 0)
    .map(([rule, count]) => `${rule} ${count}`)
    .join(', ');
}

/** The number of distinct commits `entries` name. */
const commitCount = (entries: readonly { readonly sha: string }[]): number => new Set(entries.map((entry) => entry.sha)).size;

/**
 * The reason of a failing run (`spec-020` §8.2), printed as the `error:` line after the report:
 * `E_VERIFY_FINDINGS: <n> findings on <m> commits fail the governance check (<rule> <count>, …)`, gated findings only.
 */
export function verifyFindingsMessage(report: GovernanceReport): string {
  const gated = report.findings.filter((finding) => finding.gated);
  return `E_VERIFY_FINDINGS: ${gated.length} findings on ${commitCount(gated)} commits fail the governance check (${countByRule(gated)})`;
}

/**
 * The console form of the report (`spec-020` §7): the header, the `checks:` line, the `FAIL — gated:` and
 * `history — reported, not failing:` blocks (each omitted when empty) and the three summary lines, ending with a
 * newline.
 */
export function renderVerifyConsole(report: GovernanceReport): string {
  const gated = report.findings.filter((finding) => finding.gated);
  const history = report.findings.filter((finding) => !finding.gated);
  const range = report.base === null ? 'HEAD' : `${report.base}..HEAD`;
  const introduction = report.introducedAt === null ? 'every commit gated' : `introduced at ${report.introducedAt}`;
  const lines = [
    `wingfoil verify: ${report.commits.memory} wf() commits and ${report.commits.other} other commits in ${range} (${report.commits.gated} gated; ${introduction})`,
    `checks: ${report.checks.map((entry) => `${entry.check} ${entry.since}`).join(', ')}`,
  ];
  const line = (finding: GovernanceFinding): string => `  ${finding.sha} ${finding.rule}/${finding.check}: ${finding.message}\n      ${finding.subject}`;
  if (gated.length > 0) lines.push('FAIL — gated:', ...gated.map(line));
  if (history.length > 0) lines.push('history — reported, not failing:', ...history.map(line));
  // bug-438: each count says what it counts, and a line with no entry drops its commit count and its count list.
  const summary = (findings: readonly GovernanceFinding[]): string =>
    findings.length === 0 ? '0 findings' : `${findings.length} findings on ${commitCount(findings)} commits with a finding (${countByRule(findings)})`;
  const unchecked = report.stateUnchecked.length;
  lines.push(
    `gated: ${summary(gated)}`,
    `history: ${summary(history)}`,
    `state not checked: ${unchecked === 0 ? '0 entries' : `${unchecked} entries on ${commitCount(report.stateUnchecked)} commits with an entry`} ` +
      '(history with no machine, no named document, a document gone at HEAD, or a revision that does not parse or is in a newer format)',
  );
  return `${lines.join('\n')}\n`;
}
