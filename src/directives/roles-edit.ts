/**
 * Pure, comment-preserving edits of `.wingfoil/roles.yaml` role → directive assignments
 * (task-051-directive-assign, P3.2), plus the `--directive a,b,c` value parser multi-directive
 * assignment needs (task-056-role-based-directive-assignment, P3.7).
 *
 * P3.7 reuses {@link withAssignedDirectives} and {@link setRoleAssignmentsInText} unchanged — both
 * were written to take a *list* of ids from the start. `directive remove` (P3.3, task-052) reuses
 * **neither**: P3.3 refuses a still-assigned directive rather than unbinding it, so a removal has no
 * `roles.yaml` write to make (see `src/core/directive-assign.ts`'s module doc).
 *
 * `roles.yaml` is hand-annotated configuration, so a whole-file `js-yaml` `dump()` — which drops every
 * comment — is not an acceptable write path (bug-004 for `dna.yaml`, and bug-019 for the silent
 * fallback). Like the DNA editor (`applyDnaEditInText`, `src/dna/edit.ts`, task-093) this module edits
 * the raw text line by line, touching only the lines of one role's list, and needs no YAML CST dependency
 * (dl-010). Anything it cannot edit provably yields `undefined`, leaving the fallback decision to the
 * caller.
 *
 * Zero imports besides `js-yaml`: no filesystem, no git, no clock (REQ-SYS-07 — outputs are a pure
 * function of the inputs), and no dependency on `src/core` (the pillar stays a leaf).
 */
import { dump, load } from 'js-yaml';

/**
 * The set semantics of assigning `ids` to a role currently bound to `current`: existing ids keep
 * their order, ids not yet present are appended in argument order, and no id ever appears twice
 * (P3.7 "Binding is idempotent"). No sorting, so an assignment never moves an existing line.
 *
 * @param current - The role's current assignment list (from `roles.yaml`).
 * @param ids - Directive ids to assign.
 * @returns A new array; `current` is not mutated.
 */
export function withAssignedDirectives(current: readonly string[], ids: readonly string[]): string[] {
  const next = [...current];
  for (const id of ids) {
    if (!next.includes(id)) next.push(id);
  }
  return next;
}

/**
 * Parse the CLI `--directive "a,b,c"` value into the directive ids it names (P3.7, US-4-06,
 * task-056-role-based-directive-assignment): split on commas, trim each segment, drop the empty ones,
 * and de-duplicate keeping each id's FIRST position.
 *
 * The comma-separated spelling follows `memory add --tags "a,b"` (`parseTags`, `src/memory/add.ts`),
 * the project's existing list-valued option: the CLI option seam carries one `string` per `--{name}`
 * (`CliCommand.options` → `ParamsContext.options`), so a list travels inside the value rather than as
 * a repeated flag. A value with no comma yields a one-element list, which is why P3.2's single-id
 * invocation is byte-for-byte unchanged.
 *
 * De-duplication happens here rather than being left to {@link withAssignedDirectives} — which also
 * de-duplicates — because this list is *echoed*: it becomes `DirectiveAssignResult.directives` and the
 * ids named in the commit subject, and `--directive testing,testing` must not produce a subject naming
 * `testing` twice.
 *
 * @param raw - The raw `--directive` value.
 * @returns The ids, in argument order, without duplicates; **empty** when the value contributes none
 *   (`""`, `"  "`, `","`), which the caller treats as a missing argument rather than as an empty id —
 *   `directiveAssignFn`, spec-008 §4.
 */
export function parseDirectiveIds(raw: string): string[] {
  const ids: string[] = [];
  for (const segment of raw.split(',')) {
    const id = segment.trim();
    if (id.length > 0 && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

interface Line {
  readonly indent: number;
  readonly body: string;
}

const COMMENT_OR_BLANK = /^\s*(#.*)?$/;
const EMPTY_FLOW_VALUE = /^(\s*.*?):\s*\[\s*\](\s*#.*)?$/;
const NULL_VALUE = /^(\s*.*?):(\s+#.*)?$/;
const ITEM = /^-\s+(.*)$/;

function parseLine(raw: string): Line {
  const body = raw.trimStart();
  return { indent: raw.length - body.length, body };
}

function isContent(raw: string): boolean {
  return !COMMENT_OR_BLANK.test(raw);
}

/** Parse a YAML fragment, or `undefined` when it is not valid YAML. */
function tryLoad(text: string): unknown {
  try {
    return load(text);
  } catch {
    return undefined;
  }
}

/** Render a scalar exactly as a whole-file `dump` would, or `undefined` when it would span lines. */
function renderScalar(value: string): string | undefined {
  const rendered = dump(value, { lineWidth: -1 }).replace(/\n$/, '');
  return rendered.includes('\n') ? undefined : rendered;
}

/** The single key and value of a `key: value` mapping line, or `undefined` when it is not one. */
function mappingEntry(body: string): { key: string; value: unknown } | undefined {
  const parsed = tryLoad(body);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
  const keys = Object.keys(parsed);
  if (keys.length !== 1) return undefined;
  return { key: keys[0] as string, value: (parsed as Record<string, unknown>)[keys[0] as string] };
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Read `edited` back and confirm `assignments.<role>` is exactly `next` while every other top-level
 * key and every other role is unchanged — the safety net behind the textual edit (it catches, e.g., a
 * YAML alias elsewhere in the file that would silently change along with the edited list).
 */
function readsBackAs(original: string, edited: string, role: string, next: readonly string[]): boolean {
  const before = tryLoad(original) as Record<string, unknown> | undefined;
  const after = tryLoad(edited) as Record<string, unknown> | undefined;
  if (!before || !after) return false;
  const beforeAssignments = { ...(before.assignments as Record<string, unknown>) };
  const afterAssignments = { ...(after.assignments as Record<string, unknown>) };
  const roleMatches = sameJson(afterAssignments[role], next);
  delete beforeAssignments[role];
  delete afterAssignments[role];
  return roleMatches && sameJson({ ...before, assignments: beforeAssignments }, { ...after, assignments: afterAssignments });
}

/**
 * Rewrite `assignments.<role>` in the raw `roles.yaml` text to exactly `next`, leaving every other
 * line — comments, blank lines, other roles, `global`, inline comments on kept items — byte-for-byte
 * intact.
 *
 * `next` is realized as the current list with some items deleted (greedy in-order match) followed by
 * appended ids, so it covers assignment (append), removal (delete) and any combination. New item
 * lines adopt the indentation of the role's existing items (else the key's indentation + 2); a role
 * with no `assignments` entry yet (dl-029) gets its key inserted after the block's last content line,
 * before any trailing blank/comment lines. An emptied list becomes `role: []`; an empty flow list
 * `role: []` becomes a block list. CRLF files keep CRLF.
 *
 * @param text - The current `roles.yaml` file content.
 * @param role - The role whose assignment list is rewritten.
 * @param next - The exact list `assignments.<role>` must hold afterwards.
 * @returns The edited text; `text` itself when nothing changes; `undefined` when the edit cannot be
 *   made provably — no block `assignments:` mapping, a non-empty flow list, a non-scalar or multi-line
 *   item, tab indentation, mixed line endings, or a re-parse that does not read back as intended.
 */
export function setRoleAssignmentsInText(text: string, role: string, next: readonly string[]): string | undefined {
  const crlf = text.includes('\r\n');
  if (crlf && text.replace(/\r\n/g, '').includes('\n')) return undefined;
  if (!crlf && text.includes('\r')) return undefined;
  const eol = crlf ? '\r\n' : '\n';
  const lines = text.split(eol);
  if (lines.some((raw) => /^\s*\t/.test(raw))) return undefined;

  const header = lines.findIndex((raw) => /^assignments:(\s+#.*)?$/.test(raw));
  if (header < 0) return undefined;

  // The block runs until the next top-level content line; its insertion point is after its last
  // content line, so trailing blank/comment lines stay attached to whatever follows.
  let end = header + 1;
  let lastContent = header;
  while (end < lines.length) {
    const raw = lines[end] as string;
    if (isContent(raw)) {
      if (parseLine(raw).indent === 0) break;
      lastContent = end;
    }
    end += 1;
  }

  const firstChild = lines.slice(header + 1, lastContent + 1).find(isContent);
  const childIndent = firstChild === undefined ? 2 : parseLine(firstChild).indent;

  let keyIndex = -1;
  for (let i = header + 1; i <= lastContent; i += 1) {
    const raw = lines[i] as string;
    const line = parseLine(raw);
    if (!isContent(raw) || line.indent !== childIndent || line.body.startsWith('-')) continue;
    const entry = mappingEntry(line.body);
    if (entry === undefined) return undefined;
    if (entry.key === role) keyIndex = i;
  }

  const edited = keyIndex < 0
    ? insertRole(lines, header, lastContent, childIndent, role, next)
    : rewriteRole(lines, keyIndex, childIndent, lastContent, next);
  if (edited === undefined) return undefined;
  const result = edited.join(eol);
  if (result === text) return text;
  return readsBackAs(text, result, role, next) ? result : undefined;
}

function insertRole(
  lines: readonly string[],
  header: number,
  lastContent: number,
  childIndent: number,
  role: string,
  next: readonly string[],
): string[] | undefined {
  if (next.length === 0) return [...lines];
  const key = renderScalar(role);
  const items = next.map(renderScalar);
  if (key === undefined || items.some((item) => item === undefined)) return undefined;

  // Reuse the item indentation of an existing sibling list, so the new key matches its neighbours.
  const siblingItem = lines
    .slice(header + 1, lastContent + 1)
    .map(parseLine)
    .reverse()
    .find((line) => line.body.startsWith('- '));
  const itemIndent = siblingItem ? siblingItem.indent : childIndent + 2;
  const inserted = [
    `${' '.repeat(childIndent)}${key}:`,
    ...items.map((item) => `${' '.repeat(itemIndent)}- ${item as string}`),
  ];
  return [...lines.slice(0, lastContent + 1), ...inserted, ...lines.slice(lastContent + 1)];
}

function rewriteRole(
  lines: readonly string[],
  keyIndex: number,
  childIndent: number,
  lastContent: number,
  next: readonly string[],
): string[] | undefined {
  const keyLine = lines[keyIndex] as string;
  const entry = mappingEntry(parseLine(keyLine).body);
  const isEmptyFlow = Array.isArray(entry?.value) && (entry?.value as unknown[]).length === 0;
  if (!isEmptyFlow && entry?.value !== null) return undefined;

  // Collect the role's item lines (and interleaved comments) up to the next sibling key.
  const itemIndices: number[] = [];
  const current: string[] = [];
  let i = keyIndex + 1;
  for (; i <= lastContent; i += 1) {
    const raw = lines[i] as string;
    if (!isContent(raw)) continue;
    const line = parseLine(raw);
    if (line.indent < childIndent || (line.indent === childIndent && !line.body.startsWith('-'))) break;
    const item = ITEM.exec(line.body);
    if (isEmptyFlow || item === null) return undefined;
    const value = tryLoad(item[1] as string);
    if (typeof value !== 'string') return undefined;
    itemIndices.push(i);
    current.push(value);
  }

  // Greedy in-order match: keep the current items `next` still wants, in order; delete the rest;
  // append whatever of `next` is left.
  const deleted = new Set<number>();
  let matched = 0;
  current.forEach((id, index) => {
    if (matched < next.length && next[matched] === id) matched += 1;
    else deleted.add(itemIndices[index] as number);
  });
  const appended = next.slice(matched).map(renderScalar);
  if (appended.some((item) => item === undefined)) return undefined;

  const firstItem = itemIndices[0];
  const itemIndent = firstItem === undefined ? childIndent + 2 : parseLine(lines[firstItem] as string).indent;
  const appendAfter = itemIndices.length > 0 ? (itemIndices[itemIndices.length - 1] as number) : keyIndex;
  const newItems = appended.map((item) => `${' '.repeat(itemIndent)}- ${item as string}`);

  const out: string[] = [];
  lines.forEach((raw, index) => {
    if (deleted.has(index)) {
      if (index === appendAfter) out.push(...newItems);
      return;
    }
    if (index === keyIndex) out.push(renderKeyLine(raw, next.length === 0));
    else out.push(raw);
    if (index === appendAfter) out.push(...newItems);
  });
  return out;
}

/** The role's key line in block form (`key:`) or, for an emptied list, flow form (`key: []`). */
function renderKeyLine(raw: string, empty: boolean): string {
  const flow = EMPTY_FLOW_VALUE.exec(raw);
  const bare = flow ?? NULL_VALUE.exec(raw);
  if (bare === null) return raw;
  const [, key, comment = ''] = bare;
  return empty ? `${key as string}: []${comment}` : `${key as string}:${comment}`;
}
