#!/usr/bin/env node
/**
 * Out-of-process spawn harness for `test/cli/program.integration.test.ts` (see that file's header
 * comment for the full rationale). The point of spawning is to run the CLI the way a user does:
 * this harness requires the COMPILED `dist/cli/program.js` (built once by jest's `globalSetup` via
 * `npx tsc -p tsconfig.build.json`, CommonJS output that loads the **real ESM `commander`** through
 * the dynamic `import()` the published CLI ships with) and drives it exactly the way the real
 * `bin/wingfoil` entrypoint would, so its real exit code / stdout / stderr can be observed from the
 * test.
 *
 * It originally existed because `buildProgram` could not be imported from a Jest test file at all
 * (`commander` v15 is ESM-only and the CommonJS Jest runtime could not load it — `bug-007`). That
 * barrier is gone since task-065-fix-commander-esm-jest-harness, and `test/cli/program.test.ts` now
 * drives `buildProgram` in-process; this harness is still the only path that exercises the compiled
 * artifact and the untranspiled ESM dependency, so it stays.
 *
 * Usage: node cli-harness.cjs <distDir> <fixtureRoot> <cli-args...>
 *   distDir     - absolute path to the compiled `dist/` directory
 *   fixtureRoot - absolute path handed to the CLI as its `resolveRoot()` result (a directory
 *                 containing a `.wingfoil/` config, e.g. test/cli/fixtures/wingfoil-root)
 *   cli-args... - argv the CLI receives after `wingfoil` itself (e.g. `dna show --format json`)
 */
'use strict';

const path = require('path');

function main() {
  const [, , distDir, fixtureRoot, ...cliArgs] = process.argv;
  if (!distDir || !fixtureRoot) {
    process.stderr.write('usage: node cli-harness.cjs <distDir> <fixtureRoot> <cli-args...>\n');
    process.exit(2);
    return;
  }

  const { buildProgram } = require(path.join(distDir, 'cli', 'program.js'));
  const { CORE_MODULES } = require(path.join(distDir, 'core', 'index.js'));
  const { buildCoreParams } = require(path.join(distDir, 'core', 'registry.js'));

  return buildProgram(CORE_MODULES, {
    resolveRoot: () => fixtureRoot,
    // The real `src/cli.ts` production wiring, not a hand copy of it (task-367): `buildCoreParams`, the one params
    // builder both surfaces pass, so the harness cannot drift from `cli.ts` (a hand copy once missed
    // `options: ctx.options`, task-021).
    buildParams: buildCoreParams,
  }).then((program) => program.parseAsync(['node', 'wingfoil', ...cliArgs]));
}

Promise.resolve()
  .then(main)
  .catch((error) => {
    // The compiled `exitWith` deferred its exit until queued output drains (task-249, `bug-222`): the
    // process ends with the chosen code by itself, exactly as `src/cli.ts` lets it — and, as there, only
    // when a code has really been chosen (`process.exitCode` is set).
    if (error && error.name === 'DeferredExit' && process.exitCode !== undefined) return;
    process.stderr.write(`cli-harness: unexpected error: ${error && error.stack ? error.stack : error}\n`);
    process.exit(1);
  });
