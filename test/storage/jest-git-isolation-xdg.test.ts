/**
 * task-349 AC 6 (`bug-446`; approver ruling D8 (a), 2026-11-07) — the jest run's git isolation also closes the gap
 * `test/storage/helpers/git-fixture.ts` leaves open.
 *
 * `fixtureGitEnv` points `GIT_CONFIG_GLOBAL` at the null device and sets `GIT_CONFIG_NOSYSTEM=1`, but it keeps the
 * caller's `XDG_CONFIG_HOME`, and git reads its default ignore file `$XDG_CONFIG_HOME/git/ignore` whenever no
 * `core.excludesFile` is set — so a developer's `~/.config/git/ignore` holding `*` still hides every file from a
 * fixture. The design gate ruled that the jest global setup's isolation covers it, with no change to the helper; this
 * suite proves it:
 *
 * - control: a child `node` whose real environment carries the hostile `XDG_CONFIG_HOME` runs the helper's `git`
 *   alone, and `git status` sees no file;
 * - the fix: the same child first applies the global setup's isolation (`applyGitIsolation`, what jest's main process
 *   does before forking a worker), and `git status` sees the untracked file;
 * - in this worker, `fixtureGitEnv()` carries the run's isolated, empty `XDG_CONFIG_HOME`.
 *
 * The hostile environment reaches the helper the way a developer's own does, through the environment of the process
 * that loads it (as `test/storage/git-fixture-isolation.test.ts` does): the helper is transpiled to CommonJS into a
 * scratch directory, and it imports only node built-ins. The developer's configuration is never written.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as ts from 'typescript';

import { fixtureGitEnv } from './helpers/git-fixture';

const TEST_ROOT = join(__dirname, '..');
const HELPER = join(__dirname, 'helpers', 'git-fixture.ts');
const GLOBAL_SETUP = join(TEST_ROOT, 'global-setup.cjs');
const GLOBAL_TEARDOWN = join(TEST_ROOT, 'global-teardown.cjs');

let scratch: string;
let helperJs: string;
let hostileXdg: string;

beforeAll(() => {
  scratch = mkdtempSync(join(tmpdir(), 'wf-git-isolation-xdg-test-'));
  const compiled = ts.transpileModule(readFileSync(HELPER, 'utf-8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: HELPER,
  });
  helperJs = join(scratch, 'git-fixture.js');
  writeFileSync(helperJs, compiled.outputText, 'utf-8');
  // git's default ignore file, ignoring every file.
  hostileXdg = join(scratch, 'hostile-xdg');
  mkdirSync(join(hostileXdg, 'git'), { recursive: true });
  writeFileSync(join(hostileXdg, 'git', 'ignore'), '*\n', 'utf-8');
});

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

/**
 * In a child node whose environment carries the hostile `XDG_CONFIG_HOME`, optionally apply the global setup's
 * isolation first, then run `git status --porcelain` through the helper in a fresh fixture repository holding `a.txt`.
 */
function statusInChild(isolate: boolean): { status: string; xdg: string | undefined } {
  const script = `
    const out = {};
    let teardown;
    if (${JSON.stringify(isolate)}) {
      require(${JSON.stringify(GLOBAL_SETUP)}).applyGitIsolation();
      teardown = require(${JSON.stringify(GLOBAL_TEARDOWN)});
    }
    const f = require(${JSON.stringify(helperJs)});
    const repo = f.makeTempGitRepo();
    try {
      f.writeFixtureFile(repo, 'a.txt', 'a\\n');
      out.status = f.git(repo, ['status', '--porcelain']);
      out.xdg = f.fixtureGitEnv().XDG_CONFIG_HOME;
    } finally {
      f.removeTempDir(repo);
      if (teardown) teardown.removeGitIsolation(process.env.WF_GIT_ISOLATION_DIR, process.pid);
    }
    process.stdout.write(JSON.stringify(out));
  `;
  const run = spawnSync(process.execPath, ['-e', script], {
    env: { ...process.env, XDG_CONFIG_HOME: hostileXdg },
    encoding: 'utf-8',
  });
  expect([run.status, run.signal, run.stderr]).toEqual([0, null, '']);
  return JSON.parse(run.stdout) as { status: string; xdg: string | undefined };
}

describe('task-349 AC 6 (bug-446) — the jest run isolation covers fixtureGitEnv\'s XDG_CONFIG_HOME gap', () => {
  it('control: the helper alone, under a hostile $XDG_CONFIG_HOME/git/ignore, lets git ignore every file', () => {
    expect(statusInChild(false)).toEqual({ status: '', xdg: hostileXdg });
  });

  it('with the global setup\'s isolation applied first, the helper\'s git sees the untracked file', () => {
    const result = statusInChild(true);
    expect(result.status).toBe('?? a.txt\n');
    expect(result.xdg).not.toBe(hostileXdg);
  });

  it('in this worker, fixtureGitEnv() carries the run\'s isolated, empty XDG_CONFIG_HOME', () => {
    const dir = process.env.WF_GIT_ISOLATION_DIR;
    expect(dir).toBeDefined();
    expect(fixtureGitEnv().XDG_CONFIG_HOME).toBe(join(dir!, 'xdg'));
  });
});

describe('task-349 AC 6 (bug-446) — the teardown removes its own isolation directory and dead runs\', never a live run\'s', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { removeGitIsolation, sweepDeadGitIsolationDirs } = require('../global-teardown.cjs') as {
    removeGitIsolation: (dir: string | undefined, pid: number) => string | null;
    sweepDeadGitIsolationDirs: (
      tmpRoot: string,
      options: { ownPid: number; isAlive: (pid: number) => boolean },
    ) => { found: string[]; unremoved: string[] };
  };

  it('a directory named for this pid is removed; one named for another pid, or none, is left alone', () => {
    const mine = mkdtempSync(join(scratch, `wf-git-isolation-r${process.pid}-`));
    const parents = mkdtempSync(join(scratch, `wf-git-isolation-r${process.pid + 1}-`));
    expect(removeGitIsolation(mine, process.pid)).toBeNull();
    expect(removeGitIsolation(parents, process.pid)).toBeNull();
    expect(removeGitIsolation(undefined, process.pid)).toBeNull();
    expect([existsSync(mine), existsSync(parents)]).toEqual([false, true]);
  });

  it('the dead runs\' sweep removes the isolation directories whose pid is not running, never this run\'s or a live one\'s', () => {
    const root = mkdtempSync(join(scratch, 'sweep-'));
    for (const name of ['wf-git-isolation-r101-a', 'wf-git-isolation-r202-b', 'wf-git-isolation-r303-c', 'wf-storage-r101-d', 'other']) {
      mkdirSync(join(root, name));
    }
    const result = sweepDeadGitIsolationDirs(root, { ownPid: 303, isAlive: (pid) => pid === 202 });
    expect(result).toEqual({ found: [join(root, 'wf-git-isolation-r101-a')], unremoved: [] });
    expect(readdirSync(root).sort()).toEqual(['other', 'wf-git-isolation-r202-b', 'wf-git-isolation-r303-c', 'wf-storage-r101-d']);
  });
});
