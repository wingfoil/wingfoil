/**
 * REQ-PERF-02 acceptance benchmark (task-008-dna-memory-query-latency):
 *
 *   "wingfoil memory search", "wingfoil dna show", and "wingfoil memory history" each return in
 *   < 1,000 ms (p95) on the reference repository. Measurement conditions: p95 over >= 20 runs on a
 *   reference repository of 1,000 Memory documents.
 *   (docs/02_requirements/03_sard/02_performance-nfr.md)
 *
 * task-008-dna-memory-query-latency originally benchmarked the query-path *primitives* it was scoped
 * to build, because no CLI command existed to measure. Two of the three named commands have since
 * been implemented, and each feature task re-pointed its own row at the REAL, REGISTERED
 * `CORE_MODULES` operation — the exact `CoreFn` the CLI command dispatches to, config load, argument
 * handling and result envelope included:
 *
 * - **`memory search`** -> `memory.memorySearch` (task-021-implement-memory-search), replacing a direct
 *   `searchMemoryDocuments` call.
 * - **`memory history`** -> `memory.memoryHistory` (task-049-memory-history), replacing a direct
 *   `getMemoryHistory` call. This matters: the registered op also resolves the bare `<id>` positional
 *   to a document (`findMemoryDocumentById`, a scan over all 1,000 reference documents) and
 *   reconstructs each transition's state from frontmatter (`git show` per commit) — real cost the raw
 *   git-log walk never paid, and cost a real `wingfoil memory history <id>` invocation does pay.
 * - **`dna show`** still measures `loadDnaYaml`, which IS the whole body of the registered `dnaShow`
 *   op for the no-section case (`src/core/index.ts`) — a bounded single-file read either way.
 *
 * Each timed run redoes the full pillar-config load + scan a real CLI invocation would redo (no
 * warm in-process cache carried across runs), so the measurement reflects one command's real cost.
 *
 * **This file owns BDD P1.5's and P1.10's under-1-second clauses** (task-067-fix-cli-latency-assertion,
 * `bug-011-cli-latency-assertion-measures-spawn-contention`; extended to P1.10 by task-049).
 * `P1.5-memory-search.feature`'s "Find a
 * decision by keyword" scenario was previously timed in `test/cli/program.integration.test.ts` by
 * taking a wall-clock reading around a **spawned** `node dist/cli.js`, which measured Node process startup
 * plus CPU contention from jest's sibling workers instead of the query, and so failed intermittently
 * on a clean `main`. The threshold did not move — the measurement point did: the scenario's own
 * fixture (a document titled "API design" tagged "architecture", queried with `api`) is now one of
 * the reference repository's 1,000 documents, and the scenario runs here, in-process, through the
 * same registered op, under REQ-PERF-02's measurement conditions. The integration test keeps the
 * scenario's other clause (results include "API design") plus exit code and output shape;
 * `test/core/latency-budget-placement.test.ts` forbids a timed spawn anywhere but in its one
 * documented exemption.
 *
 * **What this file does not cover: the commands themselves.** REQ-PERF-02's Fit Criterion is worded
 * against `wingfoil memory search`, `dna show` and `memory history`; this file times the operations
 * they dispatch to, which leaves out the compiled CLI's own dispatch and output. That level is
 * `test/cli/command-latency.test.ts` (task-154, `bug-013`): the same reference repository, the same
 * 1,000 ms at p95, measured as each spawned command's cost over a measured process-start floor.
 *
 * `P1.10-memory-history.feature`'s "And the query returns in under 1 second" clause lands here for the
 * same reason and was never written anywhere else: `test/cli/program.integration.test.ts` owns P1.10's
 * exit codes, messages and output shape (it spawns), and `test/core/memory-history.test.ts` owns the
 * entry-shape fit criteria (it never reads a clock). This file times the op in-process, without
 * spawning anything.
 *
 * The fixture is `test/core/helpers/reference-repo.ts` and the timing is `test/core/helpers/latency.ts`
 * (`sampleLatency` + `p95`, `RUNS = 25`): both moved out of this file by task-154 so that every latency
 * budget in the suite is measured in one shape.
 */
import { loadDnaYaml, CORE_MODULES } from '../../src/core';
import type { CoreFn } from '../../src/core/registry';
import { removeTempDir } from '../storage/helpers/git-fixture';
import { P95_BUDGET_MS, p95, RUNS, sampleLatency } from './helpers/latency';
import {
  HISTORY_APPROVE_REASON,
  KEYWORD,
  P1_5_DOC_ID,
  P1_5_QUERY,
  P1_5_TAG,
  P1_5_TITLE,
  seedReferenceRepo,
} from './helpers/reference-repo';

/** The projected match fields these benchmarks assert on — `memorySearchFn`'s real result items carry
 * more (`path`, `type`, `status`); this is the subset the P1.5 scenario checks. */
interface BenchmarkMatch {
  readonly id?: string;
  readonly title?: string;
  readonly tags: readonly string[];
}

/** The real, registered `memory.memorySearch` `CoreFn` (task-021) — fails loudly if a future change
 * un-registers it, rather than silently benchmarking a stale/wrong function. */
function memorySearchFn(): CoreFn<unknown, { matches: readonly BenchmarkMatch[] }> {
  const operation = CORE_MODULES.find((module) => module.name === 'memory')?.operations.memorySearch;
  if (!operation) throw new Error('fixture bug: "memorySearch" operation not registered on the memory module');
  return operation.fn as CoreFn<unknown, { matches: readonly BenchmarkMatch[] }>;
}

/** The projected audit-trail fields this benchmark asserts on — the real entries carry more
 * (`sha`, `author`, `timestamp`, `operation`, `from`, `approver`, `subject`). */
interface BenchmarkHistory {
  readonly path: string;
  readonly entries: readonly { readonly to: string | null; readonly reason: string | null }[];
}

/** The real, registered `memory.memoryHistory` `CoreFn` (task-049) — fails loudly if a future change
 * un-registers it, rather than silently benchmarking a stale/wrong function. */
function memoryHistoryFn(): CoreFn<unknown, BenchmarkHistory> {
  const operation = CORE_MODULES.find((module) => module.name === 'memory')?.operations.memoryHistory;
  if (!operation) throw new Error('fixture bug: "memoryHistory" operation not registered on the memory module');
  return operation.fn as CoreFn<unknown, BenchmarkHistory>;
}

jest.setTimeout(60_000);

describe('REQ-PERF-02 — DNA/Memory query latency on a 1,000-Memory-document reference repository', () => {
  let root: string;
  let historyTarget: string;
  let historyTargetId: string;

  beforeAll(() => {
    ({ root, historyTarget, historyTargetId } = seedReferenceRepo());
  });

  afterAll(() => removeTempDir(root));

  it('`dna show`\'s bounded dna.yaml read stays under 1000ms at p95 over >= 20 runs', async () => {
    const samples = await sampleLatency(RUNS, () => loadDnaYaml(root));
    expect(samples).toHaveLength(RUNS);
    expect(p95(samples)).toBeLessThan(P95_BUDGET_MS);
  });

  it("`memory search`'s keyword/frontmatter scan over 1,000 documents stays under 1000ms at p95 over >= 20 runs (measured through the REGISTERED memory.memorySearch op, task-021)", async () => {
    const fn = memorySearchFn();
    let lastMatches: readonly unknown[] = [];
    const samples = await sampleLatency(RUNS, async () => {
      const outcome = await fn({ root, positional: KEYWORD });
      if (outcome.ok) lastMatches = outcome.value.matches;
    });
    expect(samples).toHaveLength(RUNS);
    expect(p95(samples)).toBeLessThan(P95_BUDGET_MS);
    // Sanity: the fixture exercises a real, non-trivial match set (both metadata- and body-only hits
    // per `seedReferenceRepo`'s `index % 13`/`index % 7` construction) through the full registered op
    // — id/frontmatter-projection included, not just the raw scan primitive.
    expect(lastMatches.length).toBeGreaterThan(0);
  });

  // BDD P1.5 "Find a decision by keyword", both clauses, measured where the budget means something
  // (task-067 / bug-011). The Given ("Memory contains a document titled 'API design' tagged
  // 'architecture'") is document 750 of the reference repository; the When ("I run `wingfoil memory
  // search api`") is the registered `memory.memorySearch` op — the very call the CLI command
  // dispatches to; the Thens are the two assertions below. Stronger than the spawn-wrapped assertion
  // it replaces on three axes — it measures the query rather than process startup, over 1,000
  // documents rather than 2, at p95 over 25 runs rather than a single sample — but not on the fourth:
  // it no longer runs the command, which `test/cli/command-latency.test.ts` covers (bug-013). The threshold is
  // untouched: 1,000 ms, exactly as the feature file and REQ-PERF-02 both state it.
  it('P1.5 "Find a decision by keyword": `memory search api` returns the "API design" document, in under 1000ms at p95 over >= 20 runs (task-067)', async () => {
    const fn = memorySearchFn();
    let lastMatches: readonly BenchmarkMatch[] = [];
    const samples = await sampleLatency(RUNS, async () => {
      const outcome = await fn({ root, positional: P1_5_QUERY });
      if (outcome.ok) lastMatches = outcome.value.matches;
    });
    expect(samples).toHaveLength(RUNS);
    // "And the query returns in under 1 second" — P1.5-memory-search.feature line 12 / REQ-PERF-02.
    expect(p95(samples)).toBeLessThan(P95_BUDGET_MS);
    // "Then the results include the document titled 'API design'" — asserted as an exact singleton:
    // no other fixture document's id, title, tags or filler body contains the substring "api", so a
    // second match would mean the keyword scan had started over-matching.
    expect(lastMatches.map((match) => match.id)).toEqual([P1_5_DOC_ID]);
    expect(lastMatches[0]?.title).toBe(P1_5_TITLE);
    expect(lastMatches[0]?.tags).toContain(P1_5_TAG);
  });

  // BDD P1.10 "View the full audit trail of a document" — its "And the query returns in under 1
  // second" clause, measured where the budget means something (task-049; same placement rule
  // task-067/bug-011 established for P1.5). REQ-PERF-02 names `wingfoil memory history` explicitly,
  // and this measures the registered `memory.memoryHistory` op — the very call that command
  // dispatches to — end to end: `memory.yaml` load, the bare-`<id>` scan over all 1,000 reference
  // documents, the `git log --follow` walk, and one `git show` per commit to derive each state.
  //
  // The scenario's Background gives its document "3 recorded state transitions"; this fixture's
  // target has FOUR entries (creation + the three `HISTORY_TARGET_COMMITS`), so the measurement
  // upper-bounds the scenario's own case rather than approximating it — one extra `git show` on top
  // of an id scan two orders of magnitude larger than the scenario's Memory.
  it('P1.10 "View the full audit trail of a document": `memory history <id>` returns the full chronological trail, in under 1000ms at p95 over >= 20 runs (task-049)', async () => {
    const fn = memoryHistoryFn();
    let last: BenchmarkHistory | undefined;
    const samples = await sampleLatency(RUNS, async () => {
      const outcome = await fn({ root, positional: historyTargetId });
      if (outcome.ok) last = outcome.value;
    });
    expect(samples).toHaveLength(RUNS);
    // "And the query returns in under 1 second" — P1.10-memory-history.feature line 13 / REQ-PERF-02.
    expect(p95(samples)).toBeLessThan(P95_BUDGET_MS);

    // Sanity: the op really resolved THIS document (the `task-*` ids repeat across the seven release
    // directories, so pin the path) and really walked its whole trail — "the output lists N entries
    // in chronological order", with the `approve` commit's `Reason:` read back off the commit body.
    expect(last?.path).toBe(historyTarget);
    expect(last?.entries.map((entry) => entry.to)).toEqual(['draft', 'pending', 'backlog', 'in-progress']);
    expect(last?.entries.map((entry) => entry.reason)).toEqual([null, null, HISTORY_APPROVE_REASON, null]);
  });
});
