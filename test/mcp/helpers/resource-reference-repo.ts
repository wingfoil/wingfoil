/**
 * The REQ-PERF-04 reference repository and its MCP client (task-357, `bug-221`), shared by
 * `test/mcp/resource-latency.test.ts` (the budgets, in the opt-in latency pass) and
 * `test/mcp/resource-reference-repo.test.ts` (what that suite asserts besides the time, in the parallel pass),
 * so both run against the same fixture. Moved out of `test/mcp/resource-latency.test.ts` unchanged
 * (task-009, task-011).
 *
 * The client is a real `Client` over the MCP SDK's in-memory transport, connected to the REAL production
 * registrar (`registerCoreModules` + `CORE_MODULES` from `src/core`) plus task-011's `registerMemoryResources`,
 * so it sees exactly what an MCP client sees. The fixture is deterministic: index-derived content only, no
 * randomness or wall-clock (REQ-SYS-07).
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { CORE_MODULES } from '../../../src/core';
import { registerMemoryResources } from '../../../src/mcp/memory-resource';
import { registerCoreModules } from '../../../src/mcp/registrar';
import { commitAll, makeTempGitRepo, writeFixtureFile } from '../../storage/helpers/git-fixture';

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

export interface FixtureDoc {
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
export function seedReferenceRepo(): { root: string; docs: FixtureDoc[] } {
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

export async function connectedClient(root: string): Promise<{ client: Client; server: McpServer }> {
  const server = new McpServer({ name: 'wingfoil-test', version: '0.0.0' });
  registerCoreModules(server, CORE_MODULES, { resolveRoot: () => root, buildParams: () => ({ root }) });
  registerMemoryResources(server, { resolveRoot: () => root });
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'wingfoil-test-client', version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, server };
}

/**
 * The worst-case single-fetch scan position for the linear (type, id) lookup: the last document in
 * `listMemoryDocumentPaths`' sorted scan order (`docs/04_memory/v0.7/...` sorts last, type `task`).
 */
export function worstCaseDoc(docs: readonly FixtureDoc[]): FixtureDoc {
  const sorted = [...docs].sort((a, b) => (a.relativePath < b.relativePath ? -1 : 1));
  return sorted[sorted.length - 1]!;
}

/**
 * A handful of documents spread across the fixture (not just one hot document, and spanning more than one
 * type), simulating a real agent session's mixed fetch pattern.
 */
export function sessionDocs(docs: readonly FixtureDoc[]): FixtureDoc[] {
  return [0, 150, 350, 550, 750, 999].map((i) => docs[i]!);
}

/** The session's fetch pattern: every third fetch reads `wingfoil://dna/show`, the others cycle {@link sessionDocs}. */
export function sessionUri(sampleDocs: readonly FixtureDoc[], i: number): string {
  const doc = sampleDocs[i % sampleDocs.length]!;
  return i % 3 === 0 ? 'wingfoil://dna/show' : `wingfoil://memory/${doc.type}/${doc.id}`;
}

/** The fetches one sustained agent session makes on one connection (REQ-PERF-04 "for the duration of an agent session"). */
export const SESSION_ROUNDS = 200;
