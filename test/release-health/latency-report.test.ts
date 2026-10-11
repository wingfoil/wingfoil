/**
 * task-232 — Q12 reads the latency pass's own report (`WINGFOIL_LATENCY_REPORT=1`), so the reader in
 * `scripts/release-health/measure.cjs` (`parseLatencyReport`) is pinned here to the producer, `latencyReport` of
 * `test/core/helpers/latency.ts`: a change of that format fails this file instead of turning Q12 into
 * `not-measurable` on the next release-health run. Synthetic samples only: nothing is spawned and nothing is timed.
 */
import { latencyReport, type LoadWindow, type MarginalLatencySamples } from '../core/helpers/latency';
import { parseLatencyReport } from '../../scripts/release-health/measure.cjs';

const RUNS = 25;
const flat = (value: number): number[] => Array.from({ length: RUNS }, () => value);
const COMMANDS = ['memory search', 'dna show', 'memory history'];
const LOAD: LoadWindow = { before: { oneMinute: 1.5, fiveMinute: 2 }, after: { oneMinute: 1.75, fiveMinute: 2.1 } };

function samples(floor: number, totals: readonly number[]): MarginalLatencySamples {
  return { floor: flat(floor), total: totals.map(flat), marginal: totals.map((t) => flat(t - floor)) };
}

describe('parseLatencyReport reads what latencyReport prints (task-232, Q12)', () => {
  it('an idle run: the verdict, the load window, the floor and each command\'s two p95', () => {
    const text = `  console.log\n${latencyReport(samples(200, [300, 250, 420]), COMMANDS, LOAD).replace(/^/gm, '    ')}\n`;
    expect(parseLatencyReport(text)).toEqual({
      machine: 'otherwise idle',
      idle: true,
      load: { before: 1.5, after: 1.75 },
      floorP95: 200,
      commands: [
        { command: 'memory search', marginalP95: 100, totalP95: 300 },
        { command: 'dna show', marginalP95: 50, totalP95: 250 },
        { command: 'memory history', marginalP95: 220, totalP95: 420 },
      ],
    });
  });

  it('a loaded run: the verdict is the suite\'s own refusal, kept whole', () => {
    const reading = parseLatencyReport(latencyReport(samples(900, [1300, 1000, 1100]), COMMANDS, LOAD));
    expect(reading).toMatchObject({ idle: false, floorP95: 900 });
    expect(reading!.machine).toMatch(/^loaded: floor p95 900 ms/);
  });

  it('reads the load from the report\'s own window, not from another suite\'s line printed before it', () => {
    const other = 'workflow next: p95 40 ms (n=25, min 30 ms, max 41 ms); load average (1-min / 5-min): before 7.04 / 6.00, after 9.62 / 7.00\n';
    expect(parseLatencyReport(`${other}${latencyReport(samples(200, [300, 250, 420]), COMMANDS, LOAD)}`)).toMatchObject({ load: { before: 1.5, after: 1.75 } });
  });

  it('an output with no report is null', () => {
    expect(parseLatencyReport('PASS test/cli/command-latency.test.ts\n')).toBeNull();
  });
});
