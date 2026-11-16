/**
 * task-353 AC 2 (red-first, in process; `spec-016` §3.3 step 16, §3.7 `START_UP_HINT`, §4.2 key 18, as amended at the
 * design gate `c0ac033df`; `bug-500`; approver ruling D5) — the start-up hint, on `launchAgent` with an injected
 * `FakeChild` (`./helpers/fake-child.ts`) and the injected timer of `test/agent/launch-timeout.test.ts`, no wall clock.
 *
 * The hint is given when all four hold: the run did not succeed (a non-zero exit, a signal, or the expired time
 * bound), `HEAD` is still `state_ref` (the agent committed nothing), `notes` would be `none`, and the adapter declares
 * `launch.<kind>.trust: prompt` for the kind that ran. Then:
 * - the record's `notes` is exactly {@link HINT_NOTES};
 * - one warning (the CLI prints it as `warning: <text>`) is raised: {@link hintWarning};
 * - the run's outcome is unchanged: the same `IO` error, `agent exited <n>` or `TIMED_OUT`'s `agent timed out after 5m`.
 *
 * Cases: (f) the expired bound, `signal:SIGTERM`, on both kinds — the design's case (f); an exit `1` under `prompt` on
 * both kinds (the in-process twin of the CLI suite `test/cli/agent-execute-trust.integration.test.ts`, so the
 * coverage-measured process reaches the branch); and the absences, each beside its positive case (dl-097 (a)): exit
 * `0` under `prompt`, exit `1` under `implied`, under a fragment and under no `trust`, exit `1` after a commit since
 * `state_ref`. Expected red today: `trust` is accepted here only through the cast (the manifest is built in
 * TypeScript, not parsed), no warning is raised and `notes` is `none`.
 */
import { launchAgent, type AdapterManifest, type LaunchInput } from '../../src/agent';
import type { CoreResult } from '../../src/core/types';
import { withNoticeSink, withWarningSink } from '../../src/validation/warning';
import { commitAll, git, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { FakeChild, settle, spawnInto, tick } from './helpers/fake-child';
import { launchFixture } from './helpers/launch-input';

/** `spec-016` §4.2 key 18's fixed text for a run stopped before any commit under `trust: prompt`. */
const HINT_NOTES = 'none (no commit since state_ref: the agent CLI may have stopped at its folder-trust step)';

/** `spec-016` §3.3 step 16's warning text (the CLI renders it as `warning: <text>`). */
const hintWarning = (runId: string, exitStatus: string, adapter: string, kind: Kind): string =>
  `run ${runId}: the agent exited ${exitStatus} with no commit since state_ref: its CLI may have stopped at its folder-trust step (adapter '${adapter}' declares launch.${kind}.trust: prompt)`;

type Kind = 'interactive' | 'headless';

const repos: string[] = [];
afterAll(() => {
  for (const repo of repos) removeTempDir(repo);
});

/** A recording timer: every armed timer, with the callback the test fires. */
function recorder(): { timer: (delayMs: number, fire: () => void) => () => void; armed: { delayMs: number; fire: () => void }[] } {
  const armed: { delayMs: number; fire: () => void }[] = [];
  return {
    armed,
    timer: (delayMs, fire) => {
      armed.push({ delayMs, fire });
      return () => undefined;
    },
  };
}

/** The `hand` manifest of `launchFixture` with `trust` declared on both kinds (or neither, for `undefined`). */
function withTrust(trust: unknown): (manifest: AdapterManifest) => AdapterManifest {
  const field = trust === undefined ? {} : { trust };
  return (manifest) =>
    ({
      ...manifest,
      launch: {
        interactive: { ...manifest.launch.interactive, ...field },
        headless: { args: ['scripts/agent-ok.cjs'], output: 'none', ...field },
      },
    }) as AdapterManifest;
}

interface Launched {
  readonly root: string;
  readonly input: LaunchInput;
  readonly child: FakeChild;
  readonly armed: { delayMs: number; fire: () => void }[];
  readonly warnings: string[];
  readonly run: Promise<CoreResult<unknown>>;
}

/** Start one launch of `kind` on a `FakeChild`, bounded by 5m when `bounded`, every warning collected. */
function start(trust: unknown, kind: Kind, bounded = false): Launched {
  const { root, input } = launchFixture(withTrust(trust));
  repos.push(root);
  const child = new FakeChild({ SIGTERM: 'exit' });
  const { spawn } = spawnInto(child);
  const { timer, armed } = recorder();
  const warnings: string[] = [];
  const launchInput: LaunchInput = { ...input, kind, ...(bounded ? { timeout: { ms: 300000, label: '5m' } } : {}) };
  const run: Promise<CoreResult<unknown>> = withNoticeSink(
    () => undefined,
    () => withWarningSink((text) => warnings.push(text), () => launchAgent(root, launchInput, { spawn, timer }, () => undefined)),
  );
  return { root, input: launchInput, child, armed, warnings, run };
}

/** The `notes` of the last record of the run log at `HEAD`. */
function notesAtHead(root: string, input: LaunchInput): unknown {
  const lines = git(root, ['show', `HEAD:${input.logPath}`]).split('\n').filter((line) => line !== '');
  return (JSON.parse(lines[lines.length - 1]!) as Record<string, unknown>)['notes'];
}

const hints = (warnings: readonly string[]): string[] => warnings.filter((text) => text.includes('folder-trust'));

describe('task-353 AC 2 — the start-up hint in process (spec-016 §3.3 step 16, §4.2 key 18)', () => {
  it.each<Kind>(['interactive', 'headless'])('(f) %s, trust: prompt, the bound expires and SIGTERM ends the agent: the hint with signal:SIGTERM, TIMED_OUT unchanged', async (kind) => {
    const { root, input, child, armed, warnings, run } = start('prompt', kind, true);
    await tick();
    armed[0]?.fire();
    await tick();
    const outcome = await settle(child, run);
    expect(outcome.ok ? 'ok' : outcome.error).toMatchObject({ code: 'IO', message: `agent timed out after 5m; run ${input.runId} recorded`, details: { exit_status: 'signal:SIGTERM', timeout: '5m' } });
    expect(hints(warnings)).toEqual([hintWarning(input.runId, 'signal:SIGTERM', 'hand', kind)]);
    expect(notesAtHead(root, input)).toBe(HINT_NOTES);
  }, 60000);

  it.each<Kind>(['interactive', 'headless'])('%s, trust: prompt, the agent exits 1 with no commit: the hint with 1, the exit error unchanged', async (kind) => {
    const { root, input, child, warnings, run } = start('prompt', kind);
    await tick();
    child.finish(1);
    const outcome = await run;
    expect(outcome.ok ? 'ok' : outcome.error).toMatchObject({ code: 'IO', message: `agent exited 1; run ${input.runId} recorded` });
    expect(hints(warnings)).toEqual([hintWarning(input.runId, '1', 'hand', kind)]);
    expect(notesAtHead(root, input)).toBe(HINT_NOTES);
  }, 60000);

  it('trust: prompt, the agent exits 0: no hint, notes none (the run succeeded)', async () => {
    const { root, input, child, warnings, run } = start('prompt', 'interactive');
    await tick();
    child.finish(0);
    const outcome = await run;
    expect(outcome.ok).toBe(true);
    expect(hints(warnings)).toEqual([]);
    expect(notesAtHead(root, input)).toBe('none');
  }, 60000);

  it.each<[string, unknown]>([
    ['implied', 'implied'],
    ['a fragment', ['--trust-dir', 'yes']],
    ['no trust', undefined],
  ])('trust: %s, the agent exits 1 with no commit: no hint, notes none, the exit error unchanged', async (_label, trust) => {
    const { root, input, child, warnings, run } = start(trust, 'interactive');
    await tick();
    child.finish(1);
    const outcome = await run;
    expect(outcome.ok ? 'ok' : outcome.error).toMatchObject({ code: 'IO', message: `agent exited 1; run ${input.runId} recorded` });
    expect(hints(warnings)).toEqual([]);
    expect(notesAtHead(root, input)).toBe('none');
  }, 60000);

  it('trust: prompt, the agent committed since state_ref and exits 1: no hint (HEAD moved), notes none', async () => {
    const { root, input, child, warnings, run } = start('prompt', 'interactive');
    await tick();
    writeFixtureFile(root, 'work.txt', 'done\n');
    commitAll(root, 'agent work');
    child.finish(1);
    const outcome = await run;
    expect(outcome.ok ? 'ok' : outcome.error).toMatchObject({ code: 'IO', message: `agent exited 1; run ${input.runId} recorded` });
    expect(hints(warnings)).toEqual([]);
    expect(notesAtHead(root, input)).toBe('none');
  }, 60000);
});
