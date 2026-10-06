/**
 * The one "writes nothing" check every refused write path asserts with (task-184, bug-194; dl-121
 * T1). Not a `.test.ts` file, so Jest's `testMatch` never picks it up as a suite on its own (mirrors
 * `./git-fixture.ts`'s own convention).
 *
 * task-147 (bug-036) built this comparison for the read-only MCP channel, in
 * `test/mcp/helpers/channel-enumeration.ts`, after a check that compared only the bytes of the files a
 * caller listed let a handler that created a file, or committed, pass. The core and CLI refusal tests
 * kept the narrow form — one file's bytes and/or `HEAD` — so a verb that wrote a stray file, a branch
 * or a tag and then refused passed them (bug-194). The comparison now lives here, and the MCP helper
 * delegates to it.
 *
 * {@link snapshotPersistence} is taken before the call under test and {@link assertPersistenceUnchanged}
 * after it. See {@link PersistenceSnapshot} for exactly what is and is not compared.
 */
import { execFileSync } from 'child_process';
import { existsSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * What a "writes nothing" check compares before and after a call, over a fixture that is a git
 * working tree:
 *
 * - `files` — the raw bytes of each caller-listed, root-relative file, and of every file
 *   `git status` lists at snapshot time (`null` for a listed path that does not exist). A fixture may
 *   be dirty on purpose — a refusal of a dirty target, a working-tree-only definition — and a
 *   rewrite of a file that is already dirty leaves `status` unchanged, so its bytes are what catch it;
 * - `status` — `git status --porcelain --untracked-files=all --ignored`: any file created, deleted or
 *   changed in state anywhere in the working tree, ignored paths included, changes it;
 * - `head` — `git rev-parse --verify HEAD` (`''` on an unborn branch): a commit on the current branch,
 *   even an empty one;
 * - `symbolicHead` — `git rev-parse --symbolic-full-name HEAD` (`''` on an unborn branch): a checkout
 *   of another branch, or a detach, even at the same commit;
 * - `refs` — `git for-each-ref --format='%(refname) %(objectname)'`: a branch, tag, note or stash
 *   created, moved or deleted, including a commit written to another branch without touching `HEAD`.
 *
 * Out of scope — NOT compared: `.git/config`, hooks, the index, the reflog, loose or packed objects
 * no ref points to, and the bytes of a tracked, unmodified file the caller did not list. A call that
 * writes only those passes this check; rewriting an unlisted clean tracked file to different bytes
 * does not, because `status` then lists it.
 */
export interface PersistenceSnapshot {
  readonly files: ReadonlyMap<string, Buffer | null>;
  readonly status: string;
  readonly head: string;
  readonly symbolicHead: string;
  readonly refs: string;
}

/**
 * Run a read-only `git` query in `root`. `--no-optional-locks` keeps `git status` from refreshing and
 * rewriting `.git/index`, so taking the snapshot is not itself a write.
 */
function gitQuery(root: string, args: readonly string[]): string {
  return execFileSync('git', ['--no-optional-locks', ...args], { cwd: root, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
}

/** {@link gitQuery}, or `''` when the query fails (an unborn branch has no `HEAD` to resolve). */
function gitQueryOrEmpty(root: string, args: readonly string[]): string {
  try {
    return gitQuery(root, args).trim();
  } catch {
    return '';
  }
}

/** The repository-level state of {@link PersistenceSnapshot}, everything but `files`. */
function gitState(root: string): Omit<PersistenceSnapshot, 'files'> {
  return {
    status: gitQuery(root, ['status', '--porcelain', '--untracked-files=all', '--ignored']),
    head: gitQueryOrEmpty(root, ['rev-parse', '--verify', '--quiet', 'HEAD']),
    symbolicHead: gitQueryOrEmpty(root, ['rev-parse', '--symbolic-full-name', 'HEAD']),
    refs: gitQuery(root, ['for-each-ref', '--format=%(refname) %(objectname)']),
  };
}

/**
 * Every path `git status -z` lists, root-relative: the destination of a rename or copy, and the path
 * of every other entry. NUL-separated, so a path with a space or a quote is read as written.
 */
function statusPaths(root: string): string[] {
  const fields = gitQuery(root, ['status', '--porcelain', '-z', '--untracked-files=all', '--ignored']).split('\0');
  const paths: string[] = [];
  for (let index = 0; index < fields.length; index += 1) {
    const entry = fields[index];
    if (entry === undefined || entry.length < 4) continue;
    paths.push(entry.slice(3));
    // A rename or copy entry is followed by its source path, which is not a separate entry.
    if (/[RC]/.test(entry.slice(0, 2))) index += 1;
  }
  return paths;
}

/** The bytes at `relativePath`, or `null` when nothing (or a directory) is there. */
function readBytes(root: string, relativePath: string): Buffer | null {
  const absolute = join(root, relativePath);
  if (!existsSync(absolute) || statSync(absolute).isDirectory()) return null;
  return readFileSync(absolute);
}

/**
 * Snapshot `root` for {@link assertPersistenceUnchanged}: the listed files' bytes, the bytes of every
 * file `git status` lists, and the repository state. A dirty or untracked fixture is accepted.
 */
export function snapshotPersistence(root: string, relativePaths: readonly string[] = []): PersistenceSnapshot {
  const state = gitState(root);
  const files = new Map<string, Buffer | null>();
  for (const relativePath of [...relativePaths, ...statusPaths(root)]) {
    if (!files.has(relativePath)) files.set(relativePath, readBytes(root, relativePath));
  }
  return { files, ...state };
}

/**
 * Throw unless nothing {@link PersistenceSnapshot} compares has changed since `snapshot` was taken:
 * the snapshotted files' bytes, the working-tree status, `HEAD`, its symbolic target, and the refs.
 * Each check throws its own message, prefixed `${label}: `, in that order.
 */
export function assertPersistenceUnchanged(root: string, snapshot: PersistenceSnapshot, label = 'writes-nothing'): void {
  for (const [relativePath, before] of snapshot.files) {
    const after = readBytes(root, relativePath);
    const same = before === null ? after === null : after !== null && after.equals(before);
    if (!same) {
      throw new Error(`${label}: file changed after a refused write attempt: ${relativePath}`);
    }
  }
  const after = gitState(root);
  if (after.status !== snapshot.status) {
    throw new Error(
      `${label}: working tree changed after a refused write attempt:\n--- before\n${snapshot.status}--- after\n${after.status}`,
    );
  }
  if (after.head !== snapshot.head) {
    throw new Error(`${label}: HEAD moved after a refused write attempt: ${snapshot.head} -> ${after.head}`);
  }
  if (after.symbolicHead !== snapshot.symbolicHead) {
    throw new Error(`${label}: HEAD switched after a refused write attempt: ${snapshot.symbolicHead} -> ${after.symbolicHead}`);
  }
  if (after.refs !== snapshot.refs) {
    throw new Error(`${label}: refs changed after a refused write attempt:\n--- before\n${snapshot.refs}--- after\n${after.refs}`);
  }
}
