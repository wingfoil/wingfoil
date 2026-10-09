/**
 * task-216 — two deduction cases the W3 B3 gate handed to the deduction's next writer (task-202's and task-268's
 * follow-ups), at `HEAD`, on fixture repositories:
 *
 * - `spec-017` §4.11: a self-bound element stays bound when it is archived — a later element the creating step
 *   links does not rebind the instance, which stays abandoned;
 * - §4.8 `state` after a re-entry: when no commit of the walk changed the re-entered element's file (the reject
 *   commit carries no change and the file predates the start), the lookup finds nothing (`readLastChange`'s
 *   empty answer) and the element's `state` evidence cannot be newer than the re-entry.
 */
import { deduceWorkflowStateAtHead, readDeductionSnapshotAtHead } from '../../src/core';
import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const MEMORY_YAML = `version: 1.0
types:
  task:
    path: "docs/tasks/{id}.md"
    states:
      sequence: [ draft, pending, backlog, in-progress, in-review, approved, done ]
      gates:
        in-review: { reject: in-progress }
  bug:
    path: "docs/bugs/{id}.md"
    states:
      sequence: [ draft, open, triaged, closed ]
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
  members: []
  roles:
    - name: developer
paths:
  sources: [ src/ ]
`;

const CAPTURE = `name: capture-flow
kind: main
phases:
  - name: capture
    actions:
      - 'memory.add(type: bug)'
      - memory.submit
  - name: triage
    actions:
      - element.set_state(triaged)
`;

const LOOP = `name: loop
kind: main
element: task
phases:
  - name: start
    actions:
      - element.set_state(in-progress)
  - name: review
    actions:
      - memory.submit
    fallback: { step: review }
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

function writeProject(root: string): void {
  writeFixtureFile(root, '.wingfoil/workflows.yaml', 'version: 1.0\ninclude:\n  - workflows/custom/capture-flow.yaml\n  - workflows/custom/loop.yaml\n');
  writeFixtureFile(root, '.wingfoil/workflows/custom/capture-flow.yaml', CAPTURE);
  writeFixtureFile(root, '.wingfoil/workflows/custom/loop.yaml', LOOP);
  writeFixtureFile(root, '.wingfoil/memory.yaml', MEMORY_YAML);
  writeFixtureFile(root, '.wingfoil/dna.yaml', DNA_YAML);
  commitAll(root, 'fixture configuration');
}

describe('spec-017 §4.11 — an archived self-bound element stays bound; a later linked element does not rebind', () => {
  it('the instance stays abandoned on the first bug after a second one is linked', () => {
    const repo = makeTempGitRepo();
    try {
      writeProject(repo);
      commit(repo, { 'docs/plans/ing-1.md': plan('ing-1', 'capture-flow') }, 'wf(plan): add ing-1');
      const link = { 'WingFoil-Instance': 'ing-1', 'WingFoil-Step': 'capture-flow.capture' };
      commit(repo, { 'docs/bugs/bug-1.md': element('bug', 'bug-1', 'draft') }, 'wf(bug): add bug-1', link);
      commit(repo, { 'docs/bugs/bug-1.md': element('bug', 'bug-1', 'deprecated') }, 'wf(bug): deprecate bug-1 [draft → deprecated]');
      commit(repo, { 'docs/bugs/bug-2.md': element('bug', 'bug-2', 'open') }, 'wf(bug): add bug-2', link);
      const instance = deduceWorkflowStateAtHead(repo).instances[0]!;
      expect(instance.instance).toMatchObject({ element: { type: 'bug', id: 'bug-1', status: 'deprecated' }, abandoned: true });
      expect(instance.instance.created.map((ref) => ref.id)).toEqual(['bug-1', 'bug-2']);
      expect([instance.complete, instance.frontier]).toEqual([false, []]);
    } finally {
      removeTempDir(repo);
    }
  });
});

describe('spec-017 §4.8 — a re-entered element whose file no walk commit changed has no state commit', () => {
  it('the lookup finds nothing and the state evidence from the fallback step on is not newer than the re-entry', () => {
    const repo = makeTempGitRepo();
    try {
      writeProject(repo);
      commit(repo, { 'docs/tasks/task-1.md': element('task', 'task-1', 'in-progress') }, 'seed task');
      commit(repo, { 'docs/plans/loop-1.md': plan('loop-1', 'loop', 'task-1') }, 'wf(plan): add loop-1');
      commit(repo, {}, 'wf(task): reject task-1 [in-review → in-progress]');
      const snapshot = readDeductionSnapshotAtHead(repo);
      expect([...snapshot.history.values()][0]!.reentries.map((entry) => `${entry.type}:${entry.id}`)).toEqual(['task:task-1']);
      expect(snapshot.lastChanges.has('task:task-1')).toBe(false);
      const step = deduceWorkflowStateAtHead(repo).instances[0]!.frontier[0]!;
      expect(step).toMatchObject({ key: 'loop.review@task:task-1', reentered: true });
    } finally {
      removeTempDir(repo);
    }
  });
});
