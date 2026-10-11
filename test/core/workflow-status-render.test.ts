/**
 * task-225 — `workflow status`'s console view and the routing helpers on synthetic values (`spec-017` §5.1, §5.3,
 * §8): every arm of the renderer — phase counts, notes and vacuous completions, the instance flags, a step with no
 * role, a re-entered step, a third party's line, late elements, no approver for an ungated element, diagnostics —
 * and the routing arms no fixture repository reaches (a `by_person` naming nobody, which the registry refuses at
 * load, `E_PHASE_APPROVER_UNKNOWN`; a routed member `dna.yaml` does not list).
 */
import { approvalDiagnostics, renderStatusConsole, routeApproval, type StatusResult, type Step } from '../../src/core';
import type { DnaYaml } from '../../src/dna/schema';

const DNA = {
  team: {
    members: [
      { name: 'Alex', email: 'alex@example.invalid', roles: ['developer'] },
      { name: 'Morgan', roles: ['approver'] },
    ],
  },
} as unknown as DnaYaml;

const STEP = {
  key: 'loop.red@task:task-2',
  instance: 'rc-1',
  trail: [],
  role: null,
  evidence: { kinds: ['record'], missing: ['record'], finalizable: true },
  reentered: true,
  reentryCommit: 'abc123',
  awaiting: { kind: 'party', party: 'a vendor', evidence: { token: 'vendor.ack', binding: { kind: 'unbound' }, evaluated: false } },
} as unknown as Step;

const RESULT: StatusResult = {
  baseline: { rev: 'HEAD', commit: 'abc' },
  active: null,
  open: [
    {
      instance: { id: 'rc-1', workflow: 'cycle', element: null, context: null, created: [], planStatus: 'active', startCommit: 'abc', active: false, abandoned: false },
      complete: false,
      phases: [
        { phase: 'plan', state: 'complete', vacuous: true },
        { phase: 'develop', state: 'current', iterations: { eligible: 2, entered: 0, complete: 1, late: 3 } },
        { phase: 'sweep', state: 'complete', iterations: { eligible: 0, entered: 0, complete: 0, late: 0, note: 'no elements matched the iterate_over filter' } },
        { phase: 'polish', state: 'skipped' },
      ],
      frontier: [STEP],
      late: [{ type: 'bug', id: 'bug-9', status: 'open' }],
    },
    {
      instance: { id: 'old-1', workflow: 'cycle', element: { type: 'release', id: 'r-1', status: 'deprecated' }, context: null, created: [], planStatus: 'active', startCommit: 'def', active: false, abandoned: true },
      complete: true,
      phases: [],
      frontier: [],
      late: [],
    },
  ],
  pendingApprovals: [],
  ungated: [{ type: 'task', id: 'task-7', status: 'pending' }],
  ungatedRoutedTo: [],
  diagnostics: [{ code: 'W_X', severity: 'warning', file: 'f', path: '', message: 'm' }],
};

describe('task-225 — renderStatusConsole on a synthetic StatusResult', () => {
  const text = renderStatusConsole(RESULT);

  it('phases: counts above zero, the iterate_over note, a vacuous completion, a skipped phase', () => {
    expect(text).toContain('phases: plan complete (vacuous), develop current (eligible 2, complete 1, late 3), sweep complete (no elements matched the iterate_over filter), polish skipped');
  });

  it('an instance with no flag, one complete and abandoned; an element-less instance', () => {
    expect(text).toContain('\n  rc-1 (cycle)\n    element: (none)\n');
    expect(text).toContain('  old-1 (cycle) — complete, abandoned\n    element: release:r-1 (deprecated)\n');
  });

  it('a step with no role, re-entered, waiting for a third party; the late elements', () => {
    expect(text).toContain('      - loop.red@task:task-2 (no role; missing: record) re-entered after abc123\n');
    expect(text).toContain('        waiting for a vendor: vendor.ack');
    expect(text).toContain('    late: bug:bug-9 (open)\n');
  });

  it("an ungated element with no approver in dna.yaml says so; the diagnostics count", () => {
    expect(text).toContain("human needed: approve or reject task-7 (task, pending; no open workflow carries it) — routed to no approver found for role 'approver' in dna.yaml");
    expect(text.endsWith('1 diagnostic(s): --format json lists them\n')).toBe(true);
  });
});

describe('task-225 — the routing arms no fixture repository reaches', () => {
  it('by_person naming no member: routedTo [], a routingError (the registry refuses it at load)', () => {
    expect(routeApproval({ by_person: 'Casey' }, DNA)).toEqual({ byPerson: 'Casey', routedTo: [], routingError: "no member 'Casey' found in dna.yaml" });
    expect(routeApproval({ by_person: 'Casey' }, null)).toMatchObject({ routedTo: [] });
  });

  it('by_person matches an email too; a member with no email reports it as empty', () => {
    expect(routeApproval({ by_person: 'alex@example.invalid' }, DNA)).toEqual({ byPerson: 'alex@example.invalid', routedTo: [{ name: 'Alex', email: 'alex@example.invalid' }] });
    expect(routeApproval({ by_person: 'Morgan' }, DNA)).toEqual({ byPerson: 'Morgan', routedTo: [{ name: 'Morgan', email: '' }] });
  });

  it('a routed member dna.yaml does not list, or one holding the approver role, raises no warning; a non-approver does', () => {
    const approvalStep = (routedTo: { name: string; email: string }[]): Step =>
      ({ key: 's', awaiting: { kind: 'approval', byPerson: 'x', elements: [], recordNeeded: true, routedTo } }) as unknown as Step;
    expect(approvalDiagnostics([approvalStep([{ name: 'Ghost', email: 'g@example.invalid' }])], DNA)).toEqual([]);
    expect(approvalDiagnostics([approvalStep([{ name: 'Morgan', email: '' }])], DNA)).toEqual([]);
    expect(approvalDiagnostics([approvalStep([{ name: 'Alex', email: 'alex@example.invalid' }])], null)).toEqual([]);
    expect(approvalDiagnostics([approvalStep([{ name: 'Alex', email: 'alex@example.invalid' }]), STEP], DNA).map((d) => d.path)).toEqual(['team.members[0].roles']);
  });
});
