/**
 * task-195 — the `{role}-session` Prompt with `element` and `state` (`spec-016` §2.4, approver ruling
 * R18, `adr-012` point 3; `spec-004` §3.1–§3.4 as amended by this task). Run against the PRODUCTION
 * server (`createMcpServer`, the server `wingfoil mcp` starts) over the SDK's in-memory transport and a
 * real `Client`, so what is asserted is what an agent receives.
 *
 * - AC 1: `prompts/list` declares `element` and `state` as optional arguments of every Prompt.
 * - AC 2: with both, the one message's text is byte-equal to `assembleExecutionContext`'s payload for
 *   `(role, element, state)`; a later commit or an uncommitted edit does not change it.
 * - AC 4: the request refusals are `InvalidParams` (-32602) with the messages fixed in spec-004 §3.4.
 * - The diagnostics the builder reports ride as `warnings` beside `messages` (task-171 handover), and a
 *   repository refusal (a subject in a newer `format:`, `bug-263`) is a failed read, not `InvalidParams`.
 *
 * AC 3 (no arguments: unchanged) is `role-prompts.test.ts` and `mcp-prompts.feature.test.ts`; AC 5 (no
 * Tool, nothing written) is `read-only-agent-channel.test.ts`.
 */
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

import { assembleExecutionContext } from '../../src/core';
import { createMcpServer } from '../../src/mcp/server';
import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

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

function taskMd(id: string, body: string, extra: readonly string[] = []): string {
  return ['---', `id: ${id}`, 'type: task', 'release: "v0.1"', 'status: backlog', 'tags: [ context ]', ...extra, '---', '', body, ''].join('\n');
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
  commitAll(root, 'seed task-195 prompt-context fixture');
  return root;
}

function headSha(root: string): string {
  return git(root, ['rev-parse', 'HEAD']).trim();
}

async function connect(root: string): Promise<Client> {
  const server = createMcpServer({ resolveRoot: () => root, roles: ROLES });
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'wingfoil-test-client', version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

/** The payload the builder itself returns for `(role, ELEMENT, sha)` — the bytes AC 2 compares with. */
function builderPayload(root: string, role: string, sha: string): string {
  const result = assembleExecutionContext(root, { role, element: { type: 'task', id: ELEMENT_ID }, stateRef: sha });
  if (!result.ok) throw new Error(`fixture: expected a context, got ${result.error.code}: ${result.error.message}`);
  return result.value.payload;
}

/** The rejection of `promise` as an `McpError`, failing the test when it resolves. */
async function refusal(promise: Promise<unknown>): Promise<McpError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof McpError) return error;
    throw error;
  }
  throw new Error('expected the prompt request to be refused');
}

describe('prompts/list — `element` and `state` are optional arguments of every {role}-session Prompt (AC 1)', () => {
  let root: string;

  beforeAll(() => {
    root = seed();
  });
  afterAll(() => removeTempDir(root));

  it('declares exactly element then state, both not required, each with a description, on every Prompt', async () => {
    const client = await connect(root);
    const { prompts } = await client.listPrompts();
    expect(prompts.map((prompt) => prompt.name)).toEqual(['developer-session', 'reviewer-session']);
    for (const prompt of prompts) {
      expect(prompt.arguments?.map(({ name, required }) => ({ name, required }))).toEqual([
        { name: 'element', required: false },
        { name: 'state', required: false },
      ]);
      for (const argument of prompt.arguments ?? []) expect(argument.description).toEqual(expect.any(String));
    }
  });
});

describe('prompts/get with element and state — the spec-012 §7 payload at that commit (AC 2)', () => {
  let root: string;

  beforeEach(() => {
    root = seed();
  });
  afterEach(() => removeTempDir(root));

  it('returns one user message whose text is byte-equal to the builder payload for (role, element, state)', async () => {
    const sha = headSha(root);
    const expected = builderPayload(root, 'developer', sha);
    const client = await connect(root);

    const result = await client.getPrompt({ name: 'developer-session', arguments: { element: ELEMENT, state: sha } });

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]!.role).toBe('user');
    expect(result.messages[0]!.content).toEqual({ type: 'text', text: expected });
    expect(expected).toContain(`<!-- format: 1 | role: developer | element: ${ELEMENT} | state: ${sha} -->`);
  });

  it('the role decides the directives: reviewer-session carries the reviewer payload, not the developer one', async () => {
    const sha = headSha(root);
    const client = await connect(root);

    const result = await client.getPrompt({ name: 'reviewer-session', arguments: { element: ELEMENT, state: sha } });

    expect(result.messages[0]!.content).toEqual({ type: 'text', text: builderPayload(root, 'reviewer', sha) });
  });

  it('a later commit and an uncommitted edit of the element do not change the answer at the pinned state', async () => {
    const sha = headSha(root);
    const expected = builderPayload(root, 'developer', sha);
    const client = await connect(root);

    writeFixtureFile(root, `docs/04_memory/v0.1/${ELEMENT_ID}.md`, taskMd(ELEMENT_ID, 'Rewritten and committed.'));
    commitAll(root, 'a later commit');
    writeFixtureFile(root, `docs/04_memory/v0.1/${ELEMENT_ID}.md`, taskMd(ELEMENT_ID, 'Edited, not committed.'));

    const result = await client.getPrompt({ name: 'developer-session', arguments: { element: ELEMENT, state: sha } });

    expect(result.messages[0]!.content).toEqual({ type: 'text', text: expected });
    expect(expected).toContain('Body of the active task.');
  });

  it('a state given as a name is pinned to the commit it resolves to, which the payload header records', async () => {
    const sha = headSha(root);
    const client = await connect(root);

    const result = await client.getPrompt({ name: 'developer-session', arguments: { element: ELEMENT, state: 'HEAD' } });

    expect(result.messages[0]!.content).toEqual({ type: 'text', text: builderPayload(root, 'developer', sha) });
  });

  it('carries no warnings field when the context reports nothing', async () => {
    const client = await connect(root);

    const result = await client.getPrompt({ name: 'developer-session', arguments: { element: ELEMENT, state: headSha(root) } });

    expect(result).not.toHaveProperty('warnings');
  });

  it('forwards the builder diagnostics as `warnings` beside the message, never inside the payload (task-171 handover)', async () => {
    writeFixtureFile(root, 'docs/04_memory/v0.1/task-003-broken.md', '---\nid: task-003-broken\ntitle: [unclosed\n---\n\nBroken.\n');
    commitAll(root, 'an unreadable sibling');
    const sha = headSha(root);
    const built = assembleExecutionContext(root, { role: 'developer', element: { type: 'task', id: ELEMENT_ID }, stateRef: sha });
    if (!built.ok) throw new Error(built.error.message);
    const client = await connect(root);

    const result = await client.getPrompt({ name: 'developer-session', arguments: { element: ELEMENT, state: sha } });

    expect(result.messages[0]!.content).toEqual({ type: 'text', text: built.value.payload });
    expect(built.warnings).toEqual([expect.stringContaining('W_MEMORY_UNREADABLE (docs/04_memory/v0.1/task-003-broken.md)')]);
    expect(result.warnings).toEqual([...built.value.context.warnings, ...built.value.notes, ...built.warnings!]);
    expect(built.value.payload).not.toContain('task-003-broken');
  });

  it('orders warnings as context.warnings, then notes, then the unreadable files', async () => {
    // `dangling` is bound but has no file (a context warning); the element names a module none
    // matches (a note); one sibling is unreadable (a CoreResult warning).
    writeFixtureFile(root, '.wingfoil/roles.yaml', ROLES_YAML.replace('    - testing', '    - testing\n    - dangling'));
    writeFixtureFile(root, `docs/04_memory/v0.1/${ELEMENT_ID}.md`, taskMd(ELEMENT_ID, 'Body of the active task.', ['modules: [ nowhere ]']));
    writeFixtureFile(root, 'docs/04_memory/v0.1/task-003-broken.md', '---\nid: task-003-broken\ntitle: [unclosed\n---\n\nBroken.\n');
    commitAll(root, 'three kinds of diagnostics');
    const client = await connect(root);

    const result = await client.getPrompt({ name: 'developer-session', arguments: { element: ELEMENT, state: headSha(root) } });

    const warnings = result.warnings as string[];
    expect(warnings).toHaveLength(3);
    expect(warnings[0]).toBe("directive 'dangling' bound to role 'developer' has no directive file");
    expect(warnings[1]).toContain('no module matches');
    expect(warnings[2]).toContain('W_MEMORY_UNREADABLE (docs/04_memory/v0.1/task-003-broken.md)');
  });
});

describe('prompts/get — request refusals are InvalidParams with the spec-004 §3.4 messages (AC 4)', () => {
  let root: string;
  let client: Client;
  let sha: string;

  beforeAll(async () => {
    root = seed();
    sha = headSha(root);
    client = await connect(root);
  });
  afterAll(() => removeTempDir(root));

  it.each([
    ['element without state', { element: ELEMENT }, "prompt arguments 'element' and 'state' go together: 'state' is missing"],
    ['state without element', { state: 'HEAD' }, "prompt arguments 'element' and 'state' go together: 'element' is missing"],
  ])('%s → -32602', async (_label, args, message) => {
    const error = await refusal(client.getPrompt({ name: 'developer-session', arguments: args }));
    expect(error.code).toBe(ErrorCode.InvalidParams);
    expect(error.message).toBe(`MCP error -32602: ${message}`);
  });

  it('an argument other than element and state → -32602, naming it', async () => {
    const error = await refusal(client.getPrompt({ name: 'developer-session', arguments: { element: ELEMENT, State: sha } }));
    expect(error.code).toBe(ErrorCode.InvalidParams);
    expect(error.message).toBe(
      "MCP error -32602: unknown prompt argument 'State': 'developer-session' takes only 'element' and 'state'",
    );
  });

  it.each(['task', 'task:', ':task-001-active', 'task:a:b', 'task: task-001-active', 'task:task\u0007bell', ''])(
    'a malformed element-ref %j → -32602',
    async (element) => {
      const error = await refusal(client.getPrompt({ name: 'developer-session', arguments: { element, state: sha } }));
      expect(error.code).toBe(ErrorCode.InvalidParams);
      expect(error.message).toBe(`MCP error -32602: malformed element-ref ${JSON.stringify(element)}: expected <type>:<id>`);
    },
  );

  it('an element the commit does not hold → -32602 with the builder message', async () => {
    const error = await refusal(client.getPrompt({ name: 'developer-session', arguments: { element: 'task:task-404-absent', state: sha } }));
    expect(error.code).toBe(ErrorCode.InvalidParams);
    expect(error.message).toBe(`MCP error -32602: element 'task:task-404-absent' not found at ${sha}`);
    expect(error.data).toBeUndefined();
  });

  it('an element added after the state is unknown at that state', async () => {
    const local = seed();
    try {
      const before = headSha(local);
      writeFixtureFile(local, 'docs/04_memory/v0.1/task-009-later.md', taskMd('task-009-later', 'Added later.'));
      commitAll(local, 'added later');
      const localClient = await connect(local);
      const error = await refusal(localClient.getPrompt({ name: 'developer-session', arguments: { element: 'task:task-009-later', state: before } }));
      expect(error.code).toBe(ErrorCode.InvalidParams);
      expect(error.message).toBe(`MCP error -32602: element 'task:task-009-later' not found at ${before}`);
    } finally {
      removeTempDir(local);
    }
  });

  it.each([
    ['names no commit', '0000000000000000000000000000000000000000', 'revision "0000000000000000000000000000000000000000" does not name a commit'],
    ['is malformed', 'HEAD..main', 'malformed revision "HEAD..main": a revision is a non-empty name with no leading \'-\', no whitespace or control character, no \':\' and no \'..\''],
  ])('a state that %s → -32602 with the revision message', async (_label, state, message) => {
    const error = await refusal(client.getPrompt({ name: 'developer-session', arguments: { element: ELEMENT, state } }));
    expect(error.code).toBe(ErrorCode.InvalidParams);
    expect(error.message).toBe(`MCP error -32602: ${message}`);
  });

  it('a state naming a tree, not a commit → -32602', async () => {
    const tree = git(root, ['rev-parse', 'HEAD^{tree}']).trim();
    const error = await refusal(client.getPrompt({ name: 'developer-session', arguments: { element: ELEMENT, state: tree } }));
    expect(error.code).toBe(ErrorCode.InvalidParams);
    expect(error.message).toBe(`MCP error -32602: revision ${JSON.stringify(tree)} does not name a commit`);
  });

  it('the undefined-role refusal comes first, arguments or not (spec-004 §3.4)', async () => {
    const error = await refusal(client.getPrompt({ name: 'wizard-session', arguments: { element: 'nonsense' } }));
    expect(error.message).toBe("MCP error -32602: no prompt for undefined role 'wizard'");
  });
});

describe('prompts/get — an unknown element names the files left out (task-171 handover)', () => {
  let root: string;

  beforeAll(() => {
    root = seed();
  });
  afterAll(() => removeTempDir(root));

  it('a subject whose frontmatter does not parse → -32602 not found, the unreadable file in error.data.details', async () => {
    writeFixtureFile(root, `docs/04_memory/v0.1/${ELEMENT_ID}.md`, `---\nid: ${ELEMENT_ID}\ntype: task\ntitle: [unclosed\n---\n\nBody.\n`);
    commitAll(root, 'break the subject');
    const sha = headSha(root);
    const client = await connect(root);

    const error = await refusal(client.getPrompt({ name: 'developer-session', arguments: { element: ELEMENT, state: sha } }));

    expect(error.code).toBe(ErrorCode.InvalidParams);
    expect(error.message).toBe(`MCP error -32602: element '${ELEMENT}' not found at ${sha}`);
    expect(error.data).toEqual({
      details: [{ detail: expect.stringContaining(`W_MEMORY_UNREADABLE (docs/04_memory/v0.1/${ELEMENT_ID}.md)`) }],
    });
  });
});

describe('prompts/get — a repository refusal is a failed read, not InvalidParams', () => {
  let root: string;

  beforeEach(() => {
    root = seed();
  });
  afterEach(() => removeTempDir(root));

  it('a subject written in a newer format → E_INVALID_FORMAT, not "not found" (bug-263)', async () => {
    writeFixtureFile(root, `docs/04_memory/v0.1/${ELEMENT_ID}.md`, taskMd(ELEMENT_ID, 'From the future.', ['format: 2']));
    commitAll(root, 'a newer-format subject');
    const sha = headSha(root);
    const client = await connect(root);

    const error = await refusal(client.getPrompt({ name: 'developer-session', arguments: { element: ELEMENT, state: sha } }));

    expect(error.code).toBe(ErrorCode.InternalError);
    expect(error.message).toContain(`element '${ELEMENT}' at ${sha} is written in a newer format: E_INVALID_FORMAT`);
    expect(error.message).toContain('upgrade WingFoil');
  });

  it('an archived subject → the builder VALIDATION message as a failed read', async () => {
    writeFixtureFile(root, `docs/04_memory/v0.1/${ELEMENT_ID}.md`, taskMd(ELEMENT_ID, 'Retired.').replace('status: backlog', 'status: deprecated'));
    commitAll(root, 'deprecate the subject');
    const client = await connect(root);

    const error = await refusal(client.getPrompt({ name: 'developer-session', arguments: { element: ELEMENT, state: headSha(root) } }));

    expect(error.code).toBe(ErrorCode.InternalError);
    expect(error.message).toBe(
      `MCP error -32603: element '${ELEMENT}' is deprecated: an archived element never enters an execution context`,
    );
  });

  it('a state with no roles.yaml → the P5.4.4 refusal, its cause in error.data.details', async () => {
    git(root, ['rm', '-q', '.wingfoil/roles.yaml']);
    commitAll(root, 'drop roles.yaml');
    const sha = headSha(root);
    writeFixtureFile(root, '.wingfoil/roles.yaml', ROLES_YAML);
    const client = await connect(root);

    const error = await refusal(client.getPrompt({ name: 'developer-session', arguments: { element: ELEMENT, state: sha } }));

    expect(error.code).toBe(ErrorCode.InternalError);
    expect(error.message).toBe("MCP error -32603: invalid execution context: missing 'directives' section");
    expect(error.data).toEqual({ details: [{ detail: `no .wingfoil/roles.yaml at ${sha}` }] });
  });
});

describe('prompts/get — a git that cannot answer is not a missing revision', () => {
  it('a root that is not a repository fails the read (-32603) rather than refusing the state as -32602', async () => {
    const notARepo = mkdtempSync(join(tmpdir(), 'wf-task-195-'));
    try {
      const server = createMcpServer({ resolveRoot: () => notARepo, roles: ROLES });
      const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
      const client = new Client({ name: 'wingfoil-test-client', version: '0.0.0' });
      await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

      const error = await refusal(client.getPrompt({ name: 'developer-session', arguments: { element: ELEMENT, state: 'HEAD' } }));

      expect(error.code).toBe(ErrorCode.InternalError);
    } finally {
      removeTempDir(notARepo);
    }
  });
});
