/**
 * task-091-reads-resolve-at-head / `bug-081-memory-yaml-read-from-worktree-fabricates-states` +
 * `bug-082-directive-assign-validates-role-against-worktree`, AC1/AC3/AC4 — both defects and their
 * fixes end to end through the REAL compiled `dist/cli.js`, in a REAL `wingfoil init`-ed throwaway
 * project.
 *
 * Both bugs were found by using the v0.2 verbs on a project other than this one, and neither could
 * have been found here: `bug-075` means the verbs cannot be pointed at WingFoil's own Memory. The
 * in-process suites (`test/core/memory-machine-baseline.test.ts`,
 * `test/core/directive-assign-role-baseline.test.ts`) pin the behaviour at the `CoreFn` seam; this
 * one pins the two things only the process boundary shows:
 *
 * - the **exit code** a script keys on — `1`, a well-formed invocation failing a repository-state
 *   precondition, never `2` (`spec-005-cli-command-contract` § "1. Exit-code contract (REQ-INT-04)";
 *   ruled on `bug-076`, restated by this task's AC3), and
 * - the **stderr text** a human reads, in spec-005 §3's `error: <reason>` envelope.
 *
 * It also pins the AC4 fact the whole fail-closed decision rests on: `wingfoil init` commits
 * `.wingfoil/memory.yaml` in its scaffold commit, so `HEAD` carries a machine from a project's very
 * first commit onwards.
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

const MEMORY_PATH = '.wingfoil/memory.yaml';
const DNA_PATH = '.wingfoil/dna.yaml';
const ROLES_PATH = '.wingfoil/roles.yaml';

/** Spawn the real published entry point; captures stderr on EVERY run, including a 0-exit one. */
function wingfoil(cwd: string, ...args: readonly string[]): SpawnedRun {
  return runCliEntry(cwd, args);
}

const gitOut = (repo: string, args: readonly string[]): string => git(repo, [...args]).trim();

/** The `bug-081` edit, applied to the scaffolded machine in the WORKING TREE only. */
function fabricateMachineInWorkingTree(repo: string): void {
  const path = join(repo, MEMORY_PATH);
  const scaffolded = readFileSync(path, 'utf-8');
  expect(scaffolded).toContain('sequence: [ draft, pending, approved ]');
  writeFileSync(
    path,
    scaffolded
      .replace('sequence: [ draft, pending, approved ]', 'sequence: [ draft, FABRICATED-BY-SUBMIT, approved ]')
      .replace('pending: { reject: draft }', 'FABRICATED-BY-SUBMIT: { reject: draft }'),
    'utf-8',
  );
}

describe('the CLI resolves gating reads at HEAD (bug-081, bug-082)', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
    expect(wingfoil(repo, 'init', '--template', 'scrum').status).toBe(0);
  });

  afterEach(() => removeTempDir(repo));

  // AC4's load-bearing fact, measured rather than assumed (the task's design § D4 rests on it).
  it('AC4: `wingfoil init` commits the machine, so HEAD carries a `memory.yaml` from the first commit', () => {
    expect(gitOut(repo, ['show', '--name-only', '--format=', 'HEAD'])).toContain(MEMORY_PATH);
    expect(gitOut(repo, ['show', `HEAD:${MEMORY_PATH}`])).toContain('sequence: [ draft, pending, approved ]');
    expect(gitOut(repo, ['status', '--porcelain'])).toBe('');
  });

  // AC1's bug-081 reproduction, as a test: the uncommitted machine no longer decides the target.
  it('AC1/AC6: an uncommitted machine cannot make `memory submit` write a state no commit defines', () => {
    expect(wingfoil(repo, 'memory', 'add', '--type', 'adr', '--title', 'Probe').status).toBe(0);
    fabricateMachineInWorkingTree(repo);
    expect(gitOut(repo, ['status', '--porcelain'])).toBe(`M ${MEMORY_PATH}`);

    const run = wingfoil(repo, 'memory', 'submit', 'adr-001-probe');

    expect([run.status, run.stderr]).toEqual([0, '']);
    expect(run.stdout).toContain('"to": "pending"');
    expect(run.stdout).not.toContain('FABRICATED-BY-SUBMIT');
    // …and the element is NOT stranded: the committed document is in a state the committed machine
    // knows, so restoring the working tree leaves it movable (bug-081's second half).
    git(repo, ['checkout', '--', MEMORY_PATH]);
    expect(gitOut(repo, ['show', 'HEAD:docs/memory/adr/adr-001-probe.md'])).toContain('status: pending');
    expect(wingfoil(repo, 'memory', 'deprecate', 'adr-001-probe', '--reason', 'done with it').status).toBe(0);
  });

  it('AC3: with no committed `memory.yaml`, `memory submit` fails closed — exit 1, `error:` on stderr', () => {
    expect(wingfoil(repo, 'memory', 'add', '--type', 'adr', '--title', 'Probe').status).toBe(0);
    git(repo, ['rm', '--cached', '--quiet', '--', MEMORY_PATH]);
    git(repo, ['commit', '--quiet', '-m', 'untrack the machine, keep it on disk']);
    const before = gitOut(repo, ['rev-parse', 'HEAD']);
    const unchanged = snapshotPersistence(repo);

    const run = wingfoil(repo, 'memory', 'submit', 'adr-001-probe');

    expect(run.status).toBe(1);
    expect(run.stderr).toMatch(/^error: /);
    expect(run.stderr).toContain(MEMORY_PATH);
    expect(run.stdout).toBe('');
    expect(gitOut(repo, ['rev-parse', 'HEAD'])).toBe(before);
    assertPersistenceUnchanged(repo, unchanged);
  });

  // AC1's bug-082 reproduction, as a test.
  it('AC1/AC3/AC6: `directive assign` refuses an uncommitted role — exit 1, no commit, roles.yaml unchanged', () => {
    const dna = join(repo, DNA_PATH);
    writeFileSync(dna, readFileSync(dna, 'utf-8').replace('  roles:\n', '  roles:\n    - name: FABRICATED-ROLE\n'), 'utf-8');
    expect(gitOut(repo, ['status', '--porcelain'])).toBe(`M ${DNA_PATH}`);
    const before = gitOut(repo, ['rev-parse', 'HEAD']);
    const unchanged = snapshotPersistence(repo);

    const run = wingfoil(repo, 'directive', 'assign', '--directive', 'determinism', '--role', 'FABRICATED-ROLE');

    expect(run.status).toBe(1);
    expect(run.stderr).toMatch(/^error: unknown role 'FABRICATED-ROLE' \(not defined in dna\.yaml\)/);
    expect(run.stderr).toContain(DNA_PATH);
    expect(gitOut(repo, ['rev-parse', 'HEAD'])).toBe(before);
    expect(gitOut(repo, ['show', `HEAD:${ROLES_PATH}`])).not.toContain('FABRICATED-ROLE');
    assertPersistenceUnchanged(repo, unchanged);
  });

  // AC4 — the flow `dl-080` knowingly costs one extra step: edit, commit, then assign.
  it('AC4: committing the extended catalogue is what makes the assignment legal', () => {
    const dna = join(repo, DNA_PATH);
    writeFileSync(dna, readFileSync(dna, 'utf-8').replace('  roles:\n', '  roles:\n    - name: FABRICATED-ROLE\n'), 'utf-8');
    git(repo, ['add', '--', DNA_PATH]);
    git(repo, ['commit', '--quiet', '-m', 'chore: extend the role catalogue']);

    const run = wingfoil(repo, 'directive', 'assign', '--directive', 'determinism', '--role', 'FABRICATED-ROLE');

    expect([run.status, run.stderr]).toEqual([0, '']);
    expect(gitOut(repo, ['show', `HEAD:${ROLES_PATH}`])).toContain('FABRICATED-ROLE');
    expect(gitOut(repo, ['show', `HEAD:${DNA_PATH}`])).toContain('FABRICATED-ROLE');
  });
});
