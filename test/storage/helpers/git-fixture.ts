/**
 * Test-only fixture helpers: build isolated, throwaway git repositories under the OS temp dir so
 * storage-layer tests can exercise real `git init`/`clone` behavior (REQ-SYS-01's fit criterion is
 * literally about `git clone`) without touching this repository itself. Not a `.test.ts` file, so
 * Jest's `testMatch` never picks it up as a suite on its own.
 */
import { execFileSync } from 'child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';

/** Run `git` with a clean, throwaway identity/signing config — never touches global git config. */
export function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' });
}

/**
 * Environment variable naming the jest run a fixture belongs to. `test/global-setup.cjs` sets it in
 * jest's main process before any worker is forked, so every worker inherits the same value, and
 * `test/global-teardown.cjs` counts what this run — and only this run — left behind (bug-064).
 * Several runs share one temp dir when agents work in parallel worktrees, so a sweep keyed on the
 * bare prefix would count, and remove, another run's live fixtures.
 */
export const FIXTURE_RUN_TAG_ENV = 'WF_FIXTURE_RUN_TAG';

/**
 * The `mkdtemp` prefix every fixture directory starts with: `wf-storage-<run tag>-` inside a jest run,
 * plain `wf-storage-` outside one (no tag set).
 */
export function fixtureDirPrefix(): string {
  const tag = process.env[FIXTURE_RUN_TAG_ENV];
  return join(tmpdir(), tag ? `wf-storage-${tag}-` : 'wf-storage-');
}

/**
 * Create a fresh temp directory initialized as a git repo, with a local (non-global) test identity,
 * auto-gc off and the hooks directory pinned to `.git/hooks`.
 */
export function makeTempGitRepo(): string {
  const dir = mkdtempSync(fixtureDirPrefix());
  git(dir, ['init', '--quiet', '--initial-branch=main']);
  git(dir, ['config', 'user.email', 'wf-test@example.invalid']);
  git(dir, ['config', 'user.name', 'WingFoil Test']);
  git(dir, ['config', 'commit.gpgsign', 'false']);
  // Close the one race `removeTempDir` cannot close from the outside (bug-058). Every git command
  // here runs through `execFileSync`, so the fixture never leaves an unawaited child — except for
  // auto-maintenance: `git commit` may trigger auto-gc, and `gc.autoDetach` defaults to true, which
  // detaches a process that keeps writing `.git` after `execFileSync` has already returned. It does
  // not fire at today's fixture sizes (the 1,000-document REQ-PERF-05 fixture produces ~1,002 loose
  // objects against gc.auto's 6,700 default), but nothing keeps fixtures below that threshold, so
  // disable it outright rather than depend on staying under a limit.
  disableAutoGc(dir);
  pinHooksPath(dir);
  return dir;
}

/**
 * Set `gc.auto=0` in a fixture repo's local config. Called on every repo the helper hands out —
 * {@link makeTempGitRepo}'s and {@link cloneTempRepo}'s — because `git clone` does not copy the
 * source's local config, so a clone would otherwise keep git's 6,700-object default (bug-065).
 */
function disableAutoGc(repo: string): void {
  git(repo, ['config', 'gc.auto', '0']);
}

/**
 * Set `core.hooksPath=.git/hooks` in a fixture repo's local config, so git runs the hooks a test
 * plants in `<repo>/.git/hooks` whatever the developer's global config says (bug-273, task-262).
 * A global `core.hooksPath` — a common way to install team-wide hooks — otherwise redirects git to
 * another directory and a planted hook never runs. The local value wins over the global one; a
 * relative path is resolved against the working-tree root, where git runs hooks in a non-bare repo.
 * Called on every repo the helper hands out, for the same reason as {@link disableAutoGc}: a clone
 * does not inherit the source's local config.
 */
function pinHooksPath(repo: string): void {
  git(repo, ['config', 'core.hooksPath', '.git/hooks']);
}

/** Write a file (creating parent directories) relative to a fixture repo root. */
export function writeFixtureFile(root: string, relativePath: string, content: string): void {
  const absolute = join(root, relativePath);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, content, 'utf-8');
}

/** Stage and commit everything currently in the fixture repo's working tree. */
export function commitAll(root: string, message: string): void {
  git(root, ['add', '-A']);
  git(root, ['commit', '--quiet', '-m', message]);
}

/**
 * Stage and commit everything currently in the fixture repo's working tree, overriding the author/
 * committer identity for this one commit via `GIT_AUTHOR_*`/`GIT_COMMITTER_*` env vars — the repo's
 * own configured `user.name`/`user.email` (set by {@link makeTempGitRepo}) is left untouched.
 * task-015-complete-audit-trail uses this to build fixtures with a deliberately placeholder-looking
 * identity (e.g. a git-guessed `user@host.(none)` email, the shape git itself produces when it can't
 * determine a real domain) so the attribution-audit primitive has something genuine to flag.
 */
export function commitAllAs(root: string, message: string, author: { name: string; email: string }): void {
  git(root, ['add', '-A']);
  execFileSync('git', ['commit', '--quiet', '-m', message], {
    cwd: root,
    encoding: 'utf-8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: author.name,
      GIT_AUTHOR_EMAIL: author.email,
      GIT_COMMITTER_NAME: author.name,
      GIT_COMMITTER_EMAIL: author.email,
    },
  });
}

/**
 * Clone a fixture repo (local, filesystem-only) into a fresh temp directory, with auto-gc disabled
 * and the hooks directory pinned to `.git/hooks` like every other fixture repo.
 *
 * The clone *is* the temp directory: `git clone` into `.` from inside the empty directory `mkdtemp`
 * just made, so it creates exactly one directory and the caller's `removeTempDir(clone)` removes all
 * of it (bug-064 — this used to make two directories per call, a parent for the clone and a separate
 * working directory, and neither was reachable from the path returned).
 */
export function cloneTempRepo(source: string): string {
  const dest = mkdtempSync(fixtureDirPrefix());
  git(dest, ['clone', '--quiet', source, '.']);
  disableAutoGc(dest);
  pinHooksPath(dest);
  return dest;
}

/**
 * Bounded retry budget for {@link removeTempDir}: 5 retries with a linear backoff of 20ms per step
 * (20+40+60+80+100), so a removal sleeps at most ~300ms between attempts. That bounds the sleeping,
 * not the elapsed time: each attempt also walks the tree, and the helper was measured at up to
 * ~1,021ms against a concurrent writer (task-082; bug-065).
 *
 * Deliberately small. Node's `maxRetries` does cover `ENOTEMPTY`, but retrying is not what makes
 * teardown safe — the `catch` in {@link removeTempDir} is. Measured against a directory being
 * continuously repopulated, `maxRetries: 10, retryDelay: 50` still threw `ENOTEMPTY` on 4 of 4 runs
 * and took ~2.8s to do it; a larger budget only converts a fast failure into a slow one. The retry
 * absorbs the *transient* case (a git process finishing its write within a few hundred ms); it is
 * not an attempt to win an unwinnable race.
 *
 * Fixed count + fixed delay, never a clock deadline, per the `determinism` directive (REQ-SYS-07).
 */
const REMOVE_MAX_RETRIES = 5;
const REMOVE_RETRY_DELAY_MS = 20;

/**
 * Recursively remove a temp fixture directory.
 *
 * **Never throws** (`bug-058-fixture-teardown-enotempty-flake-under-load`). Teardown runs after a
 * test's assertions have already passed, so a failure to clean up must not be able to fail that
 * test. The observed flake was `ENOTEMPTY: directory not empty, rmdir` on a fixture's `.git`,
 * raised from an unguarded `rmSync(dir, { recursive: true, force: true })` — `force` suppresses
 * errors for a *missing* path only, it is not a retry.
 *
 * Why swallow rather than retry until success: a removal can lose the race indefinitely if
 * something keeps writing into the directory, so no bounded retry can guarantee success and an
 * unbounded one would hang the suite. This therefore makes a bounded best effort and then gives up
 * — but never silently. The leftover path is reported on `console.warn`, so an accumulating `/tmp`
 * leak stays visible instead of becoming an invisible disk-space bug.
 *
 * @param dir - Absolute path of the temp fixture directory to remove.
 */
export function removeTempDir(dir: string): void {
  try {
    rmSync(dir, {
      recursive: true,
      force: true,
      maxRetries: REMOVE_MAX_RETRIES,
      retryDelay: REMOVE_RETRY_DELAY_MS,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    // Reported, not silently dropped: names the directory so a leak is traceable to its fixture.
    console.warn(
      `removeTempDir: could not remove fixture directory ${dir} — leaving it behind (${reason})`,
    );
  }
}
