/**
 * task-367 AC 1, AC 2, AC 3, AC 5 (P5.2.3, REQ-INT-03, REQ-SYS-05; `spec-004` §4.1–§4.3, `spec-014` §3, `spec-018`
 * §1.2, §2.3–§2.4, §3.2; `cp-003`; approver rulings D1–D3, D6, D7) — the Memory Tools of the PRODUCTION server
 * (`createMcpServer`, the server `wingfoil mcp` starts), over the SDK's in-memory transport with a real `Client`.
 *
 * - AC 1: `tools/list` names the seven Memory Tools derived from `CORE_MODULES` and nothing else (D6), each with the
 *   input schema `deriveToolInputSchema` gives its operation; `memory.add`, `memory.submit` and `memory.park` each write
 *   exactly one commit, equal — subject, paths and message, `WingFoil-Version:` excepted — to the commit the compiled
 *   CLI writes for the same arguments on a twin fixture under `WINGFOIL_AGENT=Claude`; a missing argument and a blank
 *   `reason` are refused as the CLI refuses them, the second as an `isError` result (`dl-199` (b), D7).
 * - AC 2: `memory.approve`, `memory.reject` and `memory.amend` refuse every call that reaches the approver check with
 *   `E_AGENT_CONTEXT` naming marker row 5, on a fixture whose git identity holds `approver` (the "whatever identity"
 *   case); the server's own environment markers are listed first, in `spec-018` §1 order; the argument check and the
 *   transition legality come first (D2).
 * - AC 3: a Tool commit carries the agent trailers in one final paragraph, signed by the entry the server's
 *   environment selects (`spec-018` §2.3), the model from its `WINGFOIL_AGENT_MODEL`, else `not-reported`; the guessed
 *   entry's body line and warning (D1); a model that is not one line refuses the call.
 * - AC 5: a refusal is an `isError` result whose `structuredContent` is the CLI's `--format json` error object plus the
 *   warnings raised before it (D3, D7); `E_AGENT_CONTEXT` carries its hint.
 *
 * Fixtures: `buildAttributionRepo` (`test/core/helpers/attribution-fixture.ts`), the L0 repository of `buildL0Repo`
 * plus the `id_pattern`/`template` `memory add --type task` needs and `task-006-submit-me` at `draft` (the design named
 * `buildL0Repo`, whose `task` type has no `id_pattern`, and `task-004-deprecate-me` for the submit "if the fixture's
 * required fields let it pass"); `buildL0Repo` itself for the refusals.
 *
 * Red until green: `createMcpServer` serves no Tool (`tools/list` is `[]`, every call `Tool <name> not found`) and
 * takes no `env` (TS2353 under `tsc`). Deterministic: fixed fixtures, fixed identity, explicit server environments.
 */
import { CORE_MODULES } from '../../src/core';
import { deriveToolInputSchema, deriveVerb, enumerateOperations } from '../../src/core/registry';
import { buildAttributionRepo } from '../core/helpers/attribution-fixture';
import { agentContextRefusal, buildL0Repo, prepareAmend } from '../core/helpers/l0-fixture';
import { git, removeTempDir } from '../storage/helpers/git-fixture';
import { assertPersistenceUnchanged, snapshotPersistence } from '../storage/helpers/persistence-snapshot';
import {
  coAuthorByGit,
  commitsSince,
  commitView,
  connectProductionTools,
  finalParagraph,
  gitState,
  MCP_MARKER_PHRASE,
  MEMORY_TOOLS,
  messageOf,
  paragraphs,
  runCli,
} from './helpers/production-tools';

const TIMEOUT_MS = 60_000;

const CLAUDE_LINE = 'Co-Authored-By: Claude <noreply@anthropic.com>';
const GUESSED = 'Attributed to the first team.agents entry, Claude: no entry is named for this agent.';

/** The first text content of a Tool result. */
function textOf(result: unknown): string | undefined {
  const content = (result as { content?: ReadonlyArray<{ type: string; text?: string }> }).content;
  return content?.[0]?.text;
}

describe('task-367 AC 1 — the production server serves the Memory Tools derived from CORE_MODULES (D6)', () => {
  const roots: string[] = [];
  afterEach(() => roots.splice(0).forEach(removeTempDir));
  function attributionRepo(): string {
    const root = buildAttributionRepo();
    roots.push(root);
    return root;
  }

  it('tools/list names memory.add, amend, approve, deprecate, park, reject, submit — no dna.*, directive.*, workflow.*, agent.*', async () => {
    const root = attributionRepo();
    const client = await connectProductionTools(root, {});
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toEqual([...MEMORY_TOOLS]);
    await client.close();
  });

  it('each listed Tool\'s inputSchema equals deriveToolInputSchema of its memory operation', async () => {
    const root = attributionRepo();
    const client = await connectProductionTools(root, {});
    const { tools } = await client.listTools();
    const memory = enumerateOperations(CORE_MODULES).filter(({ module, operation }) => module.name === 'memory' && operation.mutates);
    expect(memory.map(({ module, operation }) => `${module.name}.${deriveVerb(module.name, operation.name)}`).sort()).toEqual([...MEMORY_TOOLS]);
    for (const { module, operation } of memory) {
      const name = `${module.name}.${deriveVerb(module.name, operation.name)}`;
      const tool = tools.find((candidate) => candidate.name === name);
      expect({ name, inputSchema: tool?.inputSchema }).toEqual({ name, inputSchema: deriveToolInputSchema(operation) });
    }
    await client.close();
  });

  it.each<[string, Record<string, unknown>, readonly string[], string]>([
    ['memory.add', { type: 'task', title: 't' }, ['memory', 'add', '--type', 'task', '--title', 't'], 'docs/tasks/task-007-t.md'],
    ['memory.submit', { id: 'task-006-submit-me' }, ['memory', 'submit', 'task-006-submit-me'], 'docs/tasks/task-006-submit-me.md'],
    ['memory.park', { id: 'task-005-park-me', reason: 'r' }, ['memory', 'park', 'task-005-park-me', '--reason', 'r'], 'docs/tasks/task-005-park-me.md'],
  ])(
    '%s writes exactly one commit, of the element\'s path only, equal to the CLI\'s under WINGFOIL_AGENT=Claude (WingFoil-Version: excepted)',
    async (tool, args, cliArgs, path) => {
      const root = attributionRepo();
      const twin = attributionRepo();
      const before = gitState(root).head;
      const client = await connectProductionTools(root, { WINGFOIL_AGENT: 'Claude' });

      const result = await client.callTool({ name: tool, arguments: args });
      await client.close();

      expect({ isError: result.isError ?? false, text: result.isError === true ? textOf(result) : undefined }).toEqual({ isError: false, text: undefined });
      expect(commitsSince(root, before)).toBe(1);
      const served = commitView(root);
      expect(served.paths).toEqual([path]);

      const cli = runCli(twin, cliArgs, { WINGFOIL_AGENT: 'Claude' });
      expect({ status: cli.status, stderr: cli.stderr }).toEqual({ status: 0, stderr: '' });
      expect(served).toEqual(commitView(twin));
    },
    TIMEOUT_MS,
  );

  it('validation as the CLI: memory.park without reason → missing required argument: reason, nothing written', async () => {
    const root = attributionRepo();
    const unchanged = snapshotPersistence(root);
    const client = await connectProductionTools(root, { WINGFOIL_AGENT: 'Claude' });

    const result = await client.callTool({ name: 'memory.park', arguments: { id: 'task-005-park-me' } });
    await client.close();

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe('missing required argument: reason');
    assertPersistenceUnchanged(root, unchanged, 'park without reason');
  });

  it('validation as the CLI: memory.deprecate with a blank reason is an isError result, the CLI\'s usage text, nothing written (dl-199 (b))', async () => {
    const root = attributionRepo();
    const unchanged = snapshotPersistence(root);
    const client = await connectProductionTools(root, { WINGFOIL_AGENT: 'Claude' });

    const result = await client.callTool({ name: 'memory.deprecate', arguments: { id: 'task-004-deprecate-me', reason: '   ' } });
    await client.close();

    expect(result).toEqual({ content: [{ type: 'text', text: 'invalid flag value: --reason must not be blank' }], isError: true });
    assertPersistenceUnchanged(root, unchanged, 'blank reason');
  });
});

describe('task-367 AC 2 — memory.approve, reject and amend are listed Tools that refuse with E_AGENT_CONTEXT (W1-R2, D2)', () => {
  const roots: string[] = [];
  afterEach(() => roots.splice(0).forEach(removeTempDir));
  function l0(): string {
    const root = buildL0Repo();
    roots.push(root);
    return root;
  }

  it.each<[string, string, Record<string, unknown>, ((root: string) => void) | undefined]>([
    ['memory.approve', 'memory approve', { id: 'task-001-approve-me', reason: 'r' }, undefined],
    ['memory.reject', 'memory reject', { id: 'task-002-reject-me', reason: 'r' }, undefined],
    ['memory.amend (with the edit amend records)', 'memory amend', { id: 'task-003-amend-me', reason: 'r' }, prepareAmend],
    ['memory.amend (no edit)', 'memory amend', { id: 'task-003-amend-me', reason: 'r' }, undefined],
  ])(
    '%s, identity holding approver: isError, the §3.2 text naming the MCP marker, structuredContent {error, hint}, HEAD, index and tree unchanged',
    async (_label, command, args, prepare) => {
      const root = l0();
      prepare?.(root);
      const before = gitState(root);
      const unchanged = snapshotPersistence(root);
      const client = await connectProductionTools(root, {});
      const tool = `memory.${command.split(' ')[1] as string}`;

      const result = await client.callTool({ name: tool, arguments: args });
      await client.close();

      const refusal = agentContextRefusal(command, MCP_MARKER_PHRASE);
      expect(result.isError).toBe(true);
      expect(result.content).toEqual([{ type: 'text', text: refusal.error }]);
      expect(result.structuredContent).toEqual({ error: refusal.error, hint: refusal.hint });
      expect(gitState(root)).toEqual(before);
      assertPersistenceUnchanged(root, unchanged, `${command} over MCP`);
    },
  );

  it('a server started with CLAUDE_CODE_CHILD_SESSION=1 in its environment lists that marker, then the MCP one, in §1 order', async () => {
    const root = l0();
    const before = gitState(root);
    const client = await connectProductionTools(root, { CLAUDE_CODE_CHILD_SESSION: '1' });

    const result = await client.callTool({ name: 'memory.approve', arguments: { id: 'task-001-approve-me', reason: 'r' } });
    await client.close();

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(agentContextRefusal('memory approve', `CLAUDE_CODE_CHILD_SESSION is set, ${MCP_MARKER_PHRASE}`).error);
    expect(gitState(root)).toEqual(before);
  });

  it('order (D2): memory.approve without reason is told the argument check first — missing required argument: reason', async () => {
    const root = l0();
    const before = gitState(root);
    const client = await connectProductionTools(root, {});

    const result = await client.callTool({ name: 'memory.approve', arguments: { id: 'task-001-approve-me' } });
    await client.close();

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe('missing required argument: reason');
    expect(gitState(root)).toEqual(before);
  });

  it('order (D2): memory.approve on a draft element is told the illegal transition before the agent refusal', async () => {
    const root = l0();
    const before = gitState(root);
    const client = await connectProductionTools(root, {});

    const result = await client.callTool({ name: 'memory.approve', arguments: { id: 'task-004-deprecate-me', reason: 'r' } });
    await client.close();

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe("illegal transition draft -> (none) for type 'task'");
    expect(gitState(root)).toEqual(before);
  });
});

describe('task-367 AC 3 — every Tool call is an agent context: its commit carries the agent trailers (W1-R3, D1)', () => {
  const roots: string[] = [];
  afterEach(() => roots.splice(0).forEach(removeTempDir));
  function attributionRepo(): string {
    const root = buildAttributionRepo();
    roots.push(root);
    return root;
  }
  const ADD = { type: 'task', title: 't' };

  it('a server with an empty environment: the first entry signs, AI-Model: not-reported, one trailer paragraph; the body note and W_AGENT_ENTRY_GUESSED', async () => {
    const root = attributionRepo();
    const client = await connectProductionTools(root, {});

    const result = await client.callTool({ name: 'memory.add', arguments: ADD });
    await client.close();

    expect({ isError: result.isError ?? false, text: result.isError === true ? textOf(result) : undefined }).toEqual({ isError: false, text: undefined });
    const message = messageOf(root);
    const trailer = finalParagraph(message);
    expect(trailer).toHaveLength(3);
    expect(trailer[0]).toMatch(/^WingFoil-Version: \S/);
    expect(trailer.slice(1)).toEqual([CLAUDE_LINE, 'AI-Model: not-reported']);
    expect(message.match(/^Co-Authored-By:/gim)).toHaveLength(1);
    expect(coAuthorByGit(root)).toBe('Claude <noreply@anthropic.com>');
    expect(paragraphs(message)[1]).toBe(GUESSED);
    expect((result.structuredContent as { warnings?: unknown } | undefined)?.warnings).toEqual([`W_AGENT_ENTRY_GUESSED: ${GUESSED}`]);
  });

  it('WINGFOIL_AGENT=Other WINGFOIL_AGENT_MODEL=m-1 in the server\'s environment: Other signs, AI-Model: m-1, no note, no structuredContent', async () => {
    const root = attributionRepo();
    const client = await connectProductionTools(root, { WINGFOIL_AGENT: 'Other', WINGFOIL_AGENT_MODEL: 'm-1' });

    const result = await client.callTool({ name: 'memory.add', arguments: ADD });
    await client.close();

    expect({ isError: result.isError ?? false, text: result.isError === true ? textOf(result) : undefined }).toEqual({ isError: false, text: undefined });
    expect(result.structuredContent).toBeUndefined();
    const message = messageOf(root);
    const parts = paragraphs(message);
    expect(parts).toHaveLength(2);
    expect(parts[0]).toBe('wf(task): add task-007-t');
    const trailer = finalParagraph(message);
    expect(trailer[0]).toMatch(/^WingFoil-Version: \S/);
    expect(trailer.slice(1)).toEqual(['Co-Authored-By: Other <0+other@users.noreply.github.com>', 'AI-Model: m-1']);
  });

  it('a WINGFOIL_AGENT_MODEL that is not one line refuses the call before the operation runs, nothing written', async () => {
    const root = attributionRepo();
    const unchanged = snapshotPersistence(root, ['docs/tasks/task-007-t.md']);
    const client = await connectProductionTools(root, { WINGFOIL_AGENT_MODEL: 'a\nb' });

    const result = await client.callTool({ name: 'memory.add', arguments: ADD });
    await client.close();

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe('invalid environment value: WINGFOIL_AGENT_MODEL must be one line');
    assertPersistenceUnchanged(root, unchanged, 'multi-line model');
  });
});

describe('task-367 AC 5 — a refusal is an isError result carrying the CLI\'s json error object and the warnings raised before it (D3, D7)', () => {
  const roots: string[] = [];
  afterEach(() => roots.splice(0).forEach(removeTempDir));

  it('team.agents: [] and memory.submit on a pending task: the illegal transition, the CLI\'s details, and W_NO_AGENT_ENTRY', async () => {
    const root = buildL0Repo({ agents: false });
    const twin = buildL0Repo({ agents: false });
    roots.push(root, twin);
    const unchanged = snapshotPersistence(root);
    const client = await connectProductionTools(root, {});

    const result = await client.callTool({ name: 'memory.submit', arguments: { id: 'task-001-approve-me' } });
    await client.close();

    const reason = "illegal transition pending -> (none) for type 'task'";
    const cli = runCli(twin, ['memory', 'submit', 'task-001-approve-me', '--format', 'json']);
    expect(cli.status).toBe(1);
    const cliError = JSON.parse(cli.stderr) as { error: string; hint?: string; details?: unknown[] };
    expect(cliError.error).toBe(reason);
    expect(cliError.details?.length ?? 0).toBeGreaterThan(0);

    expect(result.isError).toBe(true);
    expect(result.content).toEqual([{ type: 'text', text: reason }]);
    expect(result.structuredContent).toEqual({
      ...cliError,
      warnings: [
        `W_NO_AGENT_ENTRY: this command runs in an agent's session (${MCP_MARKER_PHRASE}) but dna.yaml declares no team.agents entry, so its commit names no AI co-author; declare one (wingfoil dna add team.agents …)`,
      ],
    });
    assertPersistenceUnchanged(root, unchanged, 'illegal submit');
    expect(git(root, ['status', '--porcelain'])).toBe('');
  }, TIMEOUT_MS);
});
