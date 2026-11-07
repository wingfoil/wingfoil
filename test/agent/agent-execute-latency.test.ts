/**
 * task-228 AC 5 — REQ-PERF-01 (`docs/02_requirements/03_sard/02_performance-nfr.md`): from
 * `wingfoil agent execute` invocation to "agent ready", which `spec-016` §3.3 places at step 14, the
 * spawn — steps 1–14 complete in **< 30,000 ms (p95)**.
 *
 * Measured the repository's way (`test/core/helpers/latency.ts`, task-154, `bug-012`'s class): p95 over
 * `MIN_RUNS` runs, never one sample. Each run calls `agentExecuteFn` in process, as the CLI's operation,
 * through every pre-launch step — the configuration and the element at `HEAD`, the adapter, the run
 * log, the execution context, and the MCP pre-flight against the compiled build — up to the spawn, where
 * the host's `spawn` ends the run at the instant the agent would start: the agent's own start-up is
 * outside the budget (`adr-012` Consequences).
 *
 * The fixture holds more relevant Memory than `spec-012` §6's default limits admit (`maxDocs` 40,
 * `maxBytes` 256 KiB): 60 relevant documents of about 7 KiB, so the context builder fills and truncates
 * at its defaults, the largest context the default limits assemble.
 *
 * In process, so no process of its own is timed (`test/core/latency-budget-placement.test.ts` rule 2):
 * the pre-flight's server is started by the code under test, inside the timed region, as it is for a
 * user. The fixture (the 60 documents) is `test/agent/helpers/agent-execute-full-context-fixture.ts`.
 *
 * **Placement** (task-357, `bug-221`). The SARD's measurement condition of every REQ-PERF target, REQ-PERF-01
 * included, is an otherwise idle machine, so this suite runs only in the opt-in latency pass
 * (`test/latency-suites.cjs` `IN_PROCESS_LATENCY_SUITES`; `npm run test:latency`), never inside the parallel
 * `npm test`: the budget's margin on a loaded machine was never measured. It reads the load average before and
 * after its sampling and refuses a loaded run through `inProcessIdleVerdict` rather than counting it, as
 * `test/core/workflow-next-latency.test.ts` does. What it asserts besides the time — a run on the 60-document
 * context reaches the spawn — runs in the parallel pass too, one run and no clock, in
 * `test/agent/agent-execute-full-context.test.ts`.
 */
import { cpus } from 'node:os';

import { describeLoad, describeSamples, inProcessIdleVerdict, MIN_RUNS, p95, readLoadAverage, sampleLatency, type LoadWindow } from '../core/helpers/latency';
import { removeTempDir } from '../storage/helpers/git-fixture';
import { runToSpawn, SPAWN_REACHED_MESSAGE, seedFullContext } from './helpers/agent-execute-full-context-fixture';

/** REQ-PERF-01's threshold: `< 30,000 ms (p95)`. */
const REQ_PERF_01_BUDGET_MS = 30000;

describe('task-228 AC 5 — REQ-PERF-01: steps 1–14 of agent execute in < 30,000 ms (p95)', () => {
  let repo: string;
  beforeAll(() => {
    repo = seedFullContext();
  }, 120000);
  afterAll(() => removeTempDir(repo));

  let samples: number[] = [];
  let load: LoadWindow;

  it(`samples ${String(MIN_RUNS)} runs, each to the spawn instant, reading the load before and after`, async () => {
    const outcomes: string[] = [];
    const before = readLoadAverage();
    samples = await sampleLatency(MIN_RUNS, async () => {
      outcomes.push(await runToSpawn(repo));
    });
    load = { before, after: readLoadAverage() };
    process.stdout.write(`agent execute to the spawn: ${describeSamples(samples)}; ${describeLoad(load)}\n`);
    // Every run reached the spawn: none was refused earlier, so what was timed is steps 1–14.
    expect(new Set(outcomes)).toEqual(new Set([SPAWN_REACHED_MESSAGE]));
    expect(samples).toHaveLength(MIN_RUNS);
  }, 900000);

  it('the run was taken on an otherwise idle machine (a loaded run is refused, not counted)', () => {
    expect(inProcessIdleVerdict(load, cpus().length)).toBe('otherwise idle');
  });

  it(`p95 over ${String(MIN_RUNS)} runs to the spawn instant stays under 30,000 ms, on an otherwise idle machine`, () => {
    if (inProcessIdleVerdict(load, cpus().length) !== 'otherwise idle') return; // refused above, not counted
    const report = `agent execute to the spawn: ${describeSamples(samples)}; ${describeLoad(load)}`;
    expect({ report, under: p95(samples) < REQ_PERF_01_BUDGET_MS }).toEqual({ report, under: true });
  });
});
