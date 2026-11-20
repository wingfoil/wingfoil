/**
 * task-367 (P5.2.3, `spec-004` §4.3, `spec-014` §3, `spec-018` §1.2) — the shared plumbing of the suites that drive
 * the Memory Tools of the PRODUCTION server (`createMcpServer`, the server `wingfoil mcp` starts) over the SDK's
 * in-memory transport with a real `Client`, and compare a Tool's commit with the commit the compiled CLI writes for
 * the same arguments.
 *
 * - {@link connectProductionTools}: a `Client` connected to `createMcpServer({ resolveRoot, roles, env })`; the server
 *   environment is always passed explicitly (design item 4, `McpServerOptions.env`), so a case never depends on the
 *   environment jest runs in;
 * - {@link runCli}: the compiled `dist/cli.js` in a child whose environment is `process.env` minus the `spec-018` §1
 *   environment markers (`test/agent-markers.cjs`) and minus `WINGFOIL_AGENT_MODEL`, plus what the case names;
 * - {@link gitState}, {@link commitView}, {@link finalParagraph}: what a case compares.
 *
 * Not a `.test.ts` file, so Jest never collects it as a suite. Deterministic: fixed fixtures, no wall clock.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { createMcpServer } from '../../../src/mcp/server';
import { withoutAgentMarkers } from '../../agent-markers.cjs';
import { CLI_ENTRY, spawnCapture, type SpawnedRun } from '../../cli/helpers/spawn-cli';
import { git } from '../../storage/helpers/git-fixture';

/** The environment the production server is built with in a case. */
export type ServerEnv = Readonly<Record<string, string | undefined>>;

/** A `Client` connected to the production server on `root`, built with `env` as its environment. */
export async function connectProductionTools(root: string, env: ServerEnv): Promise<Client> {
  const server = createMcpServer({ resolveRoot: () => root, roles: ['developer'], env });
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'wingfoil-task-367-client', version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

/** The child environment of {@link runCli}: no `spec-018` §1 marker, no `WINGFOIL_AGENT_MODEL`, plus `extra`. */
export function cliEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env = withoutAgentMarkers(process.env);
  delete env.WINGFOIL_AGENT_MODEL;
  return { ...env, ...extra } as NodeJS.ProcessEnv;
}

/** Run the compiled CLI in `cwd` with {@link cliEnv}`(extra)`. */
export function runCli(cwd: string, args: readonly string[], extra: Record<string, string> = {}): SpawnedRun {
  return spawnCapture('node', [CLI_ENTRY, ...args], { cwd, env: cliEnv(extra) });
}

/** `HEAD`, the index and the tree. */
export function gitState(root: string): { head: string; status: string; cached: string } {
  return {
    head: git(root, ['rev-parse', 'HEAD']).trim(),
    status: git(root, ['status', '--porcelain']),
    cached: git(root, ['diff', '--cached', '--name-only']),
  };
}

/** The number of commits `root` gained after `before`. */
export function commitsSince(root: string, before: string): number {
  return Number(git(root, ['rev-list', '--count', `${before}..HEAD`]).trim());
}

/** The raw message of `rev`, as `git log -1 --format=%B` prints it. */
export function messageOf(root: string, rev = 'HEAD'): string {
  return git(root, ['log', '-1', '--format=%B', rev]);
}

/** The lines of a message's final paragraph (the text after its last blank line). */
export function finalParagraph(message: string): string[] {
  const paragraphs = message.replace(/\n+$/, '').split(/\n\n+/);
  return (paragraphs[paragraphs.length - 1] as string).split('\n');
}

/** The paragraphs of a message, trailing newlines dropped. */
export function paragraphs(message: string): string[] {
  return message.replace(/\n+$/, '').split(/\n\n+/);
}

/**
 * A commit as two writers of the same operation must agree on it: its subject, the paths it changed, and its
 * message with the `WingFoil-Version:` line left out (the in-process server and the compiled CLI are two builds).
 */
export function commitView(root: string, rev = 'HEAD'): { subject: string; paths: string[]; message: string } {
  const message = messageOf(root, rev);
  return {
    subject: message.split('\n')[0] as string,
    paths: git(root, ['show', '--name-only', '--format=', rev]).split('\n').filter((line) => line.length > 0),
    message: message
      .split('\n')
      .filter((line) => !line.startsWith('WingFoil-Version: '))
      .join('\n'),
  };
}

/** The value of git's own trailer reader for `Co-Authored-By` on `rev`. */
export function coAuthorByGit(root: string, rev = 'HEAD'): string {
  return git(root, ['log', '-1', '--format=%(trailers:key=Co-Authored-By,valueonly)', rev]).trim();
}

/** The seven Memory Tools the production server serves (design item 4, D6), in the order `tools/list` gives them. */
export const MEMORY_TOOLS = [
  'memory.add',
  'memory.amend',
  'memory.approve',
  'memory.deprecate',
  'memory.park',
  'memory.reject',
  'memory.submit',
] as const;

/** `spec-018` §3.2's phrase for marker row 5 (§1.2). */
export const MCP_MARKER_PHRASE = 'the call came through the MCP server';
