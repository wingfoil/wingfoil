/**
 * Memory query primitives (task-008-dna-memory-query-latency, REQ-PERF-02; match/rank algorithm and
 * empty-query validation hardened by task-023-implement-keyword-search, P1.12) — the performance-
 * bearing foundation `wingfoil memory search` (task-021-implement-memory-search, P1.5) builds its
 * CLI/MCP surface on top of. Deliberately NOT wired into `src/core`'s `CORE_MODULES` registry yet
 * (see the task's Execution Notes for the scoping decision): this module ships the scan +
 * keyword/frontmatter relevance primitives plus the query-validation guard, not the `--tag` CLI
 * grammar, output rendering, or the "no documents matched" exit-code contract, which are task-021's
 * own scope.
 *
 * Three things keep this fast and correct at the 1,000-Memory-document reference scale (REQ-PERF-02)
 * and satisfy P1.12's fit criteria:
 *
 * - **Path-pattern-derived scan roots** (spec-011-storage-layout): rather than walking the whole
 *   project tree, {@link computeMemoryContentRoots} derives the minimal set of directories to scan
 *   from `memory.yaml`'s per-type `path` patterns (spec-001-memory-yaml-schema) — the same
 *   predictability spec-011 calls out as what keeps `memory search`/`history` from needing a
 *   full-repo walk for every query.
 * - **Deterministic keyword/frontmatter relevance, not full-text/semantic search**
 *   (spec-012-context-loader-relevance-filtering's discipline, applied here to `memory search`
 *   rather than the Agent Context Loader spec-012 itself defines): a metadata match (title/id/tag)
 *   ranks above a body-only match (P1.12-keyword-search.feature Scenario 1), case-insensitive
 *   substring matching (Scenario 2), sorted with a total, deterministic order (REQ-SYS-07: no
 *   unordered iteration in a query-building path). Both were already satisfied by
 *   {@link searchMemoryDocuments} as shipped by task-008 — task-023 verified this against P1.12's
 *   fit criteria and added characterization tests, no algorithm change was needed.
 * - **Empty-query rejection** ({@link validateSearchQuery}, P1.12-keyword-search.feature Scenario 3):
 *   a genuine gap task-008 left open (an empty query previously matched every document instead of
 *   being rejected) — task-023 closed it with a `ValidationError.semantic` guard a caller runs before
 *   invoking {@link searchMemoryDocuments}, exiting 2 with message "empty search query".
 *
 * **Archived-exclusion (REQ-STATE-06, task-038-deprecated-excluded-from-context; set widened by
 * `dl-028-archived-states-excluded-from-context`):** {@link searchMemoryDocuments} excludes documents
 * in an archived state from its default result — an archived document "never appears in … default
 * `memory search` results" (the SARD Fit Criterion) while staying present on disk and in git history.
 * The archived set is `{deprecated, superseded}` and the single shared check is
 * `state-machine.ts`'s {@link isArchivedStatus} (it superseded task-038's `isDeprecatedStatus`), so
 * the Agent Context Loader relevance-filter (spec-012 §6, `src/core/relevance.ts`) applies the same
 * predicate rather than re-deciding what "archived" means. {@link MemorySearchOptions.includeArchived}
 * is the explicit opt-out.
 *
 * `draft` is deliberately NOT excluded here: spec-012 §6 excludes drafts from an assembled agent
 * *context*, but REQ-STATE-06 scopes default-search exclusion to archived content only, so a draft
 * document a user is actively working on stays findable. The two filters are different sets on purpose.
 *
 * **Fail closed on archived elements (task-171, `dl-038` option 1).** {@link listMemoryDocumentsByType}
 * and {@link findMemoryDocumentByTypeAndId} (and its `…AtRev` sibling) exclude archived documents by
 * default too, so a consumer that forgets to filter does not reach them; the one that must —
 * `wingfoil://memory/{type}/{id}` — passes `includeArchived: true`. {@link findMemoryDocumentById}
 * stays neutral: `memory history` and the transition verbs act on archived elements.
 *
 * **Tolerant reads (task-171, `bug-031`, `spec-017` §1.4).** A scan never throws on a document it
 * cannot read. A document whose frontmatter does not parse, and a symbolic link (never followed and
 * never parsed, by either baseline, `bug-189`), are left out and reported to the caller's
 * {@link MemoryScanOptions.onDiagnostic} as {@link W_MEMORY_UNREADABLE}, in path order. Only the
 * single-file read {@link loadMemoryDocumentSummary} still throws: its caller named that file.
 */
import { existsSync, lstatSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

import { type Diagnostic, parseYaml, ValidationError } from '../validation';

import type { MemoryYaml } from './schema';
import { isArchivedStatus } from './state-machine';
import { readDocument, readPathsAtRev, splitFrontmatter } from '../storage';
// The module, not the `../core` barrel: `src/core` imports this module, and `./revision` depends on
// `../storage` alone, so nothing here closes a load-time cycle.
import { listBlobEntriesAtCommit, resolveRevision } from '../core/revision';

/**
 * The static (placeholder-free) directory prefix of a `memory.yaml` type `path` pattern — e.g.
 * `"docs/04_memory/design/adrs/{id}.md"` -> `"docs/04_memory/design/adrs"`. A pattern whose first
 * placeholder sits in the directory portion (e.g. task's `"docs/04_memory/{release}/{id}.md"`)
 * collapses to the parent of that placeholder — `"docs/04_memory"` — because every possible
 * `{release}` value lives under it.
 */
function staticDirPrefix(pattern: string): string {
  const braceIndex = pattern.indexOf('{');
  const staticPart = braceIndex === -1 ? pattern : pattern.slice(0, braceIndex);
  const lastSlash = staticPart.lastIndexOf('/');
  return lastSlash === -1 ? '' : staticPart.slice(0, lastSlash);
}

/**
 * Derive the minimal set of root-relative directories a scan needs to walk to see every Memory
 * document declared by `memoryYaml`'s types (spec-011: path-pattern predictability, not a full-repo
 * walk). A directory already covered by another (shorter) directory in the set is dropped, so the
 * result never contains redundant, nested roots.
 */
export function computeMemoryContentRoots(memoryYaml: MemoryYaml): string[] {
  const dirs = new Set<string>();
  for (const typeEntry of Object.values(memoryYaml.types)) {
    const dir = staticDirPrefix(typeEntry.path);
    if (dir) dirs.add(dir);
  }
  const all = [...dirs].sort();
  return all.filter((dir) => !all.some((other) => other !== dir && dir.startsWith(`${other}/`)));
}

/** `W_MEMORY_UNREADABLE` (`spec-017` §1.4, §2): a Memory file a scan left out because it cannot read it. */
export const W_MEMORY_UNREADABLE = 'W_MEMORY_UNREADABLE';

/** The reason {@link W_MEMORY_UNREADABLE} gives for a symbolic link (task-171, `bug-189`). */
const SYMLINK_REASON = 'a symbolic link is not read as a Memory document';

/**
 * The one builder of a {@link W_MEMORY_UNREADABLE} diagnostic, shared by the scan here and by
 * `spec-017`'s deduction: `spec-003`'s shape, `file` repository-relative, `path` `''` (the whole file),
 * and `spec-017` §1.4's message `unreadable frontmatter in <file>: <reason>`.
 */
export function memoryUnreadableDiagnostic(file: string, reason: string): Diagnostic {
  return { code: W_MEMORY_UNREADABLE, severity: 'warning', file, path: '', message: `unreadable frontmatter in ${file}: ${reason}` };
}

/** The first line of a parse error: js-yaml appends a multi-line excerpt a one-line warning cannot carry. */
export function firstLineOf(message: string): string {
  return message.split('\n')[0]!.trim();
}

/** What every tolerant scan takes (task-171). */
export interface MemoryScanOptions {
  /**
   * Told about each file the scan left out because it cannot read it ({@link W_MEMORY_UNREADABLE}), in
   * path order. A lookup that stops at its match reports only the files it read before it. Omitted:
   * the files are left out silently.
   */
  readonly onDiagnostic?: (diagnostic: Diagnostic) => void;
}

/** {@link MemoryScanOptions} plus the archived opt-in of the type-scoped primitives (`dl-038` option 1). */
export interface MemoryTypeScanOptions extends MemoryScanOptions {
  /**
   * Include archived documents (`deprecated`, `superseded`, `isArchivedStatus`). Defaults to `false`,
   * so a consumer that forgets to filter fails closed (`dl-038` option 1); a consumer that must see
   * archived content — `wingfoil://memory/{type}/{id}`, REQ-STATE-06's "remaining present" — says so.
   */
  readonly includeArchived?: boolean;
}

/** {@link MemoryScanOptions} of {@link findMemoryDocumentById}, which alone may follow links. */
export interface MemoryIdLookupOptions extends MemoryScanOptions {
  /**
   * Walk the working tree the way it did before task-171: follow symbolic links and descend into a
   * nested repository. **Explain-only**: the transition verbs use it to word a refusal already decided
   * at `HEAD` (`command-baseline`: the working tree may explain a refusal, never decide one), so that a
   * linked document is refused by the confinement guards by name. No read that decides anything sets
   * it. Defaults to `false`.
   */
  readonly followSymlinks?: boolean;
}

/** One file under a scan root: its root-relative path, and whether it is a symbolic link. */
interface ScannedFile {
  readonly path: string;
  readonly symlink: boolean;
}

function byPath(a: ScannedFile, b: ScannedFile): number {
  return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
}

/**
 * Recursively list every `.md` entry under `root/dir`, as root-relative POSIX paths, sorted.
 *
 * One rule with the read at a commit (task-171, `bug-189`): a symbolic link is never followed — a
 * `.md` link is listed as a link, so the caller can report it, and a link to a directory is not
 * entered — and a directory holding `.git` (a nested repository, which a commit records as a gitlink
 * at most) is not entered. With `followSymlinks` the walk is the pre-task-171 one, for
 * {@link MemoryIdLookupOptions.followSymlinks}'s explain-only use.
 */
function listMarkdownFilesUnder(root: string, dir: string, followSymlinks: boolean): ScannedFile[] {
  const absoluteDir = join(root, dir);
  if (!existsSync(absoluteDir) || !statSync(absoluteDir).isDirectory()) return [];

  const out: ScannedFile[] = [];
  const walk = (current: string, relativePrefix: string): void => {
    for (const entry of readdirSync(current).sort()) {
      const full = join(current, entry);
      const relative = `${relativePrefix}/${entry}`;
      const own = lstatSync(full);
      if (own.isSymbolicLink() && !followSymlinks) {
        if (entry.endsWith('.md')) out.push({ path: relative, symlink: true });
        continue;
      }
      const stats = own.isSymbolicLink() ? statSync(full) : own;
      if (stats.isDirectory()) {
        if (!followSymlinks && existsSync(join(full, '.git'))) continue;
        walk(full, relative);
      } else if (entry.endsWith('.md')) {
        out.push({ path: relative, symlink: false });
      }
    }
  };
  walk(absoluteDir, dir);
  return out;
}

/** Every `.md` entry under the scan roots of `memoryYaml`, sorted, links marked (see {@link listMarkdownFilesUnder}). */
function scanWorkingTree(root: string, memoryYaml: MemoryYaml, followSymlinks = false): ScannedFile[] {
  const out = new Map<string, ScannedFile>();
  for (const dir of computeMemoryContentRoots(memoryYaml)) {
    for (const file of listMarkdownFilesUnder(root, dir, followSymlinks)) out.set(file.path, file);
  }
  return [...out.values()].sort(byPath);
}

/**
 * List every Memory document under `root`, as root-relative POSIX paths, sorted lexicographically
 * (REQ-SYS-07 — deterministic, no unordered iteration). Scans only the directories
 * {@link computeMemoryContentRoots} derives from `memoryYaml`, never the whole project tree. A
 * symbolic link is not a document and is not listed (task-171, `bug-189`), the same as
 * {@link listMemoryDocumentPathsAtRev} at a commit.
 */
export function listMemoryDocumentPaths(root: string, memoryYaml: MemoryYaml): string[] {
  return scanWorkingTree(root, memoryYaml)
    .filter((file) => !file.symlink)
    .map((file) => file.path);
}

/** A Memory document's parsed frontmatter (loose — no Zod schema validation, see module doc) + body. */
export interface MemoryDocumentSummary {
  readonly path: string;
  readonly frontmatter: Record<string, unknown>;
  readonly body: string;
}

/**
 * Read one Memory document and split it into its parsed frontmatter and body text, without running
 * it through any type's Zod schema — `memory search`/`history` must handle documents of every type
 * and any (even structurally imperfect) state, so this is a read, never a validation.
 *
 * This single-file read **throws** `ValidationError` (`E_YAML_PARSE_ERROR`) when the frontmatter does
 * not parse: its caller named the file. The scans built on it are what is tolerant (task-171,
 * `bug-031`): each one leaves such a document out and reports it as {@link W_MEMORY_UNREADABLE} to its
 * {@link MemoryScanOptions.onDiagnostic}, so one malformed document never fails a query about another.
 */
export function loadMemoryDocumentSummary(root: string, relativePath: string): MemoryDocumentSummary {
  const absolute = join(root, relativePath);
  return parseMemoryDocument(readDocument(absolute), relativePath, absolute);
}

/**
 * A Memory document's bytes split into parsed frontmatter and body — the one parse both baselines use
 * ({@link loadMemoryDocumentSummary} for the working tree, {@link loadMemoryDocumentsAtRev} and its
 * siblings for a commit), so they cannot drift on what a document *is*. `label` is what a parse error
 * names: the absolute path, or `<rev>:<path>`.
 */
function parseMemoryDocument(raw: string, relativePath: string, label: string): MemoryDocumentSummary {
  const { frontmatter: frontmatterText, body } = splitFrontmatter(raw);

  let frontmatter: Record<string, unknown> = {};
  if (frontmatterText) {
    const parsed = parseYaml(frontmatterText, label);
    if (parsed !== null && typeof parsed === 'object') frontmatter = parsed as Record<string, unknown>;
  }

  return { path: relativePath, frontmatter, body };
}

/**
 * {@link parseMemoryDocument} for a scan: the summary, or `undefined` after reporting the document as
 * {@link W_MEMORY_UNREADABLE} when its frontmatter does not parse. The diagnostic names the
 * repository-relative path, whichever baseline was read.
 */
function parseScanned(raw: string, relativePath: string, label: string, options: MemoryScanOptions): MemoryDocumentSummary | undefined {
  try {
    return parseMemoryDocument(raw, relativePath, label);
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
    options.onDiagnostic?.(memoryUnreadableDiagnostic(relativePath, firstLineOf(error.issues[0]?.message ?? error.message)));
    return undefined;
  }
}

/**
 * The working-tree scan every tolerant reader is built on: each document under the scan roots, parsed,
 * lazily and in path order, so a lookup can stop at its match. A link and an unparsable document are
 * reported and skipped.
 */
function* scanWorkingTreeDocuments(
  root: string,
  memoryYaml: MemoryYaml,
  options: MemoryScanOptions & { readonly followSymlinks?: boolean },
): Generator<MemoryDocumentSummary> {
  for (const file of scanWorkingTree(root, memoryYaml, options.followSymlinks === true)) {
    if (file.symlink) {
      options.onDiagnostic?.(memoryUnreadableDiagnostic(file.path, SYMLINK_REASON));
      continue;
    }
    const absolute = join(root, file.path);
    const summary = parseScanned(readDocument(absolute), file.path, absolute, options);
    if (summary !== undefined) yield summary;
  }
}

// --- The same scan at a revision (task-137) -----------------------------------------------------
//
// `spec-012` §2 pins an agent context to `stateRef`, a commit sha, and `spec-017` §1.1/§1.3 deduce
// workflow state from every Memory document "enumerated from `HEAD`'s tree in sorted path order". The
// readers below are the working-tree scan above, read at one commit instead: the same scan roots
// ({@link computeMemoryContentRoots}), the same `.md` filter, the same sort, the same parse, the same
// tolerance and the same rule for links (task-171). Each resolves `rev` once (`resolveRevision`) and
// reads every byte at that sha; an unknown or malformed rev throws `RevisionError` rather than
// answering with an empty scan. Pass the `memoryYaml` loaded at the same rev (`loadMemoryYamlAtRev`),
// and a resolved sha when several calls must see one commit.

/** Every `.md` blob under the scan roots at `sha`, sorted, links marked (git mode `120000`). */
function scanCommit(root: string, sha: string, memoryYaml: MemoryYaml): ScannedFile[] {
  const out = new Map<string, ScannedFile>();
  for (const dir of computeMemoryContentRoots(memoryYaml)) {
    for (const entry of listBlobEntriesAtCommit(root, sha, dir)) if (entry.path.endsWith('.md')) out.set(entry.path, entry);
  }
  return [...out.values()].sort(byPath);
}

/**
 * Every Memory document **commit `rev` holds**, as root-relative POSIX paths sorted the way
 * {@link listMemoryDocumentPaths} sorts the working tree's (REQ-SYS-07). A document added after `rev`,
 * or present only in the working tree, is not listed; nor is a symbolic link (task-171, `bug-189`).
 *
 * @throws `RevisionError` when `rev` is malformed or names no commit.
 */
export function listMemoryDocumentPathsAtRev(root: string, rev: string, memoryYaml: MemoryYaml): string[] {
  return scanCommit(root, resolveRevision(root, rev), memoryYaml)
    .filter((file) => !file.symlink)
    .map((file) => file.path);
}

/**
 * Read `files` at `sha` in one batch and parse them **lazily**, in path order; a path the commit does
 * not hold is left out, and a link or an unparsable document is reported and skipped (task-171). Lazy
 * so that a lookup can stop at its match, as the working-tree lookup does.
 */
function* parseMemoryDocumentsAtSha(
  root: string,
  sha: string,
  rev: string,
  files: readonly ScannedFile[],
  options: MemoryScanOptions,
): Generator<MemoryDocumentSummary> {
  const documents = files.filter((file) => !file.symlink);
  const raws = readPathsAtRev(root, sha, documents.map((file) => file.path));
  const texts = new Map(documents.map((file, i) => [file.path, raws[i] ?? null]));
  for (const file of files) {
    if (file.symlink) {
      options.onDiagnostic?.(memoryUnreadableDiagnostic(file.path, SYMLINK_REASON));
      continue;
    }
    const raw = texts.get(file.path) ?? null;
    if (raw === null) continue;
    const summary = parseScanned(raw, file.path, `${rev}:${file.path}`, options);
    if (summary !== undefined) yield summary;
  }
}

/**
 * Every Memory document **commit `rev` holds**, parsed — the paths of
 * {@link listMemoryDocumentPathsAtRev}, in its order, each read in one batch (`storage.readPathsAtRev`)
 * and split as {@link loadMemoryDocumentSummary} splits a working-tree file. This is the snapshot a
 * reader pinned to one commit builds from (`spec-012` §6 relevance, `spec-017` §4 deduction). A
 * document whose frontmatter does not parse, and a link, are left out and reported (task-171).
 *
 * @throws `RevisionError` when `rev` is malformed or names no commit.
 */
export function loadMemoryDocumentsAtRev(
  root: string,
  rev: string,
  memoryYaml: MemoryYaml,
  options: MemoryScanOptions = {},
): MemoryDocumentSummary[] {
  const sha = resolveRevision(root, rev);
  return [...parseMemoryDocumentsAtSha(root, sha, rev, scanCommit(root, sha, memoryYaml), options)];
}

/**
 * One Memory document **as commit `rev` holds it** — {@link loadMemoryDocumentSummary} at a commit.
 * `null` when that commit does not hold `relativePath` as a file. Like its working-tree counterpart,
 * this single-file read throws when the frontmatter does not parse.
 *
 * @throws `RevisionError` when `rev` is malformed or names no commit; `ValidationError` when the
 *   frontmatter does not parse.
 */
export function loadMemoryDocumentSummaryAtRev(root: string, rev: string, relativePath: string): MemoryDocumentSummary | null {
  const [raw = null] = readPathsAtRev(root, resolveRevision(root, rev), [relativePath]);
  return raw === null ? null : parseMemoryDocument(raw, relativePath, `${rev}:${relativePath}`);
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/**
 * Resolve a single Memory document by its `id` frontmatter value alone — REQ-PERF-04 /
 * task-009-mcp-resource-fetch-latency's Acceptance Criteria, which name a `wingfoil://memory/{id}`
 * benchmark fetch. This is NOT spec-004-mcp-surface-contract §2.1's Resource addressing: spec-004's
 * actual scheme is `wingfoil://memory/{type}` (collection listing) and `wingfoil://memory/{type}/{id}`
 * (single document) — there is no bare, single-segment `wingfoil://memory/{id}` form there, and this
 * `{id}` segment would collide with spec-004's `{type}` segment. task-011-mcp-resources-read-only has
 * since replaced the `wingfoil://memory/{id}` *Resource* this primitive originally backed with the
 * conformant `wingfoil://memory/{type}/{id}` form (see {@link findMemoryDocumentByTypeAndId}). This
 * bare-id primitive is what `memory history` resolves its `<id>` with, and what the transition verbs
 * use to explain a refusal; it is neutral about archived documents, since both act on them.
 *
 * A linear scan, in sorted path order, stopping at the first document whose frontmatter `id` matches
 * *exactly* (never a substring — that remains `searchMemoryDocuments`'/task-021's keyword-search
 * surface, not this primitive's). Returns `undefined` — never throws — when no document matches; a
 * document it cannot read on the way is reported to `options.onDiagnostic` and skipped (task-171).
 */
export function findMemoryDocumentById(
  root: string,
  memoryYaml: MemoryYaml,
  id: string,
  options: MemoryIdLookupOptions = {},
): MemoryDocumentSummary | undefined {
  for (const summary of scanWorkingTreeDocuments(root, memoryYaml, options)) {
    if (asString(summary.frontmatter.id) === id) return summary;
  }
  return undefined;
}

/**
 * {@link findMemoryDocumentById} **at commit `rev`** (task-247, `bug-187`): the first document, in
 * the sorted path order of {@link listMemoryDocumentPathsAtRev}, whose own frontmatter `id` matches
 * exactly, with its frontmatter and body as `rev` holds them; `undefined` when that commit holds none.
 * A document present only in the working tree, or added after `rev`, is never returned. This is the
 * lookup the Memory transition verbs decide from (`spec-006-core-domain-api` §6 item 1). A document it
 * cannot read on the way is reported to `options.onDiagnostic` and skipped (task-171).
 *
 * @throws `RevisionError` when `rev` is malformed or names no commit.
 */
export function findMemoryDocumentByIdAtRev(
  root: string,
  rev: string,
  memoryYaml: MemoryYaml,
  id: string,
  options: MemoryScanOptions = {},
): MemoryDocumentSummary | undefined {
  const sha = resolveRevision(root, rev);
  for (const summary of parseMemoryDocumentsAtSha(root, sha, rev, scanCommit(root, sha, memoryYaml), options)) {
    if (asString(summary.frontmatter.id) === id) return summary;
  }
  return undefined;
}

/** A Memory document's frontmatter-only summary — spec-004 §2.1's collection-listing shape
 * (id, title, status, tags), deliberately omitting body content to keep listing calls cheap. */
export interface MemoryDocumentFrontmatterSummary {
  readonly path: string;
  readonly id?: string;
  readonly title?: string;
  readonly status?: string;
  readonly tags: readonly string[];
}

/** Whether a document is kept under the archived default of {@link MemoryTypeScanOptions}. */
function keptByArchivedDefault(frontmatter: Record<string, unknown>, options: MemoryTypeScanOptions): boolean {
  return options.includeArchived === true || !isArchivedStatus(asString(frontmatter.status));
}

/**
 * List every Memory document whose frontmatter `type:` field equals `type` (a `memory.yaml` `types:`
 * key), as frontmatter-only summaries — spec-004 §2.1's `wingfoil://memory/{type}` collection
 * addressing (task-011-mcp-resources-read-only, REQ-INT-01). Sorted by `id` (falling back to `path`
 * when a document has no `id`) ascending (REQ-SYS-07 — deterministic, no unordered iteration).
 *
 * Membership is decided by each document's own frontmatter `type:` field, not by which directory it
 * lives in: several types' `path` patterns collapse to the *same* static directory prefix (e.g.
 * `release`/`release-line` both resolve to `docs/04_memory/planning`; `task`'s own pattern collapses
 * all the way to `docs/04_memory` itself — see {@link computeMemoryContentRoots}'s doc comment), so a
 * directory-only filter would wrongly fold sibling types' documents into this type's collection.
 *
 * Archived documents are left out unless `options.includeArchived` (task-171, `dl-038` option 1), and
 * a document the scan cannot read is reported to `options.onDiagnostic` and skipped.
 */
export function listMemoryDocumentsByType(
  root: string,
  memoryYaml: MemoryYaml,
  type: string,
  options: MemoryTypeScanOptions = {},
): MemoryDocumentFrontmatterSummary[] {
  const out: MemoryDocumentFrontmatterSummary[] = [];
  for (const { path, frontmatter } of scanWorkingTreeDocuments(root, memoryYaml, options)) {
    if (asString(frontmatter.type) !== type) continue;
    if (!keptByArchivedDefault(frontmatter, options)) continue;
    out.push({
      path,
      id: asString(frontmatter.id),
      title: asString(frontmatter.title),
      status: asString(frontmatter.status),
      tags: asStringArray(frontmatter.tags),
    });
  }
  return out.sort((a, b) => {
    const keyA = a.id ?? a.path;
    const keyB = b.id ?? b.path;
    return keyA < keyB ? -1 : keyA > keyB ? 1 : 0;
  });
}

/**
 * Resolve a single Memory document by (`type`, `id`) — spec-004 §2.1's `wingfoil://memory/{type}/{id}`
 * single-document addressing (task-011-mcp-resources-read-only, REQ-INT-01), the conformant
 * replacement for task-009's bare-`{id}` `findMemoryDocumentById` Resource usage. Both `type` and `id`
 * must match a document's own frontmatter — same directory-collision reasoning as
 * {@link listMemoryDocumentsByType} — so this never returns a document of a *different* type merely
 * because that type's path pattern happens to also resolve under the same directory. Returns
 * `undefined` — never throws — when nothing matches; surfacing that as a protocol-level "resource not
 * found" failure is the MCP Resource adapter's job (spec-004 §2.2), not this primitive's.
 *
 * An archived document matches only with `options.includeArchived` (task-171, `dl-038` option 1); the
 * single-document Resource passes it, since REQ-STATE-06 keeps archived content retrievable.
 */
export function findMemoryDocumentByTypeAndId(
  root: string,
  memoryYaml: MemoryYaml,
  type: string,
  id: string,
  options: MemoryTypeScanOptions = {},
): MemoryDocumentSummary | undefined {
  for (const summary of scanWorkingTreeDocuments(root, memoryYaml, options)) {
    if (asString(summary.frontmatter.type) === type && asString(summary.frontmatter.id) === id) {
      return keptByArchivedDefault(summary.frontmatter, options) ? summary : undefined;
    }
  }
  return undefined;
}

/**
 * {@link findMemoryDocumentByTypeAndId} **at commit `rev`**: the document whose own frontmatter `type`
 * and `id` match, with its frontmatter and body as `rev` holds them; `undefined` when that commit holds
 * none, or holds it archived without `options.includeArchived`.
 *
 * @throws `RevisionError` when `rev` is malformed or names no commit.
 */
export function findMemoryDocumentByTypeAndIdAtRev(
  root: string,
  rev: string,
  memoryYaml: MemoryYaml,
  type: string,
  id: string,
  options: MemoryTypeScanOptions = {},
): MemoryDocumentSummary | undefined {
  const sha = resolveRevision(root, rev);
  for (const summary of parseMemoryDocumentsAtSha(root, sha, rev, scanCommit(root, sha, memoryYaml), options)) {
    if (asString(summary.frontmatter.type) === type && asString(summary.frontmatter.id) === id) {
      return keptByArchivedDefault(summary.frontmatter, options) ? summary : undefined;
    }
  }
  return undefined;
}

/** Optional filters/refinements for {@link searchMemoryDocuments}. */
export interface MemorySearchOptions extends MemoryScanOptions {
  /** Only include documents whose `tags:` frontmatter contains this exact tag. */
  readonly tag?: string;
  /**
   * Opt back into archived documents (`status: deprecated` or `superseded` — `ARCHIVED_STATUSES`,
   * ratified by `dl-028-archived-states-excluded-from-context`) appearing in the result.
   * REQ-STATE-06 excludes them by default — "default … results" in the Fit Criterion. Set this only
   * for an explicit, intentional request to see archived documents (e.g. an `--status deprecated` or
   * `--status superseded` narrow); never as the default for a general keyword/tag search.
   * Defaults to `false`.
   */
  readonly includeArchived?: boolean;
}

/** One ranked search result — enough for a future CLI/MCP surface to render without re-reading the file. */
export interface MemorySearchMatch {
  readonly path: string;
  /** Always present: a document with no `id` is not an element and is never a match (task-171, `bug-164`). */
  readonly id: string;
  readonly title?: string;
  readonly tags: readonly string[];
  readonly status?: string;
  /** The document's frontmatter `type:` field (spec-010-memory-frontmatter-schema base field) —
   * projected here (task-021-implement-memory-search) alongside `status`/`tags` so `memorySearch`'s
   * `--type` filter can narrow an already-ranked result without a second file read per match. Always
   * present, as `id` is (task-171, `bug-164`). */
  readonly type: string;
  /** Query matched the title, id, or a tag (P1.12: ranks above a body-only match). */
  readonly metadataMatch: boolean;
  /** Query matched somewhere in the document body. */
  readonly bodyMatch: boolean;
}

/** `E_EMPTY_SEARCH_QUERY` field-level code (spec-009-validation-strategy §3) for a rejected empty
 * or whitespace-only `wingfoil memory search` query. */
export const E_EMPTY_SEARCH_QUERY = 'E_EMPTY_SEARCH_QUERY';

/**
 * Reject an empty or whitespace-only search query (P1.12 BDD Scenario "Error - empty query string":
 * "no search is performed" and exit code 2, message "empty search query"). Mirrors
 * `resolveTransitionTarget`'s `ValidationError.semantic` pattern (`./state-machine.ts`) so the shared
 * exit-code mapping (spec-009 §3) surfaces this as exit 2 without a bespoke error path; task-021's
 * `wingfoil memory search` CLI/MCP surface calls this on the user-supplied query string before it
 * ever reaches {@link searchMemoryDocuments}.
 *
 * Deliberately a separate guard, not a change to `searchMemoryDocuments`'s own signature/behavior:
 * `searchMemoryDocuments(root, memoryYaml, '', { tag })` remains a legitimate "browse by tag alone,
 * no keyword" call (task-008's own characterization test) — the empty-query rejection is this task's
 * (P1.12's) algorithm-level validation concern, applied at the point a *user-facing* query string is
 * about to be searched, not baked into the lower-level scan primitive that also serves tag-only
 * listing.
 */
export function validateSearchQuery(query: string): void {
  if (query.trim().length === 0) {
    throw ValidationError.semantic([
      { code: E_EMPTY_SEARCH_QUERY, path: '', file: '', message: 'empty search query' },
    ]);
  }
}

/**
 * Deterministic keyword/frontmatter search over every Memory document `memoryYaml` declares
 * (P1.5/P1.12): case-insensitive substring matching against title/id/tags (metadata) and body text,
 * optionally narrowed to one exact `tag`. A query that matches nothing returns `[]` — a successful,
 * empty result, never a thrown error (that "no documents matched" outcome is a CLI/MCP-surface
 * concern, task-021's, not this primitive's).
 *
 * Ordering is a total, deterministic order (REQ-SYS-07): metadata matches before body-only matches,
 * then by `id`, then by `path` (two files may carry one `id`) ascending — so calling this twice
 * against unchanged state always returns the exact same array.
 *
 * **Only elements, never a throw (task-171).** A match has an `id` and a `type` (`bug-164`); a file
 * with neither is left out without a report. A document whose frontmatter does not parse, or a
 * symbolic link, is left out and reported to `options.onDiagnostic` as {@link W_MEMORY_UNREADABLE}
 * (`bug-031`), so one malformed file never fails a search.
 *
 * **REQ-STATE-06:** a document whose frontmatter `status` is archived — `deprecated` or `superseded`
 * (`isArchivedStatus`, `dl-028`) — is excluded by default, so it never appears in these "default
 * `memory search` results", matching the Fit Criterion verbatim, while the file itself is untouched on
 * disk and in git history (`memory deprecate`, P1.9, never deletes it; `superseded` is reached by an
 * ordinary `approve`). Pass `options.includeArchived: true` for the one legitimate exception: an
 * explicit, intentional request to see archived documents too. `draft` documents are NOT excluded
 * here — see this module's header for why the search set and the context set differ.
 */
export function searchMemoryDocuments(
  root: string,
  memoryYaml: MemoryYaml,
  query: string,
  options: MemorySearchOptions = {},
): MemorySearchMatch[] {
  const needle = query.trim().toLowerCase();
  const matches: MemorySearchMatch[] = [];

  for (const { path, frontmatter, body } of scanWorkingTreeDocuments(root, memoryYaml, options)) {
    // Only an element is a match (task-171, `bug-164`): a file with no `id` or no `type` — a plan
    // `dl-019` grandfathered without frontmatter — is left out, silently: it is not unreadable.
    const id = asString(frontmatter.id);
    const type = asString(frontmatter.type);
    if (id === undefined || type === undefined) continue;
    const status = asString(frontmatter.status);
    if (!options.includeArchived && isArchivedStatus(status)) continue;
    const tags = asStringArray(frontmatter.tags);
    if (options.tag && !tags.includes(options.tag)) continue;

    const title = asString(frontmatter.title);

    let metadataMatch = false;
    let bodyMatch = false;
    if (needle.length > 0) {
      metadataMatch =
        (title !== undefined && title.toLowerCase().includes(needle)) ||
        id.toLowerCase().includes(needle) ||
        tags.some((tag) => tag.toLowerCase().includes(needle));
      bodyMatch = body.toLowerCase().includes(needle);
      if (!metadataMatch && !bodyMatch) continue;
    }

    matches.push({ path, id, title, tags, status, type, metadataMatch, bodyMatch });
  }

  return matches.sort((a, b) => {
    const scoreA = a.metadataMatch ? 1 : 0;
    const scoreB = b.metadataMatch ? 1 : 0;
    if (scoreA !== scoreB) return scoreB - scoreA;
    if (a.id !== b.id) return a.id < b.id ? -1 : 1;
    return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
  });
}
