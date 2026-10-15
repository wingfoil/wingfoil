/**
 * task-283 AC 2 (characterization, approver ruling D2 of 2026-10-15; `bug-309`, `dl-146` Q3) — REQ-PERF-03
 * (`docs/02_requirements/03_sard/02_performance-nfr.md`, `< 1,000 ms (p95)`) for `wingfoil workflow next` as
 * the **compiled, spawned command**: its total (invocation to return, process start included) and its marginal
 * cost over the process-start floor, each judged against 1,000 ms at p95, beside the in-process timing of
 * `test/core/workflow-next-latency.test.ts`.
 *
 * **Fixture.** The in-process suite's: a clone of this repository detached at `PINNED` (`b56e8721`,
 * `test/core/helpers/workflow-next-fixture.ts`), made in `beforeAll`, outside the timed region.
 *
 * **Measurement.** As `test/cli/command-latency.test.ts` does for REQ-PERF-02: each of {@link RUNS} rounds spawns
 * the floor (`node test/cli/fixtures/cli-harness.cjs <dist> <clone> --version`, answered before any command runs)
 * and then `workflow next`; the marginal is each total minus the median floor (`sampleMarginalLatency`). The load
 * average is read before and after.
 *
 * **Verdicts.** The run counts only on an otherwise idle machine, checked twice: the floor's p95 under the idle
 * bound (`idleMachineVerdict`, `test/core/latency-budget-placement.test.ts` rule 4) and the load window under half
 * the cores (`inProcessIdleVerdict`, the AC's verdict). Both process-level quantities are judged through
 * `processLevelVerdict` over `PROCESS_LEVEL_QUANTITIES` (rule 3). The 800 ms margin of the design (approver ruling
 * D1) is recorded in the task's Execution Notes, not asserted: the budget asserted here is REQ-PERF-03's, not
 * raised and not narrowed.
 *
 * **One report line.** It prints one line beginning `workflow next (spawned): `. It does **not** print a
 * `latencyReport`: release-health's `parseLatencyReport` (`scripts/release-health/measure.cjs`) reads the first
 * `machine:` line, the first `floor (--version):` line and the `(one window:` header of REQ-PERF-02's report, so a
 * second report would corrupt that measurement.
 *
 * **Placement.** Listed in `test/latency-suites.cjs` `LATENCY_SUITES` (a spawning suite) and in `EXEMPTIONS` of
 * `test/core/latency-budget-placement.test.ts`: it runs alone, only in the opt-in latency pass
 * (`npm run test:latency`), never inside the parallel `npm test`. It needs the full history (`fetch-depth: 0`).
 */
import { cpus } from 'os';

import { runCliHarness, type SpawnedRun } from './helpers/spawn-cli';
import {
  describeLoad,
  describeSamples,
  idleMachineVerdict,
  inProcessIdleVerdict,
  type LoadWindow,
  type MarginalLatencySamples,
  PROCESS_LEVEL_QUANTITIES,
  processLevelVerdict,
  readLoadAverage,
  RUNS,
  sampleMarginalLatency,
} from '../core/helpers/latency';
import { clonePinnedRepository, PINNED } from '../core/helpers/workflow-next-fixture';
import { removeTempDir } from '../storage/helpers/git-fixture';

// RUNS rounds of two spawns (the floor and workflow next) on this repository's history.
jest.setTimeout(600_000);

/** Spawn `args` through the harness and require a clean exit — a failed command is not a latency sample. */
function runOk(root: string, args: readonly string[]): SpawnedRun {
  const run = runCliHarness(root, args);
  if (run.status !== 0) {
    throw new Error(`wingfoil ${args.join(' ')} exited ${run.status}: ${run.stderr}`);
  }
  return run;
}

/** The floor: the same harness and compiled modules, answering `--version` before any command runs. */
const FLOOR_ARGS = ['--version'] as const;

/** The timed command, as a user types it. */
const NEXT_ARGS = ['workflow', 'next'] as const;

describe('REQ-PERF-03 — workflow next as the spawned command, total and marginal p95 on this repository at a pinned commit (task-283, dl-146 Q3)', () => {
  let clone: string;
  let measured: MarginalLatencySamples;
  let load: LoadWindow;

  beforeAll(async () => {
    clone = clonePinnedRepository();
    const before = readLoadAverage();
    measured = await sampleMarginalLatency(RUNS, () => runOk(clone, FLOOR_ARGS), [() => runOk(clone, NEXT_ARGS)]);
    load = { before, after: readLoadAverage() };
    process.stdout.write(
      `workflow next (spawned): total ${describeSamples(measured.total[0]!)}; marginal ${describeSamples(measured.marginal[0]!)}; ` +
        `floor ${describeSamples(measured.floor)}; ${describeLoad(load)}\n`,
    );
  });

  afterAll(() => removeTempDir(clone));

  it('the spawned workflow next exits 0 and answers from the pinned commit, with a next step', () => {
    const answer = JSON.parse(runOk(clone, [...NEXT_ARGS, '--format', 'json']).stdout) as { baseline: { commit: string }; instance: unknown; next: unknown };
    expect(answer.baseline.commit.startsWith(PINNED)).toBe(true);
    expect(answer.instance).not.toBeNull();
    expect(answer.next).not.toBeNull();
    expect(measured.floor).toHaveLength(RUNS);
  });

  it('the run was taken on an otherwise idle machine: the floor p95 is under the idle bound (rule 4)', () => {
    expect(idleMachineVerdict(measured.floor, load)).toBe('otherwise idle');
  });

  it('the run was taken on an otherwise idle machine: the 1-minute load stays under half the cores (task-216)', () => {
    expect(inProcessIdleVerdict(load, cpus().length)).toBe('otherwise idle');
  });

  it.each(PROCESS_LEVEL_QUANTITIES.map((quantity) => ({ quantity })))('`wingfoil workflow next`: $quantity p95 over >= 20 runs is under 1000ms', ({ quantity }) => {
    expect(measured.total[0]).toHaveLength(RUNS);
    expect(measured.marginal[0]).toHaveLength(RUNS);
    // On failure the received string names the floor, total and marginal distributions.
    expect(processLevelVerdict(measured, 0, quantity)).toBe('within budget');
  });
});
