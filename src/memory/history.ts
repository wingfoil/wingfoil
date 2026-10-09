/**
 * Memory history primitive (task-008-dna-memory-query-latency, REQ-PERF-02) — the git-log walk
 * underneath `wingfoil memory history` (P1.10), which shipped in `task-049-memory-history` as
 * `src/core`'s `memoryHistory` operation. Per ADR-007 (stateless-state-derivation), git history is
 * the sole audit trail for a Memory element's transitions — there is no secondary `.wingfoil/state/`
 * log to query instead — so this walks `git log` directly over the element's file.
 *
 * Scope (see task-008's Execution Notes): this returns *structured commit records* (sha, author
 * name/email, ISO-8601 author date, subject, body) — the walk itself. Deriving a human-facing
 * "state change" (e.g. "pending -> backlog") from the commit body's `Approver:`/`Reason:` lines
 * (CLAUDE.md §5.1) is not this primitive's concern; the raw `body` field carries that text verbatim
 * for a caller to parse, and `./audit`'s `reconstructMemoryTransitions` is the caller that does — the
 * `memoryHistory` operation projects that reconstruction rather than re-reading this walk itself.
 *
 * The `git log` walk/record-splitting plumbing itself lives in `./git-log` (factored out by
 * task-015-complete-audit-trail, which needs the same plumbing for its own attribution audit) — this
 * module owns only the `MemoryHistoryEntry` shape and the `--follow` single-document semantics.
 *
 * Those `--follow` semantics are this module's real subject, and they are not the ones the flag's
 * name suggests (`task-089-fix-history-walk-attributes-only-real-commits`,
 * `bug-077-history-follow-attributes-template-commits`). `--follow` does not only follow renames:
 * git's path search runs with **copy** detection enabled, so when the path is absent from a parent
 * commit git will accept a source that still exists there. Every Memory element is created by
 * copying its type's template, which `wingfoil init` has already committed — so the walk crossed
 * that copy edge and reported the commit that added the TEMPLATE as an entry of the element's own
 * history, carrying a real sha, author and timestamp with every derived field null. See
 * {@link findElementCreationSha} for the distinction that resolves it and why rename-following is
 * kept rather than traded away.
 */
import { E_GIT_READ_FAILED, requireCommitName, runGitRead, StorageError } from '../storage';

import { walkGitLogFields } from './git-log';

/** One commit touching a Memory document, in the shape `wingfoil memory history` will render from. */
export interface MemoryHistoryEntry {
  readonly sha: string;
  readonly authorName: string;
  readonly authorEmail: string;
  /** Author date, ISO-8601 (`git log --format=%aI`) — never the commit/system date. */
  readonly date: string;
  readonly subject: string;
  readonly body: string;
  /**
   * The root-relative path the document occupied **at this commit**, which is not in general the
   * path the caller asked for: the walk follows renames, so a commit older than one holds the
   * element under its former name ({@link collectHistoricalPaths}).
   *
   * Carried on the entry rather than recomputed by each consumer, because the walk is the only thing
   * that knows it — `git log --follow --name-status` reports every `R<score> <old> <new>` edge it
   * crosses. A reader that instead asks git for the CURRENT path at every sha gets nothing back at
   * the pre-rename ones, which is
   * `bug-080-read-status-at-reads-the-current-path-at-pre-rename-commits`
   * (`task-097-memory-history-reads-each-commit-at-its-historical-path`).
   */
  readonly path: string;
}

const LOG_FIELDS = ['%H', '%an', '%ae', '%aI', '%s', '%b'];

/**
 * Run one of this module's probes through `runGitRead` (`src/storage/git-read.ts`, task-142) and
 * return its stdout, or throw `StorageError` `E_GIT_READ_FAILED` whose message says what the failure
 * leaves unknown (`what`) and then git's own text. stderr is captured, never inherited: git's `fatal:`
 * reaches the caller inside this error, not the operator's terminal on its own
 * (`bug-093-two-more-git-calls-inherit-the-operator-stderr`, `bug-097`).
 */
function readOrExplain(root: string, args: readonly string[], what: string): string {
  try {
    return runGitRead(root, args).stdout;
  } catch (error) {
    throw new StorageError(E_GIT_READ_FAILED, `${what}: ${(error as Error).message.replace(/^E_GIT_READ_FAILED: /, '')}`);
  }
}

/**
 * The same `--follow` walk as {@link getMemoryHistory}, narrowed by git to the commits whose edge for
 * this path is a **copy**, and printing nothing but the sha. Deliberately a second `git log`
 * invocation rather than extra output threaded through the first: `walkGitLogFields` recovers
 * records by field arity over a stream of `<field>NUL` groups, so anything git appends outside the
 * `--format` string — `--name-status` output, for instance — would be read as the next record's
 * first field (task-086).
 *
 * Like every `git log` reader, it runs with `--no-show-signature` (`task-268`, `bug-291`): under
 * `log.showSignature` git printed "No signature" here as the first line, read as the creation commit.
 */
const CREATION_PROBE_ARGS = ['--follow', '--diff-filter=C', '--format=%H'];

/**
 * The sha of the commit that introduced `relativePath` as a COPY of a file that outlives it — the
 * element's own creation — or `null` when the followed chain contains no copy edge at all.
 *
 * This is the distinction the fix turns on. `git log --follow` can change path across two different
 * kinds of edge, and they mean opposite things for an audit trail:
 *
 *  - **`R` (rename)** — the element continuing under a new name. Keep following. This is not a
 *    hypothetical requirement: the Memory folder's `planning/v1/*` became `planning/rl-v1/*` in
 *    one commit in this repository, moving five `release` elements at once, because the `release`
 *    type's `path` pattern interpolates the release-line id (`memory.yaml`). For one of them a plain
 *    `git log -- <path>` returns a single commit where the followed walk returns seven, so dropping
 *    `--follow` would delete five sixths of that element's recorded history.
 *  - **`C` (copy)** — the element being born out of a file that still exists. `wingfoil memory add`
 *    copies the type's template verbatim (CLAUDE.md §5.1), and `wingfoil init` has already committed
 *    that template, so this edge is how every scaffolded element begins. Everything strictly older
 *    than it is the template's history, not the element's.
 *
 * Only the newest copy edge matters — it is the element's own creation; any older one belongs to
 * whatever the source itself was copied from. `git log` prints newest first, so that is the first
 * line.
 *
 * **Throws** `StorageError` `E_GIT_READ_FAILED` — never returns `null` — when git itself fails,
 * with git's own message in the error (`readOrExplain`). "git could not answer" and "this
 * element was never copied from anything" are different answers, and collapsing the first into the
 * second would silently restore the phantom entry.
 * {@link getMemoryHistory} calls this only once the main walk has already returned commits, so at
 * that point the repository and the path are both known good and a failure here is genuinely
 * exceptional.
 *
 * @param root - Absolute path of the repository to walk.
 * @param relativePath - The element's root-relative path, as {@link getMemoryHistory} takes it.
 * @returns The creation commit's full sha, or `null` when the chain has no copy edge.
 */
export function findElementCreationSha(root: string, relativePath: string): string | null {
  const stdout = readOrExplain(
    root,
    ['log', '--no-show-signature', ...CREATION_PROBE_ARGS, '--', relativePath],
    `git log --follow --diff-filter=C failed for ${relativePath}: cannot establish where the element was created`,
  );

  const newestCopy = stdout.split('\n').find((line) => line.trim().length > 0);
  return newestCopy === undefined ? null : requireCommitName(newestCopy.trim(), 'git log --follow --diff-filter=C');
}

/**
 * Drop the part of an oldest-first walk that precedes the element's creation, keeping the creation
 * commit itself — the ancestry `--follow` reached through a copy edge, which belongs to the file the
 * element was copied from. `creationSha` of `null` (no copy edge: the document was authored in
 * place) leaves the walk untouched.
 *
 * Pure: no git, no filesystem. Separated from {@link findElementCreationSha} so the truncation rule
 * and the invariant below are exercised directly rather than through a repository fixture.
 *
 * **Throws** when `creationSha` is absent from `entries`. The two walks are the same walk — one is
 * the other filtered by git — so a sha in the narrower one that is missing from the wider one is a
 * broken invariant, not a case to absorb. Defaulting to "no truncation" there would report the
 * phantom entry again while reporting success.
 *
 * @param entries - The full `--follow` walk, oldest first.
 * @param creationSha - The element's creation commit, from {@link findElementCreationSha}.
 * @returns `entries` from the creation commit onward (a new array; `entries` is not mutated).
 */
export function dropPreCreationAncestry(
  entries: readonly MemoryHistoryEntry[],
  creationSha: string | null,
): MemoryHistoryEntry[] {
  if (creationSha === null) return [...entries];

  const creationIndex = entries.findIndex((entry) => entry.sha === creationSha);
  if (creationIndex === -1) {
    throw new Error(
      `creation commit ${creationSha} is not present in the history walk it was derived from`,
    );
  }
  return entries.slice(creationIndex);
}

/**
 * The same `--follow` walk again, printing each commit's sha followed by its name-status line for
 * the followed path. A third `git log` invocation for the same reason as {@link CREATION_PROBE_ARGS}
 * and stated in full there: `--name-status` output is appended OUTSIDE the `--format` string, and
 * `walkGitLogFields` recovers records by field arity over a stream of `<field>NUL` groups, so it
 * would read those lines as the next record's first field (task-086).
 *
 * `core.quotePath=false` is set for the invocation (never written to the repository's config) so a
 * path carrying non-ASCII bytes arrives as its own UTF-8 rather than as git's `"\303\251"` escape
 * form — the parser would otherwise have to un-escape it to hand `git show` something that resolves.
 * Load-bearing, and pinned: `test/memory/history-rename-path.test.ts` (task-142 AC3, `bug-097`) goes
 * red when the flag is removed. `--no-show-signature`, as on every `git log` reader (`task-268`,
 * `bug-291`), keeps signature text out of the lines parsed as names.
 */
const PATH_PROBE_ARGS = ['-c', 'core.quotePath=false'];
const PATH_PROBE_LOG_ARGS = ['--follow', '--name-status', '--format=%H'];

/**
 * Where `relativePath`'s document lived at each commit of its `--follow` walk, keyed by sha.
 *
 * `git log --follow --name-status` prints, per commit, the sha then that commit's status line for
 * the followed path — `A <path>`, `M <path>`, `D <path>`, or `R<score> <old> <new>` at a rename. The
 * path the file occupies **at** a commit is always the LAST tab-separated field of that line: the
 * destination of a rename, the single path otherwise. Everything older than that rename then reports
 * the old path, which is the whole point — it is what
 * `git show <sha>:<path>` needs in order to resolve at all.
 *
 * A commit git reports no status line for (it shows no diff for a merge without `-m`) is simply
 * absent from the map; {@link attachHistoricalPaths} decides what to do about that, so the rule is
 * testable without a repository.
 *
 * **Throws** `StorageError` `E_GIT_READ_FAILED` — never returns an empty map — when git itself
 * fails, with git's own message in the error (`readOrExplain`), for the same reason
 * {@link findElementCreationSha} does: "git could not answer" and "this element was never renamed"
 * are different answers, and folding the first into the second silently reinstates `bug-080` by
 * reading every commit at the current path again. {@link getMemoryHistory} calls this only once the
 * main walk has returned commits, so the repository and the path are both known good by then.
 *
 * @param root - Absolute path of the repository to walk.
 * @param relativePath - The element's current root-relative path, as the caller named it.
 * @returns sha → the root-relative path the document occupied at that commit.
 */
export function collectHistoricalPaths(root: string, relativePath: string): Map<string, string> {
  const stdout = readOrExplain(
    root,
    [...PATH_PROBE_ARGS, 'log', '--no-show-signature', ...PATH_PROBE_LOG_ARGS, '--', relativePath],
    `git log --follow --name-status failed for ${relativePath}: cannot establish where the element lived at each commit`,
  );

  return parseHistoricalPaths(stdout);
}

/**
 * Parse {@link collectHistoricalPaths}' `git log --follow --name-status --format=%H` output into
 * sha → the path at that commit. Pure: no git. Every line without a tab must be a full commit name and
 * a status line must follow one; anything else is refused with `StorageError` `E_GIT_READ_FAILED`
 * (`requireCommitName`) rather than skipped (`task-268`, `bug-291`).
 *
 * @param stdout - The probe's output.
 * @returns sha → the root-relative path the document occupied at that commit (first status line wins).
 */
export function parseHistoricalPaths(stdout: string): Map<string, string> {
  const pathBySha = new Map<string, string>();
  let currentSha: string | null = null;
  for (const line of stdout.split('\n')) {
    if (line === '') continue;
    // A line with no tab is `--format=%H`'s: a commit name, or refused — never skipped (task-268,
    // `bug-291`: signature text printed under `log.showSignature` was skipped here, silently).
    if (!line.includes('\t')) {
      currentSha = requireCommitName(line, 'git log --follow --name-status');
      continue;
    }
    // A status line before any name is not what `--format=%H` prints: refused like any other line.
    if (currentSha === null) currentSha = requireCommitName(line, 'git log --follow --name-status');
    if (pathBySha.has(currentSha)) continue;
    const fields = line.split('\t');
    pathBySha.set(currentSha, fields[fields.length - 1] as string);
  }
  return pathBySha;
}

/**
 * Stamp each walked commit with the path the element occupied at it, from
 * {@link collectHistoricalPaths}' map.
 *
 * Pure: no git, no filesystem — separated from the probe for the same reason
 * {@link dropPreCreationAncestry} is separated from {@link findElementCreationSha}, so the rule and
 * its fallback are exercised directly rather than through a repository fixture.
 *
 * Falls back to `fallbackPath` (the path the caller named) for a sha the probe reported no diff for,
 * rather than throwing: unlike the creation probe's invariant, an absent entry here is not evidence
 * of a broken walk — git shows no diff for a merge commit — and the fallback is precisely the
 * behaviour that shipped before this field existed, so it can degrade no further than the status quo.
 *
 * @param entries - The `--follow` walk, oldest first.
 * @param pathBySha - sha → historical path, from {@link collectHistoricalPaths}.
 * @param fallbackPath - The element's current root-relative path.
 * @returns A new array; `entries` is not mutated.
 */
export function attachHistoricalPaths(
  entries: readonly MemoryHistoryEntry[],
  pathBySha: ReadonlyMap<string, string>,
  fallbackPath: string,
): MemoryHistoryEntry[] {
  return entries.map((entry) => ({ ...entry, path: pathBySha.get(entry.sha) ?? fallbackPath }));
}

/**
 * Walk every commit that touched `relativePath`, oldest first (P1.10-memory-history.feature: "lists
 * ... entries in chronological order") — `git log` itself returns newest-first, reversed by
 * {@link walkGitLogFields} — and only those commits. The walk follows renames, so an element moved on
 * disk keeps its history, but stops at the element's own creation rather than continuing into the
 * template it was copied from ({@link findElementCreationSha}).
 *
 * Returns `[]` when no commit touches the path, or the repository has none yet — "document not
 * found" is a caller/feature-layer concern (task-021/026-style CLI error rendering), not this
 * primitive's. That is also why the creation probe runs only on a non-empty walk: on an empty one
 * there is nothing to truncate and nothing to conclude from git's silence — and the same for the path
 * probe. **A git failure throws** `StorageError` `E_GIT_READ_FAILED` — a `root` that is not a
 * repository included — rather than reading as an empty history (task-142, `bug-072`; see
 * {@link walkGitLogFields}).
 *
 * Every returned entry carries the path the element occupied at its own commit
 * ({@link MemoryHistoryEntry.path}), not the one the caller named. That is what makes this walk the
 * single source of truth for "where was this file at this commit": a consumer that reads content per
 * commit — `./audit`'s `reconstructMemoryTransitions`, which reads the frontmatter `status:` — must
 * take the path from here rather than re-using its own argument (`bug-080`).
 */
export function getMemoryHistory(root: string, relativePath: string): MemoryHistoryEntry[] {
  const records = walkGitLogFields(root, LOG_FIELDS, [relativePath], ['--follow']);

  // One field per slot, `%b` included. Two consequences of task-086's arity-based framing, both
  // deliberate:
  //
  //  - The body arrives WHOLE even when it carries a character that used to look like a delimiter.
  //    `%b` being LAST was the only thing that made a `0x1f` in a reason survive before, via an
  //    explicit `bodyParts.join(FIELD_SEP)` that undid the split it had just caused; that accident
  //    and the reassembly compensating for it are both gone (bug-050).
  //  - Every record has exactly `LOG_FIELDS.length` entries — `walkGitLogFields` emits whole groups
  //    or none — so the per-slot `= ''` defaults this used to carry could never fire. They are read
  //    as the cast below instead of kept as six permanently-unreachable branches.
  const entries = records.map((record) => {
    const [sha, authorName, authorEmail, date, subject, body] = record as [
      string,
      string,
      string,
      string,
      string,
      string,
    ];
    return { sha, authorName, authorEmail, date, subject, body: body.trim(), path: relativePath };
  });

  if (entries.length === 0) return entries;
  const located = attachHistoricalPaths(entries, collectHistoricalPaths(root, relativePath), relativePath);
  return dropPreCreationAncestry(located, findElementCreationSha(root, relativePath));
}
