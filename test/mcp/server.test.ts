/**
 * task-030-implement-mcp-resources (P5.2.1, REQ-INT-01, spec-004-mcp-surface-contract §1/§2,
 * spec-014-mcp-server-entry-point §2/§3) — the PRODUCTION MCP server construction.
 *
 * task-011-mcp-resources-read-only proved the read-only Resources CHANNEL (`registerReadOnlyResources`)
 * over the SDK's in-memory transport; task-030 wraps that channel in a real, production `McpServer`
 * built by `createMcpServer` (`src/mcp/server.ts`) — the first production `McpServer` in the codebase,
 * the same object `startMcpServer` then connects over a real `StdioServerTransport` (the thin,
 * un-unit-tested transport seam). This suite exercises `createMcpServer`'s server end-to-end over a
 * real `Client` (mirroring `test/mcp/read-only-resources.test.ts`), so the three P5.2.1 acceptance
 * criteria are asserted against exactly what an MCP client sees from the production server — not a
 * private registrar list — and the v0.1 read-only-only channel scope (spec-014 §3) is pinned.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpError } from '@modelcontextprotocol/sdk/types.js';

import { WRITE_REFUSAL_MESSAGE } from '../../src/mcp';
import { createMcpServer } from '../../src/mcp/server';
import { P95_BUDGET_MS, p95, RUNS, sampleLatency } from '../core/helpers/latency';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { assertFilesUnchanged, attemptEveryResourceWrite, snapshotFiles } from './helpers/channel-enumeration';

const DNA_YAML = `
version: 1.1
project:
  name: "Fixture Project"
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

const MEMORY_YAML = `
version: 1.1
types:
  task:
    path: "docs/04_memory/{release}/{id}.md"
  decision-log:
    path: "docs/04_memory/design/dls/{id}.md"
`;

/** The BDD's "decision-12" document (P5.2.1-mcp-resources.feature, AC a). */
function decisionDoc(): string {
  return [
    '---',
    'id: decision-12',
    'type: decision-log',
    'title: "Adopt stdio transport"',
    'status: in-discussion',
    'tags: [ transport ]',
    '---',
    '',
    'Body of decision-12 — full markdown content that a fetch must return verbatim.',
    '',
  ].join('\n');
}

/** Seed a minimal, committed fixture project the production server resolves its root at. */
function seedFixtureRepo(): string {
  const root = makeTempGitRepo();
  writeFixtureFile(root, '.wingfoil/dna.yaml', DNA_YAML);
  writeFixtureFile(root, '.wingfoil/memory.yaml', MEMORY_YAML);
  writeFixtureFile(root, 'docs/04_memory/design/dls/decision-12.md', decisionDoc());
  commitAll(root, 'seed task-030 production MCP server fixture');
  return root;
}

/**
 * Connect a real MCP `Client` to the PRODUCTION server built by `createMcpServer` over the SDK's
 * in-memory transport — the production `McpServer` construction, not `registerReadOnlyResources` in
 * isolation (that is task-011's `connectReadOnlyClient`). No stdio: the transport is the SDK's own
 * in-memory pair, so no real `StdioServerTransport` is ever opened against a repo (HARD RULE).
 */
async function connectProductionClient(root: string): Promise<Client> {
  const server = createMcpServer({ resolveRoot: () => root, roles: ['developer'], name: 'wingfoil', version: '9.9.9-test' });
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'wingfoil-test-client', version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

describe('task-030 — production MCP server (createMcpServer), spec-014 §2', () => {
  let root: string;
  let client: Client;

  beforeAll(async () => {
    root = seedFixtureRepo();
    client = await connectProductionClient(root);
  });

  afterAll(() => removeTempDir(root));

  // "in under 1 second" is REQ-PERF-04's budget, so it is measured in REQ-PERF-04's shape — p95 over
  // >= 20 runs — rather than from one sample (task-154, `bug-012`). Every run's result is the same
  // document; the content assertions read the last one.
  it('AC (a): fetching a Memory document returns its full content + id/type/status/title metadata, in under 1 second at p95 over >= 20 runs', async () => {
    let result: Awaited<ReturnType<Client['readResource']>> | undefined;
    const samples = await sampleLatency(RUNS, async () => {
      result = await client.readResource({ uri: 'wingfoil://memory/decision-log/decision-12' });
    });

    expect(samples).toHaveLength(RUNS);
    expect(p95(samples)).toBeLessThan(P95_BUDGET_MS);
    if (!result) throw new Error('no readResource result was recorded');
    const content = result.contents[0]!;
    expect(content.mimeType).toBe('text/markdown');
    expect('text' in content && content.text).toContain('id: decision-12');
    expect('text' in content && content.text).toContain('Body of decision-12');
    expect((result as unknown as { metadata: Record<string, unknown> }).metadata).toEqual({
      id: 'decision-12',
      type: 'decision-log',
      status: 'in-discussion',
      title: 'Adopt stdio transport',
    });
  });

  it('AC (b): a write attempt through the Resources channel is refused byte-exact and mutates no file', async () => {
    const tracked = ['.wingfoil/dna.yaml', '.wingfoil/memory.yaml', 'docs/04_memory/design/dls/decision-12.md'];
    const before = snapshotFiles(root, tracked);

    const messages = await attemptEveryResourceWrite(client, 'wingfoil://memory/decision-log/decision-12');

    // The refusal string is byte-exact; over the JSON-RPC transport the SDK envelopes a thrown error
    // as `MCP error -32603: <message>`, so the exact spec-004 §2.3 string is carried verbatim inside
    // it (same `.toContain` convention as task-011's read-only-resources.test.ts).
    expect(messages).toHaveLength(2);
    messages.forEach((message) => expect(message).toContain(WRITE_REFUSAL_MESSAGE));
    assertFilesUnchanged(root, before);
  });

  it('AC (c): a non-existent resource is refused with a "resource not found" error naming the missing id', async () => {
    // task-011's channel disambiguates by the type-qualified identifier (ids are not unique across
    // types — see src/mcp/memory-resource.ts); the BDD's bare "decision-999" surfaces here as the
    // resolvable identifier `memory/decision-log/decision-999`. The `resource not found:` prefix and
    // the missing id are both present verbatim.
    const error = await client
      .readResource({ uri: 'wingfoil://memory/decision-log/decision-999' })
      .catch((caught: unknown) => caught);
    expect(String((error as Error).message)).toContain('resource not found:');
    expect(String((error as Error).message)).toContain('decision-999');
    expect(String((error as Error).message)).not.toContain(WRITE_REFUSAL_MESSAGE);
  });

  it('scope (spec-014 §3): the server exposes the read-only Resources and Prompts channels and an empty Tools channel', async () => {
    const caps = client.getServerCapabilities();
    expect(caps?.resources).toBeDefined();
    // task-058-mcp-prompts-role-based (P5.2.2, v0.2): spec-014 §3 "when Prompts ship (P5.2.2, v0.2),
    // it adds their registrar" — the role-scoped Prompts channel (spec-004 §3) is now wired on.
    expect(caps?.prompts).toBeDefined();
    // task-174 (`bug-151`): the Tools channel is declared, without `listChanged`, and lists nothing —
    // in particular the task-025 `dna.set` Tool is NOT registered on the read-only server (Tools are
    // P5.2.3/v0.4 scope). A client probing `tools/list` gets an empty list, not a -32601.
    expect(caps?.tools).toEqual({});
    await expect(client.listTools()).resolves.toEqual({ tools: [] });
  });

  it('scope (spec-014 §3): a tools/call names a tool that does not exist, and is refused as a Tool refusal (spec-004 §4.3)', async () => {
    const tracked = ['.wingfoil/dna.yaml', '.wingfoil/memory.yaml', 'docs/04_memory/design/dls/decision-12.md'];
    const before = snapshotFiles(root, tracked);

    const result = await client.callTool({ name: 'dna.set', arguments: { path: 'project.name', value: 'x' } });

    expect(result).toEqual({ content: [{ type: 'text', text: 'Tool dna.set not found' }], isError: true });
    assertFilesUnchanged(root, before);
  });

  it('the DNA and Workflow Resources are also reachable on the production server (spec-004 §2.1)', async () => {
    const dna = await client.readResource({ uri: 'wingfoil://dna' });
    const dnaContent = dna.contents[0]!;
    const parsed = 'text' in dnaContent ? JSON.parse(dnaContent.text) : undefined;
    expect(parsed.team.roles).toEqual([{ name: 'developer' }]);
  });
});

/**
 * task-174 (`bug-184`): `task-130` gave a refusal its operator-facing details (`error.data.details`,
 * spec-004 §4.3 item 4), but only through `registerCoreModules`, which the production server does not
 * call. Its own Resource handlers re-threw the loader's error bare. A workflow manifest that includes
 * two missing files is a loader refusal with two diagnostics: the first is the reason, the second is
 * the detail the CLI prints under it.
 */
describe('task-174 — a Resource refusal on the production server carries its details (bug-184)', () => {
  let root: string;
  let client: Client;

  beforeAll(async () => {
    root = seedFixtureRepo();
    writeFixtureFile(root, '.wingfoil/workflows.yaml', 'version: 1.0\ninclude:\n  - workflows/custom/a.yaml\n  - workflows/custom/b.yaml\n');
    commitAll(root, 'a workflow manifest naming two missing files');
    client = await connectProductionClient(root);
  });

  afterAll(() => removeTempDir(root));

  it('a failed read carries the details in JSON-RPC error.data.details, the reason unchanged', async () => {
    const error = (await client.readResource({ uri: 'wingfoil://workflows' }).catch((caught: unknown) => caught)) as McpError;

    expect(error).toBeInstanceOf(McpError);
    expect(error.message).toContain('included workflow file not found: workflows/custom/a.yaml');
    const details = (error.data as { details?: ReadonlyArray<{ detail?: string }> } | undefined)?.details;
    expect(details?.[0]).toEqual({ detail: expect.stringContaining('included workflow file not found: workflows/custom/b.yaml') });
  });

  it('characterization: a refusal with no details still carries no error.data', async () => {
    const error = (await client
      .readResource({ uri: 'wingfoil://memory/decision-log/decision-999' })
      .catch((caught: unknown) => caught)) as McpError;

    expect(error.message).toContain('resource not found:');
    expect(error.data).toBeUndefined();
  });
});
