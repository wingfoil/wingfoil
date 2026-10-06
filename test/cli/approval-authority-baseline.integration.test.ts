/**
 * task-090-fix-approval-authority-baseline / `bug-079-uncommitted-dna-yaml-grants-approval-authority`,
 * AC1/AC3/AC4 — the defect and its refusal end to end through the REAL compiled `dist/cli.js`, in a
 * REAL `wingfoil init`-ed throwaway project.
 *
 * `bug-079` was found by using the v0.2 verbs on a project other than this one, and it could not have
 * been found here: `bug-075` means the verbs cannot be pointed at WingFoil's own Memory, so every
 * transition in this repository is hand-made and this authority read has never run against its
 * documents. The in-process suite (`test/core/approval-authority-baseline.test.ts`) pins the
 * behaviour at the `CoreFn` seam; this one pins the two things only the process boundary shows:
 *
 * - the **exit code** a script keys on — `1`, a well-formed invocation failing a repository-state
 *   precondition, never `2` (`spec-005-cli-command-contract` § "1. Exit-code contract (REQ-INT-04)";
 *   ruled on `bug-076` and restated by this task's AC3), and
 * - the **stderr text** a human reads, in spec-005 §3's `error: <reason>` envelope.
 *
 * Spawned through `./helpers/spawn-cli` (bug-197), which throws on a signal rather than reading it as an
 * exit, and uses `spawnSync`, not `execFileSync` + `catch`: the latter surfaces `stderr` only on the error path, so
 * a command that exits `0` while printing to fd 2 reads back as `stderr: ''` — a false green that
 * cost `task-086` a rewrite of this same helper shape. Do not "simplify" it back.
 *
 * `dist/` is built once by jest's `globalSetup` (`bug-003-cli-integration-dist-race`) — never rebuilt
 * here. Deterministic (REQ-SYS-07): fixed step list, fixed identity, fixed fixture text.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { git, makeTempGitRepo, removeTempDir } from '../storage/helpers/git-fixture';
import { runCliEntry, type SpawnedRun } from './helpers/spawn-cli';
import { assertPersistenceUnchanged, snapshotPersistence } from '../storage/helpers/persistence-snapshot';

const DNA_PATH = '.wingfoil/dna.yaml';

/** Spawn the real published entry point; captures stderr on EVERY run, including a 0-exit one. */
function wingfoil(cwd: string, ...args: readonly string[]): SpawnedRun {
  return runCliEntry(cwd, args);
}

const gitOut = (repo: string, args: readonly string[]): string => git(repo, [...args]).trim();

/** The scaffold's `members: []` replaced by the fixture's git identity, holding `approver`. */
function grantApproverInWorkingTree(repo: string): void {
  const dna = join(repo, DNA_PATH);
  const scaffolded = readFileSync(dna, 'utf-8');
  expect(scaffolded).toContain('  members: []');
  writeFileSync(
    dna,
    scaffolded.replace(
      '  members: []',
      '  members:\n    - name: WingFoil Test\n      email: wf-test@example.invalid\n      roles: [developer, approver]',
    ),
    'utf-8',
  );
}

describe('memory approve through the real CLI — an uncommitted `dna.yaml` grants nothing (bug-079)', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
    expect(wingfoil(repo, 'init', '--template', 'scrum').status).toBe(0);
    expect(wingfoil(repo, 'memory', 'add', '--type', 'adr', '--title', 'Repro target').status).toBe(0);
    expect(wingfoil(repo, 'memory', 'submit', 'adr-001-repro-target').status).toBe(0);
    expect(gitOut(repo, ['status', '--porcelain'])).toBe('');
  });

  afterEach(() => removeTempDir(repo));

  // AC1's reproduction, as a test (AC3/AC6) — red-first: today this exits 0 and writes the commit.
  it('AC1/AC3: the AC1 reproduction now fails closed — exit 1, `error:` on stderr, no new commit', () => {
    grantApproverInWorkingTree(repo);
    expect(gitOut(repo, ['status', '--porcelain'])).toBe(`M ${DNA_PATH}`);
    const before = gitOut(repo, ['rev-parse', 'HEAD']);
    const unchanged = snapshotPersistence(repo);

    const run = wingfoil(repo, 'memory', 'approve', 'adr-001-repro-target', '--reason', 'authority from an uncommitted file');

    expect(run.status).toBe(1);
    expect(run.stderr).toMatch(/^error: user not authorized to approve type 'adr'/);
    expect(run.stderr).toContain(DNA_PATH);
    expect(run.stdout).toBe('');

    // Nothing happened: no commit, and the committed record still shows nobody is an approver.
    expect(gitOut(repo, ['rev-parse', 'HEAD'])).toBe(before);
    expect(gitOut(repo, ['show', `HEAD:${DNA_PATH}`])).toContain('members: []');
    assertPersistenceUnchanged(repo, unchanged);
  });

  // AC4 — the bootstrap flow every new user hits, driven the way a user drives it.
  it('AC4: committing the seeded `dna.yaml` is what grants the authority — the same command then succeeds', () => {
    grantApproverInWorkingTree(repo);
    git(repo, ['add', '--', DNA_PATH]);
    git(repo, ['commit', '--quiet', '-m', 'chore: seed the first approver']);

    const run = wingfoil(repo, 'memory', 'approve', 'adr-001-repro-target', '--reason', 'seeded and committed');

    expect([run.status, run.stderr]).toEqual([0, '']);
    // The approval commit carries the `Approver:` line, and the `dna.yaml` committed AT that commit
    // is what supports it — the corroboration a fresh clone can re-derive (adr-006).
    const message = gitOut(repo, ['log', '-1', '--format=%B']);
    expect(message).toContain('Approver: WingFoil Test <wf-test@example.invalid> (approver)');
    expect(gitOut(repo, ['show', `HEAD:${DNA_PATH}`])).toContain('roles: [developer, approver]');
  });
});
