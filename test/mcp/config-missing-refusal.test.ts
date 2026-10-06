/**
 * task-179 (`bug-245`) — the MCP half: a Memory or DNA Resource read on a `.wingfoil/` that lacks the file
 * it needs, or holds an invalid one, rejects with a WingFoil error that names the file
 * repository-relative — never Node's raw `ENOENT` text and never the host's absolute path. Over the SDK's
 * in-memory transport with a real `Client` (`./helpers/channel-enumeration.ts`), against the same
 * `registerReadOnlyResources` the production `wingfoil mcp` server registers.
 */
import { realpathSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { McpError } from '@modelcontextprotocol/sdk/types.js';

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
