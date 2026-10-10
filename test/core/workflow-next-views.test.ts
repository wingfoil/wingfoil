/**
 * task-216 — the remaining shapes of a step's view (`spec-017` §4.2 targets, §6.1 bindings, §6.3–§6.4,
 * §7.3 messages), each on a fixture committed at `HEAD`: a selection's typed `set_state` and `set_release`, the
 * `run` elements of an earlier step, an action no element answers, a project `run` binding with an argument,
 * checks before and after, several role holders, a recurring cadence and a non-fresh mode, and the messages of
 * an abandoned instance and of one whose workflow is not loaded. The acceptance criteria are
 * `test/core/workflow-next.test.ts`.
 */
import { CORE_MODULES, type NextResult, type Step } from '../../src/core';
import type { CoreResult } from '../../src/core/types';
import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const MEMORY_YAML = `version: 1.0
types:
  release:
    path: "docs/releases/{id}.md"
    states:
      sequence: [ draft, planning, in-development, released ]
  task:
    path: "docs/tasks/{id}.md"
    states:
      sequence: [ draft, pending, backlog, done ]
      gates:
        pending: { reject: draft }
  bug:
    path: "docs/bugs/{id}.md"
    states:
      sequence: [ draft, open, triaged, closed ]
      gates:
        open: { reject: closed }
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
    - name: Zoe
      roles: [ developer ]
    - name: Alex
      email: alex@example.invalid
      roles: [ developer, approver ]
  roles:
    - name: developer
    - name: approver
paths:
  sources: [ src/ ]
`;

const TRIAGE = `name: triage
startable: true
element: release
phases:
  - name: pick
    role: developer
    where: { type: [ bug ], status: [ open ] }
    actions:
      - bug.set_state(triaged)
      - 'element.set_release("{release.version}")'
      - memory.approve
      - 'memory.add(type: task, bug: "{bug.id}")'
    approval: { by_role: approver }
    checks:
      pre: [ "tests.passing" ]
      post: [ "report.ok(report: out.txt)" ]
`;

const SEED = `name: seed
startable: true
element: release
phases:
  - name: make
    role: developer
    actions:
      - 'memory.add(type: task)'
      - memory.submit
  - name: commit
    role: developer
    mode: resume
    cadence: { recurring: { cron: "0 6 * * 1" } }
    actions:
      - task.set_state(backlog)
      - 'tests.bdd.run(report: bdd.txt)'
      - unknown.token
`;

const LOOSE = `name: loose
startable: true
phases:
  - name: do
    role: developer
    actions:
      - memory.submit
      - element.set_state(done)
      - config.init
    checks:
      post: [ "report.ok" ]
    awaits: { party: "a vendor", evidence: "vendor.ack" }
    produces: [ "docs/never.md" ]
`;

const WRAP = `name: wrap
startable: true
element: task
phases:
  - name: close
    role: developer
    actions:
      - 'bug.sync_state(for_each: release.bug)'
      - element.set_state(done)
      - 'bug.sync_state(for_each: task.bug)'
      - bug.sync_state
      - bug.set_state(closed)
`;

/** A self-creating main whose creating step also adds a task that a later phase moves (§3.4, §4.2 `run`). */
const INTAKE = `name: intake
startable: true
phases:
  - name: capture
    role: developer
    actions:
      - 'memory.add(type: bug)'
      - 'memory.add(type: task)'
      - memory.submit
  - name: plan
    role: developer
    actions:
      - task.set_state(backlog)
`;

const BINDINGS_YAML = `version: 1.0
checks:
  tests.passing: { run: [npm, test] }
  report.ok: { run: [node, check.cjs, "{report}"] }
actions:
  tests.bdd.run: { run: [npm, test, "{report}"] }
`;

function element(type: string, id: string, status: string, extra = ''): string {
  return `---\nid: "${id}"\ntype: ${type}\ntitle: "${id}"\nstatus: ${status}\n${extra}---\n\n## Body\n`;
}

function plan(id: string, workflow: string, elementId = ''): string {
  return element('plan', id, 'active', `workflow: "${workflow}"\nphase: "x"\nelement: "${elementId}"\n`);
}

function commit(root: string, files: Record<string, string>, subject: string, trailers: Record<string, string> = {}): void {
  for (const [path, content] of Object.entries(files)) writeFixtureFile(root, path, content);
  git(root, ['add', '-A']);
  const block = Object.entries(trailers)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');
  git(root, ['commit', '--allow-empty', '--quiet', '-m', subject, ...(block === '' ? [] : ['-m', block])]);
}

const op = CORE_MODULES.find((module) => module.name === 'workflow')!.operations['workflowNext']!;

async function next(root: string, ref: string): Promise<NextResult> {
  const value = (await op.fn({ root, positional: ref })) as CoreResult<NextResult> | NextResult;
  if ('ok' in value) {
    if (!value.ok) throw new Error(value.error.message);
    return value.value;
  }
  return value;
}

function binding(step: Step, token: string): Step['actions'][number] {
  return step.actions.find((entry) => entry.token === token)!;
}

describe('task-216 — step views: targets, bindings, executor attributes, messages', () => {
  let repo: string;
  beforeAll(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/workflows.yaml', 'version: 1.0\ninclude:\n  - workflows/custom/triage.yaml\n  - workflows/custom/seed.yaml\n  - workflows/custom/loose.yaml\n  - workflows/custom/wrap.yaml\n  - workflows/custom/intake.yaml\n');
    writeFixtureFile(repo, '.wingfoil/workflows/custom/triage.yaml', TRIAGE);
    writeFixtureFile(repo, '.wingfoil/workflows/custom/seed.yaml', SEED);
    writeFixtureFile(repo, '.wingfoil/workflows/custom/loose.yaml', LOOSE);
    writeFixtureFile(repo, '.wingfoil/workflows/custom/wrap.yaml', WRAP);
    writeFixtureFile(repo, '.wingfoil/workflows/custom/intake.yaml', INTAKE);
    writeFixtureFile(repo, '.wingfoil/workflows/bindings.yaml', BINDINGS_YAML);
    writeFixtureFile(repo, '.wingfoil/memory.yaml', MEMORY_YAML);
    writeFixtureFile(repo, '.wingfoil/dna.yaml', DNA_YAML);
    commitAll(repo, 'fixture configuration');
    commit(
      repo,
      {
        'docs/releases/minor-1.md': element('release', 'minor-1', 'in-development', 'version: "v1"\n'),
        'docs/releases/minor-0.md': element('release', 'minor-0', 'deprecated'),
        'docs/bugs/bug-1.md': element('bug', 'bug-1', 'open'),
        'docs/bugs/bug-2.md': element('bug', 'bug-2', 'triaged'),
        'docs/bugs/bug-3.md': element('bug', 'bug-3', 'closed'),
        'docs/tasks/task-9.md': element('task', 'task-9', 'backlog', 'bug: ["bug-2", "bug-3", "bug-404"]\n'),
      },
      'seed elements',
    );
    commit(repo, { 'docs/plans/tri-1.md': plan('tri-1', 'triage', 'minor-1') }, 'wf(plan): add tri-1');
    commit(repo, { 'docs/plans/seed-1.md': plan('seed-1', 'seed', 'minor-1') }, 'wf(plan): add seed-1');
    commit(repo, { 'docs/tasks/task-1.md': element('task', 'task-1', 'pending') }, 'wf(task): add task-1', {
      'WingFoil-Instance': 'seed-1',
      'WingFoil-Step': 'seed.make@release:minor-1',
    });
    commit(repo, { 'docs/plans/loose-1.md': plan('loose-1', 'loose') }, 'wf(plan): add loose-1');
    commit(repo, { 'docs/plans/old-1.md': plan('old-1', 'triage', 'minor-0') }, 'wf(plan): add old-1');
    commit(repo, { 'docs/plans/wrap-1.md': plan('wrap-1', 'wrap', 'task-9') }, 'wf(plan): add wrap-1');
    commit(repo, { 'docs/plans/in-1.md': plan('in-1', 'intake') }, 'wf(plan): add in-1');
    const intakeLink = { 'WingFoil-Instance': 'in-1', 'WingFoil-Step': 'intake.capture' };
    commit(repo, { 'docs/bugs/bug-7.md': element('bug', 'bug-7', 'draft') }, 'wf(bug): add bug-7', intakeLink);
    commit(repo, { 'docs/tasks/task-7.md': element('task', 'task-7', 'pending') }, 'wf(task): add task-7', intakeLink);
    commit(repo, { 'docs/plans/ghost-1.md': plan('ghost-1', 'ghostflow') }, 'wf(plan): add ghost-1');
  });
  afterAll(() => removeTempDir(repo));

  it("a selection's typed set_state and set_release, and an approve on the selection (§4.2; spec-003 verb rule)", async () => {
    const step = (await next(repo, 'tri-1')).next!;
    expect(binding(step, 'bug.set_state(triaged)')).toMatchObject({ target: 'selection', binding: { kind: 'manual', expectedCommit: 'wf(bug): approve bug-1 [open → triaged]' } });
    expect(binding(step, 'element.set_release("{release.version}")')).toMatchObject({
      text: 'element.set_release("v1")',
      target: 'selection',
      binding: { kind: 'manual', expectedCommit: 'wf(bug): assign release v1 to bug-1' },
    });
    expect(binding(step, 'memory.approve')).toMatchObject({ target: 'selection', binding: { kind: 'wingfoil', argv: ['wingfoil', 'memory', 'approve', 'bug-1', '--reason', '<reason>'] } });
    expect(step.checks).toEqual({
      pre: [{ token: 'tests.passing', binding: { kind: 'run', argv: ['npm', 'test'] }, evaluated: false }],
      post: [{ token: 'report.ok(report: out.txt)', binding: { kind: 'run', argv: ['node', 'check.cjs', 'out.txt'] }, evaluated: false }],
    });
    // Holders ascending by (name, email); a member with no email reports ''.
    expect(step.members).toEqual([
      { name: 'Alex', email: 'alex@example.invalid' },
      { name: 'Zoe', email: '' },
    ]);
    expect(step.directiveWarnings).toEqual(["roles.yaml is absent: no directive resolved for role 'developer'"]);
    // A token of a type the selection selects resolves per selected element when the action runs (§4.1).
    expect(binding(step, 'memory.add(type: task, bug: "{bug.id}")')).toMatchObject({ text: 'memory.add(type: task, bug: "{bug.id}")', unresolved: [], target: 'created' });
  });

  it('a sync to the last state chains the states it passes and skips an element already there; a bare sync and an untargeted set_state expect nothing known (§4.2)', async () => {
    const step = (await next(repo, 'wrap-1')).next!;
    expect(binding(step, 'element.set_state(done)').binding).toEqual({ kind: 'manual', expectedCommit: 'wf(task): finalize task-9 [backlog → done]' });
    expect(binding(step, 'bug.sync_state(for_each: task.bug)')).toMatchObject({ target: 'run', binding: { kind: 'manual', expectedCommit: 'wf(bug): sync bug-2 [triaged → closed]' } });
    expect(binding(step, 'bug.sync_state')).toMatchObject({ target: 'run', binding: { kind: 'manual' } });
    // No enclosing release names a bug: nothing to sync, no subject.
    expect(binding(step, 'bug.sync_state(for_each: release.bug)')).toMatchObject({ target: 'run', binding: { kind: 'manual' } });
    expect(binding(step, 'bug.sync_state(for_each: release.bug)').binding.expectedCommit).toBeUndefined();
    expect(binding(step, 'bug.sync_state').binding.expectedCommit).toBeUndefined();
    expect(binding(step, 'bug.set_state(closed)')).toMatchObject({ target: 'none', binding: { kind: 'manual', expectedCommit: 'wf(bug): finalize <id> [<from> → closed]' } });
  });

  it('the run elements an earlier step created; a project run binding with an argument; an unbound token; mode and cadence (§4.2, §6.1, §6.3, §6.4)', async () => {
    const step = (await next(repo, 'seed-1')).next!;
    expect(step.key).toBe('seed.commit@release:minor-1');
    expect(binding(step, 'task.set_state(backlog)')).toMatchObject({ target: 'run', binding: { kind: 'manual', expectedCommit: 'wf(task): start task-1 [pending → backlog]' } });
    expect(binding(step, 'tests.bdd.run(report: bdd.txt)').binding).toEqual({ kind: 'run', argv: ['npm', 'test', 'bdd.txt'] });
    expect(binding(step, 'unknown.token').binding).toEqual({ kind: 'unbound' });
    expect(step).toMatchObject({ mode: 'fresh', allowedModes: ['fresh', 'resume'], cadence: { recurring: { cron: '0 6 * * 1' }, lastRun: 'not-recorded' } });
  });

  it('an action no element answers; an awaits whose other evidence is missing awaits nothing yet (§4.2, §5.4)', async () => {
    const step = (await next(repo, 'loose-1')).next!;
    expect(binding(step, 'memory.submit')).toMatchObject({ target: 'none', binding: { kind: 'wingfoil', argv: ['wingfoil', 'memory', 'submit', '<id>'] } });
    expect(binding(step, 'element.set_state(done)')).toMatchObject({ target: 'none', binding: { kind: 'manual', expectedCommit: 'wf(<type>): start <id> [<from> → done]' } });
    expect(step.evidence.missing).toContain('produces');
    expect(step.awaiting).toBeNull();
    expect(binding(step, 'config.init').binding).toEqual({ kind: 'wingfoil', argv: ['wingfoil', 'init'] });
    // A check with no argument keeps its binding's placeholder as written.
    expect(step.checks.post).toEqual([{ token: 'report.ok', binding: { kind: 'run', argv: ['node', 'check.cjs', '{report}'] }, evaluated: false }]);
  });

  it("--assigned-to me through the operation: the fixture's git identity is no member, so no step is kept", async () => {
    const value = (await op.fn({ root: repo, positional: 'tri-1', options: { 'assigned-to': 'me' } })) as NextResult | CoreResult<NextResult>;
    const result = 'ok' in value ? (value.ok ? value.value : null) : value;
    expect(result).toMatchObject({ next: null, message: "no next step of workflow 'triage' is assigned to 'me'" });
  });

  it("a self-bound instance's later phase moves the elements its creating step linked before the element existed (§3.4, §4.2 run)", async () => {
    const step = (await next(repo, 'in-1')).next!;
    expect(step.key).toBe('intake.plan@bug:bug-7');
    expect(binding(step, 'task.set_state(backlog)')).toMatchObject({ target: 'run', binding: { kind: 'manual', expectedCommit: 'wf(task): start task-7 [pending → backlog]' } });
  });

  it('a spec-003 error at HEAD is VALIDATION, exit 1, through the operation (spec-017 §10)', async () => {
    const broken = makeTempGitRepo();
    try {
      writeFixtureFile(broken, '.wingfoil/workflows.yaml', 'version: 1.0\ninclude:\n  - workflows/custom/loose.yaml\n');
      writeFixtureFile(broken, '.wingfoil/workflows/custom/loose.yaml', LOOSE.replace('role: developer', 'role: nobody'));
      writeFixtureFile(broken, '.wingfoil/memory.yaml', MEMORY_YAML);
      writeFixtureFile(broken, '.wingfoil/dna.yaml', DNA_YAML);
      commitAll(broken, 'broken configuration');
      expect(await op.fn({ root: broken })).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    } finally {
      removeTempDir(broken);
    }
  });

  it('an abandoned instance and one whose workflow is not loaded: no step, a message, complete: false (§4.9, §4.11)', async () => {
    expect(await next(repo, 'old-1')).toMatchObject({ complete: false, next: null, message: "no next step: workflow 'triage' is abandoned: its element release:minor-0 is deprecated" });
    expect(await next(repo, 'ghost-1')).toMatchObject({ complete: false, next: null, message: "no next step: workflow 'ghostflow' is not loaded" });
  });
});
