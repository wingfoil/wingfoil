/**
 * task-295, red after review (approver ruling A (a), 2026-10-26; `spec-008` §2 `--dry-run`) — a dry run in the
 * DEFAULT console format (no `--format`) of `workflow rekey`, `workflow adopt` (task-294) and `workflow finalize`
 * (released in 0.3.0), on the compiled CLI. Today each hands the dry-run plan to its console renderer and exits 1
 * with `error: Cannot read properties of undefined (reading 'workflow')`.
 *
 * Pinned: exit 0, empty stderr, and stdout printed the way the console dry runs of `workflow start` and
 * `workflow create` print a plan today. That is the plan as two-space-indented JSON plus a newline, the same object
 * `--format json` prints: `dryRun: true`, the subject, `paths: []`, `diff: ''`. Nothing is written. The `start`
 * case is the characterization reference for that shape and passes today.
 *
 * Fixture: `test/core/helpers/rekey-fixture` with a second instance `life-2-plan`, which no adoption names. Every
 * run has `GIT_AUTHOR_*` / `GIT_COMMITTER_*` naming Morgan, the approver.
 */
import { removeTempDir } from '../storage/helpers/git-fixture';
import { assertPersistenceUnchanged, snapshotPersistence } from '../storage/helpers/persistence-snapshot';
import { buildRekeyRepo, MORGAN } from '../core/helpers/rekey-fixture';
import { CLI_ENTRY, spawnCapture, type SpawnedRun } from './helpers/spawn-cli';

const MORGAN_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: MORGAN.name,
  GIT_AUTHOR_EMAIL: MORGAN.email,
  GIT_COMMITTER_NAME: MORGAN.name,
  GIT_COMMITTER_EMAIL: MORGAN.email,
};

function cli(repo: string, args: readonly string[]): SpawnedRun {
  return spawnCapture('node', [CLI_ENTRY, ...args], { cwd: repo, env: MORGAN_ENV });
}

interface Plan {
  readonly dryRun: boolean;
  readonly subject: string;
  readonly message: string;
  readonly paths: readonly string[];
  readonly diff: string;
}

/**
 * Run `args --dry-run` twice: once with `--format json` (the precondition: the command is not refused) and once in
 * the console format. Answer the console run and the JSON plan; assert that nothing was written by either run.
 */
function dryRuns(repo: string, args: readonly string[]): { consoleRun: SpawnedRun; json: Plan } {
  const unchanged = snapshotPersistence(repo);
  const json = cli(repo, [...args, '--dry-run', '--format', 'json']);
  expect([json.status, json.stderr]).toEqual([0, '']);
  const consoleRun = cli(repo, [...args, '--dry-run']);
  assertPersistenceUnchanged(repo, unchanged);
  return { consoleRun, json: JSON.parse(json.stdout) as Plan };
}

/** The console shape `workflow start` / `create` give a plan: exit 0, no stderr, the JSON plan indented by two. */
function expectConsolePlan(run: SpawnedRun, json: Plan, subject: string, emptyCommit: boolean): void {
  expect([run.status, run.stderr]).toEqual([0, '']);
  const printed = JSON.parse(run.stdout) as Plan;
  expect(run.stdout).toBe(`${JSON.stringify(printed, null, 2)}\n`);
  expect(printed).toEqual(json);
  expect(printed.dryRun).toBe(true);
  expect(printed.subject).toBe(subject);
  if (emptyCommit) expect(printed).toMatchObject({ paths: [], diff: '' });
}

describe('task-295 A (a) — a console dry run prints the plan as workflow start and create do (exit 0, nothing written)', () => {
  let repo: string;
  beforeEach(async () => {
    repo = await buildRekeyRepo({ secondInstance: true });
  });
  afterEach(() => removeTempDir(repo));

  it('characterization: workflow start --dry-run prints the plan as indented JSON (the reference shape)', () => {
    const { consoleRun, json } = dryRuns(repo, ['workflow', 'start', 'life']);
    expectConsolePlan(consoleRun, json, json.subject, false);
    expect(json.subject.startsWith('wf(plan): add life-')).toBe(true);
  });

  it('workflow rekey --dry-run (console): exit 0, the plan — subject, paths [], empty diff', () => {
    const { consoleRun, json } = dryRuns(repo, ['workflow', 'rekey', 'life-1-plan', '--from', 'life.seed', '--to', 'life.seed-line', '--reason', 'phase renamed']);
    expectConsolePlan(consoleRun, json, 'workflow: rekey life-1-plan life.seed life.seed-line', true);
  });

  it('workflow adopt --dry-run (console): exit 0, the plan — subject, paths [], empty diff', () => {
    const { consoleRun, json } = dryRuns(repo, ['workflow', 'adopt', 'life-2-plan', '--step', 'life.seed-line', '--element', 'release-line:rl-v1', '--reason', 'created by hand']);
    expectConsolePlan(consoleRun, json, 'workflow: adopt life-2-plan life.seed-line release-line:rl-v1', true);
  });

  it('workflow finalize --dry-run (console): exit 0, the plan — subject, paths [], empty diff', () => {
    const { consoleRun, json } = dryRuns(repo, ['workflow', 'finalize', 'life-2-plan']);
    expectConsolePlan(consoleRun, json, 'workflow: finalize life-2-plan life.seed-line', true);
  });
});
