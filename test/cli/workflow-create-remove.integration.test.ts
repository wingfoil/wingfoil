/**
 * task-211 — `wingfoil workflow create` and `wingfoil workflow remove` on the compiled CLI (`spec-017` §7.7,
 * §7.8, §10; BDD P4.8, P4.9): the exit codes and the bytes a user sees. The operations' own cases are
 * `test/core/workflow-create-remove.test.ts`.
 *
 * - P4.8 sc. 1 with the positional name: exit 0, the console names the file and the commit;
 * - P4.8 sc. 3: exit 1, `workflow already exists: <name>`;
 * - the usage errors: an invalid name, `--kind` with a boolean, neither, a second positional → exit 2;
 * - P4.9 sc. 1–3: exit 0; `cannot remove '<name>': included by '<referrer>'` and
 *   `built-in workflows cannot be removed`, exit 1;
 * - `--format json` parses as the result.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { runCliEntry } from './helpers/spawn-cli';

const MEMORY_YAML = `version: 1.0
types:
  release:
    path: "docs/releases/{id}.md"
    states:
      sequence: [ draft, planning, in-development, released ]
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
    - name: WingFoil Test
      email: wf-test@example.invalid
      roles: [ developer ]
  roles:
    - name: developer
paths:
  sources: [ src/ ]
`;

function writeProject(root: string): void {
  writeFixtureFile(
    root,
    '.wingfoil/workflows.yaml',
    'version: 1.0\ninclude:\n  - workflows/custom/release-cycle.yaml\n  - workflows/custom/shared.yaml\n  - workflows/built-in/base.yaml\n',
  );
  writeFixtureFile(root, '.wingfoil/workflows/custom/release-cycle.yaml', 'name: release-cycle\nstartable: true\nphases:\n  - name: checks\n    include: shared\n');
  writeFixtureFile(root, '.wingfoil/workflows/custom/shared.yaml', 'name: shared\nincludable: true\nphases:\n  - name: lint\n    role: developer\n');
  writeFixtureFile(root, '.wingfoil/workflows/built-in/base.yaml', 'name: base\nstartable: true\nphases:\n  - name: one\n    role: developer\n');
  writeFixtureFile(root, '.wingfoil/memory.yaml', MEMORY_YAML);
  writeFixtureFile(root, '.wingfoil/dna.yaml', DNA_YAML);
  commitAll(root, 'fixture');
}

const head = (repo: string): string => execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim();

describe('task-211 — wingfoil workflow create / remove on the compiled CLI', () => {
  let repo: string;
  beforeAll(() => {
    repo = makeTempGitRepo();
    writeProject(repo);
  });
  afterAll(() => removeTempDir(repo));

  it('P4.8 sc. 1 — create with the positional name: exit 0, the console names the file and the commit', () => {
    const run = runCliEntry(repo, ['workflow', 'create', 'arch-review', '--kind', 'main']);
    expect([run.status, run.stderr]).toEqual([0, '']);
    expect(run.stdout).toBe(`created workflow arch-review (.wingfoil/workflows/custom/arch-review.yaml) in ${head(repo)}\n`);
    expect(existsSync(join(repo, '.wingfoil/workflows/custom/arch-review.yaml'))).toBe(true);
  });

  it('P4.8 sc. 3 — a duplicate name: exit 1, workflow already exists, nothing committed', () => {
    const before = head(repo);
    const run = runCliEntry(repo, ['workflow', 'create', 'arch-review', '--kind', 'main']);
    expect([run.status, run.stdout]).toEqual([1, '']);
    expect(run.stderr).toMatch(/^error: workflow already exists: arch-review\n/);
    expect(head(repo)).toBe(before);
  });

  it.each([
    ['an invalid name', ['workflow', 'create', 'Arch', '--kind', 'main'], "error: invalid workflow name 'Arch' (allowed: [a-z][a-z0-9-]*)"],
    ['--kind with --startable', ['workflow', 'create', 'x-flow', '--kind', 'main', '--startable'], 'error: --kind cannot be combined with --startable or --includable (declare one or the other)'],
    ['neither', ['workflow', 'create', 'x-flow'], 'error: missing required argument: --kind, --startable or --includable'],
    ['a second positional', ['workflow', 'create', 'x-flow', 'y-flow', '--kind', 'main'], 'error: wingfoil workflow create takes one positional <name> (got 2 positionals)'],
    ['remove with no <ref>', ['workflow', 'remove'], 'error: missing required argument: <ref>'],
  ])('%s: exit 2, nothing committed', (_label, args, line) => {
    const before = head(repo);
    const run = runCliEntry(repo, args);
    expect([run.status, run.stdout]).toEqual([2, '']);
    expect(run.stderr.split('\n')[0]).toBe(line);
    expect(head(repo)).toBe(before);
  });

  it('P4.9 sc. 2 — still included: exit 1, the referrer named', () => {
    const run = runCliEntry(repo, ['workflow', 'remove', 'shared']);
    expect([run.status, run.stdout]).toEqual([1, '']);
    expect(run.stderr).toMatch(/^error: cannot remove 'shared': included by 'release-cycle'\n/);
  });

  it('P4.9 sc. 3 — a built-in: exit 1, built-in workflows cannot be removed', () => {
    const run = runCliEntry(repo, ['workflow', 'remove', 'base']);
    expect([run.status, run.stdout]).toEqual([1, '']);
    expect(run.stderr).toMatch(/^error: built-in workflows cannot be removed\n/);
  });

  it('P4.9 sc. 1 — remove, --format json: exit 0, the result parses', () => {
    const run = runCliEntry(repo, ['workflow', 'remove', 'arch-review', '--format', 'json']);
    expect([run.status, run.stderr]).toEqual([0, '']);
    const value = JSON.parse(run.stdout) as { baseline: { rev: string }; name: string; file: string; commit: string };
    expect(value).toMatchObject({ name: 'arch-review', file: '.wingfoil/workflows/custom/arch-review.yaml', commit: head(repo) });
    expect(value.baseline.rev).toBe('HEAD');
    expect(existsSync(join(repo, '.wingfoil/workflows/custom/arch-review.yaml'))).toBe(false);
  });
});
