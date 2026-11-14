/**
 * task-338 AC 1 and AC 2 (`spec-016` §2.4 and §3.3 step 14 as amended, `spec-018` §1.1, `dl-180` (c), `bug-369`) —
 * the environment the agent is spawned with, in process.
 *
 * - AC 1 (red-first): `agentEnvironment(env, cliShim, agentName)` is a copy of `env` with the shim's directory first
 *   on `PATH` (the directory alone when `PATH` is absent), `WINGFOIL_CLI` set to the shim's path and `WINGFOIL_AGENT`
 *   set to the agent's name, whatever either held; `env` itself is not changed. `launchAgent` spawns with it when the
 *   launch input names a shim.
 * - AC 2 (red-first, design D4): `launchAgent` spawns the agent with `WINGFOIL_AGENT` set to the selected entry's
 *   name (the `LaunchInput`'s `agent.name`).
 * - AC 2 (characterization, design D4): the post-run usage lookup runs without `WINGFOIL_AGENT` (a lookup script
 *   that prints `process.env.WINGFOIL_AGENT ?? "absent"` as the model records `absent`), `launchAgent` leaves
 *   `process.env` without it, and `\bWINGFOIL_AGENT\b` is spelled in `src/` only in `src/core/agent-context.ts`
 *   (`spec-018` §1: no marker name is spelled elsewhere).
 *
 * The win32 case-insensitive `PATH` key is not asserted here (no Windows runner, design D5).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { delimiter, join } from 'node:path';

import { agentEnvironment, launchAgent, type AdapterManifest, type LaunchInput } from '../../src/agent';
import type { CoreResult } from '../../src/core/types';
import { withNoticeSink, withWarningSink } from '../../src/validation/warning';
import { removeTempDir } from '../storage/helpers/git-fixture';
import { FakeChild, settle, spawnInto, tick } from './helpers/fake-child';
import { launchFixture } from './helpers/launch-input';

const REPO_ROOT = join(__dirname, '..', '..');
const SHIM = '/tmp/wingfoil-run-x/bin/wingfoil';
const SHIM_DIR = '/tmp/wingfoil-run-x/bin';

const repos: string[] = [];
afterAll(() => {
  for (const repo of repos) removeTempDir(repo);
});

describe('task-338 AC 1, AC 2 — agentEnvironment(env, cliShim, agentName)', () => {
  it('puts the shim directory first on PATH, sets WINGFOIL_CLI and WINGFOIL_AGENT over any value, keeps the rest', () => {
    const env = { PATH: `/usr/bin${delimiter}/bin`, HOME: '/home/u', WINGFOIL_AGENT: 'Other Agent', WINGFOIL_CLI: '/elsewhere/wingfoil' };
    expect(agentEnvironment(env, SHIM, 'Hand Agent')).toEqual({
      PATH: `${SHIM_DIR}${delimiter}/usr/bin${delimiter}/bin`,
      HOME: '/home/u',
      WINGFOIL_CLI: SHIM,
      WINGFOIL_AGENT: 'Hand Agent',
    });
  });

  it('with no PATH at all, PATH is the shim directory alone', () => {
    const out = agentEnvironment({ HOME: '/home/u' }, SHIM, 'Hand Agent');
    expect(out['PATH']).toBe(SHIM_DIR);
    expect(out['WINGFOIL_CLI']).toBe(SHIM);
  });

  it('the input object is not changed', () => {
    const env = Object.freeze({ PATH: '/usr/bin', HOME: '/home/u' });
    const copy = { ...env };
    const out = agentEnvironment(env, SHIM, 'Hand Agent');
    expect(env).toEqual(copy);
    expect(out).not.toBe(env);
  });

  it('with no shim, WINGFOIL_AGENT is still set and PATH is left as it was', () => {
    const out = agentEnvironment({ PATH: '/usr/bin', HOME: '/home/u' }, undefined, 'Hand Agent');
    expect(out['PATH']).toBe('/usr/bin');
    expect(out['WINGFOIL_AGENT']).toBe('Hand Agent');
  });
});

/** The launch fixture with its usage looked up by a `node -e` script that reports `WINGFOIL_AGENT` as the model. */
function fixture(): { root: string; input: LaunchInput } {
  const { root, input } = launchFixture((manifest: AdapterManifest) => ({
    ...manifest,
    usage: {
      from: 'lookup',
      lookup_args: ['-e', "process.stdout.write(JSON.stringify({ model: process.env.WINGFOIL_AGENT ?? 'absent' }) + '\\n')"],
      fields: { model: 'model' },
    },
  }));
  repos.push(root);
  return { root, input };
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

describe('task-338 AC 2 — launchAgent spawns the agent with WINGFOIL_AGENT, and only the agent (spec-018 §1.1)', () => {
  let outcome: CoreResult<unknown>;
  let calls: ReturnType<typeof spawnInto>['calls'];
  let before: string | undefined;

  beforeAll(async () => {
    before = process.env.WINGFOIL_AGENT;
    const { root, input } = fixture();
    const child = new FakeChild();
    const started = launch(root, input, child);
    calls = started.calls;
    await tick();
    outcome = await settle(child, started.run);
  }, 60000);

  it('the jest worker carries no WINGFOIL_AGENT of its own (a guard on the cases below)', () => {
    expect(before).toBeUndefined();
  });

  it('(red-first) the spawn\'s environment has WINGFOIL_AGENT set to the agent entry\'s name', () => {
    expect(calls).toHaveLength(1);
    expect((calls[0]!.options.env ?? {})['WINGFOIL_AGENT']).toBe('Hand Agent');
  });

  it('(characterization) the post-run usage lookup runs without WINGFOIL_AGENT: the record\'s model is "absent"', () => {
    if (!outcome.ok) throw new Error(outcome.error.message);
    expect((outcome.value as { run: Record<string, unknown> }).run['model']).toBe('absent');
  });

  it('(characterization) process.env is left without WINGFOIL_AGENT', () => {
    expect(process.env.WINGFOIL_AGENT).toBeUndefined();
  });
});

describe('task-338 AC 1 — launchAgent spawns with the shim the launch input names (spec-016 §3.3 step 14)', () => {
  it('PATH starts with the shim directory and WINGFOIL_CLI is the shim path', async () => {
    const { root, input } = fixture();
    // `cliShim` is the new optional LaunchInput field (design §1); the cast lets this file compile before it exists.
    const withShim = { ...input, cliShim: SHIM } as LaunchInput;
    const child = new FakeChild();
    const { run, calls } = launch(root, withShim, child);
    await tick();
    await settle(child, run);
    const env = calls[0]!.options.env ?? {};
    expect(env['PATH']!.split(delimiter)[0]).toBe(SHIM_DIR);
    expect(env['WINGFOIL_CLI']).toBe(SHIM);
    expect(env['WINGFOIL_AGENT']).toBe('Hand Agent');
  }, 60000);
});

/** Every `.ts` file under `dir`, recursively. */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sources(path) : path.endsWith('.ts') ? [path] : [];
  });
}

describe('task-338 AC 2 (characterization) — the WINGFOIL_AGENT marker is spelled in src/ only by src/core/agent-context.ts (spec-018 §1)', () => {
  it('the files of src/ whose text matches \\bWINGFOIL_AGENT\\b, comment lines included', () => {
    const files = sources(join(REPO_ROOT, 'src'))
      .filter((file) => /\bWINGFOIL_AGENT\b/.test(readFileSync(file, 'utf-8')))
      .map((file) => file.slice(REPO_ROOT.length + 1).split('\\').join('/'));
    expect(files).toEqual(['src/core/agent-context.ts']);
  });

  it('the pattern does not match WINGFOIL_AGENT_MODEL, which src/ spells elsewhere (a guard on the pattern)', () => {
    expect(/\bWINGFOIL_AGENT\b/.test('WINGFOIL_AGENT_MODEL')).toBe(false);
    expect(sources(join(REPO_ROOT, 'src')).some((file) => readFileSync(file, 'utf-8').includes('WINGFOIL_AGENT_MODEL'))).toBe(true);
  });
});
