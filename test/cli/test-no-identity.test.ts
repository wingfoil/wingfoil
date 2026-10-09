/**
 * task-219 AC 3 (`dl-099`; the v0.2.2 carry-over, `bug-172`) — `npm run test:no-identity` runs the full
 * suite in the environment the CI `gate` job has: no git identity. Every earlier local run had one, which is
 * how `bug-172` reached the `v0.2.2` tag (`release-publishing-rel-v0.2.2-plan` S3).
 *
 * - the script is `node scripts/test-no-identity.cjs`, and it runs `scripts/run-tests.cjs` (what `npm test`
 *   runs) with the caller's arguments;
 * - its environment points git's global config away (`GIT_CONFIG_GLOBAL` at the null device,
 *   `GIT_CONFIG_NOSYSTEM=1`), gives it an empty `HOME`, and drops every identity variable git reads
 *   (`GIT_AUTHOR_*`, `GIT_COMMITTER_*`, `EMAIL`) — so `git config user.email` exits 1 inside it, even when
 *   the caller has an identity, and even at this repository's root;
 * - `release-submit.yaml`'s `pre-release-checks` declares it (`tests.no-identity`), bound in
 *   `workflows/bindings.yaml` to the script.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { devNull } from 'node:os';
import { join } from 'node:path';

import { load as yamlLoad } from 'js-yaml';

const REPO_ROOT = join(__dirname, '..', '..');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const noIdentity = require('../../scripts/test-no-identity.cjs') as {
  IDENTITY_VARIABLES: readonly string[];
  noIdentityEnv: (base: Readonly<Record<string, string | undefined>>, home: string) => Record<string, string | undefined>;
  runNoIdentity: (
    args: readonly string[],
    options: {
      env?: Readonly<Record<string, string | undefined>>;
      spawn: (command: string, argv: readonly string[], spawnOptions: { cwd: string; env: Record<string, string | undefined> }) => number | null;
    },
  ) => number;
};

/** A caller environment that HAS an identity, through every channel git reads one from. */
const WITH_IDENTITY = {
  ...process.env,
  GIT_AUTHOR_NAME: 'Someone',
  GIT_AUTHOR_EMAIL: 'someone@example.invalid',
  GIT_COMMITTER_NAME: 'Someone',
  GIT_COMMITTER_EMAIL: 'someone@example.invalid',
  EMAIL: 'someone@example.invalid',
};

describe('task-219 AC 3 — the no-identity suite run', () => {
  it('package.json declares test:no-identity as the script', () => {
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf-8')) as { scripts: Record<string, string> };
    expect(pkg.scripts['test:no-identity']).toBe('node scripts/test-no-identity.cjs');
  });

  it('the environment points the global config away, empties HOME and drops every identity variable', () => {
    const env = noIdentity.noIdentityEnv({ ...WITH_IDENTITY, PATH: '/bin', KEEP_ME: '1' }, '/empty/home');
    expect(env['GIT_CONFIG_GLOBAL']).toBe(devNull);
    expect(env['GIT_CONFIG_NOSYSTEM']).toBe('1');
    expect(env['HOME']).toBe('/empty/home');
    for (const name of ['GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL', 'EMAIL']) {
      expect(noIdentity.IDENTITY_VARIABLES).toContain(name);
      expect(env).not.toHaveProperty(name);
    }
    // Everything else is inherited unchanged.
    expect(env['PATH']).toBe('/bin');
    expect(env['KEEP_ME']).toBe('1');
  });

  it('runs scripts/run-tests.cjs with the caller\'s arguments, from the repository root, under node', () => {
    const seen: { command: string; argv: readonly string[]; cwd: string }[] = [];
    const status = noIdentity.runNoIdentity(['test/x.test.ts', '--silent'], {
      env: WITH_IDENTITY,
      spawn: (command, argv, options) => {
        seen.push({ command, argv, cwd: options.cwd });
        return 0;
      },
    });
    expect(status).toBe(0);
    expect(seen).toEqual([{ command: process.execPath, argv: [join(REPO_ROOT, 'scripts', 'run-tests.cjs'), 'test/x.test.ts', '--silent'], cwd: REPO_ROOT }]);
  });

  it('`git config user.email` exits 1 inside the script\'s environment, at the repository root, though the caller has an identity', () => {
    let home = '';
    const status = noIdentity.runNoIdentity([], {
      env: WITH_IDENTITY,
      // Instead of the suite, run the probe the AC names — in the exact environment and directory the suite would get.
      spawn: (_command, _argv, options) => {
        home = options.env['HOME']!;
        expect(existsSync(home)).toBe(true);
        expect(readdirSync(home)).toEqual([]);
        return spawnSync('git', ['config', 'user.email'], { cwd: options.cwd, env: options.env, encoding: 'utf-8' }).status;
      },
    });
    expect(status).toBe(1);
    // The empty HOME is a throwaway: removed after the run.
    expect(existsSync(home)).toBe(false);
  });

  it('propagates a failing suite\'s status, and a run that died on a signal as 1', () => {
    expect(noIdentity.runNoIdentity([], { env: WITH_IDENTITY, spawn: () => 3 })).toBe(3);
    expect(noIdentity.runNoIdentity([], { env: WITH_IDENTITY, spawn: () => null })).toBe(1);
  });

  it('release-submit.yaml pre-release-checks declares it, and bindings.yaml binds it to the script', () => {
    const submit = yamlLoad(readFileSync(join(REPO_ROOT, '.wingfoil', 'workflows', 'custom', 'release-submit.yaml'), 'utf-8')) as {
      version: number;
      phases: { name: string; checks?: { pre?: string[] } }[];
    };
    expect(submit.version).toBeGreaterThan(1.1);
    const checks = submit.phases.find((p) => p.name === 'pre-release-checks')?.checks?.pre ?? [];
    expect(checks).toContain('tests.no-identity');
    const bindings = yamlLoad(readFileSync(join(REPO_ROOT, '.wingfoil', 'workflows', 'bindings.yaml'), 'utf-8')) as {
      checks: Record<string, { run: string[]; severity?: string }>;
    };
    expect(bindings.checks['tests.no-identity']?.run).toEqual(['npm', 'run', 'test:no-identity']);
  });
});
