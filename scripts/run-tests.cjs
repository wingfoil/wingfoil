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
 * A run with no suite filter is a heavy gate (`dl-170` Decision 1, task-349): every invocation it plans — the
 * parallel run and an opted-in latency pass — runs inside one hold of the machine-wide lock of
 * `scripts/heavy-gate.cjs`, which waits while another worktree holds it or the machine is loaded. `npm run
 * test:coverage` and `npm run test:report` come through here with `--coverage`, so they hold it as the gate
 * `coverage`. A targeted run (an argument naming a suite, or a path filter: {@link isHeavyRun}) spawns jest as
 * before, without the lock.
 *
 * Usage: node scripts/run-tests.cjs [jest args…]
 */
'use strict';

const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');

const { LATENCY_SUITES } = require('../test/latency-suites.cjs');
const { gateDir, withHeavyGate } = require('./heavy-gate.cjs');

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

/** The jest options that select suites by path: a run given one is targeted. */
const PATH_FILTER_OPTION = /^--(testPathPatterns?|findRelatedTests)(=|$)/;

/** A non-option argument that names a suite or a source file. */
const SUITE_ARGUMENT = /^(\.\/)?(test|src)\//;

/**
 * Whether `args` make `npm test` a heavy gate (`dl-170` Decision 1): `false` for a targeted run — an argument
 * naming a suite (`test/…`, `./test/…`, `src/…`, `./src/…`, or ending in `.test.ts`), or a path filter
 * (`--testPathPattern`, `--testPathPatterns`, `--findRelatedTests`) — `true` otherwise, the empty list included.
 * Erring towards heavy only costs a wait.
 *
 * @param {readonly string[]} args
 * @returns {boolean}
 */
function isHeavyRun(args) {
  return !args.some((arg) =>
    arg.startsWith('-') ? PATH_FILTER_OPTION.test(arg) : SUITE_ARGUMENT.test(arg) || arg.endsWith('.test.ts'),
  );
}

/**
 * The gate name of a heavy run: `coverage` when `--coverage` is among `args`, else `test`.
 *
 * @param {readonly string[]} args
 * @returns {string}
 */
function gateName(args) {
  return args.includes('--coverage') ? 'coverage' : 'test';
}

/**
 * Run {@link plannedRuns} for `args`: a heavy run inside one hold of `gate`, a targeted run without one. Resolves
 * to the first non-zero exit status, or 0; a run that ended on a signal (`spawn` returned `null`) counts as 1, and a
 * failing run stops the ones after it.
 *
 * @param {{
 *   args: readonly string[],
 *   env: Readonly<Record<string, string | undefined>>,
 *   spawn: (argv: readonly string[], env: Record<string, string | undefined>) => number | null,
 *   gate: (options: { gate: string, env: Readonly<Record<string, string | undefined>> },
 *          run: (childEnv: Record<string, string | undefined>) => number | Promise<number>) => Promise<number>,
 * }} options
 * @returns {Promise<number>}
 */
async function runTests({ args, env, spawn, gate }) {
  const runs = plannedRuns(args, env);
  const runAll = (childEnv) => {
    for (const argv of runs) {
      const status = spawn(argv, childEnv);
      if (status === null) return 1;
      if (status !== 0) return status;
    }
    return 0;
  };
  if (!isHeavyRun(args)) return runAll({ ...env });
  return gate({ gate: gateName(args), env }, runAll);
}

/* istanbul ignore next -- the CLI entry point; runTests is the logic, tested directly with a fake spawn and gate. */
async function main() {
  const repoRoot = resolve(__dirname, '..');
  const jestBin = require.resolve('jest/bin/jest', { paths: [repoRoot] });
  const spawn = (argv, env) => {
    const run = spawnSync(process.execPath, [jestBin, ...argv], { cwd: repoRoot, stdio: 'inherit', env });
    if (run.error) throw run.error;
    if (run.status === null) {
      process.stderr.write(`run-tests: jest ${argv.join(' ')} ended on signal ${run.signal}, not an exit\n`);
    }
    return run.status;
  };
  const gate = (options, run) =>
    withHeavyGate({ dir: gateDir(options.env), gate: options.gate, worktree: repoRoot, env: options.env }, run);
  return runTests({ args: process.argv.slice(2), env: process.env, spawn, gate });
}

/* istanbul ignore next -- the CLI entry point. */
if (require.main === module) {
  main().then(
    (status) => process.exit(status),
    (err) => {
      process.stderr.write(`run-tests: ${err && err.message ? err.message : String(err)}\n`);
      process.exit(1);
    },
  );
}

module.exports = { plannedRuns, isHeavyRun, gateName, runTests, LATENCY_CONFIG, LATENCY_ENV };
