/**
 * REQ-PERF-02's three commands, timed as the **compiled, spawned command**
 * (`task-154-give-latency-budgets-statistical-shape-guard-says-what`, `bug-013`;
 * `task-248-assert-req-perf-02-s-total-and-marginal-budgets-on-an-idle-machine`, `dl-146` (C)). The
 * requirement (docs/02_requirements/03_sard/02_performance-nfr.md; measurement conditions: p95 over
 * >= 20 runs, 1,000 Memory documents, an otherwise idle machine) budgets two quantities of each of
 * `wingfoil memory search`, `wingfoil dna show` and `wingfoil memory history`, each < 1,000 ms (p95):
 *
 * - the **total**, from invocation to return, process start-up included — what the user waits for;
 * - the **marginal** cost over process start — what WingFoil's own query work costs, which the total
 *   hides behind start-up.
 *
 * This file asserts both, for each command, through `processLevelVerdict` over
 * `PROCESS_LEVEL_QUANTITIES` (`test/core/helpers/latency.ts`); `test/core/latency-budget-placement.test.ts`
 * (rule 3) fails it if it stops judging either.
 *
 * `test/core/query-latency.test.ts` holds the 1,000 ms against the registered `CoreFn` each command
 * dispatches to, in-process. This file spawns `node test/cli/fixtures/cli-harness.cjs <dist> <root>
 * <command>` — the real `dist/`, the real ESM `commander`, the real output writer — on the same
 * reference repository (`test/core/helpers/reference-repo.ts`). Each run spawns the floor (the same
 * harness and compiled modules answering `--version`, which commander does before any command runs)
 * and then each of the three commands; each command's total is its spawn timed whole, and its
 * marginal cost in a run is that total minus the **median** floor (`sampleMarginalLatency`,
 * `test/core/helpers/latency.ts`). `bug-011` was a spawn timed whole *inside jest's parallel run*,
 * where load, not the command, decided the number: which is why the total is asserted only here, on
 * an idle machine, and never alone.
 *
 * **Both budgets presuppose an otherwise idle machine**, as the SARD's measurement conditions now
 * say. No floor subtraction makes a spawn's wall-clock immune to load: inside jest's parallel run, or
 * beside other jobs, the marginal p95 has crossed 1,000 ms with nothing in the commands changed, and
 * the total has crossed it at a 1-minute load average of about 18 (`dl-146`'s measurements). So this
 * file runs only when asked for: it is listed in `test/latency-suites.cjs`, which `jest.config.js` ignores and `jest.latency.config.js`
 * selects (one worker), and it runs through `npm run test:latency`, `WINGFOIL_LATENCY=1 npm test`, or
 * `npm test -- test/cli/command-latency.test.ts` — never from CI or `prepublishOnly`
 * (`scripts/run-tests.cjs`). `WINGFOIL_LATENCY_REPORT=1` prints the three distributions measured.
 *
 * This file is the one documented exemption from `test/core/latency-budget-placement.test.ts`'s
 * spawn-plus-timing rule, and the exemption records why.
 */
import { runCliHarness, type SpawnedRun } from './helpers/spawn-cli';
import {
  describeSamples,
  type MarginalLatencySamples,
  PROCESS_LEVEL_QUANTITIES,
  processLevelVerdict,
  RUNS,
  sampleMarginalLatency,
} from '../core/helpers/latency';
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

describe('REQ-PERF-02 — command-level p95 of the total and of the marginal cost over a measured process-start floor (bug-013, dl-146)', () => {
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

  it.each(COMMANDS.flatMap((command, index) => PROCESS_LEVEL_QUANTITIES.map((quantity) => ({ command, index, quantity }))))(
    '`wingfoil $command`: $quantity p95 over >= 20 runs is under 1000ms',
    ({ index, quantity }) => {
      expect(measured.total[index]).toHaveLength(RUNS);
      expect(measured.marginal[index]).toHaveLength(RUNS);
      // On failure the received string names the floor, total and marginal distributions, so a red
      // says whether the command or the machine moved.
      expect(processLevelVerdict(measured, index, quantity)).toBe('within budget');
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
