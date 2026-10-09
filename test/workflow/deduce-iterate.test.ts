/**
 * task-202 — `iterate_over`, live queries, optional and archived phases in the pure deduction
 * (`src/workflow/deduce.ts`; `spec-017` §4.6, §4.7, §4.10, §4.11; `dl-104` D2 (b); REQ-STATE-07;
 * P4.16, P4.13), on synthetic snapshots.
 *
 * - AC 1: BDD `p4-workflow/P4.16-include-composition.feature` sc. 1–3 (3 backlog + 1 done → 3
 *   iterations; a plain include runs once; zero matches → vacuous, with the note).
 * - AC 2: eligible / entered / complete (§4.6): the entry filter (`status`) and the scope filter, a
 *   task moved on by the sub staying entered, a list-valued `where` field matching a shared element.
 * - AC 3: `dna:<path>` / `bindings:<name>` collections (`spec-003` § "Collections"), declared order,
 *   keys, `{item}` / `{item.<field>}`, `WingFoil-Item` records.
 * - AC 4: §4.7 — `late` candidates after a later phase completes non-vacuously; a vacuous completion
 *   never closes an earlier phase.
 * - AC 5: §4.10 optional skip; §4.11 archived elements and `abandoned: true`.
 */
import { deduceWorkflowState, NO_ITERATION_NOTE, type DeductionSnapshot, type InstanceDeduction } from '../../src/core';
import { MemoryYaml } from '../../src/memory/schema';
import { parseYaml } from '../../src/validation';
import { Workflow } from '../../src/workflow/schema';

const MEMORY = MemoryYaml.parse(
  parseYaml(
    `version: 1.0
types:
  task:
    path: "docs/tasks/{id}.md"
    id_pattern: "task-{n}-{slug}"
    states:
      sequence: [ draft, pending, backlog, in-progress, in-review, done ]
  release:
    path: "docs/releases/{id}.md"
    states:
      sequence: [ draft, planning, in-development, releasing, released ]
      gates:
        releasing: { reject: in-development }
  bug:
    path: "docs/bugs/{id}.md"
    states:
      sequence: [ draft, open, closed ]
      gates:
        open: { reject: wontfix }
  adr:
    path: "docs/adrs/{id}.md"
    states:
      sequence: [ draft, pending, accepted, superseded ]
      waiting: [ accepted ]
  plan:
    path: "docs/plans/{scope}/{id}.md"
    states:
      sequence: [ draft, active, done ]
`,
    'memory.yaml',
  ),
);

const wf = (yaml: string): Workflow => Workflow.parse(parseYaml(yaml, 'workflow.yaml'));

type Doc = { path: string; frontmatter: Record<string, unknown>; body: string };

function doc(path: string, frontmatter: Record<string, unknown>): Doc {
  return { path, frontmatter, body: '' };
}

const task = (id: string, status: string, extra: Record<string, unknown> = {}): Doc => doc(`docs/tasks/${id}.md`, { id, type: 'task', status, ...extra });
const release = (id: string, status: string, extra: Record<string, unknown> = {}): Doc =>
  doc(`docs/releases/${id}.md`, { id, type: 'release', status, version: 'v1', ...extra });
const plan = (id: string, workflow: string, element = ''): Doc => doc(`docs/plans/x/${id}.md`, { id, type: 'plan', status: 'active', workflow, element });

function snapshot(workflows: Workflow[], documents: Doc[], extra: Partial<DeductionSnapshot> = {}): DeductionSnapshot {
  const plans = documents.filter((d) => d.frontmatter['type'] === 'plan');
  return {
    commit: 'c0ffee',
    workflows,
    workflowFiles: workflows.map((w) => `.wingfoil/workflows/custom/${w.name}.yaml`),
    registryDiagnostics: [],
    memoryYaml: MEMORY,
    documents,
    scanDiagnostics: [],
    tree: [],
    starts: new Map(plans.map((p, i) => [p.path, { commit: `s${i}`, position: i }])),
    history: new Map(),
    transitions: [],
    lastChanges: new Map(),
    parents: new Map(),
    dirty: [],
    ...extra,
  };
}

const first = (s: DeductionSnapshot): InstanceDeduction => deduceWorkflowState(s).instances[0]!;
const keys = (entry: InstanceDeduction): string[] => entry.frontier.map((step) => step.key);

/** The sub a release iterates per task: start (in-progress), finish (done). */
const DEV = wf(`name: dev
kind: sub
element: task
phases:
  - name: start
    actions:
      - element.set_state(in-progress)
  - name: finish
    actions:
      - element.set_state(done)
`);

/** P4.16's Background: `include: dev, iterate_over: task, where: { status: [backlog] }`, then a wrap-up. */
const REL = wf(`name: rel
kind: main
element: release
phases:
  - name: loop
    include: dev
    iterate_over: task
    where: { status: [ backlog ] }
  - name: wrap
    actions:
      - element.set_state(releasing)
`);

describe('task-202 AC 1 — BDD P4.16 (include composition) on the deduction', () => {
  it('sc. 1: 3 backlog tasks and 1 done task → the sub runs once per backlog task, in {n} order', () => {
    const entry = first(
      snapshot(
        [REL, DEV],
        [
          task('task-10-ten', 'backlog'),
          task('task-2-two', 'backlog'),
          task('task-3-three', 'backlog'),
          task('task-1-one', 'done'),
          release('r1', 'in-development'),
          plan('p1', 'rel', 'r1'),
        ],
      ),
    );
    expect(keys(entry)).toEqual(['dev.start@task:task-2-two', 'dev.start@task:task-3-three', 'dev.start@task:task-10-ten']);
    expect(entry.phases).toEqual([
      { phase: 'loop', state: 'current', iterations: { eligible: 3, entered: 0, complete: 1, late: 0 } },
      { phase: 'wrap', state: 'pending' },
    ]);
    expect(entry.frontier[0]!.trail).toEqual([
      { workflow: 'rel', phase: 'loop', scope: { element: { type: 'release', id: 'r1', status: 'in-development' } } },
      { workflow: 'dev', phase: 'start', scope: { element: { type: 'task', id: 'task-2-two', status: 'backlog' } } },
    ]);
    expect(entry.frontier[0]!.scope).toEqual({ element: { type: 'task', id: 'task-2-two', status: 'backlog' } });
  });

  it('sc. 2: a plain include runs exactly once, on the including element', () => {
    const setup = wf(`name: setup
kind: sub
phases:
  - name: only
    produces: [ "out/{id}.md" ]
`);
    const main = wf(`name: once
kind: main
element: release
phases:
  - name: prepare
    include: setup
`);
    const entry = first(snapshot([main, setup], [release('r1', 'planning'), plan('p1', 'once', 'r1')]));
    expect(keys(entry)).toEqual(['setup.only@release:r1']);
    expect(entry.phases).toEqual([{ phase: 'prepare', state: 'current' }]);
  });

  it('sc. 3: no task in backlog → the sub runs zero times; the phase completes vacuously with the note', () => {
    const entry = first(snapshot([REL, DEV], [task('task-1-one', 'draft'), release('r1', 'in-development'), plan('p1', 'rel', 'r1')]));
    expect(entry.phases[0]).toEqual({
      phase: 'loop',
      state: 'complete',
      vacuous: true,
      iterations: { eligible: 0, entered: 0, complete: 0, late: 0, note: 'no elements matched the iterate_over filter' },
    });
    expect(NO_ITERATION_NOTE).toBe('no elements matched the iterate_over filter');
    expect(keys(entry)).toEqual(['rel.wrap@release:r1']);
  });
});

describe('task-202 AC 2 — eligible, entered and complete candidates (spec-017 §4.6)', () => {
  const CYCLE = wf(`name: cycle
kind: main
element: release
phases:
  - name: loop
    include: dev
    iterate_over: task
    where: { status: [ backlog ], tags: [ "{release.version}" ] }
`);

  it('a task the sub moved out of the entry filter stays entered; a list-valued `where` field matches a shared element', () => {
    const entry = first(
      snapshot(
        [CYCLE, DEV],
        [
          task('task-4-moved', 'in-progress', { tags: ['v1', 'workflow'] }),
          task('task-5-waiting', 'backlog', { tags: ['v1'] }),
          task('task-6-other-release', 'backlog', { tags: ['v2'] }),
          task('task-7-not-ready', 'pending', { tags: ['v1'] }),
          task('task-8-finished', 'done', { tags: ['workflow', 'v1'] }),
          task('task-9-untagged', 'backlog'),
          release('r1', 'in-development'),
          plan('p1', 'cycle', 'r1'),
        ],
      ),
    );
    expect(keys(entry)).toEqual(['dev.finish@task:task-4-moved', 'dev.start@task:task-5-waiting']);
    expect(entry.phases[0]).toEqual({ phase: 'loop', state: 'current', iterations: { eligible: 1, entered: 1, complete: 1, late: 0 } });
  });

  it('review F1 (probe P2): only a phase before the sub\'s current phase makes a candidate entered', () => {
    const dev2 = wf(`name: dev2
kind: sub
element: task
phases:
  - name: kickoff
  - name: start
    actions:
      - element.set_state(in-progress)
  - name: finish
    actions:
      - element.set_state(done)
`);
    const rel2 = wf(`name: rel2
kind: main
element: release
phases:
  - name: loop
    include: dev2
    iterate_over: task
    where: { status: [ backlog ] }
  - name: wrap
    actions:
      - element.set_state(releasing)
`);
    // `start` is complete for the in-progress task, but `kickoff` (a checkpoint with no record) is the sub's
    // current phase: nothing before it is complete, so the task is not entered, and outside the entry filter
    // it is ignored.
    const entry = first(snapshot([rel2, dev2], [task('task-1-a', 'in-progress'), release('r1', 'in-development'), plan('p1', 'rel2', 'r1')]));
    expect(entry.phases[0]).toEqual({
      phase: 'loop',
      state: 'complete',
      vacuous: true,
      iterations: { eligible: 0, entered: 0, complete: 0, late: 0, note: NO_ITERATION_NOTE },
    });
    expect(keys(entry)).toEqual(['rel2.wrap@release:r1']);
  });

  it('the phase is complete when no candidate is eligible or entered, and the workflow moves on', () => {
    const entry = first(snapshot([CYCLE, DEV], [task('task-8-finished', 'done', { tags: ['v1'] }), release('r1', 'in-development'), plan('p1', 'cycle', 'r1')]));
    expect(entry.phases).toEqual([{ phase: 'loop', state: 'complete', iterations: { eligible: 0, entered: 0, complete: 1, late: 0 } }]);
    expect(entry.complete).toBe(true);
  });

  it('a `where` token with no value leaves the phase one unexpanded step and reports the token', () => {
    const deduction = deduceWorkflowState(snapshot([CYCLE, DEV], [task('task-5-waiting', 'backlog', { tags: ['v1'] }), release('r1', 'in-development', { version: '' }), plan('p1', 'cycle', 'r1')]));
    const step = deduction.instances[0]!.frontier[0]!;
    expect([step.key, step.evidence]).toEqual(['cycle.loop@release:r1', { kinds: ['include'], missing: ['include'], finalizable: false }]);
    expect(deduction.instances[0]!.phases).toEqual([{ phase: 'loop', state: 'current' }]);
    expect(deduction.diagnostics.map((d) => [d.path, d.message])).toEqual([
      ['phases[0].where.tags', "token '{release.version}' of cycle.loop has no value: release:r1 has no value for 'version'"],
    ]);
  });

  it('an id that does not match the {n} id_pattern iterates after every one that does', () => {
    const entry = first(
      snapshot([CYCLE, DEV], [task('legacy-a', 'backlog', { tags: ['v1'] }), task('task-12-b', 'backlog', { tags: ['v1'] }), task('task-3-c', 'backlog', { tags: ['v1'] }), release('r1', 'in-development'), plan('p1', 'cycle', 'r1')]),
    );
    expect(keys(entry)).toEqual(['dev.start@task:task-3-c', 'dev.start@task:task-12-b', 'dev.start@task:legacy-a']);
  });

  it('two ids with the same {n} iterate in byte-wise id order', () => {
    const entry = first(
      snapshot([CYCLE, DEV], [task('task-3-b', 'backlog', { tags: ['v1'] }), task('task-3-a', 'backlog', { tags: ['v1'] }), release('r1', 'in-development'), plan('p1', 'cycle', 'r1')]),
    );
    expect(keys(entry)).toEqual(['dev.start@task:task-3-a', 'dev.start@task:task-3-b']);
  });

  it('candidates with no {n} token in the id_pattern iterate in byte-wise id order', () => {
    const overReleases = wf(`name: line
kind: main
phases:
  - name: each
    include: rel-sub
    iterate_over: release
    where: { status: [ planning ] }
`);
    const relSub = wf(`name: rel-sub
kind: sub
element: release
phases:
  - name: go
    actions:
      - element.set_state(in-development)
`);
    const entry = first(snapshot([overReleases, relSub], [release('minor-b', 'planning'), release('minor-a', 'planning'), plan('p1', 'line')]));
    expect(keys(entry)).toEqual(['rel-sub.go@release:minor-a', 'rel-sub.go@release:minor-b']);
  });
});

describe('task-202 AC 3 — iterate_over a collection (dl-104 D2 (b), spec-003 § "Collections")', () => {
  const MODS = wf(`name: mods
kind: main
phases:
  - name: each-module
    include: per-module
    iterate_over: dna:modules
    where: { kind: [ lib ] }
  - name: each-template
    include: per-template
    iterate_over: bindings:templates
`);
  const PER_MODULE = wf(`name: per-module
kind: sub
phases:
  - name: write
    produces: [ "docs/modules/{item}.md", "{item.path}/README.md" ]
  - name: check
`);
  const PER_TEMPLATE = wf(`name: per-template
kind: sub
phases:
  - name: smoke
    produces: [ "out/{item}.log" ]
`);
  const collections = new Map<string, readonly unknown[]>([
    [
      'dna:modules',
      [
        { name: 'core', path: 'src/core', kind: 'lib' },
        { name: 'cli', path: 'src/cli', kind: 'app' },
        { name: 'agent', path: 'src/agent', kind: 'lib' },
      ],
    ],
    ['bindings:templates', ['kanban', 'scrum']],
  ]);

  it('iterates the matching entries in declared order, keyed by `name`, interpolating {item} and {item.<field>}', () => {
    const entry = first(
      snapshot([MODS, PER_MODULE, PER_TEMPLATE], [plan('p1', 'mods')], {
        collections: collections as DeductionSnapshot['collections'],
        tree: ['docs/modules/core.md', 'src/core/README.md'],
      }),
    );
    expect(keys(entry)).toEqual(['per-module.check@dna:modules#core', 'per-module.write@dna:modules#agent']);
    const write = entry.frontier[1]!;
    expect(write.scope).toEqual({ item: { collection: 'dna:modules', key: 'agent' } });
    expect(write.produces.map((p) => p.resolved)).toEqual([['docs/modules/agent.md'], ['src/agent/README.md']]);
    expect(entry.phases[0]).toEqual({ phase: 'each-module', state: 'current', iterations: { eligible: 1, entered: 1, complete: 0, late: 0 } });
  });

  it('a WingFoil-Item record completes a collection step; scalar entries are their own key', () => {
    const history = new Map([
      [
        's0',
        {
          records: [
            { commit: 'r1', position: 1, phase: 'per-module.check', instance: 'p1', element: null, item: 'dna:modules#core' },
            { commit: 'r2', position: 0, phase: 'per-module.check', instance: 'p1', element: null, item: 'dna:modules#agent' },
          ],
          links: [],
          reentries: [],
        },
      ],
    ]);
    const entry = first(
      snapshot([MODS, PER_MODULE, PER_TEMPLATE], [plan('p1', 'mods')], {
        collections: collections as DeductionSnapshot['collections'],
        tree: ['docs/modules/core.md', 'src/core/README.md', 'docs/modules/agent.md', 'src/agent/README.md', 'out/scrum.log'],
        history,
      }),
    );
    expect(entry.phases[0]).toEqual({ phase: 'each-module', state: 'complete', iterations: { eligible: 0, entered: 0, complete: 2, late: 0 } });
    expect(keys(entry)).toEqual(['per-template.smoke@bindings:templates#kanban']);
    expect(entry.frontier[0]!.produces[0]!.resolved).toEqual(['out/kanban.log']);
  });

  it('{item.<field>} of a scalar entry has no value; an absent collection has no candidates', () => {
    const scalarSub = wf(`name: per-template
kind: sub
phases:
  - name: smoke
    produces: [ "out/{item.name}.log" ]
`);
    const deduction = deduceWorkflowState(
      snapshot([MODS, PER_MODULE, scalarSub], [plan('p1', 'mods')], { collections: new Map([['bindings:templates', ['kanban']]]) }),
    );
    expect(deduction.instances[0]!.phases[0]).toMatchObject({ phase: 'each-module', state: 'complete', vacuous: true });
    expect(keys(deduction.instances[0]!)).toEqual(['per-template.smoke@bindings:templates#kanban']);
    expect(deduction.diagnostics.map((d) => d.message)).toEqual([
      "token '{item.name}' of per-template.smoke has no value: bindings:templates#kanban has no value for 'name'",
    ]);
  });
});

describe('task-202 AC 4 — live queries after the workflow moved on (spec-017 §4.7)', () => {
  const FLOW = wf(`name: flow
kind: main
element: release
phases:
  - name: triage
    where: { type: bug, status: [ open ] }
  - name: loop
    include: dev
    iterate_over: task
    where: { status: [ backlog ] }
  - name: wrap
    actions:
      - element.set_state(releasing)
`);

  it('a candidate matching after a later phase completed non-vacuously is `late`, not on the frontier', () => {
    const entry = first(
      snapshot(
        [FLOW, DEV],
        [
          doc('docs/bugs/bug-1.md', { id: 'bug-1', type: 'bug', status: 'open' }),
          task('task-3-late', 'backlog'),
          task('task-2-midway', 'in-progress'),
          task('task-1-done', 'done'),
          release('r1', 'releasing'),
          plan('p1', 'flow', 'r1'),
        ],
      ),
    );
    expect(entry.frontier).toEqual([]);
    expect(entry.complete).toBe(true);
    expect(entry.phases).toEqual([
      { phase: 'triage', state: 'complete' },
      { phase: 'loop', state: 'complete', iterations: { eligible: 0, entered: 0, complete: 1, late: 2 } },
      { phase: 'wrap', state: 'complete' },
    ]);
    expect(entry.late).toEqual([
      { type: 'bug', id: 'bug-1', status: 'open' },
      { type: 'task', id: 'task-2-midway', status: 'in-progress' },
      { type: 'task', id: 'task-3-late', status: 'backlog' },
    ]);
  });

  it('a later phase complete only vacuously never closes an earlier one', () => {
    const vacuousAfter = wf(`name: flow2
kind: main
element: release
phases:
  - name: loop
    include: dev
    iterate_over: task
    where: { status: [ backlog ] }
  - name: sweep
    where: { type: bug, status: [ open ] }
  - name: empty-loop
    include: dev
    iterate_over: task
    where: { status: [ pending ] }
  - name: close
`);
    const entry = first(snapshot([vacuousAfter, DEV], [task('task-1-a', 'backlog'), release('r1', 'in-development'), plan('p1', 'flow2', 'r1')]));
    expect(keys(entry)).toEqual(['dev.start@task:task-1-a']);
    expect(entry.phases.map((p) => p.state)).toEqual(['current', 'pending', 'pending', 'pending']);
    expect(entry.late).toEqual([]);
  });
});

describe('task-202 AC 5 — optional phases (§4.10) and archived elements (§4.11)', () => {
  const OPT = wf(`name: opt
kind: main
element: release
phases:
  - name: extra
    optional: true
  - name: plan
    actions:
      - element.set_state(planning)
  - name: develop
    actions:
      - element.set_state(in-development)
`);

  it('an unsatisfied optional phase is current and reported together with the next non-optional phase', () => {
    const entry = first(snapshot([OPT], [release('r1', 'draft'), plan('p1', 'opt', 'r1')]));
    expect(keys(entry)).toEqual(['opt.extra@release:r1', 'opt.plan@release:r1']);
    expect(entry.frontier.map((step) => step.optional)).toEqual([true, false]);
    expect(entry.phases.map((p) => p.state)).toEqual(['current', 'pending', 'pending']);
  });

  it('it is skipped once a later phase is complete non-vacuously', () => {
    const entry = first(snapshot([OPT], [release('r1', 'planning'), plan('p1', 'opt', 'r1')]));
    expect(entry.phases.map((p) => p.state)).toEqual(['skipped', 'complete', 'current']);
    expect(keys(entry)).toEqual(['opt.develop@release:r1']);
  });

  it('consecutive optional phases are all reported, up to and including the next non-optional one', () => {
    const twoOptional = wf(`name: opt3
kind: main
phases:
  - name: one
    optional: true
  - name: two
    optional: true
  - name: three
  - name: four
`);
    expect(keys(first(snapshot([twoOptional], [plan('p1', 'opt3')])))).toEqual(['opt3.one', 'opt3.two', 'opt3.three']);
  });

  it('a selection matching nothing whose other evidence is satisfied is complete, not vacuously', () => {
    const sweep = wf(`name: sweep2
kind: main
phases:
  - name: extra
    optional: true
  - name: sweep
    where: { type: bug, status: [ open ] }
    produces: [ "out/report.md" ]
  - name: last
`);
    const entry = first(snapshot([sweep], [plan('p1', 'sweep2')], { tree: ['out/report.md'] }));
    expect(entry.phases).toEqual([
      { phase: 'extra', state: 'skipped' },
      { phase: 'sweep', state: 'complete' },
      { phase: 'last', state: 'current' },
    ]);
  });

  it('review F3: a selection matching nothing whose step created nothing is vacuous, even beside a memory.add', () => {
    const addSweep = wf(`name: add-sweep
kind: main
phases:
  - name: extra
    optional: true
  - name: sweep
    where: { type: bug, status: [ open ] }
    actions:
      - 'memory.add(type: task)'
  - name: last
`);
    // The step created no element (no linkage before task-203): `created` is empty, so the completion is
    // vacuous and does not skip `extra`. A step that created an element is not vacuous (deduce.ts, evaluate()).
    const entry = first(snapshot([addSweep], [plan('p1', 'add-sweep')]));
    expect(entry.phases).toEqual([
      { phase: 'extra', state: 'current' },
      { phase: 'sweep', state: 'pending' },
      { phase: 'last', state: 'pending' },
    ]);
    expect(keys(entry)).toEqual(['add-sweep.extra', 'add-sweep.last']);
  });

  it('review F3: a selection matching nothing whose step created an element (linkage, task-203) is not vacuous', () => {
    const addSweep = wf(`name: add-sweep2
kind: main
phases:
  - name: extra
    optional: true
  - name: sweep
    where: { type: bug, status: [ open ] }
    actions:
      - 'memory.add(type: task)'
  - name: last
`);
    const linked = (status: string): DeductionSnapshot =>
      snapshot([addSweep], [task('task-9-new', status), plan('p1', 'add-sweep2')], {
        history: new Map([
          ['s0', { records: [], links: [{ commit: 'a1', position: 0, instance: 'p1', step: 'add-sweep2.sweep', type: 'task', id: 'task-9-new' }], reentries: [] }],
        ]),
      });
    const entry = first(linked('draft'));
    expect(entry.frontier.find((step) => step.phase === 'sweep')).toBeUndefined();
    expect(entry.phases).toEqual([
      { phase: 'extra', state: 'skipped' },
      { phase: 'sweep', state: 'complete' },
      { phase: 'last', state: 'current' },
    ]);
    // The self-bound element archived abandons the instance (§3.4 with §4.11).
    const archived = first(linked('deprecated'));
    expect(archived.instance).toMatchObject({ abandoned: true, element: { type: 'task', id: 'task-9-new', status: 'deprecated' } });
    expect(archived.frontier).toEqual([]);
  });

  it('a vacuous later completion does not skip it', () => {
    const optVacuous = wf(`name: opt2
kind: main
phases:
  - name: extra
    optional: true
  - name: sweep
    where: { type: bug, status: [ open ] }
  - name: last
`);
    const entry = first(snapshot([optVacuous], [plan('p1', 'opt2')]));
    expect(keys(entry)).toEqual(['opt2.extra', 'opt2.last']);
    expect(entry.phases.map((p) => p.state)).toEqual(['current', 'pending', 'pending']);
  });

  it('an archived bound element abandons its instance: abandoned, empty frontier, not complete', () => {
    const entry = first(snapshot([REL, DEV], [task('task-1-a', 'backlog'), release('r1', 'deprecated'), plan('p1', 'rel', 'r1')]));
    expect(entry.instance).toMatchObject({ abandoned: true, element: { type: 'release', id: 'r1', status: 'deprecated' } });
    expect(entry.frontier).toEqual([]);
    expect(entry.complete).toBe(false);
  });

  it('an archived candidate is neither eligible nor entered: deprecated, and superseded on an adr', () => {
    const overAdrs = wf(`name: adrs
kind: main
phases:
  - name: each
    include: adr-sub
    iterate_over: adr
    where: { status: [ accepted, superseded ] }
`);
    const adrSub = wf(`name: adr-sub
kind: sub
element: adr
phases:
  - name: review
`);
    const entry = first(
      snapshot(
        [overAdrs, adrSub],
        [doc('docs/adrs/adr-1.md', { id: 'adr-1', type: 'adr', status: 'superseded' }), doc('docs/adrs/adr-2.md', { id: 'adr-2', type: 'adr', status: 'deprecated' }), plan('p1', 'adrs')],
      ),
    );
    expect(entry.phases[0]).toMatchObject({ state: 'complete', vacuous: true });
    const tasks = first(snapshot([REL, DEV], [task('task-1-a', 'deprecated'), release('r1', 'in-development'), plan('p1', 'rel', 'r1')]));
    expect(tasks.phases[0]).toMatchObject({ state: 'complete', vacuous: true });
  });

  it('a bound element in a reject state outside its sequence is at no exit state (state evidence unsatisfied)', () => {
    const triage = wf(`name: triage
kind: main
element: bug
phases:
  - name: open-it
    actions:
      - element.set_state(open)
`);
    const entry = first(snapshot([triage], [doc('docs/bugs/bug-1.md', { id: 'bug-1', type: 'bug', status: 'wontfix' }), plan('p1', 'triage', 'bug-1')]));
    expect(keys(entry)).toEqual(['triage.open-it@bug:bug-1']);
  });

  it('an archived element never matches a selection', () => {
    const sweep = wf(`name: sweep
kind: main
phases:
  - name: sweep
    where: { type: bug }
`);
    const entry = first(snapshot([sweep], [doc('docs/bugs/bug-1.md', { id: 'bug-1', type: 'bug', status: 'deprecated' }), plan('p1', 'sweep')]));
    expect(entry.complete).toBe(true);
  });
});

describe('task-202 — re-entry cutoffs across include and iterate_over (spec-017 §4.8; approver ruling 2026-10-09)', () => {
  // Characterization (re-review item 1): the code already behaves this way since the merge of task-203.
  const SUBREL = wf(`name: subrel
kind: sub
element: release
phases:
  - name: check
`);
  const SUBT = wf(`name: subt
kind: sub
element: task
phases:
  - name: work
`);
  const RELB = wf(`name: relb
kind: main
element: release
phases:
  - name: prep
  - name: inc
    include: subrel
  - name: loop
    include: subt
    iterate_over: task
    where: { status: [ backlog ] }
  - name: submit
    actions:
      - element.set_state(releasing)
  - name: approve
    actions:
      - memory.approve
    fallback: { step: prep, set_state: in-development }
`);
  const rec = (phase: string, element: string, commit: string, position: number) => ({ commit, position, phase, instance: 'p1', element, item: null });
  // History: s0 (start) → a1 prep → a2 subrel.check → a3 subt.work → J (release r1 rejected releasing → in-development).
  const OLD = [rec('relb.prep', 'release:r1', 'a1', 4), rec('subrel.check', 'release:r1', 'a2', 3), rec('subt.work', 'task:task-1-a', 'a3', 2)];
  const REJECT = { commit: 'J', position: 1, verb: 'reject' as const, type: 'release', id: 'r1', from: 'releasing', to: 'in-development' };
  const PARENTS: [string, string[]][] = [
    ['a1', ['s0']],
    ['a2', ['a1']],
    ['a3', ['a2']],
    ['J', ['a3']],
  ];
  const at = (records: ReturnType<typeof rec>[], parents: [string, string[]][]): InstanceDeduction =>
    first(
      snapshot([RELB, SUBREL, SUBT], [task('task-1-a', 'backlog'), release('r1', 'in-development'), plan('p1', 'relb', 'r1')], {
        history: new Map([['s0', { records: [...records, ...OLD], links: [], reentries: [REJECT] }]]),
        parents: new Map([...PARENTS, ...parents]),
      }),
    );

  it('(a) a plain include honours the cutoff: inc is current again, its sub step reports the re-entry', () => {
    const entry = at([rec('relb.prep', 'release:r1', 'a4', 0)], [['a4', ['J']]]);
    expect(entry.phases.map((phase) => `${phase.phase}:${phase.state}`)).toEqual(['prep:complete', 'inc:current', 'loop:pending', 'submit:pending', 'approve:pending']);
    expect(entry.frontier.map((step) => [step.key, step.reentered, step.reentryCommit])).toEqual([['subrel.check@release:r1', true, 'J']]);
  });

  it('(b) an iterate_over iteration ignores it: loop is complete on the task\'s pre-reject record', () => {
    const entry = at(
      [rec('subrel.check', 'release:r1', 'a5', 0), rec('relb.prep', 'release:r1', 'a4', 1)],
      [
        ['a4', ['J']],
        ['a5', ['a4']],
      ],
    );
    expect(entry.phases.slice(0, 3)).toEqual([
      { phase: 'prep', state: 'complete' },
      { phase: 'inc', state: 'complete' },
      { phase: 'loop', state: 'complete', iterations: { eligible: 0, entered: 0, complete: 1, late: 0 } },
    ]);
    expect(entry.frontier.map((step) => [step.key, step.reentered])).toEqual([['relb.submit@release:r1', true]]);
  });
});

