/**
 * The in-place edit of `.wingfoil/workflows.yaml`'s `include:` list that `wingfoil workflow create` and
 * `wingfoil workflow remove` commit (task-211, `spec-017` §7.7–§7.8). Pure text functions: the file's
 * comments, blank lines, quoting and line endings are kept; only the one entry line is added or removed.
 *
 * A block-style list is edited; anything else — a flow-style `include: [ … ]`, no `include:` key, a list with
 * no block entry — is refused with a reason, and so is an edit whose result does not read back as the old
 * list plus (or minus) that one entry. There is no whole-file fallback: a rewrite would drop the comments
 * this repository's own manifest is made of, and no `--force` is specified for these commands.
 */
import { posix } from 'path';

import { parseYaml } from '../validation';

/** The edited text, or why the file cannot be edited in place. */
export type ManifestEdit = { readonly ok: true; readonly text: string } | { readonly ok: false; readonly reason: string };

/** One block-sequence entry of `include:`: its line, its indentation and its value as YAML reads it. */
interface IncludeItem {
  readonly line: number;
  readonly indent: string;
  readonly value: string;
}

/** The `include:` key at the top level, with nothing after it but an optional comment. */
const INCLUDE_KEY_RE = /^include:[ \t]*(?:#.*)?$/;

/** The `include:` key at the top level, with a value on its own line (a flow sequence or a scalar). */
const INCLUDE_INLINE_RE = /^include:[ \t]*[^ \t#]/;

/** A block-sequence item line: indentation, `-`, the value (and maybe a comment). */
const ITEM_RE = /^([ \t]*)-[ \t]+(\S.*)$/;

/** A value written as is: a path of the characters a workflow file path uses. */
const PLAIN_PATH_RE = /^[A-Za-z0-9._/-]+$/;

/** The scalar an item line holds: double-quoted, single-quoted, or plain up to a ` #` comment. */
function itemValue(raw: string): string {
  if (raw.startsWith('"')) {
    const end = /^"(?:[^"\\]|\\.)*"/.exec(raw);
    return end === null ? raw : (JSON.parse(end[0]) as string);
  }
  if (raw.startsWith("'")) {
    const end = /^'(?:[^']|'')*'/.exec(raw);
    return end === null ? raw : end[0].slice(1, -1).replace(/''/g, "'");
  }
  return raw.replace(/[ \t]+#.*$/, '').trim();
}

/** The include list as `parseYaml` reads `text`, or `null` when it is not a list of strings. */
function parsedInclude(text: string): string[] | null {
  try {
    const data = parseYaml(text, 'workflows.yaml') as { include?: unknown } | null;
    const include = data?.include;
    return Array.isArray(include) && include.every((entry) => typeof entry === 'string') ? (include as string[]) : null;
  } catch {
    return null;
  }
}

/** The lines of `text` and the line ending it uses (CRLF when it holds one, else LF). */
function splitLines(text: string): { lines: string[]; eol: string } {
  return { lines: text.split(/\r?\n/), eol: text.includes('\r\n') ? '\r\n' : '\n' };
}

/** The block entries of the top-level `include:` list, or why there are none to edit. */
function includeItems(lines: readonly string[]): { ok: true; items: IncludeItem[] } | { ok: false; reason: string } {
  const key = lines.findIndex((line) => INCLUDE_KEY_RE.test(line));
  if (key === -1) {
    return lines.some((line) => INCLUDE_INLINE_RE.test(line))
      ? { ok: false, reason: 'its include: list is not a block list (one "- <file>" per line)' }
      : { ok: false, reason: 'it has no top-level include: list' };
  }
  const items: IncludeItem[] = [];
  for (let line = key + 1; line < lines.length; line += 1) {
    const text = lines[line]!;
    if (/^[ \t]*(?:#.*)?$/.test(text)) continue;
    const item = ITEM_RE.exec(text);
    if (item === null) break;
    items.push({ line, indent: item[1]!, value: itemValue(item[2]!) });
  }
  return items.length === 0 ? { ok: false, reason: 'its include: list has no block entry' } : { ok: true, items };
}

/** `edited` when it reads back as `expected`, else the refusal. */
function verified(edited: string, expected: readonly string[]): ManifestEdit {
  const after = parsedInclude(edited);
  if (after === null || after.length !== expected.length || after.some((entry, index) => entry !== expected[index])) {
    return { ok: false, reason: 'the edited file does not read back as the expected include: list' };
  }
  return { ok: true, text: edited };
}

/**
 * `text` with `entry` appended to its `include:` list, after the last entry and at its indentation; with no
 * manifest (`null`), a new one holding that entry alone. Pure.
 */
export function withIncludeAdded(text: string | null, entry: string): ManifestEdit {
  const written = PLAIN_PATH_RE.test(entry) ? entry : JSON.stringify(entry);
  if (text === null) return { ok: true, text: `version: 1.0\ninclude:\n  - ${written}\n` };
  const before = parsedInclude(text);
  if (before === null) return { ok: false, reason: 'its include: is not a list of file paths' };
  const { lines, eol } = splitLines(text);
  const found = includeItems(lines);
  if (!found.ok) return found;
  const last = found.items[found.items.length - 1]!;
  const edited = [...lines.slice(0, last.line + 1), `${last.indent}- ${written}`, ...lines.slice(last.line + 1)].join(eol);
  return verified(edited, [...before, entry]);
}

/**
 * `text` with every `include:` entry that resolves to `entry` (`posix.normalize`, as the loader resolves an
 * entry under `.wingfoil/`) removed, line and all. Refused when no entry resolves to it. Pure.
 */
export function withIncludeRemoved(text: string, entry: string): ManifestEdit {
  const before = parsedInclude(text);
  if (before === null) return { ok: false, reason: 'its include: is not a list of file paths' };
  const target = posix.normalize(entry);
  const { lines, eol } = splitLines(text);
  const found = includeItems(lines);
  if (!found.ok) return found;
  const removed = new Set(found.items.filter((item) => posix.normalize(item.value) === target).map((item) => item.line));
  if (removed.size === 0) return { ok: false, reason: `no include: entry resolves to ${entry}` };
  const edited = lines.filter((_, line) => !removed.has(line)).join(eol);
  const expected = before.filter((value) => posix.normalize(value) !== target);
  // Removing the last entry leaves an `include:` with no value, which reads back as no list at all: not a
  // failure of the edit but a manifest `spec-003` refuses (Layer 1 needs one entry). The caller's prospective
  // load reports that as the workflows not loading (task-211 review F1), so it is not refused here.
  if (expected.length === 0) return { ok: true, text: edited };
  return verified(edited, expected);
}
