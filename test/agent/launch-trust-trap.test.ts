/**
 * task-353 AC 2 (developer test, green; `spec-016` §3.3 step 16, §3.7 `TIMED_OUT` and `START_UP_HINT`; `bug-500`) —
 * the case the red left unpinned: the time bound expires and the agent traps `SIGTERM` and exits `0`. The run did not
 * succeed (step 16: "the time bound expired"), so under `trust: prompt` with no commit since `state_ref` the start-up
 * hint is given with `exit_status` `0`, and the outcome stays `TIMED_OUT`'s error. Beside it, the same trap under
 * `trust: implied` gives no hint (dl-097 (a)). In process, with the injected timer and a `FakeChild` that answers
 * `SIGTERM` with exit `0` (`./helpers/fake-child.ts`), no wall clock.
 */
import { launchAgent, START_UP_HINT_NOTES, type AdapterManifest, type LaunchInput } from '../../src/agent';
import type { CoreResult } from '../../src/core/types';
import { withNoticeSink, withWarningSink } from '../../src/validation/warning';
import { git, removeTempDir } from '../storage/helpers/git-fixture';
import { FakeChild, settle, spawnInto, tick } from './helpers/fake-child';
import { launchFixture } from './helpers/launch-input';

const repos: string[] = [];
afterAll(() => {
  for (const repo of repos) removeTempDir(repo);
});

/** The `hand` manifest of `launchFixture` with `launch.interactive.trust` set to `trust`. */
const withTrust =
  (trust: 'prompt' | 'implied') =>
  (manifest: AdapterManifest): AdapterManifest => ({ ...manifest, launch: { ...manifest.launch, interactive: { ...manifest.launch.interactive, trust } } });

async function trapped(trust: 'prompt' | 'implied'): Promise<{ outcome: CoreResult<unknown>; warnings: string[]; notes: unknown; runId: string }> {
  const { root, input } = launchFixture(withTrust(trust));
  repos.push(root);
  const child = new FakeChild({ SIGTERM: 0 });
  const { spawn } = spawnInto(child);
  const armed: (() => void)[] = [];
  const timer = (_delayMs: number, fire: () => void): (() => void) => {
    armed.push(fire);
    return () => undefined;
  };
  const warnings: string[] = [];
  const launchInput: LaunchInput = { ...input, kind: 'interactive', timeout: { ms: 300000, label: '5m' } };
  const run = withNoticeSink(
    () => undefined,
    () => withWarningSink((text) => warnings.push(text), () => launchAgent(root, launchInput, { spawn, timer }, () => undefined)),
  );
  await tick();
  armed[0]?.();
  await tick();
  const outcome = await settle(child, run);
  const lines = git(root, ['show', `HEAD:${input.logPath}`]).split('\n').filter((line) => line !== '');
  const notes = (JSON.parse(lines[lines.length - 1]!) as Record<string, unknown>)['notes'];
  return { outcome, warnings: warnings.filter((text) => text.includes('folder-trust')), notes, runId: input.runId };
}

describe('task-353 — the start-up hint when the bound expires and the agent traps SIGTERM and exits 0', () => {
  it('trust: prompt → the hint with exit_status 0, TIMED_OUT unchanged, notes the hint text', async () => {
    const { outcome, warnings, notes, runId } = await trapped('prompt');
    expect(outcome.ok ? 'ok' : outcome.error).toMatchObject({ code: 'IO', message: `agent timed out after 5m; run ${runId} recorded`, details: { exit_status: 0, timeout: '5m' } });
    expect(warnings).toEqual([
      `run ${runId}: the agent exited 0 with no commit since state_ref: its CLI may have stopped at its folder-trust step (adapter 'hand' declares launch.interactive.trust: prompt)`,
    ]);
    expect(notes).toBe(START_UP_HINT_NOTES);
  }, 60000);

  it('trust: implied → no hint, notes none, TIMED_OUT unchanged', async () => {
    const { outcome, warnings, notes, runId } = await trapped('implied');
    expect(outcome.ok ? 'ok' : outcome.error).toMatchObject({ code: 'IO', message: `agent timed out after 5m; run ${runId} recorded`, details: { exit_status: 0 } });
    expect(warnings).toEqual([]);
    expect(notes).toBe('none');
  }, 60000);
});
