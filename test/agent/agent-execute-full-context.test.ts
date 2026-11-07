/**
 * REQ-PERF-01's full-context fixture in the parallel pass (task-357, `bug-221`): what
 * `test/agent/agent-execute-latency.test.ts` asserts besides the time, one run and no clock.
 *
 * `test/agent/agent-execute-latency.test.ts` times `wingfoil agent execute`'s steps 1–14 (`spec-016` §3.3, up to
 * the spawn) on a context of 60 relevant documents, more than `spec-012` §6's default limits admit, and, since
 * its budget presupposes an otherwise idle machine, runs only in the opt-in latency pass
 * (`test/latency-suites.cjs` `IN_PROCESS_LATENCY_SUITES`). Its load-independent clause runs here, inside
 * `npm test`'s parallel pass and `npm run test:coverage`, on the same fixture
 * (`test/agent/helpers/agent-execute-full-context-fixture.ts`): a run reaches the spawn instant, so no
 * pre-launch step — the configuration and the element at `HEAD`, the adapter, the run log, the execution
 * context filled and truncated at its defaults, the MCP pre-flight against the compiled build — refuses it.
 *
 * No timing helper is imported and no clock is read (`test/core/latency-budget-placement.test.ts` rule 6).
 */
import { removeTempDir } from '../storage/helpers/git-fixture';
import { runToSpawn, SPAWN_REACHED_MESSAGE, seedFullContext } from './helpers/agent-execute-full-context-fixture';

describe('task-228 AC 5 fixture — REQ-PERF-01: agent execute on the 60-document context reaches the spawn', () => {
  let repo: string;
  beforeAll(() => {
    repo = seedFullContext();
  }, 120000);
  afterAll(() => removeTempDir(repo));

  it('one run, as the developer, completes steps 1–14 and stops at the spawn instant', async () => {
    expect(await runToSpawn(repo)).toBe(SPAWN_REACHED_MESSAGE);
  }, 120000);
});
