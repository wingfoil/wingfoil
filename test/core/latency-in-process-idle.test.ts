/**
 * task-216 review fix 6 — the idle condition of an in-process opt-in latency suite (`inProcessIdleVerdict`,
 * `test/core/helpers/latency.ts`): such a suite has no process-start floor to judge, so the load window
 * decides. A run whose 1-minute load average reaches half the machine's cores, before or after, is refused as
 * loaded (the reviewer's REQ-PERF-03 run at 6.8 on 12 cores); synthetic inputs only.
 */
import { inProcessIdleVerdict } from './helpers/latency';

const window = (before: number, after: number) => ({ before: { oneMinute: before, fiveMinute: before }, after: { oneMinute: after, fiveMinute: after } });

describe('inProcessIdleVerdict — the load window against half the cores', () => {
  it('under half the cores before and after: otherwise idle', () => {
    expect(inProcessIdleVerdict(window(1.7, 2.1), 12)).toBe('otherwise idle');
  });

  it('half the cores or more, before or after: loaded, with the window and the bound in the verdict', () => {
    expect(inProcessIdleVerdict(window(6.8, 2), 12)).toBe(
      'loaded: load average (1-min / 5-min): before 6.80 / 6.80, after 2.00 / 2.00; the 1-minute load reaches 6 (half of 12 cores): ' +
        'not a REQ-PERF measurement (an otherwise idle machine): rerun when the machine is idle',
    );
    expect(inProcessIdleVerdict(window(1, 6), 12)).toMatch(/^loaded: /);
  });
});
