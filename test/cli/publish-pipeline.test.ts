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
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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
  readonly shell?: string;
  readonly if?: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly with?: Readonly<Record<string, unknown>>;
}

interface WorkflowJob {
  readonly needs?: string | readonly string[];
  readonly if?: string;
  readonly 'timeout-minutes'?: number;
  readonly environment?: string;
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
      // task-192 (`dl-111` Q2 (a)): `build`, not `prepack`, writes dist/build-info.json.
      build: 'tsc -p tsconfig.build.json && node scripts/write-build-info.cjs',
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

  it('runs gate → stage → promote, then release and mcp-registry each after promote (task-229, task-238)', () => {
    const { parsed } = readWorkflow();
    expect(Object.keys(parsed.jobs)).toEqual(['gate', 'stage', 'promote', 'release', 'mcp-registry']);
    expect(parsed.jobs.gate?.needs).toBeUndefined();
    expect(parsed.jobs.stage?.needs).toBe('gate');
    expect(parsed.jobs.promote?.needs).toBe('stage');
    expect(parsed.jobs.release?.needs).toBe('promote');
    expect(parsed.jobs['mcp-registry']?.needs).toBe('promote');
  });

  it('gate asserts tag-on-main + tag↔version, then prepublishOnly, the dry-run manifest, and packs once', () => {
    const script = runs(readWorkflow().parsed.jobs.gate);
    const order = [
      'git merge-base --is-ancestor "$GITHUB_SHA" origin/main',
      'node scripts/check-release-tag.cjs "$GITHUB_REF_NAME"',
      'node scripts/check-release-tag.cjs --annotated "$GITHUB_REF_NAME"',
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

  it('stage requires the stamp to name the commit the run built (task-254, bug-235)', () => {
    const { parsed } = readWorkflow();
    const step = parsed.jobs.stage?.steps.find((s) => s.run?.includes('npm run publish:staging'));
    expect(step?.run).toBe('npm run publish:staging -- --tarball dist-pack/*.tgz --expect-commit "$GITHUB_SHA"');
    // GITHUB_SHA must stay the one GitHub Actions sets for the run: nothing in the workflow overrides it.
    for (const env of [parsed.env, parsed.jobs.gate?.env, parsed.jobs.stage?.env, step?.env]) {
      expect(Object.keys(env ?? {})).not.toContain('GITHUB_SHA');
    }
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

  it('grants `id-token: write` to promote (npm OIDC, provenance) and mcp-registry (registry OIDC) only, `contents: write` to release only; the workflow default is read-only', () => {
    const { parsed } = readWorkflow();
    expect(parsed.permissions).toEqual({ contents: 'read' });
    expect(parsed.jobs.promote?.permissions).toEqual({ contents: 'read', 'id-token': 'write' });
    expect(parsed.jobs['mcp-registry']?.permissions).toEqual({ contents: 'read', 'id-token': 'write' });
    expect(parsed.jobs.release?.permissions).toEqual({ contents: 'write' });
    expect(parsed.jobs.gate?.permissions).toBeUndefined();
    expect(parsed.jobs.stage?.permissions).toBeUndefined();
    const withIdToken = Object.entries(parsed.jobs).filter(([, job]) => job.permissions?.['id-token'] !== undefined);
    expect(withIdToken.map(([name]) => name)).toEqual(['promote', 'mcp-registry']);
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
 * task-229 (`dl-130` step 1, Q1 (a); spec-015 §3) — a GitHub Release for every version npm serves. Since
 * `adr-011`, `promote` only STAGES the version, so `release` waits until `npm view wingfoil@<version> version`
 * answers that exact version: a bounded poll (planning ruling R20, Q3), capped below the hosted runner's 6-hour
 * job limit. The notes are the version's CHANGELOG.md section, extracted before the wait so a missing section
 * fails at once. `latest` is never hard-coded (dl-159 handover: `task-266` sets it from one job-level value).
 */
describe('release job (task-229) — the GitHub Release follows npm', () => {
  const release = (): WorkflowJob | undefined => readWorkflow().parsed.jobs.release;
  const step = (needle: string): WorkflowStep | undefined => release()?.steps.find((s) => s.run?.includes(needle));

  it('extracts the notes, then waits for the exact version on npm, then creates the Release — in that order', () => {
    const script = runs(release());
    const order = [
      'node scripts/changelog-section.cjs "${GITHUB_REF_NAME#v}"',
      'node scripts/wait-npm-version.cjs "$GITHUB_REF_NAME"',
      'gh release create "$GITHUB_REF_NAME"',
    ].map((cmd) => script.indexOf(cmd));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('bounds the poll with declared values, and the script gives up before GitHub kills the job (≤ 6 h hosted limit)', () => {
    const wait = step('node scripts/wait-npm-version.cjs');
    const match = /--timeout-minutes (\d+) --interval-seconds (\d+)/.exec(wait?.run ?? '');
    expect(match).not.toBeNull();
    const timeout = Number(match?.[1]);
    const interval = Number(match?.[2]);
    expect(timeout).toBeGreaterThan(0);
    expect(interval).toBeGreaterThan(0);
    const jobTimeout = release()?.['timeout-minutes'] ?? 0;
    expect(Number.isInteger(jobTimeout)).toBe(true);
    expect(jobTimeout).toBeGreaterThan(timeout);
    expect(jobTimeout).toBeLessThanOrEqual(360);
  });

  it('writes the notes to a file the create step reads, and creates only for an existing tag', () => {
    const notes = step('node scripts/changelog-section.cjs');
    expect(notes?.run).toContain('> "$RUNNER_TEMP/release-notes.md"');
    const create = step('gh release create');
    expect(create?.run).toContain('--verify-tag');
    expect(create?.run).toContain('--notes-file "$RUNNER_TEMP/release-notes.md"');
  });

  it('never hard-codes `latest`: one job-level value, empty by default, feeds an optional `--latest=`', () => {
    expect(release()?.env).toEqual({ RELEASE_MAKE_LATEST: '' });
    const create = step('gh release create');
    expect(create?.run).toContain('${RELEASE_MAKE_LATEST:+--latest="$RELEASE_MAKE_LATEST"}');
    expect(create?.run).not.toMatch(/--latest(?!=")/);
    for (const s of release()?.steps ?? []) expect(s.run ?? '').not.toMatch(/@latest\b/);
  });

  it('authenticates gh with the job token on the create step alone; no other secret, no environment', () => {
    const job = release();
    const create = job?.steps.find((s) => s.run?.includes('gh release create'));
    expect(create?.env).toEqual({ GH_TOKEN: '${{ github.token }}' });
    expect(job?.environment).toBeUndefined();
    // One parse: `release()` re-reads the file, so identity holds only within `job`.
    const others = (job?.steps ?? []).filter((s) => s !== create);
    for (const s of others) expect(s.env).toBeUndefined();
    expect(JSON.stringify(release())).not.toContain('secrets.');
  });

  it('skips the poll and the create under act, which stages nothing (like promote)', () => {
    expect(step('node scripts/wait-npm-version.cjs')?.if).toBe('${{ !env.ACT }}');
    expect(step('gh release create')?.if).toBe('${{ !env.ACT }}');
    expect(step('node scripts/changelog-section.cjs')?.if).toBeUndefined();
  });

  it('checks out the tagged tree without persisting the token and runs on the gate’s Node floor', () => {
    const job = release();
    const checkout = job?.steps.find((s) => s.uses?.startsWith('actions/checkout@'));
    expect(checkout?.with?.['persist-credentials']).toBe(false);
    const setup = job?.steps.find((s) => s.uses?.startsWith('actions/setup-node@'));
    expect(setup?.with?.['node-version']).toBe('${{ env.NODE_VERSION }}');
  });

  it('documents the release job and its recovery (re-run the failed job) in the header runbook', () => {
    const { raw } = readWorkflow();
    const header = raw.slice(0, raw.indexOf('\nname: publish'));
    expect(header).toMatch(/release\s+→/);
    expect(header).toContain('npm view wingfoil@<version> version');
    expect(header).toMatch(/Re-run failed jobs/);
    expect(header).toContain('task-229');
  });
});

/**
 * task-238 (`dl-130` step 2, `bug-173`; spec-015 §3) — the MCP Registry listing is published from this
 * workflow. `mcp-publisher login github-oidc` gets a token for `io.github.<repository owner>/*` — here
 * `io.github.wingfoil/*` — with no OAuth app in between (the 403 of `bug-173`). The registry verifies npm
 * ownership by reading `mcpName` in the PUBLISHED `package.json`, so the job waits for the exact version on npm
 * with task-229's bounded poll. `mcp-publisher` is a pinned release whose archive is checked against a frozen
 * SHA-256 before it is unpacked. `latest` is never hard-coded (dl-159 handover: task-266 extends the one `if:`).
 */
describe('mcp-registry job (task-238) — the MCP Registry listing follows npm', () => {
  /** Frozen from the release's `registry_1.8.1_checksums.txt` (task-238 Execution Notes, AC 2). */
  const MCP_PUBLISHER: readonly [version: string, sha256: string] = [
    '1.8.1',
    'a06c9096dcb9727c13555b6be26c7effa707b01f06a4c561ba7a3635443cf2cc',
  ];
  const job = (): WorkflowJob | undefined => readWorkflow().parsed.jobs['mcp-registry'];
  const step = (needle: string): WorkflowStep | undefined => job()?.steps.find((s) => s.run?.includes(needle));

  it('runs after promote, behind one job-level `if:` a later task can extend', () => {
    expect(job()?.needs).toBe('promote');
    expect(job()?.if).toBe("${{ needs.promote.result == 'success' }}");
  });

  it('installs, validates, waits for the exact version on npm, logs in over OIDC, then publishes — in that order', () => {
    const script = runs(job());
    const order = [
      'sha256sum --check --strict',
      '"$RUNNER_TEMP/mcp-publisher" validate server.json',
      'node scripts/wait-npm-version.cjs "$GITHUB_REF_NAME"',
      '"$RUNNER_TEMP/mcp-publisher" login github-oidc',
      '"$RUNNER_TEMP/mcp-publisher" publish server.json',
    ].map((cmd) => script.indexOf(cmd));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('waits with the same declared bounds as the release job, below its own timeout (≤ 6 h hosted limit)', () => {
    const wait = step('node scripts/wait-npm-version.cjs');
    const release = readWorkflow().parsed.jobs.release?.steps.find((s) => s.run?.includes('node scripts/wait-npm-version.cjs'));
    expect(wait?.run).toBe(release?.run);
    const match = /--timeout-minutes (\d+) --interval-seconds (\d+)/.exec(wait?.run ?? '');
    expect(match).not.toBeNull();
    const jobTimeout = job()?.['timeout-minutes'] ?? 0;
    expect(jobTimeout).toBeGreaterThan(Number(match?.[1]));
    expect(jobTimeout).toBeLessThanOrEqual(360);
  });

  it('pins mcp-publisher to one release and one archive SHA-256, downloaded by exact version — never `releases/latest`', () => {
    const [version, sha256] = MCP_PUBLISHER;
    expect(job()?.env).toEqual({ MCP_PUBLISHER_VERSION: version, MCP_PUBLISHER_SHA256: sha256 });
    const install = step('sha256sum --check --strict');
    expect(install?.run).toContain(
      'https://github.com/modelcontextprotocol/registry/releases/download/v${MCP_PUBLISHER_VERSION}/mcp-publisher_linux_amd64.tar.gz',
    );
    const text = JSON.stringify(job());
    expect(text).not.toContain('releases/latest');
    expect(text).not.toMatch(/@latest\b/);
    expect(text).not.toContain('--latest');
  });

  it('skips the wait, the login and the publish under act (no OIDC issuer); install and validate still run', () => {
    expect(step('node scripts/wait-npm-version.cjs')?.if).toBe('${{ !env.ACT }}');
    expect(step('login github-oidc')?.if).toBe('${{ !env.ACT }}');
    expect(step('publish server.json')?.if).toBe('${{ !env.ACT }}');
    expect(step('sha256sum --check --strict')?.if).toBeUndefined();
    expect(step('validate server.json')?.if).toBeUndefined();
  });

  it('reads no secret and uses no environment; checks out without persisting the token, on the gate’s Node floor', () => {
    const current = job();
    expect(current?.environment).toBeUndefined();
    expect(JSON.stringify(current)).not.toContain('secrets.');
    for (const s of current?.steps ?? []) expect(s.env).toBeUndefined();
    const checkout = current?.steps.find((s) => s.uses?.startsWith('actions/checkout@'));
    expect(checkout?.with?.['persist-credentials']).toBe(false);
    const setup = current?.steps.find((s) => s.uses?.startsWith('actions/setup-node@'));
    expect(setup?.with?.['node-version']).toBe('${{ env.NODE_VERSION }}');
  });

  it('documents the job, the OIDC namespace and the re-run recovery as runbook step 8, after step 7', () => {
    const { raw } = readWorkflow();
    const header = raw.slice(0, raw.indexOf('\nname: publish'));
    expect(header).toMatch(/mcp-registry\s+→/);
    expect(header).toContain('io.github.wingfoil');
    expect(header).toContain('bug-173');
    const seven = header.search(/\n#\s+7\. /);
    const eight = header.search(/\n#\s+8\. /);
    expect(seven).toBeGreaterThan(0);
    expect(eight).toBeGreaterThan(seven);
    const stepEight = header.slice(eight, header.indexOf('Rollback posture'));
    expect(stepEight).toContain('mcp-registry');
    expect(stepEight).toMatch(/Re-run failed jobs/);
  });

  /** The install step, executed with bash and a fake `curl` that serves a locally built archive. */
  describe('install step — executed with a fake curl', () => {
    let work: string;
    let archiveSha256: string;

    beforeEach(() => {
      work = mkdtempSync(join(tmpdir(), 'wf-mcp-publisher-'));
      for (const dir of ['bin', 'pkg', 'runner-temp', 'record']) mkdirSync(join(work, dir));
      writeFileSync(join(work, 'pkg', 'mcp-publisher'), '#!/usr/bin/env bash\necho "mcp-publisher fake"\n');
      chmodSync(join(work, 'pkg', 'mcp-publisher'), 0o755);
      writeFileSync(join(work, 'pkg', 'README.md'), 'not extracted\n');
      const archive = join(work, 'archive.tar.gz');
      const tar = spawnSync('tar', ['-czf', archive, '-C', join(work, 'pkg'), 'mcp-publisher', 'README.md']);
      expect(tar.status).toBe(0);
      archiveSha256 = createHash('sha256').update(readFileSync(archive)).digest('hex');
      // Records the URL and writes the archive to the `-o` path, like `curl -fsSL -o <file> <url>`.
      writeFileSync(
        join(work, 'bin', 'curl'),
        [
          '#!/usr/bin/env bash',
          'out=""; url=""',
          'while [ $# -gt 0 ]; do case "$1" in -o) out="$2"; shift 2;; -*) shift;; *) url="$1"; shift;; esac; done',
          'printf "%s\\n" "$url" > "$RECORD_DIR/url"',
          'cp "$FAKE_ARCHIVE" "$out"',
        ].join('\n'),
      );
      chmodSync(join(work, 'bin', 'curl'), 0o755);
    });

    afterEach(() => rmSync(work, { recursive: true, force: true }));

    it('declares `shell: bash`, so GitHub runs it with -eo pipefail as this test does (review F5)', () => {
      expect(step('sha256sum --check --strict')?.shell).toBe('bash');
    });

    function runInstall(sha256: string): number | null {
      const install = step('sha256sum --check --strict');
      // `shell: bash` runs `bash --noprofile --norc -eo pipefail {0}` on GitHub-hosted runners.
      const result = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', install?.run ?? 'exit 99'], {
        cwd: work,
        encoding: 'utf-8',
        env: {
          PATH: `${join(work, 'bin')}:${process.env.PATH ?? ''}`,
          RECORD_DIR: join(work, 'record'),
          FAKE_ARCHIVE: join(work, 'archive.tar.gz'),
          RUNNER_TEMP: join(work, 'runner-temp'),
          MCP_PUBLISHER_VERSION: MCP_PUBLISHER[0],
          MCP_PUBLISHER_SHA256: sha256,
        },
      });
      return result.status;
    }

    it('downloads the pinned release asset and unpacks only the binary when the checksum matches', () => {
      expect(runInstall(archiveSha256)).toBe(0);
      expect(readFileSync(join(work, 'record', 'url'), 'utf-8').trim()).toBe(
        `https://github.com/modelcontextprotocol/registry/releases/download/v${MCP_PUBLISHER[0]}/mcp-publisher_linux_amd64.tar.gz`,
      );
      expect(existsSync(join(work, 'runner-temp', 'mcp-publisher'))).toBe(true);
      expect(existsSync(join(work, 'runner-temp', 'README.md'))).toBe(false);
    });

    it('fails before unpacking when the archive does not match the pinned SHA-256', () => {
      expect(runInstall(MCP_PUBLISHER[1])).not.toBe(0);
      expect(existsSync(join(work, 'runner-temp', 'mcp-publisher'))).toBe(false);
    });
  });
});

/**
 * task-238 (`dl-057` (b), option 1) — every job is bounded in time. The values are task-077's measured table
 * (gate 15, stage 20, promote 30), and the two polling jobs carry their poll's bound plus a margin. The header
 * states each job's value next to its name, so a value changed in one place only fails here.
 */
describe('job timeouts (task-238) — dl-057 (b)', () => {
  it('declares a positive integer `timeout-minutes` on every job, the hosted 6 h limit at most', () => {
    const { parsed } = readWorkflow();
    for (const [name, job] of Object.entries(parsed.jobs)) {
      const minutes = job['timeout-minutes'];
      expect([name, Number.isInteger(minutes) && (minutes ?? 0) > 0]).toEqual([name, true]);
      expect(minutes).toBeLessThanOrEqual(360);
    }
  });

  it('states each value and its sources (task-077’s measured table, the CI packaging gate) in the header', () => {
    const { raw, parsed } = readWorkflow();
    const header = raw.slice(0, raw.indexOf('\nname: publish'));
    expect(header).toContain('task-077');
    expect(header).toContain('dl-057');
    // review F1: today's prepublishOnly takes ~7 min on a hosted runner (CI run 38166281488), not task-077's 3.
    expect(header).toContain('38166281488');
    for (const [name, job] of Object.entries(parsed.jobs)) {
      expect(header).toContain(`${name} ${String(job['timeout-minutes'])}`);
    }
    expect(parsed.jobs.gate?.['timeout-minutes']).toBe(30);
    expect(parsed.jobs.stage?.['timeout-minutes']).toBe(20);
    expect(parsed.jobs.promote?.['timeout-minutes']).toBe(30);
  });
});

/**
 * task-238 (`bug-174`, `bug-060`) — the runbook says where npm's Staged Packages tab is, that a staged version
 * first sits in an automated review, and how to meet npm ≥ 11.15.0 without a global upgrade; the `act` recipe
 * says it cannot run from a git worktree, and why. The `publish` phase of `release-publishing.yaml` carries the
 * same npm wording.
 */
describe('publish runbook (task-238) — bug-174, bug-060', () => {
  const header = (): string => {
    const { raw } = readWorkflow();
    return raw.slice(0, raw.indexOf('\nname: publish'));
  };

  it('step 6 names the account menu → Staged Packages, the automated review before Approve, and npx npm@<version>', () => {
    const text = header();
    const six = text.slice(text.search(/\n#\s+6\. /), text.search(/\n#\s+7\. /));
    expect(six).toMatch(/account menu/i);
    expect(six).toContain('Staged Packages');
    expect(six).toMatch(/automated review/i);
    expect(six).toContain('npx -y npm@<version> stage approve <stage-id>');
    expect(six).toContain('11.15.0');
  });

  it('the release-publishing `publish` phase names the same tab, review state and npx form', () => {
    const doc = yamlLoad(
      readFileSync(join(REPO_ROOT, '.wingfoil', 'workflows', 'custom', 'release-publishing.yaml'), 'utf-8'),
    ) as { readonly phases: readonly { readonly name: string; readonly description?: string }[] };
    const description = doc.phases.find((p) => p.name === 'publish')?.description ?? '';
    expect(description).toMatch(/account menu/i);
    expect(description).toContain('Staged Packages');
    expect(description).toMatch(/automated review/i);
    expect(description).toContain('npx -y npm@<version> stage approve <stage-id>');
    expect(description).toContain('mcp-registry');
  });

  it('the act recipe says it cannot run from a git worktree, why, and to clone first', () => {
    const text = header();
    const act = text.slice(text.indexOf('Running this workflow locally with `act`'));
    expect(act).toMatch(/git worktree/);
    expect(act).toMatch(/`\.git` is a file/);
    expect(act).toMatch(/git clone/);
    expect(act).toContain('bug-060');
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
