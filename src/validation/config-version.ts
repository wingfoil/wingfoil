/**
 * The bump comparison of a versioned config file's `version:` (task-208, `bug-249`): the one rule the
 * pending-change gate (`test/lint/helpers/version-bump.ts`, task-183) and the governance check's range
 * rule (`scripts/check-governance.cjs`) share, so the two cannot disagree about what a bump is.
 *
 * `.wingfoil/dna.yaml`, `memory.yaml`, `workflows.yaml` and `roles.yaml` declare `version:` as a number
 * (`memory.yaml`'s own annotation: "a NUMBER, compared numerically", `1.9 -> 2.0`, never `1.10`, which
 * YAML reads as `1.1`). A bump is therefore a numeric **increase** of the value YAML reads — not any
 * difference: a downgrade (`2.5 -> 2.4`) is no bump, nor is a re-quoting that reads as the same number
 * (`1.0 -> "1.0"`). A dotted string with more than two parts (`"1.2.3"`) is compared part by part as
 * integers. Pure (REQ-SYS-07).
 *
 * {@link raiseConfigVersion} is the writers' side of the same rule (`dl-174` (a), task-299): the next
 * revision a tool write commits, which this comparison then reads as a bump.
 */

/** A numeric reading of `value`: a finite number, or a string of digits with at most one dot. */
function asNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value.trim())) return Number(value.trim());
  return null;
}

/** The integer parts of a dotted version (`"1.10.0"` → `[1, 10, 0]`), or `null` when it is not one. */
function asParts(value: unknown): number[] | null {
  const text = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : null;
  if (text === null || !/^\d+(?:\.\d+)*$/.test(text)) return null;
  return text.split('.').map(Number);
}

/**
 * True when `after` is a bump over `before`: both read as versions and `after` is strictly greater.
 * `before` and `after` are the values YAML reads for `version:` (a number, or a string when quoted).
 * Anything else — absent, `null`, not a version — is never a bump.
 */
export function isVersionIncrease(before: unknown, after: unknown): boolean {
  const a = asNumber(before);
  const b = asNumber(after);
  if (a !== null && b !== null) return b > a;
  const left = asParts(before);
  const right = asParts(after);
  if (left === null || right === null) return false;
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const l = left[index] ?? 0;
    const r = right[index] ?? 0;
    if (r !== l) return r > l;
  }
  return false;
}

/**
 * The first line starting `version:` at column 0, then its value as a plain token, a one-line `"…"` or a
 * one-line `'…'` scalar. A nested `version:` (indented) or a commented one is not matched. It is a text match,
 * not a YAML parse: a quoted `"version"` key or a value on the next line is not matched, and a column-0
 * `version:` inside a multi-line scalar would be.
 */
const VERSION_LINE_RE = /^(version:[ \t]*)("(?:[^"\\\n]|\\.)*"|'(?:[^'\n]|'')*'|[^\s#'"]+)/m;

/**
 * The `version:` a tool writes into a versioned config file it writes whole for the first time
 * (`spec-006` §6 item 7, `dl-174` (a)): `directive assign` with no `roles.yaml` (`spec-011`), `workflow create`
 * with no `workflows.yaml` (`spec-017` §7.7). Written as text, so it reads `1.0`, not YAML's `1`.
 */
export const INITIAL_CONFIG_VERSION = '1.0';

/**
 * `text` with its `version:` raised to the next content revision (`dl-047`), the rule every tool write of a
 * versioned config file applies in its own commit (`spec-006` §6 item 7, `dl-174` (a), task-299): the value
 * on the first top-level `version:` line, plain or quoted, read as digits with at most one dot (`1.10` is
 * `1.1`, as YAML reads it; a quoted digit string as its number) plus 0.1, rounded at 1e-6 so
 * `1.2 → 1.3` carries no float noise, printed with at least one decimal (`1.9 → 2.0`, `1 → 1.1`), in the
 * value's own quotes. Every other byte — the spacing after the colon, the trailing comment, every other line —
 * is kept, and no history entry is added: the `wf()` commit is the record.
 *
 * A text with no such line, or whose value is not digits with at most one dot, is returned unchanged — so
 * are other spellings YAML reads as numbers (`1e1`, `.5`, `1.`, `+1.2`): a file without `version:` gains none. The four files' schemas declare `version` a number, so the writers
 * never reach the second case. Pure (REQ-SYS-07).
 */
export function raiseConfigVersion(text: string): string {
  const match = VERSION_LINE_RE.exec(text);
  if (match === null) return text;
  const token = match[2] as string;
  const quote = token.startsWith('"') || token.startsWith("'") ? (token[0] as string) : '';
  const current = asNumber(quote === '' ? token : token.slice(1, -1));
  if (current === null) return text;
  const raised = Math.round((current + 0.1) * 1e6) / 1e6;
  const next = Number.isInteger(raised) ? raised.toFixed(1) : String(raised);
  const start = match.index + (match[1] as string).length;
  return `${text.slice(0, start)}${quote}${next}${quote}${text.slice(start + token.length)}`;
}
