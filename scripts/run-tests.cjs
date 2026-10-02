#!/usr/bin/env node
/**
 * `npm test` — the parallel jest run, then the latency suites alone
 * (`task-154-give-latency-budgets-statistical-shape-guard-says-what`, `bug-013`).
 *
 * REQ-PERF-02's command-level budget (`test/cli/command-latency.test.ts`) times spawned commands. A
 * spawn's wall-clock is only about the command when the machine is not saturated by the suite that
 * is measuring it: inside the parallel run, jest's own workers spawn and compute alongside it, and
 * the measured marginal cost went over 1,000 ms at p95 with nothing in the command having changed
 * (the floor itself ranged 664–2,180 ms in that run). So those suites are left out of the parallel
 * run (`jest.config.js` `testPathIgnorePatterns`) and run here, on their own, in one worker
 * (`jest.latency.config.js`) — the reference conditions the requirement's numbers presuppose.
 *
 * With no arguments both passes run, the second only if the first passed. With arguments
 * (`npm test -- test/core/foo.test.ts`, `npm test -- -t name`) only the parallel run runs, with
 * them, exactly as a bare `jest <args>` did before this script existed; run the latency pass on its
 * own with `npx jest -c jest.latency.config.js`.
 *
 * Usage: node scripts/run-tests.cjs [jest args…]
 */
'use strict';

const { spawnSync } = require('node:child_process');
const { join } = require('node:path');

/** The jest config holding the suites that must run alone. */
const LATENCY_CONFIG = 'jest.latency.config.js';

/**
 * The jest invocations `npm test` makes for `args`, in order: each entry is one jest argv.
 *
 * @param {readonly string[]} args
 * @returns {string[][]}
 */
function plannedRuns(args) {
  if (args.length > 0) return [[...args]];
  return [[], ['-c', LATENCY_CONFIG]];
}

/* istanbul ignore next -- the CLI entry point; plannedRuns is the logic, tested directly. */
function main() {
  const repoRoot = join(__dirname, '..');
  const jestBin = require.resolve('jest/bin/jest', { paths: [repoRoot] });
  for (const argv of plannedRuns(process.argv.slice(2))) {
    const run = spawnSync(process.execPath, [jestBin, ...argv], { cwd: repoRoot, stdio: 'inherit' });
    if (run.error) throw run.error;
    if (run.status === null) {
      process.stderr.write(`run-tests: jest ${argv.join(' ')} ended on signal ${run.signal}, not an exit\n`);
      process.exit(1);
    }
    if (run.status !== 0) process.exit(run.status);
  }
}

if (require.main === module) main();

module.exports = { plannedRuns, LATENCY_CONFIG };
