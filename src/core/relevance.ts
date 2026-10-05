/**
 * `relevance-filter` (task-035-bounded-context-relevance, REQ-PERF-05) —
 * spec-012-context-loader-relevance-filtering §6's deterministic Memory-document selection unit:
 * rank and bound the set of Memory documents relevant to an active element (usually a `task`), so an
 * assembled agent context stays "curated, not full dump" (Product Brief) and satisfies REQ-PERF-05's
 * Fit Criterion verbatim — "given 1,000 Memory documents of which K are relevant to the task, the
 * assembled context contains exactly the K relevant (non-deprecated) documents and 0 others."
 *
 * This module implements ONLY spec-012 §6 (`relevance-filter`), one of the four cooperating units
 * spec-012 defines (`dna-loader`, `directive-loader`, `relevance-filter`, `context-builder`) — the
 * other three, and the canonical serialized envelope (§7), live in `./context.ts`
 * (`assembleExecutionContext`, task-176), which calls this unit at its `stateRef`. For the
 * document scan itself it wraps, not reimplements, `src/memory/query.ts`'s scan primitives
 * (task-008) — no second directory walk or frontmatter parser — and is placed in `src/core` per
 * spec-012 §1 ("folded into the `core` module"). It is re-exported from `src/core`'s barrel, so
 * `src/core` is the import surface for every consumer.
 *
 * **Exclusion set (`dl-028-archived-states-excluded-from-context`, `ready`).** Candidates are dropped
 * when their `status` is archived — `{deprecated, superseded}`, via `src/memory/state-machine.ts`'s
 * shared {@link isArchivedStatus} (the one predicate the default-search path, REQ-STATE-06, consumes
 * too) — **or** `draft`. That `draft` clause is context-only and deliberately NOT mirrored into
 * `memory search`: spec-012 §6 admits only "stable, decided and still-current content" into an
 * execution context, whereas REQ-STATE-06 scopes default-search exclusion to archived content so a
 * draft under active work stays findable. Two different sets, on purpose — see
 * {@link DRAFT_STATUS}. dl-028 also dropped spec-012 §6's former `rejected` entry, a status
 * `spec-001-memory-yaml-schema` removed from every type's machine.
 *
 * Determinism (REQ-SYS-07): no wall-clock, no randomness, no unordered map/set iteration in any
 * output-affecting path. The ranking itself, {@link selectRelevantMemoryDocuments}, is a pure function
 * of `(documents, element, limits)` and reads nothing. Where the documents come from is the caller's
 * choice: the execution-context builder (`./context.ts`, task-176) feeds it the snapshot
 * `loadMemoryDocumentsAtRev` reads at `spec-012` §2's `stateRef`, so a context is pinned to one commit;
 * {@link filterRelevantMemoryDocuments} feeds it the live working tree under `root`, whose content is
 * then part of its input. See {@link selectRelevantMemoryDocuments} for the exact ordering/bounding
 * contract.
 */
import { listMemoryDocumentPaths, loadMemoryDocumentSummary, type MemoryDocumentSummary } from '../memory/query';
import type { MemoryYaml } from '../memory/schema';
import { isArchivedStatus } from '../memory/state-machine';

/**
 * Caps that keep an assembled context "bounded, not a full dump" (spec-012 §6) — the defaults match
 * spec-012's own defaults verbatim: `maxDocs: 40`, `maxBytes: 262144` (256 KiB).
 */
export interface ContextLimits {
  /** Maximum number of Memory documents included. */
  readonly maxDocs: number;
  /** Maximum total Memory-document body bytes (UTF-8) included. */
  readonly maxBytes: number;
}

/** spec-012 §6's default {@link ContextLimits} (`maxDocs: 40`, `maxBytes: 262144` / 256 KiB). */
export const DEFAULT_CONTEXT_LIMITS: ContextLimits = { maxDocs: 40, maxBytes: 262144 };

/**
 * The active Memory element (usually a `task`) relevance is scored against — already resolved by the
 * caller (spec-012 §3 stage 1, `resolve-element`, is a separate pipeline stage; this primitive is a
 * pure `(state) -> selection` function and never reads the element document itself, per REQ-SYS-07).
 */
export interface RelevanceElementRef {
  /** The element's `memory.yaml` type (e.g. `"task"`). */
  readonly type: string;
  /** The element's `id` frontmatter value. */
  readonly id: string;
  /** The element's already-parsed frontmatter (used to derive T1 links, T2 release scope, T3
   * traceability keys, and T4 keyword/tag overlap — see {@link filterRelevantMemoryDocuments}). */
  readonly frontmatter: Record<string, unknown>;
}

/** One Memory document selected as relevant, carrying the {@link ContextLimits}-bounding fields plus
 * its computed spec-012 §6 tier `score` (exposed for callers that want to display/debug ranking). */
export interface RelevantMemoryDocument {
  readonly path: string;
  readonly type?: string;
  readonly id?: string;
  readonly title?: string;
  readonly status?: string;
  readonly frontmatter: Record<string, unknown>;
  readonly body: string;
  /** `1000*T1 + 100*T2 + 10*T3 + overlapCount(T4)` (spec-012 §6) — always `> 0` for an included doc. */
  readonly score: number;
}

/** P5.3.3-relevance-filtering.feature's "Edge - no documents pass the relevance threshold" note,
 * verbatim: `'a note "no relevant Memory found for task" is recorded'`. */
export const NO_RELEVANT_MEMORY_NOTE = 'no relevant Memory found for task';

/**
 * {@link filterRelevantMemoryDocuments}'s result: the bounded, ordered set of relevant documents, plus
 * {@link NO_RELEVANT_MEMORY_NOTE} when — and only when — **nothing passed the relevance threshold**
 * (mirrors `memorySearchFn`'s `message`-only-when-empty convention in `src/core/index.ts`).
 *
 * The note is keyed to the *scored* set, never to the *bounded* one: "no relevant Memory found for
 * task" is a factual claim, and documents that scored as relevant but did not fit inside
 * {@link ContextLimits} were found — they were merely not carried. In that case `documents` is empty
 * and `note` is `undefined`, because the filter cannot honestly assert the stronger statement.
 */
export interface RelevantMemoryResult {
  readonly documents: readonly RelevantMemoryDocument[];
  readonly note?: string;
}

/**
 * spec-012 §6's per-tier score weights, isolated as named constants so the scoring formula
 * (`1000*T1 + 100*T2 + 10*T3 + overlapCount(T4)`) reads as tiers, not magic numbers. Each weight is a
 * strict order of magnitude above the next so any T(n) hit outranks every combination of lower tiers
 * (a single doc can carry at most a handful of T4 overlaps, far below `TIER_3_TRACEABILITY = 10`).
 */
const TIER_1_EXPLICIT_LINK = 1000;
const TIER_2_RELEASE_SCOPE = 100;
const TIER_3_TRACEABILITY = 10;
// T4 (keyword/tag overlap) contributes its raw overlap count, weight 1 — spec-012 §6.

/** Frontmatter fields spec-012 §6 T1 treats as explicit links. Each may carry a single id or a list
 * of them — see {@link asLinkIds} and `dl-045-absorbed-bug-back-reference`. */
const LINK_FRONTMATTER_FIELDS = ['adr', 'spec', 'dl', 'bug'] as const;

/**
 * `draft` — the one status excluded from an assembled context *beyond* the shared archived set.
 * spec-012 §6 admits only "stable, decided and still-current content" into an execution context, so a
 * draft — a document whose content is not yet submitted, let alone agreed — is dropped regardless of
 * score. Kept as a named constant rather than folded into `isArchivedStatus` precisely because it is
 * NOT archived: `memory search` must keep returning drafts (REQ-STATE-06 excludes archived content
 * only), and collapsing the two sets would hide in-progress work from the search surface.
 */
const DRAFT_STATUS = 'draft';

/**
 * True when a candidate's `status` bars it from an assembled agent context (spec-012 §6): the shared
 * archived set `{deprecated, superseded}` ({@link isArchivedStatus}, ratified by
 * `dl-028-archived-states-excluded-from-context`) widened by {@link DRAFT_STATUS}.
 * A document with no `status` frontmatter at all is not excluded — absence is not a decision.
 */
function isExcludedFromContext(status: string | undefined): boolean {
  return status === DRAFT_STATUS || isArchivedStatus(status);
}

/** A traceability token: a feature id (`P5.3.3`, `P1.9`, ...) or a SARD requirement id
 * (`REQ-PERF-05`, `REQ-SYS-07`, ...) — spec-012 §6 T3's "shared traceability keys". */
const TRACEABILITY_PATTERN = /\bP\d+(?:\.\d+)+\b|\bREQ-[A-Z]+-\d+\b/g;

/** Lowercase alphanumeric word tokens — spec-012 §6 T4's "title tokens". */
const WORD_PATTERN = /[a-z0-9]+/g;

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

/**
 * Read a {@link LINK_FRONTMATTER_FIELDS} value as the list of ids it names, accepting BOTH a single
 * string and an array of them.
 *
 * `dl-045-absorbed-bug-back-reference` made the task `bug:` field a list, so a bug absorbed into an
 * existing task's Acceptance Criteria — rather than given its own fix task — keeps the back-reference
 * `bug.sync_state` binds to. Reading these fields with a bare {@link asString} would have made that
 * change **silently lossy**: `asString` returns `undefined` for an array, so an absorbed bug would
 * stop scoring as a T1 explicit link and drop out of its own host task's assembled context, with no
 * error to notice.
 *
 * Both shapes stay valid on purpose. Every fix task written before dl-045 carries a single id, and
 * `adr`/`spec`/`dl` are unchanged by that decision — narrowing to arrays would break them all.
 */
function asLinkIds(value: unknown): readonly string[] {
  const single = asString(value);
  return single !== undefined ? [single] : asStringArray(value);
}

/** T1: the set of ids the element's frontmatter explicitly references (`adr`, `spec`, `dl`, `bug`,
 * `depends_on`) — spec-012 §6. Insertion order follows {@link LINK_FRONTMATTER_FIELDS}'s fixed
 * declaration order, then each field's own array order, then `depends_on`'s (REQ-SYS-07: no
 * unordered iteration). */
function collectLinkedIds(frontmatter: Record<string, unknown>): Set<string> {
  const ids = new Set<string>();
  for (const field of LINK_FRONTMATTER_FIELDS) {
    for (const value of asLinkIds(frontmatter[field])) {
      if (value.length > 0) ids.add(value);
    }
  }
  for (const dependency of asStringArray(frontmatter.depends_on)) ids.add(dependency);
  return ids;
}

/** T3: the set of `P*`/`REQ-*` traceability tokens found across every string-valued frontmatter field
 * (`ref`, `tags`, ...) and, when supplied, the document body — spec-012 §6. */
function collectTraceabilityKeys(frontmatter: Record<string, unknown>, body?: string): Set<string> {
  const keys = new Set<string>();
  const scan = (text: string): void => {
    for (const match of text.matchAll(TRACEABILITY_PATTERN)) keys.add(match[0]);
  };
  for (const value of Object.values(frontmatter)) {
    if (typeof value === 'string') scan(value);
    else if (Array.isArray(value)) for (const entry of value) if (typeof entry === 'string') scan(entry);
  }
  if (body !== undefined) scan(body);
  return keys;
}

/** T4: the element/document's keyword set — its `tags:` entries plus its title's lowercase word
 * tokens — spec-012 §6 ("docs whose tags: or title tokens intersect the element's tags/title
 * tokens"). */
function collectKeywords(frontmatter: Record<string, unknown>): Set<string> {
  const keywords = new Set<string>();
  for (const tag of asStringArray(frontmatter.tags)) keywords.add(tag.toLowerCase());
  const title = asString(frontmatter.title);
  if (title !== undefined) for (const word of title.toLowerCase().match(WORD_PATTERN) ?? []) keywords.add(word);
  return keywords;
}

function intersectionSize(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  let count = 0;
  for (const value of a) if (b.has(value)) count += 1;
  return count;
}

function hasIntersection(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  for (const value of a) if (b.has(value)) return true;
  return false;
}

/** T2: is `documentPath` under the element's release scope? True when the element declares a
 * `release` and either the candidate document's own `release:` frontmatter matches it exactly, or its
 * path contains that release as a path segment (covers release-line-scoped docs whose own frontmatter
 * has no `release` field) — spec-012 §6 ("docs under the element's release / release-line path"). */
function isSameReleaseScope(elementRelease: string | undefined, documentPath: string, documentFrontmatter: Record<string, unknown>): boolean {
  if (elementRelease === undefined) return false;
  return documentPath.includes(`/${elementRelease}/`) || asString(documentFrontmatter.release) === elementRelease;
}

/**
 * Rank and bound the Memory documents relevant to `element` (spec-012 §6, REQ-PERF-05), scanning the
 * **working tree** under `root`: every document `memoryYaml` declares, in
 * {@link listMemoryDocumentPaths}'s already-sorted order (task-008), handed to
 * {@link selectRelevantMemoryDocuments}. An execution context does not use this reader: it ranks the
 * snapshot read at its `stateRef` (`./context.ts`).
 */
export function filterRelevantMemoryDocuments(
  root: string,
  memoryYaml: MemoryYaml,
  element: RelevanceElementRef,
  limits: ContextLimits = DEFAULT_CONTEXT_LIMITS,
): RelevantMemoryResult {
  const documents = listMemoryDocumentPaths(root, memoryYaml).map((path) => loadMemoryDocumentSummary(root, path));
  return selectRelevantMemoryDocuments(documents, element, limits);
}

/**
 * Rank and bound `documents` by their relevance to `element` (spec-012 §6, REQ-PERF-05). A pure
 * function of its arguments: it reads nothing, so the caller decides which state is ranked — the
 * working tree ({@link filterRelevantMemoryDocuments}) or one commit (`./context.ts`, `stateRef`).
 * Deterministic end to end (REQ-SYS-07):
 *
 * 1. **Exclude** the element's own document (never relevant to itself) and any document
 *    {@link isExcludedFromContext} bars — `draft` plus the shared archived set `{deprecated,
 *    superseded}` (`dl-028`; the archived half is the same predicate REQ-STATE-06 applies to default
 *    `memory search`, the `draft` half is context-only).
 * 2. **Score** each remaining document: `1000*T1 + 100*T2 + 10*T3 + overlapCount(T4)` — T1 explicit
 *    link, T2 same release scope, T3 shared traceability key, T4 keyword/tag overlap count
 *    (spec-012 §6's exact formula). A document scoring `0` (no tier hit at all) is **not relevant**
 *    and is dropped — this is the relevance threshold P5.3.3-relevance-filtering.feature's "Edge - no
 *    documents pass the relevance threshold" scenario exercises.
 * 3. **Order**: score DESC, then `type` ASC, then `id` ASC (falling back to `path` when a document has
 *    no `id`) — a total, deterministic tie-break (spec-012 §6/REQ-SYS-07). The input order therefore
 *    never reaches the output.
 * 4. **Bound**: walk in that order, including documents until either `limits.maxDocs` or
 *    `limits.maxBytes` (summed UTF-8 body bytes) would be exceeded, then **stop** — never skip a
 *    lower-ranked document to fit under a cap while a higher-ranked one was excluded, and never
 *    partially include a document (spec-012 §6's "deterministic truncation").
 *
 * Returns {@link NO_RELEVANT_MEMORY_NOTE} in `note` only when **step 2 left nothing** — i.e. no
 * document passed the relevance threshold at all (P5.3.3's edge-case scenario, verbatim wording).
 * When documents scored as relevant but step 4's caps admitted none of them, `documents` is empty and
 * `note` is omitted: relevant Memory *was* found, so the note would assert something false.
 */
export function selectRelevantMemoryDocuments(
  documents: readonly MemoryDocumentSummary[],
  element: RelevanceElementRef,
  limits: ContextLimits = DEFAULT_CONTEXT_LIMITS,
): RelevantMemoryResult {
  const linkedIds = collectLinkedIds(element.frontmatter);
  const elementRelease = asString(element.frontmatter.release);
  const elementTraceability = collectTraceabilityKeys(element.frontmatter);
  const elementKeywords = collectKeywords(element.frontmatter);

  const scored: RelevantMemoryDocument[] = [];
  for (const { path, frontmatter, body } of documents) {
    const type = asString(frontmatter.type);
    const id = asString(frontmatter.id);
    const status = asString(frontmatter.status);

    if (isExcludedFromContext(status)) continue;
    if (type === element.type && id === element.id) continue;

    const t1 = id !== undefined && linkedIds.has(id);
    const t2 = isSameReleaseScope(elementRelease, path, frontmatter);
    const t3 = hasIntersection(elementTraceability, collectTraceabilityKeys(frontmatter, body));
    const t4OverlapCount = intersectionSize(elementKeywords, collectKeywords(frontmatter));

    const score =
      (t1 ? TIER_1_EXPLICIT_LINK : 0) +
      (t2 ? TIER_2_RELEASE_SCOPE : 0) +
      (t3 ? TIER_3_TRACEABILITY : 0) +
      t4OverlapCount;
    if (score <= 0) continue;

    scored.push({ path, type, id, title: asString(frontmatter.title), status, frontmatter, body, score });
  }

  scored.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    const typeA = a.type ?? '';
    const typeB = b.type ?? '';
    if (typeA !== typeB) return typeA < typeB ? -1 : 1;
    const idA = a.id ?? a.path;
    const idB = b.id ?? b.path;
    return idA < idB ? -1 : idA > idB ? 1 : 0;
  });

  const included: RelevantMemoryDocument[] = [];
  let totalBytes = 0;
  for (const doc of scored) {
    if (included.length >= limits.maxDocs) break;
    const docBytes = Buffer.byteLength(doc.body, 'utf-8');
    if (totalBytes + docBytes > limits.maxBytes) break;
    included.push(doc);
    totalBytes += docBytes;
  }

  // The note is keyed to `scored`, NOT to `included`: an empty `included` with a non-empty `scored`
  // means relevant Memory existed and was bounded out, which the note must not claim away.
  return scored.length === 0 ? { documents: included, note: NO_RELEVANT_MEMORY_NOTE } : { documents: included };
}
