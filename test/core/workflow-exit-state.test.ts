/**
 * task-194 AC 3 — the exit-state computation of spec-017 §4.4, a pure function (`workflowExitStates`,
 * `src/core/workflow-exit-state.ts`), unit-tested on the `dev-loop`, `release-planning.commit-backlog`
 * and `bug-ingest.triage` shapes. It applies each phase's state-changing actions statically along the
 * element's machine (spec-001), from the state the previous phase leaves; `set_state` follows
 * spec-003's verb rule (it yields its argument). task-198 reuses it for `state` / `created` evidence.
 */
import { MemoryYaml } from '../../src/memory/schema';
import { iterationStartState, machineStates, workflowExitStates, type PhaseExitState } from '../../src/core';
import { parseYaml } from '../../src/validation';
import { Workflow } from '../../src/workflow/schema';

/** The machines of this repository's `task`, `bug`, `release` (memory.yaml 2.5), inline so the test is stable. */
const MEMORY = MemoryYaml.parse(
  parseYaml(
    `version: 1.0
types:
  task:
    path: "docs/{id}.md"
    states:
      sequence: [ draft, pending, backlog, in-progress, in-review, approved, done ]
      gates:
        pending:   { reject: draft }
        in-review: { reject: in-progress }
      waiting: [ backlog, approved ]
  bug:
    path: "docs/{id}.md"
    states:
      sequence: [ draft, open, triaged, planned, in-progress, in-review, resolved, closed ]
      gates:
        open:      { reject: closed }
        triaged:   { reject: closed }
        planned:   { reject: closed }
        in-review: { reject: in-progress }
        resolved:  { reject: in-progress }
      waiting: [ triaged, planned ]
  release:
    path: "docs/{id}.md"
    states:
      sequence: [ draft, planning, in-development, releasing, released ]
      waiting: [ planning, in-development, releasing ]
  tech-spec:
    path: "docs/{id}.md"
    states:
      sequence: [ draft, pending, approved, superseded ]
      gates:
        pending: { reject: draft }
      waiting: [ approved ]
`,
    'memory.yaml',
  ),
);

function workflow(yaml: string): Workflow {
  return Workflow.parse(parseYaml(yaml, 'fixture.yaml'));
}

const DEV_LOOP = workflow(`name: dev-loop
kind: sub
element: task
phases:
  - name: start
    actions:
      - git.create_branch("task/{task.id}")
      - element.set_state(in-progress)
      - 'bug.sync_state(for_each: task.bug)'
  - name: design
    actions:
      - agent.verify_specs
      - 'memory.add(type: tech-spec)'
      - memory.submit
    approval: { by_role: approver }
    fallback: { step: design }
  - name: red
    actions: [ agent.execute ]
  - name: review
    actions:
      - tests.bdd.run
      - memory.submit
    approval: { by_role: approver }
    fallback: { step: red, set_state: in-progress }
  - name: done
    actions:
      - memory.approve
      - element.set_state(done)
`);

const RELEASE_PLANNING = workflow(`name: release-planning
kind: sub
element: release
phases:
  - name: define-scope
    actions: [ memory.submit ]
  - name: triage-bugs
    where: { type: bug, status: [open] }
    actions: [ memory.approve ]
    approval: { by_role: approver }
    fallback: { step: triage-bugs, set_state: closed }
  - name: build-backlog
    actions:
      - 'memory.add(type: task)'
      - memory.submit
      - 'memory.add(type: task, bug: "{bug.id}")'
      - memory.submit
      - bug.set_state(planned)
      - element.set_release("{release.version}")
  - name: commit-backlog
    actions:
      - task.set_state(backlog)
      - release.set_state(in-development)
    approval: { by_role: approver }
`);

const BUG_INGEST = workflow(`name: bug-ingest
kind: main
phases:
  - name: capture
    actions:
      - 'memory.add(type: bug)'
      - memory.submit
  - name: triage
    actions: [ memory.approve ]
    approval: { by_role: approver }
    fallback: { step: capture }
`);

function byPhase(states: readonly PhaseExitState[]): Record<string, PhaseExitState> {
  return Object.fromEntries(states.map((s) => [s.phase, s]));
}

describe('workflowExitStates — spec-017 §4.4', () => {
  it('dev-loop under iterate_over task where status [backlog]: start → in-progress, review → in-review, done → done', () => {
    const start = iterationStartState(MEMORY, 'task', { status: ['backlog'] });
    expect(start).toBe('backlog');
    const states = byPhase(workflowExitStates(DEV_LOOP, MEMORY, { boundType: 'task', state: start, instance: false }));
    expect(states['start']).toMatchObject({ entry: 'backlog', exit: 'in-progress', undetermined: null });
    // design's submit follows its memory.add: it moves the created tech-spec, not the bound task.
    expect(states['design']).toMatchObject({
      entry: 'in-progress',
      exit: 'in-progress',
      created: [{ type: 'tech-spec', action: 1, state: 'pending' }],
      held: [{ type: 'tech-spec', gate: 'pending', reject: 'draft' }],
    });
    expect(states['red']).toMatchObject({ entry: 'in-progress', exit: 'in-progress', held: [] });
    expect(states['review']).toMatchObject({
      entry: 'in-progress',
      exit: 'in-review',
      held: [{ type: 'task', gate: 'in-review', reject: 'in-progress' }],
    });
    expect(states['done']).toMatchObject({ entry: 'in-review', exit: 'done', undetermined: null });
  });

  it('release-planning.commit-backlog: the release planning → in-development, the tasks build-backlog created pending → backlog', () => {
    const states = byPhase(
      workflowExitStates(RELEASE_PLANNING, MEMORY, { boundType: 'release', state: iterationStartState(MEMORY, 'release', { status: ['draft', 'planning'] }), instance: false }),
    );
    expect(states['define-scope']).toMatchObject({ entry: 'draft', exit: 'planning' });
    // A selection's approve acts on the selected bugs, never on the bound release.
    expect(states['triage-bugs']).toMatchObject({ exit: 'planning', held: [{ type: 'bug', gate: 'open', reject: 'closed' }] });
    expect(states['build-backlog']).toMatchObject({
      exit: 'planning',
      created: [
        { type: 'task', action: 0, state: 'pending' },
        { type: 'task', action: 2, state: 'pending' },
      ],
    });
    expect(states['commit-backlog']).toMatchObject({
      entry: 'planning',
      exit: 'in-development',
      undetermined: null,
      run: [
        { type: 'task', action: 0, state: 'backlog' },
        { type: 'task', action: 2, state: 'backlog' },
      ],
      held: [{ type: 'task', gate: 'pending', reject: 'draft' }],
    });
  });

  it('bug-ingest.triage: the self-created bug, open → triaged; the gate it holds rejects forward to closed', () => {
    const states = byPhase(workflowExitStates(BUG_INGEST, MEMORY, { boundType: null, state: null, instance: true }));
    expect(states['capture']).toMatchObject({ boundType: 'bug', entry: null, exit: 'open', created: [{ type: 'bug', action: 0, state: 'open' }] });
    expect(states['triage']).toMatchObject({
      boundType: 'bug',
      entry: 'open',
      exit: 'triaged',
      held: [{ type: 'bug', gate: 'open', reject: 'closed' }],
    });
  });

  it('an action the machine cannot apply is reported with its index and the engine\'s reason; the state is then unknown', () => {
    const wf = workflow('name: w\nkind: sub\nelement: task\nphases:\n  - name: a\n    actions: [ memory.approve ]\n  - name: b\n    actions: [ agent.execute ]\n  - name: c\n    actions: [ memory.submit ]\n  - name: d\n    actions: [ element.set_state(done) ]\n');
    const states = byPhase(workflowExitStates(wf, MEMORY, { boundType: 'task', state: 'draft', instance: false }));
    expect(states['a']!.undetermined).toEqual({
      action: 0,
      type: 'task',
      from: 'draft',
      reason: 'illegal `approve` from "draft": not a `gates` state — `approve` is only legal from a gate',
    });
    expect(states['a']!.exit).toBeNull();
    expect(states['b']).toMatchObject({ entry: null, exit: null, undetermined: null });
    expect(states['c']!.undetermined).toEqual({ action: 0, type: 'task', from: null, reason: 'the state it starts from is undetermined' });
    // `set_state` yields its argument whatever the state it starts from (spec-003 verb rule).
    expect(states['d']).toMatchObject({ entry: null, exit: 'done', undetermined: null });
  });

  it('set_state to a state the type does not declare, or one behind the current state, cannot be applied', () => {
    const wf = workflow('name: w\nkind: sub\nelement: task\nphases:\n  - name: a\n    actions: [ element.set_state(shipped) ]\n  - name: b\n    actions: [ element.set_state(in-review), element.set_state(backlog) ]\n');
    const states = byPhase(workflowExitStates(wf, MEMORY, { boundType: 'task', state: 'draft', instance: false }));
    expect(states['a']!.undetermined).toMatchObject({ action: 0, reason: "'shipped' is not a state of task" });
    expect(states['b']!.undetermined).toMatchObject({ action: 1, from: 'in-review', reason: "'backlog' does not lie after 'in-review' in task's sequence" });
  });

  it('a plain include runs the sub on the includer\'s element and continues from the sub\'s exit', () => {
    const outer = workflow('name: outer\nkind: sub\nelement: release\nphases:\n  - name: plan\n    include: release-planning\n  - name: ship\n    actions: [ element.set_state(releasing) ]\n');
    const registry = new Map([['release-planning', RELEASE_PLANNING]]);
    const states = byPhase(workflowExitStates(outer, MEMORY, { boundType: 'release', state: 'draft', instance: false }, registry));
    expect(states['plan']).toMatchObject({ entry: 'draft', exit: 'in-development' });
    expect(states['ship']).toMatchObject({ entry: 'in-development', exit: 'releasing' });
  });

  it('edge shapes: a bare set_state, a bare memory.add, deprecate from an unknown state, nothing bound, an unknown type', () => {
    const wf = workflow(
      "name: w\nkind: sub\nelement: task\nphases:\n  - name: a\n    actions: [ memory.approve, memory.deprecate ]\n  - name: b\n    actions: [ element.set_state, task.set_state ]\n  - name: c\n    actions: [ memory.add, 'memory.add(type: ghost)', memory.submit ]\n",
    );
    const states = byPhase(workflowExitStates(wf, MEMORY, { boundType: 'task', state: 'draft', instance: false }));
    expect(states['a']).toMatchObject({ exit: 'deprecated', undetermined: { action: 0 } });
    expect(states['b']!.undetermined).toMatchObject({ action: 0, reason: "'' is not a state of task" });
    // `memory.add` with no type creates nothing trackable; one of an unregistered type is not moved.
    expect(states['c']).toMatchObject({ undetermined: null, created: [{ type: 'ghost', action: 1, state: null }] });

    const unbound = workflow('name: u\nkind: sub\nphases:\n  - name: a\n    actions: [ memory.submit ]\n');
    expect(workflowExitStates(unbound, MEMORY, { boundType: null, state: null, instance: false })[0]).toMatchObject({ boundType: null, exit: null, undetermined: null });
    const ghost = workflow('name: g\nkind: sub\nelement: ghost\nphases:\n  - name: a\n    actions: [ memory.submit ]\n');
    expect(workflowExitStates(ghost, MEMORY, { boundType: 'ghost', state: null, instance: false })[0]).toMatchObject({ undetermined: null });
  });

  it('a typed set_state reaches earlier-created elements once; a selection without status or of an unknown type holds no gate', () => {
    const wf = workflow(
      "name: w\nkind: sub\nelement: release\nphases:\n  - name: add\n    actions: [ 'memory.add(type: task)', memory.submit ]\n  - name: move\n    actions: [ task.set_state(backlog), task.set_state(in-progress) ]\n  - name: sweep\n    where: { type: [bug, ghost] }\n    actions: [ memory.approve ]\n",
    );
    const states = byPhase(workflowExitStates(wf, MEMORY, { boundType: 'release', state: 'draft', instance: false }));
    expect(states['move']!.run).toEqual([{ type: 'task', action: 0, state: 'in-progress' }]);
    expect(states['sweep']).toMatchObject({ held: [], exit: 'draft' });
  });

  it('F3: a typed set_state on a phase that selects its type holds the selected gate whose approve target it names', () => {
    const wf = workflow('name: w\nkind: sub\nelement: release\nphases:\n  - name: c\n    where: { type: task, status: [pending, in-review] }\n    actions: [ task.set_state(backlog) ]\n');
    expect(workflowExitStates(wf, MEMORY, { boundType: 'release', state: 'draft', instance: false })[0]).toMatchObject({
      exit: 'draft',
      held: [{ type: 'task', gate: 'pending', reject: 'draft' }],
    });
  });

  it('a plain include of a sub declaring its own element, from an unbound workflow, starts at that type\'s first state', () => {
    const outer = workflow('name: outer\nkind: sub\nphases:\n  - name: plan\n    include: release-planning\n');
    const states = workflowExitStates(outer, MEMORY, { boundType: null, state: null, instance: false }, new Map([['release-planning', RELEASE_PLANNING]]));
    expect(states).toEqual([{ phase: 'plan', boundType: null, entry: null, exit: null, undetermined: null, created: [], run: [], held: [] }]);
  });

  it('iterationStartState: the lowest-sequence status of where.status, else the first state', () => {
    expect(iterationStartState(MEMORY, 'release', { status: ['in-development', 'draft', 'planning'] })).toBe('draft');
    expect(iterationStartState(MEMORY, 'release', { status: 'planning' })).toBe('planning');
    expect(iterationStartState(MEMORY, 'release', undefined)).toBe('draft');
    expect(iterationStartState(MEMORY, 'nonsense', undefined)).toBeNull();
  });

  it('machineStates: the sequence, the reject and return targets, and deprecated', () => {
    expect([...machineStates(MEMORY.types['bug']!.states!)]).toEqual(['draft', 'open', 'triaged', 'planned', 'in-progress', 'in-review', 'resolved', 'closed', 'deprecated']);
  });

  it('is deterministic: two runs give deep-equal results', () => {
    const a = workflowExitStates(DEV_LOOP, MEMORY, { boundType: 'task', state: 'backlog', instance: false });
    const b = workflowExitStates(DEV_LOOP, MEMORY, { boundType: 'task', state: 'backlog', instance: false });
    expect(a).toEqual(b);
  });
});
