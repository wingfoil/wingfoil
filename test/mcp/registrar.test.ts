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
import { McpError } from '@modelcontextprotocol/sdk/types.js';

import type { CoreModule } from '../../src/core/registry';
import { coreErr, coreOk } from '../../src/core/types';
import { reportWarning } from '../../src/validation/warning';
import { CORE_MODULES } from '../../src/core';
import { enumerateOperations, deriveVerb } from '../../src/core/registry';
import { createMcpServer, deriveMcpResourceUri, registerCoreModules as registerCoreModulesFromBarrel } from '../../src/mcp';
import { deriveMcpResourceUri as deriveMcpResourceUriFromRegistrar, registerCoreModules } from '../../src/mcp/registrar';

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

describe('task-364 AC 2 — a required positional becomes a URI template segment (spec-004 §2.1, spec-006 §3, dl-040 option 1)', () => {
  it('deriveMcpResourceUri appends /{<name>} for a required positional, and only then', () => {
    expect(deriveMcpResourceUriFromRegistrar('memory', 'history', { name: 'id', required: true, description: 'd' })).toBe(
      'wingfoil://memory/history/{id}',
    );
    expect(deriveMcpResourceUriFromRegistrar('memory', 'history', { name: 'id', description: 'd' })).toBe('wingfoil://memory/history');
    expect(deriveMcpResourceUriFromRegistrar('x', '', { name: 'n', required: true, description: 'd' })).toBe('wingfoil://x/{n}');
    expect(deriveMcpResourceUriFromRegistrar('memory', 'history')).toBe('wingfoil://memory/history');
  });

  /** Module `x`, read op `xShow` with a required positional `run-id`; its `fn` returns the params it received. */
  const TEMPLATE_MODULES: CoreModule[] = [
    {
      name: 'x',
      operations: {
        xShow: {
          name: 'xShow',
          mutates: false,
          positional: { name: 'run-id', required: true, description: 'a run id' },
          fn: async (params) => coreOk(params),
        },
      },
    },
  ];

  async function templateClient(): Promise<Client> {
    const server = new McpServer({ name: 'wingfoil-test', version: '0.0.0' });
    registerCoreModules(server, TEMPLATE_MODULES, {
      resolveRoot: () => '/fixture-root',
      buildParams: (ctx) => ({ positional: ctx.positional, positionals: ctx.positionals }),
    });
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'wingfoil-test-client', version: '0.0.0' });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    return client;
  }

  it('a read of the template percent-decodes the variable and hands it to the operation as its positional', async () => {
    const client = await templateClient();
    const result = await client.readResource({ uri: 'wingfoil://x/show/a%2Fb%2F1' });
    const text = (result.contents[0] as { text: string }).text;
    expect(JSON.parse(text)).toEqual({ positional: 'a/b/1', positionals: ['a/b/1'] });
  });

  it('a variable that is not valid percent-encoding is a failed read naming the parameter', async () => {
    const client = await templateClient();
    const error: unknown = await client.readResource({ uri: 'wingfoil://x/show/%E0%A4%A' }).then(
      () => undefined,
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(McpError);
    expect((error as McpError).message).toContain('invalid argument: run-id must be percent-encoded');
  });
});

describe('task-323 AC 2 (characterization, bug-396) — what the shipped server lists against what registerCoreModules derives', () => {
  it('registerCoreModules stays exported by the src/mcp barrel', () => {
    expect(typeof registerCoreModulesFromBarrel).toBe('function');
    expect(registerCoreModulesFromBarrel).toBe(registerCoreModules);
  });

  // Copied from `node dist/cli.js mcp` fed `initialize`, `resources/list` and `resources/templates/list` over stdio.
  // task-362 (`spec-019` §6, design D6): the production server also hand-registers `wingfoil://capabilities`, which is
  // the URI the registrar derives for the self-named `capabilities` operation — the one URI the two lists share.
  it('createMcpServer lists the five Resource URIs and five templates `wingfoil mcp` serves, and of the URIs registerCoreModules derives only wingfoil://capabilities', async () => {
    const server = createMcpServer({ resolveRoot: () => '/fixture-root', roles: ['developer'], name: 'wingfoil', version: '0.0.0-test' });
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'wingfoil-test-client', version: '0.0.0' });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const listed = (await client.listResources()).resources.map((resource) => resource.uri).sort();
    expect(listed).toEqual([
      'wingfoil://capabilities',
      'wingfoil://dna',
      'wingfoil://workflows',
      'wingfoil://workflows/-/next',
      'wingfoil://workflows/-/status',
    ]);
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
    expect(derived.filter((uri) => [...listed, ...templates].includes(uri))).toEqual(['wingfoil://capabilities']);
  });
});

describe('task-362 AC 2 — the test-only registrar resolves no root for a readsProject: false operation (spec-019 §1)', () => {
  /** A flat module `x` whose self-named read operation declares (or not) `readsProject: false`. */
  async function readX(readsProject: boolean): Promise<{ resolveRoot: jest.Mock<string, []>; contexts: object[]; text: string }> {
    const resolveRoot = jest.fn((): string => '/fixture-root');
    const contexts: object[] = [];
    const operation = readsProject
      ? { name: 'x', mutates: false, fn: async () => coreOk({ built: true }) }
      : { name: 'x', mutates: false, readsProject: false as const, fn: async () => coreOk({ built: true }) };
    const server = new McpServer({ name: 'wingfoil-test', version: '0.0.0' });
    registerCoreModules(server, [{ name: 'x', operations: { x: operation } }], {
      resolveRoot,
      buildParams: (ctx) => {
        contexts.push(ctx);
        return {};
      },
    });
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'wingfoil-test-client', version: '0.0.0' });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const result = await client.readResource({ uri: 'wingfoil://x' });
    return { resolveRoot, contexts, text: (result.contents[0] as { text: string }).text };
  }

  it('reading wingfoil://x never calls resolveRoot, and the params context carries no `root` key', async () => {
    const { resolveRoot, contexts, text } = await readX(false);
    expect(resolveRoot).not.toHaveBeenCalled();
    expect(contexts).toHaveLength(1);
    expect('root' in contexts[0]!).toBe(false);
    expect(text).toBe(JSON.stringify({ built: true }));
  });

  it('the same operation without the field resolves the root once', async () => {
    const { resolveRoot } = await readX(true);
    expect(resolveRoot).toHaveBeenCalledTimes(1);
  });
});

/**
 * task-367 AC 5 (`spec-004` §4.3 items 4–5; approver rulings D3, D7): a Tool refusal keeps the operation's warnings
 * and its hint. A warning raised while the operation runs is collected for the call (one warning sink per Tool call)
 * and rides the refusal's `structuredContent` beside the CLI's `--format json` error object `{error, hint?, details?}`.
 * Red until green: today the hint is dropped, the warning goes to the server's stderr, and with no details there is no
 * `structuredContent` at all.
 */
describe('task-367 AC 5 — a refusal carries {error, hint, warnings} in structuredContent (D3, D7)', () => {
  it('a synthetic op that reports w1 then refuses with a hint: structuredContent is exactly { error, hint, warnings }', async () => {
    const modules: CoreModule[] = [
      {
        name: 'x',
        operations: {
          xWrite: {
            name: 'xWrite',
            mutates: true,
            fn: async () => {
              reportWarning('w1');
              return coreErr({ code: 'VALIDATION', message: 'm', hint: 'h' });
            },
          },
        },
      },
    ];
    const { client } = await connectedClient(modules);

    const result = await client.callTool({ name: 'x.write', arguments: {} });

    expect(result.isError).toBe(true);
    expect(result.content).toEqual([{ type: 'text', text: 'm' }]);
    expect(result.structuredContent).toEqual({ error: 'm', hint: 'h', warnings: ['w1'] });
  });
});
