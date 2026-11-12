/**
 * Git-root detection and project-root resolution (task-003-git-backed-sot, REQ-SYS-01,
 * spec-011-storage-layout "Git-root detection algorithm"). Every other storage primitive assumes it
 * is operating against a resolved project root — this is where that root comes from.
 *
 * The root is never inferred (spec-011 "Why the root is not inferred", `dl-198`): it is the current
 * directory, or the directory the global `--project <dir>` names (task-350, spec-008 §2), and either
 * must itself be the git root.
 */
import { existsSync } from 'fs';
import { dirname, join, resolve } from 'path';

import { E_NO_GIT_ROOT, E_NOT_AT_GIT_ROOT, StorageError } from './errors';

/** The options of {@link findGitRoot}. */
export interface FindGitRootOptions {
  /**
   * A directory the walk never examines, nor anything above it (git's own ceiling directories). Only
   * tests pass one, so an "outside any repository" fixture gives the same result whatever lies above
   * the system temporary directory (spec-011, `bug-406`, `bug-453`); the CLI never does. A ceiling that
   * is not an ancestor of the starting directory changes nothing, and the starting directory itself is
   * always examined.
   */
  readonly ceiling?: string;
}

/** The options of {@link resolveProjectRoot}. */
export interface ResolveProjectRootOptions extends FindGitRootOptions {
  /**
   * The directory `--project <dir>` names (spec-008 §2), resolved against `cwd`. When given, it must hold
   * its own `.git` entry and nothing above or below it is examined; the walk (and the ceiling) is not used.
   */
  readonly project?: string;
}

/**
 * Walk up from `cwd` looking for a `.git` entry (spec-011: "no upward search for `.wingfoil/`
 * itself, only for `.git`"). Returns the first ancestor directory (inclusive of `cwd`) that
 * contains `.git`, or `null` if the filesystem root — or the `ceiling` — is reached without finding
 * one. `cwd` is resolved first so relative paths and trailing separators don't affect the result
 * (determinism).
 */
export function findGitRoot(cwd: string, options: FindGitRootOptions = {}): string | null {
  const ceiling = options.ceiling === undefined ? undefined : resolve(options.ceiling);
  let dir = resolve(cwd);
  for (;;) {
    if (existsSync(join(dir, '.git'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null; // reached the filesystem root without finding .git
    if (parent === ceiling) return null; // the ceiling and everything above it are never examined
    dir = parent;
  }
}

/**
 * Resolve the WingFoil project root: the git root, and only the git root. Per spec-011, `wingfoil`
 * must be invoked at the exact repository root — no upward search for `.wingfoil/` and no running
 * from a subdirectory of the root — unless `project` names the root (`--project <dir>`, task-350).
 *
 * @throws {@link StorageError} `E_NOT_AT_GIT_ROOT` naming the absolute directory when `project` is given
 *   and does not hold its own `.git` entry; otherwise `E_NO_GIT_ROOT` if `cwd` is not inside a git
 *   repository at all (below the `ceiling`, when one is given), or `E_NOT_AT_GIT_ROOT` if a git root
 *   was found but it isn't `cwd` itself.
 */
export function resolveProjectRoot(cwd: string, options: ResolveProjectRootOptions = {}): string {
  const resolvedCwd = resolve(cwd);
  if (options.project !== undefined) {
    const named = resolve(resolvedCwd, options.project);
    if (!existsSync(join(named, '.git'))) {
      throw new StorageError(E_NOT_AT_GIT_ROOT, `--project is not a git root: ${named}`);
    }
    return named;
  }
  const root = findGitRoot(resolvedCwd, { ceiling: options.ceiling });
  if (root === null) {
    throw new StorageError(E_NO_GIT_ROOT, 'not inside a git repository');
  }
  if (root !== resolvedCwd) {
    throw new StorageError(E_NOT_AT_GIT_ROOT, 'run wingfoil from the project root');
  }
  return root;
}
