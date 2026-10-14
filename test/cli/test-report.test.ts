/**
 * task-244 AC 1 (`dl-136` Q1 (c), Q2 (a); spec-015 §2–§3) — a release keeps its test results and coverage.
 *
 * - `jest.config.js` writes `coverage/coverage-summary.json` and `coverage/lcov.info` (`coverageReporters`
 *   exactly `json-summary`, `lcov`, `text`: approver ruling D5, 2026-10-14), and `npm run test:report` runs the
 *   suite once with coverage and Jest's `--json` into `coverage/` (ruling D8).
 * - `scripts/test-report.cjs` classifies Jest's `--json` output per test file into unit / integration / BDD /
 *   smoke / API-docs / lint.clean (BDD = the file's leading block comment cites a feature file: ruling D2),
 *   counts each class, reads the coverage totals, and writes the Markdown summary the release keeps (commit,
 *   tag, CI run, build). Pure and deterministic: no clock, no host detail, the JSON's timings never printed.
 *
 * Asserted through the exported functions on the synthetic Jest 30 `--json` file in
 * `test/fixtures/test-report/` (field names of `@jest/test-result`'s `FormattedTestResults`; its sources come
 * through `readSource`, so nothing is read from disk), and through the command line on a tree built in a
 * temporary directory. The module is loaded inside each test, so a missing script fails the test, not the file.
 */
import { spawnSync } from 'node:child_process';
import type { SpawnSyncReturns } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const REPO_ROOT = join(__dirname, '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'test-report.cjs');
const FIXTURES = join(REPO_ROOT, 'test', 'fixtures', 'test-report');
const FIXTURE_ROOT = '/fixture-root';

type SuiteClass = 'unit' | 'integration' | 'BDD' | 'smoke' | 'API-docs' | 'lint.clean';

interface ClassCounts {
  readonly files: number;
  readonly tests: number;
  readonly passed: number;
  readonly failed: number;
  readonly skipped: number;
}

interface ResultsSummary {
  readonly classes: Readonly<Record<SuiteClass, ClassCounts>>;
  readonly total: ClassCounts;
  readonly failures: readonly { readonly file: string; readonly test: string | null }[];
  readonly passed: boolean;
}

interface Metric {
  readonly covered: number;
  readonly total: number;
  readonly pct: number;
}

interface CoverageTotals {
  readonly statements: Metric;
  readonly branches: Metric;
  readonly functions: Metric;
  readonly lines: Metric;
}

interface SummaryMeta {
  readonly commit: string;
  readonly tag?: string;
  readonly runUrl?: string;
  readonly build: string;
}

/** The interface the design fixes for `scripts/test-report.cjs` (its `.d.cts`). */
interface TestReportModule {
  readonly SUITE_CLASSES: readonly SuiteClass[];
  classifySuite(relPath: string, source: string): SuiteClass;
  summarizeResults(results: unknown, root: string, readSource: (relPath: string) => string): ResultsSummary;
  coverageTotals(summary: unknown): CoverageTotals;
  formatSummary(results: ResultsSummary, coverage: CoverageTotals, meta: SummaryMeta): string;
}

/** Loaded per test: until the script exists, each test fails on `Cannot find module`, not the whole file. */
function load(): TestReportModule {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(SCRIPT) as TestReportModule;
}

const FEATURE = 'docs/02_requirements/02_bdd/features/p1-memory/memory-add.feature';
const BDD_HEADER = `/**\n * Acceptance scenarios of ${FEATURE}.\n */\n`;

/** The source of every file in the fixture, by path relative to the root. */
const SOURCES: Readonly<Record<string, string>> = {
  'test/memory/add.test.ts': "import { add } from '../../src/memory';\n\ndescribe('memory add', () => {});\n",
  'test/core/a.test.ts': "/** A plain unit suite. */\nimport { a } from '../../src/core';\n",
  'test/cli/program.integration.test.ts': "/** Spawns the CLI. */\nimport { spawnSync } from 'node:child_process';\n",
  'test/memory/add-bdd.test.ts': `${BDD_HEADER}import { add } from '../../src/memory';\n`,
  'test/cli/e2e-smoke.test.ts': `${BDD_HEADER}import { spawnSync } from 'node:child_process';\n`,
  'test/docs/api-docs.test.ts': `${BDD_HEADER}import { join } from 'node:path';\n`,
  'test/lint/lint-clean.test.ts': "/** eslint is clean. */\nimport { spawnSync } from 'node:child_process';\n",
};

function readSource(relPath: string): string {
  const source = SOURCES[relPath];
  if (source === undefined) throw new Error(`no fixture source for ${relPath}`);
  return source;
}

function fixtureResults(): { testResults: Record<string, unknown>[] } & Record<string, unknown> {
  return JSON.parse(readFileSync(join(FIXTURES, 'jest-results.json'), 'utf-8')) as {
    testResults: Record<string, unknown>[];
  } & Record<string, unknown>;
}

function fixtureCoverage(): unknown {
  return JSON.parse(readFileSync(join(FIXTURES, 'coverage-summary.json'), 'utf-8')) as unknown;
}

const COMMIT = '0123456789abcdef0123456789abcdef01234567';
const META: SummaryMeta = {
  commit: COMMIT,
  tag: 'v0.3.0',
  runUrl: 'https://github.com/wingfoil/wingfoil/actions/runs/123456789',
  build: `0.3.0 (${COMMIT})`,
};

/** The cell of a two-column `| <label> | <cell> |` row, or undefined. */
function fieldCell(markdown: string, label: string): string | undefined {
  const line = markdown.split('\n').find((l) => l.startsWith(`| ${label} |`));
  return line === undefined ? undefined : line.split('|')[2]?.trim();
}

/** The data rows of the table whose header line is exactly `header`, each as its trimmed cells. */
function tableRows(markdown: string, header: string): string[][] {
  const lines = markdown.split('\n');
  const start = lines.indexOf(header);
  if (start === -1) return [];
  const rows: string[][] = [];
  for (const line of lines.slice(start + 2)) {
    if (!line.startsWith('|')) break;
    rows.push(line.split('|').slice(1, -1).map((c) => c.trim()));
  }
  return rows;
}

const SUITES_HEADER = '| Suite | Files | Tests | Passed | Failed | Skipped |';
const COVERAGE_HEADER = '| Metric | Covered | Total | % |';

describe('AC 1 — the coverage reporters and the `test:report` script', () => {
  it('jest.config.js `coverageReporters` are exactly json-summary, lcov and text (ruling D5)', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const config = require(join(REPO_ROOT, 'jest.config.js')) as { coverageReporters?: unknown };
    expect(config.coverageReporters).toEqual(['json-summary', 'lcov', 'text']);
  });

  it('package.json declares `test:report`: one suite run, with coverage and Jest JSON into coverage/ (ruling D8)', () => {
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf-8')) as { scripts?: Record<string, string> };
    expect(pkg.scripts?.['test:report']).toBe('jest --coverage --json --outputFile=coverage/jest-results.json');
  });
});

describe('AC 1 — classifySuite: first rule that matches', () => {
  it('declares the six classes, in report order', () => {
    expect(load().SUITE_CLASSES).toEqual(['unit', 'integration', 'BDD', 'smoke', 'API-docs', 'lint.clean']);
  });

  it.each([
    ['test/lint/lint-clean.test.ts', 'lint.clean'],
    ['test/docs/api-docs.test.ts', 'API-docs'],
    ['test/cli/e2e-smoke.test.ts', 'smoke'],
  ])('%s is %s, by its exact path — even when its header cites a feature', (relPath, expected) => {
    const { classifySuite } = load();
    expect(classifySuite(relPath, "import { x } from 'y';\n")).toBe(expected);
    expect(classifySuite(relPath, `${BDD_HEADER}import { x } from 'y';\n`)).toBe(expected);
  });

  it('a file whose leading block comment cites a feature file is BDD (ruling D2)', () => {
    expect(load().classifySuite('test/memory/add-bdd.test.ts', `${BDD_HEADER}import { x } from 'y';\n`)).toBe('BDD');
  });

  it('a `.integration.test.ts` whose header cites a feature is BDD (BDD comes first)', () => {
    expect(load().classifySuite('test/cli/journey.integration.test.ts', `${BDD_HEADER}import { x } from 'y';\n`)).toBe('BDD');
  });

  it('a `.integration.test.ts` with no feature in its header is integration', () => {
    expect(load().classifySuite('test/cli/program.integration.test.ts', "/** Spawns the CLI. */\nimport { x } from 'y';\n")).toBe(
      'integration',
    );
  });

  it('a feature cited only after the header (in the code or a later comment) is not BDD', () => {
    const source = `/** A unit suite. */\nimport { x } from 'y';\n\n/* Covers one scenario of ${FEATURE}. */\ndescribe('x', () => {});\n`;
    expect(load().classifySuite('test/core/context.test.ts', source)).toBe('unit');
  });

  it('a feature path inside a fixture string is not BDD (no block comment before the code)', () => {
    const source = `import { x } from 'y';\n\nconst FIXTURE = '/* ${FEATURE} */';\n`;
    expect(load().classifySuite('test/release-health/measure.test.ts', source)).toBe('unit');
  });

  // Review send-back F2 (2026-10-14, ruling D2's wording): a `.feature` file named anywhere in the header comment,
  // in any path spelling, makes the file BDD — not only the full `docs/02_requirements/02_bdd/features/…` path.
  it('a header citing a bare feature file name (`P5.1.4-cli-ux.feature`) is BDD', () => {
    const source = "/**\n * task-1 — error details.\n *\n * BDD: `P5.1.4-cli-ux.feature`, \"Error - a refusal's details follow its error line\".\n */\nimport { x } from 'y';\n";
    expect(load().classifySuite('test/cli/error-details.test.ts', source)).toBe('BDD');
  });

  it('a header citing a feature by a relative path (`p5-interaction/P5.1.4-cli-ux.feature`) is BDD', () => {
    const source = "/** Scenarios of p5-interaction/P5.1.4-cli-ux.feature. */\nimport { x } from 'y';\n";
    expect(load().classifySuite('test/cli/cli-ux.test.ts', source)).toBe('BDD');
  });

  // Re-review send-back R1 (2026-10-14): a test file named `….feature.test.ts` is not a feature file.
  it('a header naming only a `*.feature.test.ts` test file (no `.feature` file) is not BDD', () => {
    const source = "/**\n * Pairs with `test/mcp/mcp-prompts.feature.test.ts` and `role-prompt.feature.test.ts`.\n */\nimport { x } from 'y';\n";
    expect(load().classifySuite('test/mcp/role-prompt-context.test.ts', source)).toBe('unit');
  });

  it('a bare feature file name cited only after the header is not BDD', () => {
    const source = "/** A unit suite. */\nimport { x } from 'y';\n\n// See P5.1.4-cli-ux.feature.\nconst NAME = 'P5.1.4-cli-ux.feature';\n";
    expect(load().classifySuite('test/cli/names.test.ts', source)).toBe('unit');
  });

  it('every other file is unit', () => {
    expect(load().classifySuite('test/memory/add.test.ts', "import { add } from '../../src/memory';\n")).toBe('unit');
  });
});

describe('AC 1 — summarizeResults: counts per class, on the JSON fixture', () => {
  const zero: ClassCounts = { files: 0, tests: 0, passed: 0, failed: 0, skipped: 0 };

  it('counts files, tests, passed, failed and skipped (pending, skipped, todo, disabled) per class and in total', () => {
    const summary = load().summarizeResults(fixtureResults(), FIXTURE_ROOT, readSource);
    expect(summary.classes).toEqual({
      unit: { files: 2, tests: 4, passed: 2, failed: 1, skipped: 1 },
      integration: { files: 1, tests: 3, passed: 2, failed: 0, skipped: 1 },
      BDD: { files: 1, tests: 3, passed: 1, failed: 2, skipped: 0 },
      smoke: { files: 1, tests: 0, passed: 0, failed: 0, skipped: 0 },
      'API-docs': { files: 1, tests: 2, passed: 1, failed: 0, skipped: 1 },
      'lint.clean': { files: 1, tests: 2, passed: 1, failed: 0, skipped: 1 },
    });
    expect(summary.total).toEqual({ files: 7, tests: 14, passed: 7, failed: 3, skipped: 4 });
    expect(summary.passed).toBe(false);
  });

  it('lists every failed assertion, and a suite that failed to run with `test: null`', () => {
    const { failures } = load().summarizeResults(fixtureResults(), FIXTURE_ROOT, readSource);
    expect([...failures].sort((a, b) => `${a.file} ${a.test ?? ''}`.localeCompare(`${b.file} ${b.test ?? ''}`))).toEqual([
      { file: 'test/cli/e2e-smoke.test.ts', test: null },
      { file: 'test/core/a.test.ts', test: 'core a fails' },
      { file: 'test/memory/add-bdd.test.ts', test: 'Feature add b first' },
      { file: 'test/memory/add-bdd.test.ts', test: 'Feature add z last' },
    ]);
  });

  it('a run with no failure is `passed`, every class with no file at zero', () => {
    const results = fixtureResults();
    results.testResults = results.testResults.filter((r) => r.name === `${FIXTURE_ROOT}/test/memory/add.test.ts`);
    results.success = true;
    const summary = load().summarizeResults(results, FIXTURE_ROOT, readSource);
    expect(summary.passed).toBe(true);
    expect(summary.failures).toEqual([]);
    expect(summary.classes.unit).toEqual({ files: 1, tests: 3, passed: 2, failed: 0, skipped: 1 });
    expect(summary.classes.BDD).toEqual(zero);
  });

  it('throws on an assertion status outside the known set', () => {
    const results = fixtureResults();
    const first = results.testResults[0] as { assertionResults: { status: string }[] };
    first.assertionResults[0]!.status = 'bogus';
    const { summarizeResults } = load();
    expect(() => summarizeResults(results, FIXTURE_ROOT, readSource)).toThrow();
  });

  it('throws on a test file outside the root', () => {
    const results = fixtureResults();
    (results.testResults[0] as { name: string }).name = '/elsewhere/test/memory/add.test.ts';
    const { summarizeResults } = load();
    expect(() => summarizeResults(results, FIXTURE_ROOT, readSource)).toThrow();
  });

  it('throws on results with no `testResults` array', () => {
    const { summarizeResults } = load();
    expect(() => summarizeResults({}, FIXTURE_ROOT, readSource)).toThrow();
  });
});

/**
 * Review send-back F1 (2026-10-14): the verdict also reads Jest's own `success` (Jest 30: false on a failed test,
 * a snapshot failure or a reporter error — a missed coverage threshold is one), so a threshold-only failure is
 * never summarised as passed; and a suite that failed with only passing assertions (an `afterAll` error) is a
 * listed failure, not a suite that failed to run.
 */
describe('AC 1 — the verdict: Jest `success` and suite-level failures (review F1)', () => {
  const oneSuite = (suiteStatus: string, success: boolean): Record<string, unknown> => ({
    success,
    testResults: [
      {
        name: `${FIXTURE_ROOT}/test/memory/add.test.ts`,
        status: suiteStatus,
        message: suiteStatus === 'failed' ? '  ● Test suite failed in afterAll' : '',
        summary: '',
        startTime: 1,
        endTime: 2,
        coverage: null,
        assertionResults: [
          { ancestorTitles: ['memory add'], fullName: 'memory add writes the file', location: null, status: 'passed', title: 'writes the file', duration: 1, failureMessages: [] },
        ],
      },
    ],
  });

  it('`success: false` with no failed assertion (a coverage-threshold miss) is not passed', () => {
    expect(load().summarizeResults(oneSuite('passed', false), FIXTURE_ROOT, readSource).passed).toBe(false);
  });

  it('`success: true` with no failure is passed', () => {
    expect(load().summarizeResults(oneSuite('passed', true), FIXTURE_ROOT, readSource).passed).toBe(true);
  });

  it('the summary’s Result reads `failed` for `success: false` with no failed assertion', () => {
    const mod = load();
    const md = mod.formatSummary(
      mod.summarizeResults(oneSuite('passed', false), FIXTURE_ROOT, readSource),
      mod.coverageTotals(fixtureCoverage()),
      META,
    );
    expect(fieldCell(md, 'Result')?.replace(/`/g, '')).toBe('failed');
  });

  it('a failed suite whose assertions all passed (an afterAll error) is listed, and not as "suite failed to run"', () => {
    const mod = load();
    const summary = mod.summarizeResults(oneSuite('failed', true), FIXTURE_ROOT, readSource);
    expect(summary.passed).toBe(false);
    expect(summary.failures.map((f) => f.file)).toEqual(['test/memory/add.test.ts']);
    expect(summary.failures[0]?.test).not.toBeNull();
    const md = mod.formatSummary(summary, mod.coverageTotals(fixtureCoverage()), META);
    const lines = md.slice(md.indexOf('## Failures')).split('\n').filter((l) => l.startsWith('- '));
    expect(lines).toHaveLength(1);
    expect(lines[0]?.startsWith('- `test/memory/add.test.ts` — ')).toBe(true);
    expect(lines[0]).not.toContain('suite failed to run');
  });
});

describe('AC 1 — coverageTotals', () => {
  it('reads covered, total and pct of the `total` entry for the four metrics', () => {
    expect(load().coverageTotals(fixtureCoverage())).toEqual({
      statements: { covered: 990, total: 1100, pct: 90 },
      branches: { covered: 581, total: 700, pct: 83 },
      functions: { covered: 261, total: 300, pct: 87 },
      lines: { covered: 912, total: 1000, pct: 91.2 },
    });
  });

  it('throws on a coverage summary without `total`', () => {
    const { coverageTotals } = load();
    expect(() => coverageTotals({ '/fixture-root/src/a.ts': {} })).toThrow();
  });
});

describe('AC 1 — formatSummary: the Markdown summary', () => {
  function render(meta: SummaryMeta = META, results: unknown = fixtureResults()): string {
    const mod = load();
    return mod.formatSummary(mod.summarizeResults(results, FIXTURE_ROOT, readSource), mod.coverageTotals(fixtureCoverage()), meta);
  }

  it('is titled by the tag', () => {
    expect(render().split('\n')[0]).toBe('# Test results — v0.3.0');
  });

  it('is titled by the commit when there is no tag', () => {
    const first = render({ commit: COMMIT, build: META.build }).split('\n')[0] ?? '';
    expect(first.startsWith('# Test results — ')).toBe(true);
    expect(first).toContain(COMMIT);
  });

  it('has the field rows Commit, Tag, CI run, Build, Result — in that order', () => {
    const md = render();
    const positions = ['Commit', 'Tag', 'CI run', 'Build', 'Result'].map((label) =>
      md.split('\n').findIndex((l) => l.startsWith(`| ${label} |`)),
    );
    expect(positions.every((i) => i > 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(fieldCell(md, 'Commit')).toBe(`\`${COMMIT}\``);
    expect(fieldCell(md, 'Tag')?.replace(/`/g, '')).toBe('v0.3.0');
    expect(fieldCell(md, 'CI run')).toContain(META.runUrl);
    expect(fieldCell(md, 'Build')).toBe(`\`0.3.0 (${COMMIT})\``);
    expect(fieldCell(md, 'Result')?.replace(/`/g, '')).toBe('failed');
  });

  it('prints `n/a` for an absent tag and CI run URL', () => {
    const md = render({ commit: COMMIT, build: META.build });
    expect(fieldCell(md, 'Tag')).toBe('n/a');
    expect(fieldCell(md, 'CI run')).toBe('n/a');
  });

  it('has a `## Suites` table: rows unit, integration, BDD, smoke, API-docs, lint.clean, total, with the counts', () => {
    const md = render();
    expect(md).toContain('\n## Suites\n');
    expect(md.indexOf('## Suites')).toBeLessThan(md.indexOf(SUITES_HEADER));
    expect(tableRows(md, SUITES_HEADER)).toEqual([
      ['unit', '2', '4', '2', '1', '1'],
      ['integration', '1', '3', '2', '0', '1'],
      ['BDD', '1', '3', '1', '2', '0'],
      ['smoke', '1', '0', '0', '0', '0'],
      ['API-docs', '1', '2', '1', '0', '1'],
      ['lint.clean', '1', '2', '1', '0', '1'],
      ['total', '7', '14', '7', '3', '4'],
    ]);
  });

  it('states the classification rules, the latency suites run apart, and the staging smoke as the run’s `stage` job (ruling D4)', () => {
    const md = render();
    const suites = md.slice(md.indexOf('## Suites'), md.indexOf('## Coverage'));
    for (const needle of [
      'test/lint/lint-clean.test.ts',
      'test/docs/api-docs.test.ts',
      'test/cli/e2e-smoke.test.ts',
      'docs/02_requirements/02_bdd/features/',
      '.integration.test.ts',
      'test/latency-suites.cjs',
      '`stage`',
    ]) {
      expect([needle, suites.includes(needle)]).toEqual([needle, true]);
    }
  });

  it('has a `## Coverage` table: statements, branches, functions, lines with covered, total and pct as given', () => {
    const md = render();
    expect(md).toContain('\n## Coverage\n');
    expect(tableRows(md, COVERAGE_HEADER)).toEqual([
      ['statements', '990', '1100', '90'],
      ['branches', '581', '700', '83'],
      ['functions', '261', '300', '87'],
      ['lines', '912', '1000', '91.2'],
    ]);
  });

  it('lists the failures under `## Failures`, sorted by file then name, a suite that did not run as such', () => {
    const md = render();
    const failures = md.slice(md.indexOf('## Failures')).split('\n').filter((l) => l.startsWith('- '));
    expect(failures).toEqual([
      '- `test/cli/e2e-smoke.test.ts` — suite failed to run',
      '- `test/core/a.test.ts` — core a fails',
      '- `test/memory/add-bdd.test.ts` — Feature add b first',
      '- `test/memory/add-bdd.test.ts` — Feature add z last',
    ]);
  });

  it('has no `## Failures` section on a green run, and Result `passed`', () => {
    const results = fixtureResults();
    results.testResults = results.testResults.filter((r) => r.name === `${FIXTURE_ROOT}/test/memory/add.test.ts`);
    results.success = true;
    const md = render(META, results);
    expect(md).not.toContain('## Failures');
    expect(fieldCell(md, 'Result')?.replace(/`/g, '')).toBe('passed');
  });

  it('is deterministic: shuffled testResults and changed timings give byte-identical output, with no date in it', () => {
    const baseline = render();
    const shuffled = fixtureResults();
    shuffled.testResults = [...shuffled.testResults].reverse().map((r, i) => ({
      ...r,
      startTime: 1900000000000 + i * 7,
      endTime: 1900000009999 + i * 7,
      assertionResults: [...(r.assertionResults as Record<string, unknown>[])].reverse().map((a) => ({ ...a, duration: 4242 })),
    }));
    shuffled.startTime = 1900000000000;
    expect(render(META, shuffled)).toBe(baseline);
    expect(baseline).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});

describe('AC 1 — the command line', () => {
  let root: string;

  /** A temporary root holding the fixture's test sources, its results (names under that root), coverage and build info. */
  function buildTree(results: unknown = rootedResults()): void {
    for (const [rel, source] of Object.entries(SOURCES)) {
      mkdirSync(dirname(join(root, rel)), { recursive: true });
      writeFileSync(join(root, rel), source);
    }
    mkdirSync(join(root, 'coverage'), { recursive: true });
    mkdirSync(join(root, 'dist'), { recursive: true });
    writeFileSync(join(root, 'coverage', 'jest-results.json'), JSON.stringify(results));
    writeFileSync(join(root, 'coverage', 'coverage-summary.json'), JSON.stringify(fixtureCoverage()));
    writeFileSync(join(root, 'dist', 'build-info.json'), `${JSON.stringify({ version: '0.3.0', commit: COMMIT }, null, 2)}\n`);
  }

  function rootedResults(): unknown {
    const results = fixtureResults();
    for (const r of results.testResults) (r as { name: string }).name = (r as { name: string }).name.replace(FIXTURE_ROOT, root);
    return results;
  }

  function args(overrides: Readonly<Record<string, string | null>> = {}): string[] {
    const base: Record<string, string | null> = {
      '--results': join(root, 'coverage', 'jest-results.json'),
      '--coverage-summary': join(root, 'coverage', 'coverage-summary.json'),
      '--build-info': join(root, 'dist', 'build-info.json'),
      '--commit': COMMIT,
      '--tag': 'v0.3.0',
      '--run-url': META.runUrl ?? '',
      '--out': join(root, 'coverage', 'test-results.md'),
      '--root': root,
      ...overrides,
    };
    return Object.entries(base).flatMap(([k, v]) => (v === null ? [] : [k, v]));
  }

  function run(argv: readonly string[]): SpawnSyncReturns<string> {
    return spawnSync(process.execPath, [SCRIPT, ...argv], { cwd: root, encoding: 'utf-8' });
  }

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'wf-test-report-'));
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('writes `--out` and exits 0 — also for results with failures (the verdict is in the summary)', () => {
    buildTree();
    const result = run(args());
    expect(result.status).toBe(0);
    const md = readFileSync(join(root, 'coverage', 'test-results.md'), 'utf-8');
    expect(md.split('\n')[0]).toBe('# Test results — v0.3.0');
    expect(fieldCell(md, 'Build')).toBe(`\`0.3.0 (${COMMIT})\``);
    expect(fieldCell(md, 'Result')?.replace(/`/g, '')).toBe('failed');
  });

  it.each([
    ['an unknown option', { '--bogus': 'x' }],
    ['a missing --results', { '--results': null }],
    ['a missing --commit', { '--commit': null }],
    ['a missing --out', { '--out': null }],
    ['a short --commit', { '--commit': '0123abc' }],
  ])('exits 2 with `test-report:` on stderr for %s', (_label, overrides) => {
    buildTree();
    const result = run(args(overrides));
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/^test-report: /m);
    expect(existsSync(join(root, 'coverage', 'test-results.md'))).toBe(false);
  });

  it('exits 1 with `test-report:` on stderr for an unreadable results file', () => {
    buildTree();
    const result = run(args({ '--results': join(root, 'coverage', 'missing.json') }));
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/^test-report: /m);
  });

  it('exits 1 with `test-report:` on stderr for a results file with no `testResults`', () => {
    buildTree({ numTotalTests: 0 });
    const result = run(args());
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/^test-report: /m);
  });
});
