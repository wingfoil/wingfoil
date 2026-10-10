/**
 * task-216 — the pure parts of `workflow next` on synthetic values (`spec-017` §5.3, §7.3, §8): the console
 * rendering of every line a step can print, the "human needed" line, who `--assigned-to` stands for, and
 * `nextWorkflow`'s selection on a hand-built deduction. No git, no filesystem.
 */
import type { DnaYaml } from '../../src/dna/schema';
import type { Deduction, DeducedStep, InstanceDeduction } from '../../src/workflow/deduce';
import { assigneeRoles, buildStep, humanNeededLine, membersHoldingRole, nextWorkflow, renderNextConsole, type NextInputs, type NextResult, type Step } from '../../src/core/workflow-next';
import type { Workflow } from '../../src/workflow/schema';

const STEP: Step = {
  key: 'loop.red@task:task-1',
  instance: 'rc-1',
  trail: [
    { workflow: 'cycle', phase: 'develop', scope: null },
    { workflow: 'loop', phase: 'red', scope: { element: { type: 'task', id: 'task-1', status: 'in-progress' } } },
  ],
  workflow: 'loop',
  phase: 'red',
  scope: { item: { collection: 'bindings:targets', key: 'linux' } },
  role: null,
  agentRole: false,
  members: [],
  directives: [],
  directiveWarnings: [],
  actions: [
    { token: 'git.tag', text: 'git.tag', unresolved: [], target: 'none', binding: { kind: 'manual' } },
    { token: 'x.sync_state', text: 'x.sync_state', unresolved: [], target: 'run', binding: { kind: 'manual', expectedCommit: 'wf(a): sync a-1 [x → y]\nwf(b): sync b-1 [x → y]' } },
  ],
  checks: { pre: [], post: [] },
  produces: [],
  created: [],
  evidence: { kinds: ['state'], missing: [], finalizable: false },
  optional: false,
  awaiting: null,
  fallback: null,
  reentered: true,
  reentryCommit: 'abc123',
  mode: 'fresh',
  allowedModes: ['fresh'],
  distinctFrom: [],
  cadence: null,
};

const RESULT: NextResult = {
  baseline: { rev: 'HEAD', commit: 'abc' },
  instance: null,
  complete: false,
  next: STEP,
  more: [{ ...STEP, key: 'loop.red@task:task-2', scope: null, role: 'qa', agentRole: true, members: [{ name: 'Q', email: 'q@example.invalid' }] }],
  diagnostics: [],
};

describe('task-216 — console rendering (spec-017 §8)', () => {
  it('prints an item scope, no role, the actions with an argv-less manual binding and a multi-line expected commit, the re-entry, and the further ready steps', () => {
    expect(renderNextConsole(RESULT)).toBe(
      [
        'next step: loop.red@task:task-1',
        '  trail: cycle.develop > loop.red',
        '  scope: bindings:targets#linux',
        '  role: (none)',
        '  directives: (none)',
        '  actions:',
        '    - git.tag [manual]',
        '    - x.sync_state [manual: expects wf(a): sync a-1 [x → y] | wf(b): sync b-1 [x → y]]',
        '  evidence missing: (none)',
        '  re-entered after abc123',
        'also ready: loop.red@task:task-2',
        '  trail: cycle.develop > loop.red',
        '  scope: (none)',
        '  role: qa (an agent role) — held by Q',
        '  directives: (none)',
        '  actions:',
        '    - git.tag [manual]',
        '    - x.sync_state [manual: expects wf(a): sync a-1 [x → y] | wf(b): sync b-1 [x → y]]',
        '  evidence missing: (none)',
        '  re-entered after abc123',
        '',
      ].join('\n'),
    );
  });

  it('an approval routed to nobody without a routing error says "nobody"; no awaiting, no line (§5.3)', () => {
    expect(humanNeededLine({ ...STEP, awaiting: { kind: 'approval', byRole: 'approver', elements: [], recordNeeded: false, routedTo: [] } })).toBe(
      'human needed: approve or reject loop.red@task:task-1 — routed to nobody',
    );
    expect(humanNeededLine(STEP)).toBeNull();
  });
});

const DNA = { team: { members: [{ name: 'Alex', email: 'Alex@Example.invalid', roles: ['developer'] }, { name: 'Sam', roles: ['qa'] }] } } as unknown as DnaYaml;

describe('task-216 — who --assigned-to stands for (spec-017 §7.3)', () => {
  it('me: the members whose email is the identity, case-insensitively; none when the identity has no email or matches no member', () => {
    expect([...assigneeRoles(DNA, 'me', 'alex@example.invalid')]).toEqual(['developer']);
    expect([...assigneeRoles(DNA, 'me', '')]).toEqual([]);
    expect([...assigneeRoles(DNA, 'me', 'sam@example.invalid')]).toEqual([]);
  });

  it('a member name, an email, else the word itself as a role name; no dna.yaml leaves the role name', () => {
    expect([...assigneeRoles(DNA, 'Sam', '')]).toEqual(['qa']);
    expect([...assigneeRoles(DNA, 'alex@example.invalid', '')]).toEqual(['developer']);
    expect([...assigneeRoles(DNA, 'reviewer', '')]).toEqual(['reviewer']);
    expect([...assigneeRoles(null, 'reviewer', '')]).toEqual(['reviewer']);
  });
});

describe('task-216 — nextWorkflow on a hand-built deduction (spec-017 §7.3)', () => {
  const INPUTS: NextInputs = { workflows: [], memoryYaml: null, dnaYaml: null, bindings: null, rolesYaml: null, directiveFiles: [] };
  const instance = (frontier: DeducedStep[]): InstanceDeduction => ({
    instance: { id: 'rc-1', workflow: 'cycle', element: null, context: null, created: [], planStatus: 'active', startCommit: 'abc', active: true, abandoned: false },
    complete: false,
    phases: [],
    frontier,
    late: [],
  });
  const step = { role: null } as unknown as DeducedStep;
  const deduction: Deduction = { baseline: { rev: 'HEAD', commit: 'abc' }, active: 'rc-1', instances: [instance([step])], diagnostics: [] };

  it('a step with no role is dropped by any --assigned-to filter', () => {
    const result = nextWorkflow(INPUTS, deduction, { assignedTo: 'developer' });
    expect(result.ok && result.value).toMatchObject({ next: null, message: "no next step of workflow 'cycle' is assigned to 'developer'" });
  });
});

describe('task-216 — buildStep on a synthetic phase (spec-017 §6)', () => {
  const workflow = {
    name: 'loop',
    phases: [{ name: 'red', optional: false, cadence: 'once', fallback: { step: 'red' } }],
  } as unknown as Workflow;
  const deduced = {
    key: 'loop.red',
    instance: 'rc-1',
    trail: [],
    workflow: 'loop',
    phase: 'red',
    scope: null,
    role: null,
    optional: false,
    produces: [],
    created: [],
    evidence: { kinds: ['record'], missing: ['record'], finalizable: true },
    reentered: false,
    reentryCommit: null,
    actions: [],
  } as unknown as DeducedStep;

  it('a step with no role has no holders, no directives, no agent role; a fallback without set_state reports null', () => {
    const step = buildStep(deduced, { workflows: [workflow], memoryYaml: null, dnaYaml: null, bindings: null, rolesYaml: null, directiveFiles: [] });
    expect(step).toMatchObject({ role: null, agentRole: false, members: [], directives: [], directiveWarnings: [], fallback: { step: 'red', setState: null }, checks: { pre: [], post: [] } });
  });

  it('holders sort by name, then email; no dna.yaml holds none', () => {
    const dna = { team: { members: [{ name: 'A', email: 'z@x.invalid', roles: ['qa'] }, { name: 'A', email: 'a@x.invalid', roles: ['qa'] }] } } as unknown as DnaYaml;
    expect(membersHoldingRole(dna, 'qa').map((member) => member.email)).toEqual(['a@x.invalid', 'z@x.invalid']);
    expect(membersHoldingRole(null, 'qa')).toEqual([]);
  });
});
