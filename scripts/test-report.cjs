#!/usr/bin/env node
/**
 * task-244 (`dl-136` Q1 (c), Q2 (a), Q3 (a); spec-015 §3) — the Markdown summary of one test run: Jest's own
 * `--json` output classified per test file, the coverage totals of `coverage-summary.json`, and the run's
 * commit, tag, CI run URL and build (`dl-111`'s `<version> (<commit>)`).
 *
 * Run by `.github/workflows/publish.yml`'s `gate` job after `npm run test:report`, and by `release-submit`'s
 * `pre-release-checks` on the release candidate (`.wingfoil/workflows/custom/release-submit.yaml`).
 *
 * Classification, per test file, the first rule that matches (`SUITE_RULES`; approver ruling D2, 2026-10-14):
 * `lint.clean`, `API-docs` and `smoke` by exact path; `BDD` when the file's leading block comment cites a
 * `.feature` under `docs/02_requirements/02_bdd/features/`; `integration` by the `.integration.test.ts` name;
 * `unit` for every other file. Each class counts its files, its tests (assertions) and how many passed, failed
 * and were skipped (`pending`, `skipped`, `todo`, `disabled`). A suite that failed to run counts as one file
 * with no test, and is listed under the failures.
 *
 * Pure and deterministic (REQ-SYS-07): no clock, no host detail; the JSON's timings are never printed, and rows
 * and failures come in a fixed order whatever order Jest reported them in.
 *
 * Usage: node scripts/test-report.cjs --results <jest.json> --coverage-summary <coverage-summary.json>
 *          --build-info <dist/build-info.json> --commit <sha> --out <summary.md>
 *          [--tag <tag>] [--run-url <url>] [--root <dir>]   (--root: the directory test paths are relative to; default the cwd)
 * Exit:  0 the summary is written, whatever the tests' verdict (it is in the summary) · 1 invalid input · 2 usage error
 */
'use strict';

const { readFileSync, writeFileSync } = require('node:fs');
const { isAbsolute, join, relative, resolve, sep } = require('node:path');

/** The classes, in the order the summary's table lists them. */
const SUITE_CLASSES = Object.freeze(['unit', 'integration', 'BDD', 'smoke', 'API-docs', 'lint.clean']);

/** A feature file cited in a test's header comment (ruling D2). */
const FEATURE_CITATION = /docs\/02_requirements\/02_bdd\/features\/[^\s`'"*]+\.feature/;

/** The test files classified by their exact path, checked first. */
const EXACT_PATHS = Object.freeze({
  'test/lint/lint-clean.test.ts': 'lint.clean',
  'test/docs/api-docs.test.ts': 'API-docs',
  'test/cli/e2e-smoke.test.ts': 'smoke',
});

/** Assertion statuses counted as skipped; `passed` and `failed` are counted as such, any other status is invalid. */
const SKIPPED_STATUSES = Object.freeze(['pending', 'skipped', 'todo', 'disabled']);

/** The coverage metrics, in the order the summary's table lists them. */
const METRICS = Object.freeze(['statements', 'branches', 'functions', 'lines']);

/** A full commit sha: 40 (SHA-1) or 64 (SHA-256) hex digits, as `publish-staging.cjs --expect-commit` takes. */
const FULL_SHA = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

/**
 * The leading block comment of `source` — the first `/* … *\/` before any code — or `''`.
 *
 * @param {string} source
 * @returns {string}
 */
function leadingBlockComment(source) {
  const match = /^\s*(\/\*[\s\S]*?\*\/)/.exec(source.replace(/^#![^\n]*\n/, ''));
  return match === null ? '' : match[1];
}

/**
 * The class of one test file.
 *
 * @param {string} relPath the file's path relative to the root, with `/`
 * @param {string} source its content
 * @returns {string}
 */
function classifySuite(relPath, source) {
  const exact = EXACT_PATHS[relPath];
  if (exact !== undefined) return exact;
  if (FEATURE_CITATION.test(leadingBlockComment(source))) return 'BDD';
  if (relPath.endsWith('.integration.test.ts')) return 'integration';
  return 'unit';
}

/** @returns {{ files: number, tests: number, passed: number, failed: number, skipped: number }} */
function zeroCounts() {
  return { files: 0, tests: 0, passed: 0, failed: 0, skipped: 0 };
}

/**
 * The path of `name` relative to `root`, with `/`; throws when it lies outside.
 *
 * @param {string} name
 * @param {string} root
 * @returns {string}
 */
function relativeTo(name, root) {
  const rel = relative(resolve(root), resolve(name));
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) throw new Error(`test file ${name} is outside the root ${root}`);
  return rel.split(sep).join('/');
}

/** Code-point order (not the locale's), so the output does not depend on the host. */
function byCodePoint(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * The counts per class and in total, and the failures, of a Jest `--json` result.
 *
 * @param {unknown} results Jest's `--json` output
 * @param {string} root the directory test paths are relative to
 * @param {(relPath: string) => string} readSource a test file's content, by relative path
 */
function summarizeResults(results, root, readSource) {
  const testResults = results !== null && typeof results === 'object' ? /** @type {any} */ (results).testResults : undefined;
  if (!Array.isArray(testResults)) throw new Error('the results have no `testResults` array: not Jest `--json` output');
  const classes = Object.fromEntries(SUITE_CLASSES.map((name) => [name, zeroCounts()]));
  const total = zeroCounts();
  const failures = [];
  for (const suite of testResults) {
    if (suite === null || typeof suite !== 'object' || typeof suite.name !== 'string') throw new Error('a test result has no `name`');
    const file = relativeTo(suite.name, root);
    const counts = classes[classifySuite(file, readSource(file))];
    const assertions = Array.isArray(suite.assertionResults) ? suite.assertionResults : [];
    for (const target of [counts, total]) target.files += 1;
    let failedHere = 0;
    for (const assertion of assertions) {
      const status = assertion?.status;
      let key;
      if (status === 'passed' || status === 'failed') key = status;
      else if (SKIPPED_STATUSES.includes(status)) key = 'skipped';
      else throw new Error(`${file}: unknown assertion status ${JSON.stringify(status)}`);
      for (const target of [counts, total]) {
        target.tests += 1;
        target[key] += 1;
      }
      if (status === 'failed') {
        failedHere += 1;
        failures.push({ file, test: String(assertion.fullName ?? assertion.title ?? '') });
      }
    }
    if (suite.status === 'failed' && failedHere === 0) failures.push({ file, test: null });
  }
  failures.sort((a, b) => byCodePoint(a.file, b.file) || byCodePoint(a.test ?? '', b.test ?? ''));
  return { classes, total, failures, passed: failures.length === 0 };
}

/**
 * The `total` entry of a `coverage-summary.json`: covered, total and pct per metric.
 *
 * @param {unknown} summary
 */
function coverageTotals(summary) {
  const entry = summary !== null && typeof summary === 'object' ? /** @type {any} */ (summary).total : undefined;
  if (entry === null || typeof entry !== 'object') throw new Error('the coverage summary has no `total` entry');
  return Object.fromEntries(
    METRICS.map((metric) => {
      const value = entry[metric];
      if (value === null || typeof value !== 'object' || ![value.covered, value.total, value.pct].every((n) => typeof n === 'number')) {
        throw new Error(`the coverage summary's total has no numeric ${metric}`);
      }
      return [metric, { covered: value.covered, total: value.total, pct: value.pct }];
    }),
  );
}

/** One Markdown table row. */
function row(cells) {
  return `| ${cells.join(' | ')} |`;
}

/**
 * The Markdown summary.
 *
 * @param {ReturnType<typeof summarizeResults>} results
 * @param {ReturnType<typeof coverageTotals>} coverage
 * @param {{ commit: string, tag?: string, runUrl?: string, build: string }} meta
 * @returns {string}
 */
function formatSummary(results, coverage, meta) {
  const counts = (c) => [c.files, c.tests, c.passed, c.failed, c.skipped].map(String);
  const lines = [
    `# Test results — ${meta.tag ?? meta.commit}`,
    '',
    '| Field | Value |',
    '|---|---|',
    row(['Commit', `\`${meta.commit}\``]),
    row(['Tag', meta.tag === undefined ? 'n/a' : `\`${meta.tag}\``]),
    row(['CI run', meta.runUrl ?? 'n/a']),
    row(['Build', `\`${meta.build}\``]),
    row(['Result', results.passed ? 'passed' : 'failed']),
    '',
    '## Suites',
    '',
    '| Suite | Files | Tests | Passed | Failed | Skipped |',
    '|---|---:|---:|---:|---:|---:|',
    ...SUITE_CLASSES.map((name) => row([name, ...counts(results.classes[name])])),
    row(['total', ...counts(results.total)]),
    '',
    'One Jest run, classified per test file by the first rule that matches: `lint.clean` is ' +
      '`test/lint/lint-clean.test.ts`; `API-docs` is `test/docs/api-docs.test.ts`; `smoke` is ' +
      '`test/cli/e2e-smoke.test.ts`; `BDD` is a file whose leading block comment cites a `.feature` under ' +
      '`docs/02_requirements/02_bdd/features/`; `integration` is a `*.integration.test.ts` file; `unit` is every ' +
      'other file. Skipped counts pending, skipped, todo and disabled tests. The latency suites ' +
      '(`test/latency-suites.cjs`) run apart and are not in this run. The staging smoke is the CI run’s `stage` job.',
    '',
    '## Coverage',
    '',
    '| Metric | Covered | Total | % |',
    '|---|---:|---:|---:|',
    ...METRICS.map((metric) => row([metric, String(coverage[metric].covered), String(coverage[metric].total), String(coverage[metric].pct)])),
  ];
  if (results.failures.length > 0) {
    lines.push('', '## Failures', '');
    for (const failure of results.failures) lines.push(`- \`${failure.file}\` — ${failure.test ?? 'suite failed to run'}`);
  }
  return `${lines.join('\n')}\n`;
}

/** The options `parseArgs` accepts, each taking one value. */
const OPTIONS = Object.freeze({
  '--results': 'results',
  '--coverage-summary': 'coverageSummary',
  '--build-info': 'buildInfo',
  '--commit': 'commit',
  '--out': 'out',
  '--tag': 'tag',
  '--run-url': 'runUrl',
  '--root': 'root',
});
const REQUIRED = Object.freeze(['--results', '--coverage-summary', '--build-info', '--commit', '--out']);

/**
 * Parse the command line.
 *
 * @param {readonly string[]} argv
 * @returns {{ ok: true, options: Record<string, string> } | { ok: false, message: string }}
 */
function parseArgs(argv) {
  /** @type {Record<string, string>} */
  const options = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = OPTIONS[argv[i]];
    if (key === undefined) return { ok: false, message: `unknown option ${JSON.stringify(argv[i])}` };
    if (argv[i + 1] === undefined || argv[i + 1].startsWith('--')) return { ok: false, message: `${argv[i]} needs a value` };
    options[key] = argv[i + 1];
  }
  const missing = REQUIRED.filter((flag) => options[OPTIONS[flag]] === undefined);
  if (missing.length > 0) return { ok: false, message: `missing ${missing.join(', ')}` };
  if (!FULL_SHA.test(options.commit)) return { ok: false, message: `--commit ${JSON.stringify(options.commit)} is not a full commit sha (40 or 64 hex digits)` };
  return { ok: true, options };
}

/** A file read and parsed as JSON; throws with the path on failure. */
function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch (error) {
    throw new Error(`cannot read the ${label} ${path}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
}

/**
 * Write the summary the options describe.
 *
 * @param {Record<string, string>} options
 */
function writeReport(options) {
  const root = options.root ?? process.cwd();
  const readSource = (relPath) => {
    try {
      return readFileSync(join(root, relPath), 'utf-8');
    } catch (error) {
      throw new Error(`cannot read the test file ${relPath}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
    }
  };
  const results = summarizeResults(readJson(options.results, 'results'), root, readSource);
  const coverage = coverageTotals(readJson(options.coverageSummary, 'coverage summary'));
  const info = readJson(options.buildInfo, 'build info');
  if (typeof info?.version !== 'string' || typeof info?.commit !== 'string') throw new Error(`the build info ${options.buildInfo} has no version and commit`);
  const markdown = formatSummary(results, coverage, {
    commit: options.commit,
    tag: options.tag,
    runUrl: options.runUrl,
    build: `${info.version} (${info.commit})`,
  });
  writeFileSync(options.out, markdown);
}

/* istanbul ignore next -- the CLI entry point; spawned by test/cli/test-report.test.ts, whose child is not instrumented. */
function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed.ok) {
    process.stderr.write(`test-report: ${parsed.message}\n`);
    process.exit(2);
  }
  try {
    writeReport(parsed.options);
  } catch (error) {
    process.stderr.write(`test-report: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { SUITE_CLASSES, classifySuite, summarizeResults, coverageTotals, formatSummary, parseArgs };
