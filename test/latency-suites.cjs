'use strict';
/**
 * The test suites that time spawned processes (task-154, `bug-013`): ignored by `jest.config.js`,
 * selected by `jest.latency.config.js`, both of which read this list, and run alone only when asked
 * for (`scripts/run-tests.cjs`: `npm run test:latency`, `WINGFOIL_LATENCY=1 npm test`, or a path from
 * this list as an argument). Paths are relative to the repository root.
 *
 * `test/core/latency-budget-placement.test.ts` requires this list to equal its `EXEMPTIONS` keys: a
 * suite allowed to time a spawn is exactly a suite that runs alone, only when asked for.
 */
module.exports = { LATENCY_SUITES: ['test/cli/command-latency.test.ts'] };
