/**
 * task-339 AC 2 (red-first, in process; `spec-016` §3.3 step 14 as amended at the design gate; `dl-223` (b),
 * Action 3; approver rulings D1 (a), D2 (a)) — the permission fragment of the run's role and where it goes:
 *
 * - `launchPermissions(manifest, kind, role)`: `launch.<kind>.permissions` absent → `[]`; a list → itself, for
 *   every role; a map → the role's entry, else its `default`; `interactive` reads `launch.interactive.permissions`,
 *   never the headless one;
 * - `renderLaunchArgv(manifest, values, kind, role)`: `launch.<kind>.args` rendered, then the fragment, then
 *   `session.assign_args` rendered; with no `permissions` the argv is today's;
 * - `launchAgent` passes `input.role`: a headless launch spawns with the role's fragment (the `FakeChild` pattern of
 *   `test/agent/launch-headless.test.ts`), so the coverage-measured process reaches the branch the CLI suite
 *   `test/cli/agent-execute-permissions.integration.test.ts` shows a user.
 *
 * Today `launchPermissions` is not exported (`TS2305`; under ts-jest `isolatedModules` a runtime `TypeError`) and
 * `renderLaunchArgv` takes three arguments (`TS2554`). The manifests are the fake adapter fixture
 * (`test/fixtures/agents/custom/fake.yaml`, unchanged, D10) with the field added, parsed by `parseAdapterManifest`
 * once the schema reads it; the fragments avoid every argv word the fake agent acts on.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { dump, load } from 'js-yaml';

import { launchAgent, launchPermissions, parseAdapterManifest, renderLaunchArgv, type AdapterManifest, type LaunchInput, type LaunchValues } from '../../src/agent';
import type { CoreResult } from '../../src/core/types';
import { withNoticeSink, withWarningSink } from '../../src/validation/warning';
import { removeTempDir } from '../storage/helpers/git-fixture';
import { FakeChild, settle, spawnInto, tick } from './helpers/fake-child';
import { launchFixture } from './helpers/launch-input';

const FIXTURE = join(__dirname, '..', 'fixtures', 'agents', 'custom', 'fake.yaml');

/** The design's fragments: a reading posture, the default, and a writing one. */
const R = ['--allow', 'read'];
const D = ['--allow', 'none'];
const W = ['--allow', 'write', '--deny', 'push'];

type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** The fake adapter with `launch.<kind>.permissions` set as given (a key left out stays absent), parsed. */
function fake(permissions: { interactive?: unknown; headless?: unknown } = {}): AdapterManifest {
  const raw = load(readFileSync(FIXTURE, 'utf-8')) as Raw;
  if (permissions.interactive !== undefined) raw.launch.interactive.permissions = permissions.interactive;
  if (permissions.headless !== undefined) raw.launch.headless.permissions = permissions.headless;
  return parseAdapterManifest(dump(raw), { name: 'fake', kind: 'custom', file: 'HEAD:.wingfoil/agents/custom/fake.yaml' });
}

const values: LaunchValues = {
  bootstrap: 'WingFoil run x\n',
  files: { mcp_config_file: '/tmp/wingfoil-run-1/mcp-config.json' },
  mcpServer: { command: '/usr/bin/node', args: ['/opt/wf/dist/cli.js', 'mcp'] },
  sessionId: '00000000-0000-5000-8000-000000000000',
};

/** `fake.yaml`'s `launch.headless.args`, rendered with {@link values}. */
const HEADLESS_ARGS = ['test/fixtures/agents/fake-agent.cjs', '--headless', '--mcp-config', values.files.mcp_config_file, '--prompt', values.bootstrap];
/** `fake.yaml`'s `session.assign_args`, rendered. */
const ASSIGN = ['--session-id', values.sessionId];

describe('task-339 AC 2 — launchPermissions(manifest, kind, role) (spec-016 §3.3 step 14, dl-223 (b))', () => {
  it('a role map: the role\'s entry when named, else default', () => {
    const manifest = fake({ headless: { default: D, reviewer: R } });
    expect(launchPermissions(manifest, 'headless', 'reviewer')).toEqual(R);
    expect(launchPermissions(manifest, 'headless', 'qa')).toEqual(D);
  });

  it('a list: the same fragment for every role', () => {
    const manifest = fake({ headless: W });
    for (const role of ['developer', 'reviewer', 'qa', 'architect', 'tech-lead']) expect(launchPermissions(manifest, 'headless', role)).toEqual(W);
  });

  it('absent: no fragment', () => {
    expect(launchPermissions(fake(), 'headless', 'reviewer')).toEqual([]);
    expect(launchPermissions(fake(), 'interactive', 'reviewer')).toEqual([]);
  });

  it('interactive reads launch.interactive.permissions, never the headless one', () => {
    expect(launchPermissions(fake({ headless: { default: D, reviewer: R } }), 'interactive', 'reviewer')).toEqual([]);
    const both = fake({ interactive: W, headless: { default: D, reviewer: R } });
    expect(launchPermissions(both, 'interactive', 'reviewer')).toEqual(W);
    expect(launchPermissions(both, 'headless', 'reviewer')).toEqual(R);
  });
});

describe('task-339 AC 2 — renderLaunchArgv(manifest, values, kind, role): the fragment between the args and session.assign_args (D2 (a))', () => {
  it('headless, reviewer: launch.headless.args rendered, then the reviewer fragment, then session.assign_args', () => {
    const manifest = fake({ headless: { default: D, reviewer: R } });
    expect(renderLaunchArgv(manifest, values, 'headless', 'reviewer')).toEqual([...HEADLESS_ARGS, ...R, ...ASSIGN]);
  });

  it('headless, a role the map does not name: the default fragment', () => {
    const manifest = fake({ headless: { default: D, reviewer: R } });
    expect(renderLaunchArgv(manifest, values, 'headless', 'developer')).toEqual([...HEADLESS_ARGS, ...D, ...ASSIGN]);
  });

  it('with no permissions the argv is today\'s, whatever the role', () => {
    const manifest = fake();
    expect(renderLaunchArgv(manifest, values, 'headless', 'reviewer')).toEqual(renderLaunchArgv(manifest, values, 'headless'));
    expect(renderLaunchArgv(manifest, values, 'headless')).toEqual([...HEADLESS_ARGS, ...ASSIGN]);
  });
});

const repos: string[] = [];
afterAll(() => {
  for (const repo of repos) removeTempDir(repo);
});

describe('task-339 AC 2 — launchAgent spawns with the fragment of input.role', () => {
  it('a headless launch of a reviewer: the headless args, then R', async () => {
    const { root, input } = launchFixture(
      (manifest) =>
        ({
          ...manifest,
          launch: { ...manifest.launch, headless: { args: ['scripts/agent-ok.cjs', '--work'], output: 'none', permissions: { default: D, reviewer: R } } },
        }) as AdapterManifest,
    );
    repos.push(root);
    const reviewer: LaunchInput = { ...input, kind: 'headless', role: 'reviewer' };
    const child = new FakeChild();
    const { spawn, calls } = spawnInto(child);
    const run: Promise<CoreResult<unknown>> = withNoticeSink(
      () => undefined,
      () => withWarningSink(() => undefined, () => launchAgent(root, reviewer, { spawn }, () => undefined)),
    );
    await tick();
    const outcome = await settle(child, run);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.args).toEqual(['scripts/agent-ok.cjs', '--work', ...R]);
    expect(outcome.ok).toBe(true);
  }, 60000);
});
