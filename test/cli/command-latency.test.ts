/**
 * REQ-PERF-02's Fit Criterion **at the level it is worded at** — the commands
 * (`task-154-give-latency-budgets-statistical-shape-guard-says-what`, `bug-013`):
 *
 *   "`wingfoil memory search`, `wingfoil dna show`, and `wingfoil memory history` each return in
 *   < 1,000 ms (p95) on the reference repository."
 *   (docs/02_requirements/03_sard/02_performance-nfr.md; measurement conditions: p95 over >= 20 runs,
 *   1,000 Memory documents)
 *
 * `test/core/query-latency.test.ts` holds the same budget against the registered `CoreFn` each
 * command dispatches to, in-process. This file holds it against the **compiled, spawned command**:
 * `node test/cli/fixtures/cli-harness.cjs <dist> <root> <command>` — the real `dist/`, the real ESM
 * `commander`, the real output writer — on the same reference repository
 * (`test/core/helpers/reference-repo.ts`).
 *
 * What it measures is the command's **marginal cost over a measured process-start floor**, not the
 * spawn's wall-clock. `bug-011` was a spawn timed whole: under jest's parallel workers that number is
 * dominated by Node startup and CPU contention, and it failed on an unmodified `main`. So each run
 * spawns the floor — the same harness, the same compiled modules, `--version`, which commander
 * answers before any command runs — and then each of the three commands, back to back, and each
 * command's budget is the p95 of its per-run differences from that run's floor (`sampleMarginalLatency`, `test/core/helpers/latency.ts`). The floor's
 * own p95 is not asserted: it is the machine's, not the command's.
 *
 * This file is the one documented exemption from `test/core/latency-budget-placement.test.ts`'s
 * spawn-plus-timing rule, and the exemption records why.
 */
import { runCliHarness, type SpawnedRun } from './helpers/spawn-cli';
import { describeSamples, type MarginalLatencySamples, P95_BUDGET_MS, p95, RUNS, sampleMarginalLatency } from '../core/helpers/latency';
import { HISTORY_APPROVE_REASON, KEYWORD, seedReferenceRepo } from '../core/helpers/reference-repo';
import { removeTempDir } from '../storage/helpers/git-fixture';

// RUNS rounds of four spawns (the floor and the three commands): the slowest suite in the tree by design.
jest.setTimeout(300_000);

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

/** REQ-PERF-02's three commands, in the order each round spawns them. */
const COMMANDS = ['memory search', 'dna show', 'memory history'] as const;
type Command = (typeof COMMANDS)[number];

describe('REQ-PERF-02 — command-level p95, as marginal cost over a measured process-start floor (bug-013)', () => {
  let root: string;
  let historyTarget: string;
  let measured: MarginalLatencySamples;
  const lastStdout = new Map<Command, string>();

  beforeAll(async () => {
    let historyTargetId: string;
    ({ root, historyTarget, historyTargetId } = seedReferenceRepo());
    const argv: Record<Command, readonly string[]> = {
      'memory search': ['memory', 'search', KEYWORD, '--format', 'json'],
      'dna show': ['dna', 'show', '--format', 'json'],
      'memory history': ['memory', 'history', historyTargetId, '--format', 'json'],
    };
    measured = await sampleMarginalLatency(
      RUNS,
      () => runOk(root, FLOOR_ARGS),
      COMMANDS.map((command) => () => lastStdout.set(command, runOk(root, argv[command]).stdout)),
    );
  });

  afterAll(() => {
    // Opt-in: print the three distributions, so a run's numbers can be quoted (and the load it ran
    // under compared) without the suite failing first. Off by default — output only, no assertion.
    if (process.env.WINGFOIL_LATENCY_REPORT === '1' && measured) {
      const lines = COMMANDS.map(
        (command, index) =>
          `${command}: marginal ${describeSamples(measured.marginal[index]!)}; total ${describeSamples(measured.total[index]!)}`,
      );
      console.log([`floor (--version): ${describeSamples(measured.floor)}`, ...lines].join('\n'));
    }
    removeTempDir(root);
  });

  it('the floor is a real, successful spawn of the compiled CLI that runs no command', () => {
    expect(runOk(root, FLOOR_ARGS).stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
    expect(measured.floor).toHaveLength(RUNS);
  });

  it.each(COMMANDS.map((command, index) => ({ command, index })))(
    '`wingfoil $command` costs under 1000ms at p95 over >= 20 runs, over the process-start floor',
    ({ index }) => {
      const marginal = measured.marginal[index]!;
      expect(marginal).toHaveLength(RUNS);
      // The received object names all three distributions, so a failure says whether the command or
      // the machine moved.
      expect({
        marginalUnderBudget: p95(marginal) < P95_BUDGET_MS,
        marginal: describeSamples(marginal),
        floor: describeSamples(measured.floor),
        total: describeSamples(measured.total[index]!),
      }).toMatchObject({ marginalUnderBudget: true });
    },
  );

  // Sanity: each timed command really did its work on the reference repository — a latency sample
  // of a command that answered nothing would prove nothing.
  it('the timed commands answered from the reference repository', () => {
    expect((JSON.parse(lastStdout.get('memory search')!) as { matches: unknown[] }).matches.length).toBeGreaterThan(0);
    expect(JSON.parse(lastStdout.get('dna show')!)).toHaveProperty('modules');
    const history = JSON.parse(lastStdout.get('memory history')!) as { path: string; entries: { reason: string | null }[] };
    expect(history.path).toBe(historyTarget);
    expect(history.entries.map((entry) => entry.reason)).toContain(HISTORY_APPROVE_REASON);
  });
});
