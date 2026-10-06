/**
 * `CoreError.details` reaches the MCP client (task-130 AC1, `dl-055` option 1, `spec-004`).
 *
 * The registrar used to keep only `error.message`. The rule under test:
 *
 * - a failed **Resource** read is a JSON-RPC error whose `data.details` is the same `{file?, detail?}`
 *   array the CLI prints under `--format json` — `error.data` is the field JSON-RPC defines for it;
 * - a failed **Tool** call is an `isError` result, which has no JSON-RPC `error` object at all (the
 *   SDK turns a thrown error into a tool result), so the same object rides as its `structuredContent`
 *   `{error, details}` — the CLI's JSON error shape;
 * - in both, the message text is unchanged, so a Tool refusal stays identical to the CLI's reason
 *   (`spec-004` §4.3), and an error without details carries no `data`/`structuredContent`.
 *
 * Observed over the SDK's in-memory transport with a real `Client`, as `./registrar.test.ts` does.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { McpError } from '@modelcontextprotocol/sdk/types.js';

import type { CoreModule } from '../../src/core/registry';
import { coreErr } from '../../src/core/types';
import { registerCoreModules } from '../../src/mcp/registrar';

const CONTRACT = "illegal transition draft -> (none) for type 'task'";
const FILE = 'docs/memory/task/task-001-x.md';
const DETAIL = 'not a `gates` state: `approve` is only legal from a gate';
const ISSUES = [{ code: 'E_INVALID_TRANSITION', path: 'status', file: FILE, message: CONTRACT, detail: DETAIL }];

const MODULES: CoreModule[] = [
  {
    name: 'memory',
    operations: {
      memoryApprove: {
        name: 'memoryApprove',
        mutates: true,
        fn: async () => coreErr({ code: 'INVALID_TRANSITION', message: CONTRACT, details: { issues: ISSUES } }),
      },
      memorySubmit: {
        name: 'memorySubmit',
        mutates: true,
        fn: async () => coreErr({ code: 'NOT_FOUND', message: 'document not found: task-999' }),
      },
      memorySearch: {
        name: 'memorySearch',
        mutates: false,
        fn: async () => coreErr({ code: 'VALIDATION', message: 'cannot parse a memory document', details: { issues: ISSUES } }),
      },
      memoryHistory: {
        name: 'memoryHistory',
        mutates: false,
        fn: async () => coreErr({ code: 'NOT_FOUND', message: 'document not found: task-999' }),
      },
    },
  },
];

async function connectedClient(): Promise<Client> {
  const server = new McpServer({ name: 'wingfoil-test', version: '0.0.0' });
  registerCoreModules(server, MODULES, { resolveRoot: () => '/fixture-root', buildParams: () => ({}) });
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'wingfoil-test-client', version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

/** The rejection of a read, as the client sees it. */
async function readFailure(client: Client, uri: string): Promise<McpError> {
  const error: unknown = await client.readResource({ uri }).then(
    () => undefined,
    (rejection: unknown) => rejection,
  );
  expect(error).toBeInstanceOf(McpError);
  return error as McpError;
}

describe('AC1 — CoreError.details on the MCP surface (dl-055 option 1)', () => {
  it('a failed Resource read carries the details in JSON-RPC `error.data.details`', async () => {
    const error = await readFailure(await connectedClient(), 'wingfoil://memory/search');
    expect(error.message).toContain('cannot parse a memory document');
    expect(error.data).toEqual({ details: [{ file: FILE, detail: DETAIL }] });
  });

  it('a failed Resource read without details carries no `error.data`', async () => {
    const error = await readFailure(await connectedClient(), 'wingfoil://memory/history');
    expect(error.data).toBeUndefined();
  });

  it('a failed Tool call keeps the reason as its text and carries `{error, details}` as structuredContent', async () => {
    const result = await (await connectedClient()).callTool({ name: 'memory.approve', arguments: {} });
    expect(result.isError).toBe(true);
    expect(result.content).toEqual([{ type: 'text', text: CONTRACT }]);
    expect(result.structuredContent).toEqual({ error: CONTRACT, details: [{ file: FILE, detail: DETAIL }] });
  });

  it('characterization: a failed Tool call without details is the text-only `isError` result it always was', async () => {
    const result = await (await connectedClient()).callTool({ name: 'memory.submit', arguments: {} });
    expect(result).toEqual({ content: [{ type: 'text', text: 'document not found: task-999' }], isError: true });
  });
});
