/**
 * task-294 — red after review (approver rulings 2026-10-25, reject 2f581d78): `planAdoptions`, pure.
 *
 * - **D1 re-ruled for `--plan`** (option (a); `dl-187` rule 6, `spec-017` §7.11 "what an adoption alone
 *   completes"): a frontier step is listed as blocked on a creation when simulating the adoption of its single
 *   candidate empties its missing evidence other than `record`. A phase whose `produces` is a plain string path
 *   naming the created element (`"docs/planning/{id}.md"`, as `sw-life-cycle.seed-first-release-line` declares) is
 *   completed by the adoption, so it is listed (red: today it is not, the reviewer's scratch run printed
 *   `nothing to adopt`). The `{ type, path }` form stays listed (characterization).
 * - **Finding 2**: within one frontier, the walk deduces again after each simulated adoption (one per iteration),
 *   so two frontier steps sharing one candidate do not both get it: the first, in walk order, is proposed it; the
 *   second, deduced again, carries the context element in its key and has no candidate left (red: today both
 *   `life.seed-a` and `life.seed-b` list `rl-1`).
 */
import { planAdoptions } from '../../src/workflow/adopt';
import { CLOSE, el, GATE, life, plan, snapshot } from './helpers/adopt-snapshot';

const RL_1 = { type: 'release-line', id: 'rl-1', status: 'planning' };

const stepsOf = (snap: Parameters<typeof planAdoptions>[0]) => planAdoptions(snap, 'life-1-plan').steps;
const documents = () => [el('release-line', 'rl-1', 'planning', { version: 'v1' }), plan('life-1-plan', 'life')];

const SEED_STRING_PRODUCES = `  - name: seed
    actions:
      - 'memory.add(type: release-line, version: "v1")'
      - memory.submit
    produces:
      - "docs/planning/{id}.md"
`;

const SEED_TYPED_PRODUCES = `  - name: seed
    actions:
      - 'memory.add(type: release-line, version: "v1")'
      - memory.submit
    produces:
      - { type: release-line, path: "docs/planning/{release-line.id}.md" }
`;

describe('task-294 red after review — D1 re-ruled: --plan lists a step one adoption completes', () => {
  it('a string produces path naming the created element: listed with its one candidate, the walk stops at the gate after it', () => {
    expect(stepsOf(snapshot([life(SEED_STRING_PRODUCES + GATE + CLOSE)], documents()))).toEqual([
      { step: 'life.seed', type: 'release-line', candidates: [RL_1], recorded: false },
    ]);
  });

  it('the { type, path } form stays listed (characterization)', () => {
    expect(stepsOf(snapshot([life(SEED_TYPED_PRODUCES + GATE + CLOSE)], documents()))).toEqual([
      { step: 'life.seed', type: 'release-line', candidates: [RL_1], recorded: false },
    ]);
  });
});

describe('task-294 red after review — finding 2: one simulated adoption per deduction', () => {
  const TWIN = `  - name: seed-a
    optional: true
    actions:
      - 'memory.add(type: release-line, version: "v1")'
  - name: seed-b
    actions:
      - 'memory.add(type: release-line, version: "v1")'
`;

  it('two frontier steps sharing one candidate: the first in walk order is proposed it, once; the second is deduced again', () => {
    const steps = stepsOf(snapshot([life(TWIN + CLOSE)], documents()));

    expect(steps[0]).toEqual({ step: 'life.seed-a', type: 'release-line', candidates: [RL_1], recorded: false });
    expect(steps.filter((entry) => entry.candidates.some((candidate) => candidate.id === 'rl-1'))).toHaveLength(1);
    expect(steps.map((entry) => entry.step)).not.toContain('life.seed-b');
    expect(steps.slice(1)).toEqual([{ step: 'life.seed-b@release-line:rl-1', type: 'release-line', candidates: [], recorded: false }]);
  });
});
