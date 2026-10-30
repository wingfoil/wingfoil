/**
 * task-179 (`bug-245`) — the MCP half: a Memory or DNA Resource read on a `.wingfoil/` that lacks the file
 * it needs, or holds an invalid one, rejects with a WingFoil error that names the file
 * repository-relative — never Node's raw `ENOENT` text and never the host's absolute path. Over the SDK's
 * in-memory transport with a real `Client` (`./helpers/channel-enumeration.ts`), against the same
 * `registerReadOnlyResources` the production `wingfoil mcp` server registers.
 *
 * task-309 (`bug-251`) adds the second describe: a configuration file that exists but cannot be read (a
 * directory, a file the user may not read) rejects with the same repository-relative wording the CLI
 * prints (design gate, 2026-10-30, D4; D5 (a) for `wingfoil://workflows`), never Node's raw text. No pin
 * asserts the JSON-RPC code of the rejection (`dl-157` (A) changes it in v0.4).
 */
import { chmodSync, mkdirSync, realpathSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { McpError } from '@modelcontextprotocol/sdk/types.js';

import { initWingfoilProject } from '../../src/core';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

import { connectReadOnlyClient } from './helpers/channel-enumeration';

const DNA_YAML = 'version: 1\nproject:\n  name: x\nmodules: []\nstacks: {technologies: []}\nteam: {members: [], roles: []}\npaths: {}\n';
const MEMORY_YAML = 'version: 1\ntypes:\n  task:\n    path: "docs/{id}.md"\n';

async function readFailure(root: string, uri: string): Promise<McpError> {
  const { client } = await connectReadOnlyClient(root);
  const error: unknown = await client.readResource({ uri }).then(
    () => undefined,
    (rejection: unknown) => rejection,
  );
  expect(error).toBeInstanceOf(McpError);
  return error as McpError;
}

function expectNoHostPath(repo: string, text: string): void {
  expect(text).not.toContain(repo);
  expect(text).not.toContain(realpathSync(repo));
  expect(text).not.toContain('ENOENT');
}

describe('AC 7 (MCP) — a Resource read on an incomplete or invalid configuration names the file relative (bug-245)', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/dna.yaml', DNA_YAML);
    writeFixtureFile(repo, '.wingfoil/memory.yaml', MEMORY_YAML);
    commitAll(repo, 'configuration');
  });

  afterEach(() => removeTempDir(repo));

  it.each(['wingfoil://memory/task', 'wingfoil://memory/task/task-001'])('no memory.yaml: `%s`', async (uri) => {
    rmSync(join(repo, '.wingfoil', 'memory.yaml'));

    const error = await readFailure(repo, uri);

    expect(error.message).toContain('.wingfoil/memory.yaml is missing');
    expectNoHostPath(repo, JSON.stringify({ message: error.message, data: error.data }));
  });

  it('no dna.yaml: `wingfoil://dna`', async () => {
    rmSync(join(repo, '.wingfoil', 'dna.yaml'));

    const error = await readFailure(repo, 'wingfoil://dna');

    expect(error.message).toContain('.wingfoil/dna.yaml is missing');
    expectNoHostPath(repo, JSON.stringify({ message: error.message, data: error.data }));
  });

  it('an invalid dna.yaml: `wingfoil://dna` labels its issues `(.wingfoil/dna.yaml)`', async () => {
    writeFixtureFile(repo, '.wingfoil/dna.yaml', 'version: 1\nproject:\n  name: x\nmodules: 5\n');

    const error = await readFailure(repo, 'wingfoil://dna');

    expect(error.message).toContain('(.wingfoil/dna.yaml)');
    expectNoHostPath(repo, JSON.stringify({ message: error.message, data: error.data }));
  });
});

describe('bug-251 (MCP) — a Resource read on a configuration file that exists but cannot be read (task-309)', () => {
  const RAW_NODE_TEXT = ['EISDIR', 'EACCES', 'illegal operation on a directory', 'permission denied, open'];
  let repo: string;

  beforeEach(() => {
    // The shipped Scrum layout: dna.yaml, memory.yaml, the workflows.yaml manifest and its included files.
    repo = makeTempGitRepo();
    const scaffolded = initWingfoilProject(repo, 'Scrum');
    if (!scaffolded.ok) throw new Error(`fixture bug: wingfoil init failed — ${scaffolded.error.message}`);
  });

  afterEach(() => removeTempDir(repo));

  const asDirectory = (file: string): void => {
    rmSync(join(repo, '.wingfoil', file));
    mkdirSync(join(repo, '.wingfoil', file));
  };
  const expectNoRawText = (error: McpError): void => {
    const shown = JSON.stringify({ message: error.message, data: error.data });
    expectNoHostPath(repo, shown);
    for (const raw of RAW_NODE_TEXT) expect(shown).not.toContain(raw);
  };

  it.each([
    ['dna.yaml', 'wingfoil://dna'],
    ['memory.yaml', 'wingfoil://memory/task'],
    ['memory.yaml', 'wingfoil://memory/task/task-001'],
    ['workflows.yaml', 'wingfoil://workflows'],
  ])('%s a directory: `%s`', async (file, uri) => {
    asDirectory(file);

    const error = await readFailure(repo, uri);

    expect(error.message).toContain(`.wingfoil/${file} is a directory, not a file`);
    expectNoRawText(error);
  });

  // Mode bits do not bind root, so the pin only means something to an unprivileged user.
  const unprivileged = typeof process.getuid === 'function' && process.getuid() !== 0;
  (unprivileged ? it : it.skip)('memory.yaml with mode 000: `wingfoil://memory/task`', async () => {
    const path = join(repo, '.wingfoil', 'memory.yaml');
    chmodSync(path, 0o000);
    try {
      const error = await readFailure(repo, 'wingfoil://memory/task');

      expect(error.message).toContain('.wingfoil/memory.yaml cannot be read: permission denied');
      expectNoRawText(error);
    } finally {
      chmodSync(path, 0o644);
    }
  });
});
