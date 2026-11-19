/**
 * task-364 AC 3 (red-first, `dl-040` option 1, `bug-272`): each Tool's `inputSchema` is derived from the
 * operation's parameter metadata, and its `required` mirrors the CLI's (for `memory.approve`: the id and
 * `reason`). The schema's shape is `spec-004` §4.3's, as amended for this task (design D2, D3, D6):
 *
 * - one property per parameter, the CLI spelling: the positional, each option, each flag, in declaration
 *   order, then `dry-run` when the operation mutates; a positional or an option is a `string`, a repeatable
 *   option an `array` of `string`s, a flag a `boolean`; each carries the declaration's description;
 * - `required`: the required positional, then each required option, in declaration order; the key is absent
 *   when nothing is required; `additionalProperties: false`;
 * - `co-author` and `ai-model` are not Tool inputs.
 *
 * `deriveToolInputSchema` and the `ToolInputSchema` type are new exports of `src/core/registry.ts`, imported
 * from that module directly (design item 1). The last `describe` reads the Tools a real MCP `Client` lists
 * over `registerCoreModules(CORE_MODULES)`, the SDK's in-memory transport.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { CORE_MODULES, DRY_RUN_FLAG } from '../../src/core';
import {
  deriveToolInputSchema,
  deriveVerb,
  enumerateOperations,
  type CoreOperation,
  type ToolInputSchema,
} from '../../src/core/registry';
import { coreOk } from '../../src/core/types';
import { registerCoreModules } from '../../src/mcp/registrar';

/** The operation object `CORE_MODULES` registers as `<moduleName>.<operationName>`. */
function coreOperation(moduleName: string, operationName: string): CoreOperation {
  const found = enumerateOperations(CORE_MODULES).find(
    ({ module, operation }) => module.name === moduleName && operation.name === operationName,
  );
  if (!found) throw new Error(`fixture bug: ${moduleName}.${operationName} is not in CORE_MODULES`);
  return found.operation;
}

/** The description of the option `name` that `operation` declares. */
function optionDescription(operation: CoreOperation, name: string): string | undefined {
  const option = (operation.options ?? []).find((candidate) => candidate.name === name);
  if (!option) throw new Error(`fixture bug: ${operation.name} declares no option ${name}`);
  return option.description;
}

describe('task-364 AC 3 — deriveToolInputSchema derives a Tool input schema from the parameter metadata', () => {
  it('memory.approve: id and reason as strings, then dry-run as a boolean, id and reason required, no other property', () => {
    const approve = coreOperation('memory', 'memoryApprove');
    const schema: ToolInputSchema = deriveToolInputSchema(approve);
    expect(schema).toEqual({
      type: 'object',
      properties: {
        id: { type: 'string', description: approve.positional?.description },
        reason: { type: 'string', description: optionDescription(approve, 'reason') },
        'dry-run': { type: 'boolean', description: DRY_RUN_FLAG.description },
      },
      required: ['id', 'reason'],
      additionalProperties: false,
    });
    expect(Object.keys(schema.properties)).toEqual(['id', 'reason', 'dry-run']);
  });

  it('memory.add: the repeatable --set is an array of strings, and type and title are required', () => {
    const add = coreOperation('memory', 'memoryAdd');
    const schema = deriveToolInputSchema(add);
    expect(schema.properties.set).toEqual({
      type: 'array',
      items: { type: 'string' },
      description: optionDescription(add, 'set'),
    });
    expect(schema.required).toEqual(['type', 'title']);
    expect(schema.properties).not.toHaveProperty('co-author');
    expect(schema.properties).not.toHaveProperty('ai-model');
  });

  it('memory.search (read-only): no dry-run property and no required key', () => {
    const schema = deriveToolInputSchema(coreOperation('memory', 'memorySearch'));
    expect(schema.properties).not.toHaveProperty('dry-run');
    expect(schema).not.toHaveProperty('required');
    expect(schema.additionalProperties).toBe(false);
  });

  it('an operation that declares no parameter: an empty schema when read-only, only dry-run when it mutates', () => {
    const read: CoreOperation = { name: 'xRead', mutates: false, fn: async () => coreOk(null) };
    const write: CoreOperation = { name: 'xWrite', mutates: true, fn: async () => coreOk(null) };
    expect(deriveToolInputSchema(read)).toEqual({ type: 'object', properties: {}, additionalProperties: false });
    expect(deriveToolInputSchema(write)).toEqual({
      type: 'object',
      properties: { 'dry-run': { type: 'boolean', description: DRY_RUN_FLAG.description } },
      additionalProperties: false,
    });
  });
});

describe('task-364 AC 3 — the Tools registerCoreModules lists carry the derived schema', () => {
  it('each listed Tool\'s inputSchema equals deriveToolInputSchema of its operation, and its required list mirrors the CLI\'s', async () => {
    const server = new McpServer({ name: 'tool-input-schema-test', version: '0.0.0' });
    registerCoreModules(server, CORE_MODULES, { resolveRoot: () => '/fixture-root', buildParams: () => ({}) });
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'tool-input-schema-test-client', version: '0.0.0' });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const { tools } = await client.listTools();

    const mutating = enumerateOperations(CORE_MODULES).filter(({ operation }) => operation.mutates);
    expect(tools).toHaveLength(mutating.length);
    for (const { module, operation } of mutating) {
      const name = `${module.name}.${deriveVerb(module.name, operation.name)}`;
      const tool = tools.find((candidate) => candidate.name === name);
      expect({ name, inputSchema: tool?.inputSchema }).toEqual({ name, inputSchema: deriveToolInputSchema(operation) });
      const cliRequired = [
        ...(operation.positional?.required === true ? [operation.positional.name] : []),
        ...(operation.options ?? []).filter((option) => option.required === true).map((option) => option.name),
      ];
      expect({ name, required: tool?.inputSchema.required ?? [] }).toEqual({ name, required: cliRequired });
    }
    await client.close();
  });
});
