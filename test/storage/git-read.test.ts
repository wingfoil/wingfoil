/**
 * `runGitRead` / `runGitReadBytes` (`src/storage/git-read.ts`, `task-142`) — the one helper every
 * Memory git read goes through. Its contract: stdout returned, stderr captured (never inherited) and
 * carried inside the error, an exit status outside `accepted` thrown as `E_GIT_READ_FAILED`, a spawn
 * failure likewise. Throwaway temp repositories throughout.
 */
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { E_GIT_READ_FAILED, runGitRead, runGitReadBytes, StorageError } from '../../src/storage';
import {
  commitAll,
  makeBoundedOutsideDir,
  makeTempGitRepo,
  removeTempDir,
  withGitCeiling,
  writeFixtureFile,
} from './helpers/git-fixture';

describe('runGitRead / runGitReadBytes (task-142)', () => {
  const dirs: string[] = [];
  afterEach(() => {
    while (dirs.length > 0) removeTempDir(dirs.pop() as string);
  });
  const repo = (): string => {
    const dir = makeTempGitRepo();
    dirs.push(dir);
    writeFixtureFile(dir, 'a.md', 'a\n');
    commitAll(dir, 'one');
    return dir;
  };

  it('returns status 0, stdout and an empty stderr on success, as text and as bytes', () => {
    const dir = repo();

    expect(runGitRead(dir, ['show', 'HEAD:a.md'])).toEqual({ status: 0, stdout: 'a\n', stderr: '' });
    const bytes = runGitReadBytes(dir, ['cat-file', '--batch'], { input: 'HEAD:a.md\n' });
    expect([bytes.status, bytes.stdout.toString('utf-8').endsWith('a\n\n'), bytes.stderr]).toEqual([0, true, '']);
  });

  it('hands an accepted non-zero status back with git\'s stderr, for the caller to interpret', () => {
    const dir = repo();

    const run = runGitRead(dir, ['show', 'HEAD:absent.md'], { accepted: [0, 128] });

    expect(run.status).toBe(128);
    expect(run.stderr).toMatch(/absent\.md/);
  });

  it.each([
    ['runGitRead', runGitRead],
    ['runGitReadBytes', runGitReadBytes],
  ] as const)('%s throws E_GIT_READ_FAILED carrying git\'s message for a status it was not told to accept', (_name, read) => {
    // task-350 AC 3 (bug-453): a directory outside any repository below a ceiling that is one.
    const { dir: notARepo, ceiling } = makeBoundedOutsideDir();
    dirs.push(ceiling);

    let thrown: unknown;
    try {
      withGitCeiling(ceiling, () => read(notARepo, ['log']));
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(StorageError);
    expect((thrown as StorageError).code).toBe(E_GIT_READ_FAILED);
    expect((thrown as StorageError).message).toMatch(/git log failed in .*not a git repository/s);
  });

  it('merges options.env over process.env for the child', () => {
    const dir = repo();

    const run = runGitRead(dir, ['var', 'GIT_AUTHOR_IDENT'], { env: { GIT_AUTHOR_NAME: 'Env Override', GIT_AUTHOR_EMAIL: 'env@example.invalid' } });

    expect(run.stdout).toMatch(/^Env Override <env@example\.invalid>/);
  });

  it('a git that cannot be spawned is E_GIT_READ_FAILED naming the spawn error', () => {
    const dir = repo();
    const saved = process.env.PATH;
    process.env.PATH = join(tmpdir(), 'wf-no-such-dir-on-path');
    try {
      expect(() => runGitRead(dir, ['status'])).toThrow(/E_GIT_READ_FAILED: git status failed in .*ENOENT/);
      expect(() => runGitReadBytes(dir, ['status'])).toThrow(/E_GIT_READ_FAILED: git status failed in .*ENOENT/);
    } finally {
      process.env.PATH = saved;
    }
  });
});
