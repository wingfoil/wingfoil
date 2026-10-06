/**
 * The closest-match suggestion for an unknown command (`spec-008-cli-grammar` §1, `spec-005-cli-command-contract`
 * §3.1; task-179, `bug-104`). WingFoil computes it rather than relaying Commander's own
 * `(Did you mean …?)`: `spec-008` §1 names Levenshtein distance ≤ 2, Commander's matcher is
 * Damerau–Levenshtein with distance ≤ 3, and its wording is not the `hint:` line `spec-005` §3.1
 * declares. Pure and deterministic (REQ-SYS-07): the result depends on the token and the SET of
 * candidates, never on their order.
 */

/** The largest edit distance at which a command is still suggested (`spec-008` §1). */
export const SUGGESTION_MAX_DISTANCE = 2;

/** Levenshtein distance between `a` and `b`: insertions, deletions and substitutions, each costing 1. */
export function levenshtein(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const substitution = previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1);
      current.push(Math.min(previous[j]! + 1, current[j - 1]! + 1, substitution));
    }
    previous = current;
  }
  return previous[b.length]!;
}

/**
 * The candidate nearest to `token` within {@link SUGGESTION_MAX_DISTANCE}, or `undefined` when none is
 * that close. A tie goes to the candidate first in code-unit order; the token itself is never suggested.
 */
export function closestCommand(token: string, candidates: readonly string[]): string | undefined {
  let best: { name: string; distance: number } | undefined;
  for (const name of [...new Set(candidates)].sort()) {
    if (name === token) continue;
    const distance = levenshtein(token, name);
    if (distance <= SUGGESTION_MAX_DISTANCE && (best === undefined || distance < best.distance)) best = { name, distance };
  }
  return best?.name;
}

/** The `hint:` text for a suggested command, in `spec-005` §3.1's words: `did you mean "<name>"?`. */
export function unknownCommandHint(name: string): string {
  return `did you mean "${name}"?`;
}
