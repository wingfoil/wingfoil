/**
 * task-355 AC 1 (red-first, `bug-318`; `spec-016` §2.7, §3.3 step 15; approver ruling D1 (a)) — a hang-up
 * reaches an interactive agent once.
 *
 * An interactive agent shares `agent execute`'s foreground process group, so the terminal's `SIGHUP` reaches it
 * directly; `agent execute` cannot tell that hang-up from one sent to it alone, so it never forwards one. The
 * compiled CLI is spawned `detached` (a process group of its own, standing for the terminal's foreground job)
 * with the fake adapter, the fake waiting for a signal and recording each delivery
 * (`WINGFOIL_FAKE_AGENT_SIGNALS`). The test sends `SIGHUP` to the whole group, waits until the fake has recorded
 * it, then sends `SIGTERM` to `agent execute` alone, which forwards it; the fake records it and exits `0`.
 *
 * - interactive (red-first): the fake records exactly `SIGHUP`, `SIGTERM`;
 * - headless (characterization): the agent has a process group of its own (task-335, D6 (a)), so the group's
 *   hang-up reaches it only through `agent execute`'s forwarding: `SIGHUP`, `SIGTERM` once each.
 *
 * POSIX only (process groups). Only the fake adapter is launched, never a real agent CLI. Every child is ended
 * by the test that started it; `afterEach` ends what a failed test left running, signalling only the group of
 * the `agent execute` it spawned.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { removeTempDir } from '../storage/helpers/git-fixture';
import { seed, TASK_REF } from '../agent/helpers/agent-execute-fixture';
import { spawnCliLive, type LiveCliRun } from './helpers/spawn-cli';

const POSIX = process.platform !== 'win32';

const repos: string[] = [];
const scratch: string[] = [];
let running: LiveCliRun | undefined;

afterEach(async () => {
  const live = running;
  running = undefined;
  if (live === undefined || live.child.exitCode !== null || live.child.signalCode !== null) return;
  // A test that failed mid-way: SIGTERM is forwarded to the agent; then the group of the command we spawned.
  live.child.kill('SIGTERM');
  const ended = await Promise.race([live.closed.then(() => true), pause(10000).then(() => false)]);
  if (!ended) process.kill(-live.child.pid!, 'SIGKILL');
});

afterAll(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
  for (const repo of repos) removeTempDir(repo);
});

const pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Poll `ready` every 50 ms for at most `ms`; throws, saying `what`, when it never holds. */
async function waitFor(ready: () => boolean, ms: number, what: string): Promise<void> {
  for (let waited = 0; waited < ms; waited += 50) {
    if (ready()) return;
    await pause(50);
  }
  if (!ready()) throw new Error(`timed out after ${ms} ms waiting for ${what}`);
}

/** The non-empty lines of `file`, or none when it does not exist. */
function lines(file: string): string[] {
  return existsSync(file)
    ? readFileSync(file, 'utf-8')
        .split('\n')
        .filter((line) => line !== '')
    : [];
}

/**
 * Start `agent execute --element <task> --role developer [extra…]` detached, with a private `TMPDIR`, the fake
 * waiting for a signal and recording its signals; no `GIT_AUTHOR_*`/`GIT_COMMITTER_*` or `WINGFOIL_FAKE_AGENT_*`
 * variable is inherited from the test process.
 */
function start(extra: readonly string[]): { live: LiveCliRun; recordFile: string; signalsFile: string } {
  const repo = seed();
  repos.push(repo);
  const dir = mkdtempSync(join(tmpdir(), 'wf-355-sig-'));
  scratch.push(dir);
  const tmp = join(dir, 'tmp');
  mkdirSync(tmp);
  const recordFile = join(dir, 'fake.jsonl');
  const signalsFile = join(dir, 'signals.txt');
  const inherited = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^(GIT_(AUTHOR|COMMITTER)_|WINGFOIL_FAKE_AGENT_)/.test(name)));
  const env = {
    ...inherited,
    TMPDIR: tmp,
    TMP: tmp,
    TEMP: tmp,
    WINGFOIL_FAKE_AGENT_RECORD: recordFile,
    WINGFOIL_FAKE_AGENT_WAIT: 'signal',
    WINGFOIL_FAKE_AGENT_SIGNALS: signalsFile,
  };
  const live = spawnCliLive(repo, ['agent', 'execute', '--element', TASK_REF, '--role', 'developer', ...extra], { env, detached: true });
  running = live;
  return { live, recordFile, signalsFile };
}

/** The group hang-up, then `SIGTERM` to `agent execute` alone; resolves with how it ended and what the fake recorded. */
async function hangUpThenTerminate(extra: readonly string[]): Promise<{ code: number | null; signal: NodeJS.Signals | null; stderr: string; signals: string[] }> {
  const { live, recordFile, signalsFile } = start(extra);
  const pid = live.child.pid!;
  await waitFor(() => lines(recordFile).length > 0, 30000, 'the fake to record its launch');
  process.kill(-pid, 'SIGHUP');
  await waitFor(() => lines(signalsFile).includes('SIGHUP'), 30000, 'the fake to record a SIGHUP');
  // Room for a forwarded copy to land before SIGTERM, so a second SIGHUP is recorded before it if one is sent.
  await pause(500);
  process.kill(pid, 'SIGTERM');
  const outcome = await live.closed;
  return { code: outcome.code, signal: outcome.signal, stderr: outcome.stderr, signals: lines(signalsFile) };
}

describe('task-355 AC 1 — a hang-up reaches the agent once (bug-318, spec-016 §3.3 step 15)', () => {
  (POSIX ? it : it.skip)('interactive: the group SIGHUP reaches the agent once, agent execute does not forward it; SIGTERM is forwarded', async () => {
    const run = await hangUpThenTerminate([]);
    expect(run.signals).toEqual(['SIGHUP', 'SIGTERM']);
    expect({ code: run.code, signal: run.signal }).toEqual({ code: 0, signal: null });
  }, 120000);

  (POSIX ? it : it.skip)('headless: SIGHUP and SIGTERM reach the agent once each, through agent execute (characterization)', async () => {
    const run = await hangUpThenTerminate(['--headless']);
    expect(run.signals).toEqual(['SIGHUP', 'SIGTERM']);
    expect({ code: run.code, signal: run.signal }).toEqual({ code: 0, signal: null });
  }, 120000);
});
