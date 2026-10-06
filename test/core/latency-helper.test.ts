/**
 * `test/core/helpers/latency.ts` — the one shape every latency budget is measured in (task-154,
 * `bug-012`). Pins the properties the suites and the placement guard rely on: the nearest-rank p95,
 * the refusal of fewer than REQ-PERF's 20 runs, and the run-aligned shape of a marginal measurement.
 * Asserts nothing about elapsed values, so it reads no clock of its own and cannot flake on load.
 */
import {
  describeSamples,
  type MarginalLatencySamples,
  median,
  MIN_RUNS,
  P95_BUDGET_MS,
  p95,
  PROCESS_LEVEL_QUANTITIES,
  processLevelVerdict,
  RUNS,
  sampleLatency,
  sampleMarginalLatency,
} from './helpers/latency';

/** A synthetic one-call measurement: `floor`, `total` and `marginal` each `MIN_RUNS` copies of one value. */
function measuredAt(floor: number, total: number, marginal: number): MarginalLatencySamples {
  const copies = (value: number): number[] => Array.from({ length: MIN_RUNS }, () => value);
  return { floor: copies(floor), total: [copies(total)], marginal: [copies(marginal)] };
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
