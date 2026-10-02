'use strict';
/**
 * The test suites that time spawned processes and so run alone, after the parallel run
 * (task-154, `bug-013`): ignored by `jest.config.js`, selected by `jest.latency.config.js`, both of
 * which read this list. Paths are relative to the repository root.
 *
 * `test/core/latency-budget-placement.test.ts` requires this list to equal its `EXEMPTIONS` keys: a
 * suite allowed to time a spawn is exactly a suite that runs alone.
 */
module.exports = { LATENCY_SUITES: ['test/cli/command-latency.test.ts'] };
