/**
 * task-226 — `wingfoil workflow finalize` on the compiled CLI (`spec-017` §7.9, §10): the exit codes and the
 * bytes a user sees. The operation's own cases are `test/core/workflow-finalize.test.ts`.
 *
 * - a checkpoint: exit 0, the console names the finalized step, its commit and the new next step;
 *   `--format json` parses as `FinalizeResult`;
 * - a step not on the frontier: exit 1, `CONFLICT`'s message on stderr;
 * - an approval phase without `--reason`: exit 2, `missing required argument: --reason`;
 * - a second positional: exit 2.
 */
import { execFileSync } from 'node:child_process';

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
      roles: [ developer, approver ]
  roles:
    - name: developer
    - name: approver
paths:
  sources: [ src/ ]
`;

const MAIN = `name: release-cycle
startable: true
element: release
phases:
  - name: smoke
    role: developer
  - name: go
    role: developer
    approval: { by_role: approver }
  - name: ship
    role: developer
    actions:
      - element.set_state(released)
`;

function element(type: string, id: string, status: string, extra = ''): string {
  return `---\nid: "${id}"\ntype: ${type}\ntitle: "${id}"\nstatus: ${status}\n${extra}---\n\n## Body\n`;
}

function writeProject(root: string): void {
  writeFixtureFile(root, '.wingfoil/workflows.yaml', 'version: 1.0\ninclude:\n  - workflows/custom/release-cycle.yaml\n');
  writeFixtureFile(root, '.wingfoil/workflows/custom/release-cycle.yaml', MAIN);
  writeFixtureFile(root, '.wingfoil/memory.yaml', MEMORY_YAML);
  writeFixtureFile(root, '.wingfoil/dna.yaml', DNA_YAML);
  writeFixtureFile(root, '.wingfoil/roles.yaml', 'version: 1.0\nassignments:\n  developer: [ testing ]\nglobal: []\n');
  writeFixtureFile(root, '.wingfoil/directives/custom/testing.md', '---\nid: testing\nname: "Testing"\ntype: directive\nkind: custom\ntitle: "Testing"\n---\n\n# Testing\n');
  writeFixtureFile(root, 'docs/releases/minor-1.md', element('release', 'minor-1', 'in-development'));
  writeFixtureFile(root, 'docs/plans/rc-1.md', element('plan', 'rc-1', 'active', 'workflow: "release-cycle"\nphase: "x"\nelement: "minor-1"\n'));
  commitAll(root, 'fixture');
}

const head = (repo: string): string => execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim();

describe('task-226 — wingfoil workflow finalize on the compiled CLI', () => {
  let repo: string;
  beforeAll(() => {
    repo = makeTempGitRepo();
    writeProject(repo);
  });
  afterAll(() => removeTempDir(repo));

  it('spec-017 §10 — a step not on the frontier: exit 1, the CONFLICT message, nothing committed', () => {
    const before = head(repo);
    const run = runCliEntry(repo, ['workflow', 'finalize', '--step', 'release-cycle.ship@release:minor-1']);
    expect([run.status, run.stdout, run.stderr]).toEqual([1, '', "error: step 'release-cycle.ship@release:minor-1' is not on the frontier of rc-1\n"]);
    expect(head(repo)).toBe(before);
  });

  it('a checkpoint — console: exit 0, the finalized step, its commit and the new next step', () => {
    const run = runCliEntry(repo, ['workflow', 'finalize']);
    expect([run.status, run.stderr]).toEqual([0, '']);
    expect(run.stdout).toContain('workflow: release-cycle (rc-1)\n');
    expect(run.stdout).toContain(`finalized: release-cycle.smoke@release:minor-1 (${head(repo)})\n`);
    expect(run.stdout).toContain('next step: release-cycle.go@release:minor-1\n');
  });

  it('an approval phase without --reason: exit 2, missing required argument: --reason', () => {
    const before = head(repo);
    const run = runCliEntry(repo, ['workflow', 'finalize', 'rc-1']);
    expect([run.status, run.stdout, run.stderr]).toEqual([2, '', 'error: missing required argument: --reason\n']);
    expect(head(repo)).toBe(before);
  });

  it('--format json parses as FinalizeResult', () => {
    const run = runCliEntry(repo, ['workflow', 'finalize', 'release-cycle', '--reason', 'Ready to ship.', '--format', 'json']);
    expect([run.status, run.stderr]).toEqual([0, '']);
    const value = JSON.parse(run.stdout) as { baseline: { rev: string }; finalized: { key: string }; next: { key: string } | null; commit: string };
    expect(value.baseline.rev).toBe('HEAD');
    expect(value.finalized.key).toBe('release-cycle.go@release:minor-1');
    expect(value.next?.key).toBe('release-cycle.ship@release:minor-1');
    expect(value.commit).toBe(head(repo));
  });

  it('a second positional: exit 2', () => {
    const run = runCliEntry(repo, ['workflow', 'finalize', 'rc-1', 'extra']);
    expect([run.status, run.stdout]).toEqual([2, '']);
    expect(run.stderr).toBe('error: wingfoil workflow finalize takes one positional <ref> (got 2 positionals)\n');
  });
});
