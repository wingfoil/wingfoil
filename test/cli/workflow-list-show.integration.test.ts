/**
 * task-204 — `wingfoil workflow list` and `wingfoil workflow show` on the compiled CLI (`spec-017` §7.5, §7.6,
 * §10; BDD P4.6, P4.7): the exit codes and the bytes a user sees. The operations' own cases are
 * `test/core/workflow-list-show.test.ts`.
 *
 * - AC 3: a `spec-003` error exits 1 on both commands; warnings exit 0.
 * - AC 4: `workflow list x` (characterization, task-129) and `workflow show a b` (red-first) exit 2.
 * - BDD P4.6 sc. 4 and P4.7 sc. 3: `no workflows defined` (exit 0), `unknown workflow: ghost` (exit 1).
 */
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { runCliEntry } from './helpers/spawn-cli';

const MEMORY_YAML = `version: 1.0
types:
  task:
    path: "docs/tasks/{id}.md"
    states:
      sequence: [ draft, pending, done ]
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

const MAIN = `name: release-cycle
startable: true
description: "Deliver one release"
phases:
  - name: develop
    role: developer
    include: dev-loop
`;

const SUB = `name: dev-loop
includable: true
phases:
  - name: red
    checks:
      pre: [ "tests.unit.run" ]
`;

function writeProject(root: string, main = MAIN): void {
  writeFixtureFile(root, '.wingfoil/workflows.yaml', 'version: 1.0\ninclude:\n  - workflows/custom/release-cycle.yaml\n  - workflows/custom/dev-loop.yaml\n');
  writeFixtureFile(root, '.wingfoil/workflows/custom/release-cycle.yaml', main);
  writeFixtureFile(root, '.wingfoil/workflows/custom/dev-loop.yaml', SUB);
  writeFixtureFile(root, '.wingfoil/memory.yaml', MEMORY_YAML);
  writeFixtureFile(root, '.wingfoil/dna.yaml', DNA_YAML);
  commitAll(root, 'fixture configuration');
}

describe('task-204 — wingfoil workflow list / show on the compiled CLI', () => {
  let repo: string;
  beforeAll(() => {
    repo = makeTempGitRepo();
    writeProject(repo);
  });
  afterAll(() => removeTempDir(repo));

  it('workflow list --format json: exit 0, the startable workflow only; --all adds the sub', () => {
    const run = runCliEntry(repo, ['workflow', 'list', '--format', 'json']);
    expect([run.status, run.stderr]).toEqual([0, '']);
    const value = JSON.parse(run.stdout) as { workflows: { name: string; executableNow: boolean }[]; diagnostics: { code: string }[] };
    expect(value.workflows.map((entry) => entry.name)).toEqual(['release-cycle']);
    expect(value.diagnostics.map((d) => d.code)).toContain('W_WORKFLOW_UNBOUND_TOKEN'); // a warning: still exit 0
    const all = runCliEntry(repo, ['workflow', 'list', '--all', '--format', 'json']);
    expect(all.status).toBe(0);
    expect((JSON.parse(all.stdout) as { workflows: { name: string; executableNow: boolean }[] }).workflows).toEqual([
      expect.objectContaining({ name: 'dev-loop', executableNow: false }),
      expect.objectContaining({ name: 'release-cycle', executableNow: true }),
    ]);
  });

  it('workflow show <name> --format json: exit 0, the sub nested under its phase', () => {
    const run = runCliEntry(repo, ['workflow', 'show', 'release-cycle', '--format', 'json']);
    expect([run.status, run.stderr]).toEqual([0, '']);
    const value = JSON.parse(run.stdout) as { workflow: { name: string; phases: { include: string; sub: { name: string } }[] } };
    expect(value.workflow.name).toBe('release-cycle');
    expect(value.workflow.phases[0]).toMatchObject({ include: 'dev-loop', sub: { name: 'dev-loop' } });
  });

  it('BDD P4.7 sc. 3 — workflow show ghost: exit 1, "unknown workflow: ghost"', () => {
    const run = runCliEntry(repo, ['workflow', 'show', 'ghost']);
    expect([run.status, run.stdout, run.stderr]).toEqual([1, '', 'error: unknown workflow: ghost\n']);
  });

  it('AC 4 — workflow show a b: exit 2, one positional <ref>; workflow list x: exit 2 (task-129)', () => {
    const show = runCliEntry(repo, ['workflow', 'show', 'release-cycle', 'dev-loop']);
    expect([show.status, show.stdout, show.stderr]).toEqual([2, '', 'error: wingfoil workflow show takes one positional <ref> (got 2 positionals)\n']);
    const list = runCliEntry(repo, ['workflow', 'list', 'release-cycle']);
    expect([list.status, list.stderr]).toEqual([2, 'error: wingfoil workflow list takes no positional (got 1 positional)\n']);
  });

  it('workflow show with no <ref>: exit 2, the one missing-operand form', () => {
    const run = runCliEntry(repo, ['workflow', 'show']);
    expect(run.status).toBe(2);
    expect(run.stderr).toBe('error: missing required argument: <ref>\nhint: usage: wingfoil workflow show <ref>\n');
  });
});

describe('task-204 AC 3 — a spec-003 error committed at HEAD exits 1 on both commands', () => {
  it('list and show exit 1 with the first error as the reason', () => {
    const repo = makeTempGitRepo();
    try {
      writeProject(repo, MAIN.replace('role: developer', 'role: nonexistent-role'));
      for (const args of [['workflow', 'list'], ['workflow', 'show', 'dev-loop']]) {
        const run = runCliEntry(repo, args);
        expect(run.status).toBe(1);
        expect(run.stdout).toBe('');
        expect(run.stderr).toContain("E_PHASE_ROLE_UNKNOWN phases[0].role (workflows/custom/release-cycle.yaml): unknown role 'nonexistent-role'");
      }
    } finally {
      removeTempDir(repo);
    }
  });
});

describe('task-204 — BDD P4.6 sc. 4: no workflows defined', () => {
  it('exit 0, zero workflows and the message', () => {
    const repo = makeTempGitRepo();
    try {
      writeFixtureFile(repo, 'README.md', '# empty\n');
      commitAll(repo, 'no workflows');
      const run = runCliEntry(repo, ['workflow', 'list', '--format', 'json']);
      expect([run.status, run.stderr]).toEqual([0, '']);
      expect(JSON.parse(run.stdout)).toMatchObject({ workflows: [], message: 'no workflows defined' });
    } finally {
      removeTempDir(repo);
    }
  });
});
