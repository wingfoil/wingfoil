/**
 * The latency suites, run alone and only when asked for (task-154, `bug-013`): `npm run test:latency`,
 * or `WINGFOIL_LATENCY=1 npm test` as a second pass (`scripts/run-tests.cjs`). Never run by CI or
 * `prepublishOnly`, by the approver's ruling of 2026-10-03: their budgets presuppose an idle machine. Same transform, setup and teardown as `jest.config.js`; only the selection
 * and the worker count differ: exactly the files `jest.config.js` leaves out of the parallel run, in
 * one worker, so nothing else in the suite competes with what they time. The list itself is
 * `test/latency-suites.cjs`.
 *
 * Run it on its own with `npm run test:latency`.
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
