/**
 * task-335 (refactor) — `LaunchHost.timer`'s default, the real timer (`spec-016` §3.3 step 15): with no `timer`
 * injected, a bound expires on its own and the run ends as `TIMED_OUT`. In process, so the coverage-measured
 * process reaches `realTimer`, which `test/agent/launch-timeout.test.ts` replaces with a recorder and the CLI suite
 * reaches only in a child process. The bound is 20 ms and the agent a `FakeChild` that exits on `SIGTERM`; nothing is
 * asserted about any duration.
 */
import { launchAgent, type AdapterManifest, type LaunchInput } from '../../src/agent';
import type { CoreResult } from '../../src/core/types';
import { withNoticeSink, withWarningSink } from '../../src/validation/warning';
import { removeTempDir } from '../storage/helpers/git-fixture';
import { FakeChild, settle, spawnInto } from './helpers/fake-child';
import { launchFixture } from './helpers/launch-input';

const repos: string[] = [];
afterAll(() => {
  for (const repo of repos) removeTempDir(repo);
});

function withHeadless(manifest: AdapterManifest): AdapterManifest {
  return { ...manifest, launch: { ...manifest.launch, headless: { args: ['scripts/agent-ok.cjs'], output: 'none' } } } as AdapterManifest;
}

describe('task-335 — the default timer of --timeout (spec-016 §3.3 step 15)', () => {
  it('a bound that expires on the real timer sends SIGTERM and ends the run as timed out, recorded', async () => {
    const { root, input } = launchFixture(withHeadless);
    repos.push(root);
    const child = new FakeChild();
    const { spawn } = spawnInto(child);
    const bounded: LaunchInput = { ...input, kind: 'headless', timeout: { ms: 20, label: '20ms' } };
    const run: Promise<CoreResult<unknown>> = withNoticeSink(
      () => undefined,
      () => withWarningSink(() => undefined, () => launchAgent(root, bounded, { spawn }, () => undefined)),
    );
    // Wait until the bound has ended the child, then let the launch finish (settle is a no-op once it has exited).
    await new Promise<void>((resolve) => child.once('exit', () => resolve()));
    const outcome = await settle(child, run);
    expect(child.killed).toEqual(['SIGTERM']);
    expect(outcome.ok ? 'ok' : outcome.error).toMatchObject({
      code: 'IO',
      message: `agent timed out after 20ms; run ${input.runId} recorded`,
      details: { exit_status: 'signal:SIGTERM', timeout: '20ms' },
    });
  }, 60000);
});
