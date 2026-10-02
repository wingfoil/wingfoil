/**
 * `test/core/helpers/latency.ts` — the one shape every latency budget is measured in (task-154,
 * `bug-012`). Pins the properties the suites and the placement guard rely on: the nearest-rank p95,
 * the refusal of fewer than REQ-PERF's 20 runs, and the run-aligned shape of a marginal measurement.
 * Asserts nothing about elapsed values, so it reads no clock of its own and cannot flake on load.
 */
import { describeSamples, MIN_RUNS, P95_BUDGET_MS, p95, RUNS, sampleLatency, sampleMarginalLatency } from './helpers/latency';

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

  it('sampleMarginalLatency takes the floor first in every run, then each call, and aligns the differences by run', async () => {
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
      marginal.forEach((value, run) => expect(value).toBeCloseTo(measured.total[call]![run]! - measured.floor[run]!, 9));
    });
    await expect(sampleMarginalLatency(MIN_RUNS - 1, () => undefined, [])).rejects.toThrow(/>= 20 runs/);
  });

  it('describeSamples names p95, n, min and max in whole milliseconds', () => {
    expect(describeSamples([1.4, 2.6, 900.2])).toBe('p95 900 ms (n=3, min 1 ms, max 900 ms)');
  });
});
