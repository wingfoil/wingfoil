/**
 * task-294 AC 2 (red-first) — `planAdoptions(snapshot, instanceId)` (`src/workflow/adopt.ts`; `spec-017` §7.11
 * `--plan`, rule 6; design D1, D3 as ruled), pure, on hand-built snapshots:
 *
 * - the instance's live adoptions first, oldest first, `recorded: true`, their element as the one candidate (D3);
 * - then, from the frontier, every step blocked on a creation — its phase adds a type, it created none of it, and
 *   `created` is its only declared evidence besides `record` (D1) — with its candidates; a step with exactly one
 *   candidate counts as adopted (a simulated adoption) and the walk deduces again;
 * - a step with zero or several candidates is listed and stops its branch; a gate, a `state` or a `record` step
 *   stops the walk;
 * - deterministic, and the snapshot given is never mutated.
 *
 * The suite reads `steps` only: the orphans and the `ElementRef`s of the result are the core's (§8).
 */
import { planAdoptions } from '../../src/workflow/adopt';
import { adoption, ADR, CLOSE, el, GATE, hist, life, plan, SEED_V1, snapshot } from './helpers/adopt-snapshot';

const RL_1 = { type: 'release-line', id: 'rl-1', status: 'planning' };
const ADR_1 = { type: 'adr', id: 'adr-1', status: 'accepted' };

const stepsOf = (snap: Parameters<typeof planAdoptions>[0]) => planAdoptions(snap, 'life-1-plan').steps;

describe('task-294 — planAdoptions: the walk (spec-017 §7.11 --plan)', () => {
  it('counts a single-candidate step as adopted and deduces again: a step reachable only after it is listed', () => {
    const snap = snapshot([life(SEED_V1 + ADR + CLOSE)], [el('release-line', 'rl-1', 'planning', { version: 'v1' }), el('adr', 'adr-1', 'accepted'), plan('life-1-plan', 'life')]);
    expect(stepsOf(snap)).toEqual([
      { step: 'life.seed', type: 'release-line', candidates: [RL_1], recorded: false },
      { step: 'life.adr@release-line:rl-1', type: 'adr', candidates: [ADR_1], recorded: false },
    ]);
  });

  it('a step with several candidates is listed, in id order, and stops its branch', () => {
    const snap = snapshot(
      [life(SEED_V1 + ADR + CLOSE)],
      [el('release-line', 'rl-2', 'planning', { version: 'v1' }), el('release-line', 'rl-1', 'planning', { version: 'v1' }), el('adr', 'adr-1', 'accepted'), plan('life-1-plan', 'life')],
    );
    expect(stepsOf(snap)).toEqual([{ step: 'life.seed', type: 'release-line', candidates: [RL_1, { type: 'release-line', id: 'rl-2', status: 'planning' }], recorded: false }]);
  });

  it('a step with no candidate is listed and stops its branch', () => {
    const snap = snapshot([life(SEED_V1 + ADR + CLOSE)], [el('release-line', 'rl-1', 'planning', { version: 'v2' }), el('adr', 'adr-1', 'accepted'), plan('life-1-plan', 'life')]);
    expect(stepsOf(snap)).toEqual([{ step: 'life.seed', type: 'release-line', candidates: [], recorded: false }]);
  });

  it('stops at a gate: an adoption proves creation only, never passes a state', () => {
    const snap = snapshot([life(SEED_V1 + GATE + ADR + CLOSE)], [el('release-line', 'rl-1', 'planning', { version: 'v1' }), el('adr', 'adr-1', 'accepted'), plan('life-1-plan', 'life')]);
    expect(stepsOf(snap)).toEqual([{ step: 'life.seed', type: 'release-line', candidates: [RL_1], recorded: false }]);
  });

  it('a step whose phase declares other evidence than created is not blocked on a creation, and is not listed (design D1)', () => {
    const produced = life(`  - name: seed
    actions:
      - 'memory.add(type: release-line, version: "v1")'
    produces: [ "docs/notes/readme.md" ]
`);
    const snap = snapshot([produced], [el('release-line', 'rl-1', 'planning', { version: 'v1' }), plan('life-1-plan', 'life')]);
    expect(stepsOf(snap)).toEqual([]);
  });

  it("lists the instance's recorded adoptions first, recorded: true, then what is still proposed (design D3)", () => {
    const history = new Map([['s0', hist({ adoptions: [adoption('a1', 0, 'life-1-plan', 'life.seed', 'release-line', 'rl-1')] })]]);
    const parents = new Map<string, readonly string[]>([
      ['a1', ['s0']],
      ['s0', []],
    ]);
    const snap = snapshot([life(SEED_V1 + ADR + CLOSE)], [el('release-line', 'rl-1', 'planning', { version: 'v1' }), el('adr', 'adr-1', 'accepted'), plan('life-1-plan', 'life')], { history, parents });
    expect(stepsOf(snap)).toEqual([
      { step: 'life.seed', type: 'release-line', candidates: [RL_1], recorded: true },
      { step: 'life.adr@release-line:rl-1', type: 'adr', candidates: [ADR_1], recorded: false },
    ]);
  });
});

describe('task-294 — planAdoptions is pure', () => {
  const build = () =>
    snapshot([life(SEED_V1 + ADR + CLOSE)], [el('release-line', 'rl-1', 'planning', { version: 'v1' }), el('adr', 'adr-1', 'accepted'), plan('life-1-plan', 'life')], {
      history: new Map([['s0', hist({})]]),
      parents: new Map<string, readonly string[]>([['s0', []]]),
    });

  it('answers the same on two calls', () => {
    const snap = build();
    expect(JSON.stringify(planAdoptions(snap, 'life-1-plan'))).toBe(JSON.stringify(planAdoptions(snap, 'life-1-plan')));
  });

  it('never mutates the snapshot it is given (its simulated adoptions live in a copy)', () => {
    const snap = build();
    const history = structuredClone(snap.history);
    const parents = structuredClone(snap.parents);
    const documents = structuredClone(snap.documents);
    planAdoptions(snap, 'life-1-plan');
    expect(snap.history).toEqual(history);
    expect(snap.parents).toEqual(parents);
    expect(snap.documents).toEqual(documents);
  });
});
