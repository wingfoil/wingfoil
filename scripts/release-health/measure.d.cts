/**
 * One metric of a release-health report (`docs/08_health/release-health.schema.json` `$defs.metric`): measured with
 * its value and raw counts, or not measured with the reason.
 */
export interface MetricEntry {
  readonly id: string;
  readonly status: 'measured' | 'not-measurable' | 'not-comparable';
  readonly reason?: string;
  readonly value?: unknown;
  readonly raw?: Readonly<Record<string, number | string | boolean | null>>;
  readonly items?: number;
  readonly small_sample?: boolean;
  readonly failing?: readonly string[];
  readonly evidence?: { readonly command?: string; readonly read_on?: string; readonly benchmark_commit?: string; readonly wingfoil_build?: string };
}

/** A release-health report, `release-health-<version>.json` (`docs/08_health/release-health.schema.json`). */
export interface Report {
  readonly schema_version: 1;
  readonly catalogue_version: number;
  readonly release: { readonly id: string; readonly version: string; readonly kind: 'major' | 'minor' | 'patch' };
  readonly measurement_point: { readonly ref: string; readonly commit: string; readonly basis: 'published-tag' | 'released-transition' };
  readonly previous: null | { readonly release: string; readonly commit: string; readonly report: string };
  readonly toolchain: { readonly node: string; readonly npm: string; readonly lockfile_sha256: string };
  readonly metrics: readonly MetricEntry[];
}

/** What an external source answered: the parsed JSON body and the response's `Date` header, or why it failed. */
export interface ExternalResponse {
  readonly ok: boolean;
  readonly body?: unknown;
  readonly date?: string | null;
  readonly error?: string;
}

/** Reads one external source: a GitHub API path (`gh api`) or a URL. The default runs `gh api --include` / `curl --include`. */
export type ExternalReader = (source: { readonly kind: 'gh' | 'url'; readonly target: string }) => ExternalResponse;

/** Options of {@link measureRelease}; the command-line flags of the same names. */
export interface MeasureOptions {
  /** The release version, `vX.Y` or `vX.Y.Z`: a release element at `HEAD` must carry it. */
  readonly release: string;
  /** The measurement point; default: the published tag, else the released transition (`dl-089` §1). */
  readonly at?: string;
  /** The previous measurement point; default: the most recent earlier report under `paths.health`. */
  readonly previous?: string;
  /** Skip the external snapshot: E01–E05 are `not-measurable`. */
  readonly offline?: boolean;
  /** The external reader (tests pass a stub). */
  readonly external?: ExternalReader;
  /** The catalogue file; default: `metrics.yaml` under `paths.health`. */
  readonly catalogue?: string;
}

/** Measure a release of the repository at `root`: one entry per catalogue metric, in catalogue order. */
export function measureRelease(root: string, options: MeasureOptions): Report;

/** The process conformance of `base..point` (REQ-STATE-10): P01–P06, each with items checked and failing items named. */
export function processConformance(root: string, point: string, base: string | null): MetricEntry[];

/** The report as written: two-space JSON and a final newline. */
export function formatReportJson(report: Report): string;

/** Split an HTTP response printed with its headers into `{ ok, date, body }` or `{ ok: false, error }`. */
export function parseHttp(text: string): ExternalResponse;

/** An HTTP `Date` header's day, `YYYY-MM-DD`, or `null`. */
export function httpDay(header: string | null | undefined): string | null;

/** The command line: writes the report, prints its path; returns the exit code (0, or 2 when it could not run). */
export function main(argv: readonly string[]): number;
