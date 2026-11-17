'use strict';
/**
 * The test suites that run alone, only when asked for (task-154, `bug-013`): ignored by `jest.config.js`,
 * selected by `jest.latency.config.js`, both of which read {@link LATENCY_SUITES}, and run only when asked
 * for (`scripts/run-tests.cjs`: `npm run test:latency`, `WINGFOIL_LATENCY=1 npm test`, or a path from this
 * list as an argument). Paths are relative to the repository root.
 *
 * Two kinds, both presupposing an otherwise idle machine (the SARD's measurement condition of every REQ-PERF target):
 * - suites that time **spawned processes** (`test/cli/command-latency.test.ts`, REQ-PERF-02; and
 *   `test/cli/workflow-next-command-latency.test.ts`, REQ-PERF-03's spawned total, task-283): exactly the `EXEMPTIONS`
 *   of `test/core/latency-budget-placement.test.ts`, which holds them to its rules 3 and 4;
 * - suites that time an operation **in-process** ({@link IN_PROCESS_LATENCY_SUITES}): REQ-PERF-03 on this
 *   repository's own history (task-216), and REQ-PERF-02, REQ-PERF-04 and REQ-PERF-01 on their reference
 *   fixtures (task-357, `bug-221`: a budget run inside the parallel pass competes with jest's own workers). They
 *   spawn nothing they time, record the load average around the measurement and refuse a loaded run (that
 *   test's rule 5). What each of them asserts besides the time runs in the parallel pass, in a suite of its own
 *   (`test/core/query-reference-repo.test.ts`, `test/mcp/resource-reference-repo.test.ts`,
 *   `test/agent/agent-execute-full-context.test.ts`), so `npm run test:coverage` still counts the code they reach.
 *
 * So no suite of the parallel pass asserts a wall-clock budget (that test's rule 6).
 */
const IN_PROCESS_LATENCY_SUITES = [
  'test/agent/agent-execute-latency.test.ts',
  'test/core/query-latency.test.ts',
  'test/core/workflow-next-latency.test.ts',
  'test/mcp/resource-latency.test.ts',
];

module.exports = {
  LATENCY_SUITES: ['test/cli/command-latency.test.ts', 'test/cli/workflow-next-command-latency.test.ts', ...IN_PROCESS_LATENCY_SUITES],
  IN_PROCESS_LATENCY_SUITES,
};
