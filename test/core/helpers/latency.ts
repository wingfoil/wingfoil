/**
 * The one statistical shape every latency budget in the suite is measured in
 * (`task-154-give-latency-budgets-statistical-shape-guard-says-what`; `bug-012`, `bug-013`).
 *
 * REQ-PERF-02 and REQ-PERF-04 (`docs/02_requirements/03_sard/02_performance-nfr.md`) state each
 * budget as **`< 1,000 ms (p95)`**, and the requirement set's measurement conditions as **p95 over
 * `>= 20` runs** on a 1,000-Memory-document reference repository, on an otherwise idle machine. This
 * module is where those conditions live in code:
 *
 * - {@link MIN_RUNS} is the SARD's `>= 20`; {@link RUNS} is the 25 the suites take (task-008's
 *   convention, kept); {@link P95_BUDGET_MS} is the 1,000 ms threshold, unchanged.
 * - {@link p95} is the nearest-rank percentile — the `ceil(0.95 * n)`-th smallest sample. At
 *   `n = 25` that is the 24th of 25, so exactly one outlier is tolerated and a second is not. The
 *   percentile method is this module's choice (task-008's, kept): the REQ does not specify one.
 * - {@link sampleLatency} and {@link sampleMarginalLatency} refuse fewer than {@link MIN_RUNS} runs,
 *   so a budget cannot be checked against a single sample through this module.
 * - {@link PROCESS_LEVEL_QUANTITIES} and {@link processLevelVerdict} are REQ-PERF-02's two budgets for
 *   a spawned command, the total and the marginal over process start (`dl-146` (C)).
 * - {@link readLoadAverage}, {@link idleMachineVerdict} and {@link latencyReport} are the "otherwise
 *   idle machine" condition, recorded and checked rather than presumed (`bug-276`, task-263): the
 *   load average read around a measurement, and a run whose process-start floor is loaded refused.
 *
 * It is also the **only test source that reads the wall clock** — `test/core/latency-budget-placement.test.ts`
 * fails any other file that does. A suite that times something imports this module, which is what
 * lets that guard recognise it as a timing suite by its import rather than by the clock API it no
 * longer names.
 */
import { loadavg } from 'os';
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

/** The median of `samples`: the middle value, or the mean of the two middle values. */
export function median(samples: readonly number[]): number {
  if (samples.length === 0) throw new Error('median of an empty sample set is undefined');
  const sorted = [...samples].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
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
  /** Per measured call: `total[c][i] - median(floor)`, its cost over the central floor value. */
  readonly marginal: readonly (readonly number[])[];
}

/**
 * Measure each of `calls`' cost **over a floor**, for calls whose elapsed time includes a fixed
 * overhead the budget is not about — a process start, for a spawned command (`bug-013`).
 *
 * Each run times `floor` and then every call in `calls`, back to back, so the floor is sampled as
 * many times as the calls and across the same stretch of time. Each call's marginal cost in a run is
 * its total minus the **median** of all the floor samples. An earlier version subtracted the floor
 * of the same run; review showed that pairing does not cancel load jitter — a floor and the call
 * after it can land on opposite sides of a scheduling spike, so a reviewer's run at load 5→42 got a
 * marginal p95 of 2,050 ms and a marginal minimum of −1,067 ms. A central floor value is not moved by
 * one slow floor sample, so the remaining spread is the calls' own.
 *
 * It does not make the measurement load-proof: a budget measured this way presupposes an otherwise
 * idle machine, which is why the suites that use it run only when asked for (`scripts/run-tests.cjs`).
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
  const centralFloor = median(floorSamples);
  return {
    floor: floorSamples,
    total: totalSamples,
    marginal: totalSamples.map((samples) => samples.map((total) => total - centralFloor)),
  };
}

/**
 * The two quantities REQ-PERF-02 budgets for a spawned command (`dl-146` (C); task-248): the
 * **total**, invocation to return with process start included (what the user waits for), and the
 * **marginal** cost over the median process-start floor (what WingFoil's own query work costs). Each
 * is held to {@link P95_BUDGET_MS} at p95, on an otherwise idle machine. A suite that times a spawned
 * command judges every quantity in this list through {@link processLevelVerdict};
 * `test/core/latency-budget-placement.test.ts` (rule 3) fails one that drops either.
 */
export const PROCESS_LEVEL_QUANTITIES = ['total', 'marginal'] as const;

/** One of {@link PROCESS_LEVEL_QUANTITIES}: a field of {@link MarginalLatencySamples}. */
export type ProcessLevelQuantity = (typeof PROCESS_LEVEL_QUANTITIES)[number];

/**
 * Judge call `call` of `measured` on one `quantity`: `'within budget'` when that quantity's p95 is
 * under {@link P95_BUDGET_MS}, otherwise `'over budget: …'` naming the quantity first and then the
 * floor, total and marginal distributions, so a red says whether the command or the machine moved.
 * Pure: it reads only the samples it is given.
 */
export function processLevelVerdict(measured: MarginalLatencySamples, call: number, quantity: ProcessLevelQuantity): string {
  const total = measured.total[call];
  const marginal = measured.marginal[call];
  if (total === undefined || marginal === undefined) {
    throw new Error(`the measurement has no call ${call} (it has ${measured.total.length})`);
  }
  const samples = quantity === 'total' ? total : marginal;
  if (p95(samples) < P95_BUDGET_MS) return 'within budget';
  const distributions: Record<'floor' | ProcessLevelQuantity, readonly number[]> = { floor: measured.floor, total, marginal };
  const others = (['floor', ...PROCESS_LEVEL_QUANTITIES] as const).filter((name) => name !== quantity);
  return `over budget: ${[quantity, ...others].map((name) => `${name} ${describeSamples(distributions[name])}`).join('; ')}`;
}

/** One-line summary of a sample set for a failure message: p95, min and max, in whole ms. */
export function describeSamples(samples: readonly number[]): string {
  const sorted = [...samples].sort((a, b) => a - b);
  const ms = (value: number): string => `${Math.round(value)} ms`;
  return `p95 ${ms(p95(samples))} (n=${samples.length}, min ${ms(sorted[0]!)}, max ${ms(sorted[sorted.length - 1]!)})`;
}

/** The machine's 1- and 5-minute load averages at one moment, rounded to hundredths (`os.loadavg()`). */
export interface LoadAverage {
  readonly oneMinute: number;
  readonly fiveMinute: number;
}

/** The load averages read immediately before and immediately after one measurement. */
export interface LoadWindow {
  readonly before: LoadAverage;
  readonly after: LoadAverage;
}

/**
 * Read the 1- and 5-minute load averages through `read` (default `os.loadavg`, whose third figure,
 * the 15-minute one, is not used), rounded to hundredths. On a platform without load averages
 * (Windows) `os.loadavg()` answers zeros, so the figures are then no evidence.
 */
export function readLoadAverage(read: () => readonly number[] = loadavg): LoadAverage {
  const [oneMinute = 0, fiveMinute = 0] = read();
  const hundredths = (value: number): number => Math.round(value * 100) / 100;
  return { oneMinute: hundredths(oneMinute), fiveMinute: hundredths(fiveMinute) };
}

/** One-line statement of a load window: `load average (1-min / 5-min): before a / b, after c / d`. */
export function describeLoad(load: LoadWindow): string {
  const pair = (value: LoadAverage): string => `${value.oneMinute.toFixed(2)} / ${value.fiveMinute.toFixed(2)}`;
  return `load average (1-min / 5-min): before ${pair(load.before)}, after ${pair(load.after)}`;
}

/**
 * The bound on the process-start floor's p95 under which a run counts as taken on an otherwise idle
 * machine (`bug-276`). The floor (the compiled CLI answering `--version`) measures the same spawn path
 * as the commands, under the same conditions, so it is the deciding signal: idle it measured 194 and
 * 203 ms (task-248 run 3, task-154), loaded 826 and 886 ms (task-248 runs 1 and 2). The load average is
 * recorded, not judged: it lags, it scales with the core count and background, and it did not separate
 * the two (task-154's idle run at a load of 3.75, task-248's loaded run 2 at a 5-minute 4.13). The
 * bound is relative to this repository's reference machine; it is not a REQ-PERF budget.
 */
export const IDLE_FLOOR_P95_BOUND_MS = 500;

/**
 * Judge whether a measurement was taken on an otherwise idle machine, REQ-PERF-02's measurement
 * condition: `'otherwise idle'` when the floor's p95 is under {@link IDLE_FLOOR_P95_BOUND_MS},
 * otherwise `'loaded: …'` naming the floor distribution and the load window, so the refusal is its own
 * evidence. Pure: it reads only what it is given.
 */
export function idleMachineVerdict(floor: readonly number[], load: LoadWindow): string {
  if (p95(floor) < IDLE_FLOOR_P95_BOUND_MS) return 'otherwise idle';
  return (
    `loaded: floor ${describeSamples(floor)} >= ${IDLE_FLOOR_P95_BOUND_MS} ms; ${describeLoad(load)}; ` +
    'not a REQ-PERF-02 measurement (an otherwise idle machine): rerun when the floor is idle'
  );
}

/**
 * The latency pass's report (`WINGFOIL_LATENCY_REPORT=1`): the load window, the idle verdict, the
 * floor, and per command (named in `commands`, in the order of `measured`'s calls) its marginal and
 * total distributions. The commands are sampled interleaved, round by round, so one window covers
 * every command's sampling.
 */
export function latencyReport(measured: MarginalLatencySamples, commands: readonly string[], load: LoadWindow): string {
  if (commands.length !== measured.total.length) {
    throw new Error(`the measurement has ${measured.total.length} calls but ${commands.length} command names`);
  }
  return [
    `${describeLoad(load)} (one window: the commands are sampled interleaved)`,
    `machine: ${idleMachineVerdict(measured.floor, load)}`,
    `floor (--version): ${describeSamples(measured.floor)}`,
    ...commands.map(
      (command, index) =>
        `${command}: marginal ${describeSamples(measured.marginal[index]!)}; total ${describeSamples(measured.total[index]!)}`,
    ),
  ].join('\n');
}
