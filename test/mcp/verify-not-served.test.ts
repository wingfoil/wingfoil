/**
 * task-365 AC 1 (T-35; `spec-020` §1 "An MCP surface", §2.1; design D5 (a), D10 (a)) — `wingfoil verify` is CLI only:
 * the production MCP server (`createMcpServer`, the SDK's in-memory transport) lists no Resource, Resource template or
 * Tool whose URI or name contains `verify`.
 *
 * The production server derives only the Tools of the `mutates: true` operations and hand-registers its Resources
 * (`task-367`), and `verify` is `mutates: false`: this suite is a characterization within AC 1 (D5 (a)) — it passes
 * before green and guards the route a later task could change (D5 (b) is that task's move). The registry side of T-35
 * (`verify.verify` registered, `wingfoil://verify` derived by the test-only mechanical registrar) is in
 * `test/core/production-registry.test.ts` and `test/core/parity.test.ts`.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { createMcpServer } from '../../src/mcp/server';

describe('task-365 AC 1 — T-35: the production MCP server serves verify on no channel (spec-020 §1, D5 (a))', () => {
  let client: Client;

  beforeAll(async () => {
    const server = createMcpServer({ resolveRoot: () => '/fixture-root', roles: ['developer'], name: 'wingfoil', version: '0.0.0-test' });
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: 'task-365-verify-not-served', version: '0.0.0' });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  });

  afterAll(async () => {
    await client.close();
  });

  it('no Resource URI contains verify (and the server does list Resources)', async () => {
    const { resources } = await client.listResources();
    expect(resources.length).toBeGreaterThan(0);
    expect(resources.map((resource) => resource.uri).filter((uri) => uri.includes('verify'))).toEqual([]);
  });

  it('no Resource template contains verify', async () => {
    const { resourceTemplates } = await client.listResourceTemplates();
    expect(resourceTemplates.map((template) => template.uriTemplate).filter((uri) => uri.includes('verify'))).toEqual([]);
  });

  it('no Tool name contains verify (and the server does list Tools)', async () => {
    const { tools } = await client.listTools();
    expect(tools.length).toBeGreaterThan(0);
    expect(tools.map((tool) => tool.name).filter((name) => name.includes('verify'))).toEqual([]);
  });
});
