/**
 * task-011-mcp-resources-read-only — REQ-INT-01, spec-004-mcp-surface-contract §2, BDD
 * `docs/02_requirements/02_bdd/features/p5-interaction/P5.2.1-mcp-resources.feature`. Exercised
 * end-to-end over the MCP SDK's own in-memory transport + a real `Client` (mirroring
 * `test/mcp/registrar.test.ts` / `test/mcp/resource-latency.test.ts`), against
 * `registerReadOnlyResources` (`src/mcp/index.ts`) — the full Memory + DNA + Workflow Resources
 * channel plus the structural `resources/write` refusal.
 */
import { existsSync } from 'fs';
import { join } from 'path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';

import { WRITE_REFUSAL_MESSAGE } from '../../src/mcp';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

import {
  assertFilesUnchanged,
  attemptEveryResourceWrite,
  connectReadOnlyClient,
  snapshotFiles,
} from './helpers/channel-enumeration';

const DNA_YAML = `
version: 1.1
project:
  name: "Fixture Project"
modules:
  - name: core
    path: src/core
stacks:
  technologies:
    - name: TypeScript
      category: language
team:
  members:
    - name: Test User
      roles: [ developer ]
  roles:
    - name: developer
paths:
  sources: [ src/ ]
  docs: [ docs/ ]
`;

const MEMORY_YAML = `
version: 1.1
types:
  release-line:
    path: "docs/04_memory/planning/{id}.md"
  release:
    path: "docs/04_memory/planning/{release-line}/{id}.md"
  task:
    path: "docs/04_memory/{release}/{id}.md"
  adr:
    path: "docs/04_memory/design/adrs/{id}.md"
`;

const WORKFLOWS_YAML = `
version: 1
include:
  - workflows/custom/sw-life-cycle.yaml
  - workflows/custom/dev-loop.yaml
`;

const SW_LIFE_CYCLE_YAML = `
name: sw-life-cycle
kind: main
description: "the end-to-end lifecycle"
phases:
  - name: inception
`;

const DEV_LOOP_YAML = `
name: dev-loop
kind: sub
description: "TDD loop"
phases:
  - name: red
`;

function releaseLineDoc(): string {
  return ['---', 'id: rl-v1', 'type: release-line', 'title: "v1"', 'status: active', 'tags: [ rl ]', '---', '', 'Release-line body.', ''].join(
    '\n',
  );
}

function releaseDoc(): string {
  return [
    '---',
    'id: v0.1',
    'type: release',
    'title: "v0.1"',
    'status: in-development',
    'tags: [ release ]',
    '---',
    '',
    'Release body.',
    '',
  ].join('\n');
}

function taskDoc(id: string, title: string, status: string): string {
  return ['---', `id: ${id}`, 'type: task', `title: "${title}"`, `status: ${status}`, 'tags: [ t ]', '---', '', `Body for ${id}.`, ''].join(
    '\n',
  );
}

function adrDoc(id = 'adr-001-foo', title = 'Adr Foo', status = 'accepted'): string {
  return ['---', `id: ${id}`, 'type: adr', `title: "${title}"`, `status: ${status}`, 'tags: [ a1 ]', '---', '', 'Adr body.', ''].join(
    '\n',
  );
}

/** The four-pillar config every fixture repo in this suite shares. */
function writeFixtureConfig(root: string): void {
  writeFixtureFile(root, '.wingfoil/dna.yaml', DNA_YAML);
  writeFixtureFile(root, '.wingfoil/memory.yaml', MEMORY_YAML);
  writeFixtureFile(root, '.wingfoil/workflows.yaml', WORKFLOWS_YAML);
  writeFixtureFile(root, '.wingfoil/workflows/custom/sw-life-cycle.yaml', SW_LIFE_CYCLE_YAML);
  writeFixtureFile(root, '.wingfoil/workflows/custom/dev-loop.yaml', DEV_LOOP_YAML);
}

/** Seed a small, hand-built fixture repo exercising every Resource this task registers. */
function seedFixtureRepo(): string {
  const root = makeTempGitRepo();
  writeFixtureConfig(root);

  // release-line + release deliberately share the same static directory root
  // (docs/04_memory/planning) — proving type-filtering is frontmatter-driven, not directory-driven.
  writeFixtureFile(root, 'docs/04_memory/planning/rl-v1.md', releaseLineDoc());
  writeFixtureFile(root, 'docs/04_memory/planning/rl-v1/v0.1.md', releaseDoc());
  writeFixtureFile(root, 'docs/04_memory/v0.1/task-001-foo.md', taskDoc('task-001-foo', 'Foo', 'in-progress'));
  writeFixtureFile(root, 'docs/04_memory/v0.1/task-002-bar.md', taskDoc('task-002-bar', 'Bar', 'backlog'));
  writeFixtureFile(root, 'docs/04_memory/design/adrs/adr-001-foo.md', adrDoc());

  commitAll(root, 'seed task-011 read-only Resources fixture');
  return root;
}

describe('wingfoil://memory/{type}/{id} — single Memory document (spec-004 §2.2)', () => {
  let root: string;
  let client: Client;

  beforeAll(async () => {
    root = seedFixtureRepo();
    ({ client } = await connectReadOnlyClient(root));
  });

  afterAll(() => removeTempDir(root));

  it('returns full frontmatter + body content, mimeType text/markdown, and an id/type/status/title metadata block', async () => {
    const result = await client.readResource({ uri: 'wingfoil://memory/task/task-001-foo' });
    expect(result.contents).toHaveLength(1);
    const content = result.contents[0]!;
    expect(content.mimeType).toBe('text/markdown');
    expect('text' in content && content.text).toContain('id: task-001-foo');
    expect('text' in content && content.text).toContain('Body for task-001-foo.');
    expect((result as unknown as { metadata: Record<string, unknown> }).metadata).toEqual({
      id: 'task-001-foo',
      type: 'task',
      status: 'in-progress',
      title: 'Foo',
    });
  });

  it('an unknown id (known type) is refused with "resource not found", distinct from the write-refusal string', async () => {
    await expect(client.readResource({ uri: 'wingfoil://memory/task/no-such-id' })).rejects.toThrow(
      'resource not found: memory/task/no-such-id',
    );
  });

  it('an unknown type is refused with "resource not found" without ever scanning for the id', async () => {
    await expect(client.readResource({ uri: 'wingfoil://memory/bug/whatever' })).rejects.toThrow(
      'resource not found: memory/bug/whatever',
    );
  });

  it('a known id under the WRONG type is treated as not found — type is authoritative, not just id', async () => {
    await expect(client.readResource({ uri: 'wingfoil://memory/adr/task-001-foo' })).rejects.toThrow(/not found/);
  });

  it('a completely malformed/unregistered URI surfaces the SDK\'s own generic not-found, not a crash', async () => {
    await expect(client.readResource({ uri: 'wingfoil://bogus-scheme-nobody-registered' })).rejects.toThrow(
      /not found/i,
    );
  });
});

describe('wingfoil://memory/{type} — collection listing, frontmatter only (spec-004 §2.1)', () => {
  let root: string;
  let client: Client;

  beforeAll(async () => {
    root = seedFixtureRepo();
    ({ client } = await connectReadOnlyClient(root));
  });

  afterAll(() => removeTempDir(root));

  it('lists only the requested type\'s documents, frontmatter only, sorted by id — excluding same-directory sibling types', async () => {
    const result = await client.readResource({ uri: 'wingfoil://memory/task' });
    const content = result.contents[0]!;
    const parsed = 'text' in content ? JSON.parse(content.text) : undefined;
    expect(parsed).toEqual([
      { id: 'task-001-foo', title: 'Foo', status: 'in-progress', tags: ['t'] },
      { id: 'task-002-bar', title: 'Bar', status: 'backlog', tags: ['t'] },
    ]);
    // No body text anywhere in the listing (frontmatter only, per spec-004 §2.1).
    expect('text' in content ? content.text : '').not.toContain('Body for');
  });

  it('release-line and release share a directory root but never leak into each other\'s collection', async () => {
    const releaseLines = await client.readResource({ uri: 'wingfoil://memory/release-line' });
    const releases = await client.readResource({ uri: 'wingfoil://memory/release' });
    const rlContent = releaseLines.contents[0]!;
    const relContent = releases.contents[0]!;
    expect('text' in rlContent ? JSON.parse(rlContent.text) : undefined).toEqual([
      { id: 'rl-v1', title: 'v1', status: 'active', tags: ['rl'] },
    ]);
    expect('text' in relContent ? JSON.parse(relContent.text) : undefined).toEqual([
      { id: 'v0.1', title: 'v0.1', status: 'in-development', tags: ['release'] },
    ]);
  });

  it('a type with zero documents returns an empty array (not a not-found error)', async () => {
    const result = await client.readResource({ uri: 'wingfoil://memory/adr' });
    const content = result.contents[0]!;
    const parsed = 'text' in content ? JSON.parse(content.text) : undefined;
    expect(parsed).toEqual([{ id: 'adr-001-foo', title: 'Adr Foo', status: 'accepted', tags: ['a1'] }]);
  });

  it('an undeclared type is refused with "resource not found"', async () => {
    await expect(client.readResource({ uri: 'wingfoil://memory/no-such-type' })).rejects.toThrow(
      'resource not found: memory/no-such-type',
    );
  });

  it('is deterministic: two calls return byte-identical results (REQ-SYS-07)', async () => {
    const first = await client.readResource({ uri: 'wingfoil://memory/task' });
    const second = await client.readResource({ uri: 'wingfoil://memory/task' });
    expect(first.contents[0]).toEqual(second.contents[0]);
  });
});

/**
 * task-069-fix-archived-excluded-from-agent-context / `bug-010-deprecated-reaches-agent-context` —
 * REQ-STATE-06 ("Archived content excluded from context", as amended by
 * `dl-028-archived-states-excluded-from-context`), BDD `p1-memory/P1.9-memory-deprecate.feature` +
 * `p5-interaction/P5.2.1-mcp-resources.feature`. The collection Resource is an agent-facing read
 * path, so it must not hand an agent archived content; its sibling single-document Resource
 * deliberately still must (explicit retrieval by id — bug-010's Expected Behavior).
 *
 * A dedicated fixture repo, rather than extra documents in `seedFixtureRepo`, so the exact-equality
 * listing assertions above keep pinning task-011's own contract unchanged.
 */
function seedArchivedFixtureRepo(): string {
  const root = makeTempGitRepo();
  writeFixtureConfig(root);

  writeFixtureFile(root, 'docs/04_memory/v0.1/task-001-foo.md', taskDoc('task-001-foo', 'Foo', 'in-progress'));
  // `draft` is NOT archived (dl-028): excluded from an execution context, but still browsable —
  // the same asymmetry `task-038`/`task-035` pinned for default `memory search`.
  writeFixtureFile(root, 'docs/04_memory/v0.1/task-003-draft.md', taskDoc('task-003-draft', 'Draft', 'draft'));
  writeFixtureFile(root, 'docs/04_memory/v0.1/task-004-gone.md', taskDoc('task-004-gone', 'Gone', 'deprecated'));
  writeFixtureFile(root, 'docs/04_memory/design/adrs/adr-001-foo.md', adrDoc());
  // The half of the archived set a `deprecated`-only fix would miss: `superseded` is reached along
  // `adr`'s forward `sequence` by `approve`, never by `memory deprecate`.
  writeFixtureFile(root, 'docs/04_memory/design/adrs/adr-002-old.md', adrDoc('adr-002-old', 'Adr Old', 'superseded'));

  commitAll(root, 'seed task-069 archived-exclusion fixture');
  return root;
}

describe('wingfoil://memory/{type} — archived documents never reach an agent (REQ-STATE-06, dl-028)', () => {
  let root: string;
  let client: Client;

  beforeAll(async () => {
    root = seedArchivedFixtureRepo();
    ({ client } = await connectReadOnlyClient(root));
  });

  afterAll(() => removeTempDir(root));

  async function listIds(uri: string): Promise<string[]> {
    const result = await client.readResource({ uri });
    const content = result.contents[0]!;
    const parsed = 'text' in content ? (JSON.parse(content.text) as { id: string }[]) : [];
    return parsed.map((entry) => entry.id);
  }

  it('AC1/AC2 — a `deprecated` document is absent from the collection, its live siblings are not', async () => {
    const ids = await listIds('wingfoil://memory/task');
    expect(ids).not.toContain('task-004-gone');
    expect(ids).toContain('task-001-foo');
  });

  it('AC2 — a `superseded` ADR is absent too: the set is {deprecated, superseded}, not `deprecated` alone', async () => {
    const ids = await listIds('wingfoil://memory/adr');
    expect(ids).toEqual(['adr-001-foo']);
    expect(ids).not.toContain('adr-002-old');
  });

  it('AC3 — `draft` is NOT archived: a draft document is still listed (the browse/context asymmetry)', async () => {
    expect(await listIds('wingfoil://memory/task')).toEqual(['task-001-foo', 'task-003-draft']);
  });

  it('AC4 — a `deprecated` document stays resolvable by explicit id through the single-document Resource', async () => {
    const result = await client.readResource({ uri: 'wingfoil://memory/task/task-004-gone' });
    expect(result.metadata).toEqual({
      id: 'task-004-gone',
      type: 'task',
      status: 'deprecated',
      title: 'Gone',
    });
  });

  it('AC4 — a `superseded` ADR stays resolvable by explicit id as well', async () => {
    const result = await client.readResource({ uri: 'wingfoil://memory/adr/adr-002-old' });
    expect((result.metadata as { status?: string }).status).toBe('superseded');
    expect('text' in result.contents[0]! ? result.contents[0]!.text : '').toContain('Adr body.');
  });

  it('the archived documents remain present on disk — excluded from the channel, never deleted', () => {
    expect(existsSync(join(root, 'docs/04_memory/v0.1/task-004-gone.md'))).toBe(true);
    expect(existsSync(join(root, 'docs/04_memory/design/adrs/adr-002-old.md'))).toBe(true);
  });
});

describe('wingfoil://dna and wingfoil://dna/{section} (spec-004 §2.1)', () => {
  let root: string;
  let client: Client;

  beforeAll(async () => {
    root = seedFixtureRepo();
    ({ client } = await connectReadOnlyClient(root));
  });

  afterAll(() => removeTempDir(root));

  it('wingfoil://dna returns the whole parsed document', async () => {
    const result = await client.readResource({ uri: 'wingfoil://dna' });
    const content = result.contents[0]!;
    const parsed = 'text' in content ? JSON.parse(content.text) : undefined;
    expect(parsed.team.roles).toEqual([{ name: 'developer' }]);
    expect(parsed.paths.sources).toEqual(['src/']);
  });

  it('wingfoil://dna/{section} returns just that top-level section', async () => {
    const result = await client.readResource({ uri: 'wingfoil://dna/team' });
    const content = result.contents[0]!;
    const parsed = 'text' in content ? JSON.parse(content.text) : undefined;
    expect(parsed.members).toEqual([{ name: 'Test User', roles: ['developer'] }]);
  });

  it('an unknown section is refused with "resource not found"', async () => {
    await expect(client.readResource({ uri: 'wingfoil://dna/no-such-section' })).rejects.toThrow(
      'resource not found: dna/no-such-section',
    );
  });
});

describe('wingfoil://workflows and wingfoil://workflows/{name} (spec-004 §2.1)', () => {
  let root: string;
  let client: Client;

  beforeAll(async () => {
    root = seedFixtureRepo();
    ({ client } = await connectReadOnlyClient(root));
  });

  afterAll(() => removeTempDir(root));

  it('wingfoil://workflows lists every loaded workflow, summary only, sorted by name', async () => {
    const result = await client.readResource({ uri: 'wingfoil://workflows' });
    const content = result.contents[0]!;
    const parsed = 'text' in content ? JSON.parse(content.text) : undefined;
    expect(parsed).toEqual([
      { name: 'dev-loop', kind: 'sub', description: 'TDD loop' },
      { name: 'sw-life-cycle', kind: 'main', description: 'the end-to-end lifecycle' },
    ]);
  });

  it('wingfoil://workflows/{name} returns that workflow\'s full definition', async () => {
    const result = await client.readResource({ uri: 'wingfoil://workflows/sw-life-cycle' });
    const content = result.contents[0]!;
    const parsed = 'text' in content ? JSON.parse(content.text) : undefined;
    expect(parsed.kind).toBe('main');
    expect(parsed.phases).toEqual([{ name: 'inception', optional: false, cadence: 'once' }]); // cadence default: task-185
  });

  it('an unknown workflow name is refused with "resource not found"', async () => {
    await expect(client.readResource({ uri: 'wingfoil://workflows/no-such-workflow' })).rejects.toThrow(
      'resource not found: workflows/no-such-workflow',
    );
  });
});

describe('Resources are read-only (spec-004 §2.3, REQ-INT-01/REQ-SEC-05) — the exact refusal string', () => {
  let root: string;
  let client: Client;

  beforeAll(async () => {
    root = seedFixtureRepo();
    ({ client } = await connectReadOnlyClient(root));
  });

  afterAll(() => removeTempDir(root));

  it('the refusal constant is the exact spec-004 §2.3 string', () => {
    expect(WRITE_REFUSAL_MESSAGE).toBe('resources are read-only');
  });

  it('an unsupported resources/write call is refused with the exact message', async () => {
    const [writeMessage] = await attemptEveryResourceWrite(client, 'wingfoil://memory/task/task-001-foo');
    expect(writeMessage).toContain(WRITE_REFUSAL_MESSAGE);
  });

  it('a resources/read request carrying a write intent is refused with the exact message, not treated as an ordinary read', async () => {
    const [, readWithIntentMessage] = await attemptEveryResourceWrite(client, 'wingfoil://memory/task/task-001-foo');
    expect(readWithIntentMessage).toContain(WRITE_REFUSAL_MESSAGE);
  });

  it('the refusal is distinct from a not-found error — neither wording collides with the other', async () => {
    const notFound = await client.readResource({ uri: 'wingfoil://memory/task/no-such-id' }).catch((error) => error);
    expect(String(notFound.message)).not.toContain(WRITE_REFUSAL_MESSAGE);
    const [writeMessage] = await attemptEveryResourceWrite(client, 'wingfoil://memory/task/task-001-foo');
    expect(writeMessage).not.toContain('resource not found');
  });
});

describe('Channel enumeration (REQ-INT-01 / REQ-SEC-05, shared fixture for task-016-read-only-agent-channel)', () => {
  let root: string;
  let client: Client;

  const TRACKED_FILES = [
    '.wingfoil/dna.yaml',
    '.wingfoil/memory.yaml',
    '.wingfoil/workflows.yaml',
    '.wingfoil/workflows/custom/sw-life-cycle.yaml',
    'docs/04_memory/v0.1/task-001-foo.md',
  ];

  beforeAll(async () => {
    root = seedFixtureRepo();
    ({ client } = await connectReadOnlyClient(root));
  });

  afterAll(() => removeTempDir(root));

  it('every refused write attempt leaves every underlying Memory/DNA/Workflow file byte-for-byte unchanged', async () => {
    const before = snapshotFiles(root, TRACKED_FILES);

    const messages = await attemptEveryResourceWrite(client, 'wingfoil://memory/task/task-001-foo');
    expect(messages).toHaveLength(2);
    messages.forEach((message) => expect(message).toContain(WRITE_REFUSAL_MESSAGE));

    assertFilesUnchanged(root, before);
  });
});
