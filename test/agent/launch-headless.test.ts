/**
 * task-335 AC 4 (red-first) — the headless work run, in process (`spec-016` §3.3 steps 14–15, §3.5; `dl-181`
 * Q1 (a), Q3 (c); approver ruling D6 (a)): `launchAgent` driven with `LaunchHost.spawn` injected (the
 * `FakeChild` pattern of `test/agent/launch-process.test.ts`), so the coverage-measured process reaches the
 * branches the CLI suite `test/cli/agent-execute-headless.integration.test.ts` shows a user.
 *
 * - the argv: `launch.headless.args` rendered, then `session.assign_args` (`renderLaunchArgv(manifest, values,
 *   'headless')`); `launch.interactive.args` for the interactive kind, as before;
 * - the spawn options: headless → stdin the null device, stdout piped (and drained), stderr inherited, the child
 *   in a session and process group of its own on POSIX (`detached`); interactive → stdio inherited, as before;
 * - the signals: headless forwards `SIGINT`, `SIGTERM` and `SIGHUP` and ignores `SIGQUIT`; the interactive sets
 *   stay `launch-process.test.ts`'s (`SIGINT`/`SIGQUIT` ignored, `SIGTERM`/`SIGHUP` forwarded);
 * - the record: `result: 'n/a'`, `exit_status: 0` (`dl-181` Q1 (a)).
 */
import { launchAgent, renderLaunchArgv, type AdapterManifest, type LaunchInput, type LaunchValues } from '../../src/agent';
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

/** The launch fixture's manifest with a headless block (`output: none`, the built-ins' value). */
function withHeadless(manifest: AdapterManifest): AdapterManifest {
  return { ...manifest, launch: { ...manifest.launch, headless: { args: ['scripts/agent-ok.cjs', '--work'], output: 'none' } } } as AdapterManifest;
}

/** A launch input of `kind` on a fresh fixture repository. */
function fixture(kind: 'interactive' | 'headless'): { root: string; input: LaunchInput } {
  const { root, input } = launchFixture(withHeadless);
  repos.push(root);
  return { root, input: { ...input, kind } };
}

/** Run `launchAgent` against `child`, the warnings and notices silenced. */
function launch(root: string, input: LaunchInput, child: FakeChild): { run: Promise<CoreResult<unknown>>; calls: ReturnType<typeof spawnInto>['calls'] } {
  const { spawn, calls } = spawnInto(child);
  const run = withNoticeSink(
    () => undefined,
    () => withWarningSink(() => undefined, () => launchAgent(root, input, { spawn }, () => undefined)),
  );
  return { run, calls };
}

describe('task-335 AC 4 — renderLaunchArgv(manifest, values, kind) (spec-016 §3.3 step 14)', () => {
  const manifest = {
    name: 'm',
    format: 1,
    command: 'agent-cli',
    launch: {
      interactive: { args: ['--chat', '{bootstrap}'], terminal: 'optional' },
      headless: { args: ['-p', '{bootstrap}', '--mcp-config', '{mcp_config_file}'], output: 'none' },
    },
    prompt: { via: 'arg' },
    mcp: { via: 'config-file', template: '{}' },
    session: { id: 'assign', assign_args: ['--session-id', '{session_id}'], resume: { supported: false } },
    usage: { from: 'none' },
  } as AdapterManifest;
  const values: LaunchValues = {
    bootstrap: 'WingFoil run x\n',
    files: { mcp_config_file: '/tmp/wingfoil-run-1/mcp-config.json' },
    mcpServer: { command: '/usr/bin/node', args: ['/opt/wf/dist/cli.js', 'mcp'] },
    sessionId: '00000000-0000-5000-8000-000000000000',
  };

  it('headless: launch.headless.args rendered, then session.assign_args', () => {
    expect(renderLaunchArgv(manifest, values, 'headless')).toEqual(['-p', values.bootstrap, '--mcp-config', values.files.mcp_config_file, '--session-id', values.sessionId]);
  });

  it('interactive (and the default): launch.interactive.args rendered, then session.assign_args, as before', () => {
    expect(renderLaunchArgv(manifest, values, 'interactive')).toEqual(['--chat', values.bootstrap, '--session-id', values.sessionId]);
    expect(renderLaunchArgv(manifest, values)).toEqual(['--chat', values.bootstrap, '--session-id', values.sessionId]);
  });
});

describe('task-335 AC 4 — the work run spawns with no terminal (spec-016 §3.3 step 14, D6)', () => {
  it('headless: the headless argv; stdin the null device, stdout piped and drained, stderr inherited, detached on POSIX; recorded result n/a', async () => {
    const { root, input } = fixture('headless');
    const child = new FakeChild();
    const { run, calls } = launch(root, input, child);
    await tick();
    const flowing = child.stdout.readableFlowing;
    const outcome = await settle(child, run);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.args).toEqual(['scripts/agent-ok.cjs', '--work']);
    expect(calls[0]!.options).toMatchObject({ cwd: root, env: process.env, stdio: ['ignore', 'pipe', 'inherit'] });
    expect(calls[0]!.options.detached === true).toBe(POSIX);
    expect(flowing).toBe(true);
    if (!outcome.ok) throw new Error(outcome.error.message);
    expect((outcome.value as { run: Record<string, unknown> }).run).toMatchObject({ result: 'n/a', exit_status: 0, id: input.runId });
  }, 60000);

  it('interactive: the interactive argv and inherited stdio, not detached (unchanged)', async () => {
    const { root, input } = fixture('interactive');
    const child = new FakeChild();
    const { run, calls } = launch(root, input, child);
    await tick();
    const outcome = await settle(child, run);
    expect(calls[0]!.args).toEqual(['scripts/agent-ok.cjs']);
    expect(calls[0]!.options).toMatchObject({ cwd: root, stdio: 'inherit' });
    expect(calls[0]!.options.detached).toBeFalsy();
    expect(outcome.ok).toBe(true);
  }, 60000);
});

describe('task-335 AC 4 — a headless run forwards SIGINT, SIGTERM and SIGHUP and ignores SIGQUIT (spec-016 §3.3 step 15)', () => {
  (POSIX ? it : it.skip)('SIGQUIT is ignored while the agent runs', async () => {
    const { root, input } = fixture('headless');
    const child = new FakeChild();
    const { run } = launch(root, input, child);
    await tick();
    process.emit('SIGQUIT', 'SIGQUIT');
    const killed = [...child.killed];
    await settle(child, run);
    expect(killed).toEqual([]);
  }, 60000);

  it.each<NodeJS.Signals>(POSIX ? ['SIGINT', 'SIGTERM', 'SIGHUP'] : ['SIGINT', 'SIGTERM'])('%s is forwarded, and the run is recorded as ended by it', async (signal) => {
    const { root, input } = fixture('headless');
    const child = new FakeChild();
    const { run } = launch(root, input, child);
    await tick();
    process.emit(signal, signal);
    await tick();
    const killed = [...child.killed];
    const outcome = await settle(child, run);
    expect(killed).toEqual([signal]);
    expect(outcome.ok ? 'ok' : outcome.error.message).toBe(`agent exited signal:${signal}; run ${input.runId} recorded`);
  }, 60000);
});
