/**
 * task-289 (the v0.3 `user-docs` phase, approver ruling of 2026-10-17, option (a)): every page the
 * documentation site renders (`docs/site.yaml` `pages`) renders as Markdown. Jekyll's kramdown reads a
 * paragraph line that begins with `<` and a letter as the start of an HTML block, so an inline code span
 * broken across a line before `<name>` or `<type>:<id>` turns the rest of the page into raw Markdown — as
 * `docs/user-guide.md` (§7 to the end) and `docs/cli-reference.md` (from `agent execute` to the end) were on
 * <https://wingfoil.github.io/wingfoil/> when the v0.3 delivery session found it.
 *
 * T1 classification: red-first for the repository case (it fails on `main` at `07292cfd` naming the three
 * broken lines); the synthetic cases define the rule of `support/pages-render.ts` and pass from the first run.
 *
 * Deterministic: pages in `docs/site.yaml` order, findings in line order.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { load as yamlLoad } from 'js-yaml';

import { htmlBlockStarts } from './support/pages-render';

const REPO_ROOT = join(__dirname, '..', '..');

function sitePages(): string[] {
  const manifest = yamlLoad(readFileSync(join(REPO_ROOT, 'docs', 'site.yaml'), 'utf-8')) as { pages?: unknown };
  if (!Array.isArray(manifest.pages)) throw new Error('docs/site.yaml: `pages` is not a list');
  return manifest.pages.map(String);
}

describe('the documentation site renders every page as Markdown (task-289)', () => {
  it('no page of docs/site.yaml has a paragraph line beginning with `<` and a letter', () => {
    const pages = sitePages();
    expect(pages.length).toBeGreaterThan(0);
    const findings = pages.flatMap((page) =>
      htmlBlockStarts(readFileSync(join(REPO_ROOT, page), 'utf-8')).map((f) => `${page}:${f.line}: ${f.text}`),
    );
    expect(findings).toEqual([]);
  });
});

describe('the render guard rule (synthetic pages)', () => {
  it('finds a paragraph continuation that begins with `<` and a letter', () => {
    const page = ['Run `wingfoil workflow remove', '<name>` to delete it.'].join('\n');
    expect(htmlBlockStarts(page)).toEqual([{ line: 2, text: '<name>` to delete it.' }]);
  });

  it('finds the same continuation inside a list item', () => {
    const page = ['- pass `--element', '  <type>:<id>` here'].join('\n');
    expect(htmlBlockStarts(page)).toEqual([{ line: 2, text: '  <type>:<id>` here' }]);
  });

  it('skips fenced code, with backticks or tildes, indented inside a list too', () => {
    const page = [
      'Text:',
      '```',
      '<name> in a fence',
      '```',
      '- item',
      '  ~~~~',
      '  <type>:<id>',
      '  ~~~~',
      'end',
    ].join('\n');
    expect(htmlBlockStarts(page)).toEqual([]);
  });

  it('skips an indented code block', () => {
    const page = ['Text', '', '    first', '    <name> second', 'after'].join('\n');
    expect(htmlBlockStarts(page)).toEqual([]);
  });

  it('skips an HTML block opened on purpose, at line 1 or after a blank line, up to the next blank line', () => {
    const page = [
      '<p align="center"><img src="logo.svg"></p>',
      '<p>still the same block</p>',
      '',
      'Paragraph.',
      '',
      '<div>',
      '<span>inside</span>',
      '</div>',
      '',
      'Paragraph again.',
    ].join('\n');
    expect(htmlBlockStarts(page)).toEqual([]);
  });

  it('does not count a comment, a closing tag or `<<` as a finding', () => {
    const page = ['Text', '<!-- a comment -->', '</p>', '<< not a tag'].join('\n');
    expect(htmlBlockStarts(page)).toEqual([]);
  });
});
