/**
 * task-281 AC 1 (`bug-300`) — after a re-entry, a later bracketless `wf(task): submit <id>` (the subject
 * `memory submit` writes) is the commit that set the element's status, even when an older hand-written
 * bracketed `submit [in-progress → in-review]` names the same status (`spec-017` §4.8's state rule, the
 * reading chosen at design: a bracketless `add`/`submit` naming the element counts when the element's file
 * holds that status at that commit).
 *
 * Read at `HEAD` through the `src/core` barrel (`deduceWorkflowStateAtHead`), on fixture repositories, as
 * `test/core/workflow-deduction-history.test.ts` (task-203) does.
 *
 * - red-first: the re-submit completes `review`'s `state` evidence (it awaits only its approval).
 * - characterization (controls): before the re-submit `review` misses `state`; a bracketless submit of
 *   ANOTHER element does not count for this one, even when its commit edits this element's file; a plain
 *   (non-Memory) commit editing the file after the re-entry completes nothing.
 */
import { deduceWorkflowStateAtHead, type InstanceDeduction } from '../../src/core';
import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const MEMORY_YAML = `version: 1.0
types:
  task:
    path: "docs/tasks/{id}.md"
    states:
      sequence: [ draft, pending, backlog, in-progress, in-review, approved, done ]
      gates:
        pending:   { reject: draft }
        in-review: { reject: in-progress }
      waiting: [ backlog ]
      returns: { in-review: in-progress }
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
    - name: Roberto
      email: roberto@example.invalid
      roles: [ developer, approver ]
  roles:
    - name: developer
    - name: approver
paths:
  sources: [ src/ ]
`;

/** A dev-loop-shaped main bound to a task: `review` holds the `in-review` gate and falls back to `red`. */
const LOOP = `name: loop
kind: main
element: task
phases:
  - name: start
    actions:
      - element.set_state(in-progress)
  - name: design
    actions:
      - agent.execute
  - name: red
    actions:
      - agent.execute
  - name: review
    actions:
      - memory.submit
    approval: { by_role: approver }
    fallback: { step: red, set_state: in-progress }
  - name: done
    actions:
      - memory.approve
      - element.set_state(done)
`;

/** The control of a plain file edit: `rework` (the fallback step) holds a `state` evidence equal to the re-entry's target. */
const REWORK = `name: rework
kind: main
element: task
phases:
  - name: start
    actions:
      - element.set_state(in-progress)
  - name: rework
    actions:
      - element.set_state(in-progress)
  - name: review
    actions:
      - memory.submit
    approval: { by_role: approver }
    fallback: { step: rework, set_state: in-progress }
`;

function element(type: string, id: string, status: string, extra = ''): string {
  return `---\nid: "${id}"\ntype: ${type}\ntitle: "${id}"\nstatus: ${status}\n${extra}---\n\n## Body\n`;
}

function plan(id: string, workflow: string, elementId: string): string {
  return element('plan', id, 'active', `workflow: "${workflow}"\nphase: "x"\nelement: "${elementId}"\n`);
}

function writeProject(root: string): void {
  writeFixtureFile(root, '.wingfoil/workflows.yaml', 'version: 1.0\ninclude:\n  - workflows/custom/loop.yaml\n  - workflows/custom/rework.yaml\n');
  writeFixtureFile(root, '.wingfoil/workflows/custom/loop.yaml', LOOP);
  writeFixtureFile(root, '.wingfoil/workflows/custom/rework.yaml', REWORK);
  writeFixtureFile(root, '.wingfoil/memory.yaml', MEMORY_YAML);
  writeFixtureFile(root, '.wingfoil/dna.yaml', DNA_YAML);
  commitAll(root, 'fixture configuration');
}

/** Write `files` and commit them with `subject` and, when given, a trailer block. Returns the new sha. */
function commit(root: string, files: Record<string, string>, subject: string, trailers: Record<string, string> = {}): string {
  for (const [path, content] of Object.entries(files)) writeFixtureFile(root, path, content);
  git(root, ['add', '-A']);
  const block = Object.entries(trailers)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');
  git(root, ['commit', '--allow-empty', '--quiet', '-m', subject, ...(block === '' ? [] : ['-m', block])]);
  return git(root, ['rev-parse', 'HEAD']).trim();
}

/** A phase record of `step` on `task:<id>`, as `workflow finalize` writes it. */
function record(root: string, instance: string, step: string, id: string): void {
  commit(root, {}, `workflow: finalize ${instance} ${step}`, {
    'WingFoil-Phase': `${step} completed`,
    'WingFoil-Instance': instance,
    'WingFoil-Element': `task:${id}`,
  });
}

function only(root: string, id: string): InstanceDeduction {
  const found = deduceWorkflowStateAtHead(root).instances.find((entry) => entry.instance.id === id);
  if (!found) throw new Error(`no instance ${id}`);
  return found;
}

const states = (instance: InstanceDeduction): string[] => instance.phases.map((phase) => `${phase.phase}:${phase.state}`);

/**
 * The bug-300 history up to the record that completes `red` again: a hand bracketed submit, a reject (the
 * re-entry), a new `red` record. `review` is then current and needs a submit newer than the reject.
 */
function reenteredLoop(root: string): string {
  writeProject(root);
  commit(root, { 'docs/tasks/task-1.md': element('task', 'task-1', 'backlog'), 'docs/tasks/task-2.md': element('task', 'task-2', 'in-progress') }, 'tasks');
  commit(root, { 'docs/plans/loop-1.md': plan('loop-1', 'loop', 'task-1') }, 'wf(plan): add loop-1');
  commit(root, { 'docs/tasks/task-1.md': element('task', 'task-1', 'in-progress') }, 'wf(task): start task-1 [backlog → in-progress]');
  record(root, 'loop-1', 'loop.design', 'task-1');
  record(root, 'loop-1', 'loop.red', 'task-1');
  // The older, hand-written, bracketed submit.
  commit(root, { 'docs/tasks/task-1.md': element('task', 'task-1', 'in-review') }, 'wf(task): submit task-1 [in-progress → in-review]');
  const reentry = commit(root, { 'docs/tasks/task-1.md': element('task', 'task-1', 'in-progress') }, 'wf(task): reject task-1 [in-review → in-progress]', {
    Reason: 'the second criterion is not covered.',
  });
  record(root, 'loop-1', 'loop.red', 'task-1');
  return reentry;
}

describe('task-281 AC 1 (bug-300) — a bracketless re-submit after a re-entry sets review\'s state (spec-017 §4.8)', () => {
  let repo: string;
  let reentry: string;
  beforeAll(() => {
    repo = makeTempGitRepo();
    reentry = reenteredLoop(repo);
  });
  afterAll(() => removeTempDir(repo));

  it('control (characterization): before the re-submit, review is current and misses its state evidence', () => {
    const instance = only(repo, 'loop-1');
    expect(states(instance)).toEqual(['start:complete', 'design:complete', 'red:complete', 'review:current', 'done:pending']);
    expect(instance.frontier[0]).toMatchObject({ key: 'loop.review@task:task-1', reentered: true, reentryCommit: reentry, evidence: { kinds: ['state'], missing: ['state'] } });
  });

  it('red-first: after `wf(task): submit task-1` (no bracket), review\'s state evidence is met — it awaits only its approval', () => {
    commit(repo, { 'docs/tasks/task-1.md': element('task', 'task-1', 'in-review') }, 'wf(task): submit task-1');
    const instance = only(repo, 'loop-1');
    const review = instance.frontier.find((step) => step.key === 'loop.review@task:task-1');
    expect(review).toBeDefined();
    expect(review!.evidence.missing).not.toContain('state');
    expect(review).toMatchObject({ reentered: true, reentryCommit: reentry, approval: { elements: [{ id: 'task-1', status: 'in-review' }], recordNeeded: false } });
  });
});

describe('task-281 AC 1 (bug-300) — controls of the state rule (characterization)', () => {
  it('a bracketless submit naming ANOTHER element does not count, even when its commit edits this element\'s file', () => {
    const repo = makeTempGitRepo();
    try {
      reenteredLoop(repo);
      commit(
        repo,
        { 'docs/tasks/task-1.md': element('task', 'task-1', 'in-review'), 'docs/tasks/task-2.md': element('task', 'task-2', 'in-review') },
        'wf(task): submit task-2',
      );
      const instance = only(repo, 'loop-1');
      expect(instance.frontier[0]).toMatchObject({ key: 'loop.review@task:task-1', evidence: { kinds: ['state'], missing: ['state'] } });
    } finally {
      removeTempDir(repo);
    }
  });

  it('a plain commit editing the element\'s file after the re-entry (status unchanged) completes nothing', () => {
    const repo = makeTempGitRepo();
    try {
      writeProject(repo);
      commit(repo, { 'docs/tasks/task-1.md': element('task', 'task-1', 'backlog') }, 'task');
      commit(repo, { 'docs/plans/rw-1.md': plan('rw-1', 'rework', 'task-1') }, 'wf(plan): add rw-1');
      commit(repo, { 'docs/tasks/task-1.md': element('task', 'task-1', 'in-progress') }, 'wf(task): start task-1 [backlog → in-progress]');
      commit(repo, { 'docs/tasks/task-1.md': element('task', 'task-1', 'in-review') }, 'wf(task): submit task-1 [in-progress → in-review]');
      commit(repo, { 'docs/tasks/task-1.md': element('task', 'task-1', 'in-progress') }, 'wf(task): reject task-1 [in-review → in-progress]');
      const before = only(repo, 'rw-1');
      expect(before.frontier[0]).toMatchObject({ key: 'rework.rework@task:task-1', evidence: { missing: ['state'] } });

      commit(repo, { 'docs/tasks/task-1.md': element('task', 'task-1', 'in-progress', 'notes: "execution notes"\n') }, 'docs(memory): task-1 — execution notes');
      const after = only(repo, 'rw-1');
      expect(states(after)).toEqual(states(before));
      expect(after.frontier).toEqual(before.frontier);
    } finally {
      removeTempDir(repo);
    }
  });
});
