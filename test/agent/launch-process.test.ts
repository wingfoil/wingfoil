/**
 * task-228 — `launchAgent` (`spec-016` §3.3 steps 13–18) driven directly, with hand-written agent and
 * lookup scripts, for the cases the fake agent does not declare: a version command that prints nothing,
 * a lookup that prints no JSON, one ended by a signal, a session id of the wrong type, and an agent
 * command the OS cannot start. Signal forwarding is asserted on the compiled CLI only
 * (`test/cli/agent-execute-launch.integration.test.ts`): a signal sent to the Jest process itself would
 * reach Jest's own handling too.
 */
import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { launchAgent, type AdapterManifest, type LaunchInput } from '../../src/agent';
import { renderAgentExecuteStderr } from '../../src/core/agent-execute';
import type { CoreResult } from '../../src/core/types';
import { withNoticeSink, withWarningSink } from '../../src/validation/warning';
import { removeTempDir } from '../storage/helpers/git-fixture';
import { launchFixture } from './helpers/launch-input';

const repos: string[] = [];
afterAll(() => {
  for (const repo of repos) removeTempDir(repo);
});

interface Outcome {
  readonly result: CoreResult<unknown>;
  readonly warnings: string[];
}

async function launch(input: LaunchInput, root: string): Promise<Outcome> {
  const warnings: string[] = [];
  const result = await withNoticeSink(
    () => undefined,
    () => withWarningSink((text) => warnings.push(text), () => launchAgent(root, input, {}, () => undefined)),
  );
  return { result, warnings };
}

const record = (outcome: Outcome): Record<string, unknown> => {
  if (!outcome.result.ok) throw new Error(outcome.result.error.message);
  return (outcome.result.value as { run: Record<string, unknown> }).run;
};

describe('launchAgent — post-run lookups that fail record not-reported and say why (spec-016 §2.6)', () => {
  it('a version command that prints nothing, a lookup that prints no JSON, one ended by a signal', async () => {
    const { root, input } = launchFixture((manifest: AdapterManifest) => ({
      ...manifest,
      version_args: ['scripts/silent.cjs'],
      session: { id: 'lookup', lookup_args: ['scripts/not-json.cjs'], field: 'sid', resume: { supported: false } },
      usage: { from: 'lookup', lookup_args: ['scripts/killed.cjs'], fields: { model: 'model' } },
    }));
    repos.push(root);
    const outcome = await launch(input, root);
    expect(record(outcome)).toMatchObject({ agent_version: 'not-reported', session: 'not-reported', model: 'not-reported', exit_status: 0 });
    expect(outcome.warnings).toEqual([
      "adapter 'hand': version_args printed nothing: agent_version recorded as not-reported",
      "adapter 'hand': the session lookup failed (printed no JSON): session recorded as not-reported",
      "adapter 'hand': the usage lookup failed (ended by SIGKILL): model and tokens recorded as not-reported",
    ]);
  }, 60000);

  it('a session id that is not a non-empty string', async () => {
    const { root, input } = launchFixture((manifest: AdapterManifest) => ({
      ...manifest,
      session: { id: 'lookup', lookup_args: ['scripts/number-session.cjs'], field: 'sid', resume: { supported: false } },
    }));
    repos.push(root);
    const outcome = await launch(input, root);
    expect(record(outcome)).toMatchObject({ session: 'not-reported' });
    expect(outcome.warnings).toEqual(["adapter 'hand': the session lookup's session id is not a non-empty string: recorded as not-reported"]);
  }, 60000);
});

describe('launchAgent — one argv declared for the session and the usage runs once (spec-016 §2.6)', () => {
  it('session and usage from one lookup; undeclared fields and an absent model are not-reported, silently; a failing version_args is said', async () => {
    const { root, input } = launchFixture((manifest: AdapterManifest) => ({
      ...manifest,
      version_args: ['scripts/fails.cjs'],
      session: { id: 'lookup', lookup_args: ['scripts/both.cjs'], field: 'sid', resume: { supported: false } },
      usage: { from: 'lookup', lookup_args: ['scripts/both.cjs'], fields: { model: 'model', input: 'tokens.in' } },
    }));
    repos.push(root);
    const outcome = await launch(input, root);
    expect(record(outcome)).toMatchObject({
      session: 's-9',
      model: 'not-reported',
      tokens: { input: 7, output: 'not-reported', cache_read: 'not-reported', cache_write: 'not-reported' },
      agent_version: 'not-reported',
    });
    expect(outcome.warnings).toEqual(["adapter 'hand': version_args failed (exited 1): agent_version recorded as not-reported"]);
    expect(readFileSync(join(root, 'lookups.log'), 'utf-8')).toBe('run\n');
  }, 60000);
});

describe('launchAgent — the agent process', () => {
  it('a command the OS cannot start: IO, no run, no record', async () => {
    const { root, input } = launchFixture((manifest: AdapterManifest) => ({ ...manifest, command: 'bin/no-such-agent' }));
    repos.push(root);
    const outcome = await launch(input, root);
    expect(outcome.result.ok).toBe(false);
    if (!outcome.result.ok) expect(outcome.result.error.message).toMatch(/^agent command 'bin\/no-such-agent' could not be started \(adapter 'hand'\): .*ENOENT/);
  }, 60000);
});

describe('launchAgent — the outcome (spec-016 §3.3 step 18)', () => {
  it('an agent exit 3: recorded, then IO with the summary as the detail line', async () => {
    const { root, input } = launchFixture((manifest: AdapterManifest) => ({
      ...manifest,
      launch: { interactive: { args: ['scripts/exit3.cjs'], terminal: 'optional' } },
      usage: { from: 'lookup', lookup_args: ['scripts/both.cjs'] },
    }));
    repos.push(root);
    const outcome = await launch(input, root);
    expect(outcome.result.ok).toBe(false);
    if (outcome.result.ok) return;
    expect(outcome.result.error.message).toBe(`agent exited 3; run ${input.runId} recorded`);
    expect(outcome.result.error.details).toMatchObject({
      run_id: input.runId,
      exit_status: 3,
      issues: [{ detail: expect.stringMatching(new RegExp(`^run ${input.runId}: agent exited 3 after \\d+\\.\\d s \\(recorded in [0-9a-f]{7}\\)$`)) }],
    });
    expect(outcome.warnings).toEqual([]);
  }, 60000);

  it('a spawn that throws something other than an Error is reported as text', async () => {
    const { root, input } = launchFixture((manifest: AdapterManifest) => manifest);
    repos.push(root);
    const warnings: string[] = [];
    const result = await withWarningSink(
      (text) => warnings.push(text),
      () =>
        launchAgent(
          root,
          input,
          {
            spawn: () => {
              throw 'refused';
            },
          },
          () => undefined,
        ),
    );
    expect(result.ok ? 'ok' : result.error.message).toBe("agent command 'node' could not be started (adapter 'hand'): refused");
  }, 60000);
});

/**
 * A child-process stand-in for the signal cases (review fix 1): it reports `spawn` at once, and `kill`
 * ends it by that signal. A signal is raised with `process.emit`, which runs the listeners only — the
 * Jest process is never signalled.
 */
class FakeChild extends EventEmitter {
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  readonly killed: string[] = [];
  constructor() {
    super();
    setImmediate(() => this.emit('spawn'));
  }
  /** End by itself with `code`, as an agent that exits does. */
  finish(code: number): void {
    this.exitCode = code;
    this.emit('exit', code, null);
  }
  kill(signal: NodeJS.Signals): boolean {
    this.killed.push(signal);
    setImmediate(() => {
      this.signalCode = signal;
      this.emit('exit', null, signal);
    });
    return true;
  }
}

describe('launchAgent — signals around the spawn (review fix 1, spec-016 §3.3 step 15)', () => {
  it('the launch listeners are in place before the pre-launch cleanup is released', async () => {
    const { root, input } = launchFixture((manifest: AdapterManifest) => manifest);
    repos.push(root);
    const baseline = process.listenerCount('SIGTERM');
    let atRelease = -1;
    const child = new FakeChild();
    const run = launchAgent(root, input, { spawn: () => child as unknown as ChildProcess }, () => {
      atRelease = process.listenerCount('SIGTERM');
    });
    setImmediate(() => child.kill('SIGTERM'));
    await run;
    expect(atRelease).toBe(baseline + 1);
    expect(process.listenerCount('SIGTERM')).toBe(baseline);
  }, 60000);

  it('a SIGTERM that arrives while the agent is being spawned is forwarded once the child exists, and the run is recorded', async () => {
    const { root, input } = launchFixture((manifest: AdapterManifest) => manifest);
    repos.push(root);
    const child = new FakeChild();
    const outcome = await withWarningSink(
      () => undefined,
      () =>
        launchAgent(
          root,
          input,
          {
            spawn: () => {
              process.emit('SIGTERM', 'SIGTERM');
              return child as unknown as ChildProcess;
            },
          },
          () => undefined,
        ),
    );
    expect(child.killed).toEqual(['SIGTERM']);
    expect(outcome.ok ? 'ok' : outcome.error.message).toBe(`agent exited signal:SIGTERM; run ${input.runId} recorded`);
  }, 60000);

  it('SIGINT and SIGQUIT are ignored, SIGHUP forwarded, while the agent runs', async () => {
    const { root, input } = launchFixture((manifest: AdapterManifest) => manifest);
    repos.push(root);
    const child = new FakeChild();
    const run = withWarningSink(
      () => undefined,
      () => launchAgent(root, input, { spawn: () => child as unknown as ChildProcess }, () => undefined),
    );
    await new Promise((resolve) => setImmediate(resolve));
    process.emit('SIGINT', 'SIGINT');
    process.emit('SIGQUIT', 'SIGQUIT');
    expect(child.killed).toEqual([]);
    process.emit('SIGHUP', 'SIGHUP');
    const outcome = await run;
    expect(child.killed).toEqual(['SIGHUP']);
    expect(outcome.ok ? 'ok' : outcome.error.message).toBe(`agent exited signal:SIGHUP; run ${input.runId} recorded`);
  }, 60000);
});

describe('launchAgent — the re-review branches (re-review 4)', () => {
  it('a SIGTERM after the agent has exited is ignored while the lookups run, and the run is recorded', async () => {
    const { root, input } = launchFixture((manifest: AdapterManifest) => ({
      ...manifest,
      usage: { from: 'lookup', lookup_args: ['scripts/slow.cjs'], fields: { model: 'model' } },
    }));
    repos.push(root);
    const child = new FakeChild();
    const run = withWarningSink(
      () => undefined,
      () => launchAgent(root, input, { spawn: () => child as unknown as ChildProcess }, () => undefined),
    );
    await new Promise((resolve) => setImmediate(resolve));
    child.finish(0);
    await new Promise((resolve) => setTimeout(resolve, 300));
    process.emit('SIGTERM', 'SIGTERM');
    const outcome = await run;
    expect(child.killed).toEqual([]);
    expect(outcome.ok ? outcome.value.run.model : outcome.error.message).toBe('slow');
  }, 60000);

  it('an error the child emits after it spawned is not a failure to start: the exit decides', async () => {
    const { root, input } = launchFixture((manifest: AdapterManifest) => manifest);
    repos.push(root);
    const child = new FakeChild();
    const run = launchAgent(root, input, { spawn: () => child as unknown as ChildProcess }, () => undefined);
    await new Promise((resolve) => setImmediate(resolve));
    child.emit('error', new Error('a late error'));
    child.finish(0);
    const outcome = await run;
    expect(outcome.ok).toBe(true);
  }, 60000);

  it('a lookup command that cannot start: `could not start: <code>`', async () => {
    const { root, input } = launchFixture((manifest: AdapterManifest) => ({
      ...manifest,
      command: 'bin/no-such-cli',
      usage: { from: 'lookup', lookup_args: ['--usage'], fields: { model: 'model' } },
    }));
    repos.push(root);
    const child = new FakeChild();
    const warnings: string[] = [];
    const run = withWarningSink(
      (text) => warnings.push(text),
      () => launchAgent(root, input, { spawn: () => child as unknown as ChildProcess }, () => undefined),
    );
    await new Promise((resolve) => setImmediate(resolve));
    child.finish(0);
    const outcome = await run;
    expect(outcome.ok).toBe(true);
    expect(warnings).toEqual(["adapter 'hand': the usage lookup failed (could not start: ENOENT): model and tokens recorded as not-reported"]);
  }, 60000);
});

describe('launchAgent — a lookup that prints more than 1 MiB (review fix 2)', () => {
  it('on stderr, with valid stdout: the limit covers both streams, and the cause says so (re-review 1)', async () => {
    const { root, input } = launchFixture((manifest: AdapterManifest) => ({
      ...manifest,
      usage: { from: 'lookup', lookup_args: ['scripts/flood-stderr.cjs'], fields: { model: 'model' } },
    }));
    repos.push(root);
    const outcome = await launch(input, root);
    expect(record(outcome)).toMatchObject({ model: 'not-reported' });
    expect(outcome.warnings).toEqual(["adapter 'hand': the usage lookup failed (printed more than 1 MiB on stdout or stderr): model and tokens recorded as not-reported"]);
  }, 60000);

  it('is reported as such, not as a command that could not start', async () => {
    const { root, input } = launchFixture((manifest: AdapterManifest) => ({ ...manifest, usage: { from: 'lookup', lookup_args: ['scripts/flood.cjs'] } }));
    repos.push(root);
    const outcome = await launch(input, root);
    expect(outcome.warnings).toEqual(["adapter 'hand': the usage lookup failed (printed more than 1 MiB on stdout or stderr): model and tokens recorded as not-reported"]);
  }, 60000);
});

describe('renderAgentExecuteStderr (spec-016 §3.4)', () => {
  it('a recorded run: the summary line and {run}; a dry-run plan: none', () => {
    const run = { id: 'x/adhoc/1', exit_status: 0, duration_ms: 1260 } as unknown as never;
    expect(renderAgentExecuteStderr({ run, sha: 'abcdef0123456789' } as never)).toEqual({
      document: { run },
      console: 'run x/adhoc/1: agent exited 0 after 1.3 s (recorded in abcdef0)',
    });
    expect(renderAgentExecuteStderr({ dryRun: true } as never)).toBeUndefined();
  });
});
