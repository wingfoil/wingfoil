/**
 * The comment-preserving **structural** edit behind `dna add | remove | update` (task-093) — the
 * sequence-aware sibling of `setDnaValueInText` (`task-063`, `bug-004-dna-set-strips-yaml-comments`).
 *
 * `setDnaValueInText` rewrites or inserts exactly one **mapping** line and skips every sequence branch
 * by design, so it can express none of the four shapes `dl-081-dna-mutation-surface-shape`'s verbs
 * write: a list of strings, an entry of a collection, a field inside an entry, or a list of strings
 * inside an entry. Its fallback for a shape it cannot edit is a whole-file `js-yaml` `dump()` — correct,
 * but it discards every comment token, including the inline `[SPEC]`/`[AUTHORING]` field-provenance
 * annotations whose loss is exactly what `bug-004` filed. That fallback is rare for `dna set`; without
 * this module it would be the **norm** for `dna add`, and the first structured write on a freshly
 * `wingfoil init`-ed project would delete the scaffold's own guidance comments.
 *
 * The safety contract is `setDnaValueInText`'s, unchanged and strengthened: every candidate edit is
 * verified by re-parsing it and comparing the **whole document** against the intended object before it
 * is returned, and anything that cannot be done provably-minimally returns `undefined` so the caller
 * falls back to `dump()` rather than writing something subtly wrong. A mis-located edit therefore
 * cannot corrupt a file; at worst it costs the comments.
 *
 * Pure and deterministic (REQ-SYS-07): a function of `(text, edit, intended)` alone — no wall-clock, no
 * randomness, no filesystem, and the input text is never mutated.
 */
import { dump, load } from 'js-yaml';

import { inlineCommentIndex, setDnaValueInText, valueOf } from './set';

/** One step of a text path: a mapping key, or the index of an entry inside a block sequence. */
export type DnaTextStep = { readonly key: string } | { readonly index: number };

/** The minimal edits `applyDnaMutation` (`./mutate.ts`) expresses its result as. */
export type DnaTextEdit =
  /** Write `value` at the mapping key the path ends on, inserting the key when it is absent. */
  | { readonly kind: 'set-scalar'; readonly path: readonly DnaTextStep[]; readonly value: unknown }
  /** Drop the mapping key the path ends on, with whatever block hangs below it. */
  | { readonly kind: 'delete-key'; readonly path: readonly DnaTextStep[] }
  /** Append `items` to the sequence the path ends on. */
  | { readonly kind: 'append-items'; readonly path: readonly DnaTextStep[]; readonly items: readonly unknown[] }
  /** Drop the items at `indexes` from the sequence the path ends on. */
  | { readonly kind: 'remove-items'; readonly path: readonly DnaTextStep[]; readonly indexes: readonly number[] }
  /** Replace the whole sequence the path ends on with `items`. */
  | { readonly kind: 'replace-list'; readonly path: readonly DnaTextStep[]; readonly items: readonly unknown[] }
  /** Apply several edits in order, verified once at the end (an entry update changing two fields). */
  | { readonly kind: 'batch'; readonly edits: readonly DnaTextEdit[] };

/** A mapping key found in the text, with everything needed to rewrite its line. */
interface KeyLine {
  readonly line: number;
  /** The column the key starts at — a `- ` prefix counts as two columns of indentation. */
  readonly indent: number;
  readonly key: string;
  /** Everything after the `:` — a value, an inline comment, both, or nothing. */
  readonly rest: string;
  /** Whether the key sits on a sequence-item line (`- name: core`). */
  readonly dash: boolean;
  /** The literal number of leading spaces, before any `- `. */
  readonly lead: number;
}

/** A half-open line range `[start, end)`. */
interface Region {
  readonly start: number;
  readonly end: number;
}

/** A block-mapping key line: optional `- `, a plain scalar key, `:`, then end-of-line or a space. */
const KEY_LINE = /^( *)(- )?([A-Za-z0-9_][A-Za-z0-9_.+-]*):(?=$| )(.*)$/;

/** Literal leading-space count. */
function indentOf(line: string): number {
  return line.length - line.trimStart().length;
}

/** Whether a line carries no content of its own (blank, or a whole-line comment). */
function isFiller(line: string): boolean {
  const trimmed = line.trim();
  return trimmed === '' || trimmed.startsWith('#');
}

/** Parse a line as a block-mapping key, or `undefined` when it is not one. */
function keyLineAt(lines: readonly string[], index: number): KeyLine | undefined {
  const line = lines[index]!;
  const match = KEY_LINE.exec(line);
  if (match === null) return undefined;
  const lead = match[1]!.length;
  const dash = match[2] !== undefined;
  return { line: index, indent: lead + (dash ? 2 : 0), key: match[3]!, rest: match[4]!, dash, lead };
}

/** Whether a line opens a sequence item (`- …`) at exactly `indent`. */
function isItemLine(line: string, indent: number): boolean {
  return indentOf(line) === indent && line.trimStart().startsWith('-');
}

/**
 * The lines belonging to the block under the key on `keyLine` — everything indented deeper, plus a
 * sequence written at the key's own indentation (`key:` then `- item` in the same column, which YAML
 * permits and some hand-written files use).
 */
function blockRegion(lines: readonly string[], key: KeyLine): Region {
  let end = key.line + 1;
  for (let i = key.line + 1; i < lines.length; i += 1) {
    const line = lines[i]!;
    if (line.trim() === '') continue;
    const indent = indentOf(line);
    if (indent > key.indent || (indent === key.indent && line.trimStart().startsWith('-') && !key.dash)) {
      end = i + 1;
      continue;
    }
    break;
  }
  return { start: key.line + 1, end };
}

/** The column this block's own content starts at (its children's indentation). */
function childIndentOf(lines: readonly string[], region: Region): number | undefined {
  for (let i = region.start; i < region.end; i += 1) {
    const line = lines[i]!;
    if (isFiller(line)) continue;
    const indent = indentOf(line);
    return line.trimStart().startsWith('- ') || line.trim() === '-' ? indent + 2 : indent;
  }
  return undefined;
}

/** Find `key` among the mapping keys directly inside `region` at `indent`. */
function findKey(lines: readonly string[], region: Region, indent: number, key: string): KeyLine | undefined {
  for (let i = region.start; i < region.end; i += 1) {
    if (isFiller(lines[i]!)) continue;
    const candidate = keyLineAt(lines, i);
    if (candidate === undefined || candidate.indent !== indent || candidate.key !== key) continue;
    return candidate;
  }
  return undefined;
}

/** The line spans of the sequence items directly inside `region`, in order. */
function itemSpans(lines: readonly string[], region: Region): Region[] {
  let itemIndent: number | undefined;
  const starts: number[] = [];
  for (let i = region.start; i < region.end; i += 1) {
    const line = lines[i]!;
    if (isFiller(line)) continue;
    const indent = indentOf(line);
    if (itemIndent === undefined) {
      if (!line.trimStart().startsWith('-')) return [];
      itemIndent = indent;
    }
    if (isItemLine(line, itemIndent)) starts.push(i);
  }
  return starts.map((start, position) => ({ start, end: starts[position + 1] ?? region.end }));
}

/** Walking state: where we are in the text, and where this node's own children begin. */
interface Cursor {
  readonly region: Region;
  readonly indent: number;
  readonly key?: KeyLine;
}

/** Follow `path` through the text, returning where its last step lands — or `undefined` if it is absent. */
function locate(lines: readonly string[], path: readonly DnaTextStep[]): Cursor | undefined {
  let cursor: Cursor = { region: { start: 0, end: lines.length }, indent: 0 };
  for (const step of path) {
    if ('key' in step) {
      const key = findKey(lines, cursor.region, cursor.indent, step.key);
      if (key === undefined) return undefined;
      const region = blockRegion(lines, key);
      cursor = { region, indent: childIndentOf(lines, region) ?? key.indent + 2, key };
      continue;
    }
    const spans = itemSpans(lines, cursor.region);
    const span = spans[step.index];
    if (span === undefined) return undefined;
    cursor = { region: span, indent: childIndentOf(lines, span) ?? cursor.indent + 2 };
  }
  return cursor;
}

/**
 * Render a value as the single-line YAML token `js-yaml` itself would emit — which is what keeps this
 * editor's bytes identical to the whole-file `dump()` fallback's at the same position, including
 * defensive quoting (`'2'` stays a string, `'y'` is quoted because YAML 1.1 reads a bare `y` as a
 * boolean).
 *
 * `flowLevel: 0` is what makes the result always a single line: every container is emitted in flow
 * style and every scalar escaped rather than folded, so a value carrying a newline comes back as
 * `"a\nb"` rather than a block scalar. That is why this returns a `string` and not `string |
 * undefined` — there is no value the callers can pass that has no single-line form.
 */
function renderInline(value: unknown): string {
  return dump(value, { lineWidth: -1, flowLevel: 0 }).replace(/\n$/, '');
}

/** Rebuild a key line with a new value, keeping its indentation, its `- ` prefix and its inline comment. */
function rewriteKeyLine(line: string, key: KeyLine, scalar: string): string {
  const head = `${' '.repeat(key.lead)}${key.dash ? '- ' : ''}${key.key}: ${scalar}`;
  const commentIndex = inlineCommentIndex(key.rest);
  if (commentIndex < 0) return head;
  const column = key.indent + key.key.length + 1 + commentIndex;
  const gap = column > head.length ? ' '.repeat(column - head.length) : ' ';
  return head + gap + key.rest.slice(commentIndex);
}

/** Render one sequence item as its own lines, at `indent`. */
function renderItem(item: unknown, indent: number): string[] | undefined {
  const pad = ' '.repeat(indent);
  if (item === null || typeof item !== 'object' || Array.isArray(item)) {
    return [`${pad}- ${renderInline(item)}`];
  }
  const entries = Object.entries(item as Record<string, unknown>);
  if (entries.length === 0) return undefined; // an empty mapping has no `- key: value` form
  return entries.map(([key, value], index) => `${pad}${index === 0 ? '- ' : '  '}${key}: ${renderInline(value)}`);
}

/** Render a flow sequence, copying the bracket spacing of the line it replaces. */
function renderFlow(items: readonly unknown[], spaced: boolean): string {
  if (items.length === 0) return '[]';
  const body = items.map((item) => renderInline(item)).join(', ');
  return spaced ? `[ ${body} ]` : `[${body}]`;
}

/** The last index in `region` that carries content, so an insert lands before a trailing comment block. */
function lastContentLine(lines: readonly string[], region: Region): number {
  let last = region.start - 1;
  for (let i = region.start; i < region.end; i += 1) {
    if (!isFiller(lines[i]!)) last = i;
  }
  return last;
}

/** The value `path` addresses inside an already-mutated document (used to re-render a flow sequence). */
function valueAtPath(document: unknown, path: readonly DnaTextStep[]): unknown {
  let node: unknown = document;
  for (const step of path) {
    if ('key' in step) {
      if (typeof node !== 'object' || node === null || Array.isArray(node)) return undefined;
      node = (node as Record<string, unknown>)[step.key];
    } else {
      if (!Array.isArray(node)) return undefined;
      node = node[step.index];
    }
  }
  return node;
}

/** Order-insensitive structural equality — key ORDER is a rendering detail, key VALUES are the contract. */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, index) => deepEqual(item, b[index]));
  }
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const leftKeys = Object.keys(left);
  if (leftKeys.length !== Object.keys(right).length) return false;
  return leftKeys.every((key) => Object.prototype.hasOwnProperty.call(right, key) && deepEqual(left[key], right[key]));
}

/**
 * Write a value at the mapping key the path ends on, inserting the key — and any of its parent keys the
 * text does not carry — when it is absent ({@link insertMissingPath}).
 *
 * A key holding a block scalar (`>-`, `|`) is rewritten as a one-line key and its continuation lines
 * are dropped: those lines ARE the old value, so removing them is the edit, not a loss (task-193,
 * `bug-019`). An inline comment on the key line is kept, as for any other rewrite.
 */
function editSetScalar(lines: string[], path: readonly DnaTextStep[], value: unknown): string[] | undefined {
  const scalar = renderInline(value);
  const parentPath = path.slice(0, -1);
  const last = path[path.length - 1];
  if (last === undefined || !('key' in last)) return undefined;

  const parent = locate(lines, parentPath);
  const existing = parent === undefined ? undefined : findKey(lines, parent.region, parent.indent, last.key);
  if (existing === undefined) {
    return insertMissingPath(lines, path, (indent) => [`${' '.repeat(indent)}${last.key}: ${scalar}`]);
  }

  const region = blockRegion(lines, existing);
  const currentValue = valueOf(existing.rest);
  if (currentValue.startsWith('|') || currentValue.startsWith('>')) {
    lines.splice(existing.line, Math.max(region.end, existing.line + 1) - existing.line, rewriteKeyLine(lines[existing.line]!, existing, scalar));
    return lines;
  }
  // A value that continues past its own line (a nested block) has no one-line edit.
  if (region.end > existing.line + 1) return undefined;
  lines[existing.line] = rewriteKeyLine(lines[existing.line]!, existing, scalar);
  return lines;
}

/**
 * Insert a key the text does not carry, together with every ancestor key it does not carry either
 * (task-193, `bug-126`: the first `dna add team.agents` on a file with no `agents:`, or a
 * `dna set project.name` on a file with no `project:`). The deepest ancestor the text DOES carry is the
 * parent; each missing key is written on its own line, two columns deeper than the one before, at the
 * end of the parent's content (before any trailing comment block, which introduces what comes next).
 * `render` writes the last key's own line(s) at the indentation it is handed.
 *
 * Declines when a missing step is a sequence index (there is no entry to descend into), or when the
 * parent key holds an inline value — a flow mapping `{ a: 1 }`, a plain scalar — under which no block
 * line can be added. An empty flow mapping `{}` holds nothing to lose, so it is opened into a block
 * (`paths: {}` becomes `paths:`) and the key inserted below it.
 */
function insertMissingPath(
  lines: string[],
  path: readonly DnaTextStep[],
  render: (indent: number) => string[] | undefined,
): string[] | undefined {
  let depth = path.length - 1;
  let parent = locate(lines, path.slice(0, depth));
  while (parent === undefined) {
    depth -= 1;
    parent = locate(lines, path.slice(0, depth));
  }
  const missing = path.slice(depth);
  if (!missing.every((step) => 'key' in step)) return undefined;

  const key = parent.key;
  if (key !== undefined) {
    const currentValue = valueOf(key.rest);
    if (currentValue === '{}') {
      lines[key.line] = rewriteKeyLine(lines[key.line]!, key, '').replace(/: $/, ':');
    } else if (currentValue !== '') {
      return undefined;
    }
  }

  const keys = missing.map((step) => (step as { key: string }).key);
  const opened = keys.slice(0, -1).map((name, level) => `${' '.repeat(parent.indent + 2 * level)}${name}:`);
  const tail = render(parent.indent + 2 * opened.length);
  if (tail === undefined) return undefined;
  // `lastContentLine` returns `region.start - 1` for an empty block, so the insert lands at its start.
  lines.splice(lastContentLine(lines, parent.region) + 1, 0, ...opened, ...tail);
  return lines;
}

/** Drop the mapping key the path ends on, together with the block hanging below it. */
function editDeleteKey(lines: string[], path: readonly DnaTextStep[]): string[] | undefined {
  const cursor = locate(lines, path);
  if (cursor?.key === undefined) return undefined;
  const region = blockRegion(lines, cursor.key);
  lines.splice(cursor.key.line, Math.max(region.end, cursor.key.line + 1) - cursor.key.line);
  return lines;
}

/** Append items to the sequence the path ends on, in whichever form that sequence is written. */
function editAppendItems(
  lines: string[],
  path: readonly DnaTextStep[],
  items: readonly unknown[],
  intended: unknown,
): string[] | undefined {
  const cursor = locate(lines, path);
  if (cursor === undefined) {
    // The sequence is absent from the text (the first entry of `team.agents`, task-193 / `bug-126`):
    // open it under its parent, with the new items as its first lines.
    const last = path[path.length - 1];
    if (last === undefined || !('key' in last)) return undefined;
    return insertMissingPath(lines, path, (indent) => {
      const rendered = renderItems(items, indent + 2);
      return rendered === undefined ? undefined : [`${' '.repeat(indent)}${last.key}:`, ...rendered];
    });
  }
  if (cursor.key === undefined) return undefined;
  const key = cursor.key;
  const currentValue = valueOf(key.rest);

  // An inline flow sequence (`roles: [ approver ]`) — or an empty one, which becomes a block below.
  if (currentValue.startsWith('[')) {
    if (currentValue !== '[]') return rewriteFlow(lines, key, path, intended);
    const rendered = renderItems(items, key.indent + 2);
    if (rendered === undefined) return undefined;
    lines[key.line] = rewriteKeyLine(lines[key.line]!, key, '').replace(/: $/, ':');
    lines.splice(key.line + 1, 0, ...rendered);
    return lines;
  }
  if (currentValue !== '') return undefined; // the key holds a plain scalar: not a sequence at all

  const region = blockRegion(lines, key);
  const spans = itemSpans(lines, region);
  const itemIndent = spans.length > 0 ? indentOf(lines[spans[0]!.start]!) : childIndentOf(lines, region) ?? key.indent + 2;
  const rendered = renderItems(items, itemIndent);
  if (rendered === undefined) return undefined;
  lines.splice(lastContentLine(lines, region) + 1, 0, ...rendered);
  return lines;
}

/** Drop items from the sequence the path ends on. */
function editRemoveItems(
  lines: string[],
  path: readonly DnaTextStep[],
  indexes: readonly number[],
  intended: unknown,
): string[] | undefined {
  const cursor = locate(lines, path);
  if (cursor?.key === undefined) return undefined;
  const key = cursor.key;
  if (valueOf(key.rest).startsWith('[')) return rewriteFlow(lines, key, path, intended);

  const region = blockRegion(lines, key);
  const spans = itemSpans(lines, region);
  if (spans.length === 0) return undefined;
  for (const index of [...indexes].sort((a, b) => b - a)) {
    const span = spans[index];
    if (span === undefined) return undefined;
    // Trailing comment/blank lines introduce whatever comes NEXT, so they are not this item's to delete.
    const end = lastContentLine(lines, span) + 1;
    lines.splice(span.start, end - span.start);
  }
  const remaining = valueAtPath(intended, path);
  if (Array.isArray(remaining) && remaining.length === 0) {
    lines[key.line] = rewriteKeyLine(lines[key.line]!, key, '[]');
  }
  return lines;
}

/** Replace the whole sequence the path ends on. */
function editReplaceList(
  lines: string[],
  path: readonly DnaTextStep[],
  items: readonly unknown[],
  intended: unknown,
): string[] | undefined {
  const cursor = locate(lines, path);
  if (cursor?.key === undefined) return undefined;
  const key = cursor.key;
  if (valueOf(key.rest).startsWith('[')) return rewriteFlow(lines, key, path, intended);

  const region = blockRegion(lines, key);
  const spans = itemSpans(lines, region);
  if (spans.length === 0) return undefined;
  const itemIndent = indentOf(lines[spans[0]!.start]!);
  const rendered = renderItems(items, itemIndent);
  if (rendered === undefined) return undefined;
  const from = spans[0]!.start;
  const to = lastContentLine(lines, spans[spans.length - 1]!) + 1;
  lines.splice(from, to - from, ...rendered);
  return lines;
}

/** Re-render an inline flow sequence from the intended document, keeping the line's bracket spacing. */
function rewriteFlow(lines: string[], key: KeyLine, path: readonly DnaTextStep[], intended: unknown): string[] | undefined {
  const items = valueAtPath(intended, path);
  if (!Array.isArray(items)) return undefined;
  lines[key.line] = rewriteKeyLine(lines[key.line]!, key, renderFlow(items, /\[\s/.test(valueOf(key.rest))));
  return lines;
}

/** Render several sequence items at `indent`, or `undefined` when any of them needs more than one line. */
function renderItems(items: readonly unknown[], indent: number): string[] | undefined {
  const out: string[] = [];
  for (const item of items) {
    const rendered = renderItem(item, indent);
    if (rendered === undefined) return undefined;
    out.push(...rendered);
  }
  return out;
}

/** Apply one edit to `lines` in place, returning `undefined` when it has no provably-minimal form. */
function applyOne(lines: string[], edit: DnaTextEdit, intended: unknown): string[] | undefined {
  switch (edit.kind) {
    case 'set-scalar':
      return editSetScalar(lines, edit.path, edit.value);
    case 'delete-key':
      return editDeleteKey(lines, edit.path);
    case 'append-items':
      return editAppendItems(lines, edit.path, edit.items, intended);
    case 'remove-items':
      return editRemoveItems(lines, edit.path, edit.indexes, intended);
    case 'replace-list':
      return editReplaceList(lines, edit.path, edit.items, intended);
    case 'batch': {
      let current: string[] | undefined = lines;
      for (const inner of edit.edits) {
        current = applyOne(current, inner, intended);
        if (current === undefined) return undefined;
      }
      return current;
    }
  }
}


/**
 * The one shape the walker above cannot reach: a scalar whose PARENT key is itself absent from the
 * text, so there is no block to insert into (`project.name` in a file with no `project:` at all).
 * `setDnaValueInText` (`task-063`) already solves exactly that — it inserts the missing tail of a
 * mapping path, comments intact — so it is reused rather than re-implemented, for the mapping-only
 * paths it understands. Anything else still falls through to the caller's `dump()`.
 */
function insertMissingScalarPath(text: string, edit: DnaTextEdit): string | undefined {
  if (edit.kind !== 'set-scalar' || typeof edit.value !== 'string') return undefined;
  if (!edit.path.every((step) => 'key' in step)) return undefined;
  const keyPath = edit.path.map((step) => (step as { key: string }).key).join('.');
  return setDnaValueInText(text, keyPath, edit.value);
}

/**
 * Apply `edit` to the RAW TEXT of a `dna.yaml`, editing as few lines as possible, and return the new
 * text — or `undefined`, deliberately and not as an error, when no provably-minimal edit exists, so the
 * caller falls back to the whole-file `dump()`.
 *
 * `intended` is the document the mutation produced (`applyDnaMutation`'s `dna`). It serves twice: an
 * inline flow sequence is re-rendered from it rather than patched token-by-token, and — the part that
 * makes this safe — the edited text is re-parsed and compared against it in full before being returned.
 * Structural equality is used rather than a byte comparison because key ORDER is a rendering detail
 * while key values are the contract; a mis-located edit fails the comparison and costs the comments,
 * never the content.
 *
 * Declines (returns `undefined`) when: the text is not one valid YAML document; a step of the path is
 * absent from the text; the target or a value it must rewrite spans more than its own line (a block
 * scalar, a nested block); a value has no single-line YAML form; or the result does not read back as
 * `intended`.
 */
export function applyDnaEditInText(text: string, edit: DnaTextEdit, intended: unknown): string | undefined {
  try {
    load(text); // never "repair" input the caller could not read in the first place
  } catch {
    return undefined;
  }

  // CRLF line endings (task-193, `bug-019`): the key-line pattern cannot span a `\r`, so a file whose
  // every line ends in CRLF is edited in its LF form and written back with CRLF. A file mixing the two
  // has no single ending to restore and is edited as it is, where its LF lines allow.
  const crlf = text.includes('\r\n') && !text.replace(/\r\n/g, '').includes('\n');
  const source = crlf ? text.replace(/\r\n/g, '\n') : text;

  const edited = applyOne(source.split('\n'), edit, intended) ?? insertMissingScalarPath(source, edit);
  if (edited === undefined) return undefined;

  const result = Array.isArray(edited) ? edited.join('\n') : edited;
  let parsed: unknown;
  try {
    parsed = load(result);
  } catch {
    return undefined;
  }
  if (!deepEqual(parsed, intended)) return undefined;
  return crlf ? result.replace(/\n/g, '\r\n') : result;
}
