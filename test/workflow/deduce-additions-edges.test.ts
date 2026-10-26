/**
 * task-294 (developer, refactor) — the argument shapes of `memory.add(type: T, …)` the red suite of
 * `DeducedStep.additions` does not vary (design D2 as ruled): an unquoted scalar is a rule like a quoted one, a
 * part with no `:` is no argument, a quoted value may hold a comma, and a candidate without the field does not
 * match a rule on it.
 */
import { deduceWorkflowState, resolveInstanceRef, type DeductionSnapshot } from '../../src/core';
import { el, life, plan, snapshot } from './helpers/adopt-snapshot';

function candidateIds(snap: DeductionSnapshot): string[] {
  const step = resolveInstanceRef(deduceWorkflowState(snap), 'life-1-plan')!.frontier[0]!;
  return step.additions[0]!.candidates.map((ref) => `${ref.type}:${ref.id}`);
}

const LINES = [
  el('release-line', 'rl-a', 'planning', { version: 'v1', area: 'core, cli' }),
  el('release-line', 'rl-b', 'planning', { version: 'v2', area: 'core, cli' }),
  el('release-line', 'rl-c', 'planning'),
  plan('life-1-plan', 'life'),
];

describe('task-294 — memory.add argument shapes as declared rules', () => {
  it('an unquoted scalar filters like a quoted one; a candidate without the field does not match', () => {
    const flow = life(`  - name: seed\n    actions:\n      - 'memory.add(type: release-line, version: v1)'\n`);
    expect(candidateIds(snapshot([flow], LINES))).toEqual(['release-line:rl-a']);
  });

  it('a part with no ":" is no argument; a quoted value holding a comma is one value', () => {
    const flow = life(`  - name: seed\n    actions:\n      - "memory.add(type: release-line, draft, area: 'core, cli')"\n`);
    expect(candidateIds(snapshot([flow], LINES))).toEqual(['release-line:rl-a', 'release-line:rl-b']);
  });
});
