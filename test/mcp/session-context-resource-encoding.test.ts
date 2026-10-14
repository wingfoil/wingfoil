/**
 * task-236 (developer's own test, beside red 2's `session-context-resource.test.ts`) — the session Resource
 * through the `src/mcp` barrel, and a URI variable that is not valid percent-encoding: it is checked as sent,
 * so a malformed element-ref is refused with spec-004 §3.4's message rather than a decoding error.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

import { createMcpServer, registerSessionContextResource, SESSION_CONTEXT_URI_TEMPLATE } from '../../src/mcp';
import { makeTempGitRepo, removeTempDir } from '../storage/helpers/git-fixture';

describe('the session Resource — barrel exports and undecodable variables (task-236)', () => {
  let root: string;
  beforeAll(() => {
    root = makeTempGitRepo();
  });
  afterAll(() => removeTempDir(root));

  it('the barrel exports the template and its registrar', () => {
    expect(SESSION_CONTEXT_URI_TEMPLATE).toBe('wingfoil://session/{role}/{element}/{state}');
    expect(typeof registerSessionContextResource).toBe('function');
  });

  it('an element that is not valid percent-encoding is refused as a malformed element-ref, as sent', async () => {
    const server = createMcpServer({ resolveRoot: () => root, roles: ['developer'] });
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'wingfoil-test-client', version: '0.0.0' });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    let error: unknown;
    try {
      await client.readResource({ uri: 'wingfoil://session/developer/task%E0%A4/0123456789abcdef0123456789abcdef01234567' });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(McpError);
    expect((error as McpError).code).toBe(ErrorCode.InvalidParams);
    expect((error as McpError).message).toBe('MCP error -32602: malformed element-ref "task%E0%A4": expected <type>:<id>');
  });
});
