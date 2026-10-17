/**
 * State snapshot (task-003-git-backed-sot) — the direct implementation of REQ-SYS-01's SARD fit
 * criterion (docs/02_requirements/03_sard/01_architecture.md):
 *
 *   "A fresh git clone of the repository reconstructs 100% of Memory/DNA/Directives/Workflow state
 *   with no external data source; a state dump before and after clone is byte-identical."
 *
 * `computeStateSnapshot` is a pure function of what's on disk under `root`: every file under
 * `.wingfoil/` in full (DNA/Directives/Workflow config, per spec-011-storage-layout's directory
 * layout) plus every `docs/04_memory/**\/*.md` document's frontmatter only (Memory content — state
 * lives in frontmatter, AGENTS.md §5 / REQ-STATE-01/-02, so the body text isn't part of "state").
 * It holds no module-level cache and consults nothing outside `root`, so recomputing it — from the
 * original working copy, from a fresh clone, or from a freshly re-imported module — always yields
 * the same result for the same on-disk bytes.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

import { extractFrontmatter } from './frontmatter';

/** One entry of a state snapshot: a root-relative, POSIX-separated path and its recorded content. */
export interface SnapshotEntry {
  /** Path relative to the project root, always POSIX-separated (`/`) regardless of platform. */
  readonly path: string;
  /** Full raw content for `.wingfoil/**` files; frontmatter-only text for Memory `.md` documents. */
  readonly content: string;
}

function toPosixRelative(root: string, absolute: string): string {
  return relative(root, absolute).split(sep).join('/');
}

/**
 * Recursively list every regular file under `dir`, as root-relative POSIX paths, sorted
 * lexicographically. Directory-entry order from `readdirSync` is not guaranteed stable across
 * filesystems/platforms, so traversal always sorts explicitly (REQ-SYS-07: no unordered iteration
 * in a context-building path) rather than trusting it. Returns `[]` if `dir` doesn't exist.
 */
function listFilesSorted(root: string, dir: string): string[] {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];

  const out: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current).sort()) {
      const full = join(current, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else {
        out.push(full);
      }
    }
  };
  walk(dir);
  return out.map((absolute) => toPosixRelative(root, absolute)).sort();
}

/**
 * Compute a deterministic snapshot of all git-backed WingFoil state under `root` (a resolved
 * project root — see `./git-root`). No file outside `.wingfoil/` and `docs/04_memory/**\/*.md` is
 * read; no cache is kept between calls.
 */
export function computeStateSnapshot(root: string): SnapshotEntry[] {
  const entries: SnapshotEntry[] = [];

  for (const path of listFilesSorted(root, join(root, '.wingfoil'))) {
    entries.push({ path, content: readFileSync(join(root, path), 'utf-8') });
  }

  for (const path of listFilesSorted(root, join(root, 'docs', '04_memory'))) {
    if (!path.endsWith('.md')) continue;
    const raw = readFileSync(join(root, path), 'utf-8');
    entries.push({ path, content: extractFrontmatter(raw) ?? '' });
  }

  return entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/** Deterministic string serialization of a snapshot, for byte-identical comparison (REQ-SYS-01). */
export function serializeSnapshot(entries: readonly SnapshotEntry[]): string {
  return entries.map((entry) => `${entry.path}\n${entry.content}`).join('\n---ENTRY---\n');
}
