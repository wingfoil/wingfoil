/**
 * Resolving the revision a read is pinned to (task-137, `spec-012` §2 `stateRef`, `spec-016` §3.3
 * step 7, `spec-017` §1.1).
 *
 * Every `…AtRev(root, rev)` reader — the pillar loaders (`./loaders.ts`) and the Memory scan
 * (`../memory/query.ts`) — resolves its `rev` here, once, to the full sha of a commit, and reads every
 * byte at that sha. A rev that resolves to nothing is a refusal, never an empty answer: an empty
 * directive list or Memory scan is a legitimate answer for a commit that holds nothing, so handing it
 * back for a mistyped rev would build an agent a wrong context that looks right.
 */
import { existsSync } from 'fs';
import { join } from 'path';

import { type BlobEntry, E_GIT_READ_FAILED, listBlobEntriesAtRev, listPathsAtRev, resolveCommitAtRev, StorageError } from '../storage';

import type { CoreError, CoreErrorCode } from './types';

/**
 * A revision a `…AtRev` reader cannot read at. It is thrown, like the loaders' `ValidationError`, and
 * it **is** a {@link CoreError} — `code`, `message`, `details: { rev }` — so a core function hands it
 * on with `coreErr(error.toCoreError())`.
 *
 * - `VALIDATION`: the rev is malformed ({@link isWellFormedRevision}) and was never shown to git.
 * - `NOT_FOUND`: the rev is well formed and names no commit — an unknown name, an unborn `HEAD`, a
 *   tree or a blob.
 *
 * Both messages name the rev JSON-quoted, so an empty or whitespace rev is visible.
 */
export class RevisionError extends Error implements CoreError {
  readonly code: CoreErrorCode;
  readonly details: { readonly rev: string };

  constructor(code: 'VALIDATION' | 'NOT_FOUND', rev: string) {
    super(
      code === 'VALIDATION'
        ? `malformed revision ${JSON.stringify(rev)}: a revision is a non-empty name with no leading '-', no whitespace or control character, no ':' and no '..'`
        : `revision ${JSON.stringify(rev)} does not name a commit`,
    );
    this.name = 'RevisionError';
    this.code = code;
    this.details = { rev };
    // Restore the prototype chain so `instanceof RevisionError` holds after transpilation.
    Object.setPrototypeOf(this, RevisionError.prototype);
  }

  /** The plain {@link CoreError} value, for a `CoreResult` (spec-006 §2). */
  toCoreError(): CoreError {
    return { code: this.code, message: this.message, details: { rev: this.details.rev } };
  }
}

/**
 * Whether `rev` has the shape a single-commit revision may have here. Refused: the empty string; a
 * leading `-` (git would read it as an option); whitespace and control bytes (no ref name holds them,
 * and a newline would split a batch request); `:` (that is `<rev>:<path>`, a blob, never a commit);
 * `..` (a range, two commits). Everything else — `HEAD`, `HEAD~2`, a sha or its prefix, a branch, a tag,
 * `main@{1}` — is left for git to resolve.
 *
 * The whitespace rule also refuses the revision forms that spell a phrase with spaces —
 * `master@{1 day ago}`, `HEAD^{/fix bug}` — as `VALIDATION`. git's dotted spelling of an approxidate
 * (`HEAD@{1.day.ago}`) has no space and resolves.
 */
export function isWellFormedRevision(rev: string): boolean {
  // eslint-disable-next-line no-control-regex
  return rev.length > 0 && !rev.startsWith('-') && !/[\s\u0000-\u001f\u007f:]/.test(rev) && !rev.includes('..');
}

/**
 * Resolve `rev` to the full sha of the commit it names (task-137).
 *
 * @param root - Project root (the git repository).
 * @param rev - A revision naming one commit: `HEAD`, a sha, a branch, a tag.
 * @returns The commit's full sha.
 * @throws {@link RevisionError} `VALIDATION` for a malformed rev, `NOT_FOUND` for one naming no commit;
 *   `StorageError` `E_GIT_READ_FAILED` when git cannot answer at all (a `root` that is not a
 *   repository, a `git` that cannot run) — a broken environment is not a missing revision.
 */
export function resolveRevision(root: string, rev: string): string {
  if (!isWellFormedRevision(rev)) throw new RevisionError('VALIDATION', rev);
  const sha = resolveCommitAtRev(root, rev);
  if (sha === null) throw new RevisionError('NOT_FOUND', rev);
  return sha;
}

/**
 * Every file commit `sha` holds under `prefix` (`storage.listPathsAtRev`), for a sha
 * {@link resolveRevision} has just resolved. `listPathsAtRev` answers `null` only for a revision that
 * does not resolve, so a `null` here means git could not list a commit it had just resolved; that is a
 * failed read, and it throws rather than passing for "the commit holds nothing" (the empty answer this
 * module exists to keep away from an agent's context).
 *
 * @throws `StorageError` `E_GIT_READ_FAILED` when the listing fails.
 */
export function listPathsAtCommit(root: string, sha: string, prefix: string): string[] {
  const listed = listPathsAtRev(root, sha, prefix);
  if (listed === null) {
    throw new StorageError(E_GIT_READ_FAILED, `git ls-tree ${sha} -- ${prefix} failed in ${root}: the commit could not be listed`);
  }
  return listed;
}

/**
 * {@link listPathsAtCommit} with each blob's kind (`storage.listBlobEntriesAtRev`): the Memory scan
 * reads at a commit through this, so that a symbolic link is known as one rather than read as a
 * document whose text is the link's target (task-171, `bug-189`).
 *
 * @throws `StorageError` `E_GIT_READ_FAILED` when the listing fails.
 */
export function listBlobEntriesAtCommit(root: string, sha: string, prefix: string): BlobEntry[] {
  const listed = listBlobEntriesAtRev(root, sha, prefix);
  if (listed === null) {
    throw new StorageError(E_GIT_READ_FAILED, `git ls-tree ${sha} -- ${prefix} failed in ${root}: the commit could not be listed`);
  }
  return listed;
}

/**
 * Run a `…AtRev(root, 'HEAD')` read with the answer the `…AtHead` readers have always given when there
 * is no `HEAD` to read — `fallback` (`null`, or `[]` for a directory) — rather than an error. Two
 * conditions mean that, and only two (task-171, `bug-201`):
 *
 * - {@link RevisionError} `NOT_FOUND`: a repository with no commit yet (`HEAD` is a constant, so
 *   `VALIDATION` cannot occur);
 * - `StorageError` `E_GIT_READ_FAILED` when `root` holds no `.git`: it is not a repository, so nothing
 *   is committed there.
 *
 * Their callers treat the fallback as "nothing committed" (task-090, task-091, task-096). Any other
 * failure is thrown, and the caller refuses it by name: a `git` that cannot be spawned, an answer past
 * the read buffer, a tree git cannot read. Until task-171 every `E_GIT_READ_FAILED` gave the fallback,
 * so a failed read inside a repository passed for an empty baseline.
 *
 * @param root - The project root the read is against; asked only whether it holds `.git`.
 */
export function atHeadOr<T, F>(root: string, read: () => T, fallback: F): T | F {
  try {
    return read();
  } catch (error) {
    if (error instanceof RevisionError && error.code === 'NOT_FOUND') return fallback;
    if (error instanceof StorageError && error.code === E_GIT_READ_FAILED && !existsSync(join(root, '.git'))) return fallback;
    throw error;
  }
}
