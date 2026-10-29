/** Options shared by {@link acquireDistLock} and {@link prepareDist}. */
export interface DistLockOptions {
  /** The pid the lock is taken for; defaults to this process. */
  readonly pid?: number;
  /** How long to wait for a live holder before refusing, in milliseconds. */
  readonly waitMs?: number;
  /** How often to look at the lock while waiting, in milliseconds. */
  readonly pollMs?: number;
  /** Where the one "waiting for pid N" line goes; defaults to stderr. */
  readonly log?: (message: string) => void;
  /** Whether a pid is a live process; defaults to `process.kill(pid, 0)`. */
  readonly isAlive?: (pid: number) => boolean;
}

/** The lock file guarding `<repoRoot>/dist/`: `<repoRoot>/.jest-dist.lock`. */
export function distLockPath(repoRoot: string): string;

/** Take the lock, waiting for a live holder; rejects naming the holder if the wait runs out. */
export function acquireDistLock(options: DistLockOptions & { readonly lockPath: string }): Promise<void>;

/** Remove the lock if `pid` holds it; returns whether it did. */
export function releaseDistLock(options: { readonly lockPath: string; readonly pid?: number }): boolean;

/**
 * The staging directory a build writes into before it is renamed onto `dist/`:
 * `<repoRoot>/.jest-dist.next` (bug-336, task-308).
 */
export function distStagingPath(repoRoot: string): string;

/**
 * Where the previous `dist/` is moved while the staged build takes its place, then removed:
 * `<repoRoot>/.jest-dist.prev` (bug-336, task-308).
 */
export function distPreviousPath(repoRoot: string): string;

/** Whether `pid` is a live process (`process.kill(pid, 0)`; `EPERM` counts as alive). */
export function isPidAlive(pid: number): boolean;

/**
 * Take the lock, call `build` with the staging directory (which does not exist on entry), then swap the
 * staged build onto `<repoRoot>/dist/` by rename and remove the previous one. A build that throws or writes
 * nothing leaves `dist/` untouched; a `dist/` that cannot be moved or removed rejects with a diagnostic
 * naming the path and the cause (bug-066). The lock stays held.
 */
export function prepareDist(
  options: DistLockOptions & { readonly repoRoot: string; readonly build: (outDir: string) => void },
): Promise<void>;
