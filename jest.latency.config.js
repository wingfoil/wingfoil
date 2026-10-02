/**
 * The latency suites that must run alone — the second pass of `npm test` (`scripts/run-tests.cjs`,
 * task-154, `bug-013`). Same transform, setup and teardown as `jest.config.js`; only the selection
 * and the worker count differ: exactly the files `jest.config.js` leaves out of the parallel run, in
 * one worker, so nothing else in the suite competes with what they time. The list itself is
 * `test/latency-suites.cjs`.
 *
 * Run it on its own with `npx jest -c jest.latency.config.js`.
 * `test/core/latency-budget-placement.test.ts` checks that every suite exempted from its no-timed-spawn
 * rule is selected here and ignored there.
 *
 * @type {import('jest').Config}
 */
const base = require('./jest.config.js');
const { LATENCY_SUITES } = require('./test/latency-suites.cjs');

module.exports = {
  ...base,
  testMatch: LATENCY_SUITES.map((path) => `<rootDir>/${path}`),
  testPathIgnorePatterns: ['/node_modules/'],
  maxWorkers: 1,
};
