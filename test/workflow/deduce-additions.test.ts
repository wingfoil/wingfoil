/**
 * task-294 AC 1 (red-first) — `DeducedStep.additions` (design "Candidates (rule 5) and 'blocked on a creation'"):
 * per type the step's phase adds — `memory.add(type: T)` actions, then `{ type: T, path }` produces entries,
 * deduplicated, in declared order — the step's created elements of `T` and, when it created none, the rule-5
 * candidates: the elements of `T` at `HEAD`, not archived (§4.11), neither owned nor in a conflict (§4.8),
 * matching the declared rules (design D2 as ruled: the scalar arguments of `memory.add(type: T, …)` other than
 * `type` and `title`, literal or with every token resolved in the step's frames; the `{ type: T, path }` entry's
 * path resolved for the candidate; no `iterate_over` filter), ascending `(type, id)`.
 *
 * Pure: `deduceWorkflowState` on hand-built snapshots. `additions` is read through a local view, so the suite
 * compiles before the field exists and fails on its assertions (it is `undefined` at red).
 */
import { deduceWorkflowState, resolveInstanceRef, type DeductionSnapshot } from '../../src/core';
import { adoption, el, hist, life, link, plan, snapshot, wf } from './helpers/adopt-snapshot';

interface Ref {
  readonly type: string;
  readonly id: string;
  readonly status: string;
}
interface Addition {
  readonly type: string;
  readonly created: readonly Ref[];
  readonly candidates: readonly Ref[];
}

/** The `additions` of the first frontier step of `instance`. */
function additionsOf(snap: DeductionSnapshot, instance = 'life-1-plan'): readonly Addition[] {
  const found = resolveInstanceRef(deduceWorkflowState(snap), instance);
  const step = found?.frontier[0];
  if (step === undefined) throw new Error(`no frontier step for ${instance}`);
  const additions = (step as unknown as { additions?: readonly Addition[] }).additions;
  if (additions === undefined) throw new Error(`the frontier step ${step.key} carries no additions`);
  return additions;
}

const ids = (refs: readonly Ref[]): string[] => refs.map((ref) => `${ref.type}:${ref.id}`);

describe('task-294 — the types a step adds', () => {
  it('memory.add actions first, then { type, path } entries, deduplicated, in declared order', () => {
    const multi = life(`  - name: make
    actions:
      - 'memory.add(type: spec)'
      - 'memory.add(type: bug)'
      - 'memory.add(type: spec)'
    produces:
      - { type: spec, path: "docs/specs/{spec.id}.md" }
      - { type: task, path: "docs/tasks/{task.id}.md" }
`);
    expect(additionsOf(snapshot([multi], [plan('life-1-plan', 'life')])).map((entry) => entry.type)).toEqual(['spec', 'bug', 'task']);
  });

  it('a phase that adds nothing has no additions', () => {
    const check = life(`  - name: check\n    actions:\n      - agent.execute\n`);
    expect(additionsOf(snapshot([check], [plan('life-1-plan', 'life')]))).toEqual([]);
  });
});

describe('task-294 — rule-5 candidates (design D2 as ruled)', () => {
  it('a literal argument filters: version: "v1" matches only the release-lines whose version is v1', () => {
    const flow = life(`  - name: seed\n    actions:\n      - 'memory.add(type: release-line, version: "v1")'\n`);
    const result = additionsOf(
      snapshot([flow], [el('release-line', 'rl-a', 'planning', { version: 'v1' }), el('release-line', 'rl-b', 'planning', { version: 'v2' }), plan('life-1-plan', 'life')]),
    );
    expect(result).toEqual([{ type: 'release-line', created: [], candidates: [{ type: 'release-line', id: 'rl-a', status: 'planning' }] }]);
  });

  it('title: is never a rule, literal or not (rule 5: never by title)', () => {
    const flow = life(`  - name: seed\n    actions:\n      - 'memory.add(type: release-line, title: "End-of-life plan")'\n`);
    const result = additionsOf(snapshot([flow], [el('release-line', 'rl-a', 'planning'), el('release-line', 'rl-b', 'planning'), plan('life-1-plan', 'life')]));
    expect(ids(result[0]!.candidates)).toEqual(['release-line:rl-a', 'release-line:rl-b']);
  });

  it("a token argument resolved in the step's frames filters: release-line: \"{release-line.version}\" on the bound release-line", () => {
    const flow = wf(`name: releases
kind: main
element: release-line
phases:
  - name: seed-releases
    actions:
      - 'memory.add(type: release, release-line: "{release-line.version}")'
`);
    const result = additionsOf(
      snapshot(
        [flow],
        [
          el('release-line', 'rl-a', 'planning', { version: 'v1' }),
          el('release', 'rel-1', 'planning', { 'release-line': 'v1' }),
          el('release', 'rel-2', 'planning', { 'release-line': 'v2' }),
          plan('releases-1-plan', 'releases', 'rl-a'),
        ],
      ),
      'releases-1-plan',
    );
    expect(result).toEqual([{ type: 'release', created: [], candidates: [{ type: 'release', id: 'rel-1', status: 'planning' }] }]);
  });

  it('an argument whose token does not resolve is no rule', () => {
    const flow = wf(`name: releases
kind: main
element: release-line
phases:
  - name: seed-releases
    actions:
      - 'memory.add(type: release, release-line: "{release-line.nope}")'
`);
    const result = additionsOf(
      snapshot(
        [flow],
        [el('release-line', 'rl-a', 'planning', { version: 'v1' }), el('release', 'rel-1', 'planning', { 'release-line': 'v1' }), el('release', 'rel-2', 'planning', { 'release-line': 'v2' }), plan('releases-1-plan', 'releases', 'rl-a')],
      ),
      'releases-1-plan',
    );
    expect(ids(result[0]!.candidates)).toEqual(['release:rel-1', 'release:rel-2']);
  });

  it('a list argument is no rule', () => {
    const flow = life(`  - name: plan-tasks\n    actions:\n      - 'memory.add(type: task, tags: ["v1"])'\n`);
    const result = additionsOf(snapshot([flow], [el('task', 'task-1', 'draft', { tags: ['v1'] }), el('task', 'task-2', 'draft', { tags: ['v2'] }), plan('life-1-plan', 'life')]));
    expect(ids(result[0]!.candidates)).toEqual(['task:task-1', 'task:task-2']);
  });

  it("a { type, path } entry filters: its path, resolved for the candidate, is the candidate's path", () => {
    const flow = life(`  - name: design\n    produces:\n      - { type: spec, path: "docs/specs/{spec.id}.md" }\n`);
    const result = additionsOf(snapshot([flow], [el('spec', 'spec-1', 'approved'), el('spec', 'spec-2', 'approved', {}, 'docs/specs/old/spec-2.md'), plan('life-1-plan', 'life')]));
    expect(result).toEqual([{ type: 'spec', created: [], candidates: [{ type: 'spec', id: 'spec-1', status: 'approved' }] }]);
  });

  it('leaves out an archived element, an owned one and one in a conflict; lists the rest in ascending (type, id)', () => {
    const flow = life(`  - name: seed\n    actions:\n      - 'memory.add(type: release-line)'\n`);
    const documents = [
      el('release-line', 'rl-z', 'planning'),
      el('release-line', 'rl-a', 'planning'),
      el('release-line', 'rl-m', 'active'),
      el('release-line', 'rl-dep', 'deprecated'),
      el('release-line', 'rl-owned', 'planning'),
      el('release-line', 'rl-conflict', 'planning'),
      plan('life-1-plan', 'life'),
      plan('life-2-plan', 'life'),
    ];
    // life-2-plan (start s1): rl-owned linked to its seed; rl-conflict adopted twice on two unrelated branches.
    const history = new Map([
      ['s0', hist({})],
      [
        's1',
        hist({
          adoptions: [adoption('a2', 0, 'life-2-plan', 'life.seed', 'release-line', 'rl-conflict'), adoption('a1', 1, 'life-2-plan', 'life.seed', 'release-line', 'rl-conflict')],
          links: [link('c1', 2, 'life-2-plan', 'life.seed', 'release-line', 'rl-owned')],
        }),
      ],
    ]);
    const parents = new Map<string, readonly string[]>([
      ['a2', ['c1']],
      ['a1', ['c1']],
      ['c1', ['s1']],
      ['s1', ['s0']],
      ['s0', []],
    ]);
    const result = additionsOf(snapshot([flow], documents, { history, parents }));
    expect(result).toEqual([
      {
        type: 'release-line',
        created: [],
        candidates: [
          { type: 'release-line', id: 'rl-a', status: 'planning' },
          { type: 'release-line', id: 'rl-m', status: 'active' },
          { type: 'release-line', id: 'rl-z', status: 'planning' },
        ],
      },
    ]);
  });

  it('a step that created an element of the type lists it under created, and no candidate', () => {
    const flow = life(`  - name: design\n    actions:\n      - 'memory.add(type: spec)'\n    produces: [ "docs/notes/readme.md" ]\n`);
    const history = new Map([['s0', hist({ links: [link('c1', 0, 'life-1-plan', 'life.design', 'spec', 'spec-1')] })]]);
    const parents = new Map<string, readonly string[]>([
      ['c1', ['s0']],
      ['s0', []],
    ]);
    const result = additionsOf(snapshot([flow], [el('spec', 'spec-1', 'draft'), el('spec', 'spec-2', 'approved'), plan('life-1-plan', 'life')], { history, parents }));
    expect(result).toEqual([{ type: 'spec', created: [{ type: 'spec', id: 'spec-1', status: 'draft' }], candidates: [] }]);
  });
});
