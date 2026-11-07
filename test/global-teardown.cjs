'use strict';
/**
 * Jest `globalTeardown` — three duties, chained so that one cannot skip the other:
 *
 * 1. Remove the run's git isolation directory `WF_GIT_ISOLATION_DIR` (`bug-446`, task-349), the one
 *    `test/global-setup.cjs` created in this process: only a directory whose name carries this process's
 *    pid (`wf-git-isolation-r<pid>-…`) is removed, so a child jest that inherited the parent's variable never
 *    removes the parent's; and, in the run that owns its fixture tag, the isolation directories of runs no
 *    longer alive (a run killed before its teardown), as the fixture sweep below does. A failure to remove one
 *    is reported, never fatal.
 *
 * 2. Release the `dist/` lock `test/global-setup.cjs` took (bug-095, task-146). Only the run holding
 *    the lock releases it: `releaseDistLock` removes the lock only when it records this process's pid.
 *    A run killed before reaching this point leaves a lock whose pid is dead, and the next run takes
 *    it over. It runs in a `finally`, so a failing sweep (e.g. an unreadable temp dir) never leaves
 *    the lock held.
 * 3. Report, by count, the fixture directories this run — and runs no longer alive — left behind,
 * and remove them (`bug-064-fixture-temp-dirs-leak-with-no-aggregate-visibility`, task-152).
 *
 * `removeTempDir` (`test/storage/helpers/git-fixture.ts`) never throws: when it cannot remove a
 * fixture it warns once, per directory, and gives up, so a passing test cannot be failed by its own
 * teardown. Per-directory console lines are easy to miss across a 200-suite run — 946 leaked
 * directories once accumulated unnoticed over five days — so the end of the run states the total, in
 * one line, whenever it is not zero.
 *
 * Scope: fixture directories carry the run tag `test/global-setup.cjs` sets (`wf-storage-<tag>-…`,
 * the tag `r<pid>` of jest's main process). The sweep removes this run's own, and, since task-308
 * (`bug-208`), the ones whose tag names a pid that is no longer a live process: a run killed before
 * its own teardown left them, and nothing else ever would remove them. Other live runs sharing the
 * temp dir — parallel worktrees — keep their fixtures; untagged names and legacy prefixes
 * (`wf-storage-clone-…`, `wf-storage-cwd-…`, a bare `mkdtemp` suffix) are never touched (R8). Liveness
 * is `process.kill(pid, 0)`, which judges pids in the teardown's own pid namespace: runs in another
 * namespace sharing the temp dir are out of scope (the dist lock makes the same assumption since
 * task-146). Each
 * group is reported in its own line; leftovers are reported, never fatal: whether a leak should fail
 * the run is not decided (bug-064 Notes).
 */
const { readdirSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { basename, join } = require('node:path');

const { distLockPath, isPidAlive, releaseDistLock } = require('./dist-lock.cjs');
const { ISOLATION_DIR_PREFIX } = require('./git-isolation.cjs');

/** A tagged fixture directory name: `wf-storage-r<pid>-…`, capturing the pid. */
const TAGGED_FIXTURE = /^wf-storage-r([1-9][0-9]*)-/;

/**
 * Remove `dirs` (absolute paths), each as far as it can; returns the ones it could not remove.
 *
 * @param {string[]} dirs
 * @returns {string[]}
 */
function removeAll(dirs) {
  const unremoved = [];
  for (const dir of dirs) {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
    } catch {
      unremoved.push(dir);
    }
  }
  return unremoved;
}

/**
 * The report line for a sweep, or `null` when it found nothing.
 *
 * @param {string} subject - Who left the directories, e.g. `this run`.
 * @param {{ found: string[], unremoved: string[] }} result
 * @returns {string | null}
 */
function formatReport(subject, result) {
  if (result.found.length === 0) return null;
  const kept = result.unremoved.length;
  return (
    `fixture teardown: ${subject} left ${result.found.length} fixture director` +
    `${result.found.length === 1 ? 'y' : 'ies'} behind; removed ${result.found.length - kept}` +
    (kept > 0 ? `, could not remove ${kept}: ${result.unremoved.join(', ')}` : '')
  );
}

/**
 * Remove every entry of `tmpRoot` whose name starts with `wf-storage-<tag>-`, in sorted order.
 *
 * @param {string} tmpRoot - The temp directory fixtures were created in.
 * @param {string} tag - This run's fixture tag.
 * @returns {{ found: string[], unremoved: string[] }} What carried the tag, and what could not be removed.
 */
function sweepFixtureDirs(tmpRoot, tag) {
  const prefix = `wf-storage-${tag}-`;
  const found = readdirSync(tmpRoot)
    .filter((name) => name.startsWith(prefix))
    .sort()
    .map((name) => join(tmpRoot, name));
  return { found, unremoved: removeAll(found) };
}

/**
 * The one line reported for a sweep, or `null` when the run left nothing behind.
 *
 * @param {{ found: string[], unremoved: string[] }} result - What {@link sweepFixtureDirs} returned.
 * @returns {string | null}
 */
function formatSweepReport(result) {
  return formatReport('this run', result);
}

/**
 * Remove every entry of `tmpRoot` named `wf-storage-r<pid>-…` whose tag is not `ownTag` and whose pid
 * `isAlive` says is not a live process, in sorted order (bug-208, task-308).
 *
 * @param {string} tmpRoot - The temp directory fixtures were created in.
 * @param {{ ownTag: string, isAlive: (pid: number) => boolean }} options - This run's tag (swept by
 *   {@link sweepFixtureDirs}, never here), and the liveness check.
 * @returns {{ found: string[], unremoved: string[] }} What the dead runs left, and what could not be removed.
 */
function sweepDeadRunDirs(tmpRoot, { ownTag, isAlive }) {
  const found = readdirSync(tmpRoot)
    .filter((name) => {
      const match = TAGGED_FIXTURE.exec(name);
      return match !== null && `r${match[1]}` !== ownTag && !isAlive(Number(match[1]));
    })
    .sort()
    .map((name) => join(tmpRoot, name));
  return { found, unremoved: removeAll(found) };
}

/**
 * The one line reported for the dead runs' sweep, or `null` when there was nothing to sweep.
 *
 * @param {{ found: string[], unremoved: string[] }} result - What {@link sweepDeadRunDirs} returned.
 * @returns {string | null}
 */
function formatDeadRunReport(result) {
  return formatReport('runs no longer alive', result);
}

/**
 * Sweep this run's leftovers and return the report line — only in the process that set the tag. A
 * child jest started from inside a run (`test/lint/coverage-parity.test.ts`) loads this same config,
 * so it runs this teardown too, and it inherits the parent's tag through the environment; sweeping
 * there would delete the parent's fixtures while its suites are still using them. The tag is
 * `r<pid>` of the process that set it (`test/global-setup.cjs`), so a mismatch means "not mine": do
 * nothing.
 *
 * The same guard covers the dead runs' sweep: only the run that owns its tag sweeps anything.
 *
 * @param {{ tag: string | undefined, pid: number, tmpRoot: string, isAlive?: (pid: number) => boolean }} run -
 *   The run's tag, the current process id, the temp directory fixtures were created in, and the
 *   liveness check (default: {@link isPidAlive}).
 * @returns {string | null} The lines to report (this run's first, then the dead runs'), or `null` when
 *   there is nothing to say or nothing owned.
 */
function teardownRun({ tag, pid, tmpRoot, isAlive = isPidAlive }) {
  if (!tag || tag !== `r${pid}`) return null;
  const lines = [
    formatSweepReport(sweepFixtureDirs(tmpRoot, tag)),
    formatDeadRunReport(sweepDeadRunDirs(tmpRoot, { ownTag: tag, isAlive })),
  ].filter((line) => line !== null);
  return lines.length > 0 ? lines.join('\n') : null;
}

/**
 * Remove the git isolation directory `dir` when this process created it (its name starts with
 * `wf-git-isolation-r<pid>-`); returns a report line when it could not be removed, else `null`.
 *
 * @param {string | undefined} dir - `WF_GIT_ISOLATION_DIR`.
 * @param {number} pid - The current process id.
 * @returns {string | null}
 */
function removeGitIsolation(dir, pid) {
  if (!dir || !basename(dir).startsWith(`${ISOLATION_DIR_PREFIX}${pid}-`)) return null;
  const unremoved = removeAll([dir]);
  return unremoved.length > 0 ? `git isolation teardown: could not remove ${dir}` : null;
}

/**
 * Remove every entry of `tmpRoot` named `wf-git-isolation-r<pid>-…` whose pid is not `ownPid` and that `isAlive`
 * says is not a live process, in sorted order: the isolation directories of runs killed before their teardown.
 *
 * @param {string} tmpRoot - The temp directory the isolation directories were created in.
 * @param {{ ownPid: number, isAlive: (pid: number) => boolean }} options
 * @returns {{ found: string[], unremoved: string[] }}
 */
function sweepDeadGitIsolationDirs(tmpRoot, { ownPid, isAlive }) {
  const pattern = new RegExp(`^${ISOLATION_DIR_PREFIX}([1-9][0-9]*)-`);
  const found = readdirSync(tmpRoot)
    .filter((name) => {
      const match = pattern.exec(name);
      return match !== null && Number(match[1]) !== ownPid && !isAlive(Number(match[1]));
    })
    .sort()
    .map((name) => join(tmpRoot, name));
  return { found, unremoved: removeAll(found) };
}

/** The jest `globalTeardown` entry point: one self-contained async function, easy to chain. */
module.exports = async () => {
  try {
    const isolationReport = removeGitIsolation(process.env.WF_GIT_ISOLATION_DIR, process.pid);
    if (isolationReport) console.warn(isolationReport);
    if (process.env.WF_FIXTURE_RUN_TAG === `r${process.pid}`) {
      const dead = sweepDeadGitIsolationDirs(tmpdir(), { ownPid: process.pid, isAlive: isPidAlive });
      if (dead.unremoved.length > 0) console.warn(`git isolation teardown: could not remove ${dead.unremoved.join(', ')}`);
    }
    const report = teardownRun({ tag: process.env.WF_FIXTURE_RUN_TAG, pid: process.pid, tmpRoot: tmpdir() });
    if (report) console.warn(report);
  } finally {
    releaseDistLock({ lockPath: distLockPath(join(__dirname, '..')) });
  }
};
module.exports.sweepFixtureDirs = sweepFixtureDirs;
module.exports.formatSweepReport = formatSweepReport;
module.exports.sweepDeadRunDirs = sweepDeadRunDirs;
module.exports.formatDeadRunReport = formatDeadRunReport;
module.exports.teardownRun = teardownRun;
module.exports.removeGitIsolation = removeGitIsolation;
module.exports.sweepDeadGitIsolationDirs = sweepDeadGitIsolationDirs;
