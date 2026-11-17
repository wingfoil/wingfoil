/**
 * A `--step <key>` resolved against an instance's frontier (task-356, `bug-468`; `spec-017` §4.9 "A key given to a
 * command", §10; `spec-016` §3.2 step 1). The one rule the four commands that take `--step` share: `workflow
 * finalize`, `workflow adopt`, `memory add --workflow` and `agent execute`.
 *
 * - a frontier step whose key equals the given one is the step it names;
 * - else a key without a scope (`<workflow>.<phase>`, no `@`) names the frontier steps of that workflow and phase,
 *   whatever their scope: one is the step, several are {@link ambiguousStepKey}'s refusal;
 * - else nothing matches, and each command keeps its own out-of-frontier refusal (`spec-017` §10).
 *
 * A scoped key is matched exactly. Pure: the frontier's order is the deduction's, kept as given (`REQ-SYS-07`).
 */
import { coreErr, type CoreResult } from './types';

/** The fields of a frontier step the resolution reads: its key and the workflow and phase it runs. */
export interface FrontierKeyed {
  readonly key: string;
  readonly workflow: string;
  readonly phase: string;
}

/** What a key names on a frontier: one step, several (an unscoped key only), or none. */
export type FrontierKeyResolution<T> = { readonly kind: 'one'; readonly step: T } | { readonly kind: 'many'; readonly steps: T[] } | { readonly kind: 'none' };

/** The step `key` names on `frontier` (`spec-017` §4.9): the exact key first, then an unscoped key's matches. */
export function resolveFrontierKey<T extends FrontierKeyed>(frontier: readonly T[], key: string): FrontierKeyResolution<T> {
  const exact = frontier.find((step) => step.key === key);
  if (exact !== undefined) return { kind: 'one', step: exact };
  if (key.includes('@')) return { kind: 'none' };
  const matches = frontier.filter((step) => `${step.workflow}.${step.phase}` === key);
  if (matches.length === 0) return { kind: 'none' };
  if (matches.length === 1) return { kind: 'one', step: matches[0]! };
  return { kind: 'many', steps: matches };
}

/**
 * `spec-017` §10's refusal of an unscoped key naming several frontier steps: `CONFLICT`, `step '<key>' names <N>
 * steps of <instance>: give --step, one of: <k1>, <k2>`, the keys in frontier order, also in `details.steps`.
 */
export function ambiguousStepKey(key: string, instance: string, steps: readonly FrontierKeyed[]): CoreResult<never> {
  const keys = steps.map((step) => step.key);
  return coreErr({
    code: 'CONFLICT',
    message: `step '${key}' names ${keys.length} steps of ${instance}: give --step, one of: ${keys.join(', ')}`,
    details: { step: key, instance, steps: keys },
  });
}
