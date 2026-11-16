/**
 * task-336 AC 4 (red-first) — the active registry entry a launch keeps, in process (`spec-016` §3.3 steps 13, 14 and 17,
 * §7 as amended at the design gate; `dl-181`; approver rulings D3 (a), D12): `launchAgent` driven with
 * `LaunchHost.spawn` injected (a `FakeChild` with pid 4242) and `LaunchHost.now` (the design's new host fact for
 * `started_ms`), so the coverage-measured process reaches the registry the CLI suite
 * `test/cli/agent-execute-registry.integration.test.ts` shows a user.
 *
 * - while the agent runs, exactly one file `.wingfoil/run/<element-id>/<phase>/<n>.json`, one JSON object and a
 *   newline, keys `id, pid, workflow, phase, element, role, agent, session, started_ms` in that order, `pid` the
 *   agent's (rewritten at step 14), `session` `not-reported` (the fixture's `session.id: none`), `started_ms` the
 *   injected instant;
 * - after the run, no file is left under `.wingfoil/run/`, for an agent that exits 0 and one that exits 1.
 *
 * Today nothing writes `.wingfoil/run/` (`grep -rn "wingfoil/run" src` → nothing).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { launchAgent, type AdapterManifest, type LaunchHost, type LaunchInput } from '../../src/agent';
import type { CoreResult } from '../../src/core/types';
import { withNoticeSink, withWarningSink } from '../../src/validation/warning';
import { removeTempDir } from '../storage/helpers/git-fixture';
import { FakeChild, settle, spawnInto, tick } from './helpers/fake-child';
import { launchFixture } from './helpers/launch-input';

const repos: string[] = [];
afterAll(() => {
  for (const repo of repos) removeTempDir(repo);
});

const AGENT_PID = 4242;
const STARTED_MS = 1794817800000; // 2026-11-16T08:30:00.000Z, an injected instant: no wall clock runs
const ENTRY = '.wingfoil/run/task-001-hand/adhoc/1.json';

/** The launch fixture's manifest with a headless block. */
function withHeadless(manifest: AdapterManifest): AdapterManifest {
  return { ...manifest, launch: { ...manifest.launch, headless: { args: ['scripts/agent-ok.cjs', '--work'], output: 'none' } } } as AdapterManifest;
}

/** Every file under `<root>/.wingfoil/run/`, root-relative, sorted. */
function registryFiles(root: string): string[] {
  const files: string[] = [];
  const walk = (relative: string): void => {
    const absolute = join(root, relative);
    if (!existsSync(absolute)) return;
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      const path = `${relative}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else files.push(path);
    }
  };
  walk('.wingfoil/run');
  return files.sort();
}

/** A launch of `kind` against a child with pid 4242; the registry read while it runs, then the outcome once it exits `code`. */
async function launchAndExit(kind: 'interactive' | 'headless', code: number): Promise<{ root: string; during: string[]; text: string | null; outcome: CoreResult<unknown> }> {
  const { root, input } = launchFixture(withHeadless);
  repos.push(root);
  const child = new FakeChild({}, AGENT_PID, { stderr: true });
  const { spawn } = spawnInto(child);
  // Built as a variable: `now` is the host fact the design adds (`LaunchHost.now?: () => number`).
  const host = { spawn, now: () => STARTED_MS } as LaunchHost;
  const run = withNoticeSink(
    () => undefined,
    () => withWarningSink(() => undefined, () => launchAgent(root, { ...input, kind } as LaunchInput, host, () => undefined)),
  );
  await tick();
  await tick();
  const during = registryFiles(root);
  const text = existsSync(join(root, ENTRY)) ? readFileSync(join(root, ENTRY), 'utf-8') : null;
  child.finish(code);
  const outcome = await settle(child, run);
  return { root, during, text, outcome };
}

describe('task-336 AC 4 — a running launch has one registry entry (spec-016 §3.3 steps 13–14, §7)', () => {
  it.each(['headless', 'interactive'] as const)('%s: one file at <element-id>/<phase>/<n>.json, its keys in order, the agent pid, then removed', async (kind) => {
    const { root, during, text, outcome } = await launchAndExit(kind, 0);
    expect(during).toEqual([ENTRY]);
    expect(text).not.toBeNull();
    expect(text!.endsWith('}\n')).toBe(true);
    const entry = JSON.parse(text!) as Record<string, unknown>;
    expect(Object.keys(entry)).toEqual(['id', 'pid', 'workflow', 'phase', 'element', 'role', 'agent', 'session', 'started_ms']);
    expect(entry).toEqual({
      id: 'task-001-hand/adhoc/1',
      pid: AGENT_PID,
      workflow: 'n/a',
      phase: 'adhoc',
      element: 'task:task-001-hand',
      role: 'developer',
      agent: 'Hand Agent',
      session: 'not-reported',
      started_ms: STARTED_MS,
    });
    expect(outcome.ok ? 'ok' : outcome.error.message).toBe('ok');
    expect(registryFiles(root)).toEqual([]);
  }, 60000);

  it('an agent that exits 1: the run is recorded and the entry removed all the same', async () => {
    const { root, during, outcome } = await launchAndExit('headless', 1);
    expect(during).toEqual([ENTRY]);
    expect(outcome.ok ? 'ok' : outcome.error.message).toBe('agent exited 1; run task-001-hand/adhoc/1 recorded');
    expect(registryFiles(root)).toEqual([]);
  }, 60000);
});
