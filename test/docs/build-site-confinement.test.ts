/**
 * task-234-publish-documentation-site-api-reference-llms-txt-index — review send-back (2026-10-14), two
 * behaviour fixes of `scripts/build-site.cjs`, red-first:
 *
 * - **F1, path confinement** (the REQ-SEC-06 class): a `docs/site.yaml` `pages`, `files` or `llms` `path`
 *   that is absolute or holds a `..` segment was read from outside the repository and written outside the
 *   output directory (`pages: [../outside/secret.md]`, `site --out $S/out/site` → exit 0 and
 *   `$S/out/outside/secret.md` written). Intended: `checkSiteManifest` reports one line per such entry,
 *   `docs/site.yaml: listed path escapes the repository: <p>`, sorted with the others; `assembleSite` and the
 *   `site` sub-command refuse before copying anything (exit 1), so nothing exists outside the output directory.
 * - **F3, inline code**: a link inside a backtick code span is text, not a link — it is left untouched, as in a
 *   fenced block, while a real relative link next to it is still rewritten.
 *
 * Each fixture is a temp directory holding the project at `repo/` and the escaping targets at `outside/`, so a
 * write that escapes `out/site` lands at `out/outside/…`, inside the temp directory, and is detected there.
 * Fixtures and loader: `support/site-fixture.ts` (shared with `llms-txt.test.ts`). Removed after each case.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  BUILD_SITE_SCRIPT,
  buildSite,
  FIXTURE_SITE_YAML,
  put,
  siteProblems,
  writeSiteFixture,
} from './support/site-fixture';

const REF = '0123456789abcdef0123456789abcdef01234567';
const ESCAPES = 'docs/site.yaml: listed path escapes the repository: ';

let temps: string[] = [];

afterEach(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
  temps = [];
});

interface Layout {
  readonly tmp: string;
  readonly repo: string;
  readonly out: string;
}

/** `<tmp>/repo` (the fixture project, with `siteYaml`), `<tmp>/outside/` (secret.md, dir/a.md); `out` = `<tmp>/out/site`. */
function layout(siteYaml: string, extra: Readonly<Record<string, string>> = {}): Layout {
  const tmp = mkdtempSync(join(tmpdir(), 'wf-task-234-confine-'));
  temps.push(tmp);
  put(tmp, 'outside/secret.md', '# Secret\n');
  put(tmp, 'outside/dir/a.md', '# A\n');
  const repo = writeSiteFixture(join(tmp, 'repo'), siteYaml, extra);
  return { tmp, repo, out: join(tmp, 'out', 'site') };
}

const withPage = (page: string): string =>
  FIXTURE_SITE_YAML.replace('  - docs/guide.md\nfiles:', `  - docs/guide.md\n  - ${page}\nfiles:`);
const withFilesDir = (dir: string): string =>
  FIXTURE_SITE_YAML.replace('files:\n  - docs/examples/\n', `files:\n  - docs/examples/\n  - ${dir}\n`);
const withLlmsPath = (path: string): string =>
  FIXTURE_SITE_YAML.replace('path: docs/examples/README.md', `path: ${path}`);

/** Nothing was written next to the output directory, and the output directory holds nothing. */
function expectNothingWritten(l: Layout): void {
  expect(existsSync(join(l.tmp, 'out', 'outside'))).toBe(false);
  expect(readdirSync(join(l.tmp, 'out')).filter((name) => name !== 'site')).toEqual([]);
  expect(existsSync(l.out) ? readdirSync(l.out) : []).toEqual([]);
}

describe('build-site (task-234 send-back F1) — checkSiteManifest refuses a path that escapes the repository', () => {
  it.each([['../outside/secret.md'], ['docs/../../outside/secret.md']])('F1: a `pages` entry with a `..` segment (%s)', async (page) => {
    const l = layout(withPage(page));
    expect(await siteProblems(l.repo)).toEqual([`${ESCAPES}${page}`]);
  });

  it('F1: an absolute `pages` entry', async () => {
    const probe = layout(FIXTURE_SITE_YAML);
    const absolute = join(probe.tmp, 'outside', 'secret.md');
    put(probe.repo, 'docs/site.yaml', withPage(absolute));
    expect(await siteProblems(probe.repo)).toEqual([`${ESCAPES}${absolute}`]);
  });

  it('F1: a `files` entry with a `..` segment', async () => {
    const l = layout(withFilesDir('../outside/'));
    expect(await siteProblems(l.repo)).toEqual([`${ESCAPES}../outside/`]);
  });

  it('F1: an `llms` `path` with a `..` segment', async () => {
    const l = layout(withLlmsPath('../outside/secret.md'));
    expect(await siteProblems(l.repo)).toEqual([`${ESCAPES}../outside/secret.md`]);
  });

  it('F1: the escape line is sorted with the other problems', async () => {
    const l = layout(withPage('../outside/secret.md').replace('built_by: "docs:api"', 'built_by: nope'));
    const found = await siteProblems(l.repo);
    expect(found).toEqual([`${ESCAPES}../outside/secret.md`, 'docs/site.yaml: unknown npm script: nope']);
  });
});

describe('build-site (task-234 send-back F1) — assembling refuses before copying anything', () => {
  it('F1: assembleSite throws on an escaping `pages` entry and writes nothing', async () => {
    const site = await buildSite();
    const l = layout(withPage('../outside/secret.md'));
    expect(() => site.assembleSite(l.repo, l.out, { ref: REF })).toThrow(`${ESCAPES}../outside/secret.md`);
    expectNothingWritten(l);
  });

  it.each([
    ['pages', withPage('../outside/secret.md'), '../outside/secret.md'],
    ['files', withFilesDir('../outside/'), '../outside/'],
  ])('F1: `site --out` exits 1 on an escaping `%s` entry and writes nothing outside the output directory', (_key, yaml, entry) => {
    expect(existsSync(BUILD_SITE_SCRIPT)).toBe(true);
    const l = layout(yaml);
    const run = spawnSync(process.execPath, [BUILD_SITE_SCRIPT, 'site', '--root', l.repo, '--out', l.out, '--ref', REF], {
      cwd: l.tmp,
      encoding: 'utf-8',
    });
    expect(run.status).toBe(1);
    expect(String(run.stderr)).toContain(`${ESCAPES}${entry}`);
    expectNothingWritten(l);
  });
});

describe('build-site (task-234 send-back F3) — a link inside an inline code span is not rewritten', () => {
  it('F3: `[inline](../other/a.txt)` in backticks stays as written; the real link beside it is rewritten', async () => {
    const site = await buildSite();
    const l = layout(FIXTURE_SITE_YAML, {
      'docs/guide.md': '# Guide\n\nWrite `[inline](../other/a.txt)` in code, and see [real](../other/a.txt).\n',
      'other/a.txt': 'out of the site\n',
    });
    site.assembleSite(l.repo, l.out, { ref: REF });
    const guide = readFileSync(join(l.out, 'docs', 'guide.md'), 'utf-8');
    expect(guide).toContain('`[inline](../other/a.txt)`');
    expect(guide).toContain(`[real](https://github.com/example/fixture/blob/${REF}/other/a.txt)`);
  });
});
