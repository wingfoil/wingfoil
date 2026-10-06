/**
 * task-210 — the commit primitive `writeAndCommit` and its dry-run context (`src/storage/commit.ts`,
 * `src/storage/dry-run.ts`), in-process on throwaway repositories. The CLI-level behaviour is pinned by
 * `test/cli/dry-run.integration.test.ts` and `test/cli/commit-failure-rollback.integration.test.ts`;
 * this file pins the arms those cannot reach cheaply: a deletion's plan, a created directory chain
 * removed on rollback, a filesystem failure rethrown as raised, the raw writers' dry-run guard, and the
 * three outcomes `captureDryRun` reports. Deterministic: fixed fixture text and identity.
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  captureDryRun,
  commitPaths,
  E_COMMIT_FAILED,
  isDryRunActive,
  removeDocument,
  StorageError,
  unifiedDiff,
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

describe('unifiedDiff', () => {
  it('is empty when nothing changes', () => {
    expect(unifiedDiff('x.md', 'same\n', 'same\n')).toBe('');
  });

  it('fails loudly, as E_GIT_READ_FAILED, when git cannot produce the diff', () => {
    expect(() => unifiedDiff('x.md', 'a\n', 'b\n', { PATH: '' })).toThrow(/E_GIT_READ_FAILED: git diff for the dry run of x.md failed/);
  });

  it('fails loudly with git\'s own words when git runs but errors', () => {
    expect(() => unifiedDiff('x.md', 'a\n', 'b\n', { GIT_CONFIG_PARAMETERS: 'bogus' })).toThrow(/E_GIT_READ_FAILED: git diff for the dry run of x.md failed: .*GIT_CONFIG_PARAMETERS/);
  });

  it('stopWithPlan outside a dry run is a programming error', () => {
    expect(() => stopWithPlan({ dryRun: true, subject: 's', message: 's', paths: [], diff: '' })).toThrow('stopWithPlan called outside a dry run');
  });

  it('marks a missing final newline the way git does', () => {
    expect(unifiedDiff('x.md', 'a', 'b')).toBe(['--- a/x.md', '+++ b/x.md', '@@ -1 +1 @@', '-a', '\\ No newline at end of file', '+b', '\\ No newline at end of file', ''].join('\n'));
  });
});
