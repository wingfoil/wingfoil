/**
 * task-367 AC 6 (`bug-034`; `spec-004` §1, `spec-014` §3 as amended; approver ruling D4 (A)) — a JSON-RPC error the
 * production server sends carries the reason alone in `error.message`, so a client that renders its own
 * `MCP error <code>:` prefix renders one. The SDK's `McpError` builds that prefix into its message, and the server
 * sends the message as is; D4 strips it from every outgoing error at the transport (`src/mcp/wire-errors.ts`, new):
 *
 * - `stripMcpErrorPrefix(message)`: an error response whose `error.message` starts with `MCP error <its own code>: `
 *   loses that prefix once; any other message is returned unchanged (pure);
 * - `withBareErrorMessages(transport)`: the transport, its `send` calling the previous `send` with the stripped
 *   message; `createMcpServer`'s `connect` wraps the transport it is given with it.
 *
 * On the production server the recorder is installed on the server transport's `send` BEFORE `server.connect`, so it
 * sees what the wrapper hands on: the bytes that go on the wire.
 *
 * Red until green: the module does not exist ("Cannot find module" under jest, TS2307 under `tsc`), and the server
 * sends `MCP error -32602: Resource wingfoil://nope not found`, which the client renders with a second prefix.
 * Deterministic: in-memory transport, fixed messages.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';

import { createMcpServer } from '../../src/mcp/server';
import { stripMcpErrorPrefix, withBareErrorMessages } from '../../src/mcp/wire-errors';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const errorResponse = (code: number, message: string): JSONRPCMessage =>
  ({ jsonrpc: '2.0', id: 7, error: { code, message } }) as JSONRPCMessage;

describe('task-367 AC 6 — stripMcpErrorPrefix (pure)', () => {
  it('strips the prefix that names the error\'s own code: MCP error -32602: x → x', () => {
    expect(stripMcpErrorPrefix(errorResponse(-32602, 'MCP error -32602: x'))).toEqual(errorResponse(-32602, 'x'));
  });

  it('strips it once: MCP error -32602: MCP error -32602: x → MCP error -32602: x', () => {
    expect(stripMcpErrorPrefix(errorResponse(-32602, 'MCP error -32602: MCP error -32602: x'))).toEqual(errorResponse(-32602, 'MCP error -32602: x'));
  });

  it('leaves a prefix naming another code: MCP error -1: x with code -32602 is unchanged', () => {
    expect(stripMcpErrorPrefix(errorResponse(-32602, 'MCP error -1: x'))).toEqual(errorResponse(-32602, 'MCP error -1: x'));
  });

  it('leaves a result message and a notification unchanged', () => {
    const result = { jsonrpc: '2.0', id: 7, result: { content: [{ type: 'text', text: 'MCP error -32602: x' }] } } as JSONRPCMessage;
    const notification = { jsonrpc: '2.0', method: 'notifications/message', params: { data: 'MCP error -32602: x' } } as JSONRPCMessage;
    expect(stripMcpErrorPrefix(result)).toEqual(result);
    expect(stripMcpErrorPrefix(notification)).toEqual(notification);
  });

  it('does not change the message it is given', () => {
    const message = errorResponse(-32602, 'MCP error -32602: x');
    stripMcpErrorPrefix(message);
    expect(message).toEqual(errorResponse(-32602, 'MCP error -32602: x'));
  });
});

describe('task-367 AC 6 — withBareErrorMessages', () => {
  it('returns a transport whose send hands the previous send the stripped message', async () => {
    const sent: JSONRPCMessage[] = [];
    const transport = {
      start: async () => undefined,
      close: async () => undefined,
      send: async (message: JSONRPCMessage) => {
        sent.push(message);
      },
    } as Transport;

    const wrapped = withBareErrorMessages(transport);
    await wrapped.send(errorResponse(-32602, 'MCP error -32602: Resource wingfoil://nope not found'));
    await wrapped.send({ jsonrpc: '2.0', id: 8, result: {} } as JSONRPCMessage);

    expect(sent).toEqual([errorResponse(-32602, 'Resource wingfoil://nope not found'), { jsonrpc: '2.0', id: 8, result: {} }]);
  });
});

describe('task-367 AC 6 — the production server sends the reason alone (bug-034)', () => {
  let root: string;
  beforeAll(() => {
    root = makeTempGitRepo();
    writeFixtureFile(root, '.wingfoil/dna.yaml', 'version: 1.1\nproject:\n  name: "Fx"\nmodules:\n  - name: core\n    path: src/core\n');
    writeFixtureFile(root, '.wingfoil/memory.yaml', 'version: 1.1\ntypes:\n  task:\n    path: "docs/tasks/{id}.md"\n');
    commitAll(root, 'fixture: bug-034');
  });
  afterAll(() => removeTempDir(root));

  it('readResource wingfoil://nope: the client sees one prefix, the wire carries { code: -32602, message: the reason }', async () => {
    const server = createMcpServer({ resolveRoot: () => root, roles: ['developer'] });
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    const recorded: JSONRPCMessage[] = [];
    const send = serverTransport.send.bind(serverTransport);
    serverTransport.send = async (message, options) => {
      recorded.push(message);
      return send(message, options);
    };
    const client = new Client({ name: 'wingfoil-task-367-client', version: '0.0.0' });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const error = (await client.readResource({ uri: 'wingfoil://nope' }).then(
      () => undefined,
      (caught: unknown) => caught,
    )) as Error | undefined;
    await client.close();

    expect(error?.message).toBe('MCP error -32602: Resource wingfoil://nope not found');
    const errors = recorded
      .filter((message): message is JSONRPCMessage & { error: { code: number; message: string } } => 'error' in message)
      .map((message) => ({ code: message.error.code, message: message.error.message }));
    expect(errors).toEqual([{ code: -32602, message: 'Resource wingfoil://nope not found' }]);
  });
});
