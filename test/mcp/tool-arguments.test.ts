/**
 * task-364 AC 4 (red-first, `bug-272`, `dl-040` option 1, `spec-004` §4.3 as amended): a Tool call's arguments
 * reach the operation mapped to the params the CLI registrar builds for the same invocation, and arguments the
 * schema refuses never reach it.
 *
 * What these assertions verify, over the real `CORE_MODULES` and a committed fixture repository built with the
 * compiled CLI (`wingfoil init --template Scrum`, then `wingfoil memory add --type bug --title probe`, which adds
 * `bug-001-probe` in `draft`):
 * - context parity: a spy `ParamsBuilder` records the `ParamsContext` each surface hands it and returns
 *   `buildCoreParams(ctx)` (the one builder, design D11); `wingfoil memory approve bug-001-probe --reason x` run
 *   in-process through `buildProgram` and the Tool call `memory.approve {id, reason}` record equal contexts
 *   (`root`, `positional`, `positionals`, `flags`, `options`); `wingfoil memory history bug-001-probe` and a read
 *   of `wingfoil://memory/history/bug-001-probe` do too, and the Resource text is the CLI's `--format json` stdout
 *   without its final newline;
 * - argument refusals (`spec-004` §4.3's four kinds, design D10): each is `isError: true` with exactly the
 *   refusal text, and the spy is not called, so the operation is not either;
 * - `dry-run: true` on `memory.add` writes nothing (HEAD, refs, working tree unchanged) and returns the payload
 *   the CLI's `--dry-run --format json` prints, in-process, for the same arguments.
 *
 * `buildCoreParams` is a new export of `src/core/registry.ts`, imported from that module directly (design item 1).
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { withoutAgentMarkers } from '../agent-markers.cjs';
import { buildProgram } from '../../src/cli/program';
import { CORE_MODULES } from '../../src/core';
import { buildCoreParams, type ParamsContext } from '../../src/core/registry';
import { registerCoreModules } from '../../src/mcp/registrar';
import { CLI_ENTRY, spawnCapture } from '../cli/helpers/spawn-cli';
import { makeTempGitRepo, removeTempDir } from '../storage/helpers/git-fixture';
import { assertPersistenceUnchanged, snapshotPersistence } from '../storage/helpers/persistence-snapshot';

const BUG_ID = 'bug-001-probe';
const BUG_FILE = 'docs/memory/bug/bug-001-probe.md';

let root: string;
/** Every `ParamsContext` the spy builder saw, in call order (both surfaces share it). */
let seen: ParamsContext[];

/** The spy builder: record the context, build the params the CLI builds. */
function spyBuildParams(ctx: ParamsContext): ReturnType<typeof buildCoreParams> {
  seen.push(ctx);
  return buildCoreParams(ctx);
}

/** The fields of a context the two surfaces must agree on. */
function comparable(ctx: ParamsContext | undefined): Record<string, unknown> {
  return {
    root: ctx?.root,
    positional: ctx?.positional,
    positionals: ctx?.positionals,
    flags: ctx?.flags,
    options: ctx?.options,
  };
}

/** A Client connected to `registerCoreModules(CORE_MODULES)` over the fixture, with the spy builder. */
async function toolClient(): Promise<Client> {
  const server = new McpServer({ name: 'tool-arguments-test', version: '0.0.0' });
  registerCoreModules(server, CORE_MODULES, { resolveRoot: () => root, buildParams: spyBuildParams });
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'tool-arguments-test-client', version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

let exitSpy: jest.SpyInstance;
let stdoutSpy: jest.SpyInstance;
let stderrSpy: jest.SpyInstance;

/**
 * Run `wingfoil <argv…>` in-process through the real `buildProgram` over `CORE_MODULES`, with the spy builder,
 * and return what it wrote to stdout. A rejection of the parse (an exit the program defers) is not this
 * suite's subject: the context and the output are.
 */
async function runCli(argv: readonly string[]): Promise<string> {
  stdoutSpy.mockClear();
  const program = await buildProgram(CORE_MODULES, { resolveRoot: () => root, buildParams: spyBuildParams });
  try {
    await program.parseAsync(['node', 'wingfoil', ...argv]);
  } catch {
    // the outcome is read from the spies below
  }
  return stdoutSpy.mock.calls.map((call) => String(call[0])).join('');
}

beforeAll(() => {
  root = makeTempGitRepo();
  const env = withoutAgentMarkers(process.env);
  const init = spawnCapture('node', [CLI_ENTRY, 'init', '--template', 'Scrum'], { cwd: root, env });
  expect(init.status).toBe(0);
  const add = spawnCapture('node', [CLI_ENTRY, 'memory', 'add', '--type', 'bug', '--title', 'probe'], { cwd: root, env });
  expect(add.status).toBe(0);
  expect(JSON.parse(add.stdout)).toEqual({ id: BUG_ID, path: BUG_FILE });
});

afterAll(() => removeTempDir(root));

beforeEach(() => {
  seen = [];
  exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
  stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

afterEach(() => {
  exitSpy.mockRestore();
  stdoutSpy.mockRestore();
  stderrSpy.mockRestore();
  process.exitCode = undefined;
});

describe('task-364 AC 4 — a Tool call reaches the operation with the params the CLI builds', () => {
  it('memory.approve: the Tool call and `wingfoil memory approve` hand the builder equal contexts', async () => {
    await runCli(['memory', 'approve', BUG_ID, '--reason', 'x']);
    expect(seen).toHaveLength(1);
    const cliContext = seen[0];

    const client = await toolClient();
    await client.callTool({ name: 'memory.approve', arguments: { id: BUG_ID, reason: 'x' } });
    expect(seen).toHaveLength(2);
    expect(comparable(seen[1])).toEqual(comparable(cliContext));
    expect(comparable(seen[1])).toMatchObject({ root, positional: BUG_ID, positionals: [BUG_ID], options: { reason: 'x' } });
    await client.close();
  });

  it('memory history: the Resource read and `wingfoil memory history` hand the builder equal contexts, and the text is the CLI\'s JSON', async () => {
    const stdout = await runCli(['memory', 'history', BUG_ID, '--format', 'json']);
    expect(seen).toHaveLength(1);
    const cliContext = seen[0];

    const client = await toolClient();
    const result = await client.readResource({ uri: `wingfoil://memory/history/${BUG_ID}` });
    expect(seen).toHaveLength(2);
    expect(comparable(seen[1])).toEqual(comparable(cliContext));
    expect((result.contents[0] as { text: string }).text).toBe(stdout.replace(/\n$/, ''));
    await client.close();
  });
});

describe('task-364 AC 4 — arguments the schema refuses never reach the operation (spec-004 §4.3)', () => {
  const CASES: ReadonlyArray<{ tool: string; args: Record<string, unknown>; text: string }> = [
    { tool: 'memory.approve', args: {}, text: 'missing required argument: id' },
    { tool: 'memory.approve', args: { id: BUG_ID }, text: 'missing required argument: reason' },
    { tool: 'memory.approve', args: { id: BUG_ID, reason: 'x', type: 'bug' }, text: 'unknown argument: type' },
    { tool: 'memory.approve', args: { id: 5, reason: 'x' }, text: 'invalid argument: id must be a string' },
    { tool: 'memory.add', args: { type: 'bug', title: 't', set: 'a=b' }, text: 'invalid argument: set must be an array of strings' },
    { tool: 'directive.assign', args: { directive: 'd', role: 'r', force: 'yes' }, text: 'invalid argument: force must be a boolean' },
  ];

  it.each(CASES)('$tool $args → "$text", the operation not called', async ({ tool, args, text }) => {
    const client = await toolClient();
    const result = await client.callTool({ name: tool, arguments: args });
    expect(result.isError).toBe(true);
    expect(result.content).toEqual([{ type: 'text', text }]);
    expect(seen).toHaveLength(0);
    await client.close();
  });
});

describe('task-364 AC 4 — dry-run is a Tool input (design D6)', () => {
  it('memory.add with dry-run: true writes nothing and returns the payload `wingfoil memory add --dry-run --format json` prints', async () => {
    const before = snapshotPersistence(root, [BUG_FILE]);
    const client = await toolClient();
    const result = await client.callTool({ name: 'memory.add', arguments: { type: 'bug', title: 't2', 'dry-run': true } });
    await client.close();
    assertPersistenceUnchanged(root, before, 'tool-dry-run');

    const stdout = await runCli(['memory', 'add', '--type', 'bug', '--title', 't2', '--dry-run', '--format', 'json']);
    assertPersistenceUnchanged(root, before, 'cli-dry-run');
    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toEqual(JSON.parse(stdout));
    expect(JSON.parse(text)).toMatchObject({ dryRun: true, subject: 'wf(bug): add bug-002-t2' });
  });
});
