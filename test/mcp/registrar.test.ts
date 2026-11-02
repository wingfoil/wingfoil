/**
 * `src/mcp`'s registrar — the thin adapter that derives MCP Tools (mutating) and Resources
 * (read-only) from the same `CoreModule[]` registry (spec-006 §2/§4, spec-004 Tool naming +
 * Resources-are-read-only channel split, REQ-SEC-05). Exercised end-to-end over the SDK's own
 * in-memory transport + a real `Client`, so these tests observe exactly what an MCP client would
 * see — not a private/internal registration list.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { CoreModule } from '../../src/core/registry';
import { coreErr, coreOk } from '../../src/core/types';
import { CORE_MODULES } from '../../src/core';
import { enumerateOperations, deriveVerb } from '../../src/core/registry';
import { createMcpServer, deriveMcpResourceUri, registerCoreModules as registerCoreModulesFromBarrel } from '../../src/mcp';
import { registerCoreModules } from '../../src/mcp/registrar';

const FIXTURE_MODULES: CoreModule[] = [
  {
    name: 'dna',
    operations: {
      dnaShow: { name: 'dnaShow', mutates: false, fn: async () => coreOk({ hello: 'world' }) },
      dnaSet: { name: 'dnaSet', mutates: true, fn: async () => coreOk({ committed: true }) },
    },
  },
  {
    name: 'memory',
    operations: {
      memoryApprove: {
        name: 'memoryApprove',
        mutates: true,
        fn: async () => coreErr({ code: 'INVALID_TRANSITION', message: 'illegal transition: draft to approved' }),
      },
      memorySearch: {
        name: 'memorySearch',
        mutates: false,
        fn: async () => coreErr({ code: 'NOT_FOUND', message: 'element not found: task/task-999' }),
      },
    },
  },
];

async function connectedClient(modules: CoreModule[]): Promise<{ client: Client; server: McpServer }> {
  const server = new McpServer({ name: 'wingfoil-test', version: '0.0.0' });
  registerCoreModules(server, modules, { resolveRoot: () => '/fixture-root', buildParams: () => ({}) });
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'wingfoil-test-client', version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, server };
}

describe('registerCoreModules — channel split (REQ-SEC-05: only Tools mutate)', () => {
  it('registers every `mutates: true` operation as a Tool, named `{module}.{verb}`', async () => {
    const { client } = await connectedClient(FIXTURE_MODULES);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(['dna.set', 'memory.approve']);
  });

  it('registers every `mutates: false` operation as a Resource, under a `wingfoil://` URI, never as a Tool', async () => {
    const { client } = await connectedClient(FIXTURE_MODULES);
    const { resources } = await client.listResources();
    expect(resources.map((r) => r.uri).sort()).toEqual([
      'wingfoil://dna/show',
      'wingfoil://memory/search',
    ]);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).not.toContain('dna.show');
    expect(tools.map((t) => t.name)).not.toContain('memory.search');
  });

  it('a "self-named" operation (flat/no-verb CLI command, task-028 `wingfoil paths`) registers under the bare-noun URI, not a trailing-slash one', async () => {
    const FLAT_MODULES: CoreModule[] = [
      {
        name: 'paths',
        operations: {
          paths: { name: 'paths', mutates: false, fn: async () => coreOk({ category: 'sources', paths: ['src/'] }) },
        },
      },
    ];
    const { client } = await connectedClient(FLAT_MODULES);
    const { resources } = await client.listResources();
    expect(resources.map((r) => r.uri)).toEqual(['wingfoil://paths']);
  });
});

describe('registerCoreModules — Tool dispatch', () => {
  it('a successful mutating call returns the CoreResult value as tool content, isError unset', async () => {
    const { client } = await connectedClient(FIXTURE_MODULES);
    const result = await client.callTool({ name: 'dna.set', arguments: {} });
    expect(result.isError).toBeFalsy();
    expect(result.content).toEqual([{ type: 'text', text: JSON.stringify({ committed: true }) }]);
  });

  it('a CoreResult.error from a Tool call is reported identically in shape to the CLI (isError: true, same message)', async () => {
    const { client } = await connectedClient(FIXTURE_MODULES);
    const result = await client.callTool({ name: 'memory.approve', arguments: {} });
    expect(result.isError).toBe(true);
    expect(result.content).toEqual([{ type: 'text', text: 'illegal transition: draft to approved' }]);
  });
});

describe('registerCoreModules — Resource dispatch', () => {
  it('a successful read returns the CoreResult value serialized as JSON text', async () => {
    const { client } = await connectedClient(FIXTURE_MODULES);
    const result = await client.readResource({ uri: 'wingfoil://dna/show' });
    expect(result.contents).toEqual([
      { uri: 'wingfoil://dna/show', mimeType: 'application/json', text: JSON.stringify({ hello: 'world' }) },
    ]);
  });

  it('a CoreResult.error from a Resource read surfaces as a protocol-level read failure, not a silent empty payload', async () => {
    const { client } = await connectedClient(FIXTURE_MODULES);
    await expect(client.readResource({ uri: 'wingfoil://memory/search' })).rejects.toThrow(
      /element not found: task\/task-999/,
    );
  });
});

describe('task-323 AC 2 (characterization, bug-396) — what the shipped server lists against what registerCoreModules derives', () => {
  it('registerCoreModules stays exported by the src/mcp barrel', () => {
    expect(typeof registerCoreModulesFromBarrel).toBe('function');
    expect(registerCoreModulesFromBarrel).toBe(registerCoreModules);
  });

  // Copied from `node dist/cli.js mcp` fed `initialize`, `resources/list` and `resources/templates/list` over stdio.
  it('createMcpServer lists the four Resource URIs and five templates `wingfoil mcp` serves, and none of the URIs registerCoreModules derives', async () => {
    const server = createMcpServer({ resolveRoot: () => '/fixture-root', roles: ['developer'], name: 'wingfoil', version: '0.0.0-test' });
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'wingfoil-test-client', version: '0.0.0' });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const listed = (await client.listResources()).resources.map((resource) => resource.uri).sort();
    expect(listed).toEqual(['wingfoil://dna', 'wingfoil://workflows', 'wingfoil://workflows/-/next', 'wingfoil://workflows/-/status']);
    const templates = (await client.listResourceTemplates()).resourceTemplates.map((template) => template.uriTemplate).sort();
    expect(templates).toEqual([
      'wingfoil://dna/{section}',
      'wingfoil://memory/{type}',
      'wingfoil://memory/{type}/{id}',
      'wingfoil://session/{role}/{element}/{state}',
      'wingfoil://workflows/{name}',
    ]);
    const derived = enumerateOperations(CORE_MODULES)
      .filter(({ operation }) => !operation.mutates)
      .map(({ module, operation }) => deriveMcpResourceUri(module.name, deriveVerb(module.name, operation.name)));
    expect(derived.length).toBeGreaterThan(0);
    for (const uri of derived) expect([...listed, ...templates]).not.toContain(uri);
  });
});
