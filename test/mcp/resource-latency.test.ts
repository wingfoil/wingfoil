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
 * shape every latency budget in the suite is measured in (task-154).
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { CORE_MODULES } from '../../src/core';
import { registerMemoryResources } from '../../src/mcp/memory-resource';
import { registerCoreModules } from '../../src/mcp/registrar';
import { P95_BUDGET_MS, p95, RUNS, sampleLatency } from '../core/helpers/latency';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

jest.setTimeout(60_000);

const DNA_YAML = `
version: 1.1
modules:
  - name: core
    path: src/core
stacks:
  technologies:
    - name: TypeScript
      category: language
team:
  members:
    - name: Test User
      roles: [ developer ]
  roles:
    - name: developer
paths:
  sources: [ src/ ]
`;

// Mirrors .wingfoil/memory.yaml's real path patterns (states omitted, as in task-008's
// own fixture — not needed by the query primitives).
const MEMORY_YAML = `
version: 1.1
types:
  release-line:
    path: "docs/04_memory/planning/{id}.md"
  release:
    path: "docs/04_memory/planning/rl-{release-line}/{id}.md"
  task:
    path: "docs/04_memory/{release}/{id}.md"
  adr:
    path: "docs/04_memory/design/adrs/{id}.md"
  decision-log:
    path: "docs/04_memory/design/dls/{id}.md"
  tech-spec:
    path: "docs/04_memory/design/specs/{id}.md"
  bug:
    path: "docs/04_memory/bugs/{id}.md"
`;

const TAGS = ['architecture', 'infra', 'memory', 'dna', 'workflow'];
const STATUSES = ['draft', 'pending', 'backlog', 'in-progress'];

/** Deterministic filler paragraph — index-derived only, no randomness/wall-clock (REQ-SYS-07). */
function fillerBody(index: number): string {
  const line = `Deterministic reference-repository filler content for document ${index}, used only to give the benchmark fixture a realistic body size.`;
  return Array.from({ length: 4 }, () => line).join(' ');
}

function pad(n: number): string {
  return String(n).padStart(3, '0');
}

interface FixtureDoc {
  readonly relativePath: string;
  readonly id: string;
  /** The document's own frontmatter `type:` — task-011's `wingfoil://memory/{type}/{id}` addressing
   * needs both segments, not just `id` (spec-004 §2.1). */
  readonly type: string;
}

/**
 * Build 1,000 (path, id, type) triples with **globally unique ids** (unlike task-008's own fixture,
 * whose task ids repeat per release — fine for a keyword scan, but ambiguous for this task's
 * (type, id) -> document lookup): 700 tasks across 7 releases (id includes the release number), +
 * 100 each of adr/decision-log/tech-spec.
 */
function planFixtureDocs(): FixtureDoc[] {
  const docs: FixtureDoc[] = [];
  for (let release = 1; release <= 7; release += 1) {
    for (let n = 0; n < 100; n += 1) {
      const id = `task-${pad(n)}-r${release}-doc`;
      docs.push({ relativePath: `docs/04_memory/v0.${release}/${id}.md`, id, type: 'task' });
    }
  }
  for (let n = 0; n < 100; n += 1) {
    const id = `adr-${pad(n)}-doc`;
    docs.push({ relativePath: `docs/04_memory/design/adrs/${id}.md`, id, type: 'adr' });
  }
  for (let n = 0; n < 100; n += 1) {
    const id = `dl-${pad(n)}-doc`;
    docs.push({ relativePath: `docs/04_memory/design/dls/${id}.md`, id, type: 'decision-log' });
  }
  for (let n = 0; n < 100; n += 1) {
    const id = `spec-${pad(n)}-doc`;
    docs.push({ relativePath: `docs/04_memory/design/specs/${id}.md`, id, type: 'tech-spec' });
  }
  return docs;
}

function docContent(doc: FixtureDoc, index: number, status: string): string {
  const tag = TAGS[index % TAGS.length];
  return [
    '---',
    `id: ${doc.id}`,
    `type: ${doc.type}`,
    `title: "Document ${index}"`,
    `tags: [ ${tag} ]`,
    `status: ${status}`,
    '---',
    '',
    fillerBody(index),
    '',
  ].join('\n');
}

/** Write + commit the 1,000-document reference repository (REQ-PERF-04 measurement conditions). */
function seedReferenceRepo(): { root: string; docs: FixtureDoc[] } {
  const root = makeTempGitRepo();
  writeFixtureFile(root, '.wingfoil/dna.yaml', DNA_YAML);
  writeFixtureFile(root, '.wingfoil/memory.yaml', MEMORY_YAML);

  const docs = planFixtureDocs();
  if (docs.length !== 1000) {
    throw new Error(`fixture generator bug: expected exactly 1000 documents, got ${docs.length}`);
  }
  if (new Set(docs.map((d) => d.id)).size !== 1000) {
    throw new Error('fixture generator bug: expected 1000 globally-unique document ids');
  }

  docs.forEach((doc, index) => {
    const status = STATUSES[index % STATUSES.length]!;
    writeFixtureFile(root, doc.relativePath, docContent(doc, index, status));
  });

  commitAll(root, 'seed 1000-document reference repository (REQ-PERF-04)');

  return { root, docs };
}

async function connectedClient(root: string): Promise<{ client: Client; server: McpServer }> {
  const server = new McpServer({ name: 'wingfoil-test', version: '0.0.0' });
  registerCoreModules(server, CORE_MODULES, { resolveRoot: () => root, buildParams: () => ({ root }) });
  registerMemoryResources(server, { resolveRoot: () => root });
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'wingfoil-test-client', version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, server };
}

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
    // Worst-case single-fetch scan position for the linear (type, id) lookup: the last document in
    // listMemoryDocumentPaths' sorted scan order (docs/04_memory/v0.7/... sorts last, type "task").
    const sortedDocs = [...seeded.docs].sort((a, b) => (a.relativePath < b.relativePath ? -1 : 1));
    worstCase = sortedDocs[sortedDocs.length - 1]!;
    ({ client } = await connectedClient(root));
  });

  afterAll(() => removeTempDir(root));

  it("`wingfoil://dna/show` resource fetch stays under 1000ms at p95 over >= 20 runs", async () => {
    const samples = await sampleLatency(RUNS, () => client.readResource({ uri: 'wingfoil://dna/show' }));
    expect(samples).toHaveLength(RUNS);
    expect(p95(samples)).toBeLessThan(P95_BUDGET_MS);
  });

  it('`wingfoil://memory/{type}/{id}` resource fetch (worst-case scan position) stays under 1000ms at p95 over >= 20 runs', async () => {
    let lastText = '';
    const samples = await sampleLatency(RUNS, async () => {
      const result = await client.readResource({ uri: `wingfoil://memory/${worstCase.type}/${worstCase.id}` });
      const content = result.contents[0];
      lastText = content && 'text' in content ? content.text : '';
    });
    expect(samples).toHaveLength(RUNS);
    expect(p95(samples)).toBeLessThan(P95_BUDGET_MS);
    expect(lastText).toContain(`id: ${worstCase.id}`);
  });

  it('an unresolvable id (known type) surfaces as a protocol-level read failure, not a silent empty payload', async () => {
    await expect(client.readResource({ uri: 'wingfoil://memory/task/no-such-id' })).rejects.toThrow(/not found/);
  });
});

describe('REQ-PERF-04 — sustained agent session: no restart, no dropped connection, no latency degradation', () => {
  let root: string;
  let client: Client;
  let sampleDocs: FixtureDoc[];

  beforeAll(async () => {
    const seeded = seedReferenceRepo();
    root = seeded.root;
    // A handful of documents spread across the fixture (not just one hot document, and spanning more
    // than one type), simulating a real agent session's mixed fetch pattern.
    sampleDocs = [0, 150, 350, 550, 750, 999].map((i) => seeded.docs[i]!);
    ({ client } = await connectedClient(root));
  });

  afterAll(() => removeTempDir(root));

  it('sustains >= 200 fetches on a single, never-restarted connection with no error and no latency growth trend', async () => {
    const ROUNDS = 200;
    const samples = await sampleLatency(ROUNDS, (i) => {
      const doc = sampleDocs[i % sampleDocs.length]!;
      const uri = i % 3 === 0 ? 'wingfoil://dna/show' : `wingfoil://memory/${doc.type}/${doc.id}`;
      return client.readResource({ uri });
    });
    expect(samples).toHaveLength(ROUNDS);

    // No monotonic degradation across the session: the mean of the last 10% of fetches must not be
    // a multiple of the mean of the first 10% (a leak/degradation shows as a large multiplicative
    // growth, not ordinary timing jitter).
    const window = Math.floor(ROUNDS * 0.1);
    const firstMean = mean(samples.slice(0, window));
    const lastMean = mean(samples.slice(-window));
    expect(lastMean).toBeLessThan(Math.max(firstMean * 3, 5));

    // The connection is still alive and serving correct data at the very end of the session (no
    // restart was performed anywhere in this test).
    const final = await client.readResource({ uri: 'wingfoil://dna/show' });
    expect(final.contents[0]?.mimeType).toBe('application/json');
  });
});
