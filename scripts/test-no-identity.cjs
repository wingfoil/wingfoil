#!/usr/bin/env node
/**
 * `npm run test:no-identity` — the full suite with no git identity, as the CI `gate` job runs it
 * (task-219; `dl-099`; the v0.2.2 carry-over, `bug-172`). Every local run has the developer's identity,
 * and v0.2.2 reached its tag with five tests that failed only without one
 * (`release-publishing-rel-v0.2.2-plan` S3). `release-submit.yaml`'s `pre-release-checks` declares this
 * run as `tests.no-identity`, so it runs on the release candidate before the tag.
 *
 * The environment is the caller's, except:
 * - `GIT_CONFIG_GLOBAL` names a throwaway file holding only {@link ISOLATED_GLOBAL_CONFIG}, and
 *   `GIT_CONFIG_NOSYSTEM=1`: no global or system config, so no `user.name` / `user.email` from either
 *   (`GIT_CONFIG_GLOBAL` also replaces `$XDG_CONFIG_HOME/git/config`). That file sets
 *   `user.useConfigOnly = true`, so git never invents an identity from the user name and host name: a host
 *   with a fully qualified name would otherwise let a commit pass here that fails on the CI runner
 *   (review fix 1, 2026-10-10);
 * - `HOME` is a fresh, empty throwaway directory; it and the config file are removed after the run;
 * - the variables git reads an identity from are dropped: {@link IDENTITY_VARIABLES}, and so is every
 *   variable git reads *config* from — `GIT_CONFIG_PARAMETERS`, `GIT_CONFIG_COUNT`, `GIT_CONFIG_KEY_<n>`,
 *   `GIT_CONFIG_VALUE_<n>` — which could carry a `user.email` in (review fix 1).
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
const { mkdirSync, mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

/** The environment variables git takes an author or committer identity from. */
const IDENTITY_VARIABLES = Object.freeze(['GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL', 'EMAIL']);

/** Whether `name` is an environment variable git reads configuration from. */
const CONFIG_VARIABLE_RE = /^(?:GIT_CONFIG_PARAMETERS|GIT_CONFIG_COUNT|GIT_CONFIG_KEY_\d+|GIT_CONFIG_VALUE_\d+)$/;

/** The whole of the isolated global config: no identity, and no guessing one (`user.useConfigOnly`). */
const ISOLATED_GLOBAL_CONFIG = '[user]\n\tuseConfigOnly = true\n';

/**
 * `base` with no git identity: global config pointed at `globalConfig` (a file holding
 * {@link ISOLATED_GLOBAL_CONFIG}), system config off, `HOME` set to `home`, and both
 * {@link IDENTITY_VARIABLES} and the config variables removed. Pure.
 *
 * @param {Readonly<Record<string, string | undefined>>} base
 * @param {string} home
 * @param {string} globalConfig
 * @returns {Record<string, string | undefined>}
 */
function noIdentityEnv(base, home, globalConfig) {
  const env = { ...base };
  for (const name of IDENTITY_VARIABLES) delete env[name];
  for (const name of Object.keys(env)) if (CONFIG_VARIABLE_RE.test(name)) delete env[name];
  env.GIT_CONFIG_GLOBAL = globalConfig;
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
  const root = mkdtempSync(join(tmpdir(), 'wingfoil-no-identity-'));
  try {
    const home = join(root, 'home');
    mkdirSync(home);
    const globalConfig = join(root, 'gitconfig');
    writeFileSync(globalConfig, ISOLATED_GLOBAL_CONFIG);
    const status = spawn(process.execPath, [join(repoRoot, 'scripts', 'run-tests.cjs'), ...args], {
      cwd: repoRoot,
      env: noIdentityEnv(options.env ?? process.env, home, globalConfig),
    });
    return status ?? 1;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/* istanbul ignore next -- the CLI entry point; runNoIdentity is the logic, tested directly. */
if (require.main === module) process.exitCode = runNoIdentity(process.argv.slice(2));

module.exports = { IDENTITY_VARIABLES, ISOLATED_GLOBAL_CONFIG, noIdentityEnv, runNoIdentity };
