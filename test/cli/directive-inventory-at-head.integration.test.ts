/**
 * task-096-directive-inventory-resolves-at-head / `bug-086-directive-inventory-read-from-the-worktree`
 * — both halves end to end through the REAL compiled `dist/cli.js`, in a REAL `wingfoil init`-ed
 * throwaway project.
 *
 * `bug-086` was found by using the v0.2 verbs on a project other than this one and could not have been
 * found here (`bug-075`: the verbs cannot be pointed at WingFoil's own Memory). The in-process suite
 * `test/core/directive-inventory-baseline.test.ts` pins the behaviour at the `CoreFn` seam; this one
 * pins the two things only the process boundary shows:
 *
 * - the **exit code** a script keys on — `1`, a well-formed invocation failing a repository-state
 *   precondition, never `2` (`spec-005-cli-command-contract` § "1. Exit-code contract (REQ-INT-04)";
 *   ruled on `bug-076`, restated by this task's AC3), and
 * - the **stderr text** a human reads, in spec-005 §3's `error: <reason>` envelope.
 *
 * It also pins the fact the whole committed-inventory baseline rests on, measured rather than assumed:
 * `wingfoil init` commits the entire `.wingfoil/directives/` tree AND `roles.yaml` in its scaffold
 * commit, so from a project's very first commit onwards both reads have something to resolve against.
 *
 * Spawned through `./helpers/spawn-cli` (bug-197), which throws on a signal rather than reading it as an
 * exit, and uses `spawnSync`, not `execFileSync` + `catch`: the latter surfaces `stderr` only on the error path, so
 * a command that exits `0` while printing to fd 2 reads back as `stderr: ''` — a false green that cost
 * `task-086` a rewrite of this same helper shape. Do not "simplify" it back.
 *
 * `dist/` is built once by jest's `globalSetup` (`bug-003-cli-integration-dist-race`) — never rebuilt
 * here. Deterministic (REQ-SYS-07): fixed step list, fixed identity, fixed fixture text.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { git, makeTempGitRepo, removeTempDir } from '../storage/helpers/git-fixture';
import { runCliEntry, type SpawnedRun } from './helpers/spawn-cli';
import { assertPersistenceUnchanged, snapshotPersistence } from '../storage/helpers/persistence-snapshot';

const ROLES_PATH = '.wingfoil/roles.yaml';
const GHOST_PATH = '.wingfoil/directives/custom/ghost.md';
const DETERMINISM_PATH = '.wingfoil/directives/custom/determinism.md';

/** Spawn the real published entry point; captures stderr on EVERY run, including a 0-exit one. */
function wingfoil(cwd: string, ...args: readonly string[]): SpawnedRun {
  return runCliEntry(cwd, args);
}

const gitOut = (repo: string, args: readonly string[]): string => git(repo, [...args]).trim();

describe('the CLI resolves the directive inventory and its references at HEAD (bug-086)', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
    expect(wingfoil(repo, 'init', '--template', 'scrum').status).toBe(0);
  });

  afterEach(() => removeTempDir(repo));

  it('`init` commits the whole directives tree and roles.yaml, so both baselines exist from commit one', () => {
    const tracked = gitOut(repo, ['ls-tree', '-r', '--name-only', 'HEAD', '--', '.wingfoil/directives']).split('\n');

    expect(tracked.length).toBeGreaterThan(0);
    expect(tracked).toContain(DETERMINISM_PATH);
    expect(gitOut(repo, ['cat-file', '-t', `HEAD:${ROLES_PATH}`])).toBe('blob');
    expect(gitOut(repo, ['status', '--porcelain'])).toBe('');
  });

  it('assign: an untracked directive file is refused at exit 1, and nothing is committed', () => {
    writeFileSync(
      join(repo, GHOST_PATH),
      '---\nid: ghost\nname: ghost\ntype: directive\nkind: custom\ntitle: "Ghost"\n---\n\n# Ghost\n',
      'utf-8',
    );
    const before = gitOut(repo, ['rev-parse', 'HEAD']);
    const unchanged = snapshotPersistence(repo);

    const run = wingfoil(repo, 'directive', 'assign', '--directive', 'ghost', '--role', 'developer');

    expect(run.status).toBe(1);
    expect(run.stderr.trim()).toBe('error: unknown directive: ghost');
    expect(gitOut(repo, ['rev-parse', 'HEAD'])).toBe(before);
    expect(gitOut(repo, ['show', `HEAD:${ROLES_PATH}`])).not.toContain('ghost');
    assertPersistenceUnchanged(repo, unchanged);
  });

  it('assign: committing the directive first makes the very same command succeed', () => {
    writeFileSync(
      join(repo, GHOST_PATH),
      '---\nid: ghost\nname: ghost\ntype: directive\nkind: custom\ntitle: "Ghost"\n---\n\n# Ghost\n',
      'utf-8',
    );
    git(repo, ['add', '--', GHOST_PATH]);
    git(repo, ['commit', '--quiet', '-m', 'chore: add the ghost directive']);

    const run = wingfoil(repo, 'directive', 'assign', '--directive', 'ghost', '--role', 'developer');

    expect(run.status).toBe(0);
    expect(gitOut(repo, ['show', `HEAD:${ROLES_PATH}`])).toContain('ghost');
    expect(gitOut(repo, ['cat-file', '-t', `HEAD:${GHOST_PATH}`])).toBe('blob');
  });

  it('remove: an uncommitted unbinding does not permit deleting a still-referenced asset', () => {
    const roles = readFileSync(join(repo, ROLES_PATH), 'utf-8');
    expect(roles).toContain('- determinism');
    writeFileSync(
      join(repo, ROLES_PATH),
      roles
        .split('\n')
        .filter((line) => line.trim() !== '- determinism')
        .join('\n'),
      'utf-8',
    );
    const before = gitOut(repo, ['rev-parse', 'HEAD']);
    const unchanged = snapshotPersistence(repo);

    const run = wingfoil(repo, 'directive', 'remove', 'determinism');

    expect(run.status).toBe(1);
    expect(run.stderr.trim()).toBe("error: cannot remove 'determinism': still assigned to role 'architect'");
    expect(existsSync(join(repo, DETERMINISM_PATH))).toBe(true);
    expect(gitOut(repo, ['rev-parse', 'HEAD'])).toBe(before);
    // The committed record still binds it — the invariant REQ-SEC-07 (b) exists to keep.
    expect(gitOut(repo, ['show', `HEAD:${ROLES_PATH}`])).toContain('- determinism');
    assertPersistenceUnchanged(repo, unchanged);
  });

  it('remove: committing the unbinding first makes the very same command succeed', () => {
    const roles = readFileSync(join(repo, ROLES_PATH), 'utf-8');
    writeFileSync(
      join(repo, ROLES_PATH),
      roles
        .split('\n')
        .filter((line) => line.trim() !== '- determinism')
        .join('\n'),
      'utf-8',
    );
    git(repo, ['add', '--', ROLES_PATH]);
    git(repo, ['commit', '--quiet', '-m', 'chore: unbind determinism']);

    const run = wingfoil(repo, 'directive', 'remove', 'determinism');

    expect(run.status).toBe(0);
    expect(existsSync(join(repo, DETERMINISM_PATH))).toBe(false);
    expect(gitOut(repo, ['show', '--name-only', '--format=', 'HEAD'])).toBe(DETERMINISM_PATH);
  });
});
