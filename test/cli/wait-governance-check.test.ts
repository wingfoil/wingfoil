/**
 * task-366 AC 6 (red-first; `dl-190` item 2 (c); design item 8 and its addendum, D8 (a) as ruled at the design gate) —
 * `scripts/wait-governance-check.cjs`, the command `release-publishing.tag`'s pre-check `governance-check-passed` runs:
 * it derives the release's integration branch, takes the head of `refs/remotes/origin/<branch>` (no fetch) and polls
 * `gh api "repos/{owner}/{repo}/commits/<sha>/check-runs?check_name=governance"` every `--interval` seconds up to
 * `--timeout`: exit 0 when a run completed with `conclusion: success`, 1 on another conclusion or none after the
 * timeout, 2 when `gh` is missing or fails, or a kind/version the derivation refuses.
 *
 * **No case reaches the real `gh` or the network.** Every run's `PATH` is a scratch directory and the directory of
 * `process.execPath`, nothing else: the scratch directory holds the stub `gh` and a link to the real `git` (the script
 * reads the tracking ref through git; `gh` is never linked). The run's environment has `GH_TOKEN`, `GITHUB_TOKEN` and
 * `GH_HOST` removed and `GH_CONFIG_DIR` naming an empty scratch directory, so a real `gh` that slipped in would find
 * no credentials. The first case pins that environment and the argv the stub recorded.
 *
 * The stub `gh` answers with the committed fixture `fixtures/gh-check-runs-governance.json`: the response captured once
 * at design with `gh api 'repos/wingfoil/wingfoil/commits/fb5b73e0149df92ccb03bf305ccdb0c171cdf29a/check-runs?check_name=governance'`
 * (a public repository's check run), trimmed to the fields the script reads (`total_count`; per run `name`,
 * `head_sha`, `status`, `conclusion`), values as captured. A case edits only `status` / `conclusion`, or answers with
 * no run; the stub reports each run's `head_sha` as the commit it was asked about, as the API does for the commit in
 * its path. Calls are counted, so a poll that repeats is visible.
 */
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { cloneTempRepo, commitAllAs, fixtureDirPrefix, git, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { spawnCapture, type SpawnedRun } from './helpers/spawn-cli';

const REPO_ROOT = join(__dirname, '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'wait-governance-check.cjs');
const FIXTURE = join(__dirname, 'fixtures', 'gh-check-runs-governance.json');
const AUTHOR = { name: 'WingFoil Test', email: 'wf-test@example.invalid' };

/** The stub `gh`: records its argv, counts its calls, answers with the fixture as the case's answers say. */
const GH_STUB = `#!${process.execPath}
'use strict';
const { appendFileSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const dir = process.env.WF_STUB_GH_DIR;
const argv = process.argv.slice(2);
appendFileSync(join(dir, 'calls.jsonl'), JSON.stringify(argv) + '\\n');
const calls = readFileSync(join(dir, 'calls.jsonl'), 'utf-8').trim().split('\\n').length;
const answers = JSON.parse(readFileSync(join(dir, 'answers.json'), 'utf-8'));
const pick = answers[Math.min(calls, answers.length) - 1];
const fixture = JSON.parse(readFileSync(process.env.WF_STUB_GH_FIXTURE, 'utf-8'));
const asked = /\\/commits\\/([0-9a-f]{40})\\//.exec(argv[1] === undefined ? '' : argv[1]);
let body = { total_count: 0, check_runs: [] };
if (pick !== null) {
  body = fixture;
  body.check_runs = fixture.check_runs.map((run) => ({ ...run, head_sha: asked === null ? run.head_sha : asked[1], status: pick.status, conclusion: pick.conclusion }));
}
process.stdout.write(JSON.stringify(body) + '\\n');
`;

type Answer = { status: string; conclusion: string | null } | null;

const dirs: string[] = [];
afterAll(() => dirs.forEach(removeTempDir));

function scratchDir(): string {
  const dir = mkdtempSync(fixtureDirPrefix());
  dirs.push(dir);
  return dir;
}

/** The real `git` on the caller's PATH, which the stub directory links to. */
const REAL_GIT = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf-8' }).trim();

/** A clone whose `origin/main` is a pushed commit and whose local `main` is one commit ahead of it. */
function cloneWithOrigin(): { clone: string; originMain: string } {
  const origin = scratchDir();
  git(origin, ['init', '--bare', '--quiet', '--initial-branch=main']);
  const clone = cloneTempRepo(origin);
  dirs.push(clone);
  git(clone, ['config', 'commit.gpgsign', 'false']);
  git(clone, ['symbolic-ref', 'HEAD', 'refs/heads/main']);
  writeFixtureFile(clone, 'a.txt', 'a\n');
  commitAllAs(clone, 'add a.txt', AUTHOR);
  git(clone, ['push', '--quiet', 'origin', 'main']);
  writeFixtureFile(clone, 'b.txt', 'b\n');
  commitAllAs(clone, 'add b.txt (not pushed)', AUTHOR);
  const originMain = git(clone, ['rev-parse', 'refs/remotes/origin/main']).trim();
  expect(git(clone, ['rev-parse', 'HEAD']).trim()).not.toBe(originMain);
  return { clone, originMain };
}

/** A stub directory: the `git` link, and the stub `gh` unless `withGh` is false; `answers` per call. */
function stubDir(answers: readonly Answer[], withGh = true): string {
  const dir = scratchDir();
  symlinkSync(REAL_GIT, join(dir, 'git'));
  if (withGh) {
    writeFileSync(join(dir, 'gh'), GH_STUB, 'utf-8');
    chmodSync(join(dir, 'gh'), 0o755);
  }
  writeFileSync(join(dir, 'answers.json'), JSON.stringify(answers), 'utf-8');
  return dir;
}

/** The run's environment: PATH = the stub directory and node's; no GitHub credentials; an empty GH_CONFIG_DIR. */
function offlineEnv(stubs: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!['GH_TOKEN', 'GITHUB_TOKEN', 'GH_HOST', 'GH_CONFIG_DIR', 'PATH'].includes(key) && !key.startsWith('GIT_DIR') && key !== 'GIT_WORK_TREE') env[key] = value;
  }
  const config = scratchDir();
  mkdirSync(join(config, 'gh'), { recursive: true });
  return { ...env, PATH: [stubs, dirname(process.execPath)].join(':'), GH_CONFIG_DIR: join(config, 'gh'), WF_STUB_GH_DIR: stubs, WF_STUB_GH_FIXTURE: FIXTURE };
}

function run(clone: string, stubs: string, args: readonly string[]): SpawnedRun {
  return spawnCapture(process.execPath, [SCRIPT, ...args], { cwd: clone, env: offlineEnv(stubs), timeout: 60_000 });
}

/** The argv of every call the stub recorded, in order (none: the stub never ran). */
function calls(stubs: string): string[][] {
  try {
    return readFileSync(join(stubs, 'calls.jsonl'), 'utf-8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as string[]);
  } catch {
    return [];
  }
}

const MINOR = ['--kind', 'minor', '--version', 'v0.4'];

describe('task-366 AC 6 — scripts/wait-governance-check.cjs, offline, with a stub gh (dl-190 (c), D8)', () => {
  it('the fixture is the captured response trimmed to the five fields the script reads', () => {
    expect(JSON.parse(readFileSync(FIXTURE, 'utf-8'))).toEqual({
      total_count: 1,
      check_runs: [{ name: 'governance', head_sha: 'fb5b73e0149df92ccb03bf305ccdb0c171cdf29a', status: 'completed', conclusion: 'success' }],
    });
  });

  it('a completed, successful run: exit 0; PATH is the stub directory and node\'s only, no credentials; gh asked about the head of refs/remotes/origin/main', () => {
    const { clone, originMain } = cloneWithOrigin();
    const stubs = stubDir([{ status: 'completed', conclusion: 'success' }]);
    const env = offlineEnv(stubs);
    expect((env.PATH ?? '').split(':')).toEqual([stubs, dirname(process.execPath)]);
    for (const key of ['GH_TOKEN', 'GITHUB_TOKEN', 'GH_HOST']) expect([key, key in env]).toEqual([key, false]);
    const result = run(clone, stubs, [...MINOR, '--interval', '0', '--timeout', '0']);
    expect(calls(stubs)).toEqual([['api', `repos/{owner}/{repo}/commits/${originMain}/check-runs?check_name=governance`]]);
    expect(result.status).toBe(0);
  });

  it('a completed run with conclusion failure: exit 1, after one call', () => {
    const { clone } = cloneWithOrigin();
    const stubs = stubDir([{ status: 'completed', conclusion: 'failure' }]);
    const result = run(clone, stubs, [...MINOR, '--interval', '0', '--timeout', '0']);
    expect(calls(stubs)).toHaveLength(1);
    expect(result.status).toBe(1);
  });

  it('in_progress, then completed with success: exit 0 after the second poll (--interval 0)', () => {
    const { clone } = cloneWithOrigin();
    const stubs = stubDir([{ status: 'in_progress', conclusion: null }, { status: 'completed', conclusion: 'success' }]);
    const result = run(clone, stubs, [...MINOR, '--interval', '0', '--timeout', '60']);
    expect(calls(stubs)).toHaveLength(2);
    expect(result.status).toBe(0);
  });

  it('no run at all until --timeout 0: exit 1, gh asked', () => {
    const { clone } = cloneWithOrigin();
    const stubs = stubDir([null]);
    const result = run(clone, stubs, [...MINOR, '--interval', '0', '--timeout', '0']);
    expect(calls(stubs).length).toBeGreaterThanOrEqual(1);
    expect(result.status).toBe(1);
  });

  it('no gh on PATH: exit 2', () => {
    const { clone } = cloneWithOrigin();
    const stubs = stubDir([], false);
    const result = run(clone, stubs, [...MINOR, '--interval', '0', '--timeout', '0']);
    expect(result.status).toBe(2);
  });

  it('a kind/version the derivation refuses (--kind patch --version v0.4): exit 2', () => {
    const { clone } = cloneWithOrigin();
    const stubs = stubDir([{ status: 'completed', conclusion: 'success' }]);
    const result = run(clone, stubs, ['--kind', 'patch', '--version', 'v0.4', '--interval', '0', '--timeout', '0']);
    expect(result.status).toBe(2);
  });
});
