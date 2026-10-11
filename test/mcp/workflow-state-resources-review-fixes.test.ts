/**
 * task-239 — cases written after red, kept apart from red's files (`test/mcp/workflow-state-resources.test.ts`,
 * `test/cli/mcp-registration.test.ts`) so `tests.unchanged(since: red)` can tell them apart (independent review,
 * 2026-10-11, F1, F3, F6):
 *
 * - the registration and the shared result helper `coreResultResource` (written in green);
 * - F3: a refusal whose details are not empty reaches the client with the same `details` the CLI prints under
 *   `--format json` — two invalid workflow files, so the second one is a detail (the single-file case red pins
 *   has none on either side);
 * - F6: `check:mcp` refuses a `KNOWN_READ_FAILURES` entry for a URI the server does not list.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { McpError } from '@modelcontextprotocol/sdk/types.js';

import { evaluateRegistration, EXPECTED_CHANNELS } from '../../scripts/check-mcp-registration.cjs';
import type { McpConfig, McpServerObservation } from '../../scripts/check-mcp-registration.cjs';
import { coreErr, coreOk } from '../../src/core';
import { registerWorkflowStateResources, WORKFLOW_NEXT_URI, WORKFLOW_STATUS_URI } from '../../src/mcp';
import { coreResultResource } from '../../src/mcp/read-only';
import { createMcpServer } from '../../src/mcp/server';
import { runCliEntry } from '../cli/helpers/spawn-cli';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const NEXT_URI = 'wingfoil://workflows/-/next';
const STATUS_URI = 'wingfoil://workflows/-/status';

async function connect(server: McpServer): Promise<Client> {
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'task-239', version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

describe('task-239 — the registration and the shared result helper', () => {
  it('registerWorkflowStateResources registers exactly the two URIs, which the barrel exports', async () => {
    expect([WORKFLOW_NEXT_URI, WORKFLOW_STATUS_URI]).toEqual([NEXT_URI, STATUS_URI]);
    const server = new McpServer({ name: 'task-239', version: '0.0.0' });
    registerWorkflowStateResources(server, { resolveRoot: () => '/unused' });
    const client = await connect(server);
    try {
      expect((await client.listResources()).resources.map((resource) => resource.uri).sort()).toEqual([NEXT_URI, STATUS_URI]);
    } finally {
      await client.close();
    }
  });

  it('coreResultResource: a value is the JSON text, its warnings ride beside contents', () => {
    const uri = new URL(NEXT_URI);
    expect(coreResultResource(uri, coreOk({ a: 1 }))).toEqual({ contents: [{ uri: NEXT_URI, mimeType: 'application/json', text: '{"a":1}' }] });
    expect(coreResultResource(uri, { ok: true, value: [], warnings: ['W_X (f): w'] })).toEqual({
      contents: [{ uri: NEXT_URI, mimeType: 'application/json', text: '[]' }],
      warnings: ['W_X (f): w'],
    });
  });

  it('coreResultResource: a CoreResult.error is thrown with its message and details as `data.details`', () => {
    const refusal = coreErr({ code: 'NOT_FOUND', message: 'unknown workflow: ghost', details: { issues: [{ file: 'workflows.yaml', detail: 'not a list' }] } });
    let thrown: unknown;
    try {
      coreResultResource(new URL(STATUS_URI), refusal);
    } catch (error) {
      thrown = error;
    }
    expect((thrown as Error).message).toBe('unknown workflow: ghost');
    expect((thrown as { data?: unknown }).data).toEqual({ details: [{ file: 'workflows.yaml', detail: 'not a list' }] });
  });
});

describe('task-239 review F3 — a refusal with details reaches the client as the CLI prints it', () => {
  it('two invalid workflow files at HEAD: both reads carry the CLI reason and the same non-empty `data.details`', async () => {
    const repo = makeTempGitRepo();
    try {
      writeFixtureFile(repo, '.wingfoil/workflows.yaml', 'version: 1.0\ninclude:\n  - workflows/custom/a.yaml\n  - workflows/custom/b.yaml\n');
      writeFixtureFile(repo, '.wingfoil/workflows/custom/a.yaml', 'name: a\nphases: not-a-list\n');
      writeFixtureFile(repo, '.wingfoil/workflows/custom/b.yaml', 'name: b\nphases: not-a-list\n');
      commitAll(repo, 'two invalid workflow files');
      const client = await connect(createMcpServer({ resolveRoot: () => repo, roles: ['developer'] }));
      try {
        for (const [uri, verb] of [
          [NEXT_URI, 'next'],
          [STATUS_URI, 'status'],
        ] as const) {
          const run = runCliEntry(repo, ['workflow', verb, '--format', 'json']);
          expect([run.status, run.stdout]).toEqual([1, '']);
          const cli = JSON.parse(run.stderr) as { error: string; details?: { detail?: string }[] };
          // Not vacuous: the second file's error is a detail on the CLI side.
          expect(cli.details).toEqual([{ detail: expect.stringContaining('workflows/custom/b.yaml') }]);
          const error = (await client.readResource({ uri }).catch((caught: unknown) => caught)) as McpError;
          expect(error).toBeInstanceOf(McpError);
          expect(error.message).toContain(cli.error);
          expect(error.data).toEqual({ details: cli.details });
        }
      } finally {
        await client.close();
      }
    } finally {
      removeTempDir(repo);
    }
  });
});

describe('task-239 review F6 — check:mcp refuses a known failure for a URI the server does not list', () => {
  it('names the URI and asks for the entry’s removal', () => {
    const config: McpConfig = { mcpServers: { wingfoil: { command: 'node', args: ['node_modules/wingfoil-released/dist/cli.js', 'mcp'] } } };
    const observed: McpServerObservation = {
      version: '0.2.1',
      channels: ['prompts', 'resources'],
      lists: { prompts: 1, resources: 1 },
      resourceReads: { 'wingfoil://dna': true },
      promptGets: { 'developer-session': true },
    };
    const known = [{ version: '0.2.1', uri: 'wingfoil://workflows', reason: 'bug-292' }];
    const result = evaluateRegistration({ devDependencies: { 'wingfoil-released': 'npm:wingfoil@0.2.1' } }, config, observed, EXPECTED_CHANNELS, known);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('KNOWN_READ_FAILURES declares wingfoil://workflows on 0.2.1, but the server does not list it: remove the entry');
  });
});
