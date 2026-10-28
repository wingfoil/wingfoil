'use strict';
/**
 * One jest run at a time owns a worktree's `dist/`
 * (task-146-make-suite-result-independent-concurrent-runs-machine-load, `bug-095`).
 *
 * `test/global-setup.cjs` deletes and rebuilds `dist/` before the worker pool starts (`bug-003`). A
 * second jest run in the same worktree used to do the same while the first was still spawning
 * `node dist/cli.js`, and the first then reported failures indistinguishable from a regression. The
 * setup now takes `<worktree>/.jest-dist.lock` first and keeps it for the whole run;
 * `test/global-teardown.cjs` releases it.
 *
 * - The lock is a file holding the holder's pid. It is created atomically: the content is written to
 *   a private file which is then hard-linked to the lock path, and a link onto an existing path
 *   fails. A reader therefore never sees a half-written lock.
 * - A run that finds the lock held by a live process waits, polling, and says so once on stderr,
 *   naming the holder. If the lock is still held when the wait ends, the run refuses with an error
 *   naming the holder and the lock path. It deletes nothing in either case.
 * - A lock whose pid is not a live process was left by a run killed before its teardown, and is
 *   taken over. Only a run holding `<lock>.break` deletes such a lock, so runs breaking it at the
 *   same time cannot both end up holding it.
 * - A release removes the lock only if it holds the releaser's own pid, so a nested jest (as
 *   `test/lint/coverage-parity.test.ts` spawns) or a refused run cannot free the holder's lock.
 *
 * Under the lock the build never deletes `dist/` before it has a replacement (bug-336, task-308): it
 * writes into the staging directory `.jest-dist.next`, and only a finished build is swapped onto
 * `dist/` by two renames (`dist/` → `.jest-dist.prev`, `.jest-dist.next` → `dist/`), after which the
 * previous build is removed. A build that throws, writes nothing or is killed leaves the previous
 * `dist/` in place; the next run discards the leftovers before building. Both directories are direct
 * children of the worktree root, on the filesystem and at the depth of `dist/`, so the renames are
 * atomic and the emitted `../src/…` source-map paths stay valid. A directory that cannot be moved or
 * removed (EACCES: a `dist/` left owned by root by a container run, bug-066) fails the setup with a
 * diagnostic naming the path, the cause and the remedy, its stack reduced to that message and the
 * original error kept as its `cause`.
 */
const { existsSync, linkSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

/** How long a second run waits for the lock by default: longer than a full coverage run under load. */
const DEFAULT_WAIT_MS = 15 * 60 * 1000;
const DEFAULT_POLL_MS = 500;

function distLockPath(repoRoot) {
  return join(repoRoot, '.jest-dist.lock');
}

/** The staging directory a build writes into before it is renamed onto `dist/`. */
function distStagingPath(repoRoot) {
  return join(repoRoot, '.jest-dist.next');
}

/** Where the previous `dist/` is moved while the staged build takes its place, then removed. */
function distPreviousPath(repoRoot) {
  return join(repoRoot, '.jest-dist.prev');
}

function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM: the process exists but belongs to someone else.
    return err.code === 'EPERM';
  }
}

function defaultLog(message) {
  process.stderr.write(`${message}\n`);
}

/** The pid recorded in the lock, `null` if there is no lock, `NaN` if its content is not a pid. */
function readHolder(lockPath) {
  let raw;
  try {
    raw = readFileSync(lockPath, 'utf-8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
  const text = raw.trim();
  return /^[1-9][0-9]*$/.test(text) ? Number(text) : Number.NaN;
}

/** Create the lock holding `pid`; `false` if a lock already exists. */
function tryCreate(lockPath, pid) {
  const temp = `${lockPath}.${pid}.tmp`;
  writeFileSync(temp, `${pid}\n`);
  try {
    linkSync(temp, lockPath);
    return true;
  } catch (err) {
    if (err.code === 'EEXIST') return false;
    throw err;
  } finally {
    rmSync(temp, { force: true });
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Delete the lock if it is still stale, holding `<lock>.break` while doing so. Returns `false`, having
 * done nothing, if another run holds the break lock.
 *
 * Why a mutex: a run reads the stale pid, then deletes the lock. Without exclusion, a second run
 * could do its read, a third could break the lock and create its own, and the second's delete would
 * then remove that fresh lock, leaving two holders (task-146's review measured it: 4 of 80 trials of
 * 4 simultaneous takers). Under the break lock the lock can change only through its owner's release,
 * and a stale lock's owner is dead, so what is read is still what is deleted. A run killed while
 * holding the break lock (a window of a few system calls) leaves it behind. The other runs then wait
 * and refuse, naming it, rather than guess.
 */
function breakStale(lockPath, pid, isAlive) {
  const breakPath = `${lockPath}.break`;
  if (!tryCreate(breakPath, pid)) return false;
  try {
    const holder = readHolder(lockPath);
    if (holder !== null && holder !== pid && (Number.isNaN(holder) || !isAlive(holder))) {
      try {
        unlinkSync(lockPath);
      } catch (err) {
        if (err.code !== 'ENOENT') throw err;
      }
    }
  } finally {
    releaseDistLock({ lockPath: breakPath, pid });
  }
  return true;
}

/**
 * Take the lock for `pid`, waiting up to `waitMs` for a live holder to release it.
 * Rejects, without touching anything, if the holder still has it when the wait ends.
 */
async function acquireDistLock({
  lockPath,
  pid = process.pid,
  waitMs = DEFAULT_WAIT_MS,
  pollMs = DEFAULT_POLL_MS,
  log = defaultLog,
  isAlive = isPidAlive,
}) {
  let waited = 0;
  let announced = false;
  for (;;) {
    if (tryCreate(lockPath, pid)) return;
    const holder = readHolder(lockPath);
    if (holder === null) continue; // released between the two calls
    if (holder === pid) return; // already ours (a watch-mode re-run)
    if (Number.isNaN(holder) || !isAlive(holder)) {
      // Left by a run killed before its teardown. Broken only under the break lock (see breakStale).
      if (breakStale(lockPath, pid, isAlive)) continue;
      if (waited >= waitMs) {
        throw new Error(
          `jest globalSetup: the stale dist/ lock ${lockPath} (pid ${holder}, not running) is being broken by another run, ` +
            `which still holds ${lockPath}.break after ${waitMs} ms. Remove ${lockPath}.break if no jest run is starting (bug-095).`,
        );
      }
      await sleep(pollMs);
      waited += pollMs;
      continue;
    }
    if (waited >= waitMs) {
      throw new Error(
        `jest globalSetup: dist/ is in use by another jest run in this worktree (pid ${holder}, lock ${lockPath}). ` +
          `Waited ${waitMs} ms; refusing to delete and rebuild the dist/ that run is using (bug-095). ` +
          `Re-run when it has finished, or remove the lock if pid ${holder} is not a jest run.`,
      );
    }
    if (!announced) {
      log(`jest globalSetup: dist/ is in use by another jest run in this worktree (pid ${holder}, lock ${lockPath}); waiting for it to finish.`);
      announced = true;
    }
    await sleep(pollMs);
    waited += pollMs;
  }
}

/** Remove the lock if `pid` holds it. Returns whether it did. */
function releaseDistLock({ lockPath, pid = process.pid }) {
  if (readHolder(lockPath) !== pid) return false;
  try {
    unlinkSync(lockPath);
    return true;
  } catch (err) {
    if (err.code === 'ENOENT') return false;
    throw err;
  }
}

/**
 * The error a setup fails with when `path` cannot be removed or replaced (`action`): the path, the
 * code and the original message, and, for a permission error, the likely cause and the remedy
 * (bug-066). Its `stack` is the message alone, so jest prints the diagnostic and not a raw trace;
 * the original error is its `cause`.
 */
function fsDiagnostic(action, path, cause) {
  const code = cause && cause.code ? cause.code : 'error';
  const original = cause && cause.message ? cause.message : String(cause);
  let message = `jest globalSetup: cannot ${action} ${path} (${code}: ${original}).`;
  if (code === 'EACCES' || code === 'EPERM') {
    message +=
      ' It is probably owned by another user: a container run as root leaves it so (bug-066).' +
      ` Remove it (sudo rm -rf ${path}) or take it back (sudo chown -R "$(id -u):$(id -g)" ${path}), then re-run.`;
  }
  const err = new Error(message, { cause });
  err.stack = message;
  return err;
}

/** Remove `path` recursively, failing with {@link fsDiagnostic} rather than a raw fs error. */
function removeOrFail(path) {
  try {
    rmSync(path, { recursive: true, force: true });
  } catch (err) {
    throw fsDiagnostic('remove', path, err);
  }
}

/**
 * Take the lock, build into the staging directory, then swap the finished build onto `dist/` and
 * remove the previous one. The lock stays held.
 *
 * @param {{ repoRoot: string, build: (outDir: string) => void }} options - `build` writes the whole
 *   build into `outDir`, which does not exist on entry; the remaining options go to {@link acquireDistLock}.
 */
async function prepareDist({ repoRoot, build, ...lockOptions }) {
  await acquireDistLock({ lockPath: distLockPath(repoRoot), ...lockOptions });
  const dist = join(repoRoot, 'dist');
  const staging = distStagingPath(repoRoot);
  const previous = distPreviousPath(repoRoot);

  // (1) The leftovers of a run killed before it finished.
  removeOrFail(staging);
  removeOrFail(previous);

  // (2) The build, into the staging directory; dist/ is untouched whatever happens here.
  try {
    build(staging);
  } catch (err) {
    try {
      rmSync(staging, { recursive: true, force: true });
    } catch {
      // Best effort: the next run removes it in step (1), and the build's own error is what matters.
    }
    throw err;
  }
  if (!existsSync(staging)) {
    throw new Error(`jest globalSetup: the build wrote nothing to ${staging}; dist/ is left as it was.`);
  }

  // (3) The swap: dist/ is absent only between the two renames.
  const hadDist = existsSync(dist);
  if (hadDist) {
    try {
      renameSync(dist, previous);
    } catch (err) {
      throw fsDiagnostic('replace', dist, err);
    }
  }
  try {
    renameSync(staging, dist);
  } catch (err) {
    if (hadDist) {
      try {
        renameSync(previous, dist);
      } catch {
        // dist/ stays at the previous path; the diagnostic below names the directory to act on.
      }
    }
    throw fsDiagnostic('replace', dist, err);
  }

  // (4) The previous build. Failing here fails the setup although dist/ is fresh (design gate D2):
  // the leftover would block the next run's step (1) with the same message anyway.
  if (hadDist) removeOrFail(previous);
}

module.exports = {
  acquireDistLock,
  distLockPath,
  distPreviousPath,
  distStagingPath,
  isPidAlive,
  prepareDist,
  releaseDistLock,
};
