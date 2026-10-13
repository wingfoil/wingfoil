/**
 * task-234-publish-documentation-site-api-reference-llms-txt-index (`dl-129` §3, Q3 (b); `dl-116`) —
 * AC 2: `llms.txt` is generated from a declared list and served at the site root and the repository
 * root; a test fails if a listed path does not exist. Plus AC 3's `user-docs.yaml` rows: the
 * `align-user-docs` phase produces `llms.txt` and the site's declared sources, version bumped.
 *
 * The declared list is `docs/site.yaml`, read by both consumers — `scripts/build-site.cjs` assembles the
 * site and renders `llms.txt` from it — so the two cannot drift. The parity guard has `dl-116`'s
 * shape: two sides, one derived from the other. Here they are the manifest and the tree it names
 * (`checkSiteManifest` over the real repository returns no problem), and the committed `llms.txt` and
 * its render from the manifest (byte for byte).
 *
 * The module is loaded inside each case through a dynamic `import()` (jest's CommonJS harness turns it
 * into a `require`) after an existence expectation: before this task neither the script nor the
 * manifest exists, and the suite must fail on that assertion, not crash while loading. The interface
 * is the design's (`### design`, Execution Notes); the script's own `.d.cts` comes with it. The loader and
 * the fixture project live in `support/site-fixture.ts`, shared with `build-site-confinement.test.ts`.
 *
 * Deterministic: fixtures are temp directories built here and removed after each case; the real
 * repository is only read, and `assembleSite` writes into a temp directory.
 *
 * T1 classification: red-first throughout (none of `docs/site.yaml`, `llms.txt`,
 * `scripts/build-site.cjs`, the `produces:` rows or `user-docs.yaml` 1.6 exists at `db0e2752`).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { load as yamlLoad } from 'js-yaml';

import {
  BUILD_SITE_SCRIPT as SCRIPT,
  buildSite,
  FIXTURE_HOMEPAGE,
  FIXTURE_LLMS_TXT,
  FIXTURE_SITE_YAML,
  siteProblems,
  writeSiteFixture,
} from './support/site-fixture';
import type { PackageJson } from './support/site-fixture';

const REPO_ROOT = join(__dirname, '..', '..');
const SITE_MANIFEST = join(REPO_ROOT, 'docs', 'site.yaml');
const LLMS_TXT = join(REPO_ROOT, 'llms.txt');
const USER_DOCS = join(REPO_ROOT, '.wingfoil', 'workflows', 'custom', 'user-docs.yaml');

const REF = '0123456789abcdef0123456789abcdef01234567';

interface SiteManifestYaml {
  readonly pages?: readonly string[];
  readonly files?: readonly string[];
  readonly llms?: ReadonlyArray<{
    readonly section?: string;
    readonly entries?: ReadonlyArray<{ readonly path?: string; readonly site_path?: string; readonly built_by?: string }>;
  }>;
}

function pkg(): PackageJson {
  return JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf-8')) as PackageJson;
}

function realManifestYaml(): SiteManifestYaml {
  expect(existsSync(SITE_MANIFEST)).toBe(true);
  return yamlLoad(readFileSync(SITE_MANIFEST, 'utf-8')) as SiteManifestYaml;
}

/** Every file under `dir`, relative to `base`, POSIX separators, sorted. */
function walk(base: string, dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(base, dir)).sort()) {
    const rel = `${dir.replace(/\/$/, '')}/${name}`;
    if (statSync(join(base, rel)).isDirectory()) out.push(...walk(base, rel));
    else out.push(rel);
  }
  return out;
}

// ---------------------------------------------------------------- fixtures (test/docs/support/site-fixture.ts)

let fixtures: string[] = [];

afterEach(() => {
  for (const dir of fixtures) rmSync(dir, { recursive: true, force: true });
  fixtures = [];
});

/** A sound fixture project; `siteYaml` replaces the manifest, `extra` adds files. */
function fixture(siteYaml: string = FIXTURE_SITE_YAML, extra: Readonly<Record<string, string>> = {}): string {
  const root = mkdtempSync(join(tmpdir(), 'wf-task-234-site-'));
  fixtures.push(root);
  return writeSiteFixture(root, siteYaml, extra);
}

const problems = siteProblems;

// ---------------------------------------------------------------- AC 2: parity on the real repository

describe('llms.txt (task-234) — AC 2: the declared list names only real paths (dl-116 parity)', () => {
  it('AC 2: docs/site.yaml exists and checkSiteManifest finds no problem in this repository', async () => {
    expect(existsSync(SITE_MANIFEST)).toBe(true);
    const site = await buildSite();
    expect(site.checkSiteManifest(REPO_ROOT, site.readSiteManifest(REPO_ROOT), pkg().scripts ?? {})).toEqual([]);
  });

  it('AC 2: llms.txt exists at the repository root and equals its render from docs/site.yaml, byte for byte', async () => {
    expect(existsSync(LLMS_TXT)).toBe(true);
    const site = await buildSite();
    const homepage = pkg().homepage ?? '';
    expect(readFileSync(LLMS_TXT, 'utf-8')).toBe(site.renderLlmsTxt(site.readSiteManifest(REPO_ROOT), homepage));
  });

  it('AC 2 (dl-129 Decision 3): indexes the user guide, CLI reference, agents guide, examples and the API reference', () => {
    const entries = (realManifestYaml().llms ?? []).flatMap((section) => section.entries ?? []);
    const paths = entries.map((e) => e.path).filter((p): p is string => p !== undefined);
    for (const p of ['docs/user-guide.md', 'docs/cli-reference.md', 'docs/agents.md', 'docs/examples/README.md']) {
      expect(paths).toContain(p);
    }
    expect(entries.filter((e) => e.site_path === 'api/' && e.built_by === 'docs:api')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------- AC 2: the check, one problem per line

describe('llms.txt (task-234) — AC 2: checkSiteManifest names each problem', () => {
  it('AC 2: a sound fixture has no problem', async () => {
    expect(await problems(fixture())).toEqual([]);
  });

  it('AC 2: a listed page that does not exist', async () => {
    const root = fixture(FIXTURE_SITE_YAML.replace('  - docs/guide.md\nfiles:', '  - docs/guide.md\n  - docs/missing.md\nfiles:'));
    expect(await problems(root)).toEqual(['docs/site.yaml: listed path does not exist: docs/missing.md']);
  });

  it('AC 2: a listed llms path that does not exist', async () => {
    const root = fixture(FIXTURE_SITE_YAML.replace('path: docs/examples/README.md', 'path: docs/examples/gone.md'));
    expect(await problems(root)).toEqual(['docs/site.yaml: listed path does not exist: docs/examples/gone.md']);
  });

  it('AC 2: an llms path that is not part of the site', async () => {
    const root = fixture(FIXTURE_SITE_YAML.replace('path: docs/guide.md,', 'path: docs/other.md,'), {
      'docs/other.md': '# Other\n',
    });
    expect(await problems(root)).toEqual(['docs/site.yaml: llms entry is not part of the site: docs/other.md']);
  });

  it('AC 2: an llms entry built by an unknown npm script', async () => {
    const root = fixture(FIXTURE_SITE_YAML.replace('built_by: "docs:api"', 'built_by: nope'));
    expect(await problems(root)).toEqual(['docs/site.yaml: unknown npm script: nope']);
  });

  it.each([['{{ site.title }}'], ['{% raw %}']])('AC 2: a page containing a Liquid tag (%s)', async (tag) => {
    const root = fixture(FIXTURE_SITE_YAML, { 'docs/guide.md': `# Guide\n\n${tag}\n` });
    expect(await problems(root)).toEqual([
      'docs/site.yaml: page contains a Liquid tag, which Jekyll would evaluate: docs/guide.md',
    ]);
  });

  it('AC 2: several problems come back sorted', async () => {
    const root = fixture(
      FIXTURE_SITE_YAML.replace('built_by: "docs:api"', 'built_by: nope').replace(
        '  - docs/guide.md\nfiles:',
        '  - docs/guide.md\n  - docs/missing.md\nfiles:',
      ),
    );
    const found = await problems(root);
    expect(found).toHaveLength(2);
    expect(found).toEqual([...found].sort());
  });
});

// ---------------------------------------------------------------- AC 2: the render contract

describe('llms.txt (task-234) — AC 2: renderLlmsTxt', () => {
  it('AC 2: renders the header, the blockquote, the sections in order and absolute entry URLs, one trailing newline', async () => {
    const site = await buildSite();
    const root = fixture();
    expect(site.renderLlmsTxt(site.readSiteManifest(root), FIXTURE_HOMEPAGE)).toBe(FIXTURE_LLMS_TXT);
  });

  it('AC 2: two renders of the same manifest are equal (determinism)', async () => {
    const site = await buildSite();
    const manifest = site.readSiteManifest(fixture());
    expect(site.renderLlmsTxt(manifest, FIXTURE_HOMEPAGE)).toBe(site.renderLlmsTxt(manifest, FIXTURE_HOMEPAGE));
  });
});

// ---------------------------------------------------------------- AC 2: the same file at the site root

describe('llms.txt (task-234) — AC 2: assembleSite puts the same llms.txt at the site root', () => {
  it('AC 2: assembles this repository: llms.txt byte-equal to the root one, every listed page and file, _config.yml', async () => {
    const site = await buildSite();
    const tmp = mkdtempSync(join(tmpdir(), 'wf-task-234-out-'));
    fixtures.push(tmp);
    const out = join(tmp, 'out');
    const result = site.assembleSite(REPO_ROOT, out, { ref: REF });

    expect(existsSync(LLMS_TXT)).toBe(true);
    expect(readFileSync(join(out, 'llms.txt'), 'utf-8')).toBe(readFileSync(LLMS_TXT, 'utf-8'));
    expect(existsSync(join(out, '_config.yml'))).toBe(true);

    const manifest = realManifestYaml();
    for (const page of manifest.pages ?? []) expect(existsSync(join(out, page))).toBe(true);
    for (const dir of manifest.files ?? []) {
      for (const file of walk(REPO_ROOT, dir)) expect(existsSync(join(out, file))).toBe(true);
    }

    expect([...result.files]).toEqual([...result.files].sort());
    for (const file of result.files) expect(existsSync(resolve(out, file))).toBe(true);
  });

  it('AC 2 (ruling 4): an out-of-site link is rewritten to the repository at the built commit; in-site links are kept', async () => {
    const site = await buildSite();
    const tmp = mkdtempSync(join(tmpdir(), 'wf-task-234-out-'));
    fixtures.push(tmp);
    const out = join(tmp, 'out');
    site.assembleSite(REPO_ROOT, out, { ref: REF });
    const readme = readFileSync(join(out, 'README.md'), 'utf-8');
    expect(readme).toContain(`](https://github.com/wingfoil/wingfoil/tree/${REF}/docs/)`);
    expect(readme).not.toContain('](docs/)');
    expect(readme).toContain('](docs/user-guide.md)');
  });

  it('AC 2: refuses an output directory that is not empty', async () => {
    const site = await buildSite();
    const tmp = mkdtempSync(join(tmpdir(), 'wf-task-234-out-'));
    fixtures.push(tmp);
    const out = join(tmp, 'out');
    site.assembleSite(REPO_ROOT, out, { ref: REF });
    expect(() => site.assembleSite(REPO_ROOT, out, { ref: REF })).toThrow();
  });
});

// ---------------------------------------------------------------- AC 2: the CLI

describe('llms.txt (task-234) — AC 2: node scripts/build-site.cjs', () => {
  function cli(args: readonly string[]): ReturnType<typeof spawnSync> {
    expect(existsSync(SCRIPT)).toBe(true);
    return spawnSync(process.execPath, [SCRIPT, ...args], { cwd: REPO_ROOT, encoding: 'utf-8' });
  }

  it('AC 2: `llms --check` passes on this repository', () => {
    const run = cli(['llms', '--check']);
    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
  });

  it('AC 2: `llms --check` exits 1 naming llms.txt when the committed file differs from the render', () => {
    const root = fixture(FIXTURE_SITE_YAML, { 'llms.txt': '# stale\n' });
    const run = cli(['llms', '--check', '--root', root]);
    expect(run.status).toBe(1);
    expect(String(run.stderr)).toContain('llms.txt');
  });

  it('AC 2: `llms --check` passes on a fixture whose llms.txt is the render', () => {
    const root = fixture(FIXTURE_SITE_YAML, { 'llms.txt': FIXTURE_LLMS_TXT });
    expect(cli(['llms', '--check', '--root', root]).status).toBe(0);
  });

  it('AC 2: an unknown sub-command exits 2 (spec-008)', () => {
    expect(cli(['nope']).status).toBe(2);
  });
});

// ---------------------------------------------------------------- AC 3: user-docs.yaml

interface UserDocsWorkflow {
  readonly version?: number;
  readonly phases?: ReadonlyArray<{
    readonly name?: string;
    readonly produces?: ReadonlyArray<string | { readonly path?: string }>;
  }>;
}

describe('user-docs.yaml (task-234) — AC 3: align-user-docs produces the site sources', () => {
  const raw = readFileSync(USER_DOCS, 'utf-8');
  const workflow = yamlLoad(raw) as UserDocsWorkflow;

  it('AC 3: align-user-docs produces llms.txt and docs/site.yaml', () => {
    const phase = (workflow.phases ?? []).find((p) => p.name === 'align-user-docs');
    const produces = (phase?.produces ?? []).map((entry) => (typeof entry === 'string' ? entry : entry.path));
    expect(produces).toContain('llms.txt');
    expect(produces).toContain('docs/site.yaml');
  });

  it('AC 3: the version moved past 1.5, with the 1.6 dl-129 history line (bug-314: at least, never exact)', () => {
    expect(workflow.version).toBeGreaterThan(1.5);
    const header = raw.split('\n').find((line) => /^version:/.test(line)) ?? '';
    expect(header).toContain('1.6 dl-129');
  });
});
