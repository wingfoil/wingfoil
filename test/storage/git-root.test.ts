/**
 * task-003-git-backed-sot — git-root detection (spec-011-storage-layout, "Git-root detection
 * algorithm"). WingFoil must be invoked at the exact git root: `findGitRoot` walks up looking only
 * for `.git`, and `resolveProjectRoot` layers the "must be cwd itself" rule on top.
 *
 * task-350 (`dl-198` (a), `bug-406`, `bug-453`; `spec-011` amended at its design gate):
 * - AC 3 — the walk takes a test-only `{ ceiling }` and never examines the ceiling or anything above it;
 *   every "outside any repository" case here is `makeBoundedOutsideDir`'s `dir`, bounded at a ceiling
 *   that is itself a real repository, so the result no longer depends on what lies above the system
 *   temporary directory;
 * - AC 1 — `resolveProjectRoot(cwd, { project })`: the named root, resolved against `cwd`, must hold its
 *   own `.git` entry (no walk); anything else is `E_NOT_AT_GIT_ROOT: --project is not a git root: <abs>`.
 */
import { mkdirSync, mkdtempSync } from 'fs';
import { basename, dirname, join } from 'path';

import { StorageError } from '../../src/storage/errors';
import { findGitRoot, resolveProjectRoot } from '../../src/storage/git-root';
import {
  commitAll,
  fixtureDirPrefix,
  git,
  makeBoundedOutsideDir,
  makeTempGitRepo,
  removeTempDir,
  writeFixtureFile,
} from './helpers/git-fixture';

/** What `fn` threw (`undefined` when it returned). */
function thrownBy(fn: () => unknown): unknown {
  try {
    fn();
  } catch (e) {
    return e;
  }
  return undefined;
}

describe('findGitRoot', () => {
  const dirs: string[] = [];

  afterEach(() => {
    while (dirs.length > 0) removeTempDir(dirs.pop() as string);
  });

  const repoDir = (): string => {
    const repo = makeTempGitRepo();
    dirs.push(repo);
    return repo;
  };

  it('finds the repo root when cwd already is the root', () => {
    const repo = repoDir();
    expect(findGitRoot(repo)).toBe(repo);
  });

  it('walks up from a nested subdirectory to find the root', () => {
    const repo = repoDir();
    const nested = join(repo, 'docs', 'self', '.wingfoil');
    mkdirSync(nested, { recursive: true });
    expect(findGitRoot(nested)).toBe(repo);
  });

  it('task-350 AC 3 — returns null when no directory below the ceiling contains .git (the ceiling is a repository)', () => {
    const { dir, ceiling } = makeBoundedOutsideDir();
    dirs.push(ceiling);
    expect(findGitRoot(dir, { ceiling })).toBeNull();
  });

  it('task-350 AC 3 — a repository below the ceiling is still found', () => {
    const repo = repoDir();
    const nested = join(repo, 'a', 'b');
    mkdirSync(nested, { recursive: true });
    expect(findGitRoot(nested, { ceiling: dirname(repo) })).toBe(repo);
  });

  it('task-350 AC 3 — a ceiling that is not an ancestor of the starting directory changes nothing', () => {
    const repo = repoDir();
    const other = repoDir();
    const nested = join(repo, 'a');
    mkdirSync(nested, { recursive: true });
    expect(findGitRoot(nested, { ceiling: other })).toBe(repo);
  });

  it('task-350 AC 3 — the starting directory is always examined, even when it is the ceiling', () => {
    const repo = repoDir();
    expect(findGitRoot(repo, { ceiling: repo })).toBe(repo);
  });
});

describe('resolveProjectRoot', () => {
  const dirs: string[] = [];

  afterEach(() => {
    while (dirs.length > 0) removeTempDir(dirs.pop() as string);
  });

  const repoDir = (): string => {
    const repo = makeTempGitRepo();
    dirs.push(repo);
    return repo;
  };

  it('returns the root when invoked from the root itself', () => {
    const repo = repoDir();
    expect(resolveProjectRoot(repo)).toBe(repo);
  });

  it('throws E_NOT_AT_GIT_ROOT when invoked from a subdirectory of the root', () => {
    const repo = repoDir();
    const nested = join(repo, 'sub');
    mkdirSync(nested, { recursive: true });
    const thrown = thrownBy(() => resolveProjectRoot(nested));
    expect(thrown).toBeInstanceOf(StorageError);
    expect((thrown as StorageError).code).toBe('E_NOT_AT_GIT_ROOT');
  });

  it('task-350 AC 3 — throws E_NO_GIT_ROOT when not inside a git repository below the ceiling', () => {
    const { dir, ceiling } = makeBoundedOutsideDir();
    dirs.push(ceiling);
    const thrown = thrownBy(() => resolveProjectRoot(dir, { ceiling }));
    expect(thrown).toBeInstanceOf(StorageError);
    expect((thrown as StorageError).code).toBe('E_NO_GIT_ROOT');
  });

  describe('task-350 AC 1 — the named root ({ project })', () => {
    it('returns the named root, whatever the current directory', () => {
      const repo = repoDir();
      const elsewhere = repoDir();
      expect(resolveProjectRoot(elsewhere, { project: repo })).toBe(repo);
    });

    it('resolves a relative value against the current directory', () => {
      const repo = repoDir();
      expect(resolveProjectRoot(dirname(repo), { project: basename(repo) })).toBe(repo);
      const nested = join(repo, 'sub');
      mkdirSync(nested, { recursive: true });
      expect(resolveProjectRoot(nested, { project: '..' })).toBe(repo);
    });

    it.each([
      ['a subdirectory of a repository', (repo: string): string => {
        mkdirSync(join(repo, 'sub'), { recursive: true });
        return join(repo, 'sub');
      }],
      ['a missing path', (repo: string): string => join(repo, 'nope')],
      ['a file', (repo: string): string => {
        writeFixtureFile(repo, 'README.md', 'fixture\n');
        return join(repo, 'README.md');
      }],
    ] as const)('refuses %s with E_NOT_AT_GIT_ROOT naming its absolute path', (_label, make) => {
      const repo = repoDir();
      const named = make(repo);
      const thrown = thrownBy(() => resolveProjectRoot(repo, { project: named }));
      expect(thrown).toBeInstanceOf(StorageError);
      expect((thrown as StorageError).code).toBe('E_NOT_AT_GIT_ROOT');
      expect((thrown as StorageError).message).toBe(`E_NOT_AT_GIT_ROOT: --project is not a git root: ${named}`);
    });

    it('refuses a directory outside every repository with E_NOT_AT_GIT_ROOT, not E_NO_GIT_ROOT (no walk)', () => {
      const { dir, ceiling } = makeBoundedOutsideDir();
      dirs.push(ceiling);
      const thrown = thrownBy(() => resolveProjectRoot(ceiling, { project: dir }));
      expect(thrown).toBeInstanceOf(StorageError);
      expect((thrown as StorageError).message).toBe(`E_NOT_AT_GIT_ROOT: --project is not a git root: ${dir}`);
    });

    it('names a relative value by its absolute path in the refusal', () => {
      const repo = repoDir();
      mkdirSync(join(repo, 'sub'), { recursive: true });
      const thrown = thrownBy(() => resolveProjectRoot(repo, { project: 'sub' }));
      expect(thrown).toBeInstanceOf(StorageError);
      expect((thrown as StorageError).message).toBe(`E_NOT_AT_GIT_ROOT: --project is not a git root: ${join(repo, 'sub')}`);
    });

    it('accepts a worktree, whose .git is a file', () => {
      const repo = repoDir();
      writeFixtureFile(repo, 'README.md', 'fixture\n');
      commitAll(repo, 'initial');
      const parent = mkdtempSync(fixtureDirPrefix());
      const worktree = join(parent, 'wt');
      git(repo, ['worktree', 'add', '--quiet', '-b', 'wt', worktree]);
      dirs.push(parent);
      expect(resolveProjectRoot(repo, { project: worktree })).toBe(worktree);
    });
  });
});
