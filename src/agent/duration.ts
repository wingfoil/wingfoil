/**
 * `agent execute --timeout <duration>`'s grammar (`spec-016-agent-execution` §3.1, `spec-008-cli-grammar` §12,
 * `dl-181` Q4 (a); task-335, approver ruling D5 (a)): `<n>s`, `<n>m` or `<n>h`, `<n>` a positive integer without a
 * leading zero, at most `24h`, which stays well under the largest delay a Node timer takes (2^31 − 1 ms).
 *
 * A leaf module (no import), so `src/core/agent-execute.ts` can parse the option before the project is read.
 */

/** The longest bound `--timeout` accepts: 24 h. */
export const MAX_TIMEOUT_MS = 24 * 60 * 60 * 1000;

/** The form of a duration: the count, then its unit. */
const DURATION_RE = /^([1-9][0-9]*)(s|m|h)$/;

/** Milliseconds per unit. */
const UNIT_MS: Readonly<Record<string, number>> = { s: 1000, m: 60 * 1000, h: 60 * 60 * 1000 };

/**
 * Parse `raw` as a `--timeout` value: its length in milliseconds and its label (`raw` itself, which the
 * timeout's message echoes as given), or `spec-008` §12's reason without its `invalid flag value: ` prefix.
 */
export function parseDuration(raw: string): { ms: number; label: string } | { error: string } {
  const match = DURATION_RE.exec(raw);
  if (match === null) return { error: `--timeout expects <n>s, <n>m or <n>h, got "${raw}"` };
  const ms = Number(match[1]) * UNIT_MS[match[2]!]!;
  if (ms > MAX_TIMEOUT_MS) return { error: `--timeout must be at most 24h, got "${raw}"` };
  return { ms, label: raw };
}
