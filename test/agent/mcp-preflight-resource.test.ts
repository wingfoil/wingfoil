/**
 * task-236 (developer's own test, beside red 2) — `agent execute`'s MCP pre-flight (`spec-016` §3.3 step 11)
 * also reads the session Resource the bootstrap names (`wingfoil://session/<role>/<type>:<id>/<sha>`, §2.4 as
 * amended by approver ruling (a)), since that is what the launched agent reads. A server that answers the
 * Prompt but not the Resource is unreachable, with P5.4.3 sc. 3's message and a cause naming the Resource.
 * The real server's success path is covered by the `agent execute` integration tests, whose pre-flight runs
 * against the compiled build.
 */
import { join } from 'node:path';

import { mcpPreflight } from '../../src/agent';
import { makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const SHA = '0123456789abcdef0123456789abcdef01234567';

/** A minimal stdio MCP server: `initialize`, a Prompt with text, and `resources/read` answering `contents`. */
function stubServer(contents: string): string {
  return [
    "const rl = require('readline').createInterface({ input: process.stdin });",
    "const send = (m) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...m }) + '\\n');",
    "rl.on('line', (line) => {",
    '  const m = JSON.parse(line);',
    "  if (m.method === 'initialize') send({ id: m.id, result: { protocolVersion: m.params.protocolVersion, capabilities: { prompts: {}, resources: {} }, serverInfo: { name: 'stub', version: '1' } } });",
    "  else if (m.method === 'prompts/get') send({ id: m.id, result: { messages: [{ role: 'user', content: { type: 'text', text: 'context' } }] } });",
    `  else if (m.method === 'resources/read') send({ id: m.id, result: { contents: ${contents} } });`,
    '});',
    '',
  ].join('\n');
}

async function preflightAgainst(contents: string): Promise<Awaited<ReturnType<typeof mcpPreflight>>> {
  const root = makeTempGitRepo();
  try {
    writeFixtureFile(root, 'stub-server.cjs', stubServer(contents));
    return await mcpPreflight({
      root,
      server: { command: process.execPath, args: [join(root, 'stub-server.cjs')] },
      role: 'developer',
      element: 'task:task-001-a',
      stateRef: SHA,
      timeoutMs: 20000,
    });
  } finally {
    removeTempDir(root);
  }
}

describe('mcpPreflight — the session Resource the bootstrap names must answer with text (task-236)', () => {
  it.each([
    ['no contents', '[]'],
    ['a blob, not text', `[{ uri: 'wingfoil://session/x', blob: 'Y29udGV4dA==' }]`],
    ['empty text', `[{ uri: 'wingfoil://session/x', mimeType: 'text/markdown', text: '' }]`],
  ])('a Resource read with %s: MCP_UNREACHABLE naming the Resource', async (_label, contents) => {
    const result = await preflightAgainst(contents);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toBe('context pre-load failed: MCP server unreachable');
    expect(result.error.details?.['cause']).toBe(`the session resource wingfoil://session/developer/task:task-001-a/${SHA} returned no context text`);
  }, 30000);

  it('a Resource read answering text: the pre-flight passes', async () => {
    const result = await preflightAgainst(`[{ uri: 'wingfoil://session/developer/task:task-001-a/${SHA}', mimeType: 'text/markdown', text: 'context' }]`);
    expect(result).toEqual({ ok: true, value: undefined });
  }, 30000);
});
