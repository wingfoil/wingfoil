/**
 * task-335 AC 5 (red-first) — `--timeout`'s time bound, in process and with no wall clock (`spec-016` §3.3 steps
 * 15 and 18, §3.7 `TIMED_OUT`; `dl-181` Q4 (a); approver ruling D5 (a)): `LaunchHost.timer` is injected as a
 * recorder whose `fire` the test calls, and the agent is a `FakeChild` (`./helpers/fake-child.ts`) that answers
 * `SIGTERM` as each case declares.
 *
 * - (i) it exits on `SIGTERM` → recorded `exit_status: 'signal:SIGTERM'`, `IO` `agent timed out after 5m; run
 *   <id> recorded`, `details.timeout === '5m'`;
 * - (ii) it ignores `SIGTERM` → the grace timer, `TIMEOUT_GRACE_MS` (10 000 ms), fires `SIGKILL`, recorded
 *   `exit_status: 'signal:SIGKILL'`;
 * - (iii) it traps `SIGTERM` and exits `0` → the same timeout error, `exit_status: 0`;
 * - (iv) it exits before expiry → the bound's timer is cancelled, no grace timer is armed, the outcome is as
 *   without `--timeout`.
 * Either launch kind takes the bound (§3.1); (i) runs on both.
 */
import { launchAgent, type AdapterManifest, type LaunchInput } from '../../src/agent';
import { TIMEOUT_GRACE_MS } from '../../src/agent/launch';
import type { CoreResult } from '../../src/core/types';
import { withNoticeSink, withWarningSink } from '../../src/validation/warning';
import { removeTempDir } from '../storage/helpers/git-fixture';
import { FakeChild, settle, spawnInto, tick, type SignalAnswer } from './helpers/fake-child';
import { launchFixture } from './helpers/launch-input';

const repos: string[] = [];
afterAll(() => {
  for (const repo of repos) removeTempDir(repo);
});

/** One armed timer: its delay, the callback the test fires, and whether the launch cancelled it. */
interface Armed {
  readonly delayMs: number;
  readonly fire: () => void;
  cancelled: boolean;
}

/** A `LaunchHost.timer` that arms nothing real: it records each timer and hands back its cancel function. */
function recorder(): { timer: (delayMs: number, fire: () => void) => () => void; armed: Armed[] } {
  const armed: Armed[] = [];
  return {
    armed,
    timer: (delayMs, fire) => {
      const entry: Armed = { delayMs, fire, cancelled: false };
      armed.push(entry);
      return () => {
        entry.cancelled = true;
      };
    },
  };
}

function withHeadless(manifest: AdapterManifest): AdapterManifest {
  return { ...manifest, launch: { ...manifest.launch, headless: { args: ['scripts/agent-ok.cjs'], output: 'none' } } } as AdapterManifest;
}

/** Launch a `FakeChild` answering `SIGTERM` with `answer`, bounded by 5m, the timers recorded. */
function bounded(answer: SignalAnswer, kind: 'interactive' | 'headless' = 'headless') {
  const { root, input } = launchFixture(withHeadless);
  repos.push(root);
  const child = new FakeChild({ SIGTERM: answer });
  const { spawn } = spawnInto(child);
  const { timer, armed } = recorder();
  const boundedInput: LaunchInput = { ...input, kind, timeout: { ms: 300000, label: '5m' } };
  const run: Promise<CoreResult<unknown>> = withNoticeSink(
    () => undefined,
    () => withWarningSink(() => undefined, () => launchAgent(root, boundedInput, { spawn, timer }, () => undefined)),
  );
  return { input: boundedInput, child, armed, run };
}

const timedOut = (runId: string): string => `agent timed out after 5m; run ${runId} recorded`;

describe('task-335 AC 5 — the time bound (spec-016 §3.3 step 15, §3.7 TIMED_OUT)', () => {
  it('the grace period is 10 s (D5 (a))', () => {
    expect(TIMEOUT_GRACE_MS).toBe(10000);
  });

  it.each<'headless' | 'interactive'>(['headless', 'interactive'])('(i) %s: at expiry SIGTERM; an agent it ends is recorded signal:SIGTERM, and the run is IO "agent timed out after 5m"', async (kind) => {
    const { input, child, armed, run } = bounded('exit', kind);
    await tick();
    const delays = armed.map((entry) => entry.delayMs);
    armed[0]?.fire();
    await tick();
    const killed = [...child.killed];
    const outcome = await settle(child, run);
    expect(delays).toEqual([300000]);
    expect(killed).toEqual(['SIGTERM']);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error).toMatchObject({ code: 'IO', message: timedOut(input.runId), details: { run_id: input.runId, exit_status: 'signal:SIGTERM', timeout: '5m' } });
    expect(armed.every((entry) => entry.cancelled)).toBe(true);
  }, 60000);

  it('(ii) an agent that ignores SIGTERM gets SIGKILL when the grace timer fires; recorded signal:SIGKILL', async () => {
    const { input, child, armed, run } = bounded('ignore');
    await tick();
    armed[0]?.fire();
    await tick();
    const grace = armed[1];
    grace?.fire();
    await tick();
    const killed = [...child.killed];
    const outcome = await settle(child, run);
    expect(grace?.delayMs).toBe(TIMEOUT_GRACE_MS);
    expect(killed).toEqual(['SIGTERM', 'SIGKILL']);
    expect(outcome.ok ? 'ok' : outcome.error).toMatchObject({ code: 'IO', message: timedOut(input.runId), details: { exit_status: 'signal:SIGKILL', timeout: '5m' } });
  }, 60000);

  it('(iii) an agent that traps SIGTERM and exits 0: still the timeout error, exit_status 0 recorded', async () => {
    const { input, child, armed, run } = bounded(0);
    await tick();
    armed[0]?.fire();
    await tick();
    const outcome = await settle(child, run);
    expect(outcome.ok ? 'ok' : outcome.error).toMatchObject({ code: 'IO', message: timedOut(input.runId), details: { exit_status: 0, timeout: '5m' } });
    expect(armed[1]?.cancelled).toBe(true);
  }, 60000);

  it('(iv) an agent that exits before expiry: the bound is cancelled, no grace timer, success as without --timeout', async () => {
    const { child, armed, run } = bounded('exit');
    await tick();
    child.finish(0);
    const outcome = await run;
    expect(armed.map((entry) => [entry.delayMs, entry.cancelled])).toEqual([[300000, true]]);
    expect(child.killed).toEqual([]);
    expect(outcome.ok).toBe(true);
  }, 60000);
});
