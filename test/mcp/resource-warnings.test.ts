/**
 * task-195 (`bug-231`): a Memory Resource read reports the documents its scan left out. The tolerant
 * scans (task-171, task-257) report an unreadable document, a symbolic link and a document written in a
 * newer `format:` as `W_MEMORY_UNREADABLE`; the CLI prints those lines, and over MCP they ride as a
 * top-level `warnings: string[]` beside `contents` (`spec-004` §2.2 as amended by this task) — present
 * only when there is one. A single-document read that finds nothing after skipping such files names them
 * in `error.data.details`, so "no such document" and "a document I cannot read" stay distinguishable.
 *
 * Same class, same field: the core-derived Resources of `registerCoreModules` (`src/mcp/registrar.ts`)
 * dropped `CoreResult.warnings`; they now carry them too.
 */
import { symlinkSync } from 'fs';
import { join } from 'path';

import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { McpError } from '@modelcontextprotocol/sdk/types.js';

import { coreOk, type CoreModule } from '../../src/core';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

import { connectCoreModuleSurface, connectReadOnlyClient } from './helpers/channel-enumeration';

const MEMORY_YAML = `
version: 1.1
types:
  task:
    path: "docs/04_memory/{release}/{id}.md"
  bug:
    path: "docs/04_memory/bugs/{id}.md"
`;

function bugDoc(id: string, extra: readonly string[] = []): string {
  return ['---', `id: ${id}`, 'type: bug', `title: "${id}"`, 'status: open', 'tags: [ b ]', ...extra, '---', '', `Body of ${id}.`, ''].join('\n');
}

const BROKEN = 'docs/04_memory/bugs/bug-002-broken.md';
const FUTURE = 'docs/04_memory/bugs/bug-003-future.md';
const LINK = 'docs/04_memory/bugs/bug-004-link.md';

function seed(options: { readonly withDiagnostics: boolean }): string {
  const root = makeTempGitRepo();
  writeFixtureFile(root, '.wingfoil/dna.yaml', 'version: 1.1\nproject:\n  name: "Fx"\nmodules:\n  - name: core\n    path: src/core\n');
  writeFixtureFile(root, '.wingfoil/memory.yaml', MEMORY_YAML);
  writeFixtureFile(root, 'docs/04_memory/bugs/bug-001-valid.md', bugDoc('bug-001-valid'));
  if (options.withDiagnostics) {
    writeFixtureFile(root, BROKEN, '---\nid: bug-002-broken\ntype: bug\ntitle: [unclosed\n---\n\nBroken.\n');
    writeFixtureFile(root, FUTURE, bugDoc('bug-003-future', ['format: 2']));
    symlinkSync('bug-001-valid.md', join(root, LINK));
  }
  commitAll(root, 'seed task-195 resource-warnings fixture');
  return root;
}

async function refusal(promise: Promise<unknown>): Promise<McpError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof McpError) return error;
    throw error;
  }
  throw new Error('expected the read to be refused');
}

describe('wingfoil://memory/{type} — the files the scan left out reach the client (bug-231)', () => {
  let root: string;
  let client: Client;

  beforeAll(async () => {
    root = seed({ withDiagnostics: true });
    ({ client } = await connectReadOnlyClient(root));
  });
  afterAll(() => removeTempDir(root));

  it('lists the readable document and carries one W_MEMORY_UNREADABLE line per file left out, in path order', async () => {
    const result = await client.readResource({ uri: 'wingfoil://memory/bug' });

    const listed = JSON.parse((result.contents[0] as { text: string }).text) as { id: string }[];
    expect(listed.map((entry) => entry.id)).toEqual(['bug-001-valid']);
    const warnings = result.warnings as string[];
    expect(warnings).toHaveLength(3);
    expect(warnings[0]).toMatch(new RegExp(`^W_MEMORY_UNREADABLE \\(${BROKEN}\\): unreadable frontmatter in ${BROKEN}: `));
    expect(warnings[1]).toMatch(new RegExp(`^W_MEMORY_UNREADABLE \\(${FUTURE}\\): .*E_INVALID_FORMAT`));
    expect(warnings[2]).toBe(`W_MEMORY_UNREADABLE (${LINK}): unreadable frontmatter in ${LINK}: a symbolic link is not read as a Memory document`);
  });

  it('a single document read carries the files its lookup passed on the way', async () => {
    const result = await client.readResource({ uri: 'wingfoil://memory/bug/bug-001-valid' });
    expect((result.contents[0] as { text: string }).text).toContain('Body of bug-001-valid.');
    // The lookup stops at its match, so it reports only what it read before it (path order).
    expect(result).not.toHaveProperty('warnings');
  });

  it('a single document read that finds nothing names the files it could not read in error.data.details', async () => {
    const error = await refusal(client.readResource({ uri: 'wingfoil://memory/bug/bug-002-broken' }));
    expect(error.message).toContain('resource not found: memory/bug/bug-002-broken');
    const details = (error.data as { details: { detail: string }[] }).details;
    expect(details.map((entry) => entry.detail)).toEqual([
      expect.stringContaining(`W_MEMORY_UNREADABLE (${BROKEN})`),
      expect.stringContaining(`W_MEMORY_UNREADABLE (${FUTURE})`),
      expect.stringContaining(`W_MEMORY_UNREADABLE (${LINK})`),
    ]);
  });
});

describe('Memory Resources with nothing left out keep the shape they always had', () => {
  let root: string;
  let client: Client;

  beforeAll(async () => {
    root = seed({ withDiagnostics: false });
    ({ client } = await connectReadOnlyClient(root));
  });
  afterAll(() => removeTempDir(root));

  it('collection: no warnings field', async () => {
    expect(await client.readResource({ uri: 'wingfoil://memory/bug' })).not.toHaveProperty('warnings');
  });

  it('single document not found: no error.data', async () => {
    const error = await refusal(client.readResource({ uri: 'wingfoil://memory/bug/bug-404' }));
    expect(error.data).toBeUndefined();
  });
});

describe('core-derived Resources carry CoreResult.warnings (registrar, same class as bug-231)', () => {
  function modules(warnings?: readonly string[]): CoreModule[] {
    return [{ name: 'x', operations: { xRead: { name: 'xRead', mutates: false, fn: async () => coreOk({ read: 'ok' }, undefined, warnings) } } }];
  }

  it('a read with warnings carries them beside contents, the text unchanged', async () => {
    const { client } = await connectCoreModuleSurface(modules(['W_ONE (a.md): one']), { resolveRoot: () => '/unused' });
    const result = await client.readResource({ uri: 'wingfoil://x/read' });
    expect((result.contents[0] as { text: string }).text).toBe('{"read":"ok"}');
    expect(result.warnings).toEqual(['W_ONE (a.md): one']);
  });

  it('a read without warnings has no warnings field', async () => {
    const { client } = await connectCoreModuleSurface(modules(), { resolveRoot: () => '/unused' });
    expect(await client.readResource({ uri: 'wingfoil://x/read' })).not.toHaveProperty('warnings');
  });
});
