/**
 * REQ-PERF-04 acceptance benchmark (task-009-mcp-resource-fetch-latency, ported forward by
 * task-011-mcp-resources-read-only onto the spec-004-conformant `wingfoil://memory/{type}/{id}` URI —
 * task-009's own placeholder `wingfoil://memory/{id}` adapter no longer exists, see
 * `src/mcp/memory-resource.ts`'s doc comment for the replacement history):
 *
 *   "A single MCP Resource fetch returns in < 1,000 ms (p95); the MCP server sustains queries for
 *   the duration of an agent session without restart."
 *   Measurement conditions: p95 over >= 20 runs on a reference repository of 1,000 Memory documents.
 *   (docs/02_requirements/03_sard/02_performance-nfr.md)
 *
 * Exercised end-to-end over the MCP SDK's own in-memory transport + a real `Client` (mirroring
 * `test/mcp/registrar.test.ts`), against the REAL production registrar (`registerCoreModules` +
 * `CORE_MODULES` from `src/core`) plus task-011's new `registerMemoryResources` — so this measures
 * exactly what an MCP client sees, not a private registration list. Two resources are benchmarked:
 * `wingfoil://dna/show` (task-006's already-registered `dnaShow` CoreOperation) and
 * `wingfoil://memory/{type}/{id}` (task-011's conformant adapter over
 * `findMemoryDocumentByTypeAndId`, wrapping task-008's `listMemoryDocumentPaths` scan primitives).
 *
 * Timing goes through `test/core/helpers/latency.ts` (`sampleLatency` + `p95`, `RUNS = 25`), the one
 * shape every latency budget in the suite is measured in (task-154). The fixture and the client are
 * `test/mcp/helpers/resource-reference-repo.ts`.
 *
 * **Placement** (task-357, `bug-221`). The budgets — the two p95s and the session's no-growth trend — presuppose
 * an otherwise idle machine (the SARD's measurement condition of every REQ-PERF target), so this suite runs only
 * in the opt-in latency pass (`test/latency-suites.cjs` `IN_PROCESS_LATENCY_SUITES`; `npm run test:latency`),
 * never inside the parallel `npm test`. Each describe reads the load average before and after its sampling and
 * refuses a loaded run through `inProcessIdleVerdict` rather than counting it, as
 * `test/core/workflow-next-latency.test.ts` does. What it asserts besides the time — the worst-case document's
 * content, an unknown id as a protocol read failure, 200 fetches on one connection without error and the
 * connection alive at the end — runs in the parallel pass too, no clock, in
 * `test/mcp/resource-reference-repo.test.ts`.
 */
import { cpus } from 'os';

import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

import { describeLoad, describeSamples, inProcessIdleVerdict, P95_BUDGET_MS, p95, readLoadAverage, RUNS, sampleLatency, type LoadWindow } from '../core/helpers/latency';
import { removeTempDir } from '../storage/helpers/git-fixture';
import { connectedClient, type FixtureDoc, seedReferenceRepo, SESSION_ROUNDS, sessionDocs, sessionUri, worstCaseDoc } from './helpers/resource-reference-repo';

jest.setTimeout(60_000);

function mean(samples: readonly number[]): number {
  return samples.reduce((a, b) => a + b, 0) / samples.length;
}

describe('REQ-PERF-04 — MCP resource fetch latency on a 1,000-Memory-document reference repository', () => {
  let root: string;
  let client: Client;
  let worstCase: FixtureDoc;

  beforeAll(async () => {
    const seeded = seedReferenceRepo();
    root = seeded.root;
    worstCase = worstCaseDoc(seeded.docs);
    ({ client } = await connectedClient(root));
  });

  afterAll(() => removeTempDir(root));

  let dnaSamples: number[] = [];
  let memorySamples: number[] = [];
  let load: LoadWindow;

  /** The budget judgement of one fetch, refused (not counted) on a loaded machine. */
  function judge(resource: string, samples: readonly number[]): void {
    if (inProcessIdleVerdict(load, cpus().length) !== 'otherwise idle') return; // refused below, not counted
    const report = `${resource}: ${describeSamples(samples)}; ${describeLoad(load)}`;
    expect({ report, under: p95(samples) < P95_BUDGET_MS }).toEqual({ report, under: true });
  }

  it('samples >= 20 fetches of each resource, reading the load before and after, and the worst-case fetch returns its document', async () => {
    let lastText = '';
    const before = readLoadAverage();
    dnaSamples = await sampleLatency(RUNS, () => client.readResource({ uri: 'wingfoil://dna/show' }));
    memorySamples = await sampleLatency(RUNS, async () => {
      const result = await client.readResource({ uri: `wingfoil://memory/${worstCase.type}/${worstCase.id}` });
      const content = result.contents[0];
      lastText = content && 'text' in content ? content.text : '';
    });
    load = { before, after: readLoadAverage() };
    process.stdout.write(`wingfoil://dna/show: ${describeSamples(dnaSamples)}; ${describeLoad(load)}\n`);
    process.stdout.write(`wingfoil://memory/{type}/{id}: ${describeSamples(memorySamples)}; ${describeLoad(load)}\n`);
    expect(dnaSamples).toHaveLength(RUNS);
    expect(memorySamples).toHaveLength(RUNS);
    expect(lastText).toContain(`id: ${worstCase.id}`);
  });

  it('the run was taken on an otherwise idle machine (a loaded run is refused, not counted)', () => {
    expect(inProcessIdleVerdict(load, cpus().length)).toBe('otherwise idle');
  });

  it("`wingfoil://dna/show` resource fetch stays under 1000ms at p95 over >= 20 runs, on an otherwise idle machine", () => {
    judge('wingfoil://dna/show', dnaSamples);
  });

  it('`wingfoil://memory/{type}/{id}` resource fetch (worst-case scan position) stays under 1000ms at p95 over >= 20 runs, on an otherwise idle machine', () => {
    judge('wingfoil://memory/{type}/{id}', memorySamples);
  });
});

describe('REQ-PERF-04 — sustained agent session: no restart, no dropped connection, no latency degradation', () => {
  let root: string;
  let client: Client;
  let sampleDocs: FixtureDoc[];

  beforeAll(async () => {
    const seeded = seedReferenceRepo();
    root = seeded.root;
    sampleDocs = sessionDocs(seeded.docs);
    ({ client } = await connectedClient(root));
  });

  afterAll(() => removeTempDir(root));

  let samples: number[] = [];
  let load: LoadWindow;

  it('sustains >= 200 fetches on a single, never-restarted connection with no error, reading the load before and after', async () => {
    const before = readLoadAverage();
    samples = await sampleLatency(SESSION_ROUNDS, (i) => client.readResource({ uri: sessionUri(sampleDocs, i) }));
    load = { before, after: readLoadAverage() };
    process.stdout.write(`MCP session fetch: ${describeSamples(samples)}; ${describeLoad(load)}\n`);
    expect(samples).toHaveLength(SESSION_ROUNDS);

    // The connection is still alive and serving correct data at the very end of the session (no
    // restart was performed anywhere in this test).
    const final = await client.readResource({ uri: 'wingfoil://dna/show' });
    expect(final.contents[0]?.mimeType).toBe('application/json');
  });

  it('the run was taken on an otherwise idle machine (a loaded run is refused, not counted)', () => {
    expect(inProcessIdleVerdict(load, cpus().length)).toBe('otherwise idle');
  });

  it('shows no latency growth trend across the session, on an otherwise idle machine', () => {
    if (inProcessIdleVerdict(load, cpus().length) !== 'otherwise idle') return; // refused above, not counted
    // No monotonic degradation across the session: the mean of the last 10% of fetches must not be
    // a multiple of the mean of the first 10% (a leak/degradation shows as a large multiplicative
    // growth, not ordinary timing jitter).
    const window = Math.floor(SESSION_ROUNDS * 0.1);
    const firstMean = mean(samples.slice(0, window));
    const lastMean = mean(samples.slice(-window));
    const report = `MCP session fetch: first ${window} mean ${Math.round(firstMean)} ms, last ${window} mean ${Math.round(lastMean)} ms; ${describeLoad(load)}`;
    expect({ report, flat: lastMean < Math.max(firstMean * 3, 5) }).toEqual({ report, flat: true });
  });
});
