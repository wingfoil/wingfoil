#!/usr/bin/env node
/**
 * `npm test` — the parallel jest run, plus the latency suites alone when asked for
 * (`task-154-give-latency-budgets-statistical-shape-guard-says-what`, `bug-013`).
 *
 * The latency suites (`test/latency-suites.cjs`) time spawned commands against REQ-PERF-02's
 * 1,000 ms. A spawn's wall-clock is only about the command on an otherwise idle machine: inside
 * jest's parallel run, or beside other jobs, the measured cost moves by seconds with nothing in the
 * command changed. So `jest.config.js` leaves them out, and they run, alone and in one worker
 * (`jest.latency.config.js`), only when asked for explicitly — the approver's ruling of 2026-10-03,
 * so that no publish is ever blocked by wall-clock noise:
 *
 * - no arguments: the parallel run; then, only if it passed and `WINGFOIL_LATENCY=1` is set, the
 *   latency pass. CI and `prepublishOnly` do not set it.
 * - arguments naming a latency suite (`npm test -- test/cli/command-latency.test.ts`): that
 *   invocation goes to the latency config, with the arguments unchanged.
 * - any other arguments (`npm test -- test/core/foo.test.ts`, `npm test -- --silent`): only the
 *   parallel run, with them, exactly as a bare `jest <args>` did before this script existed.
 *
 * `npm run test:latency` runs the latency pass on its own (the dev-loop gate, on an idle machine).
 *
 * Usage: node scripts/run-tests.cjs [jest args…]
 */
'use strict';

const { spawnSync } = require('node:child_process');
const { join } = require('node:path');

const { LATENCY_SUITES } = require('../test/latency-suites.cjs');

/** The jest config holding the suites that must run alone. */
const LATENCY_CONFIG = 'jest.latency.config.js';

/** The environment variable that opts `npm test` (no arguments) into the latency pass, when `1`. */
const LATENCY_ENV = 'WINGFOIL_LATENCY';

/**
 * Whether `arg` names one of the latency suites (`test/…` or `./test/…`).
 *
 * @param {string} arg
 * @returns {boolean}
 */
function namesLatencySuite(arg) {
  const path = arg.replace(/^\.\//, '');
  return LATENCY_SUITES.includes(path);
}

/**
 * The jest invocations `npm test` makes for `args` under `env`, in order: each entry is one jest argv.
 *
 * @param {readonly string[]} args
 * @param {Readonly<Record<string, string | undefined>>} env
 * @returns {string[][]}
 */
function plannedRuns(args, env) {
  if (args.some(namesLatencySuite)) return [['-c', LATENCY_CONFIG, ...args]];
  if (args.length > 0) return [[...args]];
  return env[LATENCY_ENV] === '1' ? [[], ['-c', LATENCY_CONFIG]] : [[]];
}

/* istanbul ignore next -- the CLI entry point; plannedRuns is the logic, tested directly. */
function main() {
  const repoRoot = join(__dirname, '..');
  const jestBin = require.resolve('jest/bin/jest', { paths: [repoRoot] });
  for (const argv of plannedRuns(process.argv.slice(2), process.env)) {
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

module.exports = { plannedRuns, LATENCY_CONFIG, LATENCY_ENV };
