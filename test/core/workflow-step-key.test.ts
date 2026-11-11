/**
 * task-356 AC 3 (red-first, `bug-468`; `spec-017` §4.9 as amended at the design gate; approver ruling D4 (a)) — the
 * pure helper every `--step` site resolves its key through: `resolveFrontierKey(frontier, key)` of the new module
 * `src/core/workflow-step-key.ts`.
 *
 * - an exact key first: a frontier step whose `key` equals the given one is the answer, whatever else matches;
 * - else, for a key without `@`, the frontier steps whose `<workflow>.<phase>` equals it, in frontier order: one is
 *   `{ kind: 'one', step }`, several `{ kind: 'many', steps }`;
 * - else `{ kind: 'none' }`: a scoped key that is not on the frontier stays unmatched even when its unscoped part
 *   names a frontier step.
 *
 * Until the module exists the suite fails at its import (jest `Cannot find module`, tsc TS2307): the red the
 * design names. The frontiers below are plain values of the helper's declared shape (`key`, `workflow`, `phase`);
 * the keys are the shape `spec-017` §4.9 gives (`<workflow>.<phase>[@<type>:<id> | @<collection>#<key>]`).
 */
import { resolveFrontierKey } from '../../src/core/workflow-step-key';

interface FrontierStep {
  readonly key: string;
  readonly workflow: string;
  readonly phase: string;
}

const step = (workflow: string, phase: string, scope?: string): FrontierStep => ({
  key: scope === undefined ? `${workflow}.${phase}` : `${workflow}.${phase}@${scope}`,
  workflow,
  phase,
});

const IMPLEMENT_A = step('loop', 'implement', 'task:task-202-explicit-override');
const IMPLEMENT_B = step('loop', 'implement', 'task:task-203-sibling');
const REVIEW_A = step('loop', 'review', 'task:task-202-explicit-override');
const CLOSE = step('retro', 'close');
const CHECK_KANBAN = step('per-template', 'check', 'bindings:templates#kanban');

describe('task-356 AC 3 — resolveFrontierKey (spec-017 §4.9, bug-468)', () => {
  it('an exact scoped key resolves to that step', () => {
    const frontier = [IMPLEMENT_A, IMPLEMENT_B];
    const resolved = resolveFrontierKey(frontier, IMPLEMENT_B.key);
    expect(resolved).toEqual({ kind: 'one', step: IMPLEMENT_B });
    if (resolved.kind === 'one') expect(resolved.step).toBe(frontier[1]);
  });

  it('an unscoped key matching exactly one frontier step resolves to it', () => {
    const frontier = [IMPLEMENT_A, REVIEW_A, CLOSE];
    expect(resolveFrontierKey(frontier, 'loop.review')).toEqual({ kind: 'one', step: REVIEW_A });
  });

  it('an unscoped key matching a collection-scoped step resolves to it', () => {
    expect(resolveFrontierKey([CHECK_KANBAN], 'per-template.check')).toEqual({ kind: 'one', step: CHECK_KANBAN });
  });

  it('an unscoped key matching two frontier steps is many, the steps in frontier order', () => {
    expect(resolveFrontierKey([IMPLEMENT_B, CLOSE, IMPLEMENT_A], 'loop.implement')).toEqual({ kind: 'many', steps: [IMPLEMENT_B, IMPLEMENT_A] });
  });

  it('the exact key wins over the unscoped match: an unscoped frontier key equal to the given one is one, not many', () => {
    const unscoped = step('loop', 'implement');
    expect(resolveFrontierKey([IMPLEMENT_A, unscoped, IMPLEMENT_B], 'loop.implement')).toEqual({ kind: 'one', step: unscoped });
  });

  it('an unscoped key naming no frontier step is none', () => {
    expect(resolveFrontierKey([IMPLEMENT_A, IMPLEMENT_B], 'loop.review')).toEqual({ kind: 'none' });
  });

  it('a scoped key not on the frontier is none, even when its unscoped part names a frontier step', () => {
    expect(resolveFrontierKey([IMPLEMENT_A], 'loop.implement@task:nope')).toEqual({ kind: 'none' });
  });

  it('an empty frontier is none', () => {
    expect(resolveFrontierKey([], 'loop.implement')).toEqual({ kind: 'none' });
  });

  it('a prefix of a workflow or phase name does not match', () => {
    expect(resolveFrontierKey([IMPLEMENT_A], 'loop.imp')).toEqual({ kind: 'none' });
    expect(resolveFrontierKey([IMPLEMENT_A], 'loop')).toEqual({ kind: 'none' });
  });
});
