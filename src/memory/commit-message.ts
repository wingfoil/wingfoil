/**
 * The one commit-message formatter for Memory state-transition verbs (task-045-memory-submit).
 *
 * Every verb — `submit`, `approve`, `reject`, `deprecate` and `amend` (task-127) — produces exactly one commit whose
 * subject is `wf({type}): {verb} {id1}, {id2}` (`spec-004-mcp-surface-contract` §4.3), optionally
 * followed by a ` [from → to]` bracket and an `Approver:` / `Reason:` body for the verbs whose
 * evidence rules require them (P1.7/P1.8, REQ-SEC-04). Those are exactly the shapes
 * `./audit.ts` reads back for `wingfoil memory history` (P1.10): `parseMemoryOperation` on the subject,
 * `parseBracketHops` on the bracket, `parseApprovalMetadata`/`parseCommitReason` on the body. Building the
 * message in one place is what keeps writer and reader from drifting apart.
 *
 * Since `task-072-fix-reason-trailer-contract` this module also owns the **reason grammar** —
 * {@link normalizeReason}, {@link reasonDefect}, {@link reasonRefusalMessage}, {@link parseReasonBlock}
 * and {@link parseApproverTrailerLine} — ratified by `dl-067-reason-trailer-contract` and fixing
 * `bug-042-reason-text-has-no-contract-against-commit-trailer`. `--reason <text>` is arbitrary free
 * text and the trailer is line-oriented; before dl-067 no rule said what happened when the two met, so
 * a blank reason was recorded as a bare `Reason:` that destroyed the whole approval record, a
 * multi-line one was truncated to its first line on read, and one shaped like a trailer could forge a
 * second `Approver:` line. Putting the grammar HERE, next to the formatter, and having `./audit.ts`
 * consume it is what makes this module doc's "one place" claim true rather than aspirational: the
 * writer cannot emit a reason the reader cannot recover.
 *
 * Pure and deterministic (REQ-SYS-07): the output is a function of the input alone; ids keep the order
 * the caller gives.
 */
import { WINGFOIL_VERSION_TRAILER_KEY } from '../storage';

import type { TransitionOp } from './state-machine';

/** The canonical arrow written in `[from → to]` subject brackets (U+2192); `./audit.ts`'s bracket reader (`BRACKET_ARROW_RE`) also reads the ASCII `->` (`bug-137`). */
const ARROW = '→';

// --- The reason grammar (dl-067-reason-trailer-contract) ---------------------------------------

/**
 * A git trailer line's shape (`Token: value`), as git itself recognises one. Used ONLY to identify a
 * message's trailing trailer paragraph — the `Co-Authored-By:` block a hand-written commit ends with —
 * which is where a `Reason:` block stops.
 */
const TRAILER_LINE_RE = /^[A-Za-z][A-Za-z0-9-]*:[ \t]\S/;

/**
 * The trailer keys THIS project's tooling acts on. A reason may not contain a line starting with any
 * of them, because such a line is indistinguishable from the trailer itself. `Approver` and `Reason`
 * are `dl-067` clause 4's; `WingFoil-Version` is reserved by `dl-111` Q1 (A) for the build signature
 * a later task stamps on every commit, so a reason cannot forge a build record any more than it can
 * forge an approval. Matched case-insensitively, because git reads trailer keys that way
 * (`git log --format='%(trailers:key=WingFoil-Version)'` also returns a `wingfoil-version:` line);
 * no commit on `main` carries a reserved key in another case, so no existing reason is affected
 * (task-166 review). Deliberately narrow: on `main`, 8 approve/reject commits carry a generic
 * `Key: value` line inside their reason (ordinary prose — `Action: amend spec-015 §3`, `A: before the
 * v0.2 …`) and **0** carry a reserved one, so a broader rule would outlaw the approver's own writing
 * style (dl-067 E5).
 */
const RESERVED_TRAILER_LINE_RE = /^(?:Approver|Reason|WingFoil-Version):/i;

/**
 * The first C0 control character in `text` other than tab (`U+0009`) and newline (`U+000A`) — the two
 * a reason legitimately carries (`dl-078` (A)) — or `null` when there is none. Such a character
 * renders as nothing, or moves the cursor, in a terminal, so a reason carrying one can show a human
 * reading `git log` a line nobody wrote: the presentation half of `bug-050`, which no read-side fix
 * can reach. A carriage return never gets this far, because {@link normalizeReason} turns it into a
 * newline before any rule is judged. A scan rather than a character-class regex, which the
 * `no-control-regex` lint rule forbids.
 */
function firstControlCharacter(text: string): string | null {
  for (const character of text) {
    const code = character.charCodeAt(0);
    if (code < 0x20 && character !== '\t' && character !== '\n') return character;
  }
  return null;
}

/** The `Reason:` key, at the start of a line. */
const REASON_KEY_RE = /^Reason:[ \t]*/;

/** The `Approver:` key, at the start of a line. */
const APPROVER_KEY_RE = /^Approver:/;

/** Why a `--reason` value cannot be recorded in the trailer, per `dl-067` clause 4 and its corollary. */
export type ReasonDefect =
  /** Empty, or nothing but whitespace: git would store a bare `Reason:` and both parsers would fail. */
  | 'blank'
  /**
   * Carries a C0 control character other than tab and newline (`dl-078` (A)). The refusal names the
   * first one by code point ({@link reasonRefusalMessage}).
   */
  | 'control-character'
  /**
   * Carries a line starting `Approver:`, `Reason:` or `WingFoil-Version:`, in any letter case — a
   * forged trailer line (bug-042 F3; `dl-111` Q1 (A)).
   */
  | 'reserved-trailer-line'
  /**
   * Ends in a paragraph made entirely of trailer-shaped lines, which {@link parseReasonBlock} would
   * read as git's own trailer block and drop. The corollary of the block's termination rule: without
   * it, the round-trip equality dl-067 clause 3 promises would be false for this one input shape. 0 of
   * `main`'s 172 reason blocks end this way, so the refusal costs the existing corpus nothing. The
   * rule is judged by SHAPE, git's own heuristic, not against a list of known trailer keys: `dl-070`
   * (A) kept it, and its S4 put the remedy into the message.
   */
  | 'trailing-trailer-paragraph';

/** The exact refusal message for each defect — `spec-008-cli-grammar` §2's "invalid flag value" class (exit 2). */
const REASON_DEFECT_MESSAGES: Readonly<Record<ReasonDefect, string>> = {
  blank: 'invalid flag value: --reason must not be blank',
  'control-character': 'invalid flag value: --reason must not contain a control character other than tab or newline',
  'reserved-trailer-line':
    'invalid flag value: --reason must not contain a line starting with "Approver:", "Reason:" or "WingFoil-Version:"',
  'trailing-trailer-paragraph':
    'invalid flag value: --reason must not end in a paragraph of "Key: value" lines; add a closing sentence after it, or fold those lines into prose',
};

/**
 * The refusal message for the class `defect` — the wording `spec-008-cli-grammar` §2 pins.
 * Deliberately distinct from `missing required argument: --reason` (`src/core/require-reason.ts`),
 * which answers the *omitted* case that spec-008 §2 and the P1.7/P1.8 BDD features already quote
 * verbatim (dl-067 S1). For `control-character` this is the class alone; the message the CLI prints
 * also names the character, and comes from {@link reasonRefusalMessage}.
 */
export function reasonDefectMessage(defect: ReasonDefect): string {
  return REASON_DEFECT_MESSAGES[defect];
}

/** `U+XXXX` for a character, the way the control-character refusal names it. */
function codePointOf(character: string): string {
  return `U+${(character.codePointAt(0) as number).toString(16).toUpperCase().padStart(4, '0')}`;
}

/**
 * The exact message `reason` is refused with, or `null` when it can be recorded — the single source
 * of the wording the CLI prints (`src/core/require-reason.ts`) and {@link formatMemoryCommitMessage}
 * throws. It is {@link reasonDefectMessage}'s class message, plus, for a control character, the FIRST
 * offending one by code point (`dl-078` (A): "naming the character"), so the message is a function of
 * the input alone (REQ-SYS-07).
 */
export function reasonRefusalMessage(reason: string): string | null {
  const defect = reasonDefect(reason);
  if (defect === null) return null;
  const message = reasonDefectMessage(defect);
  const control = defect === 'control-character' ? firstControlCharacter(normalizeReason(reason)) : null;
  return control === null ? message : `${message} (found ${codePointOf(control)})`;
}

/**
 * The declared normal form of a reason (`dl-067` clause 3) — two rules, from two different sources,
 * and it is worth keeping them apart:
 *
 *  1. **git's**, which applies whether or not this function exists. `commitPaths`
 *     (`src/storage/commit.ts`) passes `--cleanup=whitespace` explicitly (`bug-051`, task-192), so —
 *     whatever `commit.cleanup` the git config sets — git strips per-line trailing whitespace,
 *     collapses runs of blank lines to one, and drops leading and trailing blank lines. This is why `spec-008-cli-grammar` §2's original "Recorded verbatim" was already false
 *     for any multi-line text, independently of bug-042.
 *  2. **This module's**: the first line's leading whitespace is trimmed. git does NOT do this. It is
 *     needed because that line sits after `Reason: ` on the same physical line and
 *     {@link parseReasonBlock} consumes the key together with the whitespace that follows it — so
 *     without the trim, a reason beginning with spaces would not round-trip equally.
 *
 * Applying both HERE, on the way in, is what turns "approximately what you typed" into an assertable
 * equality: what {@link parseReasonBlock} reads back out of the commit is exactly this function's
 * output. Interior indentation is preserved by both rules — it carries meaning in real approval prose.
 *
 * Idempotent, and a pure function of its input (REQ-SYS-07).
 */
export function normalizeReason(reason: string): string {
  return reason
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+/, '')
    .replace(/\n+$/, '')
    .replace(/^[ \t]+/, '');
}

/** Split a normalized reason into its paragraphs, dropping the blank separators. */
function paragraphsOf(normalized: string): string[][] {
  const paragraphs: string[][] = [[]];
  for (const line of normalized.split('\n')) {
    if (line.trim() === '') paragraphs.push([]);
    else (paragraphs[paragraphs.length - 1] as string[]).push(line);
  }
  return paragraphs.filter((paragraph) => paragraph.length > 0);
}

/**
 * Why `reason` cannot be recorded in the `Reason:` trailer, or `null` when it can (`dl-067` clause 4).
 *
 * Judged on the NORMALIZED text ({@link normalizeReason}), because that is what would actually be
 * stored — otherwise a defect could hide behind trailing whitespace git strips on the way in. This is
 * the ONE place the rule is decided: `src/core/require-reason.ts` turns a non-`null` result into the
 * `UsageError` (exit 2) the CLI boundary reports, and {@link formatMemoryCommitMessage} refuses the
 * same values so no caller can route around that boundary.
 */
export function reasonDefect(reason: string): ReasonDefect | null {
  const normalized = normalizeReason(reason);
  if (normalized === '') return 'blank';
  if (firstControlCharacter(normalized) !== null) return 'control-character';

  const lines = normalized.split('\n');
  if (lines.some((line) => RESERVED_TRAILER_LINE_RE.test(line))) return 'reserved-trailer-line';

  const paragraphs = paragraphsOf(normalized);
  const last = paragraphs[paragraphs.length - 1];
  if (paragraphs.length > 1 && last && last.every((line) => TRAILER_LINE_RE.test(line))) {
    return 'trailing-trailer-paragraph';
  }
  return null;
}

/**
 * Where a commit body's trailing trailer paragraph begins, or `lines.length` when it has none — the
 * `Co-Authored-By:` block a hand-written WingFoil commit ends with. Defined the way git defines a
 * trailer block: the final paragraph of the message, every line of which is trailer-shaped.
 */
function trailerParagraphStart(lines: readonly string[]): number {
  let end = lines.length;
  while (end > 0 && (lines[end - 1] as string).trim() === '') end -= 1;

  let start = 0;
  for (let index = end - 1; index >= 0; index -= 1) {
    if ((lines[index] as string).trim() === '') {
      start = index + 1;
      break;
    }
  }
  if (start === 0 || start >= end) return lines.length;
  return lines.slice(start, end).every((line) => TRAILER_LINE_RE.test(line)) ? start : lines.length;
}

/**
 * The `Reason:` a commit body records, read as a BLOCK (`dl-067` clause 2): the remainder of the
 * `Reason:` line plus every following body line, up to (exclusive) git's trailing trailer paragraph or
 * the end of the body. `null` when the body records no reason, or records a bare `Reason:` with no
 * value — the shape git's cleanup leaves behind when an empty reason is written (bug-042 F2), which
 * `parseApprovalMetadata` degrades around rather than treating as an absent approval.
 *
 * This replaces the first-line capture `/^Reason:\s*(.+)$/m` that preceded it, and that is a real
 * change to how existing history reads: 79 of `main`'s 171 approve/reject commits (46%) carry a reason
 * continuing past line one, and every one of them was silently halved. It is a recovery, not a
 * reinterpretation — the text was always in the commit; only the reader dropped it.
 *
 * A generic `Key: value` line INSIDE the block is ordinary prose and does not end it; only a trailing
 * paragraph made entirely of trailer lines does (dl-067 E5).
 */
export function parseReasonBlock(body: string): string | null {
  const lines = body.replace(/\r\n?/g, '\n').split('\n');
  const start = lines.findIndex((line) => REASON_KEY_RE.test(line));
  if (start === -1) return null;

  const end = Math.max(trailerParagraphStart(lines), start + 1);
  const block = [(lines[start] as string).replace(REASON_KEY_RE, ''), ...lines.slice(start + 1, end)].join('\n');

  const normalized = normalizeReason(block);
  return normalized === '' ? null : normalized;
}

/**
 * The commit body's `Approver:` trailer line, or `null` when it has none — anchored to the body's
 * FIRST non-empty line (`dl-067` clause 5). {@link formatMemoryCommitMessage} has always emitted it
 * there, and it is the first body line in 171 of `main`'s 171 approve/reject commits (dl-067 E4), so
 * anchoring costs no existing commit its approver while closing bug-042 F3 on the read side: an
 * `Approver:` line appearing anywhere else is text some reason happens to contain, never an approval
 * record. `./audit.ts` destructures the returned line into an identity — that shape is its concern;
 * the line's POSITION is this module's.
 */
export function parseApproverTrailerLine(body: string): string | null {
  const first = body
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .find((line) => line.trim() !== '');
  return first !== undefined && APPROVER_KEY_RE.test(first) ? first : null;
}

/** A `WingFoil-Version:` trailer line and its value, in any letter case as git reads trailer keys. */
const VERSION_TRAILER_RE = new RegExp(`^${WINGFOIL_VERSION_TRAILER_KEY}:[ \\t]*(\\S.*?)\\s*$`, 'i');

/**
 * The build signature a commit body records — the value of its `WingFoil-Version:` trailer
 * (task-192, `dl-111` Action 3), `<semver> (<sha>)` — or `null` when it records none: a commit
 * written by hand, or by a WingFoil build older than the trailer.
 *
 * Read only from the body's **final paragraph**, and only when every line of it is trailer-shaped —
 * the paragraph `commitPaths` appends, and the one git's own reader takes
 * (`git log --format='%(trailers:key=WingFoil-Version,valueonly)'`). Unlike the `Reason:` terminator
 * ({@link parseReasonBlock}), a body that IS that one paragraph counts: it is what a subject-only
 * commit (`add`, `submit`) carries. A `WingFoil-Version:` line anywhere else is text, not a record;
 * a `--reason` cannot supply one at all (`dl-067` clause 4, reserved key).
 */
export function parseVersionTrailer(body: string): string | null {
  const lines = body.replace(/\r\n?/g, '\n').split('\n');
  let end = lines.length;
  while (end > 0 && (lines[end - 1] as string).trim() === '') end -= 1;
  let start = end;
  while (start > 0 && (lines[start - 1] as string).trim() !== '') start -= 1;

  const paragraph = lines.slice(start, end);
  if (paragraph.length === 0 || !paragraph.every((line) => TRAILER_LINE_RE.test(line))) return null;
  for (const line of paragraph) {
    const match = VERSION_TRAILER_RE.exec(line);
    if (match) return match[1] as string;
  }
  return null;
}

/** The identity recorded on an approval-gate commit's `Approver:` line. */
export interface CommitApprover {
  readonly name: string;
  readonly email: string;
  readonly role: string;
}

/** Everything one Memory transition commit message is built from. */
export interface MemoryCommitMessageInput {
  /** The Memory element type all `ids` belong to — one commit is scoped to one type. */
  readonly type: string;
  /**
   * The verb, which is also the subject's operation word. `add` is included for completeness;
   * `amend` (task-127, `dl-108`) moves no state, so its `transition` is the self-loop `[s → s]`;
   * `finalize` is what the `supersedes:` trigger emits for the element it moves into `superseded`
   * (task-162, `spec-008` §2).
   */
  readonly op: TransitionOp | 'add' | 'amend' | 'finalize';
  /** The element ids moved by this commit, in the order they are listed in the subject. */
  readonly ids: readonly string[];
  /** When given, appended to the subject as ` [from → to]`. Omitted for `add`/`submit` (spec-004 §4.3). */
  readonly transition?: { readonly from: string; readonly to: string };
  /** When given, an `Approver: Name <email> (role)` body line. */
  readonly approver?: CommitApprover;
  /**
   * When given, a `Reason:` block ({@link parseReasonBlock}) — written in the declared normal form
   * ({@link normalizeReason}), and refused outright when {@link reasonDefect} says it could not be
   * read back.
   */
  readonly reason?: string;
}

/**
 * Format a Memory transition commit message: the subject, then — only when an approver or reason is
 * given — a blank line and the `Approver:` / `Reason:` lines in that order.
 *
 * The reason is emitted in its declared normal form and, when it carries a defect
 * ({@link reasonDefect}), refused rather than written. The CLI boundary
 * (`src/core/require-reason.ts`) already refuses the same values with the same messages at exit 2, so
 * reaching this throw means a caller bypassed that boundary — it exists so no *future* caller can
 * (dl-067 clause 5; bug-042 F2/F3).
 *
 * @throws `Error` when `ids` is empty: a transition commit always names what it moved.
 * @throws `Error` when `reason` cannot be recorded in the trailer, carrying that defect's message.
 */
export function formatMemoryCommitMessage(input: MemoryCommitMessageInput): string {
  if (input.ids.length === 0) {
    throw new Error('a Memory transition commit must name at least one id');
  }
  const refusal = input.reason === undefined ? null : reasonRefusalMessage(input.reason);
  if (refusal !== null) {
    throw new Error(refusal);
  }
  const bracket = input.transition ? ` [${input.transition.from} ${ARROW} ${input.transition.to}]` : '';
  const subject = `wf(${input.type}): ${input.op} ${input.ids.join(', ')}${bracket}`;

  const body: string[] = [];
  if (input.approver) {
    body.push(`Approver: ${input.approver.name} <${input.approver.email}> (${input.approver.role})`);
  }
  if (input.reason !== undefined) {
    body.push(`Reason: ${normalizeReason(input.reason)}`);
  }
  return body.length === 0 ? subject : `${subject}\n\n${body.join('\n')}`;
}
