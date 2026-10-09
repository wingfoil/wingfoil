/**
 * task-202 — `iterate_over` at `HEAD`, through the snapshot reader (`src/core/workflow-deduction.ts`)
 * and the `src/core` barrel: the reader resolves every `dna:<path>` / `bindings:<name>` collection a
 * loaded workflow iterates over (`spec-003` § "Collections", `dl-104` D2 (b)) from the committed
 * `dna.yaml` and `workflows/bindings.yaml`, and reads archived Memory documents so the deduction can
 * abandon an instance whose bound element is archived (`spec-017` §4.11). BDD
 * `p4-workflow/P4.16-include-composition.feature` sc. 1 and sc. 3 on a real repository.
 */
import { deduceWorkflowStateAtHead, readDeductionSnapshotAtHead } from '../../src/core';
import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const MEMORY_YAML = `version: 1.0
types:
  task:
    path: "docs/tasks/{id}.md"
    id_pattern: "task-{n}-{slug}"
    states:
      sequence: [ draft, pending, backlog, in-progress, done ]
  release:
    path: "docs/releases/{id}.md"
    states:
      sequence: [ draft, planning, in-development, released ]
  plan:
    path: "docs/plans/{id}.md"
    states:
      sequence: [ draft, active, done ]
`;

const DNA_YAML = `version: 1.0
modules:
  - name: core
    path: src/core
  - name: cli
    path: src/cli
stacks:
  technologies:
    - name: TypeScript
      category: language
team:
  members:
    - name: Roberto
      email: roberto@example.invalid
      roles: [ developer ]
  roles:
    - name: developer
paths:
  sources: [ src/ ]
`;

const BINDINGS_YAML = `version: 1.0
collections:
  templates: [ kanban, scrum ]
`;

const WORKFLOWS: Record<string, string> = {
  'workflows/custom/rel.yaml': `name: rel
kind: main
element: release
phases:
  - name: loop
    include: dev
    iterate_over: task
    where: { status: [ backlog ] }
  - name: wrap
    actions:
      - element.set_state(released)
`,
  'workflows/custom/dev.yaml': `name: dev
kind: sub
element: task
phases:
  - name: start
    actions:
      - element.set_state(in-progress)
  - name: finish
    actions:
      - element.set_state(done)
`,
  'workflows/custom/mods.yaml': `name: mods
kind: main
phases:
  - name: each-module
    include: per-entry
    iterate_over: dna:modules
  - name: each-template
    include: per-entry
    iterate_over: bindings:templates
`,
  'workflows/custom/per-entry.yaml': `name: per-entry
kind: sub
phases:
  - name: write
    produces: [ "docs/entries/{item}.md" ]
`,
};

function element(type: string, id: string, status: string, extra = ''): string {
  return `---\nid: "${id}"\ntype: ${type}\ntitle: "${id}"\nstatus: ${status}\n${extra}---\n\n## Body\n`;
}

function plan(id: string, workflow: string, bound = ''): string {
  return element('plan', id, 'active', `workflow: "${workflow}"\nphase: "x"\nelement: "${bound}"\n`);
}

function writeProject(root: string, files: Record<string, string>): void {
  const include = Object.keys(WORKFLOWS)
    .map((file) => `  - ${file}\n`)
    .join('');
  writeFixtureFile(root, '.wingfoil/workflows.yaml', `version: 1.0\ninclude:\n${include}`);
  for (const [file, body] of Object.entries(WORKFLOWS)) writeFixtureFile(root, `.wingfoil/${file}`, body);
  writeFixtureFile(root, '.wingfoil/workflows/bindings.yaml', BINDINGS_YAML);
  writeFixtureFile(root, '.wingfoil/memory.yaml', MEMORY_YAML);
  writeFixtureFile(root, '.wingfoil/dna.yaml', DNA_YAML);
  for (const [path, content] of Object.entries(files)) writeFixtureFile(root, path, content);
  commitAll(root, 'fixture');
}

describe('task-202 — iterate_over at HEAD (spec-017 §4.6, §4.11)', () => {
  let repo: string;
  afterEach(() => removeTempDir(repo));

  it('BDD P4.16 sc. 1: 3 backlog tasks and 1 done task → 3 iterations of the sub', () => {
    repo = makeTempGitRepo();
    writeProject(repo, {
      'docs/tasks/task-1-a.md': element('task', 'task-1-a', 'backlog'),
      'docs/tasks/task-2-b.md': element('task', 'task-2-b', 'backlog'),
      'docs/tasks/task-3-c.md': element('task', 'task-3-c', 'backlog'),
      'docs/tasks/task-4-d.md': element('task', 'task-4-d', 'done'),
      'docs/releases/r1.md': element('release', 'r1', 'in-development'),
      'docs/plans/p1.md': plan('p1', 'rel', 'r1'),
    });
    const entry = deduceWorkflowStateAtHead(repo).instances[0]!;
    expect(entry.frontier.map((step) => step.key)).toEqual(['dev.start@task:task-1-a', 'dev.start@task:task-2-b', 'dev.start@task:task-3-c']);
    expect(entry.phases[0]).toEqual({ phase: 'loop', state: 'current', iterations: { eligible: 3, entered: 0, complete: 1, late: 0 } });
  });

  it('BDD P4.16 sc. 3: no backlog task → zero iterations and the note', () => {
    repo = makeTempGitRepo();
    writeProject(repo, {
      'docs/tasks/task-1-a.md': element('task', 'task-1-a', 'draft'),
      'docs/releases/r1.md': element('release', 'r1', 'in-development'),
      'docs/plans/p1.md': plan('p1', 'rel', 'r1'),
    });
    const entry = deduceWorkflowStateAtHead(repo).instances[0]!;
    expect(entry.phases[0]).toMatchObject({ phase: 'loop', state: 'complete', vacuous: true, iterations: { note: 'no elements matched the iterate_over filter' } });
    expect(entry.frontier.map((step) => step.key)).toEqual(['rel.wrap@release:r1']);
  });

  it('reads dna:modules and bindings:<name> from HEAD, in declared order', () => {
    repo = makeTempGitRepo();
    writeProject(repo, { 'docs/plans/p1.md': plan('p1', 'mods'), 'docs/entries/core.md': '# core\n' });
    const snapshot = readDeductionSnapshotAtHead(repo);
    expect([...(snapshot.collections ?? new Map()).entries()]).toEqual([
      ['bindings:templates', ['kanban', 'scrum']],
      [
        'dna:modules',
        [
          { name: 'core', path: 'src/core' },
          { name: 'cli', path: 'src/cli' },
        ],
      ],
    ]);
    const entry = deduceWorkflowStateAtHead(repo).instances[0]!;
    expect(entry.frontier.map((step) => step.key)).toEqual(['per-entry.write@dna:modules#cli']);
  });

  it('a dna: collection without dna.yaml has no candidates', () => {
    repo = makeTempGitRepo();
    writeProject(repo, { 'docs/plans/p1.md': plan('p1', 'mods') });
    // Remove dna.yaml in a later commit: the registry cannot decide a dna: reference then (spec-003).
    git(repo, ['rm', '-q', '.wingfoil/dna.yaml']);
    git(repo, ['commit', '-q', '-m', 'no dna']);
    expect([...readDeductionSnapshotAtHead(repo).collections!.keys()]).toEqual(['bindings:templates']);
    const entry = deduceWorkflowStateAtHead(repo).instances[0]!;
    expect(entry.phases[0]).toMatchObject({ phase: 'each-module', state: 'complete', vacuous: true });
  });

  it('an archived bound element at HEAD abandons the instance', () => {
    repo = makeTempGitRepo();
    writeProject(repo, {
      'docs/releases/r1.md': element('release', 'r1', 'deprecated'),
      'docs/plans/p1.md': plan('p1', 'rel', 'r1'),
    });
    const entry = deduceWorkflowStateAtHead(repo).instances[0]!;
    expect(entry.instance).toMatchObject({ abandoned: true, element: { type: 'release', id: 'r1', status: 'deprecated' } });
    expect(entry.frontier).toEqual([]);
  });
});
