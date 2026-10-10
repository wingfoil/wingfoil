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
 * user. The budget is thirty times REQ-PERF-02's, so it holds on a loaded machine too.
 */
import { join } from 'node:path';

import type { AgentExecuteHost } from '../../src/agent';
import { agentExecuteFn } from '../../src/core/agent-execute';
import { withNoticeSink, withWarningSink } from '../../src/validation/warning';
import { describeSamples, MIN_RUNS, p95, sampleLatency } from '../core/helpers/latency';
import { removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { REPO_ROOT, seed, TASK_REF } from './helpers/agent-execute-fixture';

/** REQ-PERF-01's threshold: `< 30,000 ms (p95)`. */
const REQ_PERF_01_BUDGET_MS = 30000;

/** What the host's `spawn` throws: the run reached step 14. */
const SPAWN_REACHED = 'the spawn instant (REQ-PERF-01 "agent ready")';

const HOST: AgentExecuteHost = {
  mcpServer: { command: process.execPath, args: [join(REPO_ROOT, 'dist', 'cli.js'), 'mcp'] },
  isTerminal: () => false,
  spawn: () => {
    throw new Error(SPAWN_REACHED);
  },
};

/** A relevant, non-draft task of about 7 KiB: it shares the subject's tag (`spec-012` §6 T4). */
function relevantDoc(index: number): string {
  const id = `task-${String(500 + index)}-load`;
  const paragraph = `Paragraph ${String(index)} of the load fixture, deterministic text for the context builder. `.repeat(8);
  const body = Array.from({ length: 9 }, () => paragraph).join('\n\n');
  return ['---', `id: ${id}`, 'type: task', `title: "${id}"`, 'release: "v0.1"', 'status: backlog', 'tags: [ context ]', '---', '', '## Description', '', body, ''].join('\n');
}

describe('task-228 AC 5 — REQ-PERF-01: steps 1–14 of agent execute in < 30,000 ms (p95)', () => {
  let repo: string;
  beforeAll(() => {
    repo = seed((root) => {
      for (let index = 0; index < 60; index += 1) {
        writeFixtureFile(root, `docs/04_memory/v0.1/task-${String(500 + index)}-load.md`, relevantDoc(index));
      }
    });
  }, 120000);
  afterAll(() => removeTempDir(repo));

  it(`p95 over ${String(MIN_RUNS)} runs, each to the spawn instant`, async () => {
    const outcomes: string[] = [];
    const samples = await sampleLatency(MIN_RUNS, async () => {
      const result = await withNoticeSink(
        () => undefined,
        () => withWarningSink(() => undefined, () => agentExecuteFn({ root: repo, options: { element: TASK_REF, role: 'developer' }, host: HOST })),
      );
      outcomes.push(result.ok ? 'ok' : result.error.message);
    });
    // Every run reached the spawn: none was refused earlier, so what was timed is steps 1–14.
    expect(new Set(outcomes)).toEqual(new Set([`agent command 'node' could not be started (adapter 'fake'): ${SPAWN_REACHED}`]));
    expect({ p95: p95(samples) < REQ_PERF_01_BUDGET_MS, samples: describeSamples(samples) }).toEqual({ p95: true, samples: describeSamples(samples) });
  }, 900000);
});
