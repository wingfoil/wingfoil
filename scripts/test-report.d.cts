/** The classes a test file is reported under (task-244, `dl-136`), in the summary's row order. */
export type SuiteClass = 'unit' | 'integration' | 'BDD' | 'smoke' | 'API-docs' | 'lint.clean';

/** The classes, in the order the summary's table lists them. */
export const SUITE_CLASSES: readonly SuiteClass[];

/** What one class (or the whole run) counts. */
export interface ClassCounts {
  /** Test files (suites), a suite that failed to run included. */
  readonly files: number;
  /** Tests (assertions). */
  readonly tests: number;
  readonly passed: number;
  /** Failed assertions; a suite that failed to run adds none, it is listed in the failures. */
  readonly failed: number;
  /** `pending`, `skipped`, `todo` and `disabled` tests. */
  readonly skipped: number;
}

/**
 * One failure: a failed test by its full name; a suite that failed to run (`test: null`); or a suite that failed
 * while its tests passed, an error in a hook such as `afterAll` (`test: 'suite error outside its tests'`).
 */
export interface Failure {
  /** The test file, relative to the root, with `/`. */
  readonly file: string;
  readonly test: string | null;
}

/** Outcome of {@link summarizeResults}. */
export interface ResultsSummary {
  readonly classes: Readonly<Record<SuiteClass, ClassCounts>>;
  readonly total: ClassCounts;
  /** Sorted by file, then test name (code-point order). */
  readonly failures: readonly Failure[];
  /** `true` when there is no failure and Jest's `success` is not false (a missed coverage threshold makes it false). */
  readonly passed: boolean;
}

/** One coverage metric of the `total` entry. */
export interface CoverageMetric {
  readonly covered: number;
  readonly total: number;
  readonly pct: number;
}

/** Outcome of {@link coverageTotals}. */
export interface CoverageTotals {
  readonly statements: CoverageMetric;
  readonly branches: CoverageMetric;
  readonly functions: CoverageMetric;
  readonly lines: CoverageMetric;
}

/** The run the summary describes. */
export interface SummaryMeta {
  /** The full commit sha. */
  readonly commit: string;
  /** The release tag; `n/a` when absent (a candidate run). */
  readonly tag?: string;
  /** The CI run's URL; `n/a` when absent (a local run). */
  readonly runUrl?: string;
  /** The build stamp, `<version> (<commit>)` (`dl-111`). */
  readonly build: string;
}

/**
 * The class of one test file, by the first rule that matches: `lint.clean`, `API-docs`, `smoke` by exact path;
 * `BDD` when its leading block comment cites a `.feature` file, in any path spelling;
 * `integration` for `*.integration.test.ts`; `unit` otherwise.
 */
export function classifySuite(relPath: string, source: string): SuiteClass;

/**
 * Counts per class and in total, and the failures, of Jest's `--json` output. Throws on output with no
 * `testResults`, an unknown assertion status, or a test file outside `root`.
 */
export function summarizeResults(results: unknown, root: string, readSource: (relPath: string) => string): ResultsSummary;

/** The `total` entry of a `coverage-summary.json`. Throws when it is missing. */
export function coverageTotals(summary: unknown): CoverageTotals;

/** The Markdown summary: the run's fields, the suites table, the coverage table and the failures, if any. */
export function formatSummary(results: ResultsSummary, coverage: CoverageTotals, meta: SummaryMeta): string;

/** Parse the command line (see the script's header). */
export function parseArgs(
  argv: readonly string[],
): { readonly ok: true; readonly options: Readonly<Record<string, string>>; readonly message?: undefined } | { readonly ok: false; readonly message: string; readonly options?: undefined };
