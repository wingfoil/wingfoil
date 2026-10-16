/**
 * task-285 (`bug-378`) — stands in for `test/cli/command-latency.test.ts` in the two-file pass of
 * `test/cli/latency-report-pass.test.ts`: it reports synthetic samples through the suite's own call,
 * `reportLatency(measured, COMMANDS, load)` in `afterAll`. Nothing is spawned and nothing is timed. Not collected by
 * `jest.config.js` (`**\/*.test.ts`); selected only by this directory's `jest.config.cjs`.
 */
import { RUNS, reportLatency, type LoadWindow, type MarginalLatencySamples } from '../../../core/helpers/latency';

const flat = (value: number): number[] => Array.from({ length: RUNS }, () => value);
const COMMANDS = ['memory search', 'dna show', 'memory history'] as const;
const LOAD: LoadWindow = { before: { oneMinute: 1.5, fiveMinute: 2 }, after: { oneMinute: 1.75, fiveMinute: 2.1 } };
const FLOOR = 200;
const TOTALS = [300, 250, 420];
const MEASURED: MarginalLatencySamples = {
  floor: flat(FLOOR),
  total: TOTALS.map(flat),
  marginal: TOTALS.map((total) => flat(total - FLOOR)),
};

describe('latency report fixture (task-285): the REQ-PERF-02 suite\'s report path', () => {
  afterAll(() => {
    reportLatency(MEASURED, COMMANDS, LOAD);
  });

  it('runs one trivial case, so the file passes', () => {
    expect(COMMANDS).toHaveLength(3);
  });
});
