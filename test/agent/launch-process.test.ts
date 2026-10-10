/**
 * task-228 — `launchAgent` (`spec-016` §3.3 steps 13–18) driven directly, with hand-written agent and
 * lookup scripts, for the cases the fake agent does not declare: a version command that prints nothing,
 * a lookup that prints no JSON, one ended by a signal, a session id of the wrong type, and an agent
 * command the OS cannot start. Signal forwarding is asserted on the compiled CLI only
 * (`test/cli/agent-execute-launch.integration.test.ts`): a signal sent to the Jest process itself would
 * reach Jest's own handling too.
 */
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
