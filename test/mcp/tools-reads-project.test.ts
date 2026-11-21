/**
 * task-367 (merge of task-362; `spec-006` §2, `spec-019` §1; `src/mcp/tools.ts`) — the Tools channel resolves no
 * project root for an operation that declares `readsProject: false`: `resolveRoot` is never called, and the params
 * context the builder receives carries no `root` key. The rule is declared on the operation, never by a name in a
 * registrar (`spec-006` §2), so it holds for a mutating operation too, which no shipped operation is today
 * (`capabilities` is `mutates: false`; `test/mcp/registrar.test.ts` pins the Resource half). Synthetic operations
 * over `registerCoreTools`, so no repository is read. Deterministic: fixed inputs, in-memory transport.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { CoreModule, CoreOperation } from '../../src/core/registry';
import { coreOk } from '../../src/core/types';
import { registerCoreTools } from '../../src/mcp/tools';

async function callX(readsProject: boolean): Promise<{ resolveRoot: jest.Mock<string, []>; contexts: object[]; text: string | undefined }> {
  const resolveRoot = jest.fn((): string => '/fixture-root');
  const contexts: object[] = [];
  const base: CoreOperation = { name: 'xWrite', mutates: true, fn: async () => coreOk({ written: true }) };
  const operation: CoreOperation = readsProject ? base : { ...base, readsProject: false };
  const modules: CoreModule[] = [{ name: 'x', operations: { xWrite: operation } }];
  const server = new McpServer({ name: 'wingfoil-test', version: '0.0.0' });
  registerCoreTools(server, modules, {
    resolveRoot,
    buildParams: (ctx) => {
      contexts.push(ctx);
      return {};
    },
    env: {},
  });
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'wingfoil-test-client', version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  const result = await client.callTool({ name: 'x.write', arguments: {} });
  await client.close();
  const content = (result as { content?: ReadonlyArray<{ text?: string }> }).content;
  return { resolveRoot, contexts, text: content?.[0]?.text };
}

describe('task-367 — the Tools channel resolves no root for a readsProject: false operation (spec-006 §2, spec-019 §1)', () => {
  it('a mutating readsProject: false operation: resolveRoot is never called, and the params context carries no `root` key', async () => {
    const { resolveRoot, contexts, text } = await callX(false);
    expect(resolveRoot).not.toHaveBeenCalled();
    expect(contexts).toHaveLength(1);
    expect('root' in contexts[0]!).toBe(false);
    expect(text).toBe(JSON.stringify({ written: true }));
  });

  it('the same operation without the field resolves the root once and passes it as `root`', async () => {
    const { resolveRoot, contexts } = await callX(true);
    expect(resolveRoot).toHaveBeenCalledTimes(1);
    expect((contexts[0] as { root?: string }).root).toBe('/fixture-root');
  });
});
