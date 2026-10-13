/**
 * task-234-publish-documentation-site-api-reference-llms-txt-index — independent review F2 (2026-10-14): the three
 * behaviours `scripts/build-site.cjs` has beyond the design's red tests, each pinned on a fixture project.
 *
 * - out-of-site `src="…"` / `href="…"` attributes (the README's HTML) are rewritten like `](…)` links, in-site ones kept;
 * - a link inside a fenced code block is text and stays as written;
 * - the Liquid guard covers every `.md` the site carries, the declared directories' Markdown included, not only `pages`
 *   (Jekyll renders those too).
 *
 * And the re-review's same-class fix of the path confinement: a declared `pages` or `files` entry that is itself a
 * symbolic link is a problem line, refused before anything is written; a symbolic link INSIDE a declared directory is
 * skipped by the walk, so its target never reaches the site.
 *
 * Developer-owned (session 3); fixtures and loader from `support/site-fixture.ts`. Temp directories removed after each case.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildSite, FIXTURE_SITE_YAML, siteProblems, writeSiteFixture } from './support/site-fixture';

const REF = '0123456789abcdef0123456789abcdef01234567';
const BLOB = `https://github.com/example/fixture/blob/${REF}`;

let temps: string[] = [];

afterEach(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
  temps = [];
});

/** A fixture project under a fresh temp directory, and the output directory to assemble it into. */
function project(
  extra: Readonly<Record<string, string>>,
  siteYaml: string = FIXTURE_SITE_YAML,
): { readonly tmp: string; readonly repo: string; readonly out: string } {
  const tmp = mkdtempSync(join(tmpdir(), 'wf-task-234-extras-'));
  temps.push(tmp);
  return { tmp, repo: writeSiteFixture(join(tmp, 'repo'), siteYaml, extra), out: join(tmp, 'out') };
}

/** `<tmp>/outside/secret.md` and `<tmp>/outside/dir/a.md`, outside the fixture repository. */
function outside(tmp: string): { readonly file: string; readonly dir: string } {
  mkdirSync(join(tmp, 'outside', 'dir'), { recursive: true });
  writeFileSync(join(tmp, 'outside', 'secret.md'), '# Secret\n');
  writeFileSync(join(tmp, 'outside', 'dir', 'a.md'), '# A\n');
  return { file: join(tmp, 'outside', 'secret.md'), dir: join(tmp, 'outside', 'dir') };
}

describe('build-site (task-234 review F2) — behaviours beyond the design', () => {
  it('rewrites an out-of-site src= / href= attribute and keeps an in-site one', async () => {
    const site = await buildSite();
    const { repo, out } = project({
      'README.md': '<img src="other/logo.png"> <a href="other/notes.txt">notes</a> <a href="docs/guide.md">guide</a>\n',
      'other/logo.png': 'png',
      'other/notes.txt': 'notes\n',
    });
    site.assembleSite(repo, out, { ref: REF });
    const readme = readFileSync(join(out, 'README.md'), 'utf-8');
    expect(readme).toContain(`src="${BLOB}/other/logo.png"`);
    expect(readme).toContain(`href="${BLOB}/other/notes.txt"`);
    expect(readme).toContain('href="docs/guide.md"');
  });

  it('leaves a link inside a fenced code block as written, and rewrites the one outside it', async () => {
    const site = await buildSite();
    const { repo, out } = project({
      'docs/guide.md': '# Guide\n\n```md\n[fenced](../other/a.txt)\n```\n\nSee [real](../other/a.txt).\n',
      'other/a.txt': 'out of the site\n',
    });
    site.assembleSite(repo, out, { ref: REF });
    const guide = readFileSync(join(out, 'docs', 'guide.md'), 'utf-8');
    expect(guide).toContain('\n[fenced](../other/a.txt)\n');
    expect(guide).toContain(`[real](${BLOB}/other/a.txt)`);
  });

  it('reports a Liquid tag in a Markdown file of a declared directory, not only in `pages`', async () => {
    const { repo } = project({ 'docs/examples/README.md': '# Examples\n\n{{ site.title }}\n' });
    expect(await siteProblems(repo)).toEqual([
      'docs/site.yaml: page contains a Liquid tag, which Jekyll would evaluate: docs/examples/README.md',
    ]);
  });

  it('refuses a declared page that is a symbolic link, before writing anything', async () => {
    const site = await buildSite();
    const yaml = FIXTURE_SITE_YAML.replace('  - docs/guide.md\nfiles:', '  - docs/guide.md\n  - docs/top.md\nfiles:');
    const { tmp, repo, out } = project({}, yaml);
    symlinkSync(outside(tmp).file, join(repo, 'docs', 'top.md'));
    expect(await siteProblems(repo)).toEqual(['docs/site.yaml: listed path is a symbolic link: docs/top.md']);
    expect(() => site.assembleSite(repo, out, { ref: REF })).toThrow('listed path is a symbolic link: docs/top.md');
    expect(existsSync(out)).toBe(false);
  });

  it('refuses a declared directory that is a symbolic link, before writing anything', async () => {
    const site = await buildSite();
    const yaml = FIXTURE_SITE_YAML.replace('files:\n  - docs/examples/\n', 'files:\n  - docs/examples/\n  - docs/dirlink/\n');
    const { tmp, repo, out } = project({}, yaml);
    symlinkSync(outside(tmp).dir, join(repo, 'docs', 'dirlink'));
    expect(await siteProblems(repo)).toEqual(['docs/site.yaml: listed path is a symbolic link: docs/dirlink/']);
    expect(() => site.assembleSite(repo, out, { ref: REF })).toThrow('listed path is a symbolic link: docs/dirlink/');
    expect(existsSync(out)).toBe(false);
  });

  it('skips a symbolic link inside a declared directory: its target never reaches the site', async () => {
    const site = await buildSite();
    const { tmp, repo, out } = project({});
    symlinkSync(outside(tmp).file, join(repo, 'docs', 'examples', 'secret.md'));
    expect(await siteProblems(repo)).toEqual([]);
    const { files } = site.assembleSite(repo, out, { ref: REF });
    expect(files).not.toContain('docs/examples/secret.md');
    expect(readdirSync(join(out, 'docs', 'examples'))).toEqual(['README.md']);
  });
});
