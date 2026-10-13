/**
 * Memory document path resolution (task-003-git-backed-sot, spec-001-memory-yaml-schema
 * `MemoryTypeEntry.path`). A type's `path` pattern (e.g. `docs/04_memory/{release}/{id}.md` for
 * `task`) MAY contain named placeholders besides `{id}`; spec-001 says those are "resolved by the
 * Workflow pillar from the active `element:` chain before the ID engine runs". This module is the
 * one place that renders any such pattern against concrete values — no other code may hardcode a
 * Memory document path.
 *
 * This does not itself generate `{id}` from a counter — that is the ID-generation engine's job
 * (`src/validation/id.ts`, task-002-validation-id-engine); callers pass the already-generated id in
 * `values` like any other placeholder.
 */
import { join, posix, resolve } from 'path';

import { escapesRoot, resolveRealPathInRoot, symlinkTargetRefusal, targetIsSymlink } from './confinement';
import { E_MISSING_PATH_VALUE, E_PATH_ESCAPES_ROOT, E_PATH_OUTSIDE_TYPE_FOLDER, E_TARGET_IS_SYMLINK, StorageError } from './errors';

/** Exact confinement-violation message required by REQ-SEC-06's fit criterion — do not reword. */
const CONFINEMENT_MESSAGE = 'Memory entries must reside within the project root';

const PLACEHOLDER_RE = /\{([^{}]+)\}/g;

/**
 * Render a `path` pattern against a set of concrete placeholder values.
 *
 * @throws {@link StorageError} `E_MISSING_PATH_VALUE` naming every `{placeholder}` in `pattern`
 *   that has no corresponding key in `values` (all missing values are reported together, not just
 *   the first).
 */
export function renderMemoryPath(pattern: string, values: Record<string, string>): string {
  const missing: string[] = [];
  const rendered = pattern.replace(PLACEHOLDER_RE, (_match, token: string) => {
    const value = values[token];
    if (value === undefined) {
      missing.push(token);
      return '';
    }
    return value;
  });
  if (missing.length > 0) {
    throw new StorageError(
      E_MISSING_PATH_VALUE,
      `path pattern "${pattern}" is missing value(s) for: ${missing.join(', ')}`,
    );
  }
  return rendered;
}

/**
 * The folder a type's `path` pattern confines its documents to — its **static prefix** (task-281, `bug-325`):
 * the pattern up to and including the last `/` before its first `{`; the directory part of the pattern when
 * it holds no `{`; `''` when the first `{` lies in the first segment (no folder narrower than the root).
 *
 * `docs/05_plans/{scope}/{id}.md` → `docs/05_plans/`; `docs/04_memory/planning/rl-{release-line}/{id}.md` →
 * `docs/04_memory/planning/`; `{scope}/{id}.md` → `''`; `docs/fixed.md` → `docs/`.
 */
export function pathPatternFolder(pattern: string): string {
  const brace = pattern.indexOf('{');
  const end = brace === -1 ? pattern.length : brace;
  return pattern.slice(0, pattern.lastIndexOf('/', end - 1) + 1);
}

/**
 * Whether the normalized root-relative `path` lies strictly under `folder`. An empty folder confines nothing
 * beyond the root: a path that climbs out of it or is absolute was already refused by the root checks, which
 * run first.
 */
function liesUnder(path: string, folder: string): boolean {
  if (folder === '') return true;
  const prefix = posix.normalize(folder);
  return path.startsWith(prefix) && path.length > prefix.length;
}

/** Render `pattern` (see {@link renderMemoryPath}) and resolve it to an absolute path under `root`. */
export function resolveMemoryPath(
  root: string,
  pattern: string,
  values: Record<string, string>,
): string {
  return join(root, renderMemoryPath(pattern, values));
}

/**
 * Render + resolve a Memory-entry path (see {@link resolveMemoryPath}) **and enforce storage
 * confinement (REQ-SEC-06)**: the absolute target must be strictly inside the project `root`.
 * `path.join`/`resolve` normalize `../`, so a crafted `id` (or any placeholder value) containing
 * traversal could otherwise steer the write outside the managed, git-tracked store that REQ-SYS-01
 * establishes as project truth — this refuses that **before** returning a path, so no caller ever
 * writes outside the root.
 *
 * The boundary itself is {@link escapesRoot} (`./confinement.ts`), shared with every other store so
 * that "inside the project root" has one definition. It is asked **twice, about two resolutions of
 * the same path**, because a string and a filesystem answer different questions and a Memory write
 * has to survive both (`task-105`, `bug-117-memory-add-writes-outside-the-project-root-through-a-symlinked-store`):
 *
 * 1. **Textually** (`task-017`) — what the rendered pattern *says*. An ordinary `../` smuggled
 *    through a placeholder value is caught by **either** check, so that case alone would not justify
 *    keeping this one. What only this check decides is the **laundered** traversal: with a symlink
 *    outside the root pointing back into it, `resolveRealPathInRoot(root, '…/../../link/x.md')`
 *    reports `within: true` for a string that plainly climbs out of the project. The string is what
 *    the project declared, and a link that whoever owns the directory *above* the root can repoint
 *    at any moment does not get to ratify it. Pinned by `refuses a rendered traversal that the
 *    filesystem would launder back inside the root`
 *    (`test/storage/memory-path-confinement.test.ts`) — deleting this check reds that test and, of
 *    the 35 tests in the five suites over this path, only that one.
 * 2. **On the filesystem** ({@link resolveRealPathInRoot}) — where the write will actually land. A
 *    symlinked type directory puts the document outside the root with no traversal anywhere in the
 *    string, so the textual answer is "inside" and the write is outside; that is `bug-044`'s
 *    crossing in the store REQ-SEC-06 is written for. A filesystem answer exists even for a path not
 *    yet created: `resolveRealPathInRoot` resolves as far as the filesystem goes and keeps the
 *    missing tail verbatim, which is exactly this case — the document is about to be created.
 *
 * The second read resolves against the **working tree** rather than `HEAD`, deliberately: it is the
 * filesystem-effect read `command-baseline` and `spec-006-core-domain-api` §6 declare, ratified in
 * `dl-086-a-guard-over-a-filesystem-effect-resolves-on-the-filesystem` from `task-102`'s argument,
 * which is not re-derived here: what this predicts is where `writeFileSync` will land, and it follows
 * the symlinks that are on disk, not the ones a commit records.
 *
 * **The target's parent is resolved; its own name is not** — the asymmetry is
 * {@link resolveRealPathInRoot}'s contract (see that function), and it is the reason this returns a
 * path spelled under `root` **as the caller gave it** rather than under the real root: `commitPaths`
 * runs `git -C <root>` and callers take `relative(root, …)`, so re-spelling a legitimate path would
 * take it out of the repository's own vocabulary.
 *
 * Unresolved is not the same as unexamined, and on this path it could not be (task-106,
 * `bug-120-a-symlinked-document-leaf-is-followed-by-the-write`). Every caller of this function
 * writes — `writeMemoryEntry` (`../memory/entry.ts`) and `memoryAddFn` (`../core/index.ts`), which
 * resolves the same path a second time to guard it — and `writeFileSync` **follows** a symlinked
 * leaf, so accepting one put an element outside the project root and a `wf(<type>): add <id>`
 * subject in history for it. A third check therefore refuses a target whose own name is a link
 * ({@link targetIsSymlink}), without resolving it: where the link points is not judged, so the
 * `bug-044` case that keeps a symlinked file *removable* is untouched — that is a delete, and this
 * resolver serves no deletes. `dl-086` carries the baseline argument for both.
 *
 * @returns the absolute, confinement-verified target path, spelled under `root`.
 * @throws {@link StorageError} `E_PATH_ESCAPES_ROOT` (message: {@link CONFINEMENT_MESSAGE} plus the
 *   two spellings of the path, since the two differing is the finding) when the resolved path is the
 *   root itself, escapes it textually, or lands outside it on the filesystem.
 * @throws {@link StorageError} `E_PATH_OUTSIDE_TYPE_FOLDER` when the path, normalized, stays inside the root but
 *   not under {@link pathPatternFolder} of `pattern` — the type's folder (task-281, `bug-325`). Checked after
 *   the two root checks, so a root escape keeps `E_PATH_ESCAPES_ROOT`; the message names every token of the
 *   pattern with its value.
 * @throws {@link StorageError} `E_TARGET_IS_SYMLINK` (message: `symlinkTargetRefusal`, shared with
 *   the transition verbs' `CoreResult` refusal) when the target itself is a symbolic link —
 *   including a **dangling** one, which `existsSync` cannot see.
 */
export function resolveConfinedMemoryPath(
  root: string,
  pattern: string,
  values: Record<string, string>,
): string {
  const resolvedRoot = resolve(root);
  const rendered = renderMemoryPath(pattern, values);
  const target = resolve(resolvedRoot, rendered);
  if (escapesRoot(resolvedRoot, target)) {
    throw new StorageError(
      E_PATH_ESCAPES_ROOT,
      `${CONFINEMENT_MESSAGE}: '${rendered}' resolves to '${target}', outside the project root.`,
    );
  }
  const onDisk = resolveRealPathInRoot(resolvedRoot, rendered);
  if (!onDisk.within) {
    throw new StorageError(
      E_PATH_ESCAPES_ROOT,
      `${CONFINEMENT_MESSAGE}: '${rendered}' resolves to '${onDisk.real}', outside the project root — ` +
        'a directory on the way to it is a symlink leaving the project.',
    );
  }
  const normalized = posix.normalize(rendered);
  const folder = pathPatternFolder(pattern);
  if (!liesUnder(normalized, folder)) {
    const tokens = [...new Set([...pattern.matchAll(PLACEHOLDER_RE)].map((match) => match[1]!))];
    const listed = tokens.map((token) => `{${token}}=${JSON.stringify(values[token])}`).join(', ');
    throw new StorageError(
      E_PATH_OUTSIDE_TYPE_FOLDER,
      `Memory entries must reside in their type's folder: '${rendered}' resolves to '${normalized}', outside '${folder}' (path '${pattern}': ${listed})`,
    );
  }
  if (targetIsSymlink(target)) {
    throw new StorageError(E_TARGET_IS_SYMLINK, symlinkTargetRefusal('create', rendered));
  }
  return target;
}
