/**
 * task-016-read-only-agent-channel — REQ-SEC-05, spec-004-mcp-surface-contract §1/§2.3/§4, BDD
 * `p5-interaction/P5.2.1-mcp-resources.feature` + `P5.2.3-mcp-tools.feature`.
 *
 * The channel-enumeration guarantee: across the agent-facing MCP surface, **Tools are the only channel
 * a state mutation is registered under** (`src/mcp/registrar.ts` — a `mutates: true` op can only be a
 * Tool, a `mutates: false` op only a Resource), the Resources channel refuses every write and persists
 * nothing (task-011), and the Prompts channel the production server advertises (task-058, P5.2.2)
 * registers no Tool and persists nothing across a `prompts/list` + `prompts/get` round trip. The
 * structural mechanisms already exist (task-006 registrar + task-011 resources + task-039/058 prompts);
 * this suite asserts the REQ-SEC-05 property
 * end-to-end over a real MCP `Client`. The AC case of a *mutating* Tool call rejected on an illegal
 * state-machine transition, identical to the CLI, is asserted here only through the registrar's
 * `isError` mechanism, with a synthetic op: no test calls a real `CORE_MODULES` mutating Tool into
 * an illegal-transition refusal (task-184 recorded it as unasserted, dl-121 T1). The production
 * server registers no Tool at all (see the last `describe`), and the registry's mutating operations
 * are asserted below as the Tool set the operation-derived surface would advertise.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { coreErr, coreOk, CORE_MODULES, type CoreModule, type CoreResult } from '../../src/core';
import { WRITE_REFUSAL_MESSAGE } from '../../src/mcp';
import { createMcpServer } from '../../src/mcp/server';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

import {
  assertFilesUnchanged,
  attemptEveryResourceWrite,
  connectCoreModuleSurface,
  connectReadOnlyClient,
  snapshotFiles,
} from './helpers/channel-enumeration';

/** A one-module registry with one mutating op (`x.write`) and one read-only op (`x read`). */
function syntheticModules(writeFn: () => Promise<CoreResult<unknown>>): CoreModule[] {
  return [
    {
      name: 'x',
      operations: {
        xWrite: { name: 'xWrite', mutates: true, fn: writeFn },
        xRead: { name: 'xRead', mutates: false, fn: async () => coreOk({ read: 'ok' }) },
      },
    },
  ];
}

const UNUSED_ROOT = { resolveRoot: () => '/unused' } as const;

describe('REQ-SEC-05 — Tools is the only channel a mutation is registered under (structural)', () => {
  it('a mutating op is registered ONLY as a Tool; a read-only op ONLY as a Resource', async () => {
    const { client } = await connectCoreModuleSurface(syntheticModules(async () => coreOk({ done: true })), UNUSED_ROOT);

    const tools = (await client.listTools()).tools.map((tool) => tool.name);
    const resources = (await client.listResources()).resources.map((resource) => resource.uri);

    expect(tools).toContain('x.write');
    expect(tools).not.toContain('x.read'); // a read-only op can NEVER surface as a Tool
    expect(resources).toContain('wingfoil://x/read');
    expect(resources).not.toContain('wingfoil://x/write'); // a mutating op can NEVER surface as a Resource
  });

  it('the only write path (a Tool) surfaces a CoreResult.error as isError — rejected unless it passes validation', async () => {
    const { client } = await connectCoreModuleSurface(
      syntheticModules(async () => coreErr({ code: 'INVALID_TRANSITION', message: 'illegal transition: draft to approved' })),
      UNUSED_ROOT,
    );

    const result = await client.callTool({ name: 'x.write', arguments: {} });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('illegal transition: draft to approved');
  });

  it('a successful Tool call returns the value with no isError flag', async () => {
    const { client } = await connectCoreModuleSurface(syntheticModules(async () => coreOk({ committed: true })), UNUSED_ROOT);

    const result = await client.callTool({ name: 'x.write', arguments: {} });
    expect(result.isError).toBeFalsy();
    expect(JSON.stringify(result.content)).toContain('committed');
  });
});

describe('REQ-SEC-05 — the operation-derived surface over the real CORE_MODULES registers its mutating ops as Tools', () => {
  it('the Tools write-channel is advertised, the registry\'s `mutates: true` ops are exactly the ones listed, and the advertised Tools are exactly the listed names', async () => {
    const { client } = await connectCoreModuleSurface(CORE_MODULES, UNUSED_ROOT);

    // The sole write channel (Tools) is structurally present/advertised...
    expect(client.getServerCapabilities()?.tools).toBeDefined();
    // ...and only the `mutates: true` ops are registered under Tools: a read-only op such as
    // `memory.memorySearch` (spec-006 §3) registers as a Resource and does not widen this list.
    const mutatingOps = CORE_MODULES.flatMap((module) => Object.values(module.operations)).filter((op) => op.mutates);
    expect(mutatingOps.map((op) => op.name).sort()).toEqual([
      'directiveAssign',
      'directiveCreate',
      'directiveRemove',
      // task-093-dna-mutation-surface-add-remove-update — `dl-081` option (E)'s three verbs, which are
      // mutations and therefore reach the agent surface as Tools only, never as Resources.
      'dnaAdd',
      'dnaRemove',
      'dnaSet',
      'dnaUpdate',
      'memoryAdd',
      // task-127 (`dl-108`) — the approver-gated amendment verb, a Tool like `memoryApprove`.
      'memoryAmend',
      'memoryApprove',
      'memoryDeprecate',
      // task-180 (`dl-110` P1 (a)) — `memory park`, a Tool like `memoryDeprecate`.
      'memoryPark',
      'memoryReject',
      'memorySubmit',
    ]);
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      'directive.assign',
      'directive.create',
      'directive.remove',
      'dna.add',
      'dna.remove',
      'dna.set',
      'dna.update',
      'memory.add',
      'memory.amend',
      'memory.approve',
      'memory.deprecate',
      'memory.park',
      'memory.reject',
      'memory.submit',
    ]);
  });

});

describe('REQ-SEC-05 — the shipped production surface: Prompts advertised, no Tools, nothing persisted (task-058)', () => {
  const PROMPT_FIXTURE_FILES = [
    '.wingfoil/dna.yaml',
    '.wingfoil/roles.yaml',
    '.wingfoil/directives/custom/testing.md',
    '.wingfoil/memory.yaml',
    'docs/04_memory/v0.1/task-001-foo.md',
  ];
  let root: string;

  beforeAll(() => {
    root = makeTempGitRepo();
    writeFixtureFile(
      root,
      '.wingfoil/dna.yaml',
      [
        'version: 1.1',
        'project:',
        '  name: "Fx"',
        'modules:',
        '  - name: core',
        '    path: src/core',
        'stacks:',
        '  technologies:',
        '    - name: TypeScript',
        '      category: language',
        'team:',
        '  members:',
        '    - name: Test User',
        '      roles: [ developer ]',
        '  roles:',
        '    - name: developer',
        'paths:',
        '  sources: [ src/ ]',
        '',
      ].join('\n'),
    );
    writeFixtureFile(root, '.wingfoil/roles.yaml', 'version: 1.0\nassignments:\n  developer:\n    - testing\nglobal: []\n');
    writeFixtureFile(
      root,
      '.wingfoil/directives/custom/testing.md',
      ['---', 'id: testing', 'name: "Testing"', 'type: directive', 'kind: custom', 'title: "Testing"', '---', '', 'Write the failing test first.', ''].join('\n'),
    );
    // task-195: a Memory element, so the round trip also covers a Prompt call with `element` and `state`.
    writeFixtureFile(root, '.wingfoil/memory.yaml', 'version: 1.1\ntypes:\n  task:\n    path: "docs/04_memory/{release}/{id}.md"\n');
    writeFixtureFile(
      root,
      'docs/04_memory/v0.1/task-001-foo.md',
      ['---', 'id: task-001-foo', 'type: task', 'title: "Foo"', 'status: in-progress', '---', '', 'Body.', ''].join('\n'),
    );
    commitAll(root, 'seed task-058 production-surface fixture');
  });

  afterAll(() => removeTempDir(root));

  it('advertises Prompts and an empty Tools channel, and a prompts/list + prompts/get round trip leaves every file byte-for-byte unchanged', async () => {
    const server = createMcpServer({ resolveRoot: () => root, roles: ['developer'] });
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'wingfoil-test-client', version: '0.0.0' });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const caps = client.getServerCapabilities();
    expect(caps?.prompts).toBeDefined();
    // task-174 (`bug-151`): the Tools channel is declared and answers with an empty list — still no
    // write path on the production surface (REQ-SEC-05), now without a -32601 for a routine probe.
    expect(caps?.tools).toEqual({});
    await expect(client.listTools()).resolves.toEqual({ tools: [] });

    const snapshot = snapshotFiles(root, PROMPT_FIXTURE_FILES);
    const { prompts } = await client.listPrompts();
    expect(prompts.map((prompt) => prompt.name)).toEqual(['developer-session']);
    const result = await client.getPrompt({ name: 'developer-session' });
    expect(JSON.stringify(result.messages)).toContain('## Directive: testing');
    // task-195 (AC 5): a call with `element` and `state` builds the context and still writes nothing.
    const withContext = await client.getPrompt({ name: 'developer-session', arguments: { element: 'task:task-001-foo', state: 'HEAD' } });
    expect(JSON.stringify(withContext.messages)).toContain('# WingFoil Agent Context');
    await expect(client.listTools()).resolves.toEqual({ tools: [] });
    assertFilesUnchanged(root, snapshot);
  });
});

describe('REQ-SEC-05 — the Resources channel refuses every write and persists nothing (shared with REQ-INT-01)', () => {
  let root: string;

  const TRACKED_FILES = ['.wingfoil/dna.yaml', '.wingfoil/memory.yaml', 'docs/04_memory/v0.1/task-001-foo.md'];

  beforeAll(() => {
    root = makeTempGitRepo();
    writeFixtureFile(root, '.wingfoil/dna.yaml', 'version: 1.1\nproject:\n  name: "Fx"\nmodules:\n  - name: core\n    path: src/core\n');
    writeFixtureFile(root, '.wingfoil/memory.yaml', 'version: 1.1\ntypes:\n  task:\n    path: "docs/04_memory/{release}/{id}.md"\n');
    writeFixtureFile(root, '.wingfoil/workflows.yaml', 'version: 1\ninclude: []\n');
    writeFixtureFile(
      root,
      'docs/04_memory/v0.1/task-001-foo.md',
      ['---', 'id: task-001-foo', 'type: task', 'title: "Foo"', 'status: in-progress', 'tags: [ t ]', '---', '', 'Body.', ''].join('\n'),
    );
    commitAll(root, 'seed task-016 REQ-SEC-05 write-refusal fixture');
  });

  afterAll(() => removeTempDir(root));

  it('both write-shaped requests are refused with the exact message, and every tracked file is byte-for-byte unchanged', async () => {
    const { client } = await connectReadOnlyClient(root);
    const before = snapshotFiles(root, TRACKED_FILES);

    const messages = await attemptEveryResourceWrite(client, 'wingfoil://memory/task/task-001-foo');

    expect(messages).toHaveLength(2);
    messages.forEach((message) => expect(message).toContain(WRITE_REFUSAL_MESSAGE));
    assertFilesUnchanged(root, before);
  });
});
