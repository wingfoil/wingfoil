/**
 * task-353 AC 2 (red-first, in process; `spec-016` §3.3 step 14 as amended at the design gate `c0ac033df`; `bug-500`;
 * approver ruling D3 (a)) — where the trust fragment goes:
 *
 * - `renderLaunchArgv(manifest, values, kind, role)`: `launch.<kind>.args` rendered, then the role's permission
 *   fragment, then the trust fragment when `launch.<kind>.trust` is one, then `session.assign_args` rendered;
 * - `trust: prompt`, `trust: implied` or no `trust` adds no element: the argv is the one without the key;
 * - each kind reads its own `trust`, never the other kind's;
 * - `launchAgent` spawns with it: a headless launch of the `FakeChild` pattern (`test/agent/launch-permissions.test.ts`)
 *   receives the fragment after the permission fragment.
 *
 * The manifests are the fake adapter fixture (`test/fixtures/agents/custom/fake.yaml`, unchanged) with the fields
 * added, parsed by `parseAdapterManifest`: today the strict schema refuses `trust` (`Unrecognized key`). The
 * `AdapterManifest` type does not know the key either: the typed literal in the last case is `TS2353` until the
 * schema gains it (under ts-jest's `isolatedModules` it runs, and fails on the argv).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { dump, load } from 'js-yaml';

import { launchAgent, parseAdapterManifest, renderLaunchArgv, type AdapterManifest, type LaunchInput, type LaunchValues } from '../../src/agent';
import type { CoreResult } from '../../src/core/types';
import { withNoticeSink, withWarningSink } from '../../src/validation/warning';
import { removeTempDir } from '../storage/helpers/git-fixture';
import { FakeChild, settle, spawnInto, tick } from './helpers/fake-child';
import { launchFixture } from './helpers/launch-input';

const FIXTURE = join(__dirname, '..', 'fixtures', 'agents', 'custom', 'fake.yaml');

/** A permission fragment and a trust fragment, avoiding every argv word the fake agent acts on. */
const P = ['--allow', 'read'];
const T = ['--trust-dir', 'yes'];

type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Kind = 'interactive' | 'headless';

/** The fake adapter with the `launch.<kind>` fields given added (a key left out stays absent), parsed. */
function fake(fields: { interactive?: Record<string, unknown>; headless?: Record<string, unknown> } = {}): AdapterManifest {
  const raw = load(readFileSync(FIXTURE, 'utf-8')) as Raw;
  Object.assign(raw.launch.interactive, fields.interactive ?? {});
  Object.assign(raw.launch.headless, fields.headless ?? {});
  return parseAdapterManifest(dump(raw), { name: 'fake', kind: 'custom', file: 'HEAD:.wingfoil/agents/custom/fake.yaml' });
}

const values: LaunchValues = {
  bootstrap: 'WingFoil run x\n',
  files: { mcp_config_file: '/tmp/wingfoil-run-1/mcp-config.json' },
  mcpServer: { command: '/usr/bin/node', args: ['/opt/wf/dist/cli.js', 'mcp'] },
  sessionId: '00000000-0000-5000-8000-000000000000',
};

/** `fake.yaml`'s `launch.<kind>.args`, rendered with {@link values}. */
const ARGS: Readonly<Record<Kind, readonly string[]>> = {
  interactive: ['test/fixtures/agents/fake-agent.cjs', '--mcp-config', values.files.mcp_config_file!, '--prompt', values.bootstrap],
  headless: ['test/fixtures/agents/fake-agent.cjs', '--headless', '--mcp-config', values.files.mcp_config_file!, '--prompt', values.bootstrap],
};
/** `fake.yaml`'s `session.assign_args`, rendered. */
const ASSIGN = ['--session-id', values.sessionId];

describe.each<Kind>(['interactive', 'headless'])('task-353 AC 2 — renderLaunchArgv, %s: the trust fragment after the permission fragment (spec-016 §3.3 step 14)', (kind) => {
  it('a fragment: the args, then the permission fragment, then the trust fragment, then session.assign_args', () => {
    const manifest = fake({ [kind]: { permissions: P, trust: T } });
    expect(renderLaunchArgv(manifest, values, kind, 'developer')).toEqual([...ARGS[kind], ...P, ...T, ...ASSIGN]);
  });

  it('a fragment with no permissions: the args, then the trust fragment, then session.assign_args', () => {
    const manifest = fake({ [kind]: { trust: T } });
    expect(renderLaunchArgv(manifest, values, kind, 'developer')).toEqual([...ARGS[kind], ...T, ...ASSIGN]);
  });

  it.each(['prompt', 'implied'])('trust: %s adds no element', (trust) => {
    const manifest = fake({ [kind]: { permissions: P, trust } });
    expect(renderLaunchArgv(manifest, values, kind, 'developer')).toEqual([...ARGS[kind], ...P, ...ASSIGN]);
  });

  it('no trust: the argv is today\'s', () => {
    expect(renderLaunchArgv(fake(), values, kind, 'developer')).toEqual([...ARGS[kind], ...ASSIGN]);
  });

  it('each kind reads its own trust, never the other kind\'s', () => {
    const other: Kind = kind === 'interactive' ? 'headless' : 'interactive';
    const manifest = fake({ [other]: { trust: T } });
    expect(renderLaunchArgv(manifest, values, kind, 'developer')).toEqual([...ARGS[kind], ...ASSIGN]);
    expect(renderLaunchArgv(manifest, values, other, 'developer')).toEqual([...ARGS[other], ...T, ...ASSIGN]);
  });
});

const repos: string[] = [];
afterAll(() => {
  for (const repo of repos) removeTempDir(repo);
});

describe('task-353 AC 2 — launchAgent spawns with the trust fragment', () => {
  it('a headless launch: the headless args, then the permission fragment, then the trust fragment', async () => {
    // A typed literal: `trust` is TS2353 until the schema (and so `AdapterManifest`) gains it.
    const headless: NonNullable<AdapterManifest['launch']['headless']> = { args: ['scripts/agent-ok.cjs', '--work'], output: 'none', permissions: P, trust: T };
    const { root, input } = launchFixture((manifest) => ({ ...manifest, launch: { ...manifest.launch, headless } }) as AdapterManifest);
    repos.push(root);
    const launchInput: LaunchInput = { ...input, kind: 'headless' };
    const child = new FakeChild();
    const { spawn, calls } = spawnInto(child);
    const run: Promise<CoreResult<unknown>> = withNoticeSink(
      () => undefined,
      () => withWarningSink(() => undefined, () => launchAgent(root, launchInput, { spawn }, () => undefined)),
    );
    await tick();
    const outcome = await settle(child, run);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.args).toEqual(['scripts/agent-ok.cjs', '--work', ...P, ...T]);
    expect(outcome.ok).toBe(true);
  }, 60000);
});
