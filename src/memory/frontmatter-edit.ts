/**
 * Line-based edits of top-level frontmatter fields (task-045-memory-submit).
 *
 * Memory transition verbs change a handful of fields — `status` on every verb, `rejection_reason` on
 * `submit` (removed) and `reject` (set) — per `spec-010-memory-frontmatter-schema`'s field-write
 * ownership table. Re-serializing the YAML would strip the templates' inline `# REQUIRED …` comments
 * and normalise quoting everywhere (the defect class of `bug-004` for `dna set`), so these edits touch
 * only the lines of the one entry being changed and leave every other byte — the rest of the
 * frontmatter and the whole body — as it was.
 *
 * **What "the lines of an entry" are** is decided by YAML's own rules, not by indentation alone (the
 * first pass's indentation-only rule removed half of a block scalar and folded the rest into the
 * preceding key — rejection `d7b9d70`). An entry is its column-0 `key:` line plus:
 *
 * - a **block scalar** (`|`, `>`, with optional chomping/indentation indicators): every following line
 *   that is blank or indented at least as far as the scalar's content, `#`-lines included (they are
 *   content there);
 * - a **quoted scalar** not closed on the key line: every line up to the closing quote;
 * - a **plain scalar**: following indented lines that are not comments, with the blank lines between
 *   them (a plain scalar ends at a comment line);
 * - an **empty value** (a nested mapping or sequence): following indented or `-` lines, with blank and
 *   comment lines — at ANY indentation, a column-0 `#` between two column-0 sequence items included —
 *   only when more of that nested block follows.
 *
 * Trailing blank lines, and a comment that ends a value, belong to the parent mapping and are kept.
 * CRLF documents stay CRLF. Only column-0 keys are matched, so a
 * nested `status:` or a body line starting with `status:` is never touched.
 *
 * A byte-level editor can still be wrong in a case nobody thought of, so {@link verifyFrontmatterEdit}
 * re-parses the result; the transition verbs refuse to write when it reports a problem.
 */
import { isDeepStrictEqual } from 'util';

import { splitFrontmatter } from '../storage';
import { parseYaml, ValidationError } from '../validation';

/** Split `content` into the text before the frontmatter lines, those lines, and everything after them. */
function locateFrontmatter(content: string): { before: string; lines: string[]; after: string } {
  const { frontmatter } = splitFrontmatter(content);
  if (frontmatter === null) {
    throw new Error('document has no frontmatter block');
  }
  // `splitFrontmatter` anchors on an opening `---` line, so the frontmatter starts after the first newline.
  const start = content.indexOf('\n') + 1;
  return { before: content.slice(0, start), lines: frontmatter.split('\n'), after: content.slice(start + frontmatter.length) };
}

// Lines keep a CRLF document's `\r`; every predicate below treats it as trailing whitespace, and the
// value scan stops before it, so an edited line keeps its ending (see `setFrontmatterField`).
/**
 * Join edited frontmatter lines back between `before` and `after`. In a CRLF document the last
 * frontmatter line's `\r` lives in `after` (`\r\n---`), so a line that becomes last after an edit must
 * not keep its own `\r`, and a line that stops being last needs one.
 */
function assemble(before: string, lines: readonly string[], after: string): string {
  const crlf = before.endsWith('\r\n');
  const joined = lines.map((line, i) => (crlf && i < lines.length - 1 && !line.endsWith('\r') ? `${line}\r` : line)).join('\n');
  return `${before}${crlf ? joined.replace(/\r$/, '') : joined}${after}`;
}

const indentOf = (text: string): number => text.length - text.trimStart().length;
const isBlank = (text: string): boolean => text.trim().length === 0;
const isComment = (text: string): boolean => text.trimStart().startsWith('#');

/** Index of the column-0 `key:` line (followed by a space, a tab or the end of the line), or `-1`. */
function findKeyLine(lines: readonly string[], key: string): number {
  return lines.findIndex((text) => {
    const next = text.charAt(key.length + 1);
    return text.startsWith(`${key}:`) && (next === '' || next === ' ' || next === '\t' || next === '\r');
  });
}

/** Offset of the closing quote in `text` from `from`, honouring `\"` escapes and `''` doubling; `-1` if none. */
function findClosingQuote(text: string, from: number, quote: string): number {
  for (let i = from; i < text.length; i += 1) {
    if (quote === '"' && text[i] === '\\') {
      i += 1;
    } else if (text[i] === quote) {
      if (quote === "'" && text[i + 1] === "'") {
        i += 1;
      } else {
        return i;
      }
    }
  }
  return -1;
}

/**
 * The value written on a `key:` line: its text, the offset right after it (where any spaces +
 * `# comment` begin), and whether it is complete on this line (`false` for a quoted scalar whose
 * closing quote is on a later line). In a plain value a `#` starts a comment only after whitespace,
 * so `dr#aft` is one value.
 */
function scanHeaderValue(text: string, key: string): { value: string; valueEnd: number; closed: boolean } {
  let start = key.length + 1;
  while (text[start] === ' ' || text[start] === '\t') start += 1;
  const quote = text[start];
  if (quote === '"' || quote === "'") {
    const close = findClosingQuote(text, start + 1, quote);
    return close === -1
      ? { value: text.slice(start), valueEnd: text.length, closed: false }
      : { value: text.slice(start, close + 1), valueEnd: close + 1, closed: true };
  }
  const comment = quote === '#' ? { index: 0 } : /[ \t]#/.exec(text.slice(start));
  const end = start + (comment ? comment.index : text.length - start);
  const valueEnd = start + text.slice(start, end).trimEnd().length;
  return { value: text.slice(start, valueEnd), valueEnd, closed: true };
}

/** The exclusive end index of the entry whose `key:` line is at `index` (rules in the module doc). */
function entryEnd(lines: readonly string[], index: number, key: string): number {
  const header = scanHeaderValue(lines[index]!, key);
  const start = index + 1;

  const block = /^[|>](?:([1-9])[+-]?|[+-]([1-9])?)?$/.exec(header.value);
  if (block) {
    const explicit = block[1] ?? block[2];
    const firstContent = lines.slice(start).find((text) => !isBlank(text));
    const contentIndent = explicit !== undefined ? Number(explicit) : indentOf(firstContent ?? '');
    let end = start;
    let lastContent = start;
    while (contentIndent > 0 && end < lines.length) {
      const text = lines[end]!;
      if (!isBlank(text) && indentOf(text) < contentIndent) break;
      end += 1;
      if (!isBlank(text)) lastContent = end;
    }
    return lastContent;
  }

  if (!header.closed) {
    const quote = header.value.charAt(0);
    const closing = lines.slice(start).findIndex((text) => findClosingQuote(text, 0, quote) !== -1);
    return closing === -1 ? lines.length : start + closing + 1;
  }

  const nested = header.value.length === 0;
  let lastContent = start;
  for (let end = start; end < lines.length; end += 1) {
    const text = lines[end]!;
    // Inside a nested value a comment line continues the block whatever its indentation: a column-0
    // `#` between two column-0 sequence items is part of that sequence, not the end of the entry
    // (`bug-041` G2, whose removal left `- b` orphaned behind the deleted key — invalid YAML).
    // `lastContent` still advances only on real content, so a comment that *ends* the value is not
    // swallowed: it belongs to the parent mapping and is kept.
    if (isBlank(text) || (nested && isComment(text))) continue;
    const child = indentOf(text) > 0 || (nested && text.startsWith('-'));
    if (!child || isComment(text)) break;
    lastContent = end + 1;
  }
  return lastContent;
}

/** State-machine identifiers and other simple tokens YAML reads back as the same string, unquoted. */
const PLAIN_SAFE = /^[A-Za-z][A-Za-z0-9._/-]*$/;
const YAML_TYPED_WORD = /^(?:true|false|yes|no|on|off|y|n|null)$/i;

/**
 * Serialize `value` as a YAML scalar that parses back to exactly `value`: a plain token when that is
 * unambiguous (so `status: pending` stays a one-token diff), otherwise a JSON string literal — every
 * JSON string escape is also a valid YAML double-quoted escape, so quotes, colons, `#`, newlines and
 * leading/trailing whitespace all survive (task-047's `rejection_reason` carries arbitrary text).
 */
function toYamlScalar(value: string): string {
  return PLAIN_SAFE.test(value) && !YAML_TYPED_WORD.test(value) ? value : JSON.stringify(value);
}

/**
 * Set top-level `key` to the string `value`, serialized YAML-safely. An existing entry is replaced as a
 * whole — continuation lines, block-scalar body or multi-line quoted value included. A `# comment` on
 * the key line is kept when the old value ended on that line; the line ending of the key line is kept.
 * An absent key is appended after the last non-blank frontmatter line, with the document's line ending.
 *
 * @throws `Error` when the document has no frontmatter block.
 */
export function setFrontmatterField(content: string, key: string, value: string): string {
  return setFrontmatterEntry(content, key, toYamlScalar(value));
}

/**
 * {@link setFrontmatterField} for a value the caller has already serialized as ONE line of YAML — a
 * flow sequence (`["a","b"]`), a JSON-quoted string, a plain token. The same top-level-only match,
 * whole-entry replacement and inline-comment rule apply. `memory add` fills its scaffold through this
 * (task-163, `bug-033`), so the add and the transition verbs edit a frontmatter line the same way.
 *
 * @throws `Error` when the document has no frontmatter block.
 */
export function setFrontmatterEntry(content: string, key: string, valueYaml: string): string {
  const { before, lines, after } = locateFrontmatter(content);
  const entry = `${key}: ${valueYaml}`;
  const index = findKeyLine(lines, key);
  if (index === -1) {
    // After the last NON-BLANK line, not simply last: trailing blank lines can belong to a
    // keep-chomped (`|+`) block scalar's value, and pushing the new key past them would change that
    // other field — which the post-condition then rightly refuses (`bug-041` G3).
    let at = lines.length;
    while (at > 0 && isBlank(lines[at - 1]!)) at -= 1;
    return assemble(before, [...lines.slice(0, at), entry, ...lines.slice(at)], after);
  }
  const header = lines[index]!;
  const { valueEnd, closed } = scanHeaderValue(header, key);
  // A value that ended on the key line keeps what followed it there (spaces, `# comment`); line
  // endings are restored by `assemble`. A tail that starts at the `#` itself — the shape an EMPTY
  // value with an inline comment leaves behind (`rejection_reason:   # set by memory.reject`) — gets
  // a separating space: `value# comment` is a comment YAML requires to be preceded by whitespace, and
  // js-yaml's tolerance of it hid the defect from the re-parse post-condition (`bug-041` G1).
  const tail = closed ? header.slice(valueEnd) : '';
  const separated = tail.startsWith('#') ? ` ${tail}` : tail;
  return assemble(before, [...lines.slice(0, index), `${entry}${separated}`, ...lines.slice(entryEnd(lines, index, key))], after);
}

/**
 * Remove top-level `key` together with every line its value spans (rules in the module doc). Blank
 * lines and comments that follow the value belong to the parent mapping and are kept. Returns `content`
 * unchanged when the key is absent.
 *
 * @throws `Error` when the document has no frontmatter block.
 */
export function removeFrontmatterField(content: string, key: string): string {
  const { before, lines, after } = locateFrontmatter(content);
  const index = findKeyLine(lines, key);
  if (index === -1) return content;
  return assemble(before, [...lines.slice(0, index), ...lines.slice(entryEnd(lines, index, key))], after);
}

/** Parse a document's frontmatter into a plain record, or return why it cannot be. */
function parseFrontmatter(content: string): Record<string, unknown> | string {
  const { frontmatter } = splitFrontmatter(content);
  if (frontmatter === null) return 'rendered document has no frontmatter block';
  try {
    const parsed = parseYaml(frontmatter, 'frontmatter');
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
    return `rendered frontmatter is not valid YAML: ${error.issues.map((issue) => issue.message).join('; ')}`;
  }
}

/**
 * The post-condition of a frontmatter edit, checked by re-parsing rather than by trusting the editor.
 * `expected` maps each field the operation owns to its required value (`undefined` = must be absent).
 * Returns the problems found, empty when the edit is sound:
 *
 * - the rendered document has no frontmatter, or it does not parse;
 * - an owned field does not have its expected value, or is still present when it should be removed;
 * - any **other** field's parsed value differs from `before` — an edit leaked into a field it does not own.
 *
 * Deterministic (REQ-SYS-07): owned fields in `expected`'s order, then other fields sorted by name.
 */
export function verifyFrontmatterEdit(before: string, after: string, expected: Readonly<Record<string, string | undefined>>): string[] {
  const rendered = parseFrontmatter(after);
  if (typeof rendered === 'string') return [rendered];
  const parsedBefore = parseFrontmatter(before);
  const original = typeof parsedBefore === 'string' ? {} : parsedBefore;

  return [...ownedFieldProblems(rendered, expected), ...unownedFieldProblems(original, rendered, expected)];
}

/** Each field the operation owns that does not hold its expected value (`undefined` = must be absent). */
function ownedFieldProblems(
  rendered: Readonly<Record<string, unknown>>,
  expected: Readonly<Record<string, string | undefined>>,
): string[] {
  const problems: string[] = [];
  for (const [field, value] of Object.entries(expected)) {
    if (value === undefined) {
      if (field in rendered) problems.push(`field '${field}' is still present, expected it removed`);
    } else if (rendered[field] !== value) {
      problems.push(`field '${field}' is ${JSON.stringify(rendered[field])}, expected ${JSON.stringify(value)}`);
    }
  }
  return problems;
}

/** Each field the operation does NOT own whose parsed value moved. Sorted by name (REQ-SYS-07). */
function unownedFieldProblems(
  original: Readonly<Record<string, unknown>>,
  rendered: Readonly<Record<string, unknown>>,
  expected: Readonly<Record<string, string | undefined>>,
): string[] {
  const problems: string[] = [];
  const others = [...new Set([...Object.keys(original), ...Object.keys(rendered)])].filter((field) => !(field in expected)).sort();
  for (const field of others) {
    if (!isDeepStrictEqual(original[field], rendered[field])) {
      problems.push(`field '${field}' changed although this operation does not own it`);
    }
  }
  return problems;
}

/**
 * How much of a document an operation is entitled to change (task-088, `bug-076`), per
 * `spec-010-memory-frontmatter-schema` § "Field-write ownership":
 *
 * - `declared-fields-only` — the operation owns `status` (plus `rejection_reason` on `memory.reject`)
 *   and **nothing else**: no other frontmatter field, and not one byte of the body. This is
 *   `memory.approve`, `memory.reject` and `memory.deprecate`.
 * - `carries-content` — the operation is defined as carrying the author's content, so the body and
 *   the type's other frontmatter fields may legitimately change. This is `memory.submit` (content
 *   *and* the state move) and `memory.amend` (task-127, `dl-108`: content and no state move). The
 *   asymmetry with the gates is deliberate rather than an oversight: an `approve` that carried a body
 *   would attest, under an approver's name, to content no commit subject mentions. `amend` is the
 *   approval whose subject says exactly that, and it still may not move the fields other operations
 *   own (`amendReservedFields`, `src/core/memory-amend.ts`).
 */
export type DocumentScope = 'declared-fields-only' | 'carries-content';

/**
 * The post-condition of a whole-document edit: {@link verifyFrontmatterEdit}'s frontmatter rules plus
 * the body, gated by `scope`. Returns the problems found, empty when the edit is within scope.
 *
 * Under `carries-content` only the `expected` fields are checked — every other field and the body are
 * the operation's to write. Under `declared-fields-only` an unowned field or a changed body is a
 * problem, which is the rule `bug-076` showed nothing was enforcing.
 *
 * Deterministic (REQ-SYS-07): owned fields in `expected`'s order, then other fields sorted by name,
 * then the body.
 */
export function verifyDocumentEdit(
  before: string,
  after: string,
  expected: Readonly<Record<string, string | undefined>>,
  scope: DocumentScope,
): string[] {
  const rendered = parseFrontmatter(after);
  if (typeof rendered === 'string') return [rendered];
  const problems = ownedFieldProblems(rendered, expected);
  if (scope === 'carries-content') return problems;

  const parsedBefore = parseFrontmatter(before);
  problems.push(...unownedFieldProblems(typeof parsedBefore === 'string' ? {} : parsedBefore, rendered, expected));
  if (splitFrontmatter(before).body !== splitFrontmatter(after).body) {
    problems.push('the body changed although this operation does not own it');
  }
  return problems;
}

/**
 * Name, in a form a person can act on, every way `after` differs from `before` — the frontmatter
 * fields whose parsed value moved, and whether the body moved. `before` is `null` when the document
 * does not exist at the revision being compared against.
 *
 * This is the *reporting* half of {@link verifyDocumentEdit}: the verifier answers "is this edit in
 * scope", this answers "so what exactly is in the way". A difference that changes no parsed value and
 * no body byte — a reordered comment, a requoted scalar — is still a difference git will commit, so
 * it is reported as such rather than dropped.
 *
 * Deterministic (REQ-SYS-07): fields sorted by name, then the frontmatter-text fallback, then the body.
 */
export function describeDocumentChanges(before: string | null, after: string): string[] {
  if (before === null) return ['the document is not tracked at HEAD'];
  if (before === after) return [];

  const parsedBefore = parseFrontmatter(before);
  const parsedAfter = parseFrontmatter(after);
  const original = typeof parsedBefore === 'string' ? {} : parsedBefore;
  const rendered = typeof parsedAfter === 'string' ? {} : parsedAfter;

  const changes = [...new Set([...Object.keys(original), ...Object.keys(rendered)])]
    .sort()
    .filter((field) => !isDeepStrictEqual(original[field], rendered[field]))
    .map((field) => `frontmatter field '${field}'`);

  const beforeSplit = splitFrontmatter(before);
  const afterSplit = splitFrontmatter(after);
  if (changes.length === 0 && beforeSplit.frontmatter !== afterSplit.frontmatter) {
    changes.push('the frontmatter text (comments or formatting)');
  }
  if (beforeSplit.body !== afterSplit.body) changes.push('the body');
  return changes.length > 0 ? changes : ['the file content'];
}
