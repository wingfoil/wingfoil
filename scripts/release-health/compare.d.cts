/**
 * Types of `scripts/release-health/compare.cjs` (task-241), for the TypeScript tests. The runtime is the `.cjs`.
 */
import type { MetricEntry, Report } from './measure.cjs';

export type Verdict = 'improved' | 'stable' | 'regressed' | 'new' | 'not-comparable' | 'info' | 'pending';
export type FloorVerdict = 'held' | 'breached';

/** One catalogue metric (`docs/08_health/metrics.yaml`). */
export interface MetricDef {
  readonly id: string;
  readonly name: string;
  readonly kind: 'floor' | 'trend' | 'info';
  readonly direction?: string;
  readonly status?: string;
  readonly tolerance?: string;
  readonly immediate_bug?: boolean;
  readonly [key: string]: unknown;
}

export interface Catalogue {
  readonly version: number;
  readonly defaults: { readonly tolerance?: { readonly share?: string; readonly relative?: string }; readonly small_sample?: number };
  readonly changes?: readonly { readonly version: number; readonly added?: readonly string[]; readonly redefined?: readonly string[] }[];
  readonly metrics: readonly MetricDef[];
}

export interface Row {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly previous: unknown;
  readonly value: unknown;
  readonly raw: unknown;
  readonly failing: readonly string[];
  readonly previous_floor: FloorVerdict | null;
  readonly verdict: Verdict | null;
  readonly floor: FloorVerdict | null;
  readonly flags: readonly string[];
}

export interface Finding {
  readonly id: string;
  readonly name: string;
  readonly type: 'floor' | 'trend';
  readonly immediate: boolean;
}

export interface Proposal {
  readonly id: string;
  readonly metric: string;
  readonly name: string;
  readonly finding: string;
  readonly evidence: string;
  readonly element: 'bug' | 'decision-log';
  readonly target: string;
  readonly immediate: boolean;
}

export interface Settled {
  readonly id: string;
  readonly metric: string;
  /** `pending` when the previous release is a patch, which runs no retrospective (`bug-443`). */
  readonly settled: 'adopted and effective' | 'adopted, no effect yet' | 'not adopted' | 'superseded' | 'pending';
  readonly outcome: string | null;
  readonly element: string | null;
  readonly note?: string;
}

export interface Comparison {
  readonly release: Report['release'];
  readonly measurement_point: Report['measurement_point'];
  readonly previous: Report['previous'];
  readonly catalogue: { readonly version: number; readonly note: string };
  readonly toolchain: Report['toolchain'];
  readonly rows: readonly Row[];
  readonly findings: readonly Finding[];
  readonly tracked: null | readonly { readonly id: string; readonly immediate: boolean; readonly elements: readonly { id: string; type: string; status: string }[] }[];
  readonly proposals: null | readonly Proposal[];
  readonly previous_proposals: null | readonly Settled[];
  readonly [key: string]: unknown;
}

export interface SearchResult {
  readonly query: string;
  readonly matches: readonly { readonly id: string; readonly type: string; readonly status: string }[];
}

export function classifyMetric(def: MetricDef, current: MetricEntry | undefined, previous: MetricEntry | null | undefined, defaults: Catalogue['defaults']): { verdict: Verdict | null; floor: FloorVerdict | null; flags: string[] };
export function evaluateFloor(id: string, entry: MetricEntry | null | undefined): FloorVerdict | null;
export function compareReports(input: { catalogue: Catalogue; current: Report; previous: Report | null; history?: readonly Report[]; remeasure?: (previous: Report) => Promise<Report> }): Promise<Comparison>;
export function propose(comparison: Comparison, options: { search: (id: string) => SearchResult | Promise<SearchResult>; memoryYaml: unknown }): Promise<Comparison>;
export function parseProposals(markdown: string): { id: string; metric: string; element: string | null }[];
export function settle(previousProposals: readonly { id: string; metric: string }[], retroText: string | null, comparison: Comparison, previousKind?: 'major' | 'minor' | 'patch'): Settled[];
export function renderReport(comparison: Comparison): string;
export function compareRelease(root: string, options: { release: string; report?: string; out?: string; catalogue?: string; search?: (id: string) => SearchResult | Promise<SearchResult>; remeasure?: false | ((previous: Report) => Promise<Report>); offline?: boolean; toolchain?: boolean; anyNode?: boolean; maxWorkers?: number }): Promise<{ path: string; comparison: Comparison }>;
export function main(argv: readonly string[]): Promise<number>;
export const FLOORS: Readonly<Record<string, (value: unknown) => boolean | null>>;
export const COMPONENTS: Readonly<Record<string, readonly { readonly path: string; readonly unit: 'share' | 'relative' | 'boolean'; readonly direction: 'up' | 'down' }[]>>;
export const RUN_TIME_READINGS: readonly string[];
