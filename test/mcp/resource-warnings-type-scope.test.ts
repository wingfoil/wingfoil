/**
 * task-314 (`bug-283`): a typed Memory Resource read warns only about the unreadable files the type's
 * `path` pattern can produce (`spec-017` §1.4's token rule: a token in the file name is one name, a
 * token in a directory one or more directories), and about a newer-format document only when its
 * readable `type:` is the type read (design gate D2 (a)). A directory several types' patterns produce
 * is reported to each: here `task`'s `docs/04_memory/{release}/{id}.md` produces every path under
 * `docs/04_memory/`, the undecidable case `bug-283`'s Notes accept.
 *
 * The fixture copies this repository's own `.wingfoil/memory.yaml` patterns for `release-line`,
 * `release`, `task`, `adr` and `bug`. The warning text is the real one, as
 * `wingfoil memory search --type bug --format console` printed it over the same files (task-314 red notes).
 */
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { McpError } from '@modelcontextprotocol/sdk/types.js';

import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

import { connectReadOnlyClient } from './helpers/channel-enumeration';

const MEMORY_YAML = `
version: 1
types:
  release-line:
    path: "docs/04_memory/planning/{id}.md"
  release:
    path: "docs/04_memory/planning/rl-{release-line}/{id}.md"
  task:
    path: "docs/04_memory/{release}/{id}.md"
  adr:
    path: "docs/04_memory/design/adrs/{id}.md"
  bug:
    path: "docs/04_memory/bugs/{id}.md"
`;

const VALID_BUG = 'docs/04_memory/bugs/bug-001-valid.md';
const BROKEN_BUG = 'docs/04_memory/bugs/bug-002-broken.md';
const BROKEN_ADR = 'docs/04_memory/design/adrs/adr-001-broken.md';
const FUTURE_ADR = 'docs/04_memory/design/adrs/adr-002-future.md';
const BROKEN_RELEASE_LINE = 'docs/04_memory/planning/rl-v9-broken.md';

const unparsable = (file: string): string =>
  `W_MEMORY_UNREADABLE (${file}): unreadable frontmatter in ${file}: unexpected end of the stream within a flow collection (4:1)`;
const NEWER_FORMAT_ADR =
  `W_MEMORY_UNREADABLE (${FUTURE_ADR}): unreadable frontmatter in ${FUTURE_ADR}: E_INVALID_FORMAT: this file is written in format 99; this WingFoil reads up to format 1: upgrade WingFoil`;

function broken(id: string, type: string): string {
  return ['---', `id: ${id}`, `type: ${type}`, 'title: [unclosed', '---', '', 'Broken.', ''].join('\n');
}

function seed(): string {
  const root = makeTempGitRepo();
  writeFixtureFile(root, '.wingfoil/dna.yaml', 'version: 1.1\nproject:\n  name: "Fx"\nmodules:\n  - name: core\n    path: src/core\n');
  writeFixtureFile(root, '.wingfoil/memory.yaml', MEMORY_YAML);
  writeFixtureFile(root, VALID_BUG, ['---', 'id: bug-001-valid', 'type: bug', 'title: "bug-001-valid"', 'status: open', '---', '', 'Body of bug-001-valid.', ''].join('\n'));
  writeFixtureFile(root, BROKEN_BUG, broken('bug-002-broken', 'bug'));
  writeFixtureFile(root, BROKEN_ADR, broken('adr-001-broken', 'adr'));
  writeFixtureFile(root, FUTURE_ADR, ['---', 'id: adr-002-future', 'type: adr', 'title: "adr-002-future"', 'status: accepted', 'format: 99', '---', '', 'Future.', ''].join('\n'));
  writeFixtureFile(root, BROKEN_RELEASE_LINE, broken('rl-v9-broken', 'release-line'));
  commitAll(root, 'seed task-314 type-scoped warnings fixture');
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

function listedIds(result: { contents: unknown[] }): string[] {
  return (JSON.parse((result.contents[0] as { text: string }).text) as { id: string }[]).map((entry) => entry.id);
}

describe('wingfoil://memory/{type} warns only about files that type can hold (task-314 AC1, bug-283)', () => {
  let root: string;
  let client: Client;

  beforeAll(async () => {
    root = seed();
    ({ client } = await connectReadOnlyClient(root));
  });
  afterAll(() => removeTempDir(root));

  it('(red-first) memory/bug carries the warning of its own unparsable file only', async () => {
    const result = await client.readResource({ uri: 'wingfoil://memory/bug' });
    expect(listedIds(result)).toEqual(['bug-001-valid']);
    expect(result.warnings).toEqual([unparsable(BROKEN_BUG)]);
  });

  it('(red-first) memory/adr carries the unparsable and the newer-format adr, in path order, and no bug or planning file', async () => {
    const result = await client.readResource({ uri: 'wingfoil://memory/adr' });
    expect(result.warnings).toEqual([unparsable(BROKEN_ADR), NEWER_FORMAT_ADR]);
  });

  it('(red-first) memory/release carries no warnings field: planning/{id}.md is a release-line path, not a release one', async () => {
    const result = await client.readResource({ uri: 'wingfoil://memory/release' });
    expect(result).not.toHaveProperty('warnings');
  });

  it('(red-first) memory/release-line carries the warning of its own unparsable file only', async () => {
    const result = await client.readResource({ uri: 'wingfoil://memory/release-line' });
    expect(result.warnings).toEqual([unparsable(BROKEN_RELEASE_LINE)]);
  });

  it('(red-first) memory/task, whose pattern produces every path under docs/04_memory/, carries every unparsable file but not the newer-format adr', async () => {
    const result = await client.readResource({ uri: 'wingfoil://memory/task' });
    expect(result.warnings).toEqual([unparsable(BROKEN_BUG), unparsable(BROKEN_ADR), unparsable(BROKEN_RELEASE_LINE)]);
  });
});

describe('wingfoil://memory/{type}/{id} names only files that type can hold (task-314 AC1, design gate D1 (c))', () => {
  let root: string;
  let client: Client;

  beforeAll(async () => {
    root = seed();
    ({ client } = await connectReadOnlyClient(root));
  });
  afterAll(() => removeTempDir(root));

  it('(red-first) a bug lookup that finds nothing names only the unreadable bug file in error.data.details', async () => {
    const error = await refusal(client.readResource({ uri: 'wingfoil://memory/bug/bug-404' }));
    expect(error.message).toContain('resource not found: memory/bug/bug-404');
    const details = (error.data as { details: { detail: string }[] }).details;
    expect(details.map((entry) => entry.detail)).toEqual([unparsable(BROKEN_BUG)]);
  });

  it('(characterization) a bug lookup that resolves carries no warnings field (its file sorts before every unreadable one)', async () => {
    const result = await client.readResource({ uri: 'wingfoil://memory/bug/bug-001-valid' });
    expect((result.contents[0] as { text: string }).text).toContain('Body of bug-001-valid.');
    expect(result).not.toHaveProperty('warnings');
  });
});
