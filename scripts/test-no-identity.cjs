#!/usr/bin/env node
/**
 * `npm run test:no-identity` — the full suite with no git identity, as the CI `gate` job runs it
 * (task-219; `dl-099`; the v0.2.2 carry-over, `bug-172`). Every local run has the developer's identity,
 * and v0.2.2 reached its tag with five tests that failed only without one
 * (`release-publishing-rel-v0.2.2-plan` S3). `release-submit.yaml`'s `pre-release-checks` declares this
 * run as `tests.no-identity`, so it runs on the release candidate before the tag.
 *
 * The environment is the caller's, except:
 * - `GIT_CONFIG_GLOBAL` names the null device and `GIT_CONFIG_NOSYSTEM=1`: no global or system config, so
 *   no `user.name` / `user.email` from either (`GIT_CONFIG_GLOBAL` also replaces `$XDG_CONFIG_HOME/git/config`);
 * - `HOME` is a fresh, empty throwaway directory, removed after the run;
 * - the variables git reads an identity from are dropped: {@link IDENTITY_VARIABLES}.
 * So `git config user.email` exits 1 inside it, even at this repository's root, whose local config holds
 * no identity. A test that needs one sets it in its own fixture repository, as the CI runner requires.
 *
 * It runs `scripts/run-tests.cjs` — what `npm test` runs — with the caller's arguments, from the
 * repository root, and exits with its status.
 *
 * Usage: npm run test:no-identity [-- jest args…]
 */
'use strict';

const { spawnSync } = require('node:child_process');
const { mkdtempSync, rmSync } = require('node:fs');
const { devNull, tmpdir } = require('node:os');
const { join } = require('node:path');

/** The environment variables git takes an author or committer identity from. */
const IDENTITY_VARIABLES = Object.freeze(['GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL', 'EMAIL']);

/**
 * `base` with no git identity: global and system config pointed away, `HOME` set to `home`, and
 * {@link IDENTITY_VARIABLES} removed. Pure.
 *
 * @param {Readonly<Record<string, string | undefined>>} base
 * @param {string} home
 * @returns {Record<string, string | undefined>}
 */
function noIdentityEnv(base, home) {
  const env = { ...base };
  for (const name of IDENTITY_VARIABLES) delete env[name];
  env.GIT_CONFIG_GLOBAL = devNull;
  env.GIT_CONFIG_NOSYSTEM = '1';
  env.HOME = home;
  return env;
}

/**
 * Run the suite (`scripts/run-tests.cjs args…`) in the no-identity environment, inside a throwaway empty
 * `HOME` removed afterwards. Returns the exit status; a run that ended on a signal is 1.
 *
 * @param {readonly string[]} args
 * @param {{ env?: Readonly<Record<string, string | undefined>>,
 *           spawn?: (command: string, argv: readonly string[], options: { cwd: string, env: Record<string, string | undefined> }) => number | null }} [options]
 * @returns {number}
 */
function runNoIdentity(args, options = {}) {
  const repoRoot = join(__dirname, '..');
  const spawn =
    options.spawn ??
    /* istanbul ignore next -- the real spawn; the tests inject one */
    ((command, argv, spawnOptions) => spawnSync(command, argv, { ...spawnOptions, stdio: 'inherit' }).status);
  const home = mkdtempSync(join(tmpdir(), 'wingfoil-no-identity-home-'));
  try {
    const status = spawn(process.execPath, [join(repoRoot, 'scripts', 'run-tests.cjs'), ...args], {
      cwd: repoRoot,
      env: noIdentityEnv(options.env ?? process.env, home),
    });
    return status ?? 1;
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

/* istanbul ignore next -- the CLI entry point; runNoIdentity is the logic, tested directly. */
if (require.main === module) process.exitCode = runNoIdentity(process.argv.slice(2));

module.exports = { IDENTITY_VARIABLES, noIdentityEnv, runNoIdentity };
