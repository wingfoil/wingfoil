/**
 * The one statistical shape every latency budget in the suite is measured in
 * (`task-154-give-latency-budgets-statistical-shape-guard-says-what`; `bug-012`, `bug-013`).
 *
 * REQ-PERF-02 and REQ-PERF-04 (`docs/02_requirements/03_sard/02_performance-nfr.md`) state each
 * budget as **`< 1,000 ms (p95)`**, and the requirement set's measurement conditions as **p95 over
 * `>= 20` runs** on a 1,000-Memory-document reference repository. This module is where those
 * conditions live in code:
 *
 * - {@link MIN_RUNS} is the SARD's `>= 20`; {@link RUNS} is the 25 the suites take (task-008's
 *   convention, kept); {@link P95_BUDGET_MS} is the 1,000 ms threshold, unchanged.
 * - {@link p95} is the nearest-rank percentile — the `ceil(0.95 * n)`-th smallest sample. At
 *   `n = 25` that is the 24th of 25, so exactly one outlier is tolerated and a second is not.
 * - {@link sampleLatency} and {@link sampleMarginalLatency} refuse fewer than {@link MIN_RUNS} runs,
 *   so a budget cannot be checked against a single sample through this module.
 *
 * It is also the **only test source that reads the wall clock** — `test/core/latency-budget-placement.test.ts`
 * fails any other file that does. A suite that times something imports this module, which is what
 * lets that guard recognise it as a timing suite by its import rather than by the clock API it no
 * longer names.
 */
import { performance } from 'perf_hooks';

/** The SARD's minimum sample count: "p95 over >= 20 runs" (REQ-PERF measurement conditions). */
export const MIN_RUNS = 20;

/** The sample count the latency suites take — `>= MIN_RUNS`, so the p95 tolerates one outlier. */
export const RUNS = 25;

/** REQ-PERF-02's and REQ-PERF-04's threshold: `< 1,000 ms (p95)`. */
export const P95_BUDGET_MS = 1000;

/** p95 over `samples` — nearest-rank percentile: the `ceil(0.95 * n)`-th smallest value. */
export function p95(samples: readonly number[]): number {
  if (samples.length === 0) throw new Error('p95 of an empty sample set is undefined');
  const sorted = [...samples].sort((a, b) => a - b);
  const index = Math.min(sorted.length, Math.ceil(0.95 * sorted.length)) - 1;
  return sorted[Math.max(0, index)]!;
}

function requireRuns(runs: number): void {
  if (!Number.isInteger(runs) || runs < MIN_RUNS) {
    throw new Error(`a latency budget is p95 over >= ${MIN_RUNS} runs (REQ-PERF measurement conditions); got runs=${runs}`);
  }
}

/** Elapsed milliseconds of one call of `fn`, awaited. */
async function timeOnce(fn: () => unknown): Promise<number> {
  const start = performance.now();
  await fn();
  return performance.now() - start;
}

/**
 * Time `runs` sequential calls of `fn` (each awaited before the next starts) and return the elapsed
 * milliseconds of each, in call order. `fn` receives the 0-based run index.
 */
export async function sampleLatency(runs: number, fn: (run: number) => unknown): Promise<number[]> {
  requireRuns(runs);
  const samples: number[] = [];
  for (let run = 0; run < runs; run += 1) {
    samples.push(await timeOnce(() => fn(run)));
  }
  return samples;
}

/** What {@link sampleMarginalLatency} returns: the floor's samples and, per measured call, its own. */
export interface MarginalLatencySamples {
  /** Elapsed time of the floor call of each run. */
  readonly floor: readonly number[];
  /** Per measured call, in the order given: its elapsed time in each run, floor included. */
  readonly total: readonly (readonly number[])[];
  /** Per measured call: `total[c][i] - floor[i]`, its cost over the floor taken in the same run. */
  readonly marginal: readonly (readonly number[])[];
}

/**
 * Measure each of `calls`' cost **over a floor**, for calls whose elapsed time includes a fixed
 * overhead the budget is not about — a process start, for a spawned command (`bug-013`).
 *
 * Each run times `floor` and then every call in `calls`, back to back, and records each call's
 * difference from that run's floor. Taking the floor in the same run, rather than subtracting one
 * p95 from another, makes a call and its floor share whatever load the machine was under at that
 * moment, which is what lets the difference stand for the call's own cost.
 */
export async function sampleMarginalLatency(
  runs: number,
  floor: () => unknown,
  calls: readonly (() => unknown)[],
): Promise<MarginalLatencySamples> {
  requireRuns(runs);
  const floorSamples: number[] = [];
  const totalSamples: number[][] = calls.map(() => []);
  for (let run = 0; run < runs; run += 1) {
    floorSamples.push(await timeOnce(floor));
    for (const [index, call] of calls.entries()) {
      totalSamples[index]!.push(await timeOnce(call));
    }
  }
  return {
    floor: floorSamples,
    total: totalSamples,
    marginal: totalSamples.map((samples) => samples.map((total, run) => total - floorSamples[run]!)),
  };
}

/** One-line summary of a sample set for a failure message: p95, min and max, in whole ms. */
export function describeSamples(samples: readonly number[]): string {
  const sorted = [...samples].sort((a, b) => a - b);
  const ms = (value: number): string => `${Math.round(value)} ms`;
  return `p95 ${ms(p95(samples))} (n=${samples.length}, min ${ms(sorted[0]!)}, max ${ms(sorted[sorted.length - 1]!)})`;
}
