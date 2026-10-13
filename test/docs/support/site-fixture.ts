/**
 * Fixtures and loader for the `scripts/build-site.cjs` suites (task-234: `test/docs/llms-txt.test.ts` and
 * `test/docs/build-site-confinement.test.ts`).
 *
 * The script is loaded through a dynamic `import()` (jest's CommonJS harness turns it into a `require`; a bare
 * `require` is refused by the lint gate) after an existence expectation, so a missing script is a failing
 * assertion, not a crash while loading. The interface is the task design's; the manifest stays opaque — always
 * obtained from `readSiteManifest`.
 *
 * A fixture project is a `package.json` (homepage, repository, a `docs:api` script), a `docs/site.yaml` and the
 * three files it lists; callers create the directory and remove it. Deterministic: fixed contents, no clock.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const BUILD_SITE_SCRIPT = join(__dirname, '..', '..', '..', 'scripts', 'build-site.cjs');

/** The design's interface of `scripts/build-site.cjs`; the manifest is opaque here — always obtained from `readSiteManifest`. */
export type SiteManifest = object;

export interface BuildSite {
  readonly readSiteManifest: (root: string) => SiteManifest;
  readonly checkSiteManifest: (
    root: string,
    manifest: SiteManifest,
    scripts: Readonly<Record<string, string>>,
  ) => string[];
  readonly renderLlmsTxt: (manifest: SiteManifest, homepage: string) => string;
  readonly assembleSite: (root: string, outDir: string, options: { readonly ref: string }) => { readonly files: readonly string[] };
}

export interface PackageJson {
  readonly homepage?: string;
  readonly scripts?: Readonly<Record<string, string>>;
}

export async function buildSite(): Promise<BuildSite> {
  expect(existsSync(BUILD_SITE_SCRIPT)).toBe(true);
  return (await import(BUILD_SITE_SCRIPT)) as BuildSite;
}

export const FIXTURE_HOMEPAGE = 'https://example.github.io/fixture/';

export const FIXTURE_SITE_YAML = `version: 1.0
title: Fixture
summary: "A fixture site."
pages:
  - README.md
  - docs/guide.md
files:
  - docs/examples/
llms:
  - section: Docs
    entries:
      - { title: Guide, path: docs/guide.md, about: "How to." }
      - { title: Examples, path: docs/examples/README.md, about: "Runnable." }
  - section: Optional
    entries:
      - { title: API, site_path: api/, built_by: "docs:api", about: "Generated." }
`;

export const FIXTURE_LLMS_TXT =
  '# Fixture\n' +
  '\n' +
  '> A fixture site.\n' +
  '\n' +
  '## Docs\n' +
  '\n' +
  '- [Guide](https://example.github.io/fixture/docs/guide.md): How to.\n' +
  '- [Examples](https://example.github.io/fixture/docs/examples/README.md): Runnable.\n' +
  '\n' +
  '## Optional\n' +
  '\n' +
  '- [API](https://example.github.io/fixture/api/): Generated.\n';

export function put(root: string, rel: string, content: string): void {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), content);
}

/** Write a sound fixture project into `root`; `siteYaml` replaces the manifest, `extra` adds (or replaces) files. */
export function writeSiteFixture(
  root: string,
  siteYaml: string = FIXTURE_SITE_YAML,
  extra: Readonly<Record<string, string>> = {},
): string {
  put(
    root,
    'package.json',
    JSON.stringify(
      {
        name: 'fixture',
        homepage: FIXTURE_HOMEPAGE,
        repository: { type: 'git', url: 'git+https://github.com/example/fixture.git' },
        scripts: { 'docs:api': 'typedoc' },
      },
      null,
      2,
    ),
  );
  put(root, 'docs/site.yaml', siteYaml);
  put(root, 'README.md', '# Fixture\n\nSee [the guide](docs/guide.md).\n');
  put(root, 'docs/guide.md', '# Guide\n');
  put(root, 'docs/examples/README.md', '# Examples\n');
  for (const [rel, content] of Object.entries(extra)) put(root, rel, content);
  return root;
}

/** `checkSiteManifest` over the fixture at `root`, with its own `package.json` scripts. */
export async function siteProblems(root: string): Promise<string[]> {
  const site = await buildSite();
  const scripts = (JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8')) as PackageJson).scripts ?? {};
  return site.checkSiteManifest(root, site.readSiteManifest(root), scripts);
}
