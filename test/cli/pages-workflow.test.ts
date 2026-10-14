/**
 * task-234-publish-documentation-site-api-reference-llms-txt-index (`dl-129` §2, Q2 (b), REQ-SYS-09) —
 * AC 1: a Pages workflow assembles the user-docs Markdown and the `npm run docs:api` output into one
 * artefact, with no new dependency.
 *
 * Asserted offline, as `ci-workflow.test.ts` and `scorecard-workflow.test.ts` do: the workflow file is
 * parsed from the working tree with `js-yaml`; nothing here runs it. Its first real run is the
 * approver's, after a push (AC 4, manual — the task's post-merge handover).
 *
 * The shape is the task's design (Execution Notes, `### design`) under the approver's rulings of
 * 2026-10-13 (w3-b7 notes): (1) the trigger is the release tag — the same `vX.Y.Z` filter as
 * `publish.yml` — plus `workflow_dispatch`; (2) rendering by GitHub's own `actions/jekyll-build-pages`
 * (a docker action, not an npm package); and batch ruling D4: a NEW workflow file, `publish.yml`
 * untouched. The four Pages actions are pinned by full SHA, the release tag in a trailing comment,
 * frozen to the lookup recorded in the design (a pin moved without redoing it fails here).
 *
 * T1 classification: red-first — `.github/workflows/pages.yml`, `docs/site.yaml` and
 * `scripts/build-site.cjs` do not exist before this task, so every case reading them fails on an
 * existence expectation (never a test-file crash). The `publish.yml` case is characterization: it
 * already holds and pins that the Pages grant stays out of the publish pipeline.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { load as yamlLoad } from 'js-yaml';

const REPO_ROOT = join(__dirname, '..', '..');
const PAGES_PATH = join(REPO_ROOT, '.github', 'workflows', 'pages.yml');
const PUBLISH_PATH = join(REPO_ROOT, '.github', 'workflows', 'publish.yml');
const SITE_MANIFEST_PATH = join(REPO_ROOT, 'docs', 'site.yaml');
const BUILD_SITE_PATH = join(REPO_ROOT, 'scripts', 'build-site.cjs');

/** The four Pages actions, frozen to the design's read-only lookup (`gh api …/releases/latest`, then the tag's commit). */
const PAGES_PINS = [
  'uses: actions/configure-pages@45bfe0192ca1faeb007ade9deae92b16b8254a0d # v6.0.0',
  'uses: actions/jekyll-build-pages@44a6e6beabd48582f863aeeb6cb2151cc1716697 # v1.0.13',
  'uses: actions/upload-pages-artifact@fc324d3547104276b827a68afc52ff2a11cc49c9 # v5.0.0',
  'uses: actions/deploy-pages@368f82528645a54fb793d4d04e342629a3f51346 # v5.0.1',
] as const;

interface WorkflowStep {
  readonly id?: string;
  readonly name?: string;
  readonly uses?: string;
  readonly run?: string;
  readonly with?: Readonly<Record<string, unknown>>;
}

interface WorkflowJob {
  readonly 'runs-on'?: string;
  readonly 'timeout-minutes'?: number;
  readonly needs?: string | readonly string[];
  readonly permissions?: Readonly<Record<string, string>>;
  readonly environment?: unknown;
  readonly steps: readonly WorkflowStep[];
}

interface Workflow {
  readonly on: Readonly<Record<string, unknown>>;
  readonly permissions?: Readonly<Record<string, string>>;
  readonly concurrency?: unknown;
  readonly env?: Readonly<Record<string, unknown>>;
  readonly jobs: Readonly<Record<string, WorkflowJob>>;
}

interface SiteManifestEntry {
  readonly site_path?: string;
  readonly built_by?: string;
}

interface SiteManifestYaml {
  readonly llms?: ReadonlyArray<{ readonly entries?: readonly SiteManifestEntry[] }>;
}

function read(path: string): { readonly raw: string; readonly parsed: Workflow } {
  const raw = readFileSync(path, 'utf-8');
  return { raw, parsed: yamlLoad(raw) as Workflow };
}

/** The Pages workflow — its absence is a failing expectation, not a crash. */
function pages(): { readonly raw: string; readonly parsed: Workflow } {
  expect(existsSync(PAGES_PATH)).toBe(true);
  return read(PAGES_PATH);
}

/** The `uses:` lines of a workflow, trimmed and without a list dash — `- id: x` steps put `uses:` on its own line. */
function usesLines(raw: string): string[] {
  return raw
    .split('\n')
    .filter((line) => /^\s*-?\s*uses:/.test(line))
    .map((line) => line.trim().replace(/^-\s*/, ''));
}

/** The workflow's YAML without its comment lines: a header may explain what the file must never do. */
function uncommented(raw: string): string {
  return raw
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n');
}

function job(name: string): WorkflowJob {
  const found = pages().parsed.jobs[name];
  expect(found).toBeDefined();
  return found as WorkflowJob;
}

function stepIndex(steps: readonly WorkflowStep[], predicate: (s: WorkflowStep) => boolean): number {
  return steps.findIndex(predicate);
}

const uses = (action: string) => (s: WorkflowStep) => s.uses?.startsWith(`${action}@`) === true;
const runs = (fragment: string) => (s: WorkflowStep) => s.run?.includes(fragment) === true;

describe('pages workflow (task-234) — AC 1: the site in a new workflow file (D4)', () => {
  it('AC 1: exists at .github/workflows/pages.yml', () => {
    expect(existsSync(PAGES_PATH)).toBe(true);
  });

  it('AC 1 (ruling 1): triggers on the release tag — publish.yml\'s own filter — and on workflow_dispatch, nothing else', () => {
    const { parsed } = pages();
    const publish = read(PUBLISH_PATH).parsed;
    expect(Object.keys(parsed.on).sort()).toEqual(['push', 'workflow_dispatch']);
    const push = parsed.on.push as Readonly<Record<string, unknown>>;
    expect(Object.keys(push)).toEqual(['tags']);
    expect(push.tags).toEqual((publish.on.push as Readonly<Record<string, unknown>>).tags);
  });

  it('AC 1: read-only at the top, the Pages grant on the deploy job only', () => {
    const { parsed } = pages();
    expect(parsed.permissions).toEqual({ contents: 'read' });
    expect(job('build').permissions).toBeUndefined();
    expect(job('deploy').permissions).toEqual({ pages: 'write', 'id-token': 'write' });
  });

  it('AC 1: two jobs, build then deploy, on ubuntu-24.04 with a positive timeout', () => {
    const { parsed } = pages();
    expect(Object.keys(parsed.jobs).sort()).toEqual(['build', 'deploy']);
    for (const name of ['build', 'deploy']) {
      const j = job(name);
      expect(j['runs-on']).toBe('ubuntu-24.04');
      expect(typeof j['timeout-minutes']).toBe('number');
      expect(j['timeout-minutes']).toBeGreaterThan(0);
    }
    const needs = job('deploy').needs;
    expect(Array.isArray(needs) ? needs : [needs]).toEqual(['build']);
  });

  it('AC 1: one deployment at a time, never cancelled half-way', () => {
    expect(pages().parsed.concurrency).toEqual({ group: 'pages', 'cancel-in-progress': false });
  });

  it('AC 1: runs the same Node version as publish.yml', () => {
    const { parsed } = pages();
    expect(parsed.env?.NODE_VERSION).toBeDefined();
    expect(parsed.env?.NODE_VERSION).toBe(read(PUBLISH_PATH).parsed.env?.NODE_VERSION);
  });

  it('AC 1: deploys to the github-pages environment from one deploy-pages step', () => {
    const deploy = job('deploy');
    expect(deploy.environment).toEqual({
      name: 'github-pages',
      url: '${{ steps.deployment.outputs.page_url }}',
    });
    expect(deploy.steps).toHaveLength(1);
    expect(deploy.steps[0]?.id).toBe('deployment');
    expect(deploy.steps[0]?.uses?.startsWith('actions/deploy-pages@')).toBe(true);
  });

  it('AC 1: the build assembles the Markdown and the TypeDoc output into ONE artefact, in order', () => {
    const steps = job('build').steps;
    const order = [
      stepIndex(steps, uses('actions/checkout')),
      stepIndex(steps, uses('actions/setup-node')),
      stepIndex(steps, (s) => s.run?.trim() === 'npm ci'),
      stepIndex(steps, runs('node scripts/build-site.cjs site --out _site-src --ref "$GITHUB_SHA"')),
      stepIndex(steps, runs('npm run docs:api -- --emit docs --out _site-src/api')),
      stepIndex(steps, uses('actions/configure-pages')),
      stepIndex(steps, uses('actions/jekyll-build-pages')),
      stepIndex(steps, uses('actions/upload-pages-artifact')),
    ];
    for (const index of order) expect(index).toBeGreaterThanOrEqual(0);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(new Set(order).size).toBe(order.length);

    const jekyll = steps.find(uses('actions/jekyll-build-pages'));
    expect(jekyll?.with).toEqual({ source: './_site-src', destination: './_site' });
    const upload = steps.filter(uses('actions/upload-pages-artifact'));
    expect(upload).toHaveLength(1);
    expect(upload[0]?.with?.path).toBe('./_site');
  });

  it('AC 1: checkout and setup-node reuse publish.yml\'s pins, without credentials or a package-manager cache', () => {
    const publishUses = new Set(usesLines(read(PUBLISH_PATH).raw));
    const lines = usesLines(pages().raw);
    for (const action of ['actions/checkout@', 'actions/setup-node@']) {
      const line = lines.filter((l) => l.includes(action));
      expect(line).toHaveLength(1);
      expect(publishUses.has(line[0] as string)).toBe(true);
    }
    const steps = job('build').steps;
    expect(steps.find(uses('actions/checkout'))?.with?.['persist-credentials']).toBe(false);
    expect(steps.find(uses('actions/setup-node'))?.with?.['package-manager-cache']).toBe(false);
  });

  it('AC 1: pins the four Pages actions by full SHA exactly as the design recorded them', () => {
    const lines = usesLines(pages().raw);
    for (const line of lines) expect(line).toMatch(/^uses: [\w.-]+\/[\w./-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/);
    for (const pin of PAGES_PINS) expect(lines).toContain(pin);
    const actions = lines.map((l) => l.replace(/^uses: /, '').replace(/@.*$/, '')).sort();
    expect(actions).toEqual(
      [
        'actions/checkout',
        'actions/setup-node',
        'actions/configure-pages',
        'actions/jekyll-build-pages',
        'actions/upload-pages-artifact',
        'actions/deploy-pages',
      ].sort(),
    );
  });

  it('AC 1: no secret, no workflow artefact, no package installed beyond npm ci', () => {
    const yaml = uncommented(pages().raw);
    expect(yaml).not.toContain('secrets.');
    expect(yaml).not.toContain('upload-artifact@');
    expect(yaml).not.toMatch(/\bnpm install\b/);
    expect(yaml).not.toMatch(/\bgem install\b/);
    expect(yaml).not.toMatch(/\bpip3?\b/);
  });

  it('AC 1 (D4, characterization): publish.yml carries no Pages deployment and no Pages grant', () => {
    const raw = readFileSync(PUBLISH_PATH, 'utf-8');
    expect(raw).not.toContain('deploy-pages');
    expect(raw).not.toContain('pages: write');
  });

  it('AC 1: no new dependency — build-site.cjs requires only node: built-ins and js-yaml', () => {
    expect(existsSync(BUILD_SITE_PATH)).toBe(true);
    const source = readFileSync(BUILD_SITE_PATH, 'utf-8');
    const required = [...source.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1] as string);
    expect(required.length).toBeGreaterThan(0);
    for (const name of required) {
      expect(name === 'js-yaml' || name.startsWith('node:')).toBe(true);
    }
  });

  it('AC 1: the API reference lands where docs/site.yaml indexes it (site_path api/ ↔ --out _site-src/api)', () => {
    expect(existsSync(SITE_MANIFEST_PATH)).toBe(true);
    const manifest = yamlLoad(readFileSync(SITE_MANIFEST_PATH, 'utf-8')) as SiteManifestYaml;
    const api = (manifest.llms ?? [])
      .flatMap((section) => section.entries ?? [])
      .filter((entry) => entry.built_by === 'docs:api');
    expect(api).toHaveLength(1);
    expect(api[0]?.site_path).toBe('api/');

    const run = job('build').steps.find(runs('npm run docs:api'))?.run ?? '';
    const out = /--out\s+(\S+)/.exec(run)?.[1];
    expect(out).toBe(`_site-src/${(api[0]?.site_path ?? '').replace(/\/$/, '')}`);
  });
});
