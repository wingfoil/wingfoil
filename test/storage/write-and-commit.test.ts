/**
 * task-210 — the commit primitive `writeAndCommit` and its dry-run context (`src/storage/commit.ts`,
 * `src/storage/dry-run.ts`), in-process on throwaway repositories. The CLI-level behaviour is pinned by
 * `test/cli/dry-run.integration.test.ts` and `test/cli/commit-failure-rollback.integration.test.ts`;
 * this file pins the arms those cannot reach cheaply: a deletion's plan, a created directory chain
 * removed on rollback, a filesystem failure rethrown as raised, the raw writers' dry-run guard, and the
 * three outcomes `captureDryRun` reports. Deterministic: fixed fixture text and identity.
 */
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { devNull, tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  captureDryRun,
  commitPaths,
  E_COMMIT_FAILED,
  isDryRunActive,
  removeDocument,
  StorageError,
  CommitFailure,
  commitFailureSummary,
  planDiff,
  writeAndCommit,
  writeDocument,
} from '../../src/storage';
import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from './helpers/git-fixture';
import { stopWithPlan } from '../../src/storage/dry-run';
import { assertPersistenceUnchanged, snapshotPersistence } from './helpers/persistence-snapshot';

const itOnPosix = process.platform === 'win32' ? it.skip : it;

describe('writeAndCommit', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, 'docs/kept.md', 'one\ntwo\nthree\n');
    commitAll(repo, 'seed');
  });
  afterEach(() => removeTempDir(repo));

  it('writes, deletes and commits exactly the given paths in one commit', () => {
    const sha = writeAndCommit(repo, [{ path: 'docs/new/a.md', content: 'a\n' }, { path: join(repo, 'docs/kept.md'), content: null }], 'both');
    expect(git(repo, ['rev-parse', 'HEAD']).trim()).toBe(sha);
    expect(git(repo, ['show', '--name-status', '--format=', 'HEAD']).trim().split('\n')).toEqual(['D\tdocs/kept.md', 'A\tdocs/new/a.md']);
    expect(git(repo, ['status', '--porcelain']).trim()).toBe('');
  });

  it('a dry run plans the commit — sorted paths, created and deleted files — and writes nothing', async () => {
    const before = snapshotPersistence(repo, ['docs/new/a.md', 'docs/kept.md']);
    const outcome = await captureDryRun(async () => {
      expect(isDryRunActive()).toBe(true);
      return writeAndCommit(repo, [{ path: 'docs/new/a.md', content: 'a\n' }, { path: 'docs/kept.md', content: null }], 'subject line\n\nbody');
    });
    assertPersistenceUnchanged(repo, before, 'dry run');
    expect(isDryRunActive()).toBe(false);
    expect(outcome.kind).toBe('planned');
    if (outcome.kind !== 'planned') return;
    expect(outcome.plan.subject).toBe('subject line');
    expect(outcome.plan.message).toMatch(/^subject line\n\nbody\n\nWingFoil-Version: /);
    expect(outcome.plan.paths).toEqual(['docs/kept.md', 'docs/new/a.md']);
    expect(outcome.plan.diff).toBe(
      ['--- a/docs/kept.md', '+++ /dev/null', '@@ -1,3 +0,0 @@', '-one', '-two', '-three', '--- /dev/null', '+++ b/docs/new/a.md', '@@ -0,0 +1 @@', '+a', ''].join('\n'),
    );
  });

  it('the raw writers refuse to write during a dry run, so a writer that bypasses the primitive fails', async () => {
    for (const write of [
      () => writeDocument(join(repo, 'docs/x.md'), 'x'),
      () => removeDocument(join(repo, 'docs/kept.md')),
      () => commitPaths(repo, ['docs/kept.md'], 'nope'),
    ]) {
      const outcome = await captureDryRun(async () => write());
      expect(outcome.kind).toBe('threw');
      if (outcome.kind === 'threw') expect(String(outcome.error)).toContain('must write through writeAndCommit');
    }
    expect(existsSync(join(repo, 'docs/x.md'))).toBe(false);
    expect(existsSync(join(repo, 'docs/kept.md'))).toBe(true);
  });

  it('captureDryRun reports a run that never reached a commit as what it returned', async () => {
    await expect(captureDryRun(async () => 42)).resolves.toEqual({ kind: 'returned', value: 42 });
  });

  itOnPosix('a refused commit removes the created file and the directories it created, and restores the index (bug-217)', () => {
    writeFileSync(join(repo, '.git/hooks/pre-commit'), '#!/bin/sh\necho "no" >&2\nexit 1\n');
    chmodSync(join(repo, '.git/hooks/pre-commit'), 0o755);
    writeFileSync(join(repo, 'docs/kept.md'), 'one\ntwo\nthree\nstaged\n');
    git(repo, ['add', 'docs/kept.md']);
    const before = snapshotPersistence(repo, ['docs/deep/er/b.md', 'docs/kept.md']);
    const index = git(repo, ['ls-files', '-s']);

    let thrown: unknown;
    try {
      writeAndCommit(repo, [{ path: 'docs/deep/er/b.md', content: 'b\n' }, { path: 'docs/kept.md', content: 'rewritten\n' }], 'refused');
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(StorageError);
    expect((thrown as StorageError).code).toBe(E_COMMIT_FAILED);
    expect((thrown as StorageError).message).toContain('git did not commit docs/deep/er/b.md, docs/kept.md: no — nothing was committed');
    expect((thrown as StorageError).message).not.toContain(repo);
    assertPersistenceUnchanged(repo, before, 'refused commit');
    expect(git(repo, ['ls-files', '-s'])).toBe(index);
    expect(existsSync(join(repo, 'docs/deep'))).toBe(false);
  });

  it('a commit git declines without a word on stderr is reported by its own message, the project root removed', () => {
    // Content identical to HEAD: `git commit --only` has nothing to record and says so on stdout only.
    let thrown: unknown;
    try {
      writeAndCommit(repo, [{ path: 'docs/kept.md', content: 'one\ntwo\nthree\n' }], 'nothing');
    } catch (error) {
      thrown = error;
    }
    expect((thrown as StorageError).code).toBe(E_COMMIT_FAILED);
    expect((thrown as StorageError).message).toContain('git did not commit docs/kept.md: Command failed: git -C . commit');
    expect((thrown as StorageError).message).not.toContain(repo);
    expect(git(repo, ['status', '--porcelain']).trim()).toBe('');
  });

  itOnPosix('a filesystem failure is rethrown as raised, after the paths already written are put back', () => {
    mkdirSync(join(repo, 'docs/blocked'));
    chmodSync(join(repo, 'docs/blocked'), 0o500);
    try {
      if (process.getuid?.() === 0) return; // root writes through a read-only directory
      expect(() =>
        writeAndCommit(repo, [{ path: 'docs/kept.md', content: 'changed\n' }, { path: 'docs/blocked/c.md', content: 'c\n' }], 'fs'),
      ).toThrow(/EACCES/);
      expect(readFileSync(join(repo, 'docs/kept.md'), 'utf-8')).toBe('one\ntwo\nthree\n');
      expect(git(repo, ['status', '--porcelain']).trim()).toBe('');
    } finally {
      chmodSync(join(repo, 'docs/blocked'), 0o700);
    }
  });
});

describe('writeAndCommit — review fixes (task-210 review)', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, 'docs/kept.md', 'one\ntwo\nthree\n');
    commitAll(repo, 'seed');
  });
  afterEach(() => removeTempDir(repo));

  function refuseCommits(script = 'exit 1'): void {
    writeFileSync(join(repo, '.git/hooks/pre-commit'), `#!/bin/sh\n${script}\n`);
    chmodSync(join(repo, '.git/hooks/pre-commit'), 0o755);
  }

  itOnPosix('F1: a refused multi-file write removes every directory it created, deepest first across all files', () => {
    refuseCommits();
    // The first file creates `new/` (and `new/a/b`); the second creates `new/c` inside it. Removing per
    // file in write order left `new/` behind, non-empty when the first file's chain reached it.
    expect(() => writeAndCommit(repo, [{ path: 'new/a/b/x.md', content: 'x\n' }, { path: 'new/c/y.md', content: 'y\n' }], 'refused')).toThrow(
      CommitFailure,
    );
    // `git status` does not show an empty directory: ask the filesystem.
    expect(existsSync(join(repo, 'new'))).toBe(false);
  });

  itOnPosix('F2: an index that cannot be read back after the failure is reported, the working tree restored all the same', () => {
    // The hook swaps the index for a directory: git refuses the commit, and every later index read fails.
    // Hooks run at the top of the working tree, where `.git` is the repository.
    refuseCommits('rm -f .git/index && mkdir .git/index && exit 1');
    let thrown: unknown;
    try {
      writeAndCommit(repo, [{ path: 'docs/new.md', content: 'n\n' }], 'refused');
    } catch (error) {
      thrown = error;
    }
    rmSync(join(repo, '.git/index'), { recursive: true });
    expect(thrown).toBeInstanceOf(CommitFailure);
    const failure = thrown as CommitFailure;
    expect(failure.code).toBe(E_COMMIT_FAILED);
    expect(failure.indexProblem).toBeDefined();
    expect(failure.message).toContain('nothing was committed and the working tree is as it was, but the index entries of docs/new.md could not be put back (');
    expect(failure.message).not.toContain(repo);
    expect(existsSync(join(repo, 'docs/new.md'))).toBe(false);
  });

  it('F3: the plan is the commit under the operator\'s global configuration — autocrlf normalization included, diff settings pinned', async () => {
    const globalConfig = join(repo, '.git', 'isolated-global.gitconfig');
    writeFileSync(
      globalConfig,
      '[core]\n\tautocrlf = input\n[diff]\n\tinterHunkContext = 10\n\tsuppressBlankEmpty = true\n\tcontext = 10\n\tindentHeuristic = false\n',
    );
    const env = { GIT_CONFIG_GLOBAL: globalConfig };
    const lines = Array.from({ length: 30 }, (_, index) => `line ${index + 1}`);
    writeFixtureFile(repo, 'docs/crlf.md', `${lines.join('\n')}\n`);
    commitAll(repo, 'lf document');
    const edited = [...lines];
    edited[2] = 'line 3 changed';
    edited[14] = '';
    const crlf = `${edited.join('\r\n')}\r\n`;

    const outcome = await captureDryRun(async () => writeAndCommit(repo, [{ path: 'docs/crlf.md', content: crlf }], 'crlf edit', { env }));
    expect(outcome.kind).toBe('planned');
    if (outcome.kind !== 'planned') return;
    expect(outcome.plan.diff).not.toContain('\r');
    expect(outcome.plan.diff.split('\n').filter((line) => line.startsWith('@@'))).toEqual(['@@ -1,6 +1,6 @@', '@@ -12,7 +12,7 @@ line 11']);

    writeAndCommit(repo, [{ path: 'docs/crlf.md', content: crlf }], 'crlf edit', { env });
    const shown = execFileSync('git', ['-C', repo, 'show', '--format=', '--no-color', 'HEAD'], {
      encoding: 'utf-8',
      env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: devNull },
    });
    const hunks = (diff: string): string[] => diff.slice(diff.indexOf('@@')).split('\n');
    expect(hunks(outcome.plan.diff)).toEqual(hunks(shown));
  });

  it('F3: a write git would store as the blob HEAD holds plans an empty diff', async () => {
    const outcome = await captureDryRun(async () => writeAndCommit(repo, [{ path: 'docs/kept.md', content: 'one\ntwo\nthree\n' }], 'same'));
    expect(outcome.kind === 'planned' && outcome.plan.diff).toBe('');
  });

  itOnPosix('a root reached through a symbolic link longer than the real path: neither spelling reaches the message', () => {
    refuseCommits('echo "refused in $(pwd)" >&2; exit 1');
    const link = join(tmpdir(), `wf-storage-a-much-longer-link-name-than-the-real-directory-${process.pid}`);
    symlinkSync(repo, link);
    try {
      let thrown: unknown;
      try {
        writeAndCommit(link, [{ path: 'docs/linked.md', content: 'l\n' }], 'refused');
      } catch (error) {
        thrown = error;
      }
      const message = (thrown as CommitFailure).message;
      expect(message).toContain('git did not commit docs/linked.md: refused in .');
      expect(message).not.toContain(link);
      expect(message).not.toContain(realpathSync(repo));
    } finally {
      unlinkSync(link);
    }
  });

  it('a dry run keeps the first commit it reaches, even when the operation goes on to another', async () => {
    const outcome = await captureDryRun(async () => {
      try {
        writeAndCommit(repo, [{ path: 'docs/first.md', content: '1\n' }], 'first');
      } catch {
        // An operation that swallowed the stop and went on.
      }
      return writeAndCommit(repo, [{ path: 'docs/second.md', content: '2\n' }], 'second');
    });
    expect(outcome.kind === 'planned' && outcome.plan.subject).toBe('first');
  });

  it('commitFailureSummary quotes a CommitFailure without its "as it was" clause, and anything else as String does', () => {
    expect(commitFailureSummary(new CommitFailure(repo, ['a.md'], `no in ${repo}`, undefined))).toBe('E_COMMIT_FAILED: git did not commit a.md: no in .');
    expect(commitFailureSummary(new CommitFailure(repo, ['a.md'], 'no', 'locked'))).toBe(
      'E_COMMIT_FAILED: git did not commit a.md: no (the index entries could not be put back: locked)',
    );
    expect(commitFailureSummary(new Error('plain'))).toBe('Error: plain');
  });

  it('F4: the warnings handed to the primitive reach the dry run\'s outcome', async () => {
    const outcome = await captureDryRun(async () => writeAndCommit(repo, [{ path: 'docs/w.md', content: 'w\n' }], 'warned', { warnings: ['careful'] }));
    expect(outcome.kind === 'planned' && outcome.warnings).toEqual(['careful']);
  });
});

describe('planDiff', () => {
  let repo: string;
  beforeEach(() => {
    repo = makeTempGitRepo();
  });
  afterEach(() => removeTempDir(repo));

  it('fails loudly, as E_GIT_READ_FAILED, when git cannot be run', () => {
    expect(() => planDiff(repo, 'x.md', 'b\n', { ...process.env, PATH: '' })).toThrow(/E_GIT_READ_FAILED: git for the dry run of x.md failed/);
  });

  it('fails loudly with git\'s own words when git runs but errors', () => {
    expect(() => planDiff(repo, 'x.md', 'b\n', { ...process.env, GIT_CONFIG_PARAMETERS: 'bogus' })).toThrow(
      /E_GIT_READ_FAILED: git for the dry run of x.md failed: .*GIT_CONFIG_PARAMETERS/,
    );
  });

  it('stopWithPlan outside a dry run is a programming error', () => {
    expect(() => stopWithPlan({ dryRun: true, subject: 's', message: 's', paths: [], diff: '' })).toThrow('stopWithPlan called outside a dry run');
  });

  it('a new empty file plans its headers and no hunk', () => {
    expect(planDiff(repo, 'empty.md', '')).toBe('--- /dev/null\n+++ b/empty.md\n');
  });

  it('marks a missing final newline the way git does, on a repository with no commit yet', () => {
    expect(planDiff(repo, 'x.md', 'b')).toBe(['--- /dev/null', '+++ b/x.md', '@@ -0,0 +1 @@', '+b', '\\ No newline at end of file', ''].join('\n'));
  });
});
