/**
 * task-236 — the execution context served ALSO as a read-only Resource (approver ruling (a),
 * 2026-10-13; decisions D-E…D-H, 2026-10-14): the by-hand pass found that Claude Code 2.1.296 gives the
 * model tools to read MCP Resources but none to get an MCP Prompt, so the bootstrap names the Resource
 * `wingfoil://session/{role}/{element}/{state}` (`spec-016` §2.4 and `spec-004` §2.1/§3.4 as amended by
 * this task). Run against the PRODUCTION server (`createMcpServer`, the server `wingfoil mcp` starts)
 * over the SDK's in-memory transport and a real `Client`, so what is asserted is what an agent receives.
 *
 * - S1 surface: the template is listed by `resources/templates/list`; no `wingfoil://session/` URI is
 *   listed by `resources/list` (its `state` is any commit); `tools/list` stays empty (REQ-SEC-05).
 * - S2 content: one entry, the requested URI, `text/markdown`, text byte-equal to the builder's payload
 *   AND to the `{role}-session` Prompt's message for the same triple; pinned at `state` (a later commit
 *   or an uncommitted edit changes nothing); a percent-encoded element reads the same; the diagnostics
 *   ride as `warnings`, equal to the Prompt's.
 * - S3 refusals: `InvalidParams` (-32602) with the spec-004 §3.4 messages; a role outside the start-time
 *   set → `no session context for undefined role '<R>'` (D-G); a write intent in `_meta` is refused
 *   before anything is read (REQ-SEC-05).
 *
 * Fixtures follow `role-prompt-context.test.ts` (task-195), whose Prompt is the reference.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { assembleExecutionContext } from '../../src/core';
import { WRITE_REFUSAL_MESSAGE } from '../../src/mcp';
import { WRITE_INTENT_META_KEY } from '../../src/mcp/read-only';
import { createMcpServer } from '../../src/mcp/server';
import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const TEMPLATE = 'wingfoil://session/{role}/{element}/{state}';

const MEMORY_YAML = `
version: 1.1
types:
  task:
    path: "docs/04_memory/{release}/{id}.md"
    id_pattern: "task-{n}-{slug}"
`;

const DNA_YAML = `
version: 1.1
project:
  name: Fixture
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
    - name: reviewer
paths:
  sources: [ src/ ]
`;

const ROLES_YAML = `
version: 1.0
assignments:
  developer:
    - testing
  reviewer:
    - code-review
global:
  - doc-versioning
`;

const ROLES = ['developer', 'reviewer'] as const;
const ELEMENT_ID = 'task-001-active';
const ELEMENT = `task:${ELEMENT_ID}`;

function directiveMd(id: string): string {
  return `---\nid: ${id}\nname: "${id}"\ntype: directive\nkind: custom\ntitle: "${id}"\n---\n\n# ${id}\n\nRule body of ${id}.\n`;
}

function taskMd(id: string, body: string): string {
  return ['---', `id: ${id}`, 'type: task', 'release: "v0.1"', 'status: backlog', 'tags: [ context ]', '---', '', body, ''].join('\n');
}

function seed(): string {
  const root = makeTempGitRepo();
  writeFixtureFile(root, '.wingfoil/memory.yaml', MEMORY_YAML);
  writeFixtureFile(root, '.wingfoil/dna.yaml', DNA_YAML);
  writeFixtureFile(root, '.wingfoil/roles.yaml', ROLES_YAML);
  for (const id of ['testing', 'code-review', 'doc-versioning']) {
    writeFixtureFile(root, `.wingfoil/directives/custom/${id}.md`, directiveMd(id));
  }
  writeFixtureFile(root, `docs/04_memory/v0.1/${ELEMENT_ID}.md`, taskMd(ELEMENT_ID, 'Body of the active task.'));
  writeFixtureFile(root, 'docs/04_memory/v0.1/task-002-sibling.md', taskMd('task-002-sibling', 'A sibling sharing the context tag.'));
  commitAll(root, 'seed task-236 session-resource fixture');
  return root;
}

function headSha(root: string): string {
  return git(root, ['rev-parse', 'HEAD']).trim();
}

function sessionUri(role: string, element: string, state: string): string {
  return `wingfoil://session/${role}/${element}/${state}`;
}

async function connect(root: string): Promise<Client> {
  const server = createMcpServer({ resolveRoot: () => root, roles: ROLES });
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'wingfoil-test-client', version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

function builderPayload(root: string, role: string, sha: string): string {
  const result = assembleExecutionContext(root, { role, element: { type: 'task', id: ELEMENT_ID }, stateRef: sha });
  if (!result.ok) throw new Error(`fixture: expected a context, got ${result.error.code}: ${result.error.message}`);
  return result.value.payload;
}

/** The Prompt's message text for the same triple: the reference the Resource must equal. */
async function promptText(client: Client, role: string, element: string, state: string): Promise<string> {
  const result = await client.getPrompt({ name: `${role}-session`, arguments: { element, state } });
  const content = result.messages[0]!.content;
  if (content.type !== 'text') throw new Error('fixture: the Prompt answered no text');
  return content.text;
}

/** The `text` of a `resources/read` contents entry, `undefined` for a blob or no entry. */
function textOf(entry: { uri: string; text?: string } | { uri: string; blob: string } | undefined): string | undefined {
  return entry !== undefined && 'text' in entry ? entry.text : undefined;
}

/** The rejection of `promise` as an `McpError`, failing the test when it resolves. */
async function refusal(promise: Promise<unknown>): Promise<McpError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof McpError) return error;
    throw error;
  }
  throw new Error('expected the resource read to be refused');
}

describe('S1 — the session Resource is a listed template, never a listed resource, and adds no Tool', () => {
  let root: string;
  beforeAll(() => {
    root = seed();
  });
  afterAll(() => removeTempDir(root));

  it('resources/templates/list declares wingfoil://session/{role}/{element}/{state}', async () => {
    const client = await connect(root);
    const { resourceTemplates } = await client.listResourceTemplates();
    expect(resourceTemplates.map((template) => template.uriTemplate)).toContain(TEMPLATE);
  });

  it('resources/list names no wingfoil://session/ URI', async () => {
    const client = await connect(root);
    const { resources } = await client.listResources();
    expect(resources.filter((resource) => resource.uri.startsWith('wingfoil://session/'))).toEqual([]);
  });

  it('tools/list stays empty (REQ-SEC-05)', async () => {
    const client = await connect(root);
    const { tools } = await client.listTools();
    expect(tools).toEqual([]);
  });
});

describe('S2 — resources/read answers the {role}-session context byte for byte, pinned at state', () => {
  let root: string;
  beforeEach(() => {
    root = seed();
  });
  afterEach(() => removeTempDir(root));

  it('one text/markdown entry for the requested URI, byte-equal to the builder payload and to the Prompt text', async () => {
    const sha = headSha(root);
    const uri = sessionUri('developer', ELEMENT, sha);
    const client = await connect(root);

    const result = await client.readResource({ uri });

    expect(result.contents).toHaveLength(1);
    expect(result.contents[0]).toEqual({ uri, mimeType: 'text/markdown', text: builderPayload(root, 'developer', sha) });
    expect(textOf(result.contents[0])).toBe(await promptText(client, 'developer', ELEMENT, sha));
  });

  it('the role decides the directives: the reviewer URI carries the reviewer payload', async () => {
    const sha = headSha(root);
    const client = await connect(root);

    const result = await client.readResource({ uri: sessionUri('reviewer', ELEMENT, sha) });

    expect(textOf(result.contents[0])).toBe(builderPayload(root, 'reviewer', sha));
  });

  it('a later commit and an uncommitted edit of the element do not change the answer at the pinned state', async () => {
    const sha = headSha(root);
    const expected = builderPayload(root, 'developer', sha);
    const client = await connect(root);

    writeFixtureFile(root, `docs/04_memory/v0.1/${ELEMENT_ID}.md`, taskMd(ELEMENT_ID, 'Rewritten and committed.'));
    commitAll(root, 'a later commit');
    writeFixtureFile(root, `docs/04_memory/v0.1/${ELEMENT_ID}.md`, taskMd(ELEMENT_ID, 'Edited, not committed.'));

    const result = await client.readResource({ uri: sessionUri('developer', ELEMENT, sha) });

    expect(textOf(result.contents[0])).toBe(expected);
    expect(expected).toContain('Body of the active task.');
  });

  it('a percent-encoded element (task%3A…) reads the same text', async () => {
    const sha = headSha(root);
    const client = await connect(root);

    const encoded = await client.readResource({ uri: sessionUri('developer', `task%3A${ELEMENT_ID}`, sha) });

    expect(encoded.contents).toHaveLength(1);
    expect(textOf(encoded.contents[0])).toBe(builderPayload(root, 'developer', sha));
  });

  it('carries no warnings field when the context reports nothing', async () => {
    const client = await connect(root);
    const result = await client.readResource({ uri: sessionUri('developer', ELEMENT, headSha(root)) });
    expect(result.contents).toHaveLength(1);
    expect(result).not.toHaveProperty('warnings');
  });

  it('the diagnostics ride as `warnings`, equal to the Prompt’s for the same triple (a bound directive with no file)', async () => {
    writeFixtureFile(root, '.wingfoil/roles.yaml', ROLES_YAML.replace('    - testing', '    - testing\n    - dangling'));
    commitAll(root, 'bind a directive with no file');
    const sha = headSha(root);
    const client = await connect(root);

    const prompt = await client.getPrompt({ name: 'developer-session', arguments: { element: ELEMENT, state: sha } });
    const result = await client.readResource({ uri: sessionUri('developer', ELEMENT, sha) });

    expect(prompt.warnings).toEqual(["directive 'dangling' bound to role 'developer' has no directive file"]);
    expect(result.warnings).toEqual(prompt.warnings);
  });
});

describe('S3 — refusals: InvalidParams with the spec-004 §3.4 messages; writes refused before any read', () => {
  let root: string;
  let client: Client;
  let sha: string;

  beforeAll(async () => {
    root = seed();
    sha = headSha(root);
    client = await connect(root);
  });
  afterAll(() => removeTempDir(root));

  it('a malformed element-ref → -32602', async () => {
    const error = await refusal(client.readResource({ uri: sessionUri('developer', 'notaref', sha) }));
    expect(error.code).toBe(ErrorCode.InvalidParams);
    expect(error.message).toBe('MCP error -32602: malformed element-ref "notaref": expected <type>:<id>');
  });

  it('a malformed revision → -32602', async () => {
    const error = await refusal(client.readResource({ uri: sessionUri('developer', ELEMENT, '..x') }));
    expect(error.code).toBe(ErrorCode.InvalidParams);
    expect(error.message).toBe(
      'MCP error -32602: malformed revision "..x": a revision is a non-empty name with no leading \'-\', no whitespace or control character, no \':\' and no \'..\'',
    );
  });

  it('a revision naming no commit → -32602', async () => {
    const none = '0000000000000000000000000000000000000000';
    const error = await refusal(client.readResource({ uri: sessionUri('developer', ELEMENT, none) }));
    expect(error.code).toBe(ErrorCode.InvalidParams);
    expect(error.message).toBe(`MCP error -32602: revision "${none}" does not name a commit`);
  });

  it('an element the commit does not hold → -32602 with the builder message', async () => {
    const error = await refusal(client.readResource({ uri: sessionUri('developer', 'task:task-404-absent', sha) }));
    expect(error.code).toBe(ErrorCode.InvalidParams);
    expect(error.message).toBe(`MCP error -32602: element 'task:task-404-absent' not found at ${sha}`);
  });

  it("a role outside the start-time set → -32602 no session context for undefined role 'ghost' (D-G)", async () => {
    const error = await refusal(client.readResource({ uri: sessionUri('ghost', 'nonsense', sha) }));
    expect(error.code).toBe(ErrorCode.InvalidParams);
    expect(error.message).toBe("MCP error -32602: no session context for undefined role 'ghost'");
  });

  it('a write intent in _meta is refused with the write-refusal message, before any read (REQ-SEC-05)', async () => {
    // The URI names an absent element: a handler that read first would answer "not found" instead.
    const uri = sessionUri('developer', 'task:task-404-absent', sha);
    let message = '(no error thrown — resources/read-with-write-intent unexpectedly succeeded)';
    try {
      await client.request(
        { method: 'resources/read', params: { uri, _meta: { [WRITE_INTENT_META_KEY]: { text: 'overwrite attempt' } } } } as never,
        z.unknown(),
      );
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain(WRITE_REFUSAL_MESSAGE);
    expect(message).not.toContain('not found');
  });
});
