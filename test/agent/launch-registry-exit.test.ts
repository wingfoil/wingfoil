/**
 * task-336 review fix round, F2 (red-first; `spec-016` §3.3 steps 14 and 17, §7 "This launch's entry", as amended at
 * the review fix round, `e998b6346`; approver ruling F2 (a)) — the registry entry after the agent exits, in process:
 * `launchAgent` driven with `LaunchHost.spawn` injected (a `FakeChild` with pid 4242 and both pipes),
 * `LaunchHost.now` and a long `LaunchHost.lookupTimeoutMs`, so the post-exit window is held open by the test itself:
 * the child exits with its pipes still open (`exitKeepingStdout`), and the launch waits for them (§3.3 step 16) until
 * the test ends them. No timing is assumed.
 *
 * - while the launch is still recording (the agent gone, its output not yet ended), the entry holds `agent execute`'s
 *   own `pid` again, with the same `id` and `started_ms` (§3.3 step 14: rewritten at the agent's exit);
 * - a file that another launch's entry replaced meanwhile (same `id`, another `started_ms`, a `pid` that is neither
 *   this `agent execute` nor its agent) is not rewritten at the exit and not removed after the run: byte for byte.
 *
 * The CLI form of the window (a second process reading `agent list --active` while `agent execute` records) is not
 * pinned: the compiled CLI is spawned synchronously in this repository's suites (`test/lint/cli-spawn-helper.test.ts`
 * allows one asynchronous spawn), and a timed window would depend on machine load.
 *
 * Today the entry keeps the agent's pid until it is removed, and the removal deletes whatever file holds the run id.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { launchAgent, type AdapterManifest, type LaunchHost, type LaunchInput } from '../../src/agent';
import type { CoreResult } from '../../src/core/types';
import { withNoticeSink, withWarningSink } from '../../src/validation/warning';
import { removeTempDir } from '../storage/helpers/git-fixture';
import { FakeChild, spawnInto, tick } from './helpers/fake-child';
import { launchFixture } from './helpers/launch-input';

const repos: string[] = [];
afterAll(() => {
  for (const repo of repos) removeTempDir(repo);
});

const AGENT_PID = 4242;
const STARTED_MS = 1794817800000; // 2026-11-16T08:30:00.000Z, injected
const ENTRY = '.wingfoil/run/task-001-hand/adhoc/1.json';

function withHeadless(manifest: AdapterManifest): AdapterManifest {
  return { ...manifest, launch: { ...manifest.launch, headless: { args: ['scripts/agent-ok.cjs', '--work'], output: 'none' } } } as AdapterManifest;
}

/** Start a headless launch against a child with pid 4242 and both pipes; the post-exit drain bounded at 60 s. */
async function start(): Promise<{ root: string; child: FakeChild; run: Promise<CoreResult<unknown>> }> {
  const { root, input } = launchFixture(withHeadless);
  repos.push(root);
  const child = new FakeChild({}, AGENT_PID, { stderr: true });
  const { spawn } = spawnInto(child);
  const host = { spawn, now: () => STARTED_MS, lookupTimeoutMs: 60000 } as LaunchHost;
  const run = withNoticeSink(
    () => undefined,
    () => withWarningSink(() => undefined, () => launchAgent(root, { ...input, kind: 'headless' } as LaunchInput, host, () => undefined)),
  );
  await tick();
  await tick();
  return { root, child, run };
}

/** End the pipes the exited child kept open, so the launch records and returns. */
async function release(child: FakeChild, run: Promise<CoreResult<unknown>>): Promise<CoreResult<unknown>> {
  child.stdout.end();
  child.stderr?.end();
  return run;
}

const read = (root: string): string | null => (existsSync(join(root, ENTRY)) ? readFileSync(join(root, ENTRY), 'utf-8') : null);

describe('task-336 F2 — the entry after the agent exits (spec-016 §3.3 steps 14 and 17, §7)', () => {
  it("while the run is still being recorded, the entry holds agent execute's own pid, the same id and started_ms", async () => {
    const { root, child, run } = await start();
    const during = read(root);
    expect(during === null ? null : (JSON.parse(during) as { pid: unknown }).pid).toBe(AGENT_PID);
    child.exitKeepingStdout(0);
    await tick();
    await tick();
    await tick();
    const afterExit = read(root);
    try {
      expect(afterExit).not.toBeNull();
      expect(JSON.parse(afterExit!)).toMatchObject({ id: 'task-001-hand/adhoc/1', pid: process.pid, started_ms: STARTED_MS });
    } finally {
      const outcome = await release(child, run);
      expect(outcome.ok ? 'ok' : outcome.error.message).toBe('ok');
    }
    expect(read(root)).toBeNull();
  }, 60000);

  it("another launch's entry in the file is neither rewritten at the exit nor removed after the run: byte for byte", async () => {
    const { root, child, run } = await start();
    // A second launch of the same run id, from another process: another started_ms, another (live) pid.
    const other = `${JSON.stringify({
      id: 'task-001-hand/adhoc/1',
      pid: process.ppid,
      workflow: 'n/a',
      phase: 'adhoc',
      element: 'task:task-001-hand',
      role: 'developer',
      agent: 'Hand Agent',
      session: 'not-reported',
      started_ms: STARTED_MS + 1,
    })}\n`;
    writeFileSync(join(root, ENTRY), other);
    child.exitKeepingStdout(0);
    await tick();
    await tick();
    await tick();
    const afterExit = read(root);
    await release(child, run);
    expect(afterExit).toBe(other);
    expect(read(root)).toBe(other);
  }, 60000);
});
