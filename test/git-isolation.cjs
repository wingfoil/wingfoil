'use strict';
/**
 * The jest run reads no developer or system git configuration
 * (`bug-446`, task-349 AC 6; approver ruling D8 (a), 2026-11-07).
 *
 * The code under test runs `git` and so did read the developer's configuration: a global `core.excludesFile` naming
 * a file that holds `*` made `git status` see no file at all, and 11 tests failed on that machine only. Setting
 * `GIT_CONFIG_GLOBAL` alone is not enough — git still reads its default ignore file `$XDG_CONFIG_HOME/git/ignore`
 * (`~/.config/git/ignore`) when no `core.excludesFile` is set, and the system configuration, and the configuration
 * injected through `GIT_CONFIG_PARAMETERS` or `GIT_CONFIG_COUNT`/`GIT_CONFIG_KEY_<n>`/`GIT_CONFIG_VALUE_<n>`. So the run
 * gets:
 *
 * - `GIT_CONFIG_GLOBAL` naming a file holding only `ISOLATED_GLOBAL_CONFIG` (`[user] useConfigOnly = true`, the one
 *   `npm run test:no-identity` uses, `scripts/test-no-identity.cjs`): no identity is guessed from the host;
 * - `GIT_CONFIG_NOSYSTEM=1`;
 * - `XDG_CONFIG_HOME` naming an empty directory;
 * - none of the injection variables.
 *
 * Identity variables (`GIT_AUTHOR_NAME` and friends) are kept: they are the test's own, not the host's.
 * `test/global-setup.cjs` applies it to jest's main process before any worker is forked, so every worker, the code
 * under test and every process it spawns inherit it; `test/global-teardown.cjs` removes the directory.
 */
const { mkdirSync, mkdtempSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const { ISOLATED_GLOBAL_CONFIG } = require('../scripts/test-no-identity.cjs');

/** The variables through which git takes configuration from the environment, besides `GIT_CONFIG_GLOBAL`. */
const INJECTION_VARIABLE = /^GIT_CONFIG_(PARAMETERS|COUNT|KEY_\d+|VALUE_\d+)$/;

/** The prefix of a run's isolation directory under the temp directory; `r<pid>` names jest's main process. */
const ISOLATION_DIR_PREFIX = 'wf-git-isolation-r';

/**
 * `base` without the injection variables, plus the isolated global config, no system config and the empty
 * `XDG_CONFIG_HOME`. Pure: `base` is not changed.
 *
 * @param {Readonly<Record<string, string | undefined>>} base
 * @param {{ globalConfig: string, xdgConfigHome: string }} isolation
 * @returns {Record<string, string | undefined>}
 */
function isolatedGitEnv(base, { globalConfig, xdgConfigHome }) {
  const env = {};
  for (const [key, value] of Object.entries(base)) {
    if (!INJECTION_VARIABLE.test(key)) env[key] = value;
  }
  env.GIT_CONFIG_GLOBAL = globalConfig;
  env.GIT_CONFIG_NOSYSTEM = '1';
  env.XDG_CONFIG_HOME = xdgConfigHome;
  return env;
}

/**
 * Create the run's isolation directory `<root>/wf-git-isolation-r<pid>-…`, its `gitconfig` and its empty `xdg/`.
 *
 * @param {string} [root] - Where to create it; the temp directory by default.
 * @returns {{ dir: string, globalConfig: string, xdgConfigHome: string }}
 */
function prepareGitIsolation(root = tmpdir()) {
  const dir = mkdtempSync(join(root, `${ISOLATION_DIR_PREFIX}${process.pid}-`));
  const globalConfig = join(dir, 'gitconfig');
  writeFileSync(globalConfig, ISOLATED_GLOBAL_CONFIG);
  const xdgConfigHome = join(dir, 'xdg');
  mkdirSync(xdgConfigHome);
  return { dir, globalConfig, xdgConfigHome };
}

module.exports = { ISOLATION_DIR_PREFIX, isolatedGitEnv, prepareGitIsolation };
