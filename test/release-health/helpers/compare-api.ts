/**
 * task-241 — the contract the red tests hold `scripts/release-health/compare.cjs` to (`dl-089` §3–§5), and the
 * shared readers of the compare suites.
 *
 * The module is loaded with `require` inside each test rather than imported, so a missing or incomplete
 * `compare.cjs` fails each test on an assertion naming what is missing, not the whole suite on a compile error.
 * The interface below is the one the task's design notes declare (`### design (developer, 2026-10-13)`, "API"):
 * it is the tests' own view of the module, independent of `compare.d.cts`.
 *
 * Deterministic: fixtures are read from `test/release-health/fixtures/compare/`; no clock, no network.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { load as yamlLoad } from 'js-yaml';

import type { MetricEntry, Report } from '../../../scripts/release-health/measure.cjs';

export const REPO_ROOT = join(__dirname, '..', '..', '..');
export const COMPARE_SCRIPT = join(REPO_ROOT, 'scripts', 'release-health', 'compare.cjs');
export const FIXTURES = join(REPO_ROOT, 'test', 'release-health', 'fixtures', 'compare');

/** The trend verdicts of `dl-089` §3, plus `info` and `pending` (a metric with no rule yet). */
export type Verdict = 'improved' | 'stable' | 'regressed' | 'new' | 'not-comparable' | 'info' | 'pending';

/** One catalogue metric, as `docs/08_health/metrics.yaml` declares it. */
export interface MetricDef {
  readonly id: string;
  readonly name: string;
  readonly kind: 'floor' | 'trend' | 'info';
  readonly direction?: string;
  readonly status?: string;
  readonly retired_in?: string;
  readonly tolerance?: string;
  readonly immediate_bug?: boolean;
  readonly [key: string]: unknown;
}

/** The catalogue (`metrics.yaml`). */
export interface Catalogue {
  readonly version: number;
  readonly defaults: { readonly tolerance: { readonly share: string; readonly relative: string }; readonly small_sample: number };
  readonly changes: readonly { readonly version: number; readonly source: string; readonly added?: readonly string[]; readonly redefined?: readonly string[] }[];
  readonly metrics: readonly MetricDef[];
}

/** One row of a comparison: the metric, its two values, the trend verdict, the floor verdict and the flags. */
export interface Row {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly previous: unknown;
  readonly value: unknown;
  readonly raw: unknown;
  readonly verdict: Verdict | null;
  readonly floor: 'held' | 'breached' | null;
  readonly flags: readonly string[];
}

/** What `compareReports` resolves to; `rows` holds one row per catalogue metric, in catalogue order. */
export interface Comparison {
  readonly rows: readonly Row[];
  readonly [key: string]: unknown;
}

/** One match of `wingfoil memory search --format json`. */
export interface SearchMatch {
  readonly id: string;
  readonly type: string;
  readonly status: string;
  readonly path?: string;
  readonly title?: string;
}

/** The parsed output of `wingfoil memory search <keyword> --format json`. */
export interface SearchResult {
  readonly query: string;
  readonly matches: readonly SearchMatch[];
}

/** A proposal read back from a report's Markdown. */
export interface ParsedProposal {
  readonly id: string;
  readonly metric: string;
  readonly [key: string]: unknown;
}

/** How one previous proposal was settled (`dl-089` §4). */
export interface Settled {
  readonly id: string;
  readonly settled: 'adopted and effective' | 'adopted, no effect yet' | 'not adopted' | 'superseded';
  readonly [key: string]: unknown;
}

export interface CompareInput {
  readonly catalogue: Catalogue;
  readonly current: Report;
  readonly previous: Report | null;
  readonly history: readonly Report[];
  readonly remeasure?: (previous: Report) => Promise<Report>;
}

/** The module's exports the tests rely on. */
export interface CompareApi {
  classifyMetric(def: MetricDef, current: MetricEntry | undefined, previous: MetricEntry | null | undefined, defaults: Catalogue['defaults']): Pick<Row, 'verdict' | 'floor' | 'flags'>;
  evaluateFloor(id: string, entry: MetricEntry): 'held' | 'breached' | null;
  compareReports(input: CompareInput): Promise<Comparison>;
  propose(comparison: Comparison, options: { search: (keyword: string) => SearchResult | Promise<SearchResult>; memoryYaml: unknown }): Comparison | Promise<Comparison>;
  parseProposals(markdown: string): readonly ParsedProposal[];
  settle(previousProposals: readonly ParsedProposal[], retroText: string | null, comparison: Comparison): readonly Settled[];
  renderReport(comparison: Comparison): string;
  readonly FLOORS: Readonly<Record<string, unknown>>;
  readonly COMPONENTS: Readonly<Record<string, unknown>>;
  readonly RUN_TIME_READINGS: readonly string[];
}

let cached: CompareApi | null = null;

/** `compare.cjs`'s exports; fails the calling test, on an assertion, when the module cannot be loaded. */
export function loadCompare(): CompareApi {
  if (cached !== null) return cached;
  let loaded: unknown = null;
  let error: string | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    loaded = require(COMPARE_SCRIPT);
  } catch (caught) {
    error = (caught instanceof Error ? caught.message : String(caught)).split('\n')[0] ?? 'unknown error';
  }
  expect(error).toBeNull();
  cached = loaded as CompareApi;
  return cached;
}

/** The live catalogue at `paths.health`. */
export function liveCatalogue(): Catalogue {
  return yamlLoad(readFileSync(join(REPO_ROOT, 'docs', '08_health', 'metrics.yaml'), 'utf-8')) as Catalogue;
}

/** A fresh, mutable copy of a fixture report, `release-health-<version>.json`. */
export function fixtureReport(version: string): Report {
  return JSON.parse(readFileSync(join(FIXTURES, `release-health-${version}.json`), 'utf-8')) as Report;
}

/** `report` with the entry of `id` replaced by `{ id, ...entry }`. */
export function withEntry(report: Report, id: string, entry: Omit<MetricEntry, 'id'>): Report {
  return { ...report, metrics: report.metrics.map((m) => (m.id === id ? { id, ...entry } : m)) };
}

/** The row of `id` in a comparison. */
export function rowOf(comparison: Comparison, id: string): Row {
  const row = comparison.rows.find((r) => r.id === id);
  expect(row).toBeDefined();
  return row!;
}

/** The body of the `## <heading>` section of a report, up to the next `## ` heading. */
export function section(markdown: string, heading: string): string {
  const start = markdown.indexOf(`\n## ${heading}\n`);
  expect(start).toBeGreaterThanOrEqual(0);
  const rest = markdown.slice(start + heading.length + 5);
  const end = rest.search(/^## /m);
  return end === -1 ? rest : rest.slice(0, end);
}
