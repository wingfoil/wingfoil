/**
 * task-216 — the independent review's fixes 2, 4 and 5 (2026-10-10), on synthetic values (no git):
 *
 * - fix 2: a printed `wingfoil memory …` argv is a whole command — the `<id>` placeholder when no target is
 *   known yet, `--title <title>` on `memory add`, `--reason <reason>` on `approve` / `reject` (both refuse
 *   without one, exit 2) — never one that fails as a missing argument;
 * - fix 4: a third party's line does not tell the user to run a command that does not ship yet;
 * - fix 5: `--assigned-to <who>` that names no member (name or email) and no `team.roles` role warns, as does
 *   `me` when the git identity's email is no member's.
 */
import type { DnaYaml } from '../../src/dna/schema';
import { withWarningSink } from '../../src/validation/warning';
import type { DeducedAction, DeducedStep, Deduction } from '../../src/workflow/deduce';
import type { Workflow } from '../../src/workflow/schema';
import { buildStep, humanNeededLine, nextWorkflow, type NextInputs, type Step } from '../../src/core/workflow-next';

const WORKFLOW = {
  name: 'capture-flow',
  phases: [
    {
      name: 'capture',
      role: 'developer',
      optional: false,
      cadence: 'once',
      actions: ['memory.add(type: bug)', 'memory.submit', 'memory.approve', 'memory.reject', 'memory.deprecate'],
    },
  ],
} as unknown as Workflow;

const action = (token: string): DeducedAction => ({ token, text: token, unresolved: [], target: 'created', targetType: 'bug', targets: [], boundFrom: null });

const DEDUCED = {
  key: 'capture-flow.capture',
  instance: 'ing-1',
  trail: [{ workflow: 'capture-flow', phase: 'capture', scope: null }],
  workflow: 'capture-flow',
  phase: 'capture',
  scope: null,
  role: 'developer',
  optional: false,
  produces: [],
  created: [],
  evidence: { kinds: ['created'], missing: [], finalizable: false },
  reentered: false,
  reentryCommit: null,
  actions: (WORKFLOW.phases[0]!.actions ?? []).map(action),
} as unknown as DeducedStep;

const DNA = {
  team: {
    members: [{ name: 'Alex', email: 'alex@example.invalid', roles: ['developer'] }],
    roles: [{ name: 'developer' }, { name: 'approver' }],
  },
} as unknown as DnaYaml;

const INPUTS: NextInputs = { workflows: [WORKFLOW], memoryYaml: null, dnaYaml: DNA, bindings: null, rolesYaml: null, directiveFiles: [] };

describe('task-216 review fix 2 — a printed wingfoil argv is a whole command', () => {
  const step = buildStep(DEDUCED, INPUTS);
  const argv = (token: string): readonly string[] | undefined => step.actions.find((entry) => entry.token === token)?.binding.argv;

  it('memory add carries --title <title> before the step operands', () => {
    expect(argv('memory.add(type: bug)')).toEqual(['wingfoil', 'memory', 'add', '--type', 'bug', '--title', '<title>', '--workflow', 'ing-1', '--step', 'capture-flow.capture']);
  });

  it('a verb with no known target names <id>; approve and reject name --reason <reason>', () => {
    expect(argv('memory.submit')).toEqual(['wingfoil', 'memory', 'submit', '<id>']);
    expect(argv('memory.approve')).toEqual(['wingfoil', 'memory', 'approve', '<id>', '--reason', '<reason>']);
    expect(argv('memory.reject')).toEqual(['wingfoil', 'memory', 'reject', '<id>', '--reason', '<reason>']);
    expect(argv('memory.deprecate')).toEqual(['wingfoil', 'memory', 'deprecate', '<id>']);
  });
});

describe('task-216 review fix 4 — a third party is not completed by a command that does not ship yet', () => {
  it("the waiting line names the record and says the command is not available yet", () => {
    const step = { ...buildStep(DEDUCED, INPUTS), awaiting: { kind: 'party', party: 'a vendor', evidence: { token: 'vendor.ack', binding: { kind: 'unbound' }, evaluated: false } } } as Step;
    expect(humanNeededLine(step)).toBe('waiting for a vendor: vendor.ack (a phase record completes it: wingfoil workflow finalize, not available yet)');
  });
});

describe('task-216 review fix 5 — --assigned-to <who> that names nobody warns', () => {
  const deduction: Deduction = {
    baseline: { rev: 'HEAD', commit: 'abc' },
    active: 'ing-1',
    instances: [
      {
        instance: { id: 'ing-1', workflow: 'capture-flow', element: null, context: null, created: [], planStatus: 'active', startCommit: 'abc', active: true, abandoned: false },
        complete: false,
        phases: [],
        frontier: [DEDUCED],
        late: [],
      },
    ],
    diagnostics: [],
  };
  const warnings = (who: string, identityEmail = ''): string[] => {
    const raised: string[] = [];
    withWarningSink((text) => raised.push(text), () => nextWorkflow(INPUTS, deduction, { assignedTo: who, identityEmail }));
    return raised;
  };

  it('a typo names no member and no role: one warning', () => {
    expect(warnings('develper')).toEqual(["--assigned-to 'develper' names no team.members[] entry (name or email) and no team.roles role in dna.yaml"]);
  });

  it("'me' whose email is no member's: one warning naming the email", () => {
    expect(warnings('me', 'sam@example.invalid')).toEqual(["--assigned-to me: the git identity's email 'sam@example.invalid' is no team.members[] entry's"]);
  });

  it('a member name, a member email, a declared role and a matching me: no warning', () => {
    expect([warnings('Alex'), warnings('alex@example.invalid'), warnings('approver'), warnings('me', 'alex@example.invalid')]).toEqual([[], [], [], []]);
  });
});
