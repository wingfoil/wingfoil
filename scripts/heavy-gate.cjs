#!/usr/bin/env node
/**
 * One heavy test gate at a time per machine (`dl-170` Decisions 1–4, Q1 (a), Q2 (C);
 * `task-349-cap-the-heavy-test-gates-across-worktrees-with-one-machine-wide-lock-and-a-load-threshold-dl-170`).
 *
 * A heavy gate is the full test suite (`npm test` with no suite filter), the coverage run (`npm run test:coverage`,
 * `npm run test:report`) and the production type-check or build (`npm run typecheck`, `npm run build`). Several
 * worktrees running them at once overload the machine, and the wall-clock assertions of every one of them then fail
 * for reasons that are not regressions. So each heavy gate takes one machine-wide lock first:
 *
 * - The lock lives outside every worktree, in `<os.tmpdir()>/wingfoil-heavy-gate-<uid>/heavy-gate.lock`
 *   (`WINGFOIL_GATE_DIR` overrides the directory): one per machine user, emptied by a reboot, so a pid recorded
 *   before a reboot is never taken for a live one. It holds one JSON line, `{"pid","worktree","gate","start"}`, and
 *   no secret.
 * - The cap is one holder (Q1 (a)). A gate waits while the lock is held by a live pid and, unless `CI=true`, while
 *   the 1-minute load average is above the number of cores (Decision 3; approver ruling D3 (b): a CI runner skips the
 *   load wait, never the lock). It says so once on stderr, naming the holder's pid and worktree, and waits with no
 *   time limit.
 * - A lock whose pid is not running, or whose content is not a lock record, was left by a gate killed before its
 *   release: it is taken over, under `<lock>.break` so that two takers cannot both end up holding it (the algorithm
 *   of `test/dist-lock.cjs`, `bug-095`), with one stderr line.
 * - The lock is created atomically: the content is written to a private file, then hard-linked onto the lock path,
 *   and a link onto an existing path fails. A release removes the lock only when it records the releaser's pid.
 * - A gate started inside a gate is nested: the holder hands its children `WINGFOIL_GATE_HOLDER=<its pid>`, and a gate
 *   whose `WINGFOIL_GATE_HOLDER` names the live pid the lock records returns at once, writing nothing — so the jest
 *   global setup's build inside `npm test`, or a `npm run build` a suite spawns, never waits on its own lock.
 *
 * Every hold leaves a trace a later reader can check (AC 3, the format `task-344` reads):
 * `<dir>/heavy-gate.trace.jsonl`, append-only, one JSON record per line — `acquire`
 * `{v, event, gate, pid, worktree, start, waited_ms}`, `release` `{v, event, gate, pid, worktree, start, end, status}`
 * and `takeover` `{v, event, gate, pid, worktree, at, stale: {pid, worktree, gate, start}}` — with no environment,
 * no argument vector and no secret. A record that cannot be written is reported once on stderr; the gate goes on.
 *
 * Determinism: the lock changes when a gate runs, never what it computes; the clock, the load, the cores, the
 * liveness check, the sleep and the log are injectable, and the tests inject all of them.
 *
 * Usage: node scripts/heavy-gate.cjs <test|coverage|build|typecheck> -- <command> [args…]
 * The command runs under the lock, with `WINGFOIL_GATE_HOLDER` in its environment, and the script exits with its
 * status (1 when it ended on a signal, saying so on stderr). A missing gate name or `--` is a usage error, exit 2.
 */
'use strict';

const { spawnSync } = require('node:child_process');
const { appendFileSync, linkSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } = require('node:fs');
const os = require('node:os');
const { join, resolve } = require('node:path');

/** The environment variable that overrides the gate directory (D5). */
const GATE_DIR_ENV = 'WINGFOIL_GATE_DIR';

/** The environment variable a holder hands every process it starts: the holder's pid. */
const GATE_HOLDER_ENV = 'WINGFOIL_GATE_HOLDER';

/** The gate names the CLI accepts. */
const GATE_NAMES = ['test', 'coverage', 'build', 'typecheck'];

/** The trace format's version, the first key of every record. */
const TRACE_VERSION = 1;

const DEFAULT_POLL_MS = 2000;

/**
 * The machine-wide gate directory.
 *
 * @param {Readonly<Record<string, string | undefined>>} env
 * @param {{ tmpdir?: string, uid?: number }} [options]
 * @returns {string}
 */
function gateDir(env, { tmpdir = os.tmpdir(), uid = process.getuid() } = {}) {
  const override = env[GATE_DIR_ENV];
  if (override !== undefined && override !== '') return override;
  return join(tmpdir, `wingfoil-heavy-gate-${uid}`);
}

/** @param {string} dir @returns {string} */
function gateLockPath(dir) {
  return join(dir, 'heavy-gate.lock');
}

/** @param {string} dir @returns {string} */
function gateTracePath(dir) {
  return join(dir, 'heavy-gate.trace.jsonl');
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

function defaultSleep(ms) {
  return new Promise((done) => setTimeout(done, ms));
}

/**
 * The lock's record: `null` when there is no lock, `{ valid: false }` when its content is not a lock record, else
 * `{ valid: true, pid, worktree, gate, start }`.
 */
function readLock(lockPath) {
  let raw;
  try {
    raw = readFileSync(lockPath, 'utf-8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw.trim());
  } catch {
    return { valid: false };
  }
  if (parsed === null || typeof parsed !== 'object' || !Number.isInteger(parsed.pid) || parsed.pid <= 0) {
    return { valid: false };
  }
  return { valid: true, pid: parsed.pid, worktree: parsed.worktree, gate: parsed.gate, start: parsed.start };
}

/** Create `path` holding `content`, atomically; `false` when it already exists. */
function tryCreate(path, content, pid) {
  const temp = `${path}.${pid}.tmp`;
  writeFileSync(temp, content);
  try {
    linkSync(temp, path);
    return true;
  } catch (err) {
    if (err.code === 'EEXIST') return false;
    throw err;
  } finally {
    rmSync(temp, { force: true });
  }
}

/** Remove `path` when it exists. */
function unlinkIfPresent(path) {
  try {
    unlinkSync(path);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

/**
 * A trace writer that reports its first failure on `log` and is silent after it: a broken trace never blocks a gate.
 */
function traceWriter(dir, gate, log) {
  let reported = false;
  return (record) => {
    try {
      appendFileSync(gateTracePath(dir), `${JSON.stringify(record)}\n`);
    } catch (err) {
      if (reported) return;
      reported = true;
      log(`heavy gate ${gate}: cannot write the trace ${gateTracePath(dir)} (${err.code ?? err.message}); the gate goes on (dl-170).`);
    }
  };
}

/** The pid a break lock records, or `null` when it is gone or its content is not a pid record. */
function readBreakHolder(breakPath) {
  let raw;
  try {
    raw = readFileSync(breakPath, 'utf-8');
  } catch (err) {
    if (err.code === 'ENOENT') return { gone: true };
    throw err;
  }
  try {
    const parsed = JSON.parse(raw.trim());
    if (parsed !== null && typeof parsed === 'object' && Number.isInteger(parsed.pid) && parsed.pid > 0) {
      return { gone: false, pid: parsed.pid, raw };
    }
  } catch {
    // not a record: treated as left by a dead process
  }
  return { gone: false, pid: null, raw };
}

/**
 * Delete the lock if it is still stale, holding `<lock>.break` while doing so. Returns `{ removed }`, the stale
 * record it removed; `{ blockedBy }`, the live pid holding the break lock; or `{}` when it removed nothing (the lock
 * or the break lock changed meanwhile, or a break lock left by a dead process was removed: the caller polls again).
 *
 * A break lock is held for a few system calls. One whose pid is not running (or whose content is not a pid record)
 * was left by a process killed inside that window and is removed, so it cannot hold every gate on the machine
 * forever; one whose pid is running is named in the wait line, with what to do if no gate is starting.
 */
function breakStale(lockPath, pid, isAlive, onBreakRemoved) {
  const breakPath = `${lockPath}.break`;
  if (!tryCreate(breakPath, `${JSON.stringify({ pid })}\n`, pid)) {
    const breaker = readBreakHolder(breakPath);
    if (breaker.gone) return {};
    if (breaker.pid !== null && isAlive(breaker.pid)) return { blockedBy: breaker.pid };
    // Re-read just before removing, so a break lock recreated meanwhile by a live taker is not removed.
    let now;
    try {
      now = readFileSync(breakPath, 'utf-8');
    } catch (err) {
      if (err.code === 'ENOENT') return {};
      throw err;
    }
    if (now !== breaker.raw) return {};
    unlinkIfPresent(breakPath);
    onBreakRemoved(breaker.pid);
    return {};
  }
  try {
    const held = readLock(lockPath);
    if (held === null || (held.valid && isAlive(held.pid))) return {};
    unlinkIfPresent(lockPath);
    return { removed: held };
  } finally {
    unlinkIfPresent(breakPath);
  }
}

/** Whether `env` names the live holder of the lock at `lockPath` (a gate inside a gate). */
function isNested(env, lockPath, isAlive) {
  const named = env[GATE_HOLDER_ENV];
  if (named === undefined || !/^[1-9][0-9]*$/.test(named)) return false;
  const held = readLock(lockPath);
  return held !== null && held.valid && held.pid === Number(named) && isAlive(held.pid);
}

/**
 * Take the machine-wide lock (see the module comment).
 *
 * @param {import('./heavy-gate.d.cts').HeavyGateOptions} options
 * @returns {Promise<{ nested: boolean }>}
 */
async function acquireHeavyGate({
  dir,
  gate,
  worktree,
  pid = process.pid,
  env = process.env,
  loadavg = os.loadavg,
  cpus = () => os.cpus().length,
  isAlive = isPidAlive,
  now = Date.now,
  sleep = defaultSleep,
  log = defaultLog,
  pollMs = DEFAULT_POLL_MS,
}) {
  mkdirSync(dir, { recursive: true, mode: 0o700 }); // one per user: nobody else writes the lock or the trace
  const lockPath = gateLockPath(dir);
  if (isNested(env, lockPath, isAlive)) return { nested: true };

  const trace = traceWriter(dir, gate, log);
  const waitForLoad = env.CI !== 'true';
  const startedAt = now();
  let announced = false;
  for (;;) {
    const load = loadavg()[0];
    const cores = cpus();
    const loadHigh = waitForLoad && load > cores;
    const reasons = [];
    if (!loadHigh) {
      const at = now();
      const start = new Date(at).toISOString();
      const record = { pid, worktree, gate, start };
      if (tryCreate(lockPath, `${JSON.stringify(record)}\n`, pid)) {
        trace({ v: TRACE_VERSION, event: 'acquire', gate, pid, worktree, start, waited_ms: Math.max(0, at - startedAt) });
        return { nested: false };
      }
    }
    const held = readLock(lockPath);
    if (held !== null && (!held.valid || !isAlive(held.pid))) {
      // Left by a gate killed before its release: taken over, but only under the break lock.
      const breakPath = `${lockPath}.break`;
      let removedBreak = false;
      const broken = breakStale(lockPath, pid, isAlive, (breakerPid) => {
        removedBreak = true;
        log(
          breakerPid === null
            ? `heavy gate ${gate}: removed the break lock ${breakPath}, whose content is not a pid record (dl-170).`
            : `heavy gate ${gate}: removed the break lock ${breakPath} left by pid ${breakerPid}, which is not running (dl-170).`,
        );
      });
      if (removedBreak) continue; // a break lock left by a dead process: try the takeover again at once
      const stale = broken.removed ?? null;
      if (broken.blockedBy !== undefined) {
        reasons.push(
          `the break lock ${breakPath}, held by pid ${broken.blockedBy} while it takes over the lock left by ` +
            (held.valid ? `pid ${held.pid}` : 'an unreadable record') +
            ` (remove ${breakPath} if no heavy gate is starting)`,
        );
      } else if (stale !== null) {
        const takenAt = new Date(now()).toISOString();
        log(
          stale.valid
            ? `heavy gate ${gate}: took over the lock ${lockPath} left by pid ${stale.pid} in ${stale.worktree}, which is not running (dl-170).`
            : `heavy gate ${gate}: took over the lock ${lockPath}, whose content is not a lock record (dl-170).`,
        );
        trace({
          v: TRACE_VERSION,
          event: 'takeover',
          gate,
          pid,
          worktree,
          at: takenAt,
          stale: stale.valid
            ? { pid: stale.pid, worktree: stale.worktree, gate: stale.gate, start: stale.start }
            : { pid: null, worktree: null, gate: null, start: null },
        });
        continue;
      }
    } else if (held !== null) {
      reasons.push(`the machine-wide lock ${lockPath}, held by pid ${held.pid} in ${held.worktree} since ${held.start}`);
    } else if (!loadHigh) {
      continue; // released between the create and the read
    }
    if (loadHigh) reasons.push(`the 1-minute load average ${load.toFixed(2)} to fall to the ${cores} cores`);
    if (!announced && reasons.length > 0) {
      log(`heavy gate ${gate}: waiting for ${reasons.join(' and ')} (dl-170).`);
      announced = true;
    }
    await sleep(pollMs);
  }
}

/**
 * Remove the lock if it records `pid`, and write the `release` record.
 *
 * @param {{ dir: string, pid?: number, now?: () => number, status?: number | null }} options
 * @returns {boolean} Whether the lock was removed.
 */
function releaseHeavyGate({ dir, pid = process.pid, now = Date.now, status = null }) {
  const lockPath = gateLockPath(dir);
  const held = readLock(lockPath);
  if (held === null || !held.valid || held.pid !== pid) return false;
  try {
    unlinkSync(lockPath);
  } catch (err) {
    if (err.code === 'ENOENT') return false;
    throw err;
  }
  traceWriter(dir, held.gate, defaultLog)({
    v: TRACE_VERSION,
    event: 'release',
    gate: held.gate,
    pid,
    worktree: held.worktree,
    start: held.start,
    end: new Date(now()).toISOString(),
    status,
  });
  return true;
}

/**
 * Acquire, run `run` with the environment plus `WINGFOIL_GATE_HOLDER`, release unless nested; resolves to `run`'s
 * result.
 *
 * @param {import('./heavy-gate.d.cts').HeavyGateOptions} options
 * @param {(childEnv: Record<string, string | undefined>) => number | null | Promise<number | null>} run
 * @returns {Promise<number | null>}
 */
async function withHeavyGate(options, run) {
  const env = options.env ?? process.env;
  const pid = options.pid ?? process.pid;
  const { nested } = await acquireHeavyGate(options);
  const holder = nested ? env[GATE_HOLDER_ENV] : String(pid);
  if (nested) return run({ ...env, [GATE_HOLDER_ENV]: holder });
  let status = null;
  try {
    status = await run({ ...env, [GATE_HOLDER_ENV]: holder });
    return status;
  } finally {
    releaseHeavyGate({ dir: options.dir, pid, now: options.now, status });
  }
}

const USAGE = `usage: node scripts/heavy-gate.cjs <${GATE_NAMES.join('|')}> -- <command> [args…]`;

/* istanbul ignore next -- the CLI entry point; its behaviour is pinned by spawning it (test/cli/heavy-gate.test.ts). */
async function main(argv) {
  const [gate, separator, command, ...args] = argv;
  if (!GATE_NAMES.includes(gate) || separator !== '--' || command === undefined) {
    process.stderr.write(`${USAGE}\n`);
    return 2;
  }
  const worktree = resolve(__dirname, '..');
  return withHeavyGate({ dir: gateDir(process.env), gate, worktree }, (childEnv) => {
    const run = spawnSync(command, args, { stdio: 'inherit', env: childEnv, shell: false });
    if (run.error) {
      process.stderr.write(`heavy gate ${gate}: cannot run ${command}: ${run.error.message}\n`);
      return 1;
    }
    if (run.status === null) {
      process.stderr.write(`heavy gate ${gate}: ${command} ended on signal ${run.signal}, not an exit\n`);
      return null;
    }
    return run.status;
  });
}

/* istanbul ignore next -- the CLI entry point. */
if (require.main === module) {
  main(process.argv.slice(2)).then(
    (status) => process.exit(status === null ? 1 : status),
    (err) => {
      process.stderr.write(`heavy gate: ${err && err.message ? err.message : String(err)}\n`);
      process.exit(1);
    },
  );
}

module.exports = {
  GATE_DIR_ENV,
  GATE_HOLDER_ENV,
  acquireHeavyGate,
  gateDir,
  gateLockPath,
  gateTracePath,
  releaseHeavyGate,
  withHeavyGate,
};
