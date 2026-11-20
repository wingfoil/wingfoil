/**
 * task-367 AC 4 — `docs/02_requirements/02_bdd/features/p5-interaction/P5.2.3-mcp-tools.feature` (US-2-11, P5.2.3,
 * REQ-INT-03) against a REAL production server (`createMcpServer`, the server `wingfoil mcp` starts) over the SDK's
 * in-memory transport with a real `Client`.
 *
 * Background "a running WingFoil MCP server" is `createMcpServer` on a fixture repository whose `memory.yaml` `task`
 * machine is this repository's (`.wingfoil/memory.yaml`: `sequence: [draft, pending, backlog, in-progress, in-review,
 * approved, done]`, gates on `pending` and `in-review`, `waiting: [backlog, approved]`, `returns: {in-progress:
 * backlog}`, amendable), and whose committed `dna.yaml` makes the fixture's git identity a member holding `approver`
 * and declares the agents `Claude` and `Other` (the shape of `test/core/helpers/l0-fixture.ts`). "task-101" is
 * written at the state each scenario names. The server's environment is `{ WINGFOIL_AGENT: 'Claude' }`.
 *
 * - "Submit a deliverable through an MCP tool": `draft → pending`, one commit carrying `Co-Authored-By:` and
 *   `AI-Model:`.
 * - "MCP tool state changes are validated against the type machine": `approved` has no `submit` edge; the text is the
 *   reason, `structuredContent` the CLI's `--format json` error object for the same call (`spec-004` §4.3 items 3–4).
 * - "Error - an approver-gated Tool refuses in an agent context" (the Outline, three rows): `task-101` at `pending`,
 *   each call refused with a text starting the scenario's `E_AGENT_CONTEXT` prefix; `memory.amend` with no edit still
 *   reaches the refusal (design AC 4).
 * - "Error - invoking a tool with a missing required argument": verbatim; the argument check comes first (D2).
 *
 * Red until green: the production server serves no Tool, so every call is `Tool <name> not found`, and
 * `createMcpServer` takes no `env` (TS2353). Deterministic: fixed fixture, fixed identity.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { MEMBER } from '../core/helpers/l0-fixture';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { assertPersistenceUnchanged, snapshotPersistence } from '../storage/helpers/persistence-snapshot';
import { commitsSince, connectProductionTools, finalParagraph, gitState, messageOf, runCli } from './helpers/production-tools';

const TIMEOUT_MS = 60_000;
const SERVER_ENV = { WINGFOIL_AGENT: 'Claude' } as const;
const TASK_FILE = 'docs/tasks/task-101.md';

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
    - name: ${MEMBER.name}
      email: ${MEMBER.email}
      roles: [ developer, approver ]
  roles:
    - name: developer
    - name: approver
  agents:
    - name: Claude
      email: noreply@anthropic.com
      executes_as: [ developer ]
      adapter: claude-code
    - name: Other
      email: 0+other@users.noreply.github.com
      executes_as: [ developer ]
paths:
  sources: [ src/ ]
`;

/** This repository's `task` machine (`.wingfoil/memory.yaml`), at a fixture path. */
const MEMORY_YAML = `version: 1.0
types:
  task:
    path: "docs/tasks/{id}.md"
    amendable: true
    states:
      sequence: [ draft, pending, backlog, in-progress, in-review, approved, done ]
      gates:
        pending:   { reject: draft }
        in-review: { reject: in-progress }
      waiting: [ backlog, approved ]
      returns: { in-progress: backlog }
`;

function task101(status: string): string {
  return `---\nid: "task-101"\ntype: task\ntitle: "task-101"\nstatus: ${status}\n---\n\n## Body\n\nThe deliverable.\n`;
}

/** The status `task-101` holds in the working tree. */
function statusOf(root: string): string | undefined {
  return /^status: (\S+)$/m.exec(readFileSync(join(root, TASK_FILE), 'utf-8'))?.[1];
}

describe('Feature: P5.2.3 (US-2-11) - MCP Tools (state management)', () => {
  const roots: string[] = [];
  afterEach(() => roots.splice(0).forEach(removeTempDir));

  /** Background: a running WingFoil MCP server, and "task-101" at `status`. */
  function project(status: string): string {
    const root = makeTempGitRepo();
    roots.push(root);
    writeFixtureFile(root, '.wingfoil/dna.yaml', DNA_YAML);
    writeFixtureFile(root, '.wingfoil/memory.yaml', MEMORY_YAML);
    writeFixtureFile(root, TASK_FILE, task101(status));
    commitAll(root, 'fixture: P5.2.3 background');
    return root;
  }

  it('Scenario: Submit a deliverable through an MCP tool', async () => {
    const root = project('draft');
    const before = gitState(root).head;
    const client = await connectProductionTools(root, SERVER_ENV);

    const result = await client.callTool({ name: 'memory.submit', arguments: { id: 'task-101' } });
    await client.close();

    expect({ isError: result.isError ?? false, content: result.isError === true ? result.content : undefined }).toEqual({ isError: false, content: undefined });
    expect(statusOf(root)).toBe('pending');
    expect(commitsSince(root, before)).toBe(1);
    const message = messageOf(root);
    expect(message.split('\n')[0]).toBe('wf(task): submit task-101');
    const trailer = finalParagraph(message);
    expect(trailer.filter((line) => /^(Co-Authored-By|AI-Model): /.test(line))).toEqual([
      'Co-Authored-By: Claude <noreply@anthropic.com>',
      'AI-Model: not-reported',
    ]);
  });

  it('Scenario: MCP tool state changes are validated against the type machine', async () => {
    const root = project('approved');
    const twin = project('approved');
    const before = gitState(root);
    const unchanged = snapshotPersistence(root);
    const client = await connectProductionTools(root, SERVER_ENV);

    const result = await client.callTool({ name: 'memory.submit', arguments: { id: 'task-101' } });
    await client.close();

    const reason = "illegal transition approved -> (none) for type 'task'";
    expect(result.isError).toBe(true);
    expect(result.content).toEqual([{ type: 'text', text: reason }]);
    const cli = runCli(twin, ['memory', 'submit', 'task-101', '--format', 'json']);
    expect(cli.status).toBe(1);
    const cliError = JSON.parse(cli.stderr) as Record<string, unknown>;
    expect(cliError.error).toBe(reason);
    expect(result.structuredContent).toEqual(cliError);
    expect(statusOf(root)).toBe('approved');
    expect(gitState(root)).toEqual(before);
    assertPersistenceUnchanged(root, unchanged, 'illegal submit');
  }, TIMEOUT_MS);

  it.each([
    ['memory.approve', 'approve'],
    ['memory.reject', 'reject'],
    ['memory.amend', 'amend'],
  ])('Scenario Outline: Error - an approver-gated Tool refuses in an agent context — %s', async (tool, verb) => {
    const root = project('pending');
    const before = gitState(root);
    const unchanged = snapshotPersistence(root);
    const client = await connectProductionTools(root, SERVER_ENV);

    const result = await client.callTool({ name: tool, arguments: { id: 'task-101', reason: 'r' } });
    await client.close();

    expect(result.isError).toBe(true);
    const text = (result.content as ReadonlyArray<{ text?: string }>)[0]?.text ?? '';
    const prefix = `E_AGENT_CONTEXT: 'memory ${verb}' needs the approver and does not run in an agent's session`;
    expect(text.slice(0, prefix.length)).toBe(prefix);
    expect(statusOf(root)).toBe('pending');
    expect(gitState(root)).toEqual(before);
    assertPersistenceUnchanged(root, unchanged, `${tool} refused`);
  });

  it('Scenario: Error - invoking a tool with a missing required argument', async () => {
    const root = project('pending');
    const before = gitState(root);
    const client = await connectProductionTools(root, SERVER_ENV);

    const result = await client.callTool({ name: 'memory.approve', arguments: { id: 'task-101' } });
    await client.close();

    expect(result.isError).toBe(true);
    expect(result.content).toEqual([{ type: 'text', text: 'missing required argument: reason' }]);
    expect(gitState(root)).toEqual(before);
  });
});
