/**
 * task-216 — `wingfoil workflow next [<ref>] [--assigned-to <who>]` (`spec-017` §6.1–§6.4, §7.3, §8 `Step` /
 * `NextResult`, §10; BDD P4.4), through the registered `CORE_MODULES` operation and the `src/core` barrel, on
 * fixture repositories committed at `HEAD`.
 *
 * - AC 1: BDD P4.4 sc. 1 (step name, target element, role, role directives), sc. 2 (`--assigned-to me`, a
 *   member name or email, a role name), sc. 3 (`no next step: workflow 'release-cycle' is complete`, exit 0),
 *   and `no open workflows` with no open instance.
 * - AC 2: a `manual` binding's expected commit subject by `spec-003`'s verb rule — `dev-loop.start`'s
 *   `start`, `commit-backlog`'s `approve` — and, after a review reject (`task-205` AC 2's `next` half,
 *   `dl-061` A.1), the fallback step `red` with the `bug.sync_state` subject `[in-review → in-progress]`.
 * - AC 3: `NextResult` and `Step` carry exactly §8's fields (a schema test); the console view prints the
 *   key, trail, role, scope, the actions with bindings, the directive ids and any "human needed" line.
 * - AC 5 (characterization): no directive content is inlined, and a phase has no directive field
 *   (`dl-066` option 1): one written there is ignored.
 *
 * AC 4 (REQ-PERF-03) is `test/core/workflow-next-latency.test.ts`, in the opt-in latency pass.
 */
import {
  buildStep,
  CORE_MODULES,
  deduceWorkflowStateAtHead,
  nextWorkflow,
  readDeductionSnapshotAtHead,
  renderNextConsole,
  type Deduction,
  type NextInputs,
  type NextResult,
  type Step,
} from '../../src/core';
import { loadDirectivesAtRev, loadRolesYamlAtRev } from '../../src/core/loaders';
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
        in-review: { reject: in-progress }
  plan:
    path: "docs/plans/{id}.md"
    states:
      sequence: [ draft, active, done ]
      waiting: [ active ]
`;

const DNA_YAML = `version: 1.0
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
    - name: Morgan
      email: morgan@example.invalid
      roles: [ reviewer, approver, tech-lead ]
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
paths:
  sources: [ src/ ]
`;

const ROLES_YAML = `version: 1.0
assignments:
  developer: [ testing ]
  reviewer: [ code-review ]
  qa: [ testing ]
global: [ security ]
`;

/** A directive whose body carries a sentinel: AC 5 checks it never reaches the payload. */
function directive(id: string, title: string): string {
  return `---\nid: ${id}\nname: "${title}"\ntype: directive\nkind: custom\ntitle: "${title}"\n---\n\n# ${title}\n\nDIRECTIVE-BODY-SENTINEL ${id}\n`;
}

/** BDD P4.4 Background: the main `release-cycle`, iterating `dev-loop` over the release's backlog tasks. */
const RELEASE_CYCLE = `name: release-cycle
startable: true
element: release
description: "Deliver one release"
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

const DEV_LOOP = `name: dev-loop
includable: true
element: task
phases:
  - name: start
    role: developer
    directives: [ code-review ]
    actions:
      - 'git.create_branch(task: "{task.id}")'
      - element.set_state(in-progress)
      - 'bug.sync_state(for_each: task.bug)'
  - name: red
    role: qa
    actions:
      - 'bug.sync_state(for_each: task.bug)'
      - agent.execute
    checks:
      post: [ "tests.passing" ]
  - name: review
    role: reviewer
    actions:
      - memory.submit
      - 'bug.sync_state(for_each: task.bug)'
    approval: { by_role: approver }
    fallback: { step: red, set_state: in-progress }
  - name: done
    role: developer
    actions:
      - memory.approve
      - element.set_state(done)
      - 'bug.sync_state(for_each: task.bug)'
`;

/** `release-planning.commit-backlog`'s shape (AC 2): a typed `set_state` under `approval:`. */
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

/** A workflow with a token no element answers (§4.1) and a third party (§5.4). */
const OUTREACH = `name: outreach
startable: true
element: release
phases:
  - name: announce
    role: developer
    actions:
      - 'cli.run(note: "{release.codename}")'
    awaits: { party: "the press office", evidence: "press.ack" }
`;

const BINDINGS_YAML = `version: 1.0
checks:
  tests.passing: { run: [npm, test] }
actions:
  git.create_branch: { manual: true }
  cli.run: { manual: true }
`;

const WORKFLOWS: Record<string, string> = {
  'workflows/custom/release-cycle.yaml': RELEASE_CYCLE,
  'workflows/custom/dev-loop.yaml': DEV_LOOP,
  'workflows/custom/planning.yaml': PLANNING,
  'workflows/custom/outreach.yaml': OUTREACH,
};

function element(type: string, id: string, status: string, extra = ''): string {
  return `---\nid: "${id}"\ntype: ${type}\ntitle: "${id}"\nstatus: ${status}\n${extra}---\n\n## Body\n`;
}

function plan(id: string, workflow: string, elementId: string): string {
  return element('plan', id, 'active', `workflow: "${workflow}"\nphase: "x"\nelement: "${elementId}"\n`);
}

/** The configuration, committed. */
function writeProject(root: string): void {
  writeFixtureFile(root, '.wingfoil/workflows.yaml', `version: 1.0\ninclude:\n${Object.keys(WORKFLOWS).map((file) => `  - ${file}\n`).join('')}`);
  for (const [file, content] of Object.entries(WORKFLOWS)) writeFixtureFile(root, `.wingfoil/${file}`, content);
  writeFixtureFile(root, '.wingfoil/workflows/bindings.yaml', BINDINGS_YAML);
  writeFixtureFile(root, '.wingfoil/memory.yaml', MEMORY_YAML);
  writeFixtureFile(root, '.wingfoil/dna.yaml', DNA_YAML);
  writeFixtureFile(root, '.wingfoil/roles.yaml', ROLES_YAML);
  writeFixtureFile(root, '.wingfoil/directives/custom/testing.md', directive('testing', 'Testing'));
  writeFixtureFile(root, '.wingfoil/directives/custom/code-review.md', directive('code-review', 'Code review'));
  writeFixtureFile(root, '.wingfoil/directives/custom/security.md', directive('security', 'Security'));
  commitAll(root, 'fixture configuration');
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

const op = CORE_MODULES.find((module) => module.name === 'workflow')?.operations['workflowNext'];

/** `workflow next` through the registered operation, as the CLI calls it. */
async function next(root: string, positional?: string, assignedTo?: string): Promise<CoreResult<NextResult>> {
  if (op === undefined) throw new Error('no workflowNext operation in CORE_MODULES');
  const value = await op.fn({ root, ...(positional === undefined ? {} : { positional }), ...(assignedTo === undefined ? {} : { options: { 'assigned-to': assignedTo } }) });
  return (typeof value === 'object' && value !== null && 'ok' in value ? value : { ok: true, value }) as CoreResult<NextResult>;
}

async function nextOk(root: string, positional?: string, assignedTo?: string): Promise<NextResult> {
  const result = await next(root, positional, assignedTo);
  if (!result.ok) throw new Error(`workflow next refused: ${result.error.message}`);
  return result.value;
}

function action(step: Step, token: string): Step['actions'][number] {
  const found = step.actions.find((entry) => entry.token === token);
  if (found === undefined) throw new Error(`no action ${token} in ${step.key}`);
  return found;
}

describe('task-216 — workflow next is registered (spec-017 §7.3, §9)', () => {
  it('workflowNext is a read-only operation of the workflow module, positional <ref> optional, option --assigned-to', () => {
    expect(op).toMatchObject({ name: 'workflowNext', mutates: false, positional: { name: 'ref' }, options: [{ name: 'assigned-to' }] });
    expect(op?.positional?.required).not.toBe(true);
    expect(typeof op?.renderConsole).toBe('function');
  });
});

describe('task-216 AC 1 — BDD P4.4 on a release-cycle instance (spec-017 §7.3)', () => {
  let repo: string;
  beforeAll(() => {
    repo = makeTempGitRepo();
    writeProject(repo);
    commit(
      repo,
      {
        'docs/releases/minor-1.md': element('release', 'minor-1', 'in-development', 'codename: ""\n'),
        'docs/tasks/task-1.md': element('task', 'task-1', 'backlog', 'bug: ["bug-1"]\n'),
        'docs/tasks/task-2.md': element('task', 'task-2', 'backlog', 'bug: []\n'),
        'docs/bugs/bug-1.md': element('bug', 'bug-1', 'planned'),
      },
      'seed elements',
    );
    commit(repo, { 'docs/plans/rc-1.md': plan('rc-1', 'release-cycle', 'minor-1') }, 'wf(plan): add rc-1');
  });
  afterAll(() => removeTempDir(repo));

  it('sc. 1 — the next step names its key, target element, role and the role directives; the rest are further ready steps', async () => {
    const value = await nextOk(repo);
    expect(value.instance).toMatchObject({ id: 'rc-1', workflow: 'release-cycle', element: { type: 'release', id: 'minor-1' } });
    expect(value.complete).toBe(false);
    expect(value.next).toMatchObject({
      key: 'dev-loop.start@task:task-1',
      instance: 'rc-1',
      workflow: 'dev-loop',
      phase: 'start',
      scope: { element: { type: 'task', id: 'task-1', status: 'backlog' } },
      role: 'developer',
      agentRole: false,
      members: [{ name: 'Alex', email: 'alex@example.invalid' }],
      directives: [
        { id: 'security', title: 'Security' },
        { id: 'testing', title: 'Testing' },
      ],
    });
    expect(value.next!.trail.map((entry) => `${entry.workflow}.${entry.phase}`)).toEqual(['release-cycle.develop', 'dev-loop.start']);
    expect(value.more.map((step) => step.key)).toEqual(['dev-loop.start@task:task-2']);
  });

  it('sc. 1 — actions carry their interpolated text and binding; checks are listed, never evaluated', async () => {
    const value = await nextOk(repo);
    expect(action(value.next!, 'git.create_branch(task: "{task.id}")')).toEqual({
      token: 'git.create_branch(task: "{task.id}")',
      text: 'git.create_branch(task: "task-1")',
      unresolved: [],
      target: 'none',
      binding: { kind: 'manual' },
    });
    expect(value.next!.checks).toEqual({ pre: [], post: [] }); // start declares none; red's are pinned in AC 2
  });

  it('sc. 2 — --assigned-to keeps the steps whose role the named party holds: a member name, an email, a role name', async () => {
    expect((await nextOk(repo, undefined, 'Alex')).next?.key).toBe('dev-loop.start@task:task-1');
    expect((await nextOk(repo, undefined, 'alex@example.invalid')).next?.key).toBe('dev-loop.start@task:task-1');
    expect((await nextOk(repo, undefined, 'developer')).next?.key).toBe('dev-loop.start@task:task-1');
    const none = await nextOk(repo, undefined, 'Morgan');
    expect(none).toMatchObject({ next: null, more: [], complete: false, message: "no next step of workflow 'release-cycle' is assigned to 'Morgan'" });
  });

  it("sc. 2 — 'me' is the git identity's email matched against team.members[]", () => {
    const inputs = pureInputs(repo);
    const deduction = deductionAt(repo);
    const mine = nextWorkflow(inputs, deduction, { assignedTo: 'me', identityEmail: 'ALEX@example.invalid' });
    expect(mine.ok && mine.value.next?.key).toBe('dev-loop.start@task:task-1');
    const theirs = nextWorkflow(inputs, deduction, { assignedTo: 'me', identityEmail: 'morgan@example.invalid' });
    expect(theirs.ok && theirs.value.next).toBeNull();
    const nobody = nextWorkflow(inputs, deduction, { assignedTo: 'me', identityEmail: '' });
    expect(nobody.ok && nobody.value.next).toBeNull();
  });

  it('an unknown <ref> is NOT_FOUND "workflow is not open: <ref>" (spec-017 §10)', async () => {
    const result = await next(repo, 'ghost');
    expect(result).toMatchObject({ ok: false, error: { code: 'NOT_FOUND', message: 'workflow is not open: ghost' } });
  });

  it('a workflow name or an instance id selects the instance', async () => {
    expect((await nextOk(repo, 'release-cycle')).instance?.id).toBe('rc-1');
    expect((await nextOk(repo, 'rc-1')).instance?.id).toBe('rc-1');
  });
});

describe('task-216 AC 1 — BDD P4.4 sc. 3 and no open instance', () => {
  it("sc. 3 — every step complete: 'no next step: workflow 'release-cycle' is complete', complete: true", async () => {
    const repo = makeTempGitRepo();
    try {
      writeProject(repo);
      commit(repo, { 'docs/releases/minor-1.md': element('release', 'minor-1', 'released') }, 'seed');
      commit(repo, { 'docs/plans/rc-1.md': plan('rc-1', 'release-cycle', 'minor-1') }, 'wf(plan): add rc-1');
      const value = await nextOk(repo);
      expect(value).toMatchObject({ complete: true, next: null, more: [], message: "no next step: workflow 'release-cycle' is complete" });
    } finally {
      removeTempDir(repo);
    }
  });

  it("no open instance: 'no open workflows', instance null", async () => {
    const repo = makeTempGitRepo();
    try {
      writeProject(repo);
      const value = await nextOk(repo);
      expect(value).toMatchObject({ instance: null, complete: false, next: null, more: [], message: 'no open workflows' });
      expect(value.baseline).toEqual({ rev: 'HEAD', commit: git(repo, ['rev-parse', 'HEAD']).trim() });
    } finally {
      removeTempDir(repo);
    }
  });
});

describe('task-216 AC 2 — manual bindings report the expected commit subject (spec-003 verb rule, spec-017 §6.1)', () => {
  let repo: string;
  beforeAll(() => {
    repo = makeTempGitRepo();
    writeProject(repo);
    commit(
      repo,
      {
        'docs/releases/minor-1.md': element('release', 'minor-1', 'in-development'),
        'docs/releases/minor-2.md': element('release', 'minor-2', 'planning'),
        'docs/tasks/task-1.md': element('task', 'task-1', 'backlog', 'bug: ["bug-1"]\n'),
        'docs/bugs/bug-1.md': element('bug', 'bug-1', 'planned'),
      },
      'seed elements',
    );
    commit(repo, { 'docs/plans/plan-1.md': plan('plan-1', 'planning', 'minor-2') }, 'wf(plan): add plan-1');
    commit(repo, { 'docs/plans/rc-1.md': plan('rc-1', 'release-cycle', 'minor-1') }, 'wf(plan): add rc-1');
  });
  afterAll(() => removeTempDir(repo));

  it("dev-loop.start: element.set_state(in-progress) expects 'wf(task): start task-1 [backlog → in-progress]'", async () => {
    const step = (await nextOk(repo, 'rc-1')).next!;
    expect(action(step, 'element.set_state(in-progress)')).toEqual({
      token: 'element.set_state(in-progress)',
      text: 'element.set_state(in-progress)',
      unresolved: [],
      target: 'bound',
      binding: { kind: 'manual', expectedCommit: 'wf(task): start task-1 [backlog → in-progress]' },
    });
    expect(action(step, 'bug.sync_state(for_each: task.bug)')).toMatchObject({
      target: 'run',
      binding: { kind: 'manual', expectedCommit: 'wf(bug): sync bug-1 [planned → in-progress]' },
    });
  });

  it("commit-backlog: release.set_state(in-development) under approval: expects 'wf(release): approve minor-2 [planning → in-development]'", async () => {
    const step = (await nextOk(repo, 'planning')).next!;
    expect(step.key).toBe('planning.commit-backlog@release:minor-2');
    expect(action(step, 'release.set_state(in-development)').binding).toEqual({
      kind: 'manual',
      expectedCommit: 'wf(release): approve minor-2 [planning → in-development]',
    });
  });
});

describe('task-216 AC 2 — after a review reject, next reports the fallback step and the bug sync (task-205 AC 2, dl-061 A.1, spec-017 §5.2)', () => {
  it("red is current again, re-entered, and red's bug.sync_state expects 'wf(bug): sync bug-1 [in-review → in-progress]'", async () => {
    const repo = makeTempGitRepo();
    try {
      writeProject(repo);
      commit(
        repo,
        {
          'docs/releases/minor-1.md': element('release', 'minor-1', 'in-development'),
          'docs/tasks/task-1.md': element('task', 'task-1', 'backlog', 'bug: ["bug-1"]\n'),
          'docs/bugs/bug-1.md': element('bug', 'bug-1', 'planned'),
        },
        'seed elements',
      );
      commit(repo, { 'docs/plans/rc-1.md': plan('rc-1', 'release-cycle', 'minor-1') }, 'wf(plan): add rc-1');
      commit(
        repo,
        { 'docs/tasks/task-1.md': element('task', 'task-1', 'in-progress', 'bug: ["bug-1"]\n'), 'docs/bugs/bug-1.md': element('bug', 'bug-1', 'in-progress') },
        'wf(task): start task-1 [backlog → in-progress]',
      );
      record(repo, 'rc-1', 'dev-loop.red', 'task:task-1');
      commit(
        repo,
        { 'docs/tasks/task-1.md': element('task', 'task-1', 'in-review', 'bug: ["bug-1"]\n'), 'docs/bugs/bug-1.md': element('bug', 'bug-1', 'in-review') },
        'wf(task): submit task-1',
      );
      // Before the reject the review's state evidence holds (task in-review), so done is next; red is behind it.
      expect((await nextOk(repo)).next?.key).toBe('dev-loop.done@task:task-1');
      const reject = commit(repo, { 'docs/tasks/task-1.md': element('task', 'task-1', 'in-progress', 'bug: ["bug-1"]\n') }, 'wf(task): reject task-1 [in-review → in-progress]');

      const step = (await nextOk(repo)).next!;
      expect(step).toMatchObject({ key: 'dev-loop.red@task:task-1', reentered: true, reentryCommit: reject, role: 'qa', agentRole: true });
      expect(action(step, 'bug.sync_state(for_each: task.bug)').binding).toEqual({ kind: 'manual', expectedCommit: 'wf(bug): sync bug-1 [in-review → in-progress]' });
      expect(action(step, 'agent.execute').binding).toEqual({ kind: 'agent', argv: ['wingfoil', 'agent', 'execute', '--workflow', 'rc-1', '--step', 'dev-loop.red@task:task-1'] });
      expect(step.checks).toEqual({ pre: [], post: [{ token: 'tests.passing', binding: { kind: 'run', argv: ['npm', 'test'] }, evaluated: false }] });
      expect(step.evidence).toEqual({ kinds: ['record'], missing: ['record'], finalizable: true });
      // The review phase declares the fallback the reject took (§5.2), reported on its step once it is reached.
      const review = buildReviewStep(repo);
      expect(review.fallback).toEqual({ step: 'red', setState: 'in-progress' });
    } finally {
      removeTempDir(repo);
    }
  });
});

describe('task-216 AC 3 — NextResult and Step carry exactly spec-017 §8 fields; the console view (§8, §5.3)', () => {
  let repo: string;
  beforeAll(() => {
    repo = makeTempGitRepo();
    writeProject(repo);
    commit(repo, { 'docs/releases/minor-1.md': element('release', 'minor-1', 'in-development', 'codename: ""\n') }, 'seed');
    commit(repo, { 'docs/plans/out-1.md': plan('out-1', 'outreach', 'minor-1') }, 'wf(plan): add out-1');
  });
  afterAll(() => removeTempDir(repo));

  const NEXT_RESULT_FIELDS = ['baseline', 'complete', 'diagnostics', 'instance', 'more', 'next'];
  const STEP_FIELDS = [
    'actions',
    'agentRole',
    'allowedModes',
    'awaiting',
    'cadence',
    'checks',
    'created',
    'directiveWarnings',
    'directives',
    'distinctFrom',
    'evidence',
    'fallback',
    'instance',
    'key',
    'members',
    'mode',
    'optional',
    'phase',
    'produces',
    'reentered',
    'reentryCommit',
    'role',
    'scope',
    'trail',
    'workflow',
  ];

  it('the JSON payload has §8 NextResult fields, and each step §8 Step fields, with their types', async () => {
    const value = JSON.parse(JSON.stringify(await nextOk(repo))) as Record<string, unknown>;
    expect(Object.keys(value).sort()).toEqual(NEXT_RESULT_FIELDS);
    const step = value['next'] as Record<string, unknown>;
    expect(Object.keys(step).sort()).toEqual(STEP_FIELDS);
    expect(step).toMatchObject({
      key: expect.any(String),
      instance: expect.any(String),
      trail: expect.any(Array),
      agentRole: expect.any(Boolean),
      members: expect.any(Array),
      directives: expect.any(Array),
      actions: expect.any(Array),
      checks: { pre: expect.any(Array), post: expect.any(Array) },
      evidence: { kinds: expect.any(Array), missing: expect.any(Array), finalizable: expect.any(Boolean) },
      optional: false,
      mode: 'fresh',
      allowedModes: ['fresh'],
      distinctFrom: [],
      cadence: null,
      reentered: false,
      reentryCommit: null,
      fallback: null,
    });
    for (const view of step['actions'] as Record<string, unknown>[]) {
      expect(Object.keys(view).sort()).toEqual(['binding', 'target', 'text', 'token', 'unresolved']);
      expect(['bound', 'selection', 'created', 'run', 'none']).toContain(view['target']);
      expect(['wingfoil', 'run', 'agent', 'manual', 'unbound']).toContain((view['binding'] as { kind: string }).kind);
    }
  });

  it('a token with no value is reported unresolved, with W_UNRESOLVED_TOKEN at its action path (spec-017 §4.1)', async () => {
    const value = await nextOk(repo);
    expect(action(value.next!, 'cli.run(note: "{release.codename}")')).toMatchObject({ text: 'cli.run(note: "{release.codename}")', unresolved: ['{release.codename}'], target: 'none' });
    expect(value.diagnostics).toContainEqual(expect.objectContaining({ code: 'W_UNRESOLVED_TOKEN', file: '.wingfoil/workflows/custom/outreach.yaml', path: 'phases[0].actions[0]' }));
  });

  it("an awaits step whose other evidence holds reports awaiting: { kind: 'party' } (spec-017 §5.4)", async () => {
    const value = await nextOk(repo);
    expect(value.next!.awaiting).toEqual({ kind: 'party', party: 'the press office', evidence: { token: 'press.ack', binding: { kind: 'unbound' }, evaluated: false } });
  });

  it('console: the key, trail, role, scope, actions with bindings, directive ids and the human-needed line', async () => {
    const text = renderNextConsole(await nextOk(repo));
    expect(text).toContain('workflow: outreach (out-1)');
    expect(text).toContain('next step: outreach.announce@release:minor-1');
    expect(text).toContain('trail: outreach.announce');
    expect(text).toContain('scope: release:minor-1 (in-development)');
    expect(text).toContain('role: developer — held by Alex');
    expect(text).toContain('directives: security, testing');
    expect(text).toContain('- cli.run(note: "{release.codename}") [manual]');
    expect(text).toContain('waiting for the press office: press.ack');
  });

  it('console: an approval awaiting prints "human needed" with the action, the elements and the routed members (§5.3)', async () => {
    const value = await nextOk(repo);
    const approval: Step = {
      ...value.next!,
      awaiting: { kind: 'approval', byRole: 'approver', elements: [{ type: 'release', id: 'minor-1', status: 'planning' }], recordNeeded: false, routedTo: [{ name: 'Morgan', email: 'morgan@example.invalid' }] },
    };
    expect(renderNextConsole({ ...value, next: approval })).toContain('human needed: approve or reject minor-1 — routed to Morgan <morgan@example.invalid>');
    const record: Step = { ...approval, awaiting: { kind: 'approval', byRole: 'approver', elements: [], recordNeeded: true, routedTo: [], routingError: "no approver found for role 'approver' in dna.yaml" } };
    expect(renderNextConsole({ ...value, next: record })).toContain(`human needed: finalize outreach.announce@release:minor-1 — routed to no approver found for role 'approver' in dna.yaml`);
  });

  it('console: the deduced messages', async () => {
    const empty = makeTempGitRepo();
    try {
      writeProject(empty);
      expect(renderNextConsole(await nextOk(empty))).toMatch(/^no open workflows\n(\d+ diagnostic\(s\): --format json lists them\n)?$/);
    } finally {
      removeTempDir(empty);
    }
  });
});

describe('task-216 AC 5 (characterization) — no directive content inlined; no phase-level directive field (dl-066 option 1)', () => {
  it("the payload carries directive ids and titles only, and dev-loop.start's 'directives: [code-review]' is not read", async () => {
    const repo = makeTempGitRepo();
    try {
      writeProject(repo);
      commit(repo, { 'docs/releases/minor-1.md': element('release', 'minor-1', 'in-development'), 'docs/tasks/task-1.md': element('task', 'task-1', 'backlog') }, 'seed');
      commit(repo, { 'docs/plans/rc-1.md': plan('rc-1', 'release-cycle', 'minor-1') }, 'wf(plan): add rc-1');
      const value = await nextOk(repo);
      expect(JSON.stringify(value)).not.toContain('DIRECTIVE-BODY-SENTINEL');
      expect(value.next!.directives.map((entry) => entry.id)).toEqual(['security', 'testing']); // the role's, never code-review
    } finally {
      removeTempDir(repo);
    }
  });
});

// --- helpers reading the committed fixture through the pure API -----------------------------------

function pureInputs(root: string): NextInputs {
  const snapshot = readDeductionSnapshotAtHead(root);
  return {
    workflows: snapshot.workflows,
    memoryYaml: snapshot.memoryYaml,
    dnaYaml: snapshot.dnaYaml ?? null,
    bindings: snapshot.bindings ?? null,
    rolesYaml: loadRolesYamlAtRev(root, 'HEAD'),
    directiveFiles: loadDirectivesAtRev(root, 'HEAD'),
  };
}

function deductionAt(root: string): Deduction {
  return deduceWorkflowStateAtHead(root);
}

/** The `dev-loop.review` step of the first instance, built from a frontier step re-keyed to that phase. */
function buildReviewStep(root: string): Step {
  const deduction = deductionAt(root);
  const frontier = deduction.instances[0]!.frontier[0]!;
  return buildStep({ ...frontier, phase: 'review', actions: [] }, pureInputs(root));
}
