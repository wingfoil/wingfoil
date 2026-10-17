'use strict';
/**
 * task-285 (`bug-378`) — the latency pass's configuration, `jest.latency.config.js`, run over two small fixture files
 * instead of the three latency suites, by `test/cli/latency-report-pass.test.ts`. Only what the fixture needs is
 * overridden:
 * - `rootDir`: the repository root, so `<rootDir>/tsconfig.test.json` (the ts-jest transform) resolves;
 * - `testMatch`: the two fixture files, by explicit `<rootDir>/…` path, as `LATENCY_SUITES` are selected;
 * - `globalSetup` / `globalTeardown` removed: `test/global-setup.cjs` rebuilds `dist/` under `.jest-dist.lock`, which
 *   the outer jest run already holds (bug-095), and the fixture needs no `dist/`.
 * Everything else is inherited unchanged — `maxWorkers: 1`, the transform, `testPathIgnorePatterns` and the absence
 * of `reporters` (jest then picks its own reporter, the agent one when an agent variable is set): they are the
 * condition `bug-378` occurred under.
 *
 * @type {import('jest').Config}
 */
const { resolve } = require('path');
const latency = require('../../../../jest.latency.config.js');

const config = {
  ...latency,
  rootDir: resolve(__dirname, '..', '..', '..', '..'),
  testMatch: ['<rootDir>/test/cli/fixtures/latency-report-pass/report.fixture.ts', '<rootDir>/test/cli/fixtures/latency-report-pass/sibling.fixture.ts'],
};
delete config.globalSetup;
delete config.globalTeardown;

module.exports = config;
