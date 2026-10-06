/**
 * Plain document read/write/remove (task-003-git-backed-sot, REQ-SYS-01). Every Memory/DNA/Directives/
 * Workflow mutation is a regular file write with no side-channel state — no `.wingfoil/state/`
 * index (REQ-SYS-03), no cache file that isn't itself just a copy of what's already on disk.
 * `git add`/`git commit` of the result is the caller's job (dev-loop's commit conventions, CLAUDE.md
 * §5.1) — this module only owns the bytes at an already-resolved absolute path (see
 * `./memory-path`).
 */
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { dirname } from 'path';

import { refuseDuringDryRun } from './dry-run';

/** Read a document's full contents as UTF-8 text. */
export function readDocument(absolutePath: string): string {
  return readFileSync(absolutePath, 'utf-8');
}

/** Whether a document exists at `absolutePath`. */
export function documentExists(absolutePath: string): boolean {
  return existsSync(absolutePath);
}

/**
 * Write `content` to `absolutePath`, creating any missing parent directories. No other file or
 * directory is created or touched — the write is exactly this one path, nothing else.
 */
export function writeDocument(absolutePath: string, content: string): void {
  refuseDuringDryRun('writeDocument');
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, content, 'utf-8');
}

/**
 * Delete the document at `absolutePath` — {@link writeDocument}'s exact counterpart, added for
 * `directive remove` (P3.3, task-052-directive-remove), the first operation in the system that
 * removes a file rather than writing one.
 *
 * Exactly this one path is unlinked: no parent directory is pruned (an emptied
 * `directives/custom/` must keep existing — `spec-011-storage-layout`'s `built-in/` vs `custom/`
 * split is what REQ-SEC-07 keys removability on, so the directory is structure, not content), and
 * nothing is ever removed recursively. Staging and committing the deletion is the caller's job,
 * exactly as it is for a write (`commitPaths`, ./commit) — this module only owns the bytes at an
 * already-resolved absolute path.
 *
 * @throws Node's `ENOENT` when nothing is there. Callers resolve the target before calling (P3.3
 *   resolves a directive NAME to a file that `loadDirectives` just read), so a missing path is a
 *   programmer error rather than a domain outcome to swallow.
 */
export function removeDocument(absolutePath: string): void {
  refuseDuringDryRun('removeDocument');
  unlinkSync(absolutePath);
}
