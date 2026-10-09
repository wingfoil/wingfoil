/**
 * task-208 (`dl-103` §1 (B)) — a tracked hook directory, `.githooks/`, opted into per clone with
 * `git config core.hooksPath .githooks` (documented in `git-conventions`), runs the same governance
 * check before a push. A local convenience: `--no-verify` skips it, CI (`governance.yml`) is binding.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(__dirname, '..', '..');
const HOOK = '.githooks/pre-push';

describe('tracked git hooks (task-208, dl-103 §1 (B))', () => {
  it('tracks .githooks/pre-push as an executable file', () => {
    const entry = execFileSync('git', ['ls-files', '--stage', '--', HOOK], { cwd: REPO_ROOT, encoding: 'utf-8' });
    expect(entry).toMatch(/^100755 /);
  });

  it('runs the same script the CI runs, against the remote commit being replaced', () => {
    const text = readFileSync(join(REPO_ROOT, HOOK), 'utf-8');
    expect(text).toContain('scripts/check-governance.cjs');
    expect(text).toContain('--base');
  });

  it('is valid POSIX sh', () => {
    expect(spawnSync('sh', ['-n', join(REPO_ROOT, HOOK)]).status).toBe(0);
  });

  it('passes a push that adds no commit (remote already at HEAD), running the check', () => {
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf-8' }).trim();
    const run = spawnSync('sh', [join(REPO_ROOT, HOOK), 'origin', 'https://example.invalid/repo.git'], {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
      input: `refs/heads/x ${head} refs/heads/x ${head}\n`,
    });
    expect({ status: run.status, stderr: run.stderr }).toEqual({ status: 0, stderr: '' });
    expect(run.stdout).toMatch(/governance check: 0 wf\(\) commits/);
  });

  it('is documented in git-conventions, with the opt-in command', () => {
    const directive = readFileSync(join(REPO_ROOT, '.wingfoil', 'directives', 'custom', 'git-conventions.md'), 'utf-8');
    expect(directive).toContain('git config core.hooksPath .githooks');
  });
});
