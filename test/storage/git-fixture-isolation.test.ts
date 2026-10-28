/**
 * The git fixture runs git isolated from the developer's global and system configuration (task-308 AC3,
 * `bug-278`).
 *
 * `test/storage/helpers/git-fixture.ts` used to spawn git with no `env`, so every fixture command read the
 * global config of whoever ran the suite: a global `core.excludesFile` ignoring `*` made `commitAll` find
 * nothing to commit, and any other global setting could change what a fixture repository holds. The helper
 * now spawns git with {@link fixtureGitEnv}: `GIT_CONFIG_GLOBAL` pointed at the null device,
 * `GIT_CONFIG_NOSYSTEM=1`, and none of the caller's `GIT_*` variables.
 *
 * The hostile global configuration reaches the helper the way a developer's own does: through the
 * environment of the process that loads it. Jest gives each suite a sandboxed `process.env`, so the probe
 * runs the helper in a child `node` (transpiled to CommonJS into a scratch directory; it imports only node
 * built-ins) whose real environment names the hostile file. The developer's configuration is never written.
 */
import { execFileSync, spawnSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { devNull, tmpdir } from 'os';
import { join } from 'path';
import * as ts from 'typescript';

import { fixtureGitEnv, git, makeTempGitRepo, removeTempDir } from './helpers/git-fixture';

const HELPER = join(__dirname, 'helpers', 'git-fixture.ts');

let scratch: string;
let helperJs: string;
let hostileEnv: NodeJS.ProcessEnv;

beforeAll(() => {
  scratch = mkdtempSync(join(tmpdir(), 'wf-git-fixture-isolation-'));
  const compiled = ts.transpileModule(readFileSync(HELPER, 'utf-8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: HELPER,
  });
  helperJs = join(scratch, 'git-fixture.js');
  writeFileSync(helperJs, compiled.outputText, 'utf-8');

  // A global configuration that ignores every file: under it, `git add -A` stages nothing.
  const excludes = join(scratch, 'global-excludes');
  writeFileSync(excludes, '*\n', 'utf-8');
  const globalConfig = join(scratch, 'gitconfig');
  writeFileSync(globalConfig, `[core]\n\texcludesFile = ${excludes}\n`, 'utf-8');
  hostileEnv = { ...process.env, GIT_CONFIG_GLOBAL: globalConfig, GIT_CONFIG_NOSYSTEM: '1' };
});

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

/** Run `script` in a child node under the hostile environment, with `f` bound to the helper; parse its JSON. */
function probe(script: string): unknown {
  const run = spawnSync(
    process.execPath,
    ['-e', `const f = require(${JSON.stringify(helperJs)});\n${script}`],
    { env: hostileEnv, encoding: 'utf-8' },
  );
  expect([run.status, run.signal]).toEqual([0, null]);
  return JSON.parse(run.stdout);
}

/** Git with no global or system config at all, for the source repository a clone is made from. */
function gitClean(cwd: string, args: string[]): void {
  execFileSync('git', args, {
    cwd,
    encoding: 'utf-8',
    env: { ...process.env, GIT_CONFIG_GLOBAL: devNull, GIT_CONFIG_NOSYSTEM: '1' },
  });
}

describe('git fixture isolation from the global git config (task-308 AC3, bug-278)', () => {
  it('control: the hostile global config is in effect for the probe\'s own git', () => {
    const run = spawnSync('git', ['config', '--global', '--get', 'core.excludesFile'], {
      env: hostileEnv,
      encoding: 'utf-8',
    });
    expect([run.status, run.stdout.trim()]).toEqual([0, join(scratch, 'global-excludes')]);
  });

  it('makeTempGitRepo + commitAll commit and track the file under a global excludesFile ignoring everything', () => {
    const result = probe(`
      const out = {};
      const repo = f.makeTempGitRepo();
      try {
        f.writeFixtureFile(repo, 'a.txt', 'a\\n');
        try { f.commitAll(repo, 'seed'); out.commit = 'ok'; } catch { out.commit = 'FAIL'; }
        out.tracked = f.git(repo, ['ls-files']).trim();
      } finally {
        f.removeTempDir(repo);
      }
      process.stdout.write(JSON.stringify(out));
    `);
    expect(result).toEqual({ commit: 'ok', tracked: 'a.txt' });
  });

  it('cloneTempRepo + commitAllAs commit and track the file under the same global config', () => {
    const source = mkdtempSync(join(tmpdir(), 'wf-git-fixture-isolation-src-'));
    try {
      gitClean(source, ['init', '--quiet', '--initial-branch=main']);
      writeFileSync(join(source, 'seed.txt'), 'seed\n', 'utf-8');
      gitClean(source, ['add', '-A']);
      gitClean(source, [
        '-c', 'user.name=WingFoil Test', '-c', 'user.email=wf-test@example.invalid', '-c', 'commit.gpgsign=false',
        'commit', '--quiet', '-m', 'seed',
      ]);
      const result = probe(`
        const out = {};
        const clone = f.cloneTempRepo(${JSON.stringify(source)});
        try {
          f.writeFixtureFile(clone, 'b.txt', 'b\\n');
          try {
            f.commitAllAs(clone, 'second', { name: 'Someone Else', email: 'someone@example.invalid' });
            out.commit = 'ok';
          } catch { out.commit = 'FAIL'; }
          out.tracked = f.git(clone, ['ls-files']).trim().split('\\n');
        } finally {
          f.removeTempDir(clone);
        }
        process.stdout.write(JSON.stringify(out));
      `);
      expect(result).toEqual({ commit: 'ok', tracked: ['b.txt', 'seed.txt'] });
    } finally {
      rmSync(source, { recursive: true, force: true });
    }
  });

  it('a fixture repository sees only its local (and command) configuration: no global or system scope', () => {
    const repo = makeTempGitRepo();
    try {
      const scopes = git(repo, ['config', '--list', '--show-scope'])
        .split('\n')
        .filter((line) => line !== '')
        .map((line) => line.split('\t')[0]);
      expect(scopes.filter((scope) => scope === 'global' || scope === 'system')).toEqual([]);
    } finally {
      removeTempDir(repo);
    }
  });

  it('fixtureGitEnv points the global config at the null device, disables the system one, and drops the caller\'s GIT_*', () => {
    const saved = { author: process.env.GIT_AUTHOR_NAME, dir: process.env.GIT_DIR };
    process.env.GIT_AUTHOR_NAME = 'X';
    process.env.GIT_DIR = join(scratch, 'elsewhere.git');
    try {
      const env = fixtureGitEnv();
      expect(env.GIT_CONFIG_GLOBAL).toBe(devNull);
      expect(env.GIT_CONFIG_NOSYSTEM).toBe('1');
      expect(Object.keys(env).filter((key) => key.startsWith('GIT_')).sort()).toEqual([
        'GIT_CONFIG_GLOBAL',
        'GIT_CONFIG_NOSYSTEM',
      ]);
      expect(env.PATH).toBe(process.env.PATH);

      const withAuthor = fixtureGitEnv({ GIT_AUTHOR_NAME: 'Y' });
      expect(withAuthor.GIT_AUTHOR_NAME).toBe('Y');
      expect(withAuthor.GIT_CONFIG_GLOBAL).toBe(devNull);
    } finally {
      if (saved.author === undefined) delete process.env.GIT_AUTHOR_NAME;
      else process.env.GIT_AUTHOR_NAME = saved.author;
      if (saved.dir === undefined) delete process.env.GIT_DIR;
      else process.env.GIT_DIR = saved.dir;
    }
  });
});
