/**
 * task-215 (`dl-050` option 1; batch ruling D1; approver rulings 2026-10-13 D-A (a), D-B) — the role-directives
 * sweep.
 *
 * AC 1 (red-first): a repository script, `scripts/check-role-directives.cjs` (`npm run check:role-directives`),
 * runs `directives list --role <r> --format json` for every `dna.yaml` `team.roles` name — through the PINNED build
 * `node_modules/wingfoil-released/dist/cli.js` (D-B) — and exits 1 when any role's `warnings` is non-empty, 0 when
 * none is; 2 on a misconfiguration (spec-003 Layer 3's exit contract). Both paths run on a fixture with a dangling
 * binding, and the script exits 0 on this repository (green only once `roles.yaml` binds `approver` and
 * `facilitator`, D-A (a)).
 *
 * The contract pinned here is the developer's design (task-215 Execution Notes, `### design`): roles visited in
 * ascending name order (REQ-SYS-07), `<role>: ok` / `<role>: <k> warning(s)` per role then a summary line on stdout,
 * one `error: role '<role>': <warning>` line per warning on stderr.
 *
 * The script is spawned, never imported, so its absence is an exit-code/output assertion failure, not a crash of
 * the suite. The fixture is a working tree only (the CLI reads it as `directives list` does); no commit, no `dist/`,
 * no network.
 */
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

import { directiveMd } from '../agent/helpers/agent-execute-fixture';
import { makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const REPO_ROOT = join(__dirname, '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'check-role-directives.cjs');

jest.setTimeout(60_000);

interface Run {
  status: number | null;
  stdout: string;
  stderr: string;
}

function runCheck(args: string[]): Run {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: REPO_ROOT, encoding: 'utf-8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/**
 * A minimal `dna.yaml` the pinned build (0.2.2) validates: it refuses one without `modules`, `stacks` (with a
 * technology `category`), `team.members` (with a `roles` array) or `paths`. `team.roles` is written in the given
 * order — deliberately not ascending in the fixtures below.
 */
function dnaYaml(roles: readonly string[]): string {
  return [
    'version: 1',
    'project:',
    '  name: fixture',
    'modules:',
    '  - name: core',
    '    path: src/core',
    'stacks:',
    '  technologies:',
    '    - name: TypeScript',
    '      category: language',
    'team:',
    '  members:',
    '    - name: Test Person',
    '      email: test@example.invalid',
    '      roles: []',
    roles.length === 0 ? '  roles: []' : '  roles:',
    ...roles.map((role) => `    - name: ${role}`),
    'paths:',
    '  sources: [src]',
    '',
  ].join('\n');
}

function rolesYaml(reviewer: readonly string[]): string {
  return [
    'version: 1',
    'global: [doc-versioning]',
    'assignments:',
    '  developer: [testing]',
    `  reviewer: [${reviewer.join(', ')}]`,
    '',
  ].join('\n');
}

/** The clean fixture: `team.roles` reviewer before developer, both bound to `testing`, one global directive. */
function writeFixture(repo: string, opts: { roles?: readonly string[]; reviewer?: readonly string[] } = {}): void {
  writeFixtureFile(repo, '.wingfoil/dna.yaml', dnaYaml(opts.roles ?? ['reviewer', 'developer']));
  writeFixtureFile(repo, '.wingfoil/roles.yaml', rolesYaml(opts.reviewer ?? ['testing']));
  writeFixtureFile(repo, '.wingfoil/directives/custom/testing.md', directiveMd('testing'));
  writeFixtureFile(repo, '.wingfoil/directives/custom/doc-versioning.md', directiveMd('doc-versioning'));
}

describe('task-215 AC 1 — check-role-directives sweeps every dna.yaml role (dl-050 option 1)', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
  });

  afterEach(() => {
    removeTempDir(repo);
  });

  it('AC 1 (exit 0): no role carries a warning — one ok line per role in ascending order, the summary, empty stderr', () => {
    writeFixture(repo);

    const run = runCheck(['--root', repo]);

    expect(run.status).toBe(0);
    expect(run.stdout).toBe('developer: ok\nreviewer: ok\nrole-directives: 2 roles checked, 0 with warnings\n');
    expect(run.stderr).toBe('');
  });

  it('AC 1 (exit 1): a dangling binding fails the sweep and its warning is quoted verbatim on stderr', () => {
    writeFixture(repo, { reviewer: ['testing', 'ghost'] });

    const run = runCheck(['--root', repo]);

    expect(run.status).toBe(1);
    expect(run.stderr).toBe("error: role 'reviewer': directive 'ghost' bound to role 'reviewer' has no directive file\n");
    expect(run.stdout).toContain('developer: ok\n');
    expect(run.stdout).toContain('reviewer: 1 warning(s)\n');
    expect(run.stdout.endsWith('role-directives: 2 roles checked, 1 with warnings\n')).toBe(true);
  });

  it('AC 1 (roles from dna.yaml): a team.roles name with no roles.yaml assignment is swept and fails (D-A (a))', () => {
    writeFixture(repo, { roles: ['reviewer', 'qa', 'developer'] });

    const run = runCheck(['--root', repo]);

    expect(run.status).toBe(1);
    expect(run.stdout).toBe(
      'developer: ok\nqa: 1 warning(s)\nreviewer: ok\nrole-directives: 3 roles checked, 1 with warnings\n',
    );
    expect(run.stderr).toBe("error: role 'qa': no directives assigned to role 'qa'\n");
  });

  it('AC 1 (exit 2): an unknown argument is a misconfiguration — empty stdout, one error line', () => {
    writeFixture(repo);

    const run = runCheck(['--root', repo, '--bogus']);

    expect(run.status).toBe(2);
    expect(run.stdout).toBe('');
    expect(run.stderr).toMatch(/^error: [^\n]*\n$/);
  });

  it('AC 1 (exit 2): a dna.yaml that declares no team.roles is a misconfiguration naming team.roles', () => {
    writeFixture(repo, { roles: [] });

    const run = runCheck(['--root', repo]);

    expect(run.status).toBe(2);
    expect(run.stdout).toBe('');
    expect(run.stderr).toMatch(/^error: [^\n]*team\.roles[^\n]*\n$/);
  });
});

describe('task-215 AC 1 — this repository passes the sweep (D-A (a): approver and facilitator bound)', () => {
  it('AC 1 (exit 0 on this repository): all eight dna.yaml roles checked, none with warnings', () => {
    const run = runCheck(['--root', REPO_ROOT]);

    expect(run.status).toBe(0);
    expect(run.stderr).toBe('');
    const lines = run.stdout.trimEnd().split('\n');
    expect(lines[lines.length - 1]).toBe('role-directives: 8 roles checked, 0 with warnings');
  });
});
