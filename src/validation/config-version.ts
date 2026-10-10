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
