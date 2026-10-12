/**
 * task-230 — `iterate_over: element:<field>`, a collection read from the bound element's frontmatter
 * (`spec-003` § "Collections", Revision 2026-10-12; `spec-017` §4.6; approver ruling D1 (a), 2026-10-12;
 * `dl-100` §1 (a): the wave is a declared unit of `implementation`, per `release` element, `dl-159`).
 *
 * The pure deduction (`src/workflow/deduce.ts`) on synthetic snapshots:
 * - the entries are the list in the innermost bound element's field, in declared order, each one
 *   iteration; `{item}` and the enclosing element's tokens resolve inside it;
 * - the iteration's scope names the element the list was read from (`<type>:<id>/<field>#<key>`), so two
 *   releases with the same wave keys in one instance never share a record;
 * - an absent field has no entries (vacuous, with the note); a value that is not a list, or entries
 *   with a key problem, leave the phase one unexpanded step, reported as `W_UNRESOLVED_TOKEN`.
 *
 * Determinism (REQ-SYS-07, REQ-STATE-09): fixed fixtures, no clock, no randomness.
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

const doc = (path: string, frontmatter: Record<string, unknown>): Doc => ({ path, frontmatter, body: '' });
const task = (id: string, status: string, extra: Record<string, unknown> = {}): Doc => doc(`docs/tasks/${id}.md`, { id, type: 'task', status, ...extra });
const release = (id: string, version: string, extra: Record<string, unknown> = {}): Doc =>
  doc(`docs/releases/${id}.md`, { id, type: 'release', status: 'in-development', version, ...extra });
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

/** The per-task sub: start, finish. */
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

/** The wave: its tasks' dev loops (filtered by wave and release), then a re-plan checkpoint. */
const WAVE = wf(`name: wave
kind: sub
element: release
phases:
  - name: tasks
    include: dev
    iterate_over: task
    where: { status: [ backlog ], release: "{release.version}", wave: "{item}" }
  - name: re-plan
`);

/** The release cycle: implementation runs one wave per entry of the release's `waves:`. */
const CYCLE = wf(`name: cycle
kind: main
element: release
phases:
  - name: implementation
    include: wave
    iterate_over: element:waves
  - name: wrap
    actions:
      - element.set_state(releasing)
`);

describe('task-230 — iterate_over element:<field> (spec-003 § "Collections", spec-017 §4.6)', () => {
  it('one iteration per entry of the bound element field, in declared order; {item} and {release.version} resolve inside it', () => {
    const entry = first(
      snapshot(
        [CYCLE, WAVE, DEV],
        [
          release('r1', 'v1', { waves: ['w1', 'w0'] }),
          task('task-1-a', 'backlog', { release: 'v1', wave: 'w0' }),
          task('task-2-b', 'backlog', { release: 'v1', wave: 'w1' }),
          task('task-3-c', 'backlog', { release: 'v2', wave: 'w0' }),
          plan('p1', 'cycle', 'r1'),
        ],
      ),
    );
    // Declared order (w1 before w0), then each wave's own tasks only (task-3 is another release's).
    expect(keys(entry)).toEqual(['dev.start@task:task-2-b', 'dev.start@task:task-1-a']);
    expect(entry.frontier[0]!.trail.map((t) => [t.workflow, t.phase, t.scope])).toEqual([
      ['cycle', 'implementation', { element: { type: 'release', id: 'r1', status: 'in-development' } }],
      ['wave', 'tasks', { item: { collection: 'release:r1/waves', key: 'w1' } }],
      ['dev', 'start', { element: { type: 'task', id: 'task-2-b', status: 'backlog' } }],
    ]);
    expect(entry.phases[0]).toEqual({ phase: 'implementation', state: 'current', iterations: { eligible: 2, entered: 0, complete: 0, late: 0 } });
  });

  it('a wave whose tasks are done reaches its re-plan checkpoint, keyed by the release the list was read from', () => {
    const entry = first(
      snapshot(
        [CYCLE, WAVE, DEV],
        [release('r1', 'v1', { waves: ['w0'] }), task('task-1-a', 'done', { release: 'v1', wave: 'w0' }), plan('p1', 'cycle', 'r1')],
      ),
    );
    expect(keys(entry)).toEqual(['wave.re-plan@release:r1/waves#w0']);
    expect(entry.frontier[0]!.scope).toEqual({ item: { collection: 'release:r1/waves', key: 'w0' } });
  });

  it("a WingFoil-Item record names one release's wave: it never completes another release's wave with the same key", () => {
    const LINE = wf(`name: line
kind: main
phases:
  - name: each-release
    include: cycle-sub
    iterate_over: release
`);
    const CYCLE_SUB = wf(`name: cycle-sub
kind: sub
element: release
phases:
  - name: implementation
    include: wave
    iterate_over: element:waves
`);
    const history = new Map([
      ['s0', { records: [{ commit: 'r9', position: 0, phase: 'wave.re-plan', instance: 'p1', element: null, item: 'release:r1/waves#w0' }], links: [], reentries: [] }],
    ]);
    const entry = first(
      snapshot(
        [LINE, CYCLE_SUB, WAVE, DEV],
        [
          release('r1', 'v1', { waves: ['w0'] }),
          release('r2', 'v2', { waves: ['w0'] }),
          task('task-1-a', 'done', { release: 'v1', wave: 'w0' }),
          task('task-2-b', 'done', { release: 'v2', wave: 'w0' }),
          plan('p1', 'line'),
        ],
        { history },
      ),
    );
    expect(keys(entry)).toEqual(['wave.re-plan@release:r2/waves#w0']);
  });

  it('an element with no such field has no entries: the phase is vacuously complete, with the note', () => {
    const deduction = deduceWorkflowState(snapshot([CYCLE, WAVE, DEV], [release('r1', 'v1'), plan('p1', 'cycle', 'r1')]));
    expect(deduction.instances[0]!.phases[0]).toEqual({
      phase: 'implementation',
      state: 'complete',
      vacuous: true,
      iterations: { eligible: 0, entered: 0, complete: 0, late: 0, note: NO_ITERATION_NOTE },
    });
    expect(keys(deduction.instances[0]!)).toEqual(['cycle.wrap@release:r1']);
    expect(deduction.diagnostics).toEqual([]);
  });

  it.each([
    ['a value that is not a list', 'w0', "collection 'element:waves' of release:r1 is not a list"],
    ['a duplicate key', ['w0', 'w0'], "collection 'element:waves' of release:r1 entry 1: duplicate collection key 'w0'"],
    ['a key outside the ID characters', ['Wave 0'], "collection 'element:waves' of release:r1 entry 0: collection key 'Wave 0' is outside the ID characters [a-z0-9-.]"],
  ])('%s leaves the phase one unexpanded step, reported as W_UNRESOLVED_TOKEN', (_name, waves, message) => {
    const deduction = deduceWorkflowState(snapshot([CYCLE, WAVE, DEV], [release('r1', 'v1', { waves }), plan('p1', 'cycle', 'r1')]));
    expect(keys(deduction.instances[0]!)).toEqual(['cycle.implementation@release:r1']);
    expect(deduction.diagnostics).toEqual([
      { code: 'W_UNRESOLVED_TOKEN', severity: 'warning', file: '.wingfoil/workflows/custom/cycle.yaml', path: 'phases[0].iterate_over', message },
    ]);
  });
});
