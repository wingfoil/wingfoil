/**
 * task-281 (`bug-300`, `spec-017` §4.8) — a bracketless `add` / `submit` of a re-entered element counts only
 * when the element's file holds a readable `status` at that commit. These are the tolerant arms of the
 * batched read (`readBracketlessStatuses` / `frontmatterStatus`, `src/core/workflow-deduction.ts`): a file
 * with no frontmatter, an unparsable frontmatter, a frontmatter with no `status`, or no file at all at that
 * commit gives no transition, so the older bracketed submit stays the state commit: it is older than the
 * re-entry, so the first phase the re-entry reaches (`work`) is current again and misses `state`. The red suite (`workflow-deduction-bracketless-submit.test.ts`) pins the readable case.
 */
import { deduceWorkflowStateAtHead } from '../../src/core';
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
  plan:
    path: "docs/plans/{id}.md"
    states:
      sequence: [ draft, active, done ]
      waiting: [ active ]
`;

const LOOP = `name: loop
kind: main
element: task
phases:
  - name: work
    actions:
      - element.set_state(in-progress)
  - name: review
    actions:
      - memory.submit
    fallback: { step: work, set_state: in-progress }
`;

const task = (status: string): string => `---\nid: "task-1"\ntype: task\ntitle: "task-1"\nstatus: ${status}\n---\n\n## Body\n`;
const PLAN = `---\nid: "loop-1"\ntype: plan\ntitle: "loop-1"\nstatus: active\nworkflow: "loop"\nphase: "x"\nelement: "task-1"\n---\n`;
const FILE = 'docs/tasks/task-1.md';

function commit(root: string, files: Record<string, string | null>, subject: string): void {
  for (const [path, content] of Object.entries(files)) {
    if (content === null) git(root, ['rm', '-q', path]);
    else writeFixtureFile(root, path, content);
  }
  git(root, ['add', '-A']);
  git(root, ['commit', '--allow-empty', '--quiet', '-m', subject]);
}

/** A re-entered task (bracketed submit, reject), then a bracketless submit whose file is `atSubmit`, then the file restored to `in-review`. */
function scenario(atSubmit: string | null): string[] {
  const root = makeTempGitRepo();
  try {
    writeFixtureFile(root, '.wingfoil/workflows.yaml', 'version: 1.0\ninclude:\n  - workflows/custom/loop.yaml\n');
    writeFixtureFile(root, '.wingfoil/workflows/custom/loop.yaml', LOOP);
    writeFixtureFile(root, '.wingfoil/memory.yaml', MEMORY_YAML);
    commitAll(root, 'configuration');
    commit(root, { [FILE]: task('backlog') }, 'task');
    commit(root, { 'docs/plans/loop-1.md': PLAN }, 'wf(plan): add loop-1');
    commit(root, { [FILE]: task('in-progress') }, 'wf(task): start task-1 [backlog → in-progress]');
    commit(root, { [FILE]: task('in-review') }, 'wf(task): submit task-1 [in-progress → in-review]');
    commit(root, { [FILE]: task('in-progress') }, 'wf(task): reject task-1 [in-review → in-progress]');
    commit(root, { [FILE]: atSubmit }, 'wf(task): submit task-1');
    commit(root, { [FILE]: task('in-review') }, 'docs(memory): task-1 restored');
    const instance = deduceWorkflowStateAtHead(root).instances.find((entry) => entry.instance.id === 'loop-1')!;
    return instance.frontier.flatMap((step) => [step.key, ...step.evidence.missing]);
  } finally {
    removeTempDir(root);
  }
}

describe('task-281 — a bracketless submit whose file holds no readable status is not counted (spec-017 §4.8)', () => {
  it('control: a readable `in-review` status at the bracketless submit completes review', () => {
    expect(scenario(task('in-review'))).toEqual([]);
  });

  it.each<[string, string | null]>([
    ['no frontmatter', '# no frontmatter\n'],
    ['an unparsable frontmatter', '---\nstatus: [in-review\n---\n'],
    ['a frontmatter with no status', '---\nid: "task-1"\ntype: task\n---\n'],
    ['no file at that commit', null],
  ])('%s: the re-entered `work` is current and misses its state evidence', (_label, atSubmit) => {
    expect(scenario(atSubmit)).toEqual(['loop.work@task:task-1', 'state']);
  });
});
