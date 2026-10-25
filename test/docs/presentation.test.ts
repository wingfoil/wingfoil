/**
 * README badges and the reproducible terminal demo (`task-224-add-readme-badges-reproducible-terminal-demo-drives-example`,
 * `dl-128-user-facing-presentation` items 1–2, Q1 (a) VHS, Q2 (a) committed, Q3 (a)).
 *
 * `dl-128` adds two presentation artefacts to the README, each derived from something already checked, so
 * that neither becomes a second source of truth:
 *
 * - **badges** for the npm version, the licence, the Node engine floor and the status of `publish.yml`.
 *   Each is rendered from the registry or from the workflow run, never typed in: a static
 *   `img.shields.io/badge/…` badge states a value the repository cannot check, and is refused here;
 * - **a demo**: a VHS tape next to `docs/examples/01-first-project/` that runs that example's `run.sh`
 *   as `run.sh || exit 1` and waits for the shell's prompt to return: a failing example exits the shell, the
 *   prompt never returns and the recording fails, so a tool that no longer matches the example leaves no
 *   stale animation. The rendered GIF is committed under `docs/assets/` (Q2 (a))
 *   and the README shows it. The recorder is a separate binary, never an npm dependency
 *   (`dl-010-minimal-dependencies`).
 *
 * `user-docs`' `align-user-docs` phase produces both, and its `checks.post` covers them through two
 * checks: this suite (`presentation.current`, bound) and the recording itself (`demo.rendered`), a manual
 * step by the approver's ruling of 2026-10-10 — bound `manual: true` since `task-298` (`dl-172` (a)), and a
 * note that says how to install the tools, render, and check the result, linked from the check.
 *
 * Offline and deterministic: every file is read from the working tree; nothing is fetched from
 * shields.io, npm or GitHub (what a badge displays is the service's view, not the repository's).
 *
 * `task-246-write-comparison-page-dogfooding-case-study` (`dl-128` items 3–4, `dl-112`) adds the
 * `task-246 — AC n` blocks below (approver ruling D2 (a): the checks live in this suite, so
 * `presentation.current` covers the two new pages with no binding change): `docs/comparison.md`, where every
 * fact about another tool carries a dated source, and `docs/case-study.md`, whose figures are read back from
 * the committed release-health reports and the metric catalogue — never typed into this test. The lower
 * bound for a source's read date is a constant, never the clock. T1: red-first throughout (neither page
 * exists at `e41ec99b`).
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, normalize, relative, sep } from 'node:path';

import { load } from 'js-yaml';

const repoRoot = join(__dirname, '..', '..');

function read(path: string): string {
  return readFileSync(join(repoRoot, path), 'utf8');
}

const TAPE = 'docs/examples/01-first-project/demo.tape';
const EXAMPLE = 'docs/examples/01-first-project/run.sh';
const GIF = 'docs/assets/wingfoil-demo-first-project.gif';

const pkg = JSON.parse(read('package.json')) as {
  name: string;
  license: string;
  engines: { node: string };
  repository: { url: string };
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

/** `owner/repo` of the GitHub repository package.json declares. */
function githubRepository(): string {
  const match = /github\.com[/:]([^/]+\/[^/.]+)(?:\.git)?$/.exec(pkg.repository.url);
  if (!match) throw new Error(`package.json repository.url is not a GitHub URL: ${pkg.repository.url}`);
  return match[1]!;
}

/** The README's Markdown image links `[![alt](image)](target)`, in order. */
function badges(readme: string): { alt: string; image: string; target: string }[] {
  return [...readme.matchAll(/\[!\[([^\]]*)\]\(([^)\s]+)\)\]\(([^)\s]+)\)/g)].map((match) => ({
    alt: match[1]!,
    image: match[2]!,
    target: match[3]!,
  }));
}

/** The tape's commands, one per non-blank, non-comment line: `[command, rest of the line]`. */
function tapeCommands(): [string, string][] {
  return read(TAPE)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))
    .map((line) => {
      const space = line.indexOf(' ');
      return space < 0 ? [line, ''] : [line.slice(0, space), line.slice(space + 1).trim()];
    });
}

describe('AC 1 — README badges, each derived from the registry, package.json or the run (dl-128 item 1)', () => {
  const readme = read('README.md');
  const repository = githubRepository();

  it('package.json declares what the badges are derived from', () => {
    expect(pkg.name).toBe('wingfoil');
    expect(pkg.license).toBe('MIT');
    expect(pkg.engines.node).toMatch(/^>=\d+\.\d+\.\d+$/);
    expect(existsSync(join(repoRoot, '.github', 'workflows', 'publish.yml'))).toBe(true);
  });

  it('shows the four badges, in order, each rendered from its source and linking to it', () => {
    const npmPage = `https://www.npmjs.com/package/${pkg.name}`;
    expect(badges(readme).map(({ image, target }) => [image, target])).toEqual(
      expect.arrayContaining([
        // The version the registry serves as `latest`.
        [`https://img.shields.io/npm/v/${pkg.name}`, npmPage],
        // The `license` of the published package.json, as the registry serves it.
        [`https://img.shields.io/npm/l/${pkg.name}`, `https://github.com/${repository}/blob/main/LICENSE`],
        // The `engines.node` of the published package.json, as the registry serves it.
        [`https://img.shields.io/node/v/${pkg.name}`, npmPage],
        // The status of the latest publish.yml run, as GitHub Actions serves it.
        [
          `https://github.com/${repository}/actions/workflows/publish.yml/badge.svg`,
          `https://github.com/${repository}/actions/workflows/publish.yml`,
        ],
      ]),
    );
    const order = [`npm/v/${pkg.name}`, `npm/l/${pkg.name}`, `node/v/${pkg.name}`, 'publish.yml/badge.svg'].map((key) =>
      badges(readme).findIndex(({ image }) => image.includes(key)),
    );
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('the licence badge links to a LICENSE file the repository carries', () => {
    expect(existsSync(join(repoRoot, 'LICENSE'))).toBe(true);
  });

  it('no badge is static: a value typed into the URL is a fact the repository cannot check', () => {
    expect(readme).not.toMatch(/img\.shields\.io\/badge\//);
  });
});

describe('AC 2 — a VHS tape drives docs/examples/01-first-project/run.sh, rendered to a committed GIF (dl-128 item 2)', () => {
  it('the tape sits next to the example it drives', () => {
    expect(existsSync(join(repoRoot, TAPE))).toBe(true);
    expect(existsSync(join(repoRoot, EXAMPLE))).toBe(true);
  });

  it('renders exactly one output: the GIF under docs/assets/', () => {
    const outputs = tapeCommands().filter(([command]) => command === 'Output');
    expect(outputs).toEqual([['Output', GIF]]);
  });

  it('types the command that runs the example, from the repository root', () => {
    const typed = tapeCommands()
      .filter(([command]) => command === 'Type')
      .map(([, text]) => text);
    expect(typed).toContainEqual(expect.stringContaining(`bash ${EXAMPLE}`));
  });

  it('runs the example against the build of the commit being recorded, not whatever wingfoil is on PATH', () => {
    const typed = tapeCommands()
      .filter(([command]) => command === 'Type')
      .map(([, text]) => text);
    expect(typed).toContainEqual(expect.stringContaining('WINGFOIL="node $PWD/dist/cli.js"'));
  });

  // The render of 2026-10-10 timed out on `Wait+Screen /OK: first project/`: VHS's screen scope reads rows
  // 0..term.rows of xterm's buffer (`Buffer()` in VHS's testing.go), the TOP of a scrolled buffer, so the closing
  // `OK:` line was never in it. The line scope reads the cursor's row in the viewport (`CurrentLine()`), so the
  // tape waits there for the prompt to come back, and a failing example exits the shell so it never does.
  it('the shell exits if the example fails, so the prompt never returns and VHS renders nothing', () => {
    const typed = tapeCommands()
      .filter(([command]) => command === 'Type')
      .map(([, text]) => text);
    expect(typed).toContainEqual(expect.stringMatching(new RegExp(`bash ${EXAMPLE.replace(/[.]/g, '\\.')} \\|\\| exit 1`)));
  });

  it('waits on the cursor line for the returning prompt, never on the screen scope', () => {
    const done = /^done_ok "(.+)"$/m.exec(read(EXAMPLE));
    expect(done).not.toBeNull();
    const waits = tapeCommands().filter(([command]) => command.startsWith('Wait'));
    expect(waits).toHaveLength(1);
    const [command, pattern] = waits[0]!;
    // Line scope (the default, or `+Line`); the `@` timeout makes VHS return an error, and render nothing, when it lapses.
    expect(command).toMatch(/^Wait(?:\+Line)?@\d+(?:ms|s|m)$/);
    const regex = /^\/(.+)\/$/.exec(pattern);
    expect(regex).not.toBeNull();
    const prompt = new RegExp(regex![1]!);
    // VHS's bash prompt is `> ` (PS1 in its shell.go), read back trimmed.
    expect(prompt.test('>')).toBe(true);
    // No line the example prints satisfies it: neither its closing lines nor an identity ending in `>`.
    for (const line of [`OK: ${done![1]!}`, 'FAIL: history operations', '  "approver": "Ada Lovelace <ada@example.com>', '$ wingfoil init --template Scrum']) {
      expect(prompt.test(line)).toBe(false);
    }
  });

  it('requires the tools the example needs, so a machine without them fails before recording', () => {
    const required = tapeCommands()
      .filter(([command]) => command === 'Require')
      .map(([, program]) => program);
    expect(required).toEqual(expect.arrayContaining(['bash', 'git', 'node']));
  });

  it('the recorder is not an npm dependency (dl-010)', () => {
    const declared = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})];
    expect(declared.filter((name) => /(^|\/)vhs$/.test(name))).toEqual([]);
  });

  it('the rendered GIF is committed under docs/assets/', () => {
    expect(existsSync(join(repoRoot, GIF))).toBe(true);
    const header = readFileSync(join(repoRoot, GIF)).subarray(0, 6).toString('latin1');
    expect(['GIF87a', 'GIF89a']).toContain(header);
  });

  it('the README shows the GIF and names the tape it is rendered from', () => {
    const readme = read('README.md');
    expect(readme).toContain(`](${GIF})`);
    expect(readme).toContain(TAPE);
  });

  it('docs/assets/README.md lists the GIF with the command that regenerates it', () => {
    const assets = read('docs/assets/README.md');
    expect(assets).toContain(`\`${GIF.replace('docs/assets/', '')}\``);
    expect(assets).toContain(`vhs ${TAPE}`);
  });
});

describe('AC 3 — align-user-docs produces the tape and the GIF, and checks.post covers them (dl-128 Action 2)', () => {
  const userDocs = load(read('.wingfoil/workflows/custom/user-docs.yaml')) as {
    version: number;
    phases: { name: string; produces?: string[]; checks?: { post?: string[] } }[];
  };
  const phase = userDocs.phases.find((candidate) => candidate.name === 'align-user-docs')!;
  const bindings = load(read('.wingfoil/workflows/bindings.yaml')) as {
    checks: Record<string, { run?: string[] }>;
  };

  it.each([TAPE, GIF])('produces lists %s', (path) => {
    expect(phase.produces).toContain(path);
  });

  it('checks.post keeps the alignment prose and adds the two presentation checks', () => {
    expect(phase.checks?.post).toEqual([
      "user-facing docs aligned with the release's shipped CLI/feature surface",
      'presentation.current',
      'demo.rendered',
    ]);
  });

  it('presentation.current runs this suite; demo.rendered is bound manual: true (dl-172 (a))', () => {
    expect(bindings.checks['presentation.current']?.run).toEqual(['npm', 'test', '--', 'test/docs/presentation.test.ts']);
    expect(bindings.checks['demo.rendered']).toEqual({ manual: true });
  });

  it('the demo.rendered check links the note that says how to render the GIF by hand', () => {
    const line = read('.wingfoil/workflows/custom/user-docs.yaml')
      .split('\n')
      .find((candidate) => /^\s+- demo\.rendered\b/.test(candidate));
    expect(line).toContain('docs/assets/README.md');
  });

  it('the note covers installing the tools on Ubuntu/Debian, the render command, and the checks afterwards', () => {
    const assets = read('docs/assets/README.md');
    const start = assets.indexOf('## Regenerating the demo GIF');
    expect(start).toBeGreaterThanOrEqual(0);
    const next = assets.indexOf('\n## ', start + 1);
    const note = assets.slice(start, next < 0 ? undefined : next);
    // VHS from Charm's apt repository, plus ttyd and ffmpeg.
    expect(note).toContain('https://repo.charm.sh/apt/');
    expect(note).toMatch(/apt install[^\n]*\bvhs\b/);
    expect(note).toMatch(/apt install[^\n]*\bttyd\b/);
    expect(note).toMatch(/apt install[^\n]*\bffmpeg\b/);
    // The render command, from the repository root.
    expect(note).toContain(`npm run build && vhs ${TAPE}`);
    expect(note).toMatch(/repository root/);
    // What to check afterwards.
    expect(note).toContain('git diff --stat');
    expect(note).toContain('npx jest test/docs/presentation.test.ts');
  });

  it('the workflow version moved past 1.4', () => {
    expect(userDocs.version).toBeGreaterThan(1.4);
  });
});

// ── task-246 — the comparison page and the dogfooding case study (dl-128 items 3–4) ─────────────────────────

const COMPARISON = 'docs/comparison.md';
const CASE_STUDY = 'docs/case-study.md';
const REPORTS = ['docs/08_health/release-health-v0.1.json', 'docs/08_health/release-health-v0.2.json'];
const CATALOGUE = 'docs/08_health/metrics.yaml';
/** The earliest date a source may have been read: the day task-246's sources are read (a constant, not the clock). */
const READ_DATE_FLOOR = '2026-10-15';
const NOT_STATED = 'not stated in the sources read';

/** The file's text, or '' when it does not exist, so a missing page fails on an assertion, not on ENOENT. */
function readIfExists(path: string): string {
  return existsSync(join(repoRoot, path)) ? read(path) : '';
}

const collapse = (text: string): string => text.replace(/\s+/g, ' ').trim();

/** The text with fenced code blocks blanked out (line count kept). */
function withoutFences(markdown: string): string {
  let inFence = false;
  return markdown
    .split('\n')
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) {
        inFence = !inFence;
        return '';
      }
      return inFence ? '' : line;
    })
    .join('\n');
}

/** The H2 headings, in order (outside fenced code). */
function h2s(markdown: string): string[] {
  return [...withoutFences(markdown).matchAll(/^## (.+)$/gm)].map((match) => match[1]!.trim());
}

/** The body of the H2 section titled `title` (up to the next H2), '' when there is none. */
function section(markdown: string, title: string): string {
  const lines = markdown.split('\n');
  const start = lines.findIndex((line) => line.trim() === `## ${title}`);
  if (start < 0) return '';
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^## /.test(line));
  return (end < 0 ? rest : rest.slice(0, end)).join('\n');
}

/** The body of the H3 subsection titled `title` inside `text` (up to the next H2 or H3). */
function subsection(text: string, title: string): string {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => line.trim() === `### ${title}`);
  if (start < 0) return '';
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^#{2,3} /.test(line));
  return (end < 0 ? rest : rest.slice(0, end)).join('\n');
}

/** The text with every H2 section titled `title` removed. */
function outside(markdown: string, title: string): string {
  const body = section(markdown, title);
  return body === '' ? markdown : markdown.replace(`## ${title}\n${body}`, '');
}

/** A table row's cells: split on unescaped `|`, `\|` unescaped, trimmed. */
function cells(row: string): string[] {
  const inner = row.trim().replace(/^\|/, '').replace(/\|$/, '');
  return inner.split(/(?<!\\)\|/).map((cell) => cell.replace(/\\\|/g, '|').trim());
}

interface Table {
  header: string[];
  rows: string[][];
}

/** Every Markdown table in `text` (outside fenced code): a header row, a separator row, the body rows. */
function tables(text: string): Table[] {
  const lines = withoutFences(text).split('\n');
  const found: Table[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*\|/.test(lines[i]!) || !/^\s*\|?\s*:?-{3,}/.test(lines[i + 1] ?? '')) continue;
    const header = cells(lines[i]!);
    const rows: string[][] = [];
    let j = i + 2;
    for (; j < lines.length && /^\s*\|/.test(lines[j]!); j++) rows.push(cells(lines[j]!));
    found.push({ header, rows });
    i = j - 1;
  }
  return found;
}

/** The text without its tables and fenced code. */
function prose(markdown: string): string {
  return withoutFences(markdown)
    .split('\n')
    .filter((line) => !/^\s*\|/.test(line))
    .join('\n');
}

/** List items made of a link and nothing else (`- [text](target)`, optionally followed by a full stop). */
function linkOnlyListItems(markdown: string): string[] {
  return withoutFences(markdown)
    .split('\n')
    .filter((line) => /^\s*(?:[-*+]|\d+\.)\s+(?:\[[^\]]*\]\([^)]*\)|<[^>]+>)\s*\.?\s*$/.test(line));
}

/** Relative link targets (`](x)` not starting with `http` or `#`), without their anchor, outside fenced code. */
function relativeLinks(markdown: string): string[] {
  return [...withoutFences(markdown).matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)]
    .map((match) => match[1]!)
    .filter((target) => !/^(?:https?:|mailto:|#)/.test(target))
    .map((target) => target.replace(/#.*$/, ''));
}

/** Each relative link of the page at `page` that does not resolve to an existing path inside the repository. */
function unresolvedLinks(page: string, markdown: string): string[] {
  return relativeLinks(markdown).filter((target) => {
    const resolved = normalize(join(repoRoot, dirname(page), decodeURIComponent(target)));
    const inside = relative(repoRoot, resolved);
    return inside.startsWith('..') || inside.startsWith(sep) || !existsSync(resolved);
  });
}

const DETERMINISM_ACHIEVED = /\b(ensures|guarantees) determinism\b|\b(is|makes [^.]{0,40}) deterministic\b/i;

interface Source {
  id: number;
  url: string;
  date: string;
}

const SOURCE_LINE = /^- \[S(\d+)\] .+ — <?(https:\/\/[^\s>]+)>? — read (\d{4}-\d{2}-\d{2})\.$/;

function isCalendarDate(date: string): boolean {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

describe('task-246 — AC 1: docs/comparison.md, every fact about another tool sourced and dated (dl-112, dl-128 item 3)', () => {
  const page = readIfExists(COMPARISON);
  const sourcesText = section(page, 'Sources');
  const body = outside(page, 'Sources');
  const sourceLines = sourcesText.split('\n').filter((line) => line.trim() !== '');
  const sources: Source[] = sourceLines
    .map((line) => SOURCE_LINE.exec(line))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => ({ id: Number(match[1]), url: match[2]!, date: match[3]! }));

  it('C1: exists, titled "How WingFoil compares", with its five H2 sections in order', () => {
    expect(existsSync(join(repoRoot, COMPARISON))).toBe(true);
    expect(page.split('\n').find((line) => /^# /.test(line))).toBe('# How WingFoil compares');
    expect(h2s(page)).toEqual([
      'What WingFoil replaces',
      'What WingFoil works with',
      'Ideas seen elsewhere, not adopted',
      'Determinism, stated as a goal',
      'Sources',
    ]);
  });

  it('C2: every Sources line is "- [S<n>] title — <https://…> — read YYYY-MM-DD.", numbered 1..n, unique URLs, read on or after the floor', () => {
    expect(sourceLines.length).toBeGreaterThanOrEqual(1);
    expect(sourceLines.filter((line) => !SOURCE_LINE.test(line))).toEqual([]);
    expect(sources.map(({ id }) => id)).toEqual(sources.map((_, index) => index + 1));
    expect(new Set(sources.map(({ url }) => url)).size).toBe(sources.length);
    for (const { date } of sources) {
      expect(isCalendarDate(date)).toBe(true);
      expect(date >= READ_DATE_FLOOR).toBe(true);
    }
  });

  it('C3: every [S<n>] cited resolves to a source, and every source is cited outside Sources', () => {
    const cited = new Set([...body.matchAll(/\[S(\d+)\]/g)].map((match) => Number(match[1])));
    const declared = new Set(sources.map(({ id }) => id));
    expect(declared.size).toBeGreaterThanOrEqual(1);
    expect([...cited].filter((id) => !declared.has(id))).toEqual([]);
    expect([...declared].filter((id) => !cited.has(id))).toEqual([]);
  });

  it('C4: integrated, not linked — no URL outside Sources, no list item that is only a link', () => {
    expect(page).not.toBe('');
    expect(body.match(/https?:\/\/\S+/g) ?? []).toEqual([]);
    expect(linkOnlyListItems(body)).toEqual([]);
  });

  it('C5: every third-party cell carries a source or says it is not stated; the spec-driven table compares at least three tools', () => {
    const scoped = [...tables(section(page, 'What WingFoil replaces')), ...tables(section(page, 'What WingFoil works with'))];
    expect(tables(section(page, 'What WingFoil replaces')).length).toBeGreaterThanOrEqual(1);
    const unsourced: string[] = [];
    for (const { header, rows } of scoped) {
      header.forEach((title, column) => {
        if (column === 0 || title.includes('WingFoil')) return;
        for (const row of rows) {
          const cell = row[column] ?? '';
          if (!/\[S\d+\]/.test(cell) && cell !== NOT_STATED) unsourced.push(`${title}: ${cell}`);
        }
      });
    }
    expect(unsourced).toEqual([]);
    const specDriven = tables(subsection(section(page, 'What WingFoil works with'), 'Spec-driven development tools'))[0];
    expect(specDriven).toBeDefined();
    expect(specDriven!.header.filter((title, column) => column > 0 && !title.includes('WingFoil')).length).toBeGreaterThanOrEqual(3);
  });

  it('C6: every relative link resolves inside the repository; no source is a private repository of the author', () => {
    expect(page).not.toBe('');
    expect(unresolvedLinks(COMPARISON, page)).toEqual([]);
    expect(sources.filter(({ url }) => /github\.com\/robypomper\//i.test(url))).toEqual([]);
  });

  it.each([COMPARISON, CASE_STUDY])('C7: %s states determinism as a goal, never as achieved (dl-112 Q3 (i))', (path) => {
    const text = readIfExists(path);
    expect(text).not.toBe('');
    expect(text.match(DETERMINISM_ACHIEVED)).toBeNull();
  });
});

interface Metric {
  id: string;
  name: string;
  definition: string;
  scope: string;
  kind: string;
  floor?: string | number;
}

interface ReportMetric {
  id: string;
  status: 'measured' | 'not-measurable';
  reason?: string;
  value?: unknown;
  raw?: unknown;
  items?: unknown;
}

interface Report {
  release: { version: string };
  measurement_point: { ref: string; commit: string };
  metrics: ReportMetric[];
}

/** Every number in a JSON value: its numeric leaves and the numbers inside its keys (`p90`, `over_72`). */
function jsonNumbers(value: unknown, into: Set<number> = new Set()): Set<number> {
  if (typeof value === 'number') into.add(Math.abs(value));
  else if (Array.isArray(value)) value.forEach((item) => jsonNumbers(item, into));
  else if (value !== null && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      for (const match of key.matchAll(/\d+(?:\.\d+)?/g)) into.add(Number(match[0]));
      jsonNumbers(item, into);
    }
  }
  return into;
}

/** The numbers a cell states, skipping digits glued to a word (`p90`, `over_500`, `G01`). */
function cellNumbers(cell: string): number[] {
  return [...cell.matchAll(/(?<![A-Za-z_\d.])\d+(?:\.\d+)?(?![A-Za-z_\d])/g)].map((match) => Number(match[0]));
}

const stripTicks = (cell: string): string => cell.replace(/`/g, '').trim();

describe('task-246 — AC 2: docs/case-study.md, figures read from the committed release-health reports (dl-128 item 4)', () => {
  const page = readIfExists(CASE_STUDY);
  const catalogue = (load(read(CATALOGUE)) as { metrics: Metric[] }).metrics;
  const reports = REPORTS.map((path) => JSON.parse(read(path)) as Report);
  const byId = (report: Report, id: string): ReportMetric | undefined => report.metrics.find((metric) => metric.id === id);
  const measuredIds = catalogue
    .map(({ id }) => id)
    .filter((id) => reports.some((report) => byId(report, id)?.status === 'measured'));
  const unmeasuredIds = catalogue.map(({ id }) => id).filter((id) => !measuredIds.includes(id));
  /** "v0.1 at 5b16ab61" for a point named by its commit, "v0.2 at v0.2.1 (9833e00a)" for one named by a tag. */
  const pointColumn = ({ release, measurement_point: { ref, commit } }: Report): string =>
    ref === commit ? `${release.version} at ${commit.slice(0, 8)}` : `${release.version} at ${ref} (${commit.slice(0, 8)})`;
  const figures = tables(section(page, 'Figures'))[0];
  const notMeasurable = tables(section(page, 'Not measurable yet'))[0];

  it('F1: exists, titled "Case study: WingFoil develops WingFoil", with the six sections in order', () => {
    expect(existsSync(join(repoRoot, CASE_STUDY))).toBe(true);
    expect(page.split('\n').find((line) => /^# /.test(line))).toBe('# Case study: WingFoil develops WingFoil');
    expect(h2s(page)).toEqual([
      'How this repository is governed',
      'How it was measured',
      'Figures',
      'What the figures say',
      'Not measurable yet',
      'Reproduce',
    ]);
  });

  it('F2: the Figures header names each report\'s measurement point', () => {
    expect(figures?.header).toEqual(['id', 'Metric', 'Definition', 'Scope', 'Kind', ...reports.map(pointColumn)]);
  });

  it('F3: Figures holds the metrics measured in at least one report, Not measurable yet the rest, each once, in catalogue order', () => {
    expect(figures?.rows.map((row) => stripTicks(row[0] ?? ''))).toEqual(measuredIds);
    expect(notMeasurable?.header).toEqual(['id', 'Metric', ...reports.map(({ release }) => release.version)]);
    expect(notMeasurable?.rows.map((row) => stripTicks(row[0] ?? ''))).toEqual(unmeasuredIds);
    expect([...measuredIds, ...unmeasuredIds].sort()).toEqual(catalogue.map(({ id }) => id).sort());
  });

  it('F4: Metric, Definition and Scope are the catalogue\'s; Kind starts with the catalogue kind', () => {
    expect(figures).toBeDefined();
    for (const row of figures?.rows ?? []) {
      const metric = catalogue.find(({ id }) => id === stripTicks(row[0] ?? ''));
      expect(metric).toBeDefined();
      expect([metric!.id, row[1]]).toEqual([metric!.id, metric!.name]);
      expect([metric!.id, collapse(row[2] ?? '')]).toEqual([metric!.id, collapse(metric!.definition)]);
      expect([metric!.id, row[3]]).toEqual([metric!.id, metric!.scope]);
      expect([metric!.id, (row[4] ?? '').startsWith(metric!.kind)]).toEqual([metric!.id, true]);
    }
  });

  it('F5: a value cell says "not measurable" exactly when the report does, and states only numbers the report holds', () => {
    expect(figures).toBeDefined();
    const wrong: string[] = [];
    for (const row of figures?.rows ?? []) {
      const id = stripTicks(row[0] ?? '');
      reports.forEach((report, index) => {
        const cell = row[5 + index] ?? '';
        const entry = byId(report, id);
        const label = `${id} @ ${report.release.version}: ${cell}`;
        if (entry?.status !== 'measured') {
          if (!cell.startsWith('not measurable')) wrong.push(`${label} (expected "not measurable…")`);
          return;
        }
        if (cell.startsWith('not measurable')) wrong.push(`${label} (the report measured it)`);
        const allowed = new Set([...jsonNumbers(entry.value), ...jsonNumbers(entry.raw), ...jsonNumbers(entry.items)]);
        const stated = cellNumbers(cell);
        const foreign = stated.filter((number) => !allowed.has(number));
        if (foreign.length > 0) wrong.push(`${label} (not in the report: ${foreign.join(', ')})`);
        const exempt =
          typeof entry.value === 'boolean' ||
          (entry.value !== null && typeof entry.value === 'object' && Object.values(entry.value).some((item) => item === null));
        if (stated.length === 0 && !exempt) wrong.push(`${label} (no figure)`);
      });
    }
    expect(wrong).toEqual([]);
  });

  it('F6: a Not measurable yet cell carries the report\'s reason; Metric is the catalogue name', () => {
    expect(notMeasurable).toBeDefined();
    const wrong: string[] = [];
    for (const row of notMeasurable?.rows ?? []) {
      const id = stripTicks(row[0] ?? '');
      const metric = catalogue.find((candidate) => candidate.id === id);
      if (row[1] !== metric?.name) wrong.push(`${id}: Metric "${row[1]}"`);
      reports.forEach((report, index) => {
        const reason = collapse(byId(report, id)?.reason ?? '');
        if (reason === '' || !collapse(row[2 + index] ?? '').includes(reason)) wrong.push(`${id} @ ${report.release.version}`);
      });
    }
    expect(wrong).toEqual([]);
  });

  it('F7: outside the tables and fenced code, every share and every ratio uses a figure of the table or a catalogue floor', () => {
    expect(page).not.toBe('');
    const known = new Set<number>();
    for (const row of figures?.rows ?? []) for (const cell of row.slice(5)) cellNumbers(cell).forEach((number) => known.add(number));
    for (const { floor } of catalogue) if (floor !== undefined) for (const match of String(floor).matchAll(/\d+(?:\.\d+)?/g)) known.add(Number(match[0]));
    const text = prose(page);
    const foreign: string[] = [];
    for (const match of text.matchAll(/(?<![\w./-])(\d+(?:\.\d+)?)\s?%/g)) if (!known.has(Number(match[1]))) foreign.push(match[0]);
    for (const match of text.matchAll(/(?<![\w./-])(\d+)\/(\d+)(?![\w/])/g)) {
      if (!known.has(Number(match[1])) || !known.has(Number(match[2]))) foreign.push(match[0]);
    }
    expect(foreign).toEqual([]);
  });

  it('F8: no list item that is only a link, and every relative link resolves inside the repository', () => {
    expect(page).not.toBe('');
    expect(linkOnlyListItems(page)).toEqual([]);
    expect(unresolvedLinks(CASE_STUDY, page)).toEqual([]);
  });
});

describe('task-246 — AC 3: align-user-docs produces both pages, version bumped; the site and llms.txt carry them (ruling D5)', () => {
  const raw = read('.wingfoil/workflows/custom/user-docs.yaml');
  const userDocs = load(raw) as {
    version: number;
    phases: { name: string; produces?: (string | { type: string; path: string })[]; checks?: { post?: string[] } }[];
  };
  const phase = userDocs.phases.find((candidate) => candidate.name === 'align-user-docs')!;
  const produced = (phase.produces ?? []).map((entry) => (typeof entry === 'string' ? entry : entry.path));
  const siteRaw = read('docs/site.yaml');
  const site = load(siteRaw) as {
    version: number;
    pages: string[];
    llms: { section: string; entries: { path?: string }[] }[];
  };

  it.each([COMPARISON, CASE_STUDY])('U1: align-user-docs produces %s', (path) => {
    expect(produced).toContain(path);
  });

  it('U2: user-docs.yaml moved past 1.6, with the 1.7 dl-128 history entry (bug-314: at least, never exact)', () => {
    expect(userDocs.version).toBeGreaterThan(1.6);
    expect(raw.split('\n').find((line) => /^version:/.test(line)) ?? '').toContain('1.7 dl-128');
  });

  it('U3: checks.post still runs presentation.current', () => {
    expect(phase.checks?.post).toContain('presentation.current');
  });

  it.each([COMPARISON, CASE_STUDY])('S1: docs/site.yaml lists %s as a page and in the Optional llms section', (path) => {
    expect(site.pages).toContain(path);
    const optional = site.llms.find(({ section: title }) => title === 'Optional');
    expect(optional?.entries.map((entry) => entry.path)).toContain(path);
  });

  it('S1: docs/site.yaml moved to at least 1.1, with the 1.1 dl-128 history entry', () => {
    expect(site.version).toBeGreaterThanOrEqual(1.1);
    expect(siteRaw.split('\n').find((line) => /^version:/.test(line)) ?? '').toContain('1.1 dl-128');
  });

  it.each([COMPARISON, CASE_STUDY])('S2: llms.txt indexes %s', (path) => {
    expect(read('llms.txt')).toMatch(new RegExp(`\\]\\(https://[^)\\s]*/${path.replace(/[.]/g, '\\.')}\\)`));
  });

  it.each([COMPARISON, CASE_STUDY])('R1: the README Documentation table links %s (ruling D3 (a))', (path) => {
    const readme = read('README.md');
    const documentation = subsection(readme, 'Documentation');
    const links = tables(documentation).flatMap(({ rows }) => rows.flatMap((row) => [...row.join('|').matchAll(/\]\(([^)\s]+)\)/g)].map((match) => match[1])));
    expect(links).toContain(path);
  });
});
