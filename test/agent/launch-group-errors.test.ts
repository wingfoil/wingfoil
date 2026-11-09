/**
 * task-355 refactor (`bug-516`; `spec-016` §3.3 steps 15 and 18) — a process-group delivery that fails never
 * replaces the run's outcome.
 *
 * Step 18 decides the outcome from the agent's exit, the time bound and the record alone, and step 15 says no
 * signal can end `agent execute` without a record. So when `LaunchHost.signalGroup` throws something other
 * than the swallowed `ESRCH` (here `EPERM`), on the forwarded signal or on the sweep's `SIGKILL`, the launch
 * prints one `warning:` line per failed delivery and returns the outcome it would have returned otherwise.
 *
 * Deterministic: a `FakeChild` (pid 4242), signals raised with `process.emit`, no real process group.
 */
import { launchAgent, type AdapterManifest, type LaunchInput } from '../../src/agent';
import type { CoreResult } from '../../src/core/types';
import { withNoticeSink, withWarningSink } from '../../src/validation/warning';
import { removeTempDir } from '../storage/helpers/git-fixture';
import { FakeChild, settle, spawnInto, tick } from './helpers/fake-child';
import { launchFixture } from './helpers/launch-input';

const repos: string[] = [];
afterAll(() => {
  for (const repo of repos) removeTempDir(repo);
});

const POSIX = process.platform !== 'win32';

/** An `EPERM` error as `process.kill` throws it. */
function eperm(): NodeJS.ErrnoException {
  return Object.assign(new Error('kill EPERM'), { code: 'EPERM', errno: -1, syscall: 'kill' });
}

/** A headless launch of `child`, `signalGroup` failing for the signals in `failing`, the warnings collected. */
function launch(child: FakeChild, failing: readonly NodeJS.Signals[]) {
  const { root, input } = launchFixture((manifest: AdapterManifest) =>
    ({ ...manifest, launch: { ...manifest.launch, headless: { args: ['scripts/agent-ok.cjs', '--work'], output: 'none' } } }) as AdapterManifest,
  );
  repos.push(root);
  const headless: LaunchInput = { ...input, kind: 'headless' };
  const { spawn } = spawnInto(child);
  const calls: [number, NodeJS.Signals][] = [];
  const signalGroup = (pgid: number, signal: NodeJS.Signals): void => {
    calls.push([pgid, signal]);
    if (failing.includes(signal)) throw eperm();
    if (child.running) child.kill(signal);
  };
  const warnings: string[] = [];
  const run: Promise<CoreResult<unknown>> = withNoticeSink(
    () => undefined,
    () =>
      withWarningSink(
        (warning) => warnings.push(warning),
        () => launchAgent(root, headless, { spawn, signalGroup }, () => undefined),
      ),
  );
  return { input: headless, calls, warnings, run };
}

describe("task-355 — a failed process-group delivery is a warning, never the run's outcome (bug-516, spec-016 §3.3 steps 15, 18)", () => {
  (POSIX ? it : it.skip)("the sweep's SIGKILL fails with EPERM: one warning, the outcome is the agent's", async () => {
    const child = new FakeChild({}, 4242);
    const { input, calls, warnings, run } = launch(child, ['SIGKILL']);
    await tick();
    process.emit('SIGTERM', 'SIGTERM');
    await tick();
    const outcome = await settle(child, run);
    expect(calls).toEqual([
      [4242, 'SIGTERM'],
      [4242, 'SIGKILL'],
    ]);
    expect(warnings).toEqual(["could not send SIGKILL to the agent's process group 4242: kill EPERM"]);
    expect(outcome.ok ? 'ok' : outcome.error.message).toBe(`agent exited signal:SIGTERM; run ${input.runId} recorded`);
  }, 60000);

  (POSIX ? it : it.skip)('the forwarded SIGTERM fails with EPERM: one warning, no throw out of the listener, the run still recorded', async () => {
    const child = new FakeChild({}, 4242);
    const { input, calls, warnings, run } = launch(child, ['SIGTERM']);
    await tick();
    expect(() => process.emit('SIGTERM', 'SIGTERM')).not.toThrow();
    await tick();
    child.finish(3);
    const outcome = await run;
    // The delivery failed, so the agent exited by itself; the sweep still runs, since a delivery was attempted.
    expect(calls).toEqual([
      [4242, 'SIGTERM'],
      [4242, 'SIGKILL'],
    ]);
    expect(warnings).toEqual(["could not send SIGTERM to the agent's process group 4242: kill EPERM"]);
    expect(outcome.ok ? 'ok' : outcome.error.message).toBe(`agent exited 3; run ${input.runId} recorded`);
  }, 60000);
});
