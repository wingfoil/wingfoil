/**
 * `test/core/helpers/latency.ts` — the one shape every latency budget is measured in (task-154,
 * `bug-012`). Pins the properties the suites and the placement guard rely on: the nearest-rank p95,
 * the refusal of fewer than REQ-PERF's 20 runs, and the run-aligned shape of a marginal measurement.
 * Asserts nothing about elapsed values, so it reads no clock of its own and cannot flake on load.
 */
import {
  describeLoad,
  describeSamples,
  IDLE_FLOOR_P95_BOUND_MS,
  idleMachineVerdict,
  latencyReport,
  type LoadWindow,
  type MarginalLatencySamples,
  median,
  MIN_RUNS,
  P95_BUDGET_MS,
  p95,
  PROCESS_LEVEL_QUANTITIES,
  processLevelVerdict,
  readLoadAverage,
  RUNS,
  sampleLatency,
  sampleMarginalLatency,
} from './helpers/latency';

/** A synthetic one-call measurement: `floor`, `total` and `marginal` each `MIN_RUNS` copies of one value. */
function measuredAt(floor: number, total: number, marginal: number): MarginalLatencySamples {
  const copies = (value: number): number[] => Array.from({ length: MIN_RUNS }, () => value);
  return { floor: copies(floor), total: [copies(total)], marginal: [copies(marginal)] };
}

/** A synthetic measurement window: the 1- and 5-minute load averages read before and after it. */
function windowOf(before: [number, number], after: [number, number]): LoadWindow {
  return {
    before: { oneMinute: before[0], fiveMinute: before[1] },
    after: { oneMinute: after[0], fiveMinute: after[1] },
  };
}

describe('latency helper — REQ-PERF measurement conditions in code', () => {
  it('declares the SARD conditions: >= 20 runs, 25 taken, 1,000 ms budget', () => {
    expect(MIN_RUNS).toBe(20);
    expect(RUNS).toBeGreaterThanOrEqual(MIN_RUNS);
    expect(P95_BUDGET_MS).toBe(1000);
  });

  it('p95 is nearest-rank: the ceil(0.95 n)-th smallest, so at n = 25 exactly one outlier is tolerated', () => {
    const samples = Array.from({ length: 25 }, (_, i) => 25 - i); // 25..1, unsorted on purpose
    expect(p95(samples)).toBe(24);
    expect(p95([...Array.from({ length: 24 }, () => 10), 5000])).toBe(10);
    expect(p95([...Array.from({ length: 23 }, () => 10), 5000, 5000])).toBe(5000);
    expect(p95([7])).toBe(7);
  });

  it('p95 of no samples is an error, not a number', () => {
    expect(() => p95([])).toThrow(/empty/);
  });

  it('sampleLatency refuses fewer than MIN_RUNS runs — a budget cannot be checked on one sample', async () => {
    await expect(sampleLatency(1, () => undefined)).rejects.toThrow(/>= 20 runs/);
    await expect(sampleLatency(MIN_RUNS - 1, () => undefined)).rejects.toThrow(/runs=19/);
    await expect(sampleLatency(20.5, () => undefined)).rejects.toThrow(/>= 20 runs/);
  });

  it('sampleLatency runs fn once per run, in order, awaiting each, and returns one sample per run', async () => {
    const seen: number[] = [];
    const samples = await sampleLatency(MIN_RUNS, async (run) => {
      seen.push(run);
      await Promise.resolve();
    });
    expect(seen).toEqual(Array.from({ length: MIN_RUNS }, (_, i) => i));
    expect(samples).toHaveLength(MIN_RUNS);
    samples.forEach((sample) => expect(sample).toBeGreaterThanOrEqual(0));
  });

  it('median is the middle sample, or the mean of the two middle ones', () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(() => median([])).toThrow(/empty/);
  });

  it('sampleMarginalLatency takes the floor first in every run, then each call, and subtracts the MEDIAN floor from every total', async () => {
    const order: string[] = [];
    const measured = await sampleMarginalLatency(
      MIN_RUNS,
      () => order.push('floor'),
      [() => order.push('a'), () => order.push('b')],
    );
    expect(order.slice(0, 6)).toEqual(['floor', 'a', 'b', 'floor', 'a', 'b']);
    expect(order).toHaveLength(MIN_RUNS * 3);
    expect(measured.floor).toHaveLength(MIN_RUNS);
    expect(measured.total).toHaveLength(2);
    measured.marginal.forEach((marginal, call) => {
      expect(marginal).toHaveLength(MIN_RUNS);
      marginal.forEach((value, run) => expect(value).toBeCloseTo(measured.total[call]![run]! - median(measured.floor), 9));
    });
    await expect(sampleMarginalLatency(MIN_RUNS - 1, () => undefined, [])).rejects.toThrow(/>= 20 runs/);
  });

  it('a spawned command is budgeted on two quantities, the total and the marginal (dl-146 (C), REQ-PERF-02)', () => {
    expect(PROCESS_LEVEL_QUANTITIES).toEqual(['total', 'marginal']);
  });

  it('processLevelVerdict judges the quantity it is given, each against 1,000 ms at p95, and neither through the other', () => {
    // Total over, marginal under: the total verdict fails and the marginal one passes …
    const totalOver = measuredAt(900, P95_BUDGET_MS + 100, 200);
    expect(processLevelVerdict(totalOver, 0, 'total')).toMatch(/^over budget: total p95 1100 ms/);
    expect(processLevelVerdict(totalOver, 0, 'marginal')).toBe('within budget');
    // … and the other way round (synthetic: a real marginal never exceeds its total).
    const marginalOver = measuredAt(0, 300, P95_BUDGET_MS);
    expect(processLevelVerdict(marginalOver, 0, 'marginal')).toMatch(/^over budget: marginal p95 1000 ms/);
    expect(processLevelVerdict(marginalOver, 0, 'total')).toBe('within budget');
    // The budget is strict (`< 1,000 ms`): 999 passes.
    expect(processLevelVerdict(measuredAt(0, 999, 999), 0, 'total')).toBe('within budget');
  });

  it('an over-budget verdict names all three distributions, so a red says whether the command or the machine moved', () => {
    const verdict = processLevelVerdict(measuredAt(950, 1200, 250), 0, 'total');
    expect(verdict).toContain('floor p95 950 ms');
    expect(verdict).toContain('total p95 1200 ms');
    expect(verdict).toContain('marginal p95 250 ms');
    expect(() => processLevelVerdict(measuredAt(1, 2, 1), 1, 'total')).toThrow(/no call 1/);
  });

  it('describeSamples names p95, n, min and max in whole milliseconds', () => {
    expect(describeSamples([1.4, 2.6, 900.2])).toBe('p95 900 ms (n=3, min 1 ms, max 900 ms)');
  });
});

describe('latency helper — the otherwise-idle machine REQ-PERF-02 presupposes, recorded and checked (bug-276)', () => {
  it('readLoadAverage takes the 1- and 5-minute figures of os.loadavg(), rounded to hundredths', () => {
    expect(readLoadAverage(() => [1.364, 2.9449, 7.5])).toEqual({ oneMinute: 1.36, fiveMinute: 2.94 });
    // The default reader is the machine's own: two finite, non-negative numbers.
    const real = readLoadAverage();
    for (const value of [real.oneMinute, real.fiveMinute]) {
      expect(Number.isFinite(value) && value >= 0).toBe(true);
    }
  });

  it('describeLoad states the window: 1- and 5-minute load average, before and after', () => {
    expect(describeLoad(windowOf([1.36, 2.94], [1.77, 2.9]))).toBe(
      'load average (1-min / 5-min): before 1.36 / 2.94, after 1.77 / 2.90',
    );
  });

  it('the idle signal is the floor p95, bounded at 500 ms (idle floor about 200 ms, loaded 826-886 ms in task-248)', () => {
    expect(IDLE_FLOOR_P95_BOUND_MS).toBe(500);
  });

  it('idleMachineVerdict calls a run otherwise idle when the floor p95 is under the bound, whatever the load average', () => {
    const floor = (value: number): number[] => Array.from({ length: MIN_RUNS }, () => value);
    expect(idleMachineVerdict(floor(194), windowOf([1.36, 2.94], [1.77, 2.9]))).toBe('otherwise idle');
    // A high load average alone does not refuse the run: the floor is the deciding signal …
    expect(idleMachineVerdict(floor(203), windowOf([12, 9], [12, 9]))).toBe('otherwise idle');
    // … and the bound is strict: 499 passes, 500 does not.
    expect(idleMachineVerdict(floor(IDLE_FLOOR_P95_BOUND_MS - 1), windowOf([0, 0], [0, 0]))).toBe('otherwise idle');
    expect(idleMachineVerdict(floor(IDLE_FLOOR_P95_BOUND_MS), windowOf([0, 0], [0, 0]))).toMatch(/^loaded:/);
  });

  it('a loaded verdict names the floor and the load window, so the refusal is evidence (task-248 run 2: 1-min dip, floor 886)', () => {
    const run2 = [...Array.from({ length: MIN_RUNS - 1 }, () => 200), 886, 886];
    const verdict = idleMachineVerdict(run2, windowOf([1.94, 4.13], [4.61, 4.3]));
    expect(verdict).toMatch(/^loaded: floor p95 886 ms/);
    expect(verdict).toContain('>= 500 ms');
    expect(verdict).toContain('before 1.94 / 4.13, after 4.61 / 4.30');
    expect(verdict).toContain('not a REQ-PERF-02 measurement');
    expect(() => idleMachineVerdict([], windowOf([0, 0], [0, 0]))).toThrow(/empty/);
  });

  it('latencyReport records the load window and the idle verdict beside the floor, total and marginal of every command', () => {
    const measured: MarginalLatencySamples = {
      floor: Array.from({ length: MIN_RUNS }, () => 200),
      total: [Array.from({ length: MIN_RUNS }, () => 260), Array.from({ length: MIN_RUNS }, () => 210)],
      marginal: [Array.from({ length: MIN_RUNS }, () => 60), Array.from({ length: MIN_RUNS }, () => 10)],
    };
    const report = latencyReport(measured, ['memory search', 'dna show'], windowOf([1.36, 2.94], [1.77, 2.9]));
    expect(report.split('\n')).toEqual([
      'load average (1-min / 5-min): before 1.36 / 2.94, after 1.77 / 2.90 (one window: the commands are sampled interleaved)',
      'machine: otherwise idle',
      'floor (--version): p95 200 ms (n=20, min 200 ms, max 200 ms)',
      'memory search: marginal p95 60 ms (n=20, min 60 ms, max 60 ms); total p95 260 ms (n=20, min 260 ms, max 260 ms)',
      'dna show: marginal p95 10 ms (n=20, min 10 ms, max 10 ms); total p95 210 ms (n=20, min 210 ms, max 210 ms)',
    ]);
    expect(() => latencyReport(measured, ['memory search'], windowOf([0, 0], [0, 0]))).toThrow(/2 calls.*1 command/);
  });
});
