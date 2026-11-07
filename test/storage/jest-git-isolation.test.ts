/**
 * task-349 AC 6 (`bug-446`; approver ruling D8 (a), 2026-11-07; `testing` T2) — code under test in the jest run
 * reads no developer or system git configuration.
 *
 * T2: the check asserts the invariant the fix restores, so it fails in any environment the suite runs in, not only
 * one with a hostile global `core.excludesFile`:
 *
 * - in the worker, `test/global-setup.cjs` has set `GIT_CONFIG_GLOBAL` to a file holding only
 *   `ISOLATED_GLOBAL_CONFIG` (`scripts/test-no-identity.cjs`), `GIT_CONFIG_NOSYSTEM=1`, an empty
 *   `XDG_CONFIG_HOME` (git's default `$XDG_CONFIG_HOME/git/ignore` is read even when no `core.excludesFile` is
 *   set), all under `WF_GIT_ISOLATION_DIR`, and dropped the `GIT_CONFIG_*` injection variables;
 * - `isolatedGitEnv` (`test/git-isolation.cjs`, pure) turns a hostile environment into one in which an untracked
 *   file is seen again by `git status`.
 *
 * All red-first: no isolation exists before this task.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import { isolatedGitEnv } from '../git-isolation.cjs';
import { fixtureDirPrefix, makeTempGitRepo, removeTempDir } from './helpers/git-fixture';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ISOLATED_GLOBAL_CONFIG } = require('../../scripts/test-no-identity.cjs') as { ISOLATED_GLOBAL_CONFIG: string };

type Env = Record<string, string | undefined>;

describe('task-349 AC 6 (bug-446) — the jest worker runs with an isolated git configuration', () => {
  it('GIT_CONFIG_NOSYSTEM is 1 and no GIT_CONFIG_* injection variable is set', () => {
    expect(process.env.GIT_CONFIG_NOSYSTEM).toBe('1');
    expect(process.env.GIT_CONFIG_COUNT).toBeUndefined();
    expect(process.env.GIT_CONFIG_PARAMETERS).toBeUndefined();
    expect(Object.keys(process.env).filter((key) => /^GIT_CONFIG_(KEY|VALUE)_\d+$/.test(key))).toEqual([]);
  });

  it('GIT_CONFIG_GLOBAL names <WF_GIT_ISOLATION_DIR>/gitconfig, holding exactly ISOLATED_GLOBAL_CONFIG', () => {
    const dir = process.env.WF_GIT_ISOLATION_DIR;
    expect(dir).toBeDefined();
    expect(basename(dir!).startsWith('wf-git-isolation-r')).toBe(true);
    expect(process.env.GIT_CONFIG_GLOBAL).toBe(join(dir!, 'gitconfig'));
    expect(readFileSync(process.env.GIT_CONFIG_GLOBAL!, 'utf-8')).toBe(ISOLATED_GLOBAL_CONFIG);
  });

  it('XDG_CONFIG_HOME names <WF_GIT_ISOLATION_DIR>/xdg, an existing empty directory', () => {
    const dir = process.env.WF_GIT_ISOLATION_DIR;
    expect(dir).toBeDefined();
    expect(process.env.XDG_CONFIG_HOME).toBe(join(dir!, 'xdg'));
    expect(statSync(process.env.XDG_CONFIG_HOME!).isDirectory()).toBe(true);
    expect(readdirSync(process.env.XDG_CONFIG_HOME!)).toEqual([]);
  });

  it('git config --global --list, run with the worker\'s environment, prints user.useconfigonly=true only', () => {
    const out = execFileSync('git', ['config', '--global', '--list'], { encoding: 'utf-8', env: process.env });
    expect(out).toBe('user.useconfigonly=true\n');
  });
});

describe('task-349 AC 6 (bug-446) — isolatedGitEnv neutralises a hostile git configuration', () => {
  let scratch: string;
  let repo: string;
  let hostile: Env;
  let clean: { globalConfig: string; xdgConfigHome: string };

  beforeEach(() => {
    scratch = mkdtempSync(fixtureDirPrefix());
    // The hostile side: a global config whose core.excludesFile ignores everything, a default ignore file under
    // XDG_CONFIG_HOME that does the same, and the same key injected through GIT_CONFIG_COUNT/KEY/VALUE and
    // GIT_CONFIG_PARAMETERS.
    const excludes = join(scratch, 'hostile-excludes');
    writeFileSync(excludes, '*\n');
    const hostileGlobal = join(scratch, 'hostile-gitconfig');
    writeFileSync(hostileGlobal, `[core]\n\texcludesFile = ${excludes}\n`);
    const hostileXdg = join(scratch, 'hostile-xdg');
    mkdirSync(join(hostileXdg, 'git'), { recursive: true });
    writeFileSync(join(hostileXdg, 'git', 'ignore'), '*\n');
    hostile = {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      GIT_CONFIG_GLOBAL: hostileGlobal,
      XDG_CONFIG_HOME: hostileXdg,
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'core.excludesFile',
      GIT_CONFIG_VALUE_0: excludes,
      GIT_CONFIG_PARAMETERS: `'core.excludesFile'='${excludes}'`,
      GIT_AUTHOR_NAME: 'Kept Identity',
      GIT_AUTHOR_EMAIL: 'kept@example.invalid',
    };
    // The isolated side, as prepareGitIsolation lays it out.
    const globalConfig = join(scratch, 'gitconfig');
    writeFileSync(globalConfig, ISOLATED_GLOBAL_CONFIG);
    const xdgConfigHome = join(scratch, 'xdg');
    mkdirSync(xdgConfigHome);
    clean = { globalConfig, xdgConfigHome };

    repo = makeTempGitRepo();
    writeFileSync(join(repo, 'a.txt'), 'a\n');
  });

  afterEach(() => {
    removeTempDir(repo);
    removeTempDir(scratch);
  });

  const status = (env: Env): string => execFileSync('git', ['status', '--porcelain'], { cwd: repo, encoding: 'utf-8', env });

  it('drops the injection variables, sets the isolated global config, no system config and the empty XDG_CONFIG_HOME, and keeps the rest', () => {
    const before = { ...hostile };
    const env = isolatedGitEnv(hostile, clean) as Env;
    expect(hostile).toEqual(before); // pure: the base is not changed
    for (const key of ['GIT_CONFIG_COUNT', 'GIT_CONFIG_KEY_0', 'GIT_CONFIG_VALUE_0', 'GIT_CONFIG_PARAMETERS']) {
      expect({ key, present: key in env }).toEqual({ key, present: false });
    }
    expect(env).toMatchObject({
      GIT_CONFIG_GLOBAL: clean.globalConfig,
      GIT_CONFIG_NOSYSTEM: '1',
      XDG_CONFIG_HOME: clean.xdgConfigHome,
      PATH: process.env.PATH,
      GIT_AUTHOR_NAME: 'Kept Identity',
      GIT_AUTHOR_EMAIL: 'kept@example.invalid',
    });
  });

  it('git status sees nothing under the hostile environment, and the untracked file under the isolated one', () => {
    expect(existsSync(join(repo, 'a.txt'))).toBe(true);
    expect(status(hostile)).toBe('');
    expect(status(isolatedGitEnv(hostile, clean) as Env)).toBe('?? a.txt\n');
  });
});
