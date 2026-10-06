/**
 * task-169 — `dl-062-roles-yaml-unwritable-fallback` Q1 option 3 (flag `--force`, ratified
 * `4cd18767`) end to end through the REAL compiled `dist/cli.js`, in a REAL `wingfoil init`-ed
 * throwaway project. What only the process boundary shows: the exit code, that the working tree and
 * `HEAD` are untouched by a refusal, and that the `--force` warning reaches stderr while stdout stays
 * the payload a script parses under `--format json` and `--format yaml`.
 *
 * Spawned through `./helpers/spawn-cli` (bug-197): `spawnSync`, not `execFileSync` + `catch`, so stderr is captured on a 0-exit run too (see
 * `./directive-inventory-at-head.integration.test.ts`). `dist/` is built once by jest's `globalSetup`
 * (`bug-003`). Deterministic (REQ-SYS-07): fixed fixture text, fixed steps.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { load } from 'js-yaml';

import { git, makeTempGitRepo, removeTempDir } from '../storage/helpers/git-fixture';
import { runCliEntry, type SpawnedRun } from './helpers/spawn-cli';
import { assertPersistenceUnchanged, snapshotPersistence } from '../storage/helpers/persistence-snapshot';

const ROLES_PATH = '.wingfoil/roles.yaml';

/** A comment-free `roles.yaml` whose non-empty flow list the in-place editor cannot edit. */
const FLOW_ROLES = 'version: 1.0\n\nassignments: {developer: [code-quality]}\nglobal: ["documentation"]\n';

const CONFLICT =
  'error: roles.yaml cannot be updated in place; edit assignments.developer by hand, or pass --force to rewrite the whole file\n';
const WARNING =
  'roles.yaml was rewritten as a whole file (--force): comments are not kept, and neither are quoting, flow style, ' +
  'blank lines, line endings or number formatting (1.0 becomes 1)';
const PAYLOAD = { directives: ['testing'], role: 'developer', assignments: ['code-quality', 'testing'] };

function wingfoil(cwd: string, ...args: readonly string[]): SpawnedRun {
  return runCliEntry(cwd, args);
}

const gitOut = (repo: string, args: readonly string[]): string => git(repo, [...args]).trim();

describe('`wingfoil directive assign` — refuse the whole-file rewrite unless --force (task-169, dl-062)', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
    expect(wingfoil(repo, 'init', '--template', 'scrum').status).toBe(0);
    writeFileSync(join(repo, ROLES_PATH), FLOW_ROLES, 'utf-8');
    git(repo, ['add', ROLES_PATH]);
    git(repo, ['commit', '--quiet', '-m', 'fixture: comment-free flow-style roles.yaml']);
  });

  afterEach(() => removeTempDir(repo));

  // P3.2 "Error - roles.yaml cannot be edited in place".
  it('AC1: without --force a comment-free file the editor cannot edit is refused at exit 1; file and HEAD unchanged', () => {
    const before = gitOut(repo, ['rev-parse', 'HEAD']);
    const unchanged = snapshotPersistence(repo);
    const run = wingfoil(repo, 'directive', 'assign', '--directive', 'testing', '--role', 'developer');

    expect(run.status).toBe(1);
    expect(run.stderr).toBe(CONFLICT);
    expect(run.stdout).toBe('');
    expect(git(repo, ['status', '--porcelain'])).toBe('');
    expect(gitOut(repo, ['rev-parse', 'HEAD'])).toBe(before);
    expect(readFileSync(join(repo, ROLES_PATH), 'utf-8')).toBe(FLOW_ROLES);
    assertPersistenceUnchanged(repo, unchanged);
  });

  // P3.2 "Rewrite roles.yaml as a whole file with --force".
  it('AC2: --force exits 0 with one wf commit holding only roles.yaml, and a `warning:` line on stderr', () => {
    const before = gitOut(repo, ['rev-parse', 'HEAD']);
    const run = wingfoil(repo, 'directive', 'assign', '--directive', 'testing', '--role', 'developer', '--force');

    expect(run.status).toBe(0);
    expect(run.stderr).toBe(`warning: ${WARNING}\n`);
    expect(JSON.parse(run.stdout)).toEqual(PAYLOAD);
    expect(gitOut(repo, ['rev-list', '--count', `${before}..HEAD`])).toBe('1');
    expect(gitOut(repo, ['log', '-1', '--format=%s'])).toBe('wf(directive): assign testing to developer');
    expect(gitOut(repo, ['show', '--name-only', '--format=', 'HEAD'])).toBe(ROLES_PATH);
    expect(git(repo, ['status', '--porcelain'])).toBe('');
  });

  it('AC2: under --format json stdout parses to the payload and the warning is a JSON document on stderr', () => {
    const run = wingfoil(repo, 'directive', 'assign', '--directive', 'testing', '--role', 'developer', '--force', '--format', 'json');

    expect(run.status).toBe(0);
    expect(JSON.parse(run.stdout)).toEqual(PAYLOAD);
    expect(JSON.parse(run.stderr)).toEqual({ warning: WARNING });
  });

  it('AC2: under --format yaml stdout parses to the payload and the warning is a YAML document on stderr', () => {
    const run = wingfoil(repo, 'directive', 'assign', '--directive', 'testing', '--role', 'developer', '--force', '--format', 'yaml');

    expect(run.status).toBe(0);
    expect(load(run.stdout)).toEqual(PAYLOAD);
    expect(load(run.stderr)).toEqual({ warning: WARNING });
  });

  it('AC3 (characterization): with no roles.yaml committed the file is written unflagged and no warning is emitted', () => {
    git(repo, ['rm', '--quiet', ROLES_PATH]);
    git(repo, ['commit', '--quiet', '-m', 'fixture: no roles.yaml']);

    const run = wingfoil(repo, 'directive', 'assign', '--directive', 'testing', '--role', 'developer');

    expect(run.status).toBe(0);
    expect(run.stderr).toBe('');
    expect(readFileSync(join(repo, ROLES_PATH), 'utf-8')).toBe('version: 1\nassignments:\n  developer:\n    - testing\nglobal: []\n');
    expect(gitOut(repo, ['show', '--name-only', '--format=', 'HEAD'])).toBe(ROLES_PATH);
  });
});
