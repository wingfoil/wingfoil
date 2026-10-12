/**
 * task-239 — the two v0.3 workflow-state Resources on the production MCP server (`spec-017` §9, ruling R12;
 * `spec-004` §2.1): `wingfoil://workflows/-/next` and `wingfoil://workflows/-/status`.
 *
 * - AC 1: `resources/read` on each URI returns, as its `text`, the JSON `wingfoil workflow next|status --format
 *   json` prints at the same commit (byte for byte, without the CLI's final newline); a workflow named `next` or
 *   `status` stays `wingfoil://workflows/<name>`, and the `-` prefix never resolves through the `{name}` template.
 * - AC 2: the REQ-SEC-05 no-persistence guard (`./helpers/channel-enumeration.ts`, task-147's widened snapshot)
 *   covers both handlers: a read, a `resources/write` and a read carrying a write intent each leave the files,
 *   the status, `HEAD` and every ref unchanged; the two write shapes are refused with spec-004 §2.3's string.
 *
 * The server is `createMcpServer` — what `wingfoil mcp` serves — over the SDK's in-memory transport; the CLI side
 * is the compiled `dist/cli.js` that jest's `globalSetup` builds.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpError } from '@modelcontextprotocol/sdk/types.js';

import { WRITE_REFUSAL_MESSAGE } from '../../src/mcp';
import { createMcpServer } from '../../src/mcp/server';
import { runCliEntry } from '../cli/helpers/spawn-cli';
import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { assertFilesUnchanged, attemptEveryResourceWrite, snapshotFiles } from './helpers/channel-enumeration';

const NEXT_URI = 'wingfoil://workflows/-/next';
const STATUS_URI = 'wingfoil://workflows/-/status';

const MEMORY_YAML = `version: 1.0
types:
  release:
    path: "docs/releases/{id}.md"
    states:
      sequence: [ draft, planning, active ]
      gates:
        planning: { reject: draft }
  plan:
    path: "docs/plans/{id}.md"
    states:
      sequence: [ draft, active, done ]
      waiting: [ active ]
`;

const DNA_YAML = `version: 1.0
modules:
  - name: core
    path: src/core
stacks:
  technologies:
    - name: TypeScript
      category: language
team:
  members:
    - name: Morgan
      email: morgan@example.invalid
      roles: [ developer, approver ]
  roles:
    - name: developer
    - name: approver
paths:
  sources: [ src/ ]
`;

/** A main with a gate on its element: `approve` awaits while the release is `planning` (as task-225's CLI suite). */
const RELEASE_LINE = `name: release-line
startable: true
element: release
phases:
  - name: submit
    role: developer
    actions:
      - memory.submit
  - name: approve
    role: developer
    actions:
      - memory.approve
    approval: { by_role: approver }
`;

/** Workflows whose names are the third segments of the two Resources: they stay at `wingfoil://workflows/<name>`. */
function namedWorkflow(name: string): string {
  return `name: ${name}\nstartable: true\nelement: release\nphases:\n  - name: only\n    role: developer\n    actions:\n      - memory.submit\n`;
}

function element(type: string, id: string, status: string, extra = ''): string {
  return `---\nid: "${id}"\ntype: ${type}\ntitle: "${id}"\nstatus: ${status}\n${extra}---\n\n## Body\n`;
}

/** The files the no-persistence guard compares byte for byte. */
const TRACKED_FILES = [
  '.wingfoil/dna.yaml',
  '.wingfoil/memory.yaml',
  '.wingfoil/workflows.yaml',
  '.wingfoil/workflows/custom/release-line.yaml',
  'docs/releases/minor-1.md',
  'docs/plans/rl-minor-1.md',
];

/** The configuration, then two releases each with an open plan on it, one commit each (as task-225's CLI suite). */
function writeProject(root: string): void {
  writeFixtureFile(
    root,
    '.wingfoil/workflows.yaml',
    'version: 1.0\ninclude:\n  - workflows/custom/release-line.yaml\n  - workflows/custom/next.yaml\n  - workflows/custom/status.yaml\n',
  );
  writeFixtureFile(root, '.wingfoil/workflows/custom/release-line.yaml', RELEASE_LINE);
  writeFixtureFile(root, '.wingfoil/workflows/custom/next.yaml', namedWorkflow('next'));
  writeFixtureFile(root, '.wingfoil/workflows/custom/status.yaml', namedWorkflow('status'));
  writeFixtureFile(root, '.wingfoil/memory.yaml', MEMORY_YAML);
  writeFixtureFile(root, '.wingfoil/dna.yaml', DNA_YAML);
  writeFixtureFile(root, '.wingfoil/roles.yaml', 'version: 1.0\nassignments:\n  developer: [ testing ]\nglobal: []\n');
  writeFixtureFile(root, '.wingfoil/directives/custom/testing.md', '---\nid: testing\nname: "Testing"\ntype: directive\nkind: custom\ntitle: "Testing"\n---\n\n# Testing\n');
  commitAll(root, 'fixture');
  for (const [release, status] of [
    ['minor-1', 'planning'],
    ['minor-2', 'active'],
  ] as const) {
    writeFixtureFile(root, `docs/releases/${release}.md`, element('release', release, status));
    writeFixtureFile(root, `docs/plans/rl-${release}.md`, element('plan', `rl-${release}`, 'active', `workflow: "release-line"\nphase: "x"\nelement: "${release}"\n`));
    commitAll(root, `wf(plan): add rl-${release}`);
  }
}

async function connect(root: string): Promise<Client> {
  const server = createMcpServer({ resolveRoot: () => root, roles: ['developer', 'approver'] });
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'task-239', version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

/** The single text content of a Resource read. */
async function readText(client: Client, uri: string): Promise<{ uri: string; mimeType: string | undefined; text: string; extra: string[] }> {
  const result = await client.readResource({ uri });
  expect(result.contents).toHaveLength(1);
  const content = result.contents[0]!;
  if (!('text' in content)) throw new Error(`${uri}: no text content`);
  return { uri: content.uri, mimeType: content.mimeType, text: content.text, extra: Object.keys(result).filter((key) => key !== 'contents') };
}

describe('task-239 — wingfoil://workflows/-/next and -/status on the production server', () => {
  let repo: string;
  let client: Client;

  beforeAll(async () => {
    repo = makeTempGitRepo();
    writeProject(repo);
    client = await connect(repo);
  });

  afterAll(async () => {
    await client.close();
    removeTempDir(repo);
  });

  it('lists both URIs among the static Resources, beside the shipped wingfoil://workflows', async () => {
    const uris = (await client.listResources()).resources.map((resource) => resource.uri);
    expect(uris).toEqual(expect.arrayContaining(['wingfoil://workflows', NEXT_URI, STATUS_URI]));
    const templates = (await client.listResourceTemplates()).resourceTemplates.map((template) => template.uriTemplate);
    expect(templates).toContain('wingfoil://workflows/{name}');
  });

  it.each([
    [NEXT_URI, 'next'],
    [STATUS_URI, 'status'],
  ])('AC 1 — %s returns the JSON `workflow %s --format json` prints at the same commit', async (uri, verb) => {
    const run = runCliEntry(repo, ['workflow', verb, '--format', 'json']);
    expect([run.status, run.stderr]).toEqual([0, '']);

    const read = await readText(client, uri);
    expect(read).toEqual({ uri, mimeType: 'application/json', text: run.stdout.replace(/\n$/, ''), extra: [] });
    // Both answer from HEAD (spec-017 §1.1, ruling R15): the payload names the commit it read.
    expect((JSON.parse(read.text) as { baseline: unknown }).baseline).toEqual({ rev: 'HEAD', commit: git(repo, ['rev-parse', 'HEAD']).trim() });
  });

  it('AC 1 — the payloads are the fixture state: next is the active instance, status lists both and the pending approval', async () => {
    const next = JSON.parse((await readText(client, NEXT_URI)).text) as { instance: { id: string } };
    expect(next.instance.id).toBe('rl-minor-2');
    const status = JSON.parse((await readText(client, STATUS_URI)).text) as { active: string; open: unknown[]; pendingApprovals: unknown[] };
    expect([status.active, status.open.length, status.pendingApprovals.length]).toEqual(['rl-minor-2', 2, 1]);
  });

  it.each(['next', 'status'])('AC 1 — a workflow named `%s` stays wingfoil://workflows/%s (the {name} template)', async (name) => {
    const read = await readText(client, `wingfoil://workflows/${name}`);
    expect((JSON.parse(read.text) as { name: string }).name).toBe(name);
  });

  it.each(['wingfoil://workflows/-', 'wingfoil://workflows/-/ghost'])('AC 1 — %s resolves to no workflow and no state Resource', async (uri) => {
    const error = (await client.readResource({ uri }).catch((caught: unknown) => caught)) as Error;
    expect(error).toBeInstanceOf(McpError);
    expect(error.message).toMatch(/not found/);
  });

  it('AC 2 — a read of each, and both write shapes against each, persist nothing (REQ-SEC-05)', async () => {
    const before = snapshotFiles(repo, TRACKED_FILES);

    await readText(client, NEXT_URI);
    await readText(client, STATUS_URI);
    const messages = [...(await attemptEveryResourceWrite(client, NEXT_URI)), ...(await attemptEveryResourceWrite(client, STATUS_URI))];

    expect(messages).toHaveLength(4);
    messages.forEach((message) => expect(message).toContain(WRITE_REFUSAL_MESSAGE));
    assertFilesUnchanged(repo, before);
  });
});

describe('task-239 — a refusal reaches the client as the CLI prints it', () => {
  it('an invalid workflow file at HEAD: both reads fail with the error `--format json` prints, details included (spec-004 §4.3 item 4)', async () => {
    const repo = makeTempGitRepo();
    try {
      writeProject(repo);
      writeFixtureFile(repo, '.wingfoil/workflows/custom/next.yaml', 'name: next\nphases: not-a-list\n');
      commitAll(repo, 'break next.yaml');
      const client = await connect(repo);
      try {
        for (const [uri, verb] of [
          [NEXT_URI, 'next'],
          [STATUS_URI, 'status'],
        ] as const) {
          const run = runCliEntry(repo, ['workflow', verb, '--format', 'json']);
          expect([run.status, run.stdout]).toEqual([1, '']);
          const cli = JSON.parse(run.stderr) as { error: string; details?: unknown[] };
          const error = (await client.readResource({ uri }).catch((caught: unknown) => caught)) as McpError;
          expect(error).toBeInstanceOf(McpError);
          // The same reason, and the same details as JSON-RPC `error.data.details` (none → no `data`).
          expect(error.message).toContain(cli.error);
          expect(error.data).toEqual(cli.details === undefined ? undefined : { details: cli.details });
        }
      } finally {
        await client.close();
      }
    } finally {
      removeTempDir(repo);
    }
  });
});
