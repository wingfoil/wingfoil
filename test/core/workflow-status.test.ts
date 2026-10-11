/**
 * task-225 — `wingfoil workflow status [<ref>]` (`spec-017` §5.1–§5.4, §7.4, §8 `StatusResult` /
 * `PendingApproval`; BDD P4.5, P4.14, P4.15, X1.1, X1.2), through the registered `CORE_MODULES` operation and
 * the `src/core` barrel, on fixture repositories committed at `HEAD`.
 *
 * - AC 1: BDD P4.5 sc. 1 (both open workflows, the active one marked, the one pending approval shown) and
 *   sc. 3 (`no open workflows`, exit 0). Sc. 2 (`--format json|yaml`) is the CLI suite's.
 * - AC 2: BDD P4.14 sc. 1 (routed to Morgan by role, reported, nothing recorded), sc. 2 (routed to Casey by
 *   person), sc. 3 (`routedTo: []`, `routingError`), and `W_APPROVAL_ROLE_WITHOUT_AUTHORITY`.
 * - AC 3: BDD P4.15 sc. 1–2 as amended: after a reject the fallback step is current, `reentered: true`, the
 *   reject commit and the declared `set_state`; the element has the reject target's state; `dev-loop.done`'s
 *   fallback is reported only.
 * - AC 4: BDD X1.1 sc. 1–2 and X1.2 sc. 1: the "human needed" lines.
 * - AC 5: an approval phase that carries no element through a gate awaits a `workflow finalize` record once its
 *   other evidence holds (`recordNeeded: true`).
 * - Handover (W3 B4): the `sync_state` aggregate rule, on a two-task fixture.
 */
import { join } from 'node:path';

import {
  CORE_MODULES,
  iterationStartState,
  loadWorkflowRegistryAtHead,
  renderStatusConsole,
  workflowExitStates,
  type StatusResult,
  type Step,
} from '../../src/core';
import { loadMemoryYamlAtHead } from '../../src/core/loaders';
import type { CoreResult } from '../../src/core/types';
import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const MEMORY_YAML = `version: 1.0
types:
  release:
    path: "docs/releases/{id}.md"
    states:
      sequence: [ draft, planning, in-development, releasing, released ]
  task:
    path: "docs/tasks/{id}.md"
    states:
      sequence: [ draft, pending, backlog, in-progress, in-review, approved, done ]
      gates:
        pending:   { reject: draft }
        in-review: { reject: in-progress }
  bug:
    path: "docs/bugs/{id}.md"
    states:
      sequence: [ draft, open, triaged, planned, in-progress, in-review, resolved, closed ]
      gates:
        triaged:   { reject: closed }
        in-review: { reject: in-progress }
      waiting: [ triaged ]
  spec:
    path: "docs/specs/{id}.md"
    states:
      sequence: [ draft, pending, approved ]
      gates:
        pending: { reject: draft }
  plan:
    path: "docs/plans/{id}.md"
    states:
      sequence: [ draft, active, done ]
      waiting: [ active ]
`;

/** BDD P4.14 Background / X1.2 Background: Morgan holds `approver`, Casey is a stakeholder. */
function dnaYaml(approverHeld: boolean): string {
  return `version: 1.0
modules:
  - name: core
    path: src/core
stacks:
  technologies:
    - name: TypeScript
      category: language
team:
  members:
    - name: Alex
      email: alex@example.invalid
      roles: [ developer ]
    - name: Casey
      email: casey@example.invalid
      roles: [ stakeholder ]
    - name: Morgan
      email: morgan@example.invalid
      roles: [ reviewer, ${approverHeld ? 'approver, ' : ''}tech-lead ]
  agents:
    - name: Claude
      email: noreply@anthropic.com
      executes_as: [ qa ]
      approval_authority: false
  roles:
    - name: developer
    - name: reviewer
    - name: qa
    - name: approver
    - name: tech-lead
    - name: stakeholder
paths:
  sources: [ src/ ]
`;
}

const ROLES_YAML = `version: 1.0
assignments:
  developer: [ testing ]
global: []
`;

const RELEASE_CYCLE = `name: release-cycle
startable: true
element: release
phases:
  - name: develop
    iterate_over: task
    where: { status: [ backlog ] }
    include: dev-loop
  - name: ship
    role: tech-lead
    actions:
      - element.set_state(released)
`;

/** `dev-loop`'s shape: the review gate with its fallback (P4.15), the bug syncs of the B4 handover. */
function devLoop(reviewFallback: string): string {
  return `name: dev-loop
includable: true
element: task
phases:
  - name: start
    role: developer
    actions:
      - element.set_state(in-progress)
      - 'bug.sync_state(for_each: task.bug)'
  - name: red
    role: qa
    actions:
      - 'bug.sync_state(for_each: task.bug)'
      - agent.execute
  - name: review
    role: reviewer
    actions:
      - memory.submit
      - 'bug.sync_state(for_each: task.bug)'
    approval: { by_role: approver }
    fallback: ${reviewFallback}
  - name: done
    role: developer
    actions:
      - memory.approve
      - element.set_state(done)
      - 'bug.sync_state(for_each: task.bug)'
    fallback: { step: red, set_state: in-progress }
`;
}

/** `release-planning.commit-backlog`'s shape on a type with no gates: no element is carried (AC 5). */
const PLANNING = `name: planning
startable: true
element: release
phases:
  - name: commit-backlog
    role: tech-lead
    actions:
      - release.set_state(in-development)
    approval: { by_role: approver }
`;

/** A spec review routed to a person (BDD P4.14 sc. 2, X1.1 sc. 1). */
const SPEC_REVIEW = `name: spec-review
startable: true
element: spec
phases:
  - name: draft
    role: developer
    actions:
      - memory.submit
  - name: approve
    role: tech-lead
    actions:
      - memory.approve
    approval: { by_person: Casey }
`;

/** A workflow whose step waits for a third party (§5.4): no approval. */
const OUTREACH = `name: outreach
startable: true
element: release
phases:
  - name: announce
    role: developer
    actions:
      - 'cli.run(note: "x")'
    awaits: { party: "the press office", evidence: "press.ack" }
`;

const BINDINGS_YAML = `version: 1.0
actions:
  cli.run: { manual: true }
`;

function writeProject(root: string, options: { approverHeld?: boolean; reviewFallback?: string } = {}): void {
  const workflows: Record<string, string> = {
    'workflows/custom/release-cycle.yaml': RELEASE_CYCLE,
    'workflows/custom/dev-loop.yaml': devLoop(options.reviewFallback ?? '{ step: red, set_state: in-progress }'),
    'workflows/custom/planning.yaml': PLANNING,
    'workflows/custom/spec-review.yaml': SPEC_REVIEW,
    'workflows/custom/outreach.yaml': OUTREACH,
  };
  writeFixtureFile(root, '.wingfoil/workflows.yaml', `version: 1.0\ninclude:\n${Object.keys(workflows).map((file) => `  - ${file}\n`).join('')}`);
  for (const [file, content] of Object.entries(workflows)) writeFixtureFile(root, `.wingfoil/${file}`, content);
  writeFixtureFile(root, '.wingfoil/workflows/bindings.yaml', BINDINGS_YAML);
  writeFixtureFile(root, '.wingfoil/memory.yaml', MEMORY_YAML);
  writeFixtureFile(root, '.wingfoil/dna.yaml', dnaYaml(options.approverHeld ?? true));
  writeFixtureFile(root, '.wingfoil/roles.yaml', ROLES_YAML);
  writeFixtureFile(root, '.wingfoil/directives/custom/testing.md', '---\nid: testing\nname: "Testing"\ntype: directive\nkind: custom\ntitle: "Testing"\n---\n\n# Testing\n');
  commitAll(root, 'fixture configuration');
}

function element(type: string, id: string, status: string, extra = ''): string {
  return `---\nid: "${id}"\ntype: ${type}\ntitle: "${id}"\nstatus: ${status}\n${extra}---\n\n## Body\n`;
}

function plan(id: string, workflow: string, elementId: string): string {
  return element('plan', id, 'active', `workflow: "${workflow}"\nphase: "x"\nelement: "${elementId}"\n`);
}

function task(id: string, status: string, bugs: readonly string[] = []): Record<string, string> {
  return { [`docs/tasks/${id}.md`]: element('task', id, status, `bug: [${bugs.map((bug) => `"${bug}"`).join(', ')}]\n`) };
}

/** Write `files` and commit them with `subject` and, when given, a trailer block. */
function commit(root: string, files: Record<string, string>, subject: string, trailers: Record<string, string> = {}): string {
  for (const [path, content] of Object.entries(files)) writeFixtureFile(root, path, content);
  git(root, ['add', '-A']);
  const block = Object.entries(trailers)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');
  git(root, ['commit', '--allow-empty', '--quiet', '-m', subject, ...(block === '' ? [] : ['-m', block])]);
  return git(root, ['rev-parse', 'HEAD']).trim();
}

/** A phase record of `step` on `scope`, as `workflow finalize` writes it (`spec-003` § "Evidence"). */
function record(root: string, instance: string, step: string, scope: string): string {
  return commit(root, {}, `workflow: finalize ${instance} ${step}`, {
    'WingFoil-Phase': `${step} completed`,
    'WingFoil-Instance': instance,
    'WingFoil-Element': scope,
  });
}

const statusOp = CORE_MODULES.find((module) => module.name === 'workflow')?.operations['workflowStatus'];
const nextOp = CORE_MODULES.find((module) => module.name === 'workflow')?.operations['workflowNext'];

async function call<T>(operation: typeof statusOp, name: string, root: string, positional?: string): Promise<CoreResult<T>> {
  if (operation === undefined) throw new Error(`no ${name} operation in CORE_MODULES`);
  const value = await operation.fn({ root, ...(positional === undefined ? {} : { positional }) });
  return (typeof value === 'object' && value !== null && 'ok' in value ? value : { ok: true, value }) as CoreResult<T>;
}

async function status(root: string, positional?: string): Promise<StatusResult> {
  const result = await call<StatusResult>(statusOp, 'workflowStatus', root, positional);
  if (!result.ok) throw new Error(`workflow status refused: ${result.error.message}`);
  return result.value;
}

async function nextStep(root: string, positional?: string): Promise<{ next: Step | null; more: readonly Step[]; diagnostics: readonly { code: string; message: string }[] }> {
  const result = await call<{ next: Step | null; more: readonly Step[]; diagnostics: readonly { code: string; message: string }[] }>(nextOp, 'workflowNext', root, positional);
  if (!result.ok) throw new Error(`workflow next refused: ${result.error.message}`);
  return result.value;
}

function frontierStep(value: StatusResult, key: string): Step {
  const found = value.open.flatMap((entry) => entry.frontier).find((step) => step.key === key);
  if (found === undefined) throw new Error(`no frontier step ${key}: ${value.open.flatMap((entry) => entry.frontier.map((step) => step.key)).join(', ')}`);
  return found;
}

function syncSubject(step: Step): string | undefined {
  const action = step.actions.find((entry) => entry.token === 'bug.sync_state(for_each: task.bug)');
  if (action === undefined) throw new Error(`no bug sync in ${step.key}`);
  return action.binding.expectedCommit;
}

const MORGAN = { name: 'Morgan', email: 'morgan@example.invalid' };
const CASEY = { name: 'Casey', email: 'casey@example.invalid' };

describe('task-225 — workflow status is registered (spec-017 §7.4, §9)', () => {
  it('workflowStatus is a read-only operation of the workflow module, positional <ref> optional, a console renderer', () => {
    expect(statusOp).toMatchObject({ name: 'workflowStatus', mutates: false, positional: { name: 'ref' } });
    expect(statusOp?.positional?.required).not.toBe(true);
    expect(statusOp?.options ?? []).toEqual([]);
    expect(typeof statusOp?.renderConsole).toBe('function');
  });
});

describe('task-225 AC 1 — BDD P4.5: two open workflows, one pending approval (spec-017 §7.4)', () => {
  let repo: string;
  let head: string;
  beforeAll(() => {
    repo = makeTempGitRepo();
    writeProject(repo);
    commit(repo, { 'docs/releases/minor-1.md': element('release', 'minor-1', 'in-development'), ...task('task-1', 'backlog'), ...task('task-3', 'pending') }, 'seed elements');
    commit(repo, { 'docs/plans/rc-1.md': plan('rc-1', 'release-cycle', 'minor-1') }, 'wf(plan): add rc-1');
    commit(repo, task('task-1', 'in-progress'), 'wf(task): start task-1 [backlog → in-progress]');
    record(repo, 'rc-1', 'dev-loop.red', 'task:task-1');
    commit(repo, task('task-1', 'in-review'), 'wf(task): submit task-1');
    commit(repo, { 'docs/plans/out-1.md': plan('out-1', 'outreach', 'minor-1') }, 'wf(plan): add out-1');
    head = git(repo, ['rev-parse', 'HEAD']).trim();
  });
  afterAll(() => removeTempDir(repo));

  it('sc. 1 — both open workflows are listed, most recently started first, the active one marked', async () => {
    const value = await status(repo);
    expect(value.baseline).toEqual({ rev: 'HEAD', commit: head });
    expect(value.active).toBe('out-1');
    expect(value.open.map((entry) => [entry.instance.id, entry.instance.active, entry.complete])).toEqual([
      ['out-1', true, false],
      ['rc-1', false, false],
    ]);
    expect(value.message).toBeUndefined();
  });

  it('sc. 1 — each instance carries its top-level phase progress, its frontier and its late elements', async () => {
    const rc = (await status(repo)).open[1]!;
    expect(rc.phases).toEqual([
      { phase: 'develop', state: 'current', iterations: { eligible: 0, entered: 1, complete: 0, late: 0 } },
      { phase: 'ship', state: 'pending' },
    ]);
    expect(rc.frontier.map((step) => step.key)).toEqual(['dev-loop.review@task:task-1']);
    expect(rc.late).toEqual([]);
  });

  it('sc. 1 — the 1 pending approval is shown: the review, task-1 in-review, routed to the approver', async () => {
    const value = await status(repo);
    expect(value.pendingApprovals).toEqual([
      {
        step: 'dev-loop.review@task:task-1',
        instance: 'rc-1',
        trail: [
          { workflow: 'release-cycle', phase: 'develop', scope: { element: { type: 'release', id: 'minor-1', status: 'in-development' } } },
          { workflow: 'dev-loop', phase: 'review', scope: { element: { type: 'task', id: 'task-1', status: 'in-review' } } },
        ],
        awaiting: { kind: 'approval', byRole: 'approver', elements: [{ type: 'task', id: 'task-1', status: 'in-review' }], recordNeeded: false, routedTo: [MORGAN] },
      },
    ]);
  });

  it('the ungated elements: in a gate state, carried by no pending approval (spec-017 §5.1)', async () => {
    expect((await status(repo)).ungated).toEqual([{ type: 'task', id: 'task-3', status: 'pending' }]);
  });

  it('a <ref> selects one instance; the pending approvals follow it, the ungated elements do not', async () => {
    const value = await status(repo, 'outreach');
    expect(value.open.map((entry) => entry.instance.id)).toEqual(['out-1']);
    expect(value.active).toBe('out-1');
    expect(value.pendingApprovals).toEqual([]);
    expect(value.ungated).toEqual([{ type: 'task', id: 'task-3', status: 'pending' }]);
  });

  it('a <ref> naming nothing is NOT_FOUND "unknown workflow: <ref>"; a loaded workflow not open is "workflow is not open: <ref>" (spec-017 §10)', async () => {
    expect(await call(statusOp, 'workflowStatus', repo, 'ghost')).toMatchObject({ ok: false, error: { code: 'NOT_FOUND', message: 'unknown workflow: ghost' } });
    expect(await call(statusOp, 'workflowStatus', repo, 'planning')).toMatchObject({ ok: false, error: { code: 'NOT_FOUND', message: 'workflow is not open: planning' } });
  });

  it('console: both instances, the active one marked, the phases, the frontier and the human-needed lines', async () => {
    const text = renderStatusConsole(await status(repo));
    expect(text).toContain('* out-1 (outreach) — active');
    expect(text).toContain('  rc-1 (release-cycle)');
    expect(text).toContain('phases: develop current (entered 1), ship pending');
    expect(text).toContain('- dev-loop.review@task:task-1 (reviewer)');
    expect(text).toContain('pending approvals: 1');
    expect(text).toContain('human needed: approve or reject task-1 — routed to Morgan <morgan@example.invalid> (rc-1, dev-loop.review@task:task-1)');
    expect(text).toContain('ungated elements: 1');
    expect(text).toContain('human needed: approve or reject task-3 (task, pending; no open workflow carries it) — routed to Morgan <morgan@example.invalid>');
  });

  it('StatusResult carries exactly spec-017 §8 fields, plus ungatedRoutedTo (§5.3: an ungated line names its routed members)', async () => {
    const value = JSON.parse(JSON.stringify(await status(repo))) as Record<string, unknown>;
    expect(Object.keys(value).sort()).toEqual(['active', 'baseline', 'diagnostics', 'open', 'pendingApprovals', 'ungated', 'ungatedRoutedTo']);
    expect(value['ungatedRoutedTo']).toEqual([MORGAN]);
    for (const entry of value['open'] as Record<string, unknown>[]) expect(Object.keys(entry).sort()).toEqual(['complete', 'frontier', 'instance', 'late', 'phases']);
    for (const entry of value['pendingApprovals'] as Record<string, unknown>[]) expect(Object.keys(entry).sort()).toEqual(['awaiting', 'instance', 'step', 'trail']);
  });
});

describe('task-225 AC 1 — BDD P4.5 sc. 3: no open workflows', () => {
  it("no instance open and nothing ungated: 'no open workflows', open: []", async () => {
    const repo = makeTempGitRepo();
    try {
      writeProject(repo);
      commit(repo, { 'docs/releases/minor-1.md': element('release', 'minor-1', 'released') }, 'seed');
      const value = await status(repo);
      expect(value).toMatchObject({ active: null, open: [], pendingApprovals: [], ungated: [], message: 'no open workflows' });
      expect(renderStatusConsole(value).split('\n')[0]).toBe('no open workflows');
    } finally {
      removeTempDir(repo);
    }
  });

  it("no instance open but an element waits at a gate: 'no open workflows' all the same (sc. 3 says only that none is open), the element listed ungated after it", async () => {
    const repo = makeTempGitRepo();
    try {
      writeProject(repo);
      commit(repo, task('task-1', 'pending'), 'seed');
      const value = await status(repo);
      expect(value.message).toBe('no open workflows');
      expect(value.open).toEqual([]);
      expect(value.ungated).toEqual([{ type: 'task', id: 'task-1', status: 'pending' }]);
      const lines = renderStatusConsole(value).split('\n');
      expect(lines[0]).toBe('no open workflows');
      expect(lines).toContain('ungated elements: 1');
    } finally {
      removeTempDir(repo);
    }
  });

  it('a state that is both a gate and waiting is no ungated element: no CLI verb approves it, a workflow action advances it (review F1)', async () => {
    const repo = makeTempGitRepo();
    try {
      writeProject(repo);
      commit(repo, { 'docs/bugs/bug-5.md': element('bug', 'bug-5', 'triaged'), 'docs/bugs/bug-6.md': element('bug', 'bug-6', 'in-review') }, 'seed');
      expect((await status(repo)).ungated).toEqual([{ type: 'bug', id: 'bug-6', status: 'in-review' }]);
    } finally {
      removeTempDir(repo);
    }
  });
});

describe('task-225 AC 2 — BDD P4.14: approval routing from dna.yaml (spec-017 §5.1, dl-033)', () => {
  it('sc. 1 — by_role: routed to Morgan, reported and not recorded (HEAD unchanged, no file written)', async () => {
    const repo = makeTempGitRepo();
    try {
      writeProject(repo);
      commit(repo, { 'docs/releases/minor-1.md': element('release', 'minor-1', 'in-development'), ...task('task-1', 'in-progress') }, 'seed');
      commit(repo, { 'docs/plans/rc-1.md': plan('rc-1', 'release-cycle', 'minor-1') }, 'wf(plan): add rc-1');
      record(repo, 'rc-1', 'dev-loop.red', 'task:task-1');
      commit(repo, task('task-1', 'in-review'), 'wf(task): submit task-1');
      const head = git(repo, ['rev-parse', 'HEAD']).trim();
      const value = await status(repo);
      expect(value.pendingApprovals.map((entry) => entry.awaiting.routedTo)).toEqual([[MORGAN]]);
      expect(git(repo, ['rev-parse', 'HEAD']).trim()).toBe(head);
      expect(git(repo, ['status', '--porcelain'])).toBe('');
      expect(value.diagnostics.filter((d) => d.code === 'W_APPROVAL_ROLE_WITHOUT_AUTHORITY')).toEqual([]);
    } finally {
      removeTempDir(repo);
    }
  });

  it('sc. 2 — by_person overrides role routing: routed to Casey, who lacks the approver role (W_APPROVAL_ROLE_WITHOUT_AUTHORITY)', async () => {
    const repo = makeTempGitRepo();
    try {
      writeProject(repo);
      commit(repo, { 'docs/specs/spec-1.md': element('spec', 'spec-1', 'pending') }, 'seed');
      commit(repo, { 'docs/plans/sr-1.md': plan('sr-1', 'spec-review', 'spec-1') }, 'wf(plan): add sr-1');
      const value = await status(repo);
      expect(value.pendingApprovals.map((entry) => [entry.step, entry.awaiting])).toEqual([
        ['spec-review.approve@spec:spec-1', { kind: 'approval', byPerson: 'Casey', elements: [{ type: 'spec', id: 'spec-1', status: 'pending' }], recordNeeded: false, routedTo: [CASEY] }],
      ]);
      expect(value.diagnostics.filter((d) => d.code === 'W_APPROVAL_ROLE_WITHOUT_AUTHORITY')).toEqual([
        {
          code: 'W_APPROVAL_ROLE_WITHOUT_AUTHORITY',
          severity: 'warning',
          file: '.wingfoil/dna.yaml',
          path: 'team.members[1].roles',
          message: "approval of spec-review.approve@spec:spec-1 is routed to Casey <casey@example.invalid>, who does not hold the 'approver' role: only an approver may decide it",
        },
      ]);
      // `next` reports the same approval and the same warning (one step builder, §5.3).
      const next = await nextStep(repo);
      expect(next.next?.awaiting).toEqual(value.pendingApprovals[0]!.awaiting);
      expect(next.diagnostics.map((d) => d.code)).toContain('W_APPROVAL_ROLE_WITHOUT_AUTHORITY');
    } finally {
      removeTempDir(repo);
    }
  });

  it("sc. 3 — no member holds the role: routedTo: [], routingError \"no approver found for role 'approver' in dna.yaml\", reported (ok)", async () => {
    const repo = makeTempGitRepo();
    try {
      writeProject(repo, { approverHeld: false });
      commit(repo, { 'docs/releases/minor-1.md': element('release', 'minor-1', 'in-development'), ...task('task-1', 'in-progress') }, 'seed');
      commit(repo, { 'docs/plans/rc-1.md': plan('rc-1', 'release-cycle', 'minor-1') }, 'wf(plan): add rc-1');
      record(repo, 'rc-1', 'dev-loop.red', 'task:task-1');
      commit(repo, task('task-1', 'in-review'), 'wf(task): submit task-1');
      const value = await status(repo);
      expect(value.pendingApprovals.map((entry) => entry.awaiting)).toEqual([
        {
          kind: 'approval',
          byRole: 'approver',
          elements: [{ type: 'task', id: 'task-1', status: 'in-review' }],
          recordNeeded: false,
          routedTo: [],
          routingError: "no approver found for role 'approver' in dna.yaml",
        },
      ]);
      expect(renderStatusConsole(value)).toContain("human needed: approve or reject task-1 — routed to no approver found for role 'approver' in dna.yaml");
    } finally {
      removeTempDir(repo);
    }
  });
});

describe('task-225 AC 3 — BDD P4.15 as amended: after a reject the fallback step is current (spec-017 §4.8, §5.2)', () => {
  /** rc-1 on task-1, through the review, then rejected: `in-review → in-progress`. Returns the reject sha. */
  function throughReject(repo: string): string {
    commit(repo, { 'docs/releases/minor-1.md': element('release', 'minor-1', 'in-development'), ...task('task-1', 'backlog') }, 'seed');
    commit(repo, { 'docs/plans/rc-1.md': plan('rc-1', 'release-cycle', 'minor-1') }, 'wf(plan): add rc-1');
    commit(repo, task('task-1', 'in-progress'), 'wf(task): start task-1 [backlog → in-progress]');
    record(repo, 'rc-1', 'dev-loop.red', 'task:task-1');
    commit(repo, task('task-1', 'in-review'), 'wf(task): submit task-1');
    return commit(repo, task('task-1', 'in-progress'), 'wf(task): reject task-1 [in-review → in-progress]');
  }

  it('sc. 1 — the position moves to red, re-entered, with the reject commit and the declared set_state; the state is the reject target', async () => {
    const repo = makeTempGitRepo();
    try {
      writeProject(repo);
      const reject = throughReject(repo);
      const value = await status(repo);
      const step = frontierStep(value, 'dev-loop.red@task:task-1');
      expect(step).toMatchObject({ reentered: true, reentryCommit: reject, fallback: { step: 'red', setState: 'in-progress' } });
      expect(step.scope).toEqual({ element: { type: 'task', id: 'task-1', status: 'in-progress' } });
      expect(value.pendingApprovals).toEqual([]);
    } finally {
      removeTempDir(repo);
    }
  });

  it('sc. 2 — a fallback with no set_state: red is current, setState null, and task-1 has the reject target\'s state', async () => {
    const repo = makeTempGitRepo();
    try {
      writeProject(repo, { reviewFallback: '{ step: red }' });
      const reject = throughReject(repo);
      const step = frontierStep(await status(repo), 'dev-loop.red@task:task-1');
      expect(step).toMatchObject({ reentered: true, reentryCommit: reject, fallback: { step: 'red', setState: null } });
      expect(step.scope).toEqual({ element: { type: 'task', id: 'task-1', status: 'in-progress' } });
    } finally {
      removeTempDir(repo);
    }
  });

  it("dev-loop.done's fallback (a failed merge, P4.10) is reported only: done is not re-entered", async () => {
    const repo = makeTempGitRepo();
    try {
      writeProject(repo);
      commit(repo, { 'docs/releases/minor-1.md': element('release', 'minor-1', 'in-development'), ...task('task-1', 'in-progress') }, 'seed');
      commit(repo, { 'docs/plans/rc-1.md': plan('rc-1', 'release-cycle', 'minor-1') }, 'wf(plan): add rc-1');
      record(repo, 'rc-1', 'dev-loop.red', 'task:task-1');
      commit(repo, task('task-1', 'approved'), 'wf(task): approve task-1 [in-review → approved]');
      const step = frontierStep(await status(repo), 'dev-loop.done@task:task-1');
      expect(step).toMatchObject({ reentered: false, reentryCommit: null, fallback: { step: 'red', setState: 'in-progress' }, awaiting: null });
    } finally {
      removeTempDir(repo);
    }
  });
});

describe('task-225 AC 4 — BDD X1.1 / X1.2: the "human needed" lines are the v0.3 notification channel (spec-017 §5.3)', () => {
  it('X1.1 sc. 1 — a deliverable at status: pending requiring approval: a line naming the action, the document id and the routed members', async () => {
    const repo = makeTempGitRepo();
    try {
      writeProject(repo);
      commit(repo, { 'docs/specs/spec-1.md': element('spec', 'spec-1', 'draft') }, 'seed');
      commit(repo, { 'docs/plans/sr-1.md': plan('sr-1', 'spec-review', 'spec-1') }, 'wf(plan): add sr-1');
      expect((await status(repo)).pendingApprovals).toEqual([]); // draft: nothing awaits yet
      commit(repo, { 'docs/specs/spec-1.md': element('spec', 'spec-1', 'pending') }, 'wf(spec): submit spec-1');
      const text = renderStatusConsole(await status(repo));
      expect(text).toContain('human needed: approve or reject spec-1 — routed to Casey <casey@example.invalid> (sr-1, spec-review.approve@spec:spec-1)');
    } finally {
      removeTempDir(repo);
    }
  });

  it('X1.1 sc. 2 — a deliverable between two automated states: no "human needed" line', async () => {
    const repo = makeTempGitRepo();
    try {
      writeProject(repo);
      commit(repo, { 'docs/releases/minor-1.md': element('release', 'minor-1', 'in-development'), ...task('task-1', 'backlog') }, 'seed');
      commit(repo, { 'docs/plans/rc-1.md': plan('rc-1', 'release-cycle', 'minor-1') }, 'wf(plan): add rc-1');
      commit(repo, task('task-1', 'in-progress'), 'wf(task): start task-1 [backlog → in-progress]');
      const value = await status(repo);
      expect(value.open[0]!.frontier.map((step) => [step.key, step.awaiting])).toEqual([['dev-loop.red@task:task-1', null]]);
      expect(renderStatusConsole(value)).not.toContain('human needed');
    } finally {
      removeTempDir(repo);
    }
  });

  it('X1.2 sc. 1 — an approval requiring the approver role is routed to Morgan and not to Casey', async () => {
    const repo = makeTempGitRepo();
    try {
      writeProject(repo);
      commit(repo, { 'docs/releases/minor-1.md': element('release', 'minor-1', 'in-development'), ...task('task-1', 'in-progress') }, 'seed');
      commit(repo, { 'docs/plans/rc-1.md': plan('rc-1', 'release-cycle', 'minor-1') }, 'wf(plan): add rc-1');
      record(repo, 'rc-1', 'dev-loop.red', 'task:task-1');
      commit(repo, task('task-1', 'in-review'), 'wf(task): submit task-1');
      const [approval] = (await status(repo)).pendingApprovals;
      expect(approval!.awaiting.routedTo).toEqual([MORGAN]);
      expect(approval!.awaiting.routedTo).not.toContainEqual(CASEY);
    } finally {
      removeTempDir(repo);
    }
  });
});

describe('task-225 AC 5 — an approval no element carries awaits a workflow finalize record (spec-017 §5.1)', () => {
  let repo: string;
  beforeAll(() => {
    repo = makeTempGitRepo();
    writeProject(repo);
    commit(repo, { 'docs/releases/minor-2.md': element('release', 'minor-2', 'planning') }, 'seed');
    commit(repo, { 'docs/plans/plan-1.md': plan('plan-1', 'planning', 'minor-2') }, 'wf(plan): add plan-1');
  });
  afterAll(() => removeTempDir(repo));

  it('while its other evidence is missing, the step needs a record too but awaits nothing yet', async () => {
    const step = frontierStep(await status(repo), 'planning.commit-backlog@release:minor-2');
    expect(step.evidence).toEqual({ kinds: ['state', 'record'], missing: ['state', 'record'], finalizable: false });
    expect(step.awaiting).toBeNull();
  });

  it('once its other evidence holds, it awaits the record (recordNeeded: true), finalizable, routed by role', async () => {
    commit(repo, { 'docs/releases/minor-2.md': element('release', 'minor-2', 'in-development') }, 'wf(release): approve minor-2 [planning → in-development]');
    const value = await status(repo);
    const step = frontierStep(value, 'planning.commit-backlog@release:minor-2');
    expect(step.evidence).toEqual({ kinds: ['state', 'record'], missing: ['record'], finalizable: true });
    expect(step.awaiting).toEqual({ kind: 'approval', byRole: 'approver', elements: [], recordNeeded: true, routedTo: [MORGAN] });
    expect(value.pendingApprovals.map((entry) => entry.step)).toEqual(['planning.commit-backlog@release:minor-2']);
    expect(renderStatusConsole(value)).toContain('human needed: finalize planning.commit-backlog@release:minor-2 — routed to Morgan <morgan@example.invalid> (plan-1, planning.commit-backlog@release:minor-2)');
  });

  it('the record completes it: the instance is complete', async () => {
    record(repo, 'plan-1', 'planning.commit-backlog', 'release:minor-2');
    const value = await status(repo);
    expect(value.open.map((entry) => [entry.instance.id, entry.complete, entry.frontier.length])).toEqual([['plan-1', true, 0]]);
    expect(value.pendingApprovals).toEqual([]);
  });
});

describe('task-225 handover (W3 B4) — the sync_state aggregate rule: a bug moves on once every task naming it has', () => {
  /** rc-1 over task-1 and task-2, both naming bug-1. */
  function seed(repo: string, task2: string, bug: string): void {
    writeProject(repo);
    commit(
      repo,
      {
        'docs/releases/minor-1.md': element('release', 'minor-1', 'in-development'),
        ...task('task-1', 'in-progress', ['bug-1']),
        ...task('task-2', task2, ['bug-1']),
        'docs/bugs/bug-1.md': element('bug', 'bug-1', bug),
      },
      'seed',
    );
    commit(repo, { 'docs/plans/rc-1.md': plan('rc-1', 'release-cycle', 'minor-1') }, 'wf(plan): add rc-1');
    record(repo, 'rc-1', 'dev-loop.red', 'task:task-1');
  }

  it("review: task-1's sync does not move bug-1 to in-review while task-2 is still in-progress", async () => {
    const repo = makeTempGitRepo();
    try {
      seed(repo, 'in-progress', 'in-progress');
      record(repo, 'rc-1', 'dev-loop.red', 'task:task-2');
      expect(syncSubject(frontierStep(await status(repo), 'dev-loop.review@task:task-1'))).toBeUndefined();
    } finally {
      removeTempDir(repo);
    }
  });

  it("review: once task-2 is in-review, task-1's sync moves bug-1 in-progress → in-review", async () => {
    const repo = makeTempGitRepo();
    try {
      seed(repo, 'in-review', 'in-progress');
      expect(syncSubject(frontierStep(await status(repo), 'dev-loop.review@task:task-1'))).toBe('wf(bug): sync bug-1 [in-progress → in-review]');
    } finally {
      removeTempDir(repo);
    }
  });

  it("done: task-1's sync does not move bug-1 past in-review while task-2 is not done", async () => {
    const repo = makeTempGitRepo();
    try {
      seed(repo, 'in-review', 'in-review');
      commit(repo, task('task-1', 'approved', ['bug-1']), 'wf(task): approve task-1 [in-review → approved]');
      expect(syncSubject(frontierStep(await status(repo), 'dev-loop.done@task:task-1'))).toBeUndefined();
    } finally {
      removeTempDir(repo);
    }
  });

  it("done: once task-2 is done, task-1's sync moves bug-1 in-review → resolved → closed", async () => {
    const repo = makeTempGitRepo();
    try {
      seed(repo, 'done', 'in-review');
      commit(repo, task('task-1', 'approved', ['bug-1']), 'wf(task): approve task-1 [in-review → approved]');
      expect(syncSubject(frontierStep(await status(repo), 'dev-loop.done@task:task-1'))).toBe('wf(bug): sync bug-1 [in-review → resolved → closed]');
    } finally {
      removeTempDir(repo);
    }
  });

  it('a deprecated task does not hold the bug', async () => {
    const repo = makeTempGitRepo();
    try {
      seed(repo, 'deprecated', 'in-review');
      commit(repo, task('task-1', 'approved', ['bug-1']), 'wf(task): approve task-1 [in-review → approved]');
      expect(syncSubject(frontierStep(await status(repo), 'dev-loop.done@task:task-1'))).toBe('wf(bug): sync bug-1 [in-review → resolved → closed]');
    } finally {
      removeTempDir(repo);
    }
  });

  it("a move back is never held: after task-1's reject, red's sync moves bug-1 in-review → in-progress although task-2 is in-review", async () => {
    const repo = makeTempGitRepo();
    try {
      seed(repo, 'in-review', 'in-review');
      commit(repo, task('task-1', 'in-review', ['bug-1']), 'wf(task): submit task-1');
      commit(repo, task('task-1', 'in-progress', ['bug-1']), 'wf(task): reject task-1 [in-review → in-progress]');
      expect(syncSubject(frontierStep(await status(repo), 'dev-loop.red@task:task-1'))).toBe('wf(bug): sync bug-1 [in-review → in-progress]');
    } finally {
      removeTempDir(repo);
    }
  });
});

describe('task-225 AC 5 (characterization) — on this repository, six approval phases carry no element through a gate (spec-017 §5.1, §12)', () => {
  it("the approval phases whose actions hold no gate are §5.1's list (seven before task-199; the AC's count is that older one)", () => {
    const root = join(__dirname, '..', '..');
    const { workflows } = loadWorkflowRegistryAtHead(root);
    const memoryYaml = loadMemoryYamlAtHead(root)!;
    const byName = new Map(workflows.map((workflow) => [workflow.name, workflow] as const));
    // Where an included workflow runs under `iterate_over`, it starts from the governing `where.status` (§4.4).
    const iteratedWhere = new Map<string, Readonly<Record<string, unknown>> | undefined>();
    for (const workflow of workflows) for (const phase of workflow.phases) if (phase.include !== undefined && phase.iterate_over !== undefined) iteratedWhere.set(phase.include, phase.where);
    const unheld: string[] = [];
    for (const workflow of workflows) {
      const type = workflow.element ?? null;
      const state = type === null ? null : iterationStartState(memoryYaml, type, iteratedWhere.get(workflow.name));
      const exits = workflowExitStates(workflow, memoryYaml, { boundType: type, state, instance: workflow.kind === 'main' || workflow.startable === true }, byName);
      workflow.phases.forEach((phase, p) => {
        if (phase.approval !== undefined && exits[p]!.held.length === 0) unheld.push(`${workflow.name}.${phase.name}`);
      });
    }
    expect(unheld).toEqual([
      'user-docs.align-user-docs',
      'agent-docs.align-agent-docs',
      'e2e-smoke.gate',
      'release-submit.approve-release',
      'release-publishing.publish',
      'retrospective.additional-points',
    ]);
  });
});
