/**
 * REQ-PERF-02's reference repository in the parallel pass (task-357, `bug-221`): what
 * `test/core/query-latency.test.ts` asserts besides the time, one call each and no clock.
 *
 * `test/core/query-latency.test.ts` times `dna show`, `memory search` and `memory history` on the
 * 1,000-document reference repository (`test/core/helpers/reference-repo.ts`) and, since its budgets
 * presuppose an otherwise idle machine, runs only in the opt-in latency pass (`test/latency-suites.cjs`
 * `IN_PROCESS_LATENCY_SUITES`). The functional clauses it checks on its timed runs are load-independent,
 * so they run here too, inside `npm test`'s parallel pass and `npm run test:coverage`, against the same
 * registered `CoreFn`s and the same fixture:
 *
 * - BDD `P1.5-memory-search.feature` "Find a decision by keyword", its Then: `memory search api` returns
 *   the document titled "API design" tagged "architecture" (document 750 of the reference repository), as
 *   an exact singleton; the scenario's "in under 1 second" clause stays timed in the latency pass;
 * - BDD `P1.10-memory-history.feature` "View the full audit trail of a document": `memory history <id>`
 *   resolves the bare id to its document and returns its full chronological trail, with the `approve`
 *   commit's `Reason:` read back; its "in under 1 second" clause stays timed in the latency pass;
 * - `memory search` of the fixture's keyword returns a non-empty match set, and `dna show`'s read of
 *   `dna.yaml` loads.
 *
 * No timing helper is imported and no clock is read (`test/core/latency-budget-placement.test.ts`
 * rule 6): nothing here can fail because the machine is loaded.
 */
import { loadDnaYaml, CORE_MODULES } from '../../src/core';
import type { CoreFn } from '../../src/core/registry';
import { removeTempDir } from '../storage/helpers/git-fixture';
import {
  HISTORY_APPROVE_REASON,
  KEYWORD,
  P1_5_DOC_ID,
  P1_5_QUERY,
  P1_5_TAG,
  P1_5_TITLE,
  seedReferenceRepo,
} from './helpers/reference-repo';

/** The projected match fields asserted on — the real result items carry more (`path`, `type`, `status`). */
interface ReferenceMatch {
  readonly id?: string;
  readonly title?: string;
  readonly tags: readonly string[];
}

/** The projected audit-trail fields asserted on — the real entries carry more. */
interface ReferenceHistory {
  readonly path: string;
  readonly entries: readonly { readonly to: string | null; readonly reason: string | null }[];
}

/** A registered `memory` operation's `CoreFn`, failing loudly if it is no longer registered. */
function memoryOperation<R>(name: 'memorySearch' | 'memoryHistory'): CoreFn<unknown, R> {
  const operation = CORE_MODULES.find((module) => module.name === 'memory')?.operations[name];
  if (!operation) throw new Error(`fixture bug: "${name}" operation not registered on the memory module`);
  return operation.fn as CoreFn<unknown, R>;
}

jest.setTimeout(60_000);

describe('REQ-PERF-02 reference repository (1,000 Memory documents): what the query latency suite asserts besides the time', () => {
  let root: string;
  let historyTarget: string;
  let historyTargetId: string;

  beforeAll(() => {
    ({ root, historyTarget, historyTargetId } = seedReferenceRepo());
  });

  afterAll(() => removeTempDir(root));

  it("`dna show`'s read of dna.yaml loads on the reference repository", () => {
    expect(loadDnaYaml(root).modules?.map((module) => module.name)).toEqual(['core']);
  });

  it('`memory search` of the fixture keyword returns a non-empty match set through the registered memory.memorySearch op (task-021)', async () => {
    const outcome = await memoryOperation<{ matches: readonly ReferenceMatch[] }>('memorySearch')({ root, positional: KEYWORD });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.matches.length).toBeGreaterThan(0);
  });

  it('P1.5 "Find a decision by keyword": `memory search api` returns exactly the "API design" document (task-067)', async () => {
    const outcome = await memoryOperation<{ matches: readonly ReferenceMatch[] }>('memorySearch')({ root, positional: P1_5_QUERY });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    // No other fixture document's id, title, tags or filler body contains "api": a second match would mean
    // the keyword scan had started over-matching.
    expect(outcome.value.matches.map((match) => match.id)).toEqual([P1_5_DOC_ID]);
    expect(outcome.value.matches[0]?.title).toBe(P1_5_TITLE);
    expect(outcome.value.matches[0]?.tags).toContain(P1_5_TAG);
  });

  it('P1.10 "View the full audit trail of a document": `memory history <id>` returns the full chronological trail with its reasons (task-049)', async () => {
    const outcome = await memoryOperation<ReferenceHistory>('memoryHistory')({ root, positional: historyTargetId });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    // The `task-*` ids repeat across the seven release directories, so the path is pinned.
    expect(outcome.value.path).toBe(historyTarget);
    expect(outcome.value.entries.map((entry) => entry.to)).toEqual(['draft', 'pending', 'backlog', 'in-progress']);
    expect(outcome.value.entries.map((entry) => entry.reason)).toEqual([null, null, HISTORY_APPROVE_REASON, null]);
  });
});
