'use strict';
/**
 * The test suites that run alone, only when asked for (task-154, `bug-013`): ignored by `jest.config.js`,
 * selected by `jest.latency.config.js`, both of which read {@link LATENCY_SUITES}, and run only when asked
 * for (`scripts/run-tests.cjs`: `npm run test:latency`, `WINGFOIL_LATENCY=1 npm test`, or a path from this
 * list as an argument). Paths are relative to the repository root.
 *
 * Two kinds, both presupposing an otherwise idle machine:
 * - suites that time **spawned processes** (`test/cli/command-latency.test.ts`): exactly the `EXEMPTIONS`
 *   of `test/core/latency-budget-placement.test.ts`, which holds them to its rules 3 and 4;
 * - suites that time an operation **in-process** on a fixture too large to measure inside the parallel run
 *   ({@link IN_PROCESS_LATENCY_SUITES}; task-216, REQ-PERF-03 on this repository's own history): they spawn
 *   nothing they time, and record the load average around the measurement (that test's rule 5).
 */
const IN_PROCESS_LATENCY_SUITES = ['test/core/workflow-next-latency.test.ts'];

module.exports = { LATENCY_SUITES: ['test/cli/command-latency.test.ts', ...IN_PROCESS_LATENCY_SUITES], IN_PROCESS_LATENCY_SUITES };
