/**
 * The closest-match suggestion for an unknown command (`spec-008-cli-grammar` §1, `spec-005-cli-command-contract`
 * §3.1; task-179, `bug-104`). WingFoil computes it rather than relaying Commander's own
 * `(Did you mean …?)`: `spec-008` §1 names Levenshtein distance ≤ 2, Commander's matcher is
 * Damerau–Levenshtein with distance ≤ 3, and its wording is not the `hint:` line `spec-005` §3.1
 * declares. Pure and deterministic (REQ-SYS-07): the result depends on the token and the SET of
 * candidates, never on their order.
 */

import { closestName, levenshtein } from '../core/closest-name';

export { levenshtein };

/**
 * The command nearest to `token` within the shared matcher's distance, or `undefined` when none is that
 * close (the shared matcher, `closestName`, which now lives in core).
 */
export function closestCommand(token: string, candidates: readonly string[]): string | undefined {
  return closestName(token, candidates);
}

/** The `hint:` text for a suggested command, in `spec-005` §3.1's words: `did you mean "<name>"?`. */
export function unknownCommandHint(name: string): string {
  return `did you mean "${name}"?`;
}
