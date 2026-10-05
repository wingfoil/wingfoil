/**
 * The reusable git-commit primitive (task-018-implement-git-backed-storage, P1.1, REQ-SYS-01).
 *
 * `writeDocument` (./document) writes bytes only; nothing else in `src/storage` turns a set of
 * writes into a commit, yet every mutating core operation must return a `CoreResult.commit`
 * `{sha, message}` (src/core/types). This is that missing producer: it stages **only** the scoped
 * paths it is handed — never `git add -A`/`git add .`, which would sweep in unrelated working-tree
 * changes (and, in a WingFoil worktree, the `node_modules` symlink) — and produces **exactly one**
 * commit, returning its full sha. Every mutating Wave-3 task (task-019 versioning, task-020 memory
 * add, task-025 dna set, task-029 `wingfoil init`) turns its writes into a single attributable
 * commit through this one helper, so the "one operation = one scoped commit" convention
 * (CLAUDE.md §5.1) has a single implementation rather than being re-derived per task.
 *
 * Mirrors the git-primitive style in `src/memory/git-log.ts`: `execFileSync('git', …)` (never a
 * shell), `-C <root>` to target the repository, and `env: process.env` passed **explicitly** — the
 * latter matters under Jest, whose worker env is not the ambient shell's, so relying on the default
 * env silently drops `GIT_*` overrides a test sets (the task-014 env-isolation gotcha).
 */
import { execFileSync, spawnSync } from 'child_process';

import { formatVersionTrailer, readBuildStamp } from './build-stamp';
import { E_GIT_READ_FAILED, E_INVALID_REVISION, StorageError } from './errors';
import { runGitRead, runGitReadBytes } from './git-read';
import type { GitReadOptions } from './git-read';

/** Options for {@link commitPaths} — carries the git-author/env override used by callers (e.g. task-029's wizard). */
export interface CommitOptions {
  /** Additional environment for the git invocations (merged over `process.env`). */
  readonly env?: NodeJS.ProcessEnv;
  /**
   * The commit's author, passed to git as `GIT_AUTHOR_NAME` / `GIT_AUTHOR_EMAIL` in its environment,
   * over `process.env` and over any `GIT_AUTHOR_*` in {@link CommitOptions.env}. Set by a caller that
   * has already checked an identity and must record exactly that one (task-132, `bug-149`); absent,
   * git resolves the author itself. The environment, not `--author "<name> <<email>>"`: git re-parses
   * that string, so a `<` in the name moved the email it recorded (task-132 review, finding 2).
   */
  readonly author?: { readonly name: string; readonly email: string };
}

function runGit(root: string, args: readonly string[], options: CommitOptions): string {
  return execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf-8',
    env: options.env ? { ...process.env, ...options.env } : process.env,
  });
}

/**
 * {@link runGit} for a **probe** — an invocation whose failure is an expected answer rather than an
 * error, or whose stderr is noise the caller must not surface, so git's own diagnostic does not reach
 * the caller's stderr. Without `stdio[2]: 'ignore'`, `execFileSync` inherits fd 2 and
 * `git show HEAD:<untracked>` prints `fatal: path … exists on disk, but not in 'HEAD'` into the
 * user's terminal alongside the message the CLI actually meant to emit.
 *
 * The second case arrived with task-092: `git status --porcelain -- <path>` exits **0** but prints
 * `warning: could not open directory '<dir>/': No such file or directory` when an intermediate
 * directory of the pathspec is absent — the ordinary case for a write guard asking about a file that
 * has not been created yet. A non-zero exit still raises through `execFileSync` exactly as before.
 */
function probeGit(root: string, args: readonly string[], options: CommitOptions): string {
  return execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf-8',
    env: options.env ? { ...process.env, ...options.env } : process.env,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

/** git's exit status for `fatal:` — an absent path, an unresolvable revision, no repository. */
const GIT_FATAL = 128;

/** {@link CommitOptions} as the read helper takes them, with the exit statuses that are answers. */
function gitReadOptions(options: CommitOptions, accepted: readonly number[]): GitReadOptions {
  return options.env ? { accepted, env: options.env } : { accepted };
}

/**
 * `message` with the build signature appended as a trailer paragraph of its own (task-192, `dl-111`):
 * a blank line, then `WingFoil-Version: <semver> (<sha>)` ({@link readBuildStamp}).
 *
 * A separate final paragraph, never a line merged into the caller's body: git reads trailers from the
 * message's final paragraph only, and so does `parseReasonBlock` (`src/memory/commit-message.ts`),
 * whose `Reason:` block ends where that paragraph begins. Merged into an `Approver:`/`Reason:` body
 * (what `git commit --trailer` would do, since that body is itself trailer-shaped), the signature would
 * turn the whole body into the trailer block and cut a multi-line reason short. The caller's message
 * is trimmed of trailing whitespace first, which `--cleanup=whitespace` would drop anyway.
 */
function stampedMessage(message: string): string {
  return `${message.replace(/\s+$/, '')}\n\n${formatVersionTrailer(readBuildStamp())}`;
}

/**
 * Stage exactly `paths` (root-relative or absolute; each passed verbatim after `--` so a path that
 * looks like a flag is never misread) and create a single commit with `message` that contains **only**
 * those paths, returning the new commit's 40-hex sha. Other changes already staged in the index are
 * neither committed nor unstaged (bug-027) — this also holds for the first commit of an empty
 * repository (`wingfoil init`).
 *
 * **What the commit records is `message` plus the build signature** (task-192, `dl-111`): a final
 * trailer paragraph `WingFoil-Version: <semver> (<sha>)` ({@link stampedMessage}), so every commit
 * WingFoil writes says which build wrote it and a hand-written one carries no such line. The body is
 * normalized by `--cleanup=whitespace`, pinned rather than inherited from `commit.cleanup`
 * (`bug-051`). Callers keep returning their own `message` in `CoreResult.commit`; the signature is
 * this primitive's, not the operation's.
 *
 * Determinism note (REQ-SYS-07): a git commit's sha necessarily incorporates the author/commit
 * timestamp, so two runs produce different shas — that is inherent to *creating* history and is not
 * a context-building read path (the determinism rule targets read/derivation paths, e.g.
 * `computeStateSnapshot`), so it is correct and intended here.
 *
 * @throws whatever `git` raises (via `execFileSync`) — e.g. nothing staged to commit, or `root` is
 *   not a git repository. Callers that must translate those into a `CoreResult` do so at their layer
 *   (see `src/core/init.ts`); this primitive stays a thin, throwing mechanism by design.
 */
export function commitPaths(
  root: string,
  paths: readonly string[],
  message: string,
  options: CommitOptions = {},
): string {
  runGit(root, ['add', '--', ...paths], options);
  // `--only -- <paths>` records exactly these paths, whatever else is staged: anything a caller or
  // another tool already staged stays staged and uncommitted (bug-027). A plain `git commit` would
  // commit the whole index under a subject that names only this operation.
  const commitOptions: CommitOptions = options.author
    ? { ...options, env: { ...options.env, GIT_AUTHOR_NAME: options.author.name, GIT_AUTHOR_EMAIL: options.author.email } }
    : options;
  // `--cleanup=whitespace` (bug-051): the body's normal form — trailing whitespace stripped, blank-line
  // runs collapsed, a `#` line kept — is the tool's, whatever `commit.cleanup` the operator's or the
  // repository's git config sets. Unpinned, `strip` deleted a reason line opening with `#` and
  // `verbatim` kept what `dl-067` clause 3 declares removed.
  runGit(root, ['commit', '--only', '--quiet', '--cleanup=whitespace', '-m', stampedMessage(message), '--', ...paths], commitOptions);
  return runGit(root, ['rev-parse', 'HEAD'], options).trim();
}

// --- Read primitives for asserting what a commit CONTAINS (task-088, bug-076) ------------------
//
// `commitPaths` above bounds a commit by *pathspec*; nothing bounded it by *content*, so a path that
// was already modified on disk rode into a commit whose subject declared only a state change. The
// three readers below are what lets a caller assert the diff a commit actually carries, instead of
// re-reading the file on disk and finding — truthfully, and uselessly — that it says what it should.

/**
 * git's canonical empty tree object, the same on every repository (`git hash-object -t tree
 * /dev/null`). Used as the parent of a **root** commit so "what changed between this commit and its
 * parent" is total rather than conditional.
 */
export const EMPTY_TREE_SHA = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

/**
 * The content of `path` at revision `rev`, or `null` when git answers with its `fatal:` exit `128`:
 * the path is absent there, or `rev` does not resolve (or `root` is no repository).
 *
 * Read through `runGitRead` (`./git-read`, task-142 review): stderr is captured, never inherited, and
 * the buffer is `GIT_READ_MAX_BUFFER`. Before, a document past Node's 1 MiB default made
 * `execFileSync` throw `ENOBUFS` and a blanket `catch` answered `null` — "absent" for a document that
 * is there, which `memory amend`, the loaders and the write guard turned into a wrong refusal. A
 * failure that is not git's answer — git that cannot be spawned, an answer past the buffer — now
 * throws `StorageError` `E_GIT_READ_FAILED`. Exit `128` stays `null`: git gives it to an absent path
 * and to an unreadable object alike, and this read does not tell them apart.
 *
 * `rev` is any revision git accepts before a `:` — a sha, `HEAD`, or the index stage `:0`, which is
 * how a caller reads what the user has **staged** as opposed to what is in the working tree. The two
 * can disagree, and the difference is load-bearing: `git add` would silently replace a staged version
 * with the working-tree one.
 *
 * @throws {@link StorageError} `E_GIT_READ_FAILED` when git cannot be spawned or its answer exceeds
 *   the read buffer (task-142 review).
 */
export function readPathAtRev(root: string, rev: string, path: string, options: CommitOptions = {}): string | null {
  const run = runGitRead(root, ['show', `${rev}:${path}`], gitReadOptions(options, [0, GIT_FATAL]));
  return run.status === GIT_FATAL ? null : run.stdout;
}

/**
 * The two-character `git status --porcelain` code for `path` (index status, then working-tree
 * status), or the empty string when the path is clean — unmodified in both, and tracked.
 *
 * Deliberately git's own answer rather than a content comparison: git owns what "modified" means
 * here (index refresh, `core.autocrlf`, `.gitattributes` filters), and a caller that re-derived it
 * from bytes would disagree with `git status` on exactly the machines where it matters.
 */
export function pathPorcelainStatus(root: string, path: string, options: CommitOptions = {}): string {
  // `probeGit`, not `runGit`: git writes a `warning: could not open directory …` to stderr — while
  // still exiting 0 and answering correctly — whenever an intermediate directory of the pathspec is
  // absent, which is routine for a guard asking about a file that does not exist yet (task-092).
  const line = probeGit(root, ['status', '--porcelain', '--', path], options).split('\n')[0] ?? '';
  return line.length === 0 ? '' : line.slice(0, 2);
}

/** The commit's parent sha, or {@link EMPTY_TREE_SHA} when it is a root commit. */
export function commitParent(root: string, sha: string, options: CommitOptions = {}): string {
  try {
    return probeGit(root, ['rev-parse', '--verify', '--quiet', `${sha}^`], options).trim();
  } catch {
    return EMPTY_TREE_SHA;
  }
}

/** Root-relative paths whose content differs between revisions `from` and `to`, in git's own order. */
export function changedPathsBetween(root: string, from: string, to: string, options: CommitOptions = {}): string[] {
  return runGit(root, ['diff', '--name-only', from, to], options)
    .split('\n')
    .filter((path) => path.length > 0);
}

// --- Listing a DIRECTORY at a revision (task-096, bug-086) -------------------------------------

/**
 * One `git ls-tree -z` record: `<mode> SP <type> SP <object> TAB <path>`. Matched rather than split
 * so that (a) only **blobs** survive — a gitlink (submodule, mode `160000`) is an entry in the tree
 * but not a file anyone can read back — and (b) the path is taken verbatim from the first TAB
 * onwards, which is the one separator a path cannot contain.
 */
const LS_TREE_BLOB_RECORD = /^\d+ blob [0-9a-f]+\t/;

/**
 * Every **file** that exists at revision `rev` under `prefix`, recursively, as root-relative POSIX
 * paths sorted ascending — the directory counterpart of {@link readPathAtRev}, and the primitive a
 * read whose baseline is a *directory* needs (`task-096`, `bug-086`).
 *
 * `readPathAtRev` answers "what does this one path contain at `<rev>`", which is enough while every
 * committed-baseline read is of a file named in advance (`.wingfoil/dna.yaml`,
 * `.wingfoil/memory.yaml`). It is not enough for `.wingfoil/directives/**`, whose members are
 * discovered rather than named: without this, resolving the directive inventory at `HEAD` was
 * impossible and `task-091` scoped `bug-086` out on exactly that ground. The two compose — list, then
 * read each entry — and `src/core/loaders.ts`'s `loadDirectivesAtHead` is the first caller to do so.
 *
 * **Blobs only.** Whatever this returns must be readable with `readPathAtRev` at the same revision; a
 * gitlink would break that, so it is filtered out rather than reported as a file.
 *
 * **`-z`, not the default output.** Without it git C-quotes a path containing a byte outside printable
 * ASCII (`core.quotePath`, on by default), a control byte, a `"` or a `\`: it wraps the whole name in
 * double quotes and escapes the offending bytes, so `caffè.md` is reported as `"caff\303\250.md"` and
 * a caller then looks for a file whose name it has mis-spelled. A **space is not quoted** — worth
 * naming because it makes `two words.md` a useless test of this property, and only a name git really
 * quotes can hold the flag in place (`test/storage/list-paths-at-rev.test.ts`, "the `-z` pin"). With
 * `-z` the records are NUL-separated and never quoted, whatever the bytes.
 *
 * **`null` is not `[]`.** `[]` means *the revision exists and holds nothing under `prefix`*; `null`
 * means *`rev` does not resolve at all* — an unborn `HEAD` in a repository with no commits, or a name
 * no object carries. A caller that must fail closed when there is no committed baseline has to be able
 * to tell those apart; one that only wants "what is committed there" can write `?? []`.
 *
 * **Sorted explicitly** even though git's own output already is (REQ-SYS-07: no unordered iteration in
 * a context-building path — the working-tree walk in `loadDirectives` sorts for the same reason, and
 * the two must not differ by accident).
 *
 * @param root - Project root (the git repository).
 * @param rev - Any tree-ish git accepts: a sha, `HEAD`, `HEAD~1`, a tag.
 * @param prefix - Root-relative directory to limit the listing to; **omitted or empty lists the whole
 *   tree**, because `git ls-tree -- ''` is an error rather than a match-all. Passed verbatim after
 *   `--`, so a path that looks like a flag is never misread.
 * @returns The paths, or `null` when `rev` does not resolve (git's exit `128`).
 * @throws {@link StorageError} `E_GIT_READ_FAILED` when git cannot be spawned or its answer exceeds
 *   the read buffer (task-142 review).
 */
export function listPathsAtRev(
  root: string,
  rev: string,
  prefix = '',
  options: CommitOptions = {},
): string[] | null {
  return listBlobEntriesAtRev(root, rev, prefix, options)?.map((entry) => entry.path) ?? null;
}

/** One blob {@link listBlobEntriesAtRev} lists: its path, and whether git records it as a symbolic link. */
export interface BlobEntry {
  readonly path: string;
  /** Mode `120000`: the blob holds the link's target text, not a file's content (task-171, `bug-189`). */
  readonly symlink: boolean;
}

/** The mode git records for a symbolic link. */
const LS_TREE_SYMLINK_MODE = '120000';

/**
 * {@link listPathsAtRev} with each blob's kind: the same paths, in the same order, each marked when git
 * records it as a **symbolic link** (mode `120000`). A link is a blob, so `listPathsAtRev` lists it and
 * `readPathAtRev` reads back its target text; a reader that must not take that text for a document
 * (the Memory scan, task-171, `bug-189`) asks here instead. Same `null` and same errors as
 * {@link listPathsAtRev}.
 */
export function listBlobEntriesAtRev(
  root: string,
  rev: string,
  prefix: string,
  options: CommitOptions = {},
): BlobEntry[] | null {
  const pathspec = prefix.length === 0 ? [] : ['--', prefix];
  // `runGitRead` (task-142 review): an unresolvable revision is git's exit `128`, an expected answer
  // here, and its `fatal: Not a valid object name` stays in a captured pipe. A listing past Node's
  // 1 MiB default no longer reads as "this revision does not resolve".
  const run = runGitRead(root, ['ls-tree', '-r', '-z', '--full-tree', rev, ...pathspec], gitReadOptions(options, [0, GIT_FATAL]));
  if (run.status === GIT_FATAL) return null;
  return run.stdout
    .split('\0')
    .filter((record) => LS_TREE_BLOB_RECORD.test(record))
    .map((record) => ({ path: record.slice(record.indexOf('\t') + 1), symlink: record.startsWith(`${LS_TREE_SYMLINK_MODE} `) }))
    // Code-unit order, as `listPathsAtRev`'s plain `.sort()` always gave, without a branch.
    .sort((a, b) => Number(a.path > b.path) - Number(a.path < b.path));
}

// --- Resolving a revision, and reading MANY paths at it (task-137) -----------------------------

/**
 * The full 40-hex sha of the **commit** `rev` names, or `null` when it names none: an unknown name, an
 * unborn `HEAD` in a repository with no commits, a tree or a blob (`git rev-parse --verify --quiet`
 * exits `1` for all of them).
 *
 * The `…AtRev` readers (`src/core/loaders.ts`, `src/memory/query.ts`) resolve their revision through
 * this **once**, then read every byte at the sha, so one read cannot mix two commits when a ref moves
 * while it runs. `^{commit}` peels a tag to its commit and refuses anything that is not one.
 *
 * **A failure is not "no such commit"** (task-137 review): a `root` git cannot read as a repository
 * (exit `128`) or a `git` that cannot be spawned throws {@link StorageError} `E_GIT_READ_FAILED`, so a
 * caller never reports a broken environment as a missing revision.
 *
 * The syntax of `rev` is the caller's to check — the core resolver (`resolveRevision`,
 * `src/core/revision.ts`) refuses a malformed one before it gets here, so that nothing shaped like a
 * flag ever reaches git's argument list.
 *
 * @throws {@link StorageError} `E_GIT_READ_FAILED` when git cannot answer at all.
 */
export function resolveCommitAtRev(root: string, rev: string, options: CommitOptions = {}): string | null {
  const run = spawnSync('git', ['-C', root, 'rev-parse', '--verify', '--quiet', `${rev}^{commit}`], {
    encoding: 'utf-8',
    env: options.env ? { ...process.env, ...options.env } : process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  // `--verify --quiet` exits 1, printing nothing on stdout, for a name that resolves to no commit.
  if (run.status === 1) return null;
  if (run.error !== undefined || run.status !== 0) {
    const detail = run.error !== undefined ? run.error.message : run.stderr.trim();
    throw new StorageError(E_GIT_READ_FAILED, `git rev-parse ${rev} failed in ${root}: ${detail}`);
  }
  // `--verify` prints exactly one object name on success: the sha.
  return run.stdout.trim();
}

/** Large enough for every Memory document of a repository; a larger answer fails loudly, never truncates. */
const BATCH_READ_MAX_BUFFER = 256 * 1024 * 1024;

/** One `git cat-file --batch` header for an object it found: `<oid> SP <type> SP <size>`. */
const CAT_FILE_HEADER = /^[0-9a-f]+ ([a-z]+) (\d+)$/;

/**
 * The content of each of `paths` at revision `rev`, in input order — the bytes as UTF-8, or `null` when
 * the revision does not hold that path as a **file** — read through **one** `git cat-file --batch`
 * process instead of one `git show` per path. For a file or an absent path that is what
 * {@link readPathAtRev} answers; for a directory it is `null`, where `git show` would print the tree's
 * listing, which is no file's content.
 *
 * Why it exists (task-137): `spec-017` §1.1 reads every Memory document at `HEAD` on every workflow
 * read, and `spec-012` builds an agent context from a commit. On this repository's 664 Memory and plan
 * documents one `git show` per file took 5.49 s, the batch 0.39 s (task-137 design notes).
 *
 * **Fails closed.** A batch that cannot run, exits non-zero or answers past
 * {@link BATCH_READ_MAX_BUFFER} throws {@link StorageError} `E_GIT_READ_FAILED`: a failed read must not
 * pass for "every path is absent". `null` is reserved for a path the revision really does not hold.
 *
 * A path holding a newline or a carriage return cannot travel on the line-based batch protocol (git
 * ends the request at the newline and strips a trailing CR); it is read on its own with
 * {@link readPathAtRev}, which gives the same answer. Pass a resolved sha as `rev` when several calls
 * must see one commit.
 *
 * @param root - Project root (the git repository).
 * @param rev - A revision naming one commit — best a sha already resolved (`resolveCommitAtRev`). It
 *   travels inside each request line, so a rev holding a newline, a carriage return, a `:` or a NUL is
 *   refused with {@link StorageError} `E_INVALID_REVISION`: a newline would shift every answer onto
 *   the wrong path, and a `:` would change which path is read.
 * @param paths - Root-relative POSIX paths.
 * @returns One entry per path, in the same order.
 * @throws {@link StorageError} `E_INVALID_REVISION` for such a rev; `E_GIT_READ_FAILED` when the
 *   batch read fails.
 */
export function readPathsAtRev(
  root: string,
  rev: string,
  paths: readonly string[],
  options: CommitOptions = {},
): (string | null)[] {
  if (/[\n\r:\0]/.test(rev)) {
    throw new StorageError(E_INVALID_REVISION, `revision ${JSON.stringify(rev)} cannot be read in a batch: it holds a newline, a carriage return, a ':' or a NUL`);
  }
  const batched = paths.filter((path) => !/[\n\r]/.test(path));
  const answers = new Map<string, string | null>();
  if (batched.length > 0) {
    const run = spawnSync('git', ['-C', root, 'cat-file', '--batch'], {
      input: batched.map((path) => `${rev}:${path}\n`).join(''),
      env: options.env ? { ...process.env, ...options.env } : process.env,
      maxBuffer: BATCH_READ_MAX_BUFFER,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (run.error !== undefined || run.status !== 0) {
      const detail = run.error !== undefined ? run.error.message : run.stderr.toString('utf-8').trim();
      throw new StorageError(E_GIT_READ_FAILED, `git cat-file --batch at ${rev} failed in ${root}: ${detail}`);
    }
    const out = run.stdout;
    let offset = 0;
    for (const path of batched) {
      const newline = out.indexOf(0x0a, offset);
      if (newline === -1) throw new StorageError(E_GIT_READ_FAILED, `git cat-file --batch at ${rev} in ${root}: truncated answer`);
      const header = CAT_FILE_HEADER.exec(out.subarray(offset, newline).toString('utf-8'));
      offset = newline + 1;
      if (header === null) {
        // `<object> missing` (or `ambiguous`): the revision does not hold this path.
        answers.set(path, null);
        continue;
      }
      const size = Number(header[2]);
      // Every found object is followed by its bytes and one LF — a tree included, which is skipped.
      answers.set(path, header[1] === 'blob' ? out.subarray(offset, offset + size).toString('utf-8') : null);
      offset += size + 1;
    }
  }
  return paths.map((path) => (answers.has(path) ? answers.get(path)! : readPathAtRev(root, rev, path, options)));
}

// --- Listing a directory at MANY revisions in a constant number of processes (task-142) -------

/** The object-type bits of a tree entry's mode (`S_IFMT`). */
const MODE_TYPE_MASK = 0o170000;
/** Type bits of a subtree. Compared as bits, not as text: a legacy writer's zero-padded `040000` is a directory too (task-142 review). */
const MODE_TREE = 0o040000;
/** Type bits of a gitlink (submodule): an entry of the tree, but not a file anyone can read back. */
const MODE_GITLINK = 0o160000;

/** One parsed answer of `git cat-file --batch`: the object's type and bytes, or `null` for `missing`. */
interface BatchObject {
  readonly type: string;
  readonly oid: string;
  readonly content: Buffer;
}

/** Ask one `git cat-file --batch` for every request, answering in request order. */
function catFileBatch(root: string, requests: readonly string[], options: CommitOptions): (BatchObject | null)[] {
  if (requests.length === 0) return [];
  const out = runGitReadBytes(root, ['cat-file', '--batch'], {
    input: requests.map((request) => `${request}\n`).join(''),
    ...(options.env ? { env: options.env } : {}),
  }).stdout;
  const answers: (BatchObject | null)[] = [];
  let offset = 0;
  for (const request of requests) {
    const newline = out.indexOf(0x0a, offset);
    if (newline === -1) throw new StorageError(E_GIT_READ_FAILED, `git cat-file --batch in ${root}: truncated answer for ${request}`);
    const header = /^([0-9a-f]+) ([a-z]+) (\d+)$/.exec(out.subarray(offset, newline).toString('utf-8'));
    offset = newline + 1;
    if (header === null) {
      // `<request> missing` (or `ambiguous`): no object answers that name.
      answers.push(null);
      continue;
    }
    const size = Number(header[3]);
    answers.push({ oid: header[1] as string, type: header[2] as string, content: out.subarray(offset, offset + size) });
    offset += size + 1;
  }
  return answers;
}

/** The entries of a raw tree object: `<mode> SP <name> NUL <binary oid>`, repeated. */
function treeEntries(tree: Buffer, oidBytes: number): { mode: string; name: string; oid: string }[] {
  const entries: { mode: string; name: string; oid: string }[] = [];
  let offset = 0;
  while (offset < tree.length) {
    const space = tree.indexOf(0x20, offset);
    const nul = tree.indexOf(0x00, space);
    entries.push({
      mode: tree.subarray(offset, space).toString('utf-8'),
      name: tree.subarray(space + 1, nul).toString('utf-8'),
      oid: tree.subarray(nul + 1, nul + 1 + oidBytes).toString('hex'),
    });
    offset = nul + 1 + oidBytes;
  }
  return entries;
}

/**
 * Every **file** any of `revs` holds under `prefix`, as one sorted, de-duplicated list of
 * root-relative POSIX paths — the union of {@link listPathsAtRev} over `revs`, read in a number of git
 * processes that does not depend on how many revisions there are (`bug-178`, absorbed by `task-142`).
 *
 * `memory add`'s id counter reads every local branch and remote-tracking ref (`dl-101` §2 (a)); one
 * `git ls-tree` per ref made its cost grow with the clone's branch count. Here one
 * `git cat-file --batch` resolves every revision's tree at `prefix`, and each further level of the
 * directory costs one more batch, asking only for the subtrees no earlier answer already held — so the
 * process count is the depth of the directory under `prefix` plus one, and branches that share a
 * subtree (most of them, most of the time) read it once.
 *
 * It answers what {@link listPathsAtRev} answers, unioned — compared case by case in
 * `test/storage/list-paths-at-revs.test.ts` rather than claimed by construction: blobs only (a symbolic
 * link is a blob, a gitlink is not a file), a subtree recognised by its mode's **type bits** so a
 * legacy zero-padded `040000` is still a directory, the path bytes as UTF-8, sorted (REQ-SYS-07). The
 * prefix is taken in canonical spelling — leading `./` segments and trailing `/` are dropped — and a
 * prefix naming a file lists that file unless it ends in `/`. Other non-canonical spellings (`..`,
 * `//` inside) are not normalised, and `ls-tree`'s pathspec matching may answer them differently.
 *
 * @param root - Project root (the git repository).
 * @param revs - Revisions naming commits — best full shas. One that names no commit fails the read.
 * @param prefix - Root-relative directory or file, canonical spelling (see above); empty lists whole trees.
 * @returns The union of the paths, sorted.
 * @throws {@link StorageError} `E_GIT_READ_FAILED` when a revision names no commit or tree, or the
 *   batch read fails; `E_INVALID_REVISION` for a revision that cannot travel on the batch protocol.
 */
export function listPathsAtRevs(
  root: string,
  revs: readonly string[],
  prefix = '',
  options: CommitOptions = {},
): string[] {
  for (const rev of revs) {
    if (/[\n\r:\0]/.test(rev)) {
      throw new StorageError(E_INVALID_REVISION, `revision ${JSON.stringify(rev)} cannot be read in a batch: it holds a newline, a carriage return, a ':' or a NUL`);
    }
  }
  // Canonical spelling: `git ls-tree --full-tree -- ./docs/` reads `docs/`, and so must the batch.
  const directory = prefix.replace(/^(?:\.\/+)+/, '').replace(/\/+$/, '');
  if (/[\n\r]/.test(directory)) {
    // Not expressible on the line-based batch protocol: read revision by revision instead.
    const paths = new Set<string>();
    for (const rev of revs) {
      const listed = listPathsAtRev(root, rev, prefix, options);
      if (listed === null) throw new StorageError(E_GIT_READ_FAILED, `git ls-tree ${rev} failed in ${root}: the tree could not be listed`);
      for (const path of listed) paths.add(path);
    }
    return [...paths].sort();
  }

  // Round one: each revision's root tree (which proves it names a commit or a tree) and, under a
  // prefix, its tree at that prefix — absent when the revision has no such directory.
  const requests = revs.flatMap((rev) => (directory.length === 0 ? [`${rev}^{tree}`] : [`${rev}^{tree}`, `${rev}:${directory}`]));
  const answers = catFileBatch(root, requests, options);
  const paths = new Set<string>();
  const cache = new Map<string, Buffer>();
  let frontier: { oid: string; dir: string }[] = [];
  let oidBytes = 20;
  for (let index = 0; index < requests.length; index += 1) {
    const answer = answers[index] ?? null;
    const request = requests[index] as string;
    if (request.endsWith('^{tree}')) {
      if (answer === null || answer.type !== 'tree') {
        throw new StorageError(E_GIT_READ_FAILED, `git cat-file --batch in ${root}: ${request.slice(0, -'^{tree}'.length)} names no commit whose tree can be listed`);
      }
      oidBytes = answer.oid.length / 2;
      if (directory.length > 0) continue;
    } else if (answer !== null && answer.type === 'blob' && !prefix.endsWith('/')) {
      // A prefix naming a file lists that file, as `ls-tree -- <file>` does; with a trailing `/` it
      // names a directory, and a file there lists nothing.
      paths.add(directory);
      continue;
    } else if (answer === null || answer.type !== 'tree') {
      continue;
    }
    const tree = answer as BatchObject;
    cache.set(tree.oid, tree.content);
    frontier.push({ oid: tree.oid, dir: directory });
  }

  // Each later round reads one level deeper, fetching only the subtrees not already read.
  const seen = new Set<string>();
  while (frontier.length > 0) {
    const unread = [...new Set(frontier.map((node) => node.oid).filter((oid) => !cache.has(oid)))].sort();
    catFileBatch(root, unread, options).forEach((answer, index) => {
      if (answer === null) throw new StorageError(E_GIT_READ_FAILED, `git cat-file --batch in ${root}: tree ${unread[index]} is missing`);
      cache.set(answer.oid, answer.content);
    });
    const next: { oid: string; dir: string }[] = [];
    for (const node of frontier) {
      const key = `${node.oid}\0${node.dir}`;
      if (seen.has(key)) continue;
      seen.add(key);
      for (const entry of treeEntries(cache.get(node.oid) as Buffer, oidBytes)) {
        const path = node.dir.length === 0 ? entry.name : `${node.dir}/${entry.name}`;
        const type = Number.parseInt(entry.mode, 8) & MODE_TYPE_MASK;
        if (type === MODE_TREE) next.push({ oid: entry.oid, dir: path });
        else if (type !== MODE_GITLINK) paths.add(path);
      }
    }
    frontier = next;
  }
  return [...paths].sort();
}
