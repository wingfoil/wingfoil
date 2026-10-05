/**
 * task-060-publish-pipeline (`dl-018` T3, `adr-009`, `spec-015` §2–§4, REQ-SYS-09) — the publish gate,
 * the CI workflow shape and the tag scheme, asserted offline.
 *
 * Sibling of `publish-metadata.test.ts` (task-059, `spec-015` §1). Kept in its own file so the two
 * contracts evolve independently — that suite's packed-contents allowlist is edited by other tasks.
 *
 * Nothing here contacts a registry or needs a credential:
 * - `package.json` and `.github/workflows/publish.yml` are parsed from the working tree;
 * - the one `npm publish --dry-run` runs with `--offline`, `--ignore-scripts` and a `localhost` registry,
 *   so any fetch npm might attempt fails locally instead of reaching the network, and the `prepack`
 *   rebuild of the shared `dist/` is skipped (the trap `bug-022` describes in `npm-distribution.test.ts`).
 *
 * The staging orchestration (`scripts/publish-staging.cjs`), the dl-023 smoke (`scripts/e2e-smoke.cjs`) and
 * the tag check (`scripts/check-release-tag.cjs`) have their own suites: `publish-staging.test.ts`,
 * `e2e-smoke.test.ts`, `check-release-tag.test.ts` (plus the task-115 `server.json` version cases in
 * `publish-metadata.test.ts`).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { load as yamlLoad } from 'js-yaml';

import { withoutCallerNpmConfig } from './helpers/npm-env';

const REPO_ROOT = join(__dirname, '..', '..');
const WORKFLOW_PATH = join(REPO_ROOT, '.github', 'workflows', 'publish.yml');

interface PipelineManifest {
  readonly version: string;
  readonly bin?: Readonly<Record<string, string>>;
  readonly scripts?: Readonly<Record<string, string>>;
  /** task-155: the declared runtime floor the gate has to run on. */
  readonly engines?: { readonly node?: string };
}

interface WorkflowStep {
  readonly name?: string;
  readonly uses?: string;
  readonly run?: string;
  readonly if?: string;
  readonly with?: Readonly<Record<string, unknown>>;
}

interface WorkflowJob {
  readonly needs?: string | readonly string[];
  readonly if?: string;
  readonly permissions?: Readonly<Record<string, string>>;
  readonly env?: Readonly<Record<string, string>>;
  readonly steps: readonly WorkflowStep[];
}

interface Workflow {
  readonly on: Readonly<Record<string, unknown>>;
  readonly permissions?: Readonly<Record<string, string>>;
  readonly env?: Readonly<Record<string, string>>;
  readonly jobs: Readonly<Record<string, WorkflowJob>>;
}

const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf-8')) as PipelineManifest;

function readWorkflow(): { readonly raw: string; readonly parsed: Workflow } {
  const raw = readFileSync(WORKFLOW_PATH, 'utf-8');
  return { raw, parsed: yamlLoad(raw) as Workflow };
}

/** Every `run:` script of a job, joined — the unit the ordering assertions below read. */
function runs(job: WorkflowJob | undefined): string {
  return (job?.steps ?? []).map((s) => s.run ?? '').join('\n');
}

describe('publish gate (task-060) — spec-015 §2 scripts', () => {
  it('declares `prepublishOnly` as build && test && lint, in that order', () => {
    expect(pkg.scripts?.prepublishOnly).toBe('npm run build && npm test && npm run lint');
  });

  it('declares `publish:staging` as the local-first entry point running scripts/publish-staging', () => {
    expect(pkg.scripts?.['publish:staging']).toBe('node scripts/publish-staging.cjs');
    expect(existsSync(join(REPO_ROOT, 'scripts', 'publish-staging.cjs'))).toBe(true);
  });

  // `test` was `jest` until task-154 (`bug-013`): it now runs `scripts/run-tests.cjs`, the parallel
  // suite, which leaves out the latency suites; those run only when asked for, never from
  // `prepublishOnly` (`test/cli/run-tests.test.ts` pins that).
  it('declares the build/prepack/test/lint scripts spec-015 §2 names', () => {
    expect(pkg.scripts).toMatchObject({
      build: 'tsc -p tsconfig.build.json',
      prepack: 'npm run build',
      test: 'node scripts/run-tests.cjs',
      lint: 'eslint .',
    });
  });
});

describe('bin entry (bug-020) — spec-015 §1 amended: no leading `./`', () => {
  it('declares `bin.wingfoil` as `dist/cli.js`', () => {
    expect(pkg.bin).toEqual({ wingfoil: 'dist/cli.js' });
  });

  it('`npm publish --dry-run` (the stage-1 gate) no longer auto-corrects the manifest', () => {
    const result = spawnSync(
      'npm',
      ['publish', '--dry-run', '--offline', '--ignore-scripts', '--registry', 'http://localhost:4873/', '--provenance=false'],
      // None of the caller's npm configuration: `npm run -s` would silence this npm (bug-181).
      { cwd: REPO_ROOT, encoding: 'utf-8', env: withoutCallerNpmConfig(process.env) },
    );
    expect(result.status).toBe(0);
    // npm reported the publish at all: without this, an npm that printed nothing (a caller's
    // `npm_config_loglevel=silent`, bug-181) would pass the two absence checks below vacuously.
    expect(`${result.stdout}${result.stderr}`).toContain(`+ wingfoil@${pkg.version}`);
    expect(result.stderr).not.toContain('auto-corrected');
    expect(result.stderr).not.toContain('bin[wingfoil]');
  });
});

describe('publish workflow (task-060) — spec-015 §3 / adr-009', () => {
  it('exists at .github/workflows/publish.yml', () => {
    expect(existsSync(WORKFLOW_PATH)).toBe(true);
  });

  it('triggers only on a `vX.Y.Z` tag push — no branch, PR or manual trigger', () => {
    const { parsed } = readWorkflow();
    expect(Object.keys(parsed.on)).toEqual(['push']);
    expect(parsed.on.push).toEqual({ tags: ['v[0-9]+.[0-9]+.[0-9]+'] });
  });

  it('runs gate → stage → promote as a strict `needs` chain', () => {
    const { parsed } = readWorkflow();
    expect(Object.keys(parsed.jobs)).toEqual(['gate', 'stage', 'promote']);
    expect(parsed.jobs.gate?.needs).toBeUndefined();
    expect(parsed.jobs.stage?.needs).toBe('gate');
    expect(parsed.jobs.promote?.needs).toBe('stage');
  });

  it('gate asserts tag-on-main + tag↔version, then prepublishOnly, the dry-run manifest, and packs once', () => {
    const script = runs(readWorkflow().parsed.jobs.gate);
    const order = [
      'git merge-base --is-ancestor "$GITHUB_SHA" origin/main',
      'node scripts/check-release-tag.cjs "$GITHUB_REF_NAME"',
      'npm ci',
      'npm run prepublishOnly',
      'npm publish --dry-run --ignore-scripts',
      'npm pack --ignore-scripts --pack-destination',
    ].map((cmd) => script.indexOf(cmd));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('stage runs the same local-first staging script against the gate tarball', () => {
    const { parsed } = readWorkflow();
    expect(runs(parsed.jobs.stage)).toContain('npm run publish:staging -- --tarball');
    const download = parsed.jobs.stage?.steps.find((s) => s.uses?.startsWith('actions/download-artifact@'));
    const upload = parsed.jobs.gate?.steps.find((s) => s.uses?.startsWith('actions/upload-artifact@'));
    expect(download?.with?.name).toBeDefined();
    expect(download?.with?.name).toBe(upload?.with?.name);
  });

  it('promote stages the same tarball with provenance, skipped under act (task-113, spec-015 §3 stage 4)', () => {
    const { parsed } = readWorkflow();
    const promote = parsed.jobs.promote;
    const download = promote?.steps.find((s) => s.uses?.startsWith('actions/download-artifact@'));
    expect(download?.with?.name).toBe(parsed.jobs.gate?.steps.find((s) => s.uses?.startsWith('actions/upload-artifact@'))?.with?.name);
    const stage = promote?.steps.find((s) => s.run?.includes('npm stage publish'));
    expect(stage?.run).toContain('npm stage publish ./dist-pack/*.tgz --provenance --access public');
    expect(stage?.run).not.toContain('--dry-run');
    expect(stage?.if).toBe('${{ !env.ACT }}');
    expect(runs(promote)).not.toContain('npm publish');
  });

  it('grants `id-token: write` (OIDC provenance) to promote only; the workflow default is read-only', () => {
    const { parsed } = readWorkflow();
    expect(parsed.permissions).toEqual({ contents: 'read' });
    expect(parsed.jobs.promote?.permissions).toEqual({ contents: 'read', 'id-token': 'write' });
    expect(parsed.jobs.gate?.permissions).toBeUndefined();
    expect(parsed.jobs.stage?.permissions).toBeUndefined();
  });

  it('keeps gate and stage on the 22.12.0 floor and ties the choice to bug-023 (adr-010)', () => {
    const { raw, parsed } = readWorkflow();
    expect(parsed.env?.NODE_VERSION).toBe('22.12.0');
    for (const name of ['gate', 'stage']) {
      const setup = parsed.jobs[name]?.steps.find((s) => s.uses?.startsWith('actions/setup-node@'));
      expect(setup?.with?.['node-version']).toBe('${{ env.NODE_VERSION }}');
    }
    expect(raw).toContain('bug-023');
  });

  /**
   * task-155 (`bug-046`/`bug-047` same class, `adr-010`): `env.NODE_VERSION` is one more copy of the
   * floor. The case above pins it to a literal; this one ties it to `package.json`, so raising
   * `engines.node` without moving the gate (or the reverse) fails instead of testing on a Node the
   * manifest no longer declares as its floor. `ci-workflow.test.ts` keeps `ci.yml` equal to this file.
   */
  it('runs gate and stage on exactly the `engines.node` floor package.json declares', () => {
    const { parsed } = readWorkflow();
    expect(`>=${parsed.env?.NODE_VERSION ?? ''}`).toBe(pkg.engines?.node);
  });

  /**
   * task-113 AC 2 (adr-011 point 4): `npm stage publish` needs npm ≥ 11.15.0, no Node 22 release bundles
   * npm 11, and the oldest Node that bundles npm ≥ 11.15 is 24.18.0. So promote alone leaves the floor.
   */
  it('runs promote alone on an exact Node ≥ 24.18.0, and explains the asymmetry in the header', () => {
    const { raw, parsed } = readWorkflow();
    const pinned = parsed.jobs.promote?.env?.PROMOTE_NODE_VERSION ?? '';
    expect(pinned).toMatch(/^\d+\.\d+\.\d+$/);
    const [major, minor] = pinned.split('.').map(Number);
    expect((major ?? 0) > 24 || ((major ?? 0) === 24 && (minor ?? 0) >= 18)).toBe(true);
    const setup = parsed.jobs.promote?.steps.find((s) => s.uses?.startsWith('actions/setup-node@'));
    expect(setup?.with?.['node-version']).toBe('${{ env.PROMOTE_NODE_VERSION }}');
    expect(parsed.env).not.toHaveProperty('PROMOTE_NODE_VERSION');
    expect(raw).toContain('adr-011');
    expect(raw).toMatch(/npm ≥ 11\.15\.0/);
    expect(raw).toMatch(/no Node 22 release bundles npm 11/i);
  });

  it('turns off setup-node’s implicit package-manager cache in every job (explicit over inferred)', () => {
    const { parsed } = readWorkflow();
    for (const job of Object.values(parsed.jobs)) {
      const setup = job.steps.find((s) => s.uses?.startsWith('actions/setup-node@'));
      expect(setup?.with?.['package-manager-cache']).toBe(false);
    }
  });

  it('gate and stage carry no registry credential — the token is promote-only (spec-015 §5, task-061)', () => {
    const { parsed } = readWorkflow();
    for (const job of [parsed.jobs.gate, parsed.jobs.stage]) {
      const text = JSON.stringify(job);
      expect(text).not.toContain('NPM_TOKEN');
      expect(text).not.toContain('NODE_AUTH_TOKEN');
      expect(text).not.toContain('_authToken');
    }
  });

  it('documents how to exercise the workflow locally with `act` (spec-015 §3)', () => {
    const { raw } = readWorkflow();
    expect(raw).toContain('act push');
    expect(raw).toContain('--artifact-server-path');
  });
});

/**
 * task-113 AC 3 (bug-136, spec-015 §3) — every action is pinned by full commit SHA to a release whose
 * `action.yml` `runs.using` is `node24`, a runtime the hosted runners ship; the v4 releases targeted
 * Node 20, which the runners removed on 2026-09-23. A test cannot read `action.yml` offline, so the
 * runtime of each pin is established by the lookup recorded in task-113's Execution Notes
 * (`gh api repos/actions/<name>/contents/action.yml?ref=<tag>`), and this table freezes its result:
 * a pin moved without redoing that lookup fails here.
 */
describe('action pins (task-113) — full SHA, node24 release, tag in the trailing comment', () => {
  const PINS: Readonly<Record<string, readonly [sha: string, tag: string]>> = {
    'actions/checkout': ['3d3c42e5aac5ba805825da76410c181273ba90b1', 'v7.0.1'],
    'actions/setup-node': ['820762786026740c76f36085b0efc47a31fe5020', 'v7.0.0'],
    'actions/upload-artifact': ['043fb46d1a93c77aae656e7c1c64a875d1fc6a0a', 'v7.0.1'],
    'actions/download-artifact': ['3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c', 'v8.0.1'],
  };

  const usesLines = readWorkflow()
    .raw.split('\n')
    .filter((line) => /^\s*-?\s*uses:/.test(line));

  it('finds the four actions the pipeline uses', () => {
    const names = new Set(usesLines.map((l) => /uses:\s*([^@\s]+)@/.exec(l)?.[1]));
    expect([...names].sort()).toEqual(Object.keys(PINS).sort());
  });

  it.each(Object.entries(PINS))('pins %s to its node24 release by SHA, with the tag in a comment', (name, [sha, tag]) => {
    const lines = usesLines.filter((l) => l.includes(`uses: ${name}@`));
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) expect(line.trim()).toBe(`- uses: ${name}@${sha} # ${tag}`);
  });
});
