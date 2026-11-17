/**
 * task-355 AC 5 (red-first, `bug-516`; `spec-016` §3.3 step 15; approver ruling D2 (a)) — no process a
 * timed-out or signalled headless agent started survives `agent execute`.
 *
 * A headless agent has a process group of its own (task-335, D6 (a)). The fake adapter's agent starts a child
 * that only waits (`WINGFOIL_FAKE_AGENT_CHILD`: stdio ignored, not detached, so in the agent's group) and writes
 * its pid; `WINGFOIL_FAKE_AGENT_CHILD_TRAP=1` makes that child ignore `SIGTERM`. On the compiled CLI:
 *
 * - `--headless --timeout 1s`, the agent waiting for a signal → exit `1`, `agent timed out after 1s`, the child
 *   dead (the bound's `SIGTERM` reached the group);
 * - the same with the trap → the child dead (only the sweep's `SIGKILL` after the agent's exit ends it);
 * - `--headless`, `agent execute` spawned detached and sent `SIGTERM` once the child exists → exit `1`,
 *   `agent exited signal:SIGTERM`, the child dead.
 *
 * Dead: within 5 s of polling, `process.kill(pid, 0)` fails with `ESRCH`, or `/proc/<pid>/stat` says `Z`. No
 * assertion is made on any duration. POSIX only; only the fake adapter is launched. A child seen alive by an
 * assertion is ended by `afterEach` with `SIGKILL` (its pid read from the file the fake wrote, never a pattern),
 * and an `agent execute` a failed test left running is ended through its own group.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { removeTempDir } from '../storage/helpers/git-fixture';
import { seed, TASK_ID, TASK_REF } from '../agent/helpers/agent-execute-fixture';
import { errorLine, execute, removeRunScratch } from './helpers/agent-execute-cli';
import { spawnCliLive, type LiveCliRun } from './helpers/spawn-cli';

const POSIX = process.platform !== 'win32';
const RUN_1 = `${TASK_ID}/adhoc/1`;

const repos: string[] = [];
const scratch: string[] = [];
const survivors: number[] = [];
let running: LiveCliRun | undefined;

afterEach(async () => {
  // A child an assertion just saw alive: the pid the fake wrote for the child it started.
  for (const pid of survivors.splice(0)) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // already gone
    }
  }
  const live = running;
  running = undefined;
  if (live === undefined || live.child.exitCode !== null || live.child.signalCode !== null) return;
  live.child.kill('SIGTERM');
  const ended = await Promise.race([live.closed.then(() => true), pause(10000).then(() => false)]);
  if (!ended) process.kill(-live.child.pid!, 'SIGKILL');
});

afterAll(() => {
  removeRunScratch();
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
  for (const repo of repos) removeTempDir(repo);
});

const pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function scratchDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'wf-355-pg-'));
  scratch.push(dir);
  return dir;
}

function fixture(): string {
  const repo = seed();
  repos.push(repo);
  return repo;
}

/** The pid the fake wrote for its child. */
function childPid(pidFile: string): number {
  const pid = Number(readFileSync(pidFile, 'utf-8').trim());
  if (!Number.isInteger(pid) || pid <= 0) throw new Error(`no child pid in ${pidFile}`);
  return pid;
}

/** Whether `pid` no longer runs: no such process, or a zombie waiting to be reaped. */
function gone(pid: number): boolean {
  try {
    process.kill(pid, 0);
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ESRCH';
  }
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf-8');
    return stat.slice(stat.lastIndexOf(')') + 2, stat.lastIndexOf(')') + 3) === 'Z';
  } catch {
    return false;
  }
}

/** Whether `pid` is gone within 5 s; a pid still running is handed to `afterEach`. */
async function deadWithin5s(pid: number): Promise<boolean> {
  for (let waited = 0; waited < 5000; waited += 100) {
    if (gone(pid)) return true;
    await pause(100);
  }
  if (gone(pid)) return true;
  survivors.push(pid);
  return false;
}

describe('task-355 AC 5 — no child of a timed-out or signalled headless agent survives agent execute (bug-516, spec-016 §3.3 step 15)', () => {
  (POSIX ? it : it.skip)('--timeout 1s: the bound reaches the whole group, the child is dead', async () => {
    const pidFile = join(scratchDir(), 'child.pid');
    const run = execute(fixture(), ['--element', TASK_REF, '--role', 'developer', '--headless', '--timeout', '1s'], {
      WINGFOIL_FAKE_AGENT_WAIT: 'signal',
      WINGFOIL_FAKE_AGENT_CHILD: pidFile,
    });
    const pid = childPid(pidFile);
    const dead = await deadWithin5s(pid);
    expect(run.status).toBe(1);
    expect(errorLine(run.stderr)).toBe(`error: agent timed out after 1s; run ${RUN_1} recorded`);
    expect(dead).toBe(true);
  }, 120000);

  (POSIX ? it : it.skip)('--timeout 1s, a child that ignores SIGTERM: the sweep after the agent exits kills it', async () => {
    const pidFile = join(scratchDir(), 'child.pid');
    const run = execute(fixture(), ['--element', TASK_REF, '--role', 'developer', '--headless', '--timeout', '1s'], {
      WINGFOIL_FAKE_AGENT_WAIT: 'signal',
      WINGFOIL_FAKE_AGENT_CHILD: pidFile,
      WINGFOIL_FAKE_AGENT_CHILD_TRAP: '1',
    });
    const pid = childPid(pidFile);
    const dead = await deadWithin5s(pid);
    expect(run.status).toBe(1);
    expect(errorLine(run.stderr)).toBe(`error: agent timed out after 1s; run ${RUN_1} recorded`);
    expect(dead).toBe(true);
  }, 120000);

  (POSIX ? it : it.skip)('SIGTERM to agent execute: forwarded to the whole group, the child is dead', async () => {
    const repo = fixture();
    const dir = scratchDir();
    const tmp = join(dir, 'tmp');
    mkdirSync(tmp);
    const pidFile = join(dir, 'child.pid');
    const recordFile = join(dir, 'fake.jsonl');
    const inherited = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^(GIT_(AUTHOR|COMMITTER)_|WINGFOIL_FAKE_AGENT_)/.test(name)));
    const env = {
      ...inherited,
      TMPDIR: tmp,
      TMP: tmp,
      TEMP: tmp,
      WINGFOIL_FAKE_AGENT_RECORD: recordFile,
      WINGFOIL_FAKE_AGENT_WAIT: 'signal',
      WINGFOIL_FAKE_AGENT_CHILD: pidFile,
    };
    const live = spawnCliLive(repo, ['agent', 'execute', '--element', TASK_REF, '--role', 'developer', '--headless'], { env, detached: true });
    running = live;
    // The launch's record line follows the child's pid file: once it exists, the child runs. task-337 (`spec-016` §2.6
    // as amended at `2d193b318`): version_args runs before the launch, so the first record line may be `--version`.
    const launched = (): boolean =>
      existsSync(recordFile) &&
      readFileSync(recordFile, 'utf-8')
        .split('\n')
        .some((line) => line.startsWith('{"argv":[') && !line.startsWith('{"argv":["--version"]'));
    for (let waited = 0; waited < 30000 && !launched(); waited += 50) await pause(50);
    if (!launched()) throw new Error('the fake never recorded its launch');
    const pid = childPid(pidFile);
    process.kill(live.child.pid!, 'SIGTERM');
    const outcome = await live.closed;
    const dead = await deadWithin5s(pid);
    expect({ code: outcome.code, signal: outcome.signal }).toEqual({ code: 1, signal: null });
    expect(errorLine(outcome.stderr)).toBe(`error: agent exited signal:SIGTERM; run ${RUN_1} recorded`);
    expect(dead).toBe(true);
  }, 120000);
});
