/**
 * task-215, independent review F4 (developer's own tests; the red suite is `check-role-directives.test.ts`) — the
 * role-directives sweep's exit-2 messages name what failed:
 *
 * - a spawn that cannot start (`--root` naming no directory) reports the spawn error, not "exited null";
 * - a failing CLI call is named as typed, with only the appended `--format json` pair left out, so a role named
 *   `json` stays in the message.
 */
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

import { directiveMd } from '../agent/helpers/agent-execute-fixture';
import { makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const REPO_ROOT = join(__dirname, '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'check-role-directives.cjs');

jest.setTimeout(60_000);

function runCheck(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: REPO_ROOT, encoding: 'utf-8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

const DNA_YAML = [
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
  '  roles:',
  '    - name: json',
  'paths:',
  '  sources: [src]',
  '',
].join('\n');

describe('task-215 F4 — check-role-directives names the failing command (exit 2)', () => {
  it('a --root that names no directory reports the spawn error, not an exit status of null', () => {
    const run = runCheck(['--root', join(REPO_ROOT, 'no-such-directory-task-215', 'x')]);

    expect(run.status).toBe(2);
    expect(run.stdout).toBe('');
    expect(run.stderr).toMatch(/^error: `dna show` could not run: [^\n]*ENOENT[^\n]*\n$/);
    expect(run.stderr).not.toContain('null');
  });

  it('a role named json keeps its name in the message of a failing directives list', () => {
    const repo = makeTempGitRepo();
    try {
      writeFixtureFile(repo, '.wingfoil/dna.yaml', DNA_YAML);
      // A roles.yaml the schema refuses: `dna show` passes, `directives list` exits 1 (VALIDATION).
      writeFixtureFile(repo, '.wingfoil/roles.yaml', 'version: 1\nassignments: [not, a, mapping]\nglobal: []\n');
      writeFixtureFile(repo, '.wingfoil/directives/custom/testing.md', directiveMd('testing'));

      const run = runCheck(['--root', repo]);

      expect(run.status).toBe(2);
      expect(run.stdout).toBe('');
      expect(run.stderr).toMatch(/^error: `directives list --role json` exited 1[^\n]*\n$/);
    } finally {
      removeTempDir(repo);
    }
  });
});
