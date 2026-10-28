'use strict';
/**
 * Jest `globalSetup` — compile `dist/` exactly once, before any worker starts.
 *
 * The CLI integration suites (`test/cli/program.integration.test.ts`,
 * `test/cli/npm-distribution.test.ts`) spawn the compiled `node dist/cli.js` out-of-process. They
 * used to each `rmSync(dist)` + `tsc`-rebuild the SAME `dist/` in their own `beforeAll`; because jest
 * runs test files in parallel workers, one suite could delete/rebuild `dist/` while the other was
 * spawning `node dist/cli.js`, producing an intermittent failure that passed on re-run
 * (bug-003-cli-integration-dist-race). Building here, once, before the worker pool exists removes the
 * race entirely — and does one build per run instead of two.
 *
 * The same race between two jest RUNS in one worktree (bug-095) is closed by the lock in
 * `test/dist-lock.cjs`: the build happens only once this run holds `.jest-dist.lock`, which it keeps
 * until `test/global-teardown.cjs`. A second run waits for it, or refuses naming the holder; it never
 * deletes the `dist/` another run is using.
 *
 * The build never leaves the worktree without a `dist/` (bug-336, task-308): `prepareDist` hands it a
 * staging directory, and swaps the finished build onto `dist/` by rename. So the setup composes the two
 * steps of `package.json`'s `build` script (`tsc -p tsconfig.build.json && node
 * scripts/write-build-info.cjs`) itself, with the staging directory as their output:
 * `test/lint/dist-lock.test.ts` pins that script, so a change to it fails there instead of drifting
 * from this file.
 *
 * Deterministic by construction: a fresh output directory, `tsc`, then the build record (which carries
 * no timestamp), no wall-clock or ordering dependence in what is built.
 */
const { execFileSync } = require('node:child_process');
const { writeFileSync } = require('node:fs');
const { join } = require('node:path');

const { computeBuildInfo, serializeBuildInfo } = require('../scripts/write-build-info.cjs');
const { prepareDist } = require('./dist-lock.cjs');

// Tag this run's fixture directories (bug-064, task-152). Set here, in jest's main process before
// any worker is forked, so every worker inherits the same value; `test/storage/helpers/git-fixture.ts`
// puts it in its `mkdtemp` prefix and `test/global-teardown.cjs` counts what carries it at the end.
process.env.WF_FIXTURE_RUN_TAG = `r${process.pid}`;

module.exports = async () => {
  const repoRoot = join(__dirname, '..');
  await prepareDist({
    repoRoot,
    // `npm run build` into `outDir`: `tsc`, then the build record `dist/build-info.json` (task-192,
    // `dl-111` Q2 (a)), which the compiled CLI stamps on `--version` and on every commit it writes. The
    // record is computed before anything is written, as `scripts/write-build-info.cjs` does.
    build: (outDir) => {
      const info = computeBuildInfo(repoRoot);
      execFileSync(
        process.execPath,
        [require.resolve('typescript/bin/tsc'), '-p', 'tsconfig.build.json', '--outDir', outDir],
        { cwd: repoRoot, stdio: 'pipe' },
      );
      writeFileSync(join(outDir, 'build-info.json'), serializeBuildInfo(info), 'utf-8');
    },
  });
};
