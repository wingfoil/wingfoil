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
 * `test/cli/command-latency.test.ts` (task-154, `bug-013`; task-248, `dl-146` (C)): the same reference
 * repository, the same 1,000 ms at p95, asserted on each spawned command's total, process start-up
 * included, and on its marginal cost over a measured process-start floor — and run only when asked
 * for, on an otherwise idle machine.
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
 *
 * **Placement** (task-357, `bug-221`). The budgets presuppose an otherwise idle machine (the SARD's measurement
 * condition of every REQ-PERF target), so this suite runs only in the opt-in latency pass
 * (`test/latency-suites.cjs` `IN_PROCESS_LATENCY_SUITES`; `npm run test:latency`), never inside the parallel
 * `npm test`, where jest's own workers compete with what it times. It reads the load average before and after
 * its sampling and refuses a loaded run through `inProcessIdleVerdict` rather than counting it, as
 * `test/core/workflow-next-latency.test.ts` does. What it asserts besides the time — the P1.5 singleton match,
 * the P1.10 trail and its reasons, a non-empty keyword search — also runs in the parallel pass, one call each and
 * no clock, in `test/core/query-reference-repo.test.ts`, so `npm run test:coverage` keeps counting the code paths
 * this file reaches; the sanity assertions stay here too, on the timed runs' last results.
 */
import { cpus } from 'os';

import { loadDnaYaml, CORE_MODULES } from '../../src/core';
import type { CoreFn } from '../../src/core/registry';
import { removeTempDir } from '../storage/helpers/git-fixture';
import { describeLoad, describeSamples, inProcessIdleVerdict, P95_BUDGET_MS, p95, readLoadAverage, RUNS, sampleLatency, type LoadWindow } from './helpers/latency';
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

/** The four timed operations, in the order they are sampled and judged. */
const OPERATIONS = ['dna show', 'memory search', 'P1.5 memory search api', 'P1.10 memory history'] as const;
type Operation = (typeof OPERATIONS)[number];

jest.setTimeout(120_000);

describe('REQ-PERF-02 — DNA/Memory query latency on a 1,000-Memory-document reference repository', () => {
  let root: string;
  let historyTarget: string;
  let historyTargetId: string;

  beforeAll(() => {
    ({ root, historyTarget, historyTargetId } = seedReferenceRepo());
  });

  afterAll(() => removeTempDir(root));

  const samples = new Map<Operation, number[]>();
  let load: LoadWindow;

  /** The budget judgement of one operation, refused (not counted) on a loaded machine. */
  function judge(operation: Operation): void {
    if (inProcessIdleVerdict(load, cpus().length) !== 'otherwise idle') return; // refused below, not counted
    const measured = samples.get(operation) ?? [];
    const report = `${operation}: ${describeSamples(measured)}; ${describeLoad(load)}`;
    expect({ report, under: p95(measured) < P95_BUDGET_MS }).toEqual({ report, under: true });
  }

  // Every timed run redoes the full pillar-config load + scan; the last run's result is what the sanity
  // assertions read, so they hold on a loaded machine too.
  it('samples >= 20 runs of each operation, reading the load before and after, and each run answers what the reference repository holds', async () => {
    const search = memorySearchFn();
    const history = memoryHistoryFn();
    let keywordMatches: readonly unknown[] = [];
    let apiMatches: readonly BenchmarkMatch[] = [];
    let trail: BenchmarkHistory | undefined;
    const before = readLoadAverage();
    samples.set('dna show', await sampleLatency(RUNS, () => loadDnaYaml(root)));
    samples.set(
      'memory search',
      await sampleLatency(RUNS, async () => {
        const outcome = await search({ root, positional: KEYWORD });
        if (outcome.ok) keywordMatches = outcome.value.matches;
      }),
    );
    samples.set(
      'P1.5 memory search api',
      await sampleLatency(RUNS, async () => {
        const outcome = await search({ root, positional: P1_5_QUERY });
        if (outcome.ok) apiMatches = outcome.value.matches;
      }),
    );
    samples.set(
      'P1.10 memory history',
      await sampleLatency(RUNS, async () => {
        const outcome = await history({ root, positional: historyTargetId });
        if (outcome.ok) trail = outcome.value;
      }),
    );
    load = { before, after: readLoadAverage() };
    for (const operation of OPERATIONS) {
      process.stdout.write(`${operation}: ${describeSamples(samples.get(operation) ?? [])}; ${describeLoad(load)}\n`);
      expect({ operation, runs: samples.get(operation)?.length }).toEqual({ operation, runs: RUNS });
    }

    // The fixture exercises a real, non-trivial match set (both metadata- and body-only hits per
    // `seedReferenceRepo`'s `index % 13`/`index % 7` construction) through the full registered op.
    expect(keywordMatches.length).toBeGreaterThan(0);
    // P1.5 "Then the results include the document titled 'API design'", as an exact singleton.
    expect(apiMatches.map((match) => match.id)).toEqual([P1_5_DOC_ID]);
    expect(apiMatches[0]?.title).toBe(P1_5_TITLE);
    expect(apiMatches[0]?.tags).toContain(P1_5_TAG);
    // P1.10: the op resolved THIS document (task ids repeat across releases) and walked its whole trail.
    expect(trail?.path).toBe(historyTarget);
    expect(trail?.entries.map((entry) => entry.to)).toEqual(['draft', 'pending', 'backlog', 'in-progress']);
    expect(trail?.entries.map((entry) => entry.reason)).toEqual([null, null, HISTORY_APPROVE_REASON, null]);
  });

  it('the run was taken on an otherwise idle machine (a loaded run is refused, not counted)', () => {
    expect(inProcessIdleVerdict(load, cpus().length)).toBe('otherwise idle');
  });

  it("`dna show`'s bounded dna.yaml read stays under 1000ms at p95 over >= 20 runs, on an otherwise idle machine", () => {
    judge('dna show');
  });

  it("`memory search`'s keyword/frontmatter scan over 1,000 documents stays under 1000ms at p95 over >= 20 runs (measured through the REGISTERED memory.memorySearch op, task-021), on an otherwise idle machine", () => {
    judge('memory search');
  });

  // BDD P1.5 "Find a decision by keyword", its "And the query returns in under 1 second" clause
  // (P1.5-memory-search.feature line 12 / REQ-PERF-02), measured where the budget means something
  // (task-067 / bug-011): the registered `memory.memorySearch` op, the very call `wingfoil memory search api`
  // dispatches to, over 1,000 documents at p95 over 25 runs. `test/cli/command-latency.test.ts` times the
  // command itself, opt-in (bug-013). The threshold is untouched: 1,000 ms, as the feature file and REQ-PERF-02
  // both state it. The scenario's other clause runs in the parallel pass (`test/core/query-reference-repo.test.ts`).
  it('P1.5 "Find a decision by keyword": `memory search api` answers in under 1000ms at p95 over >= 20 runs, on an otherwise idle machine (task-067)', () => {
    judge('P1.5 memory search api');
  });

  // BDD P1.10 "View the full audit trail of a document", its "And the query returns in under 1 second" clause
  // (P1.10-memory-history.feature line 13 / REQ-PERF-02; task-049): the registered `memory.memoryHistory` op end
  // to end — `memory.yaml` load, the bare-`<id>` scan over all 1,000 reference documents, the `git log --follow`
  // walk, and one `git show` per commit to derive each state. The fixture's target has FOUR entries (creation +
  // the three `HISTORY_TARGET_COMMITS`), one more than the scenario's Background, so the measurement upper-bounds
  // the scenario's own case.
  it('P1.10 "View the full audit trail of a document": `memory history <id>` answers in under 1000ms at p95 over >= 20 runs, on an otherwise idle machine (task-049)', () => {
    judge('P1.10 memory history');
  });
});
