/**
 * Pure helpers behind `wingfoil memory submit` (P1.6, task-045-memory-submit), kept out of the
 * `CoreResult`-wrapped operation in `src/core` the same way `./add.ts` serves `memory add`.
 *
 * Both implement `spec-010-memory-frontmatter-schema`:
 * - "Validation rules": `title`, and every field in the type's `template.frontmatter.required`, must
 *   be non-empty once `status` is anything other than `draft` — so a submit checks them first. A field
 *   the type lists in `template.frontmatter.not_applicable_allowed` may instead hold
 *   `"n/a — <reason>"` (`dl-124`, task-168); no other field may hold a not-applicable value.
 * - "Field-write ownership": `memory.submit` moves `status` to the next state and clears
 *   `rejection_reason` by removing the key (it mirrors only the most recent reject).
 *
 * Deterministic (REQ-SYS-07): results follow the declared field order, never object-key order.
 */
import { describeDocumentChanges, removeFrontmatterField, setFrontmatterField } from './frontmatter-edit';

/** The frontmatter key `memory.reject` sets and `memory.submit` removes (spec-010). */
export const REJECTION_REASON_FIELD = 'rejection_reason';

/**
 * Whether a required field's value counts as "not filled in" (`spec-010` § Validation rules,
 * `bug-147`, approver rulings 2026-10-02 at `task-168`'s review): absent, `null` (an empty YAML value,
 * `features:`), a blank string, or a mapping. A list is a value only on a field the type declares in
 * `template.frontmatter.lists`, and there any list is, `[]` included (the author declared "none"); on
 * every other field a list is missing. A date (YAML timestamp) is a value.
 */
function isEmptyValue(value: unknown, isListField: boolean): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return !isListField;
  if (value instanceof Date) return false;
  return typeof value === 'object';
}

/**
 * A value that says "this field does not apply" (`dl-124` Q1 (A)): a string whose text starts with
 * `n/a`, in any case, not followed by a letter, digit or `_` — so `n/a`, `N/A` and
 * `n/a — patch release` are, while `n/available` or `P1 (n/a for docs)` are ordinary data.
 */
const NOT_APPLICABLE_SHAPE = /^n\/a(?![\w])/i;

/**
 * The one accepted form (`dl-124` Q3 (ii)): `n/a`, an em dash, then a non-blank reason. Case, and
 * whitespace around the em dash, do not matter (task-168 review fix 3): `N/A — x` and `n/a—x` pass.
 */
const NOT_APPLICABLE_WITH_REASON = /^n\/a\s*—\s*\S/i;

/** Bare `n/a`, or `n/a —` with nothing after it: the form is right, the reason is missing. */
const NOT_APPLICABLE_WITHOUT_REASON = /^n\/a\s*(—\s*)?$/i;

function isNotApplicableShaped(value: unknown): value is string {
  return typeof value === 'string' && NOT_APPLICABLE_SHAPE.test(value.trim());
}

/**
 * Why a required field's not-applicable value is refused: the type does not declare it, it gives no
 * reason, or it separates the reason with something other than an em dash (`n/a - x`, `n/a: x`).
 */
export type NotApplicableProblem = 'undeclared' | 'no-reason' | 'bad-form';

/** One refused not-applicable value, by field. */
export interface NotApplicableRefusal {
  readonly field: string;
  readonly problem: NotApplicableProblem;
}

/** `title` first (spec-010 requires it of every type), then `required` in declared order, deduplicated. */
function requiredFieldOrder(required: readonly string[]): string[] {
  return [...new Set(['title', ...required])];
}

/**
 * The fields that must be filled before a submit but are not: `title` first (spec-010 requires it of
 * every type), then each of `required` in its declared order, without duplicates. `[]` means no field
 * is missing. `listFields` are the type's `template.frontmatter.lists`: on those alone a list, `[]`
 * included, is filled; `title` is never one. A not-applicable value counts as present here — whether it is *accepted* is
 * {@link notApplicableRefusals}'s question, so a field is reported by one of the two, never both.
 */
export function missingRequiredFields(
  frontmatter: Readonly<Record<string, unknown>>,
  required: readonly string[],
  listFields: readonly string[] = [],
): string[] {
  const lists = new Set(listFields.filter((field) => field !== 'title'));
  return requiredFieldOrder(required).filter((field) => isEmptyValue(frontmatter[field], lists.has(field)));
}

/**
 * The required fields holding a not-applicable value that may not stand (`dl-124`, task-168), in the
 * same order as {@link missingRequiredFields}:
 * - `undeclared` — the type's `template.frontmatter.not_applicable_allowed` does not list the field
 *   (`title` never counts as listed: spec-010 requires it of every type);
 * - `no-reason` — the field is listed, but the value is bare `n/a` or `n/a —` with a blank reason;
 * - `bad-form` — the field is listed, but the reason follows another separator than the em dash.
 *
 * Optional fields are not checked: what they hold is the type's own business.
 */
export function notApplicableRefusals(
  frontmatter: Readonly<Record<string, unknown>>,
  required: readonly string[],
  notApplicableAllowed: readonly string[] = [],
): NotApplicableRefusal[] {
  const allowed = new Set(notApplicableAllowed.filter((field) => field !== 'title'));
  const refusals: NotApplicableRefusal[] = [];
  for (const field of requiredFieldOrder(required)) {
    const value = frontmatter[field];
    if (!isNotApplicableShaped(value)) continue;
    if (!allowed.has(field)) refusals.push({ field, problem: 'undeclared' });
    else if (NOT_APPLICABLE_WITHOUT_REASON.test(value.trim())) refusals.push({ field, problem: 'no-reason' });
    else if (!NOT_APPLICABLE_WITH_REASON.test(value.trim())) refusals.push({ field, problem: 'bad-form' });
  }
  return refusals;
}

/** The submitted document: `status` set to `target` and `rejection_reason` removed; nothing else changes. */
export function renderSubmitDocument(content: string, target: string): string {
  return removeFrontmatterField(setFrontmatterField(content, 'status', target), REJECTION_REASON_FIELD);
}

/**
 * What a submit carries besides its own edit (task-209, `dl-106` W1 (a)): every way the author's
 * working-tree document differs from the one committed at `HEAD`, worded by `describeDocumentChanges`
 * — "the body", a `frontmatter field '<name>'` per moved field, sorted by name — the function that
 * already words the gated verbs' refusal of the same edits. Both copies are first rendered by the same
 * transition ({@link renderSubmitDocument}), so the submit's own fields, `status` and a cleared
 * `rejection_reason`, never count: a pure transition carries nothing (`[]`).
 *
 * `committed` is `null` when no commit holds the document; the verb refuses that case before asking.
 * Pure and deterministic (REQ-SYS-07).
 */
export function describeSubmitContent(committed: string | null, content: string, target: string): string[] {
  const after = renderSubmitDocument(toLf(content), target);
  if (committed === null) return describeDocumentChanges(null, after);
  return describeDocumentChanges(renderSubmitDocument(toLf(committed), target), after);
}

/** CRLF → LF: the comparison is of content, so line endings are compared separately (task-209 review F1). */
function toLf(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

/**
 * `text` rewritten in the line-ending style of `like`: CRLF when `like` holds any CRLF, LF otherwise
 * (task-209 re-review 1). `memory submit` compares the blob git would store for its rendering with the
 * blob of the same rendering in the committed document's style, which isolates a line-ending
 * conversion from the content edits made with it. Pure.
 */
export function withLineEndingsOf(text: string, like: string): string {
  const lf = toLf(text);
  return like.includes('\r\n') ? lf.replace(/\n/g, '\r\n') : lf;
}

/**
 * The item a submit declares, after every other item, when git — after its own line-ending filters —
 * would store the rendered document with line endings other than the committed one's (`storesAsBlob`,
 * `src/storage`): the one change {@link describeSubmitContent} cannot see, because it compares
 * line-ending-normalized text.
 */
export const LINE_ENDINGS_ITEM = 'the line endings';
