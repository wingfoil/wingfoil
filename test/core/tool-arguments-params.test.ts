/**
 * task-364 (developer's own tests, beside the red suites): the cases of `toolArgumentsToParams` and
 * `deriveToolInputSchema` the red suites do not drive over `CORE_MODULES`, on synthetic operations — a declaration
 * with no description, a flag given in a successful call, the `options` shape on each side of the CLI's
 * `withoutAgentOptions` rule, an absent argument record, an array with a non-string item — and the registrar's
 * answer to a Tool name it does not know (`Tool <name> not found`, the empty channel's wording).
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { deriveToolInputSchema, toolArgumentsToParams, type CoreOperation } from '../../src/core/registry';
import { coreOk } from '../../src/core/types';
import { registerCoreModules } from '../../src/mcp/registrar';

const fn = async (): Promise<ReturnType<typeof coreOk>> => coreOk(null);

/** A mutating operation with undescribed declarations of every kind. */
const BARE: CoreOperation = {
  name: 'xWrite',
  mutates: true,
  fn,
  positional: { name: 'id', description: 'the id' },
  options: [{ name: 'tag' }, { name: 'set', repeatable: true }],
  flags: [{ name: 'force' }],
};

describe('task-364 — deriveToolInputSchema on declarations without a description', () => {
  it('omits the description key, and lists nothing as required when nothing is', () => {
    expect(deriveToolInputSchema(BARE)).toEqual({
      type: 'object',
      properties: {
        id: { type: 'string', description: 'the id' },
        tag: { type: 'string' },
        set: { type: 'array', items: { type: 'string' } },
        force: { type: 'boolean' },
        'dry-run': expect.objectContaining({ type: 'boolean' }),
      },
      additionalProperties: false,
    });
    expect(Object.keys(deriveToolInputSchema(BARE).properties.tag ?? {})).toEqual(['type']);
  });
});

describe('task-364 — toolArgumentsToParams maps arguments to the CLI registrar\'s context', () => {
  it('a given flag is true and the others false; given options are kept; no positional is []', () => {
    expect(toolArgumentsToParams(BARE, { force: true, tag: 't', set: ['a=b', 'c=d'] })).toEqual({
      ok: true,
      context: { positional: undefined, positionals: [], flags: { force: true }, options: { tag: 't', set: ['a=b', 'c=d'] } },
      dryRun: false,
    });
  });

  it('an absent argument record is an empty one: options undefined on an operation the CLI gives --co-author', () => {
    expect(toolArgumentsToParams(BARE, undefined)).toEqual({
      ok: true,
      context: { positional: undefined, positionals: [], flags: { force: false }, options: undefined },
      dryRun: false,
    });
  });

  it('options stay {} when none is given on an operation that opts out of agent attribution, as on the CLI', () => {
    const optedOut: CoreOperation = { ...BARE, agentAttribution: false };
    expect(toolArgumentsToParams(optedOut, { id: 'x', 'dry-run': true })).toEqual({
      ok: true,
      context: { positional: 'x', positionals: ['x'], flags: { force: false }, options: {} },
      dryRun: true,
    });
  });

  it('a read-only operation takes no dry-run: it is an unknown argument there', () => {
    const read: CoreOperation = { name: 'xRead', mutates: false, fn };
    expect(toolArgumentsToParams(read, { 'dry-run': true })).toEqual({ ok: false, reason: 'unknown argument: dry-run' });
  });

  it('an array with a non-string item is refused, and the first unknown argument in sorted order is named', () => {
    expect(toolArgumentsToParams(BARE, { set: ['a=b', 3] })).toEqual({ ok: false, reason: 'invalid argument: set must be an array of strings' });
    expect(toolArgumentsToParams(BARE, { zeta: 1, alpha: 2 })).toEqual({ ok: false, reason: 'unknown argument: alpha' });
  });
});

describe('task-364 — registerCoreModules answers a Tool name it does not know', () => {
  it('is an isError result in the empty channel\'s words, and an empty registry lists no Tool', async () => {
    const server = new McpServer({ name: 'tool-arguments-params-test', version: '0.0.0' });
    registerCoreModules(server, [], { resolveRoot: () => '/fixture-root', buildParams: () => ({}) });
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'tool-arguments-params-test-client', version: '0.0.0' });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    expect((await client.listTools()).tools).toEqual([]);
    const result = await client.callTool({ name: 'x.nope', arguments: {} });
    expect(result).toEqual({ content: [{ type: 'text', text: 'Tool x.nope not found' }], isError: true });
    await client.close();
  });
});
