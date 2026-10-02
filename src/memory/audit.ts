/**
 * Audit-trail verification & reconstruction (task-015-complete-audit-trail, REQ-SEC-02) — the
 * READ/verify half of "every state change is a git commit with author + timestamp" (ADR-001,
 * ADR-007): git history is the *only* audit trail (no secondary `.wingfoil/state/` log), so this
 * module audits and reconstructs that trail directly from `git log`/`git show`, never from a value
 * written into file content. It builds on task-011's {@link getMemoryHistory} (the raw commit walk)
 * rather than re-implementing it.
 *
 * This module deliberately does **not** enforce attribution at write time (checking that a commit
 * *can* be made) — that precondition belongs to task-014-git-identity-required (REQ-SEC-01,
 * `requireGitIdentity` in `src/core/git-identity.ts`). This module only ever reads commits that
 * already exist and reports on them; nothing here blocks or gates a write. The base "non-empty
 * name and non-empty email" rule the two share lives in exactly one place — the
 * `isConfiguredIdentity` predicate exported by `src/core/git-identity.ts` — which
 * {@link isValidAttribution} below consumes rather than re-deriving; see that function's
 * doc-comment for the read-only augmentations it layers on top for historical commits.
 *
 * REQ-SEC-02's fit criterion, mapped to the functions below:
 *
 * - "`git log` verification ... shows author + timestamp for every change with 0 'unknown
 *   author'" -> {@link auditAttribution} / {@link isValidAttribution}.
 * - Commit timestamp (never file content) supplies the ISO-8601 date -> already true of
 *   `getMemoryHistory`'s `date` field (`%aI`, sourced from git itself); this module never re-derives
 *   a timestamp from anywhere else.
 * - "`approve`/`reject` commits carry an explicit `Approver:`/`Reason:` line" ->
 *   {@link parseApprovalMetadata}.
 * - "`memory history <id>` lists each transition ... author, timestamp, and reason" ->
 *   {@link reconstructMemoryTransitions}.
 * - "Recomputing an element's state at any historical commit ... agrees with the transition history
 *   derived from git log ... no drift" -> {@link verifyTransitionConsistency}.
 */
import { isConfiguredIdentity } from '../core';
import { parseYaml } from '../validation';

import { parseApproverTrailerLine, parseReasonBlock } from './commit-message';
import { getMemoryHistory } from './history';
import { RESERVED_TYPE_NAMES, type StateMachine } from './schema';
import { isMachineEdge } from './state-machine';
import { walkGitLogFields } from './git-log';
import { runGitRead, splitFrontmatter } from '../storage';

// --- Attribution audit -----------------------------------------------------------------------

/** One commit's attribution, as audited against `pathspecs` (REQ-SEC-02's "0 unknown author"). */
export interface AttributionEntry {
  readonly sha: string;
  readonly authorName: string;
  readonly authorEmail: string;
  /** ISO-8601 author date (`git log --format=%aI`) — sourced from git, never file content. */
  readonly date: string;
  readonly subject: string;
  /** Whether this commit's author identity is non-empty and not a git-guessed placeholder. */
  readonly valid: boolean;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@()]+$/;
// The literal marker git itself appends to an author email when it falls back to a guessed identity
// (user@hostname) and cannot determine a real domain — e.g. "root@buildhost.(none)". A commit
// carrying this is not a deliberately-configured identity, so it counts as "unknown author".
const GIT_GUESSED_DOMAIN_MARKER = '.(none)';
// RFC 2606 §2 reserves these four top-level domains for testing, documentation, invalid addresses and
// loopback. No mailbox exists under them, so an author on one is a placeholder — the same class of
// "not a deliberately-configured identity" as git's guessed-domain marker (task-132, bug-153).
const RFC2606_RESERVED_TLDS: readonly string[] = ['invalid', 'example', 'test', 'localhost'];

/** Whether `email`'s domain is, or ends in, an RFC 2606 reserved top-level domain (case-insensitive). */
function hasReservedDomain(email: string): boolean {
  // A trailing dot is the fully-qualified spelling of the same domain (`foo.test.` is `foo.test`).
  const domain = email.slice(email.lastIndexOf('@') + 1).toLowerCase().replace(/\.+$/, '');
  const tld = domain.slice(domain.lastIndexOf('.') + 1);
  return RFC2606_RESERVED_TLDS.includes(tld);
}

/**
 * Whether `name`/`email` look like a real, deliberately-configured git identity rather than an
 * empty or git-guessed placeholder, as recorded on a *historical* commit. The base check — non-empty
 * `name` AND non-empty `email` — is NOT re-derived here: it delegates to
 * {@link isConfiguredIdentity} from `src/core/git-identity.ts`, the single source of truth also used
 * by `requireGitIdentity`'s write-time precondition (REQ-SEC-01). On top of that shared base, this
 * audit (REQ-SEC-02) layers three read-only augmentations that only make sense when inspecting
 * *historical* commits rather than live config — `requireGitIdentity` has no need for either, because
 * it only ever looks at the identity a caller is about to write with:
 *
 *  - Rejects the `GIT_GUESSED_DOMAIN_MARKER` (`.(none)`): git appends this to an author email when it
 *    fell back to a guessed identity at commit time. `requireGitIdentity` now PREVENTS this going
 *    forward (task-014), but older history predating that guard can still carry it, so the read audit
 *    must flag it — it is a legacy-history concern, not part of the live write-time rule.
 *  - Rejects a non-empty-but-malformed email (`EMAIL_RE`): `requireGitIdentity` never needs this check
 *    because it only reads a git config value (itself always syntactically well-formed or absent);
 *    historical commit authors, however, can carry hand-edited or otherwise malformed values, so the
 *    audit validates the shape too.
 *  - Rejects an email on an RFC 2606 reserved top-level domain (`.invalid`, `.example`, `.test`,
 *    `.localhost`; task-132, `bug-153`): such an address names no mailbox, so a commit carrying it is
 *    as unattributed as one carrying `.(none)`. Only the top-level label counts — `test.example.com`
 *    is an ordinary domain. The write-time check does not apply this rule: test fixtures and scratch
 *    repositories commit under these domains on purpose, and the audit is where they must show up.
 *
 * Pure predicate — no filesystem/git access.
 */
export function isValidAttribution(name: string, email: string): boolean {
  const trimmedName = name.trim();
  const trimmedEmail = email.trim();
  if (!isConfiguredIdentity(trimmedName, trimmedEmail)) return false;
  if (trimmedEmail.includes(GIT_GUESSED_DOMAIN_MARKER)) return false;
  if (!EMAIL_RE.test(trimmedEmail)) return false;
  return !hasReservedDomain(trimmedEmail);
}

const AUDIT_LOG_FIELDS = ['%H', '%an', '%ae', '%aI', '%s'];

/**
 * Walk every commit touching any of `pathspecs` under `root`, oldest first, annotated with whether
 * its author attribution is valid ({@link isValidAttribution}) — the audit primitive behind
 * REQ-SEC-02's "0 'unknown author'" fit criterion. `pathspecs` is sorted before being passed to git
 * so the invocation itself is deterministic regardless of caller-supplied order (REQ-SYS-07); a
 * commit touching more than one of the given pathspecs still appears exactly once (git's own log
 * de-duplicates by commit, not by path). Returns `[]` when none of `pathspecs` has any history,
 * mirroring {@link getMemoryHistory}; a git read that fails throws `StorageError`
 * `E_GIT_READ_FAILED` rather than passing for a clean, empty audit (task-142, `bug-072`).
 */
export function auditAttribution(root: string, pathspecs: readonly string[]): AttributionEntry[] {
  const sortedPathspecs = [...pathspecs].sort();
  const records = walkGitLogFields(root, AUDIT_LOG_FIELDS, sortedPathspecs);

  return records.map(([sha = '', authorName = '', authorEmail = '', date = '', subject = '']) => ({
    sha,
    authorName,
    authorEmail,
    date,
    subject,
    valid: isValidAttribution(authorName, authorEmail),
  }));
}

// --- Approver/Reason parsing (CLAUDE.md §5.1) ------------------------------------------------

/** Parsed `Approver:`/`Reason:` lines from an `approve`/`reject` commit body (CLAUDE.md §5.1). */
export interface ApprovalMetadata {
  readonly approverName: string;
  readonly approverEmail: string;
  readonly approverRole: string;
  /**
   * The `Reason:` block this commit records, or `null` when it records none that can be read
   * (`dl-067-reason-trailer-contract` clause 6). Widened from `string` by
   * `task-072-fix-reason-trailer-contract`: an unreadable reason must not take a successfully parsed
   * approver identity down with it, and `MemoryTransition.reason` was already `string | null`.
   */
  readonly reason: string | null;
}

/**
 * The identity on an `Approver:` trailer line. Applied to that ONE line — located by
 * {@link parseApproverTrailerLine}, which anchors it to the body's first — rather than searched for
 * anywhere in the body with `/m`, so a second `Approver:` line sitting inside some reason's text can
 * never be read as an approval record (`dl-067` clause 5; bug-042 F3).
 */
const APPROVER_LINE_RE = /^Approver:\s*(.+?)\s*<([^>]+)>\s*\(([^)]+)\)\s*$/;

/**
 * The `Reason:` a commit body records, on its own — `null` when the body has none (a plain
 * `add`/`submit` body, which carries no trailer by convention), or carries a bare `Reason:` with no
 * value. Split out of {@link parseApprovalMetadata} by `task-049-memory-history` (P1.10) because the
 * two trailers do not always travel together: an APPROVAL-gate commit (`approve`/`reject`) must carry
 * both `Approver:` and `Reason:` (CLAUDE.md §5.1, P1.7), but a `deprecate` commit records a `Reason:`
 * with **no** `Approver:` line at all — deprecate is explicitly not an approval gate. Reading the
 * reason through `parseApprovalMetadata` would therefore drop every deprecate reason from the audit
 * trail it exists to surface.
 *
 * The reason's extent is NOT decided here: this is a thin alias over `parseReasonBlock`
 * (`./commit-message.ts`), the module that also writes the trailer — one grammar, consumed by both
 * sides, which is `dl-067-reason-trailer-contract` clause 5 and the property that module's doc has
 * claimed for itself since `task-045-memory-submit`.
 *
 * The limitation this function used to document — "a hypothetical multi-paragraph reason would be
 * silently truncated to its first line here" — is gone with the defect
 * (`bug-042-reason-text-has-no-contract-against-commit-trailer`, F1). It was never hypothetical: 79 of
 * `main`'s 171 approve/reject commits carry a reason continuing past line one, and the reader kept as
 * little as 2% of one (dl-067 E1/E2).
 */
export function parseCommitReason(body: string): string | null {
  return parseReasonBlock(body);
}

/**
 * Parse a commit body for the `Approver: Name <email> (role)` and `Reason: ...` trailers
 * (CLAUDE.md §5.1; REQ-SEC-02/REQ-SEC-04). Returns `null` when there is no `Approver:` trailer line —
 * e.g. for a plain `add`/`submit` body, or a `deprecate` one (not an approval gate), neither of which
 * records an approval at all. A caller that wants such a commit's reason wants
 * {@link parseCommitReason} instead.
 *
 * All-or-nothing on the APPROVER, and only on the approver (`dl-067` clause 6,
 * `task-072-fix-reason-trailer-contract`). It used to be all-or-nothing in both directions, so an
 * unreadable `Reason:` discarded the identity this function had already parsed successfully — and
 * since an empty `--reason` was accepted at exit `0` and git's cleanup turned it into a bare
 * `Reason:`, `wingfoil memory history` could report an approval gate crossed by nobody, for no reason
 * (bug-042 F2). Now the record degrades instead of vanishing: the approver stands, `reason` reads
 * `null`. Nothing on `main` reads differently for it — no commit there has a bare `Reason:` or is
 * missing a trailer line (dl-067 E6) — so this is protection for bodies written before the fix.
 */
export function parseApprovalMetadata(body: string): ApprovalMetadata | null {
  const approverLine = parseApproverTrailerLine(body);
  const approverMatch = approverLine === null ? null : APPROVER_LINE_RE.exec(approverLine);
  if (!approverMatch) return null;

  const [, approverName = '', approverEmail = '', approverRole = ''] = approverMatch;
  return { approverName, approverEmail, approverRole, reason: parseCommitReason(body) };
}

// --- Full transition reconstruction (`memory history`, P1.10) --------------------------------

/**
 * The closed, declared list of Memory operation verbs a `wf({type}): {verb} …` subject may carry
 * (`dl-079` (A), `spec-008-cli-grammar` §2, `spec-003` verb table): the five CLI verbs, the three
 * workflow verbs of practice (`start`, `finalize`, `sync`), `amend` (`dl-108`), `park` (`dl-110`),
 * and `assign` (`element.set_release`, approver ruling 2026-10-01). No other verb is a Memory
 * operation. Ordered as `spec-008` §2 lists them (REQ-SYS-07).
 */
export const MEMORY_OPERATIONS = [
  'add',
  'submit',
  'approve',
  'reject',
  'deprecate',
  'start',
  'finalize',
  'sync',
  'amend',
  'park',
  'assign',
] as const;

/** One verb of {@link MEMORY_OPERATIONS}. */
export type MemoryOperation = (typeof MEMORY_OPERATIONS)[number];

/**
 * The `wf({scope})` scopes that record a change to **configuration**, not to a Memory element
 * (`spec-008` §2): `wf(dna): set|add|update|remove …` (`dna` mutations), `wf(directive):
 * create|assign|remove …` and `wf(workflow): create|remove …` (`spec-017` §7.7–7.8). Their verbs are
 * not Memory operations even where the token coincides with one (`wf(dna): add <field>`), and their
 * subjects carry no transition. No `memory.yaml` type may take one of these names: this list is the
 * schema's {@link RESERVED_TYPE_NAMES} (`spec-001`, `bug-177`), which `MemoryYaml` refuses at load time,
 * because a type that took one would have every commit of its own read as configuration.
 */
export const CONFIGURATION_SCOPES: readonly string[] = RESERVED_TYPE_NAMES;

/**
 * A `wf({scope}): {token}` subject: the scope, and the verb token — everything after `: ` up to the
 * first whitespace. Taking the whole token, rather than a declared verb followed by a word boundary,
 * is what keeps a practised compound verb such as `start-fix` from reading as `start`.
 */
const WF_SUBJECT_RE = /^wf\(([^)]*)\):\s*(\S+)/;

/**
 * `assign`'s one canonical subject (`spec-008` §2): `wf({type}): assign release {version} to {id1},
 * {id2}…`, with no bracket — the form the four practised `assign` commits already have. `assign` writes
 * only the `release` field, so a subject that names anything else, or carries a bracket, is not one.
 */
const ASSIGN_SUBJECT_RE = /^wf\([^)]*\):\s*assign release \S+ to [^[\]\s][^[\]]*$/;

/**
 * The Memory operation a commit subject declares, or `null` — for a subject outside the `wf()`
 * grammar (`workflow: finalize …`, `agent: record …`, `docs(…): …`), a configuration scope
 * ({@link CONFIGURATION_SCOPES}), or a verb outside {@link MEMORY_OPERATIONS}. The practised verbs the
 * declared list leaves out (`start-fix`, `schedule`, `plan`, `enter-releasing`, `mark-released`,
 * `deferred`, and the early verbless `wf(task): {id} [a → b]`), and an `assign` subject outside its
 * canonical form, keep reading as `null`: the
 * history is not rewritten, and the reader does not guess (`dl-035`, `dl-079`).
 */
export function parseMemoryOperation(subject: string): MemoryOperation | null {
  const match = WF_SUBJECT_RE.exec(subject);
  if (!match) return null;
  // Both groups always participate in a match of WF_SUBJECT_RE.
  const scope = match[1]!;
  const verb = match[2]!;
  if (CONFIGURATION_SCOPES.includes(scope)) return null;
  if (verb === 'assign' && !ASSIGN_SUBJECT_RE.test(subject)) return null;
  return (MEMORY_OPERATIONS as readonly string[]).includes(verb) ? (verb as MemoryOperation) : null;
}

/**
 * One reconstructed transition in a Memory element's history — author/timestamp from git itself,
 * `fromState`/`toState` derived from the document's own frontmatter `status:` field at that commit
 * (ADR-007: state lives in frontmatter, not the commit message), and `approval` parsed from the
 * commit body when present. `fromState` is `null` only for the element's first commit (creation —
 * there is no prior state to name).
 */
export interface MemoryTransition {
  readonly sha: string;
  readonly authorName: string;
  readonly authorEmail: string;
  readonly date: string;
  readonly subject: string;
  readonly operation: MemoryOperation | null;
  readonly fromState: string | null;
  readonly toState: string | null;
  readonly approval: ApprovalMetadata | null;
  /**
   * The `Reason:` this commit's body records, read INDEPENDENTLY of `Approver:`
   * ({@link parseCommitReason}) — `null` when the body records none. Deliberately not the same field
   * as `approval.reason`: `approval` is `null` for a `deprecate` commit (it has no `Approver:` line),
   * yet such a commit does record a reason, and `wingfoil memory history` (P1.10) must surface it.
   * When `approval` is non-null the two always agree, by construction.
   */
  readonly reason: string | null;
}

/** The exit status of `git show <sha>:<path>` for a path that commit does not hold (`fatal:`). */
const GIT_FATAL = 128;

/**
 * Read `historicalPath`'s frontmatter `status:` field as it existed at `sha` (`git show sha:path`),
 * without validating it against any type's Zod schema — this is a historical-snapshot read, not a
 * live document validation. Returns `null` if the path didn't exist at `sha`, has no frontmatter
 * block, or the frontmatter has no string `status` field.
 *
 * `historicalPath` is the path the element occupied **at that commit** — `MemoryHistoryEntry.path`,
 * produced by the same `--follow` walk that selected the commit — never the caller's current path.
 * Passing the current one was `bug-080-read-status-at-reads-the-current-path-at-pre-rename-commits`:
 * every commit older than a rename asked git for a path that tree does not contain, the read failed,
 * and the transition reported `null` states. `dl-080` — a read that gates an operation resolves at
 * `HEAD` — does not reach here: this read gates nothing, and its subject is by construction *other*
 * commits.
 *
 * The read goes through `runGitRead` (`src/storage/git-read.ts`, task-142), so git's stderr lands in
 * a pipe this process owns rather than on the operator's terminal
 * (`bug-071-read-status-at-leaks-git-stderr`). Exit `128` is taken as "no document at this commit"
 * and answers `null`, and git's text is then discarded: that is the legitimate case — a commit
 * before the element's creation or after a deletion — but git uses the same exit status for an
 * object it cannot read, so this read cannot tell the two apart, and does not try (`bug-097`). What
 * catches a broken walk is the walk itself: `getMemoryHistory` throws when its own `git log` fails,
 * and `dropPreCreationAncestry` when the creation probe and the walk disagree (`task-089`). Any other
 * failure — git that cannot be spawned, an answer past the read buffer — throws `StorageError`
 * `E_GIT_READ_FAILED`.
 */
function readStatusAt(root: string, sha: string, historicalPath: string): string | null {
  const run = runGitRead(root, ['show', `${sha}:${historicalPath}`], { accepted: [0, GIT_FATAL] });
  if (run.status === GIT_FATAL) return null;
  const raw = run.stdout;

  const { frontmatter } = splitFrontmatter(raw);
  if (!frontmatter) return null;

  const parsed = parseYaml(frontmatter, `${historicalPath}@${sha}`);
  if (parsed === null || typeof parsed !== 'object') return null;

  const status = (parsed as Record<string, unknown>).status;
  return typeof status === 'string' ? status : null;
}

/**
 * Reconstruct every transition `relativePath` went through, oldest first, entirely from git log
 * (`getMemoryHistory`) plus a frontmatter read at each commit (`git show`) — no separate log file
 * (ADR-007). This is the derivation `wingfoil memory history` (P1.10) renders — `src/core`'s
 * `memoryHistory` operation (`task-049-memory-history`) renames and string-formats these fields into
 * its own entry shape, deriving no further state of its own; this function is the reconstruction
 * itself, not that command's output formatting.
 *
 * **Renames are followed on both halves of the derivation**, which is the correction
 * `task-097-memory-history-reads-each-commit-at-its-historical-path` made. `getMemoryHistory` always
 * walked with `git log --follow`, so it *found* the commits preceding a rename; `readStatusAt` then
 * read each of them at the CURRENT path, which those trees do not contain, so all of them reported
 * `null` states (`bug-080-…`). The walk now carries the path each commit actually used
 * (`MemoryHistoryEntry.path`, from `--follow --name-status`) and this function reads at that path —
 * the walk is the source of truth for "where was this file at this commit", and the read no longer
 * guesses.
 *
 * This was never the hypothetical the TSDoc here used to call "a documented edge case, not a live
 * defect": the Memory folder's `planning/v1/*` became `planning/rl-v1/*` in a single commit,
 * moving five `release` elements at once, precisely BECAUSE the `release` type's `path` pattern
 * interpolates a component — the release-line id — that itself changed. Any edit to a `path`
 * pattern, or to an id one interpolates, renames documents.
 *
 * `toState` is still `null` where a commit in the walk genuinely has no document to read — before
 * the element's creation, or after a deletion. That is a legitimate answer, distinct from the defect
 * above, and it no longer arrives with a `fatal:` on the operator's stderr (`bug-071`; see
 * {@link readStatusAt}).
 */
export function reconstructMemoryTransitions(root: string, relativePath: string): MemoryTransition[] {
  const history = getMemoryHistory(root, relativePath); // oldest first already

  const transitions: MemoryTransition[] = [];
  let previousState: string | null = null;
  for (const entry of history) {
    const toState = readStatusAt(root, entry.sha, entry.path);
    transitions.push({
      sha: entry.sha,
      authorName: entry.authorName,
      authorEmail: entry.authorEmail,
      date: entry.date,
      subject: entry.subject,
      operation: parseMemoryOperation(entry.subject),
      fromState: previousState,
      toState,
      approval: parseApprovalMetadata(entry.body),
      reason: parseCommitReason(entry.body),
    });
    previousState = toState;
  }
  return transitions;
}

// --- Frontmatter-vs-commit-message consistency (no drift) -----------------------------------

/**
 * One disagreement between the commit subject's `[old → new]` bracket and the frontmatter actually
 * committed. For a chained bracket `[a → b → c]`, `declared` is its first and last state.
 */
export interface ConsistencyMismatch {
  readonly kind: 'mismatch';
  readonly sha: string;
  readonly subject: string;
  readonly declared: { readonly from: string; readonly to: string };
  readonly derived: { readonly from: string | null; readonly to: string | null };
}

/**
 * A `wf(…)` commit subject that carries a bracket (a `[` or a `]`) which reads as a transition in
 * neither arrow form — an unknown arrow (`[triaged => planned]`), an unbalanced bracket, a bracket with
 * no from-state, an empty state anywhere in a chain, or a trailing bracket that is not a transition.
 * It is reported rather than skipped so that an empty result from {@link verifyTransitionConsistency}
 * means "checked", never "passed over" (`task-109`, `bug-137`).
 */
export interface UnparseableTransition {
  readonly kind: 'unparseable';
  readonly sha: string;
  readonly subject: string;
}

/**
 * One hop of a chained bracket (`[a → b → c]`) that is not an edge of the element type's state machine
 * ({@link isMachineEdge}) — reported by {@link verifyTransitionConsistency} when it is given that
 * machine (`task-126`, `bug-155`). A chain with two illegal hops yields two findings, in hop order.
 */
export interface IllegalHop {
  readonly kind: 'illegal-hop';
  readonly sha: string;
  readonly subject: string;
  readonly hop: { readonly from: string; readonly to: string };
}

/** One finding of {@link verifyTransitionConsistency}, discriminated by `kind`. */
export type TransitionFinding = ConsistencyMismatch | UnparseableTransition | IllegalHop;

// The trailing `[…]` bracket of a subject — the transition bracket `spec-008` §2 declares, written at
// the end of the subject. Its content is split into states by {@link BRACKET_ARROW_RE}.
const TRAILING_BRACKET_RE = /\[([^[\]]*)\]\s*$/;

// The arrows a bracket's states are separated by: the canonical U+2192, which `./commit-message.ts`
// writes, and the ASCII `->`, read as its equivalent because hand-written history carries it
// (`bug-137`). Surrounding whitespace belongs to the arrow.
const BRACKET_ARROW_RE = /\s*(?:→|->)\s*/;

// A subject in the Memory commit grammar (`wf({type}): …`) that contains any bracket character — the
// set of subjects whose trailing bracket must either parse as a transition or be reported as
// unparseable.
const WF_SUBJECT_WITH_BRACKET_RE = /^wf\([^)]*\):.*[[\]]/;

/** One hop of a transition bracket: `[a → b]` has one, the chain `[a → b → c]` has two. */
export interface BracketHop {
  readonly from: string;
  readonly to: string;
}

/**
 * The hops a subject's trailing bracket names, in order — one for `[a → b]`, more for a chain
 * (`[a → b → c]`, `spec-008` §2: `sync` may chain) — or `null` when there is no trailing bracket, or
 * it is not a transition: fewer than two states, or an empty one anywhere. Never an empty array.
 * Exported for the governance check (`scripts/check-governance.cjs`, `task-167`), which judges a
 * single hop against the machine where {@link verifyTransitionConsistency} judges only a chain's.
 */
export function parseBracketHops(subject: string): BracketHop[] | null {
  const match = TRAILING_BRACKET_RE.exec(subject);
  if (!match) return null;
  // The group always participates in a match of TRAILING_BRACKET_RE.
  const states = match[1]!.split(BRACKET_ARROW_RE).map((state) => state.trim());
  if (states.length < 2 || states.some((state) => state === '')) return null;
  return states.slice(1).map((to, index) => ({ from: states[index]!, to }));
}

/**
 * Cross-check, for every transition that carries a `[old → new]` bracket in its subject, that the
 * bracket's declared states agree with the states independently derived from the document's own
 * frontmatter at that commit ({@link reconstructMemoryTransitions}). A plain `add`/`submit` subject has
 * no bracket and is skipped; so is every subject of a configuration scope
 * ({@link CONFIGURATION_SCOPES}), which records no Memory transition.
 *
 * The bracket is read in either arrow form, `→` or `->`, with the same result, and may **chain**
 * states (`spec-008` §2, `dl-079` (A)): `[a → b → c]` is declared from `a`, to `c` — the only two states
 * the frontmatter can confirm — and, when `machine` (the element type's state machine, resolved by the
 * caller from `memory.yaml`, REQ-STATE-08) is given, every hop of the chain must be an edge of it
 * ({@link isMachineEdge}), or it is an {@link IllegalHop}. Without `machine` the hops cannot be judged
 * and are not: the endpoints are still checked. A single-hop bracket's edge is not re-judged here — it
 * is the write-time engine's to refuse (REQ-STATE-01), and `amend`'s `[s → s]` is a declared self-loop
 * no machine contains.
 *
 * A `wf(…)` subject that carries a bracket readable in neither form is reported as an
 * {@link UnparseableTransition} instead of being passed over; a subject outside the `wf(…)` grammar
 * that merely quotes a bracket in prose is not. Returns `[]` when every bracketed transition was parsed
 * and agrees — REQ-SEC-02/REQ-STATE-02's "no drift between the two views"; any entry is either a
 * genuine inconsistency (e.g. a hand-edited commit message that doesn't match what was actually written
 * to disk), a chain through a non-edge, or a bracket the check could not read.
 */
export function verifyTransitionConsistency(
  root: string,
  relativePath: string,
  machine?: StateMachine,
): TransitionFinding[] {
  const transitions = reconstructMemoryTransitions(root, relativePath);
  const findings: TransitionFinding[] = [];

  for (const transition of transitions) {
    const { sha, subject } = transition;
    const scope = WF_SUBJECT_RE.exec(subject)?.[1];
    if (scope !== undefined && CONFIGURATION_SCOPES.includes(scope)) continue;

    const hops = parseBracketHops(subject);
    if (!hops) {
      if (WF_SUBJECT_WITH_BRACKET_RE.test(subject)) {
        findings.push({ kind: 'unparseable', sha, subject });
      }
      continue;
    }

    // parseBracketHops never returns an empty array.
    const declaredFrom = hops[0]!.from;
    const declaredTo = hops[hops.length - 1]!.to;
    if (declaredFrom !== transition.fromState || declaredTo !== transition.toState) {
      findings.push({
        kind: 'mismatch',
        sha,
        subject,
        declared: { from: declaredFrom, to: declaredTo },
        derived: { from: transition.fromState, to: transition.toState },
      });
    }

    if (machine && hops.length > 1) {
      for (const hop of hops) {
        if (!isMachineEdge(machine, hop.from, hop.to)) {
          findings.push({ kind: 'illegal-hop', sha, subject, hop: { from: hop.from, to: hop.to } });
        }
      }
    }
  }

  return findings;
}
