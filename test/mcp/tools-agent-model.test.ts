/**
 * task-367 (refactor; `spec-018` §2.4, §1.1; `src/mcp/tools.ts`) — the Tools channel reads `WINGFOIL_AGENT_MODEL` only
 * for an operation the agent trailers apply to. An operation that declares `agentAttribution: false` (as `agent
 * execute` does, `spec-018` §1.1) is not refused for a model that is not one line, and runs inside the MCP agent
 * invocation like every other Tool call; one the trailers apply to is refused before it runs. Synthetic operations
 * over `registerCoreTools`, so no repository is read. Deterministic: fixed inputs, in-memory transport.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { currentAgentInvocation } from '../../src/core/agent-context';
import type { CoreModule } from '../../src/core/registry';
import { coreOk } from '../../src/core/types';
import { registerCoreTools } from '../../src/mcp/tools';

const calls: string[] = [];

const MODULES: CoreModule[] = [
  {
    name: 'x',
    operations: {
      xLaunch: {
        name: 'xLaunch',
        mutates: true,
        agentAttribution: false,
        fn: async () => {
          calls.push(`launch:${currentAgentInvocation().surface ?? 'none'}`);
          return coreOk('launched');
        },
      },
      xWrite: {
        name: 'xWrite',
        mutates: true,
        fn: async () => {
          calls.push('write');
          return coreOk('written');
        },
      },
    },
  },
];

async function connected(env: Record<string, string>): Promise<Client> {
  const server = new McpServer({ name: 'wingfoil-test', version: '0.0.0' });
  registerCoreTools(server, MODULES, { resolveRoot: () => '/fixture-root', buildParams: () => ({}), env });
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'wingfoil-test-client', version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

describe('task-367 — the Tools channel reads WINGFOIL_AGENT_MODEL only where the agent trailers apply', () => {
  beforeEach(() => calls.splice(0));

  it('an agentAttribution: false operation runs, inside the MCP agent invocation, with a multi-line model in the env', async () => {
    const client = await connected({ WINGFOIL_AGENT_MODEL: 'a\nb' });
    const result = await client.callTool({ name: 'x.launch', arguments: {} });
    await client.close();
    expect(result).toEqual({ content: [{ type: 'text', text: '"launched"' }] });
    expect(calls).toEqual(['launch:mcp']);
  });

  it('an operation the trailers apply to is refused before it runs, with the usage text', async () => {
    const client = await connected({ WINGFOIL_AGENT_MODEL: 'a\nb' });
    const result = await client.callTool({ name: 'x.write', arguments: {} });
    await client.close();
    expect(result).toEqual({
      content: [{ type: 'text', text: 'invalid environment value: WINGFOIL_AGENT_MODEL must be one line' }],
      isError: true,
    });
    expect(calls).toEqual([]);
  });

  it('a blank model is not refused (it falls back to not-reported)', async () => {
    const client = await connected({ WINGFOIL_AGENT_MODEL: '  ' });
    const result = await client.callTool({ name: 'x.write', arguments: {} });
    await client.close();
    expect(result.isError).toBeUndefined();
    expect(calls).toEqual(['write']);
  });
});
