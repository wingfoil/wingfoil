/**
 * task-367 (review fixes; `spec-014` §2, `bug-034`) — `startMcpServer` builds the production server and connects it
 * through the stdio transport, wrapped so that a JSON-RPC error it sends carries the reason alone. The stdio transport
 * is replaced by a jest module mock that records what it is asked to send, so no real stdio channel is opened (the
 * module doc of `src/mcp/server.ts`: a test never opens a real stdio server against a repository). Deterministic:
 * fixed messages, no process I/O.
 */
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';

const sent: JSONRPCMessage[] = [];
const started: string[] = [];

jest.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: class {
    onclose?: () => void;
    onerror?: (error: Error) => void;
    onmessage?: (message: JSONRPCMessage) => void;
    async start(): Promise<void> {
      started.push('start');
    }
    async send(message: JSONRPCMessage): Promise<void> {
      sent.push(message);
    }
    async close(): Promise<void> {
      this.onclose?.();
    }
  },
}));

import { startMcpServer } from '../../src/mcp/server';

describe('task-367 — startMcpServer connects through the stdio transport, wrapped for bare error messages', () => {
  it('starts the transport once, and an error it sends loses the SDK prefix (bug-034)', async () => {
    const server = await startMcpServer({ resolveRoot: () => '/fixture-root', roles: ['developer'] });
    expect(started).toEqual(['start']);

    const transport = server.server.transport as unknown as { send: (message: JSONRPCMessage) => Promise<void> };
    await transport.send({ jsonrpc: '2.0', id: 1, error: { code: -32602, message: 'MCP error -32602: Resource wingfoil://nope not found' } } as JSONRPCMessage);
    expect(sent).toEqual([{ jsonrpc: '2.0', id: 1, error: { code: -32602, message: 'Resource wingfoil://nope not found' } }]);

    await server.close();
  });
});
