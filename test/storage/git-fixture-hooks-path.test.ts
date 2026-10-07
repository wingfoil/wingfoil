/**
 * Regression guard for `bug-273` (task-262): the fixture repositories handed out by
 * {@link makeTempGitRepo} and {@link cloneTempRepo} run the hooks their tests plant in
 * `<repo>/.git/hooks`, whatever `core.hooksPath` the developer's global git config sets.
 *
 * Five `test/core` suites test a verb's behaviour when a pre-commit hook refuses its commit by writing
 * `<repo>/.git/hooks/pre-commit`. A global `core.hooksPath` (a common way to install team-wide hooks)
 * redirects git to another directory, so the planted hook never ran and those tests failed.
 *
 * The global configuration here is an isolated scratch file named by `GIT_CONFIG_GLOBAL` (with
 * `GIT_CONFIG_NOSYSTEM`), handed through an explicit `env` to the git processes this suite spawns itself
 * ({@link gitIsolated}, {@link commitIsolated}): the developer's real git configuration is never
 * written, and those calls never read it. The fixture helpers this suite exercises (`makeTempGitRepo`,
 * `cloneTempRepo`, `commitAll`, `git`) spawn git with no `env`, so they still read it. Explicit, not an assignment to
 * `process.env`: jest gives each suite a sandboxed copy of `process.env`, and `child_process` spawns
 * with the real one unless `env` is passed — which is why `src/storage/commit.ts` passes
 * `env: process.env` explicitly, and why this suite commits the way it does (see {@link commitIsolated}).
 */
import { execFileSync } from 'child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import { join } from 'path';

import {
  cloneTempRepo,
  commitAll,
  fixtureDirPrefix,
  git,
  makeTempGitRepo,
  removeTempDir,
  writeFixtureFile,
} from './helpers/git-fixture';

/** Marker file a planted hook writes into the repository's `.git` when git runs it. */
const MARKER = 'wf-planted-hook-ran';

let scratch: string;
let globalHooksDir: string;
/** The environment of the git processes this suite spawns itself: the real one plus the isolated global config. */
let isolatedEnv: NodeJS.ProcessEnv;
const cleanup: string[] = [];

beforeAll(() => {
  scratch = mkdtempSync(fixtureDirPrefix());
  globalHooksDir = join(scratch, 'global-hooks');
  mkdirSync(globalHooksDir);
  const globalConfig = join(scratch, 'gitconfig');
  // The identity rides along because `git clone` does not copy the source's local config, so a commit
  // in a clone takes its identity from the global file — this one, not the developer's.
  writeFileSync(
    globalConfig,
    `[core]\n\thooksPath = ${globalHooksDir}\n[user]\n\tname = WingFoil Test\n\temail = wf-test@example.invalid\n`,
    'utf-8',
  );
  isolatedEnv = { ...process.env, GIT_CONFIG_GLOBAL: globalConfig, GIT_CONFIG_NOSYSTEM: '1' };
});

afterAll(() => {
  for (const dir of cleanup) removeTempDir(dir);
  removeTempDir(scratch);
});

/** Run `git` in `cwd` under {@link isolatedEnv}. */
function gitIsolated(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8', env: isolatedEnv });
}

/** Stage and commit the whole working tree under {@link isolatedEnv}, as a verb's commit would run. */
function commitIsolated(repo: string, message: string): void {
  gitIsolated(repo, ['add', '-A']);
  gitIsolated(repo, ['commit', '--quiet', '-m', message]);
}

/** Plant a pre-commit hook in `<repo>/.git/hooks` that leaves {@link MARKER} in `.git` when it runs. */
function plantHook(repo: string): void {
  const hook = join(repo, '.git', 'hooks', 'pre-commit');
  mkdirSync(join(repo, '.git', 'hooks'), { recursive: true });
  writeFileSync(hook, `#!/bin/sh\n: > .git/${MARKER}\nexit 0\n`, 'utf-8');
  chmodSync(hook, 0o755);
}

/** Plant the hook, commit one file, and report whether git ran the planted hook. */
function plantedHookRuns(repo: string): boolean {
  plantHook(repo);
  writeFixtureFile(repo, 'hooked.txt', 'hooked\n');
  commitIsolated(repo, 'commit with a planted hook');
  return existsSync(join(repo, '.git', MARKER));
}

describe('git fixture hooks directory under a global core.hooksPath (bug-273)', () => {
  it('the isolated global core.hooksPath is in effect for this suite', () => {
    expect(gitIsolated(scratch, ['config', '--global', '--get', 'core.hooksPath']).trim()).toBe(globalHooksDir);
  });

  it('control: a plain `git init` repository does not run a hook planted in .git/hooks', () => {
    // Proves the global setting bites: without the fixture's pin, git looks in the global directory.
    const repo = mkdtempSync(fixtureDirPrefix());
    cleanup.push(repo);
    gitIsolated(repo, ['init', '--quiet', '--initial-branch=main']);
    gitIsolated(repo, ['config', 'user.email', 'wf-test@example.invalid']);
    gitIsolated(repo, ['config', 'user.name', 'WingFoil Test']);
    gitIsolated(repo, ['config', 'commit.gpgsign', 'false']);
    expect(plantedHookRuns(repo)).toBe(false);
  });

  it('makeTempGitRepo pins core.hooksPath to .git/hooks in its local config', () => {
    const repo = makeTempGitRepo();
    cleanup.push(repo);
    expect(git(repo, ['config', '--local', '--get', 'core.hooksPath']).trim()).toBe('.git/hooks');
  });

  it('a makeTempGitRepo fixture runs a hook planted in its own .git/hooks', () => {
    const repo = makeTempGitRepo();
    cleanup.push(repo);
    expect(plantedHookRuns(repo)).toBe(true);
  });

  it('cloneTempRepo pins core.hooksPath to .git/hooks in its local config', () => {
    const source = makeTempGitRepo();
    cleanup.push(source);
    writeFixtureFile(source, 'seed.txt', 'seed\n');
    commitAll(source, 'seed');
    const clone = cloneTempRepo(source);
    cleanup.push(clone);
    expect(git(clone, ['config', '--local', '--get', 'core.hooksPath']).trim()).toBe('.git/hooks');
  });

  it('a cloneTempRepo fixture runs a hook planted in its own .git/hooks', () => {
    const source = makeTempGitRepo();
    cleanup.push(source);
    writeFixtureFile(source, 'seed.txt', 'seed\n');
    commitAll(source, 'seed');
    const clone = cloneTempRepo(source);
    cleanup.push(clone);
    expect(plantedHookRuns(clone)).toBe(true);
  });
});
