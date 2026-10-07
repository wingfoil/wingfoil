/**
 * task-112-a-pinned-released-build-develops-wingfoil (`dl-095` Q1 (a) + Q2 (i), `dl-026`; P5.2.1,
 * P5.2.2, REQ-SYS-09) — WingFoil is managed by a published, pinned build, and the repository's
 * `.mcp.json` registers that build's MCP server.
 *
 * Two surfaces:
 *   - the committed declarations: the `wingfoil-released` alias, the `wingfoil` npm script, and the
 *     `.mcp.json` entry, all naming the alias's own binary path rather than a `wingfoil` bin name —
 *     this package is itself named `wingfoil`, and `npx wingfoil` runs *this* package's `dist/cli.js`
 *     once it is built (measured in this task's Execution Notes);
 *   - `scripts/check-mcp-registration.cjs` (`npm run check:mcp`), the step the `e2e-smoke` workflow
 *     runs to re-verify the registered server's channel set (`dl-026`).
 *
 * Offline and deterministic: the pinned build is the one `npm ci` installed under `node_modules/`, the
 * server is spawned over stdio, and no assertion reads a clock or a temp-directory name.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { load } from 'js-yaml';

import {
  EXPECTED_CHANNELS,
  channelSet,
  checkMcpRegistration,
  evaluateRegistration,
  pinnedVersion,
  registrationProblems,
} from '../../scripts/check-mcp-registration.cjs';
import type { McpConfig, McpServerObservation } from '../../scripts/check-mcp-registration.cjs';

const REPO_ROOT = join(__dirname, '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'check-mcp-registration.cjs');
const PINNED_BIN = 'node_modules/wingfoil-released/dist/cli.js';

interface Manifest {
  readonly scripts?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
}

const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf-8')) as Manifest;

/** The version the committed `package.json` pins, read independently of the script under test. */
function pinFromPackageJson(): string {
  const version = /^npm:wingfoil@(\d+\.\d+\.\d+)$/.exec(pkg.devDependencies?.['wingfoil-released'] ?? '')?.[1];
  if (version === undefined) throw new Error('package.json does not pin wingfoil-released exactly');
  return version;
}

const HEALTHY_CONFIG: McpConfig = { mcpServers: { wingfoil: { command: 'node', args: [PINNED_BIN, 'mcp'] } } };
const HEALTHY_MANIFEST = { devDependencies: { 'wingfoil-released': 'npm:wingfoil@0.2.1' } };
const HEALTHY_OBSERVATION: McpServerObservation = {
  version: '0.2.1',
  channels: ['prompts', 'resources'],
  lists: { prompts: 8, resources: 2 },
};

describe('the committed declarations (task-112 AC 1, AC 2)', () => {
  it('.mcp.json registers `wingfoil` as the pinned build’s `mcp` command, by path', () => {
    const config = JSON.parse(readFileSync(join(REPO_ROOT, '.mcp.json'), 'utf-8')) as McpConfig;
    expect(config.mcpServers?.wingfoil).toEqual({ command: 'node', args: [PINNED_BIN, 'mcp'] });
  });

  it('the `wingfoil` npm script runs the pinned build by path, never a `wingfoil` bin name', () => {
    expect(pkg.scripts?.wingfoil).toBe(`node ${PINNED_BIN}`);
  });

  it('`npm run check:mcp` is wired to the registration check', () => {
    expect(pkg.scripts?.['check:mcp']).toBe('node scripts/check-mcp-registration.cjs');
  });

  it('the build `npm ci` installed under the alias reports the pinned version', () => {
    const run = spawnSync(process.execPath, [PINNED_BIN, '--version'], { cwd: REPO_ROOT, encoding: 'utf-8' });
    expect({ status: run.status, stdout: run.stdout.trim() }).toEqual({ status: 0, stdout: pinFromPackageJson() });
  });

  it('node_modules/.bin/wingfoil is the alias’s binary (dl-095: confirm before relying on it)', () => {
    expect(realpathSync(join(REPO_ROOT, 'node_modules', '.bin', 'wingfoil'))).toBe(
      realpathSync(join(REPO_ROOT, PINNED_BIN)),
    );
  });
});

describe('scripts/check-mcp-registration.cjs — pure parts', () => {
  it('reads the exact pin, and refuses a range or a missing alias', () => {
    expect(pinnedVersion(HEALTHY_MANIFEST)).toBe('0.2.1');
    expect(pinnedVersion({ devDependencies: { 'wingfoil-released': 'npm:wingfoil@^0.2.1' } })).toBeUndefined();
    expect(pinnedVersion({})).toBeUndefined();
  });

  it('lists advertised channels in a fixed order, ignoring capabilities that are not channels', () => {
    expect(channelSet({ resources: { listChanged: true }, logging: {}, prompts: {} })).toEqual(['prompts', 'resources']);
    expect(channelSet({ tools: {}, prompts: {}, resources: {} })).toEqual(['prompts', 'resources', 'tools']);
    expect(channelSet(undefined)).toEqual([]);
  });

  it('expects today’s channel set: Resources (P5.2.1) and Prompts (P5.2.2), no Tools until P5.2.3', () => {
    expect(EXPECTED_CHANNELS).toEqual(['prompts', 'resources']);
  });

  it('accepts a registration of the pinned build that answers as declared', () => {
    expect(registrationProblems(HEALTHY_CONFIG)).toEqual([]);
    expect(evaluateRegistration(HEALTHY_MANIFEST, HEALTHY_CONFIG, HEALTHY_OBSERVATION).ok).toBe(true);
  });

  it('refuses a missing server entry', () => {
    expect(registrationProblems({})).toEqual([expect.stringContaining('wingfoil')]);
  });

  it('refuses a registration of the build under development — the same version, so only the path tells', () => {
    const dev: McpConfig = { mcpServers: { wingfoil: { command: 'node', args: ['dist/cli.js', 'mcp'] } } };
    const result = evaluateRegistration(HEALTHY_MANIFEST, dev, HEALTHY_OBSERVATION);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('node_modules/wingfoil-released/');
  });

  it('refuses a registration that does not run the `mcp` command', () => {
    const cli: McpConfig = { mcpServers: { wingfoil: { command: 'node', args: [PINNED_BIN] } } };
    expect(registrationProblems(cli)).toEqual([expect.stringContaining('mcp')]);
  });

  it('refuses a server whose version is not the pin', () => {
    const result = evaluateRegistration(HEALTHY_MANIFEST, HEALTHY_CONFIG, { ...HEALTHY_OBSERVATION, version: '0.2.2' });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('0.2.2');
  });

  it('refuses a changed channel set, naming both sets — the dl-026 re-verification', () => {
    const grown = { ...HEALTHY_OBSERVATION, channels: ['prompts', 'resources', 'tools'], lists: { prompts: 8, resources: 2, tools: 1 } };
    const result = evaluateRegistration(HEALTHY_MANIFEST, HEALTHY_CONFIG, grown);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('prompts, resources, tools');
    expect(result.message).toContain('EXPECTED_CHANNELS');
  });

  it('refuses an advertised channel whose list request fails', () => {
    const broken = { ...HEALTHY_OBSERVATION, lists: { prompts: { error: 'Method not found' }, resources: 2 } };
    const result = evaluateRegistration(HEALTHY_MANIFEST, HEALTHY_CONFIG, broken);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('Method not found');
  });

  it('refuses a server that did not start, with what it said', () => {
    const result = evaluateRegistration(HEALTHY_MANIFEST, HEALTHY_CONFIG, { error: 'E_NO_GIT_ROOT' });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('E_NO_GIT_ROOT');
  });
});

/** Each case below starts a real server process; under a full parallel suite that can exceed jest's 5 s. */
const SERVER_TIMEOUT_MS = 60_000;

describe('scripts/check-mcp-registration.cjs — against the real pinned build', () => {
  it('passes on this repository: the registered server is the pin and advertises the expected set', async () => {
    const result = await checkMcpRegistration(REPO_ROOT);
    expect(result).toEqual({ ok: true, message: expect.stringContaining(pinFromPackageJson()) });
  }, SERVER_TIMEOUT_MS);

  it('exits 0 as `npm run check:mcp` would run it', () => {
    const run = spawnSync(process.execPath, [SCRIPT], { cwd: REPO_ROOT, encoding: 'utf-8' });
    expect({ status: run.status, stderr: run.stderr }).toEqual({ status: 0, stderr: '' });
    expect(run.stdout).toContain('prompts, resources');
  }, SERVER_TIMEOUT_MS);

  it('exits 1 when the pin and the registered server disagree', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wf-mcpreg-'));
    try {
      expect(spawnSync('git', ['init', '-q', dir]).status).toBe(0);
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ devDependencies: { 'wingfoil-released': 'npm:wingfoil@9.9.9' } }));
      writeFileSync(
        join(dir, '.mcp.json'),
        JSON.stringify({ mcpServers: { wingfoil: { command: 'node', args: [join(REPO_ROOT, PINNED_BIN), 'mcp'] } } }),
      );
      const run = spawnSync(process.execPath, [SCRIPT, dir], { cwd: REPO_ROOT, encoding: 'utf-8' });
      expect(run.status).toBe(1);
      expect(run.stderr).toContain('9.9.9');
      expect(run.stdout).toBe('');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, SERVER_TIMEOUT_MS);
});

/**
 * task-112 AC 3 and AC 4 — the two workflow steps that use the commands above. Guard tests written
 * after the configuration change (classified configuration in the Execution Notes), not a red.
 */
describe('the workflow steps that run these checks (task-112 AC 3, AC 4)', () => {
  interface Phase {
    readonly name: string;
    readonly actions?: readonly string[];
    readonly checks?: { readonly pre?: readonly string[] };
  }
  function phases(workflow: string): readonly Phase[] {
    const path = join(REPO_ROOT, '.wingfoil', 'workflows', 'custom', `${workflow}.yaml`);
    return (load(readFileSync(path, 'utf-8')) as { phases: readonly Phase[] }).phases;
  }

  it('e2e-smoke re-verifies the registered server with `npm run check:mcp`, before its gate (dl-026)', () => {
    const names = phases('e2e-smoke').map((phase) => phase.name);
    expect(names.indexOf('mcp-registration')).toBe(names.indexOf('gate') - 1);
    expect(phases('e2e-smoke').find((phase) => phase.name === 'mcp-registration')?.actions).toEqual([
      'cli.run(command: "npm run check:mcp")', // key: value form since task-199 (spec-003 open question 6)
    ]);
  });

  it('release-planning opens with the pin-advance precondition step (dl-095 Q3 (B))', () => {
    const first = phases('release-planning')[0];
    expect(first?.name).toBe('advance-pinned-build');
    expect(first?.checks?.pre?.join(' ')).toContain('npm run -s wingfoil -- --version');
  });
});
