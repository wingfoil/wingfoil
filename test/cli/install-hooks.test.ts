/**
 * task-366 AC 5 (red-first; `dl-190` item 2 (a); design items 5 and 6, D6 (a) as ruled at the design gate) — the
 * contributor setup installs `.githooks/pre-push`: `npm run setup:hooks` runs `scripts/install-hooks.cjs`, which sets
 * `core.hooksPath .githooks` in the clone's local configuration when nothing is set, says so when it already is, and
 * refuses (exit 1, configuration untouched) another hooks path or a hook the clone already runs; outside a git work tree
 * it exits 2. There is no `prepare` script (D6 (b) not taken). `CONTRIBUTING.md` documents the command.
 *
 * Each case runs the script in a scratch clone (`cloneTempRepo`) with `fixtureGitEnv()`: no inherited `GIT_*`
 * variable, no global or system git configuration. The helper pins `core.hooksPath` to `.git/hooks` in every clone it
 * hands out (bug-273), so the cases that need it unset unset it first.
 */
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { cloneTempRepo, commitAllAs, fixtureDirPrefix, fixtureGitEnv, git, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { spawnCapture, type SpawnedRun } from './helpers/spawn-cli';

const REPO_ROOT = join(__dirname, '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'install-hooks.cjs');
const SET_LINE = 'core.hooksPath set to .githooks: .githooks/pre-push runs the governance check before every push (git-conventions §9)';

const dirs: string[] = [];
afterAll(() => dirs.forEach(removeTempDir));

/** A scratch clone of a one-commit repository, with `core.hooksPath` unset in its local configuration. */
function scratchClone(): string {
  const source = mkdtempSync(fixtureDirPrefix());
  dirs.push(source);
  git(source, ['init', '--quiet', '--initial-branch=main']);
  writeFixtureFile(source, 'README.md', 'x\n');
  commitAllAs(source, 'add README.md', { name: 'WingFoil Test', email: 'wf-test@example.invalid' });
  const clone = cloneTempRepo(source);
  dirs.push(clone);
  git(clone, ['config', '--local', '--unset', 'core.hooksPath']);
  return clone;
}

/** `git config --local --get core.hooksPath` in `clone`, or `null` when it is unset (git exits 1). */
function hooksPath(clone: string): string | null {
  const run = spawnCapture('git', ['config', '--local', '--get', 'core.hooksPath'], { cwd: clone, env: fixtureGitEnv() });
  return run.status === 0 ? run.stdout.trim() : null;
}

function install(cwd: string): SpawnedRun {
  return spawnCapture(process.execPath, [SCRIPT], { cwd, env: fixtureGitEnv() });
}

describe('task-366 AC 5 — npm run setup:hooks (dl-190 (a), D6 (a))', () => {
  it('package.json wires setup:hooks to scripts/install-hooks.cjs and declares no prepare script', () => {
    const scripts = (JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf-8')) as { scripts: Record<string, string> }).scripts;
    expect(scripts['setup:hooks']).toBe('node scripts/install-hooks.cjs');
    expect('prepare' in scripts).toBe(false);
  });

  it('unset: sets core.hooksPath to .githooks, exit 0, one line; a rerun says it is already set and changes nothing', () => {
    const clone = scratchClone();
    expect(hooksPath(clone)).toBeNull();
    const first = install(clone);
    expect(first.status).toBe(0);
    expect(hooksPath(clone)).toBe('.githooks');
    expect(first.stdout).toBe(`${SET_LINE}\n`);
    const again = install(clone);
    expect(again.status).toBe(0);
    expect(again.stdout).toContain('core.hooksPath is already .githooks');
    expect(hooksPath(clone)).toBe('.githooks');
  });

  it('another hooks path (.husky): exit 1, naming it, the value unchanged', () => {
    const clone = scratchClone();
    git(clone, ['config', '--local', 'core.hooksPath', '.husky']);
    const run = install(clone);
    expect(run.status).toBe(1);
    expect(run.stdout + run.stderr).toContain('core.hooksPath is .husky, not .githooks');
    expect(hooksPath(clone)).toBe('.husky');
  });

  it('an executable .git/hooks/pre-push the clone already runs: exit 1, naming it, core.hooksPath still unset', () => {
    const clone = scratchClone();
    const hook = join(clone, '.git', 'hooks', 'pre-push');
    writeFileSync(hook, '#!/bin/sh\nexit 0\n', 'utf-8');
    chmodSync(hook, 0o755);
    const run = install(clone);
    expect(run.status).toBe(1);
    expect(run.stdout + run.stderr).toContain('would stop running once core.hooksPath is set');
    expect(run.stdout + run.stderr).toContain('pre-push');
    expect(hooksPath(clone)).toBeNull();
  });

  it('outside a git work tree: exit 2', () => {
    const outside = mkdtempSync(fixtureDirPrefix());
    dirs.push(outside);
    expect(install(outside).status).toBe(2);
  });

  it('CONTRIBUTING.md documents npm run setup:hooks', () => {
    expect(readFileSync(join(REPO_ROOT, 'CONTRIBUTING.md'), 'utf-8')).toContain('npm run setup:hooks');
  });
});
