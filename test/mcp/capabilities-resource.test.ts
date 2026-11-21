/**
 * task-362 AC 8 (red-first; `spec-019` §6, §9 T-15, T-16; `P5.2.1-mcp-resources.feature` scenarios "Read the
 * capabilities document as an MCP resource" and "Error - a write to the capabilities resource is refused") — the
 * production MCP server serves `wingfoil://capabilities`.
 *
 * - T-15: `createMcpServer` over the SDK's in-memory transport; a read returns one entry, `application/json`, no
 *   `warnings`, whose `text` is `JSON.stringify` of the operation's value (`capabilitiesFn`, the function the CLI
 *   command runs); the Resource `node dist/cli.js mcp` serves over stdio is the `--format json` stdout of the same
 *   dist build without its final `\n` (one build, one `commit`); the `resolveRoot` the in-process server was given is
 *   not called by the read.
 * - T-16: `resources/list` lists it as `capabilities.read` with §6's description; a read carrying a write intent is
 *   refused with `resources are read-only` (`spec-004` §2.3).
 * - `registerCapabilitiesResource` is exported by `src/mcp/capabilities-resource.ts` and re-exported by the `src/mcp`
 *   barrel (design item 9).
 *
 * Expected red: `capabilitiesFn` is not exported by `src/core` (TS2305; at runtime `undefined`), the server lists no
 * such Resource, and `src/mcp/capabilities-resource.ts` does not exist (TS2307; the `require` throws `Cannot find module`).
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { join } from 'node:path';
import { z } from 'zod';

import { capabilitiesFn } from '../../src/core';
import * as mcpBarrel from '../../src/mcp';
import { WRITE_INTENT_META_KEY } from '../../src/mcp/read-only';
import { createMcpServer } from '../../src/mcp/server';
import { withoutAgentMarkers } from '../agent-markers.cjs';
import { CLI_ENTRY, spawnCapture } from '../cli/helpers/spawn-cli';

const URI = 'wingfoil://capabilities';
const DESCRIPTION = 'the file formats this WingFoil reads, its commands and the capabilities it provides (read-only)';
const REPO_ROOT = join(__dirname, '..', '..');

async function connected(): Promise<{ client: Client; resolveRoot: jest.Mock<string, []> }> {
  const resolveRoot = jest.fn((): string => '/fixture-root');
  const server = createMcpServer({ resolveRoot, roles: ['developer'], name: 'wingfoil', version: '0.0.0-test' });
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'task-362-capabilities', version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, resolveRoot };
}

describe('task-362 AC 8 — T-15: Read the capabilities document as an MCP resource (spec-019 §6)', () => {
  it('one entry, application/json, no warnings; its text is JSON.stringify of capabilitiesFn\'s value; resolveRoot not called by the read', async () => {
    const { client, resolveRoot } = await connected();
    const callsBefore = resolveRoot.mock.calls.length;
    const result = await client.readResource({ uri: URI });
    expect(resolveRoot.mock.calls.length).toBe(callsBefore);
    expect(result.contents).toHaveLength(1);
    const entry = result.contents[0] as Record<string, unknown>;
    expect(entry.uri).toBe(URI);
    expect(entry.mimeType).toBe('application/json');
    expect('warnings' in entry).toBe(false);
    expect('warnings' in result).toBe(false);
    const operation = await capabilitiesFn({});
    expect(operation.ok).toBe(true);
    if (!operation.ok) return;
    expect(entry.text).toBe(JSON.stringify(operation.value));
  });

  // Both sides from the same dist build: an in-process server runs from src/, whose build stamp is `unknown` (dl-111),
  // while dist/ stamps the build's commit, so the comparison is made against `node dist/cli.js mcp` over stdio.
  it('its text is what `wingfoil capabilities --format json` prints from the same build, without the final newline', async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [CLI_ENTRY, 'mcp'],
      cwd: REPO_ROOT,
      env: withoutAgentMarkers(process.env) as Record<string, string>,
      stderr: 'pipe',
    });
    const client = new Client({ name: 'task-362-capabilities-dist', version: '0.0.0' });
    let text: string;
    try {
      await client.connect(transport);
      const result = await client.readResource({ uri: URI });
      text = (result.contents[0] as { text: string }).text;
    } finally {
      await client.close().catch(() => undefined);
    }
    const run = spawnCapture(process.execPath, [CLI_ENTRY, 'capabilities', '--format', 'json'], {
      cwd: REPO_ROOT,
      env: withoutAgentMarkers(process.env) as NodeJS.ProcessEnv,
      timeout: 60000,
    });
    expect({ status: run.status, stderr: run.stderr }).toEqual({ status: 0, stderr: '' });
    expect(`${text}\n`).toBe(run.stdout);
  }, 60000);
});

describe('task-362 AC 8 — T-16: listed, and read-only (spec-019 §6, spec-004 §2.3)', () => {
  it('resources/list lists wingfoil://capabilities as capabilities.read with §6\'s description', async () => {
    const { client } = await connected();
    const listed = (await client.listResources()).resources.filter((resource) => resource.uri === URI);
    expect(listed.map((resource) => ({ name: resource.name, description: resource.description }))).toEqual([
      { name: 'capabilities.read', description: DESCRIPTION },
    ]);
  });

  it('Error - a write to the capabilities resource is refused: resources are read-only', async () => {
    const { client } = await connected();
    let message = '(no error thrown — resources/read-with-write-intent unexpectedly succeeded)';
    try {
      await client.request(
        { method: 'resources/read', params: { uri: URI, _meta: { [WRITE_INTENT_META_KEY]: { text: 'overwrite attempt' } } } } as never,
        z.unknown(),
      );
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain('resources are read-only');
  });
});

describe('task-362 AC 8 — registerCapabilitiesResource is the module\'s export, re-exported by the src/mcp barrel', () => {
  it('src/mcp/capabilities-resource exports registerCapabilitiesResource, and the barrel exports the same function', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const leaf = require('../../src/mcp/capabilities-resource') as typeof import('../../src/mcp/capabilities-resource');
    expect(typeof leaf.registerCapabilitiesResource).toBe('function');
    expect((mcpBarrel as Record<string, unknown>).registerCapabilitiesResource).toBe(leaf.registerCapabilitiesResource);
  });
});
