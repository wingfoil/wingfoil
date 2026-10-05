/**
 * The PRODUCTION MCP server entry point (task-030-implement-mcp-resources, P5.2.1,
 * spec-014-mcp-server-entry-point §2/§3, spec-004-mcp-surface-contract §1). This is the first place in
 * the codebase that constructs a real `McpServer` for a shippable process — everything before it
 * (task-006's `registerCoreModules`, task-011's `registerReadOnlyResources`) only ever ran against the
 * SDK's in-memory transport inside tests.
 *
 * The module is split into a testable constructor and a thin, un-testable transport seam — the same
 * pattern `src/cli/program.ts`'s `commander` wiring and `src/cli/init-command.ts`'s `createReadlinePrompt`
 * already use, and for the same reason:
 *
 *  - {@link createMcpServer} does all the wiring (construct the `McpServer`, register its channel set)
 *    and performs NO transport / stdio / process I/O, so it is exercised end-to-end over the SDK's
 *    in-memory transport + a real `Client` in `test/mcp/server.test.ts` (the three P5.2.1 acceptance
 *    criteria + the read-only-only scope assertion).
 *  - {@link startMcpServer} adds the single line that cannot be unit-tested without opening a real
 *    stdio channel: `server.connect(new StdioServerTransport())`. It is verified by hand / at runtime,
 *    never by an automated test (a test must never open a real stdio server against a repo).
 *
 * Channel scope (spec-014 §3): `createMcpServer` registers the read-only Resources channel
 * (`registerReadOnlyResources` — spec-004 §2, P5.2.1), the read-only role Prompts channel
 * (`registerRolePrompts` — spec-004 §3, P5.2.2, since task-058-mcp-prompts-role-based), and an **empty
 * Tools channel** ({@link registerEmptyToolsChannel}, task-174, `bug-151`). It deliberately does NOT
 * call `registerCoreModules`, which would advertise a mutating Tool for every `mutates: true`
 * CoreOperation (as of task-025, `dnaSet` -> the `dna.set` Tool) — Tools are P5.2.3 (v0.4) scope and
 * will replace the empty channel here later; the entry point (`wingfoil mcp` + this transport wiring)
 * is unchanged by those additions.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import { registerReadOnlyResources, registerRolePrompts } from './index';

/** Construction/connection options for the production MCP server. */
export interface McpServerOptions {
  /**
   * Resolve the project root the Resource handlers read from — invoked lazily, per request, by
   * task-011's already-registered handlers (never at construction time). The `wingfoil mcp` command
   * resolves the root once up front and passes a closure returning that value (spec-014 §1).
   */
  readonly resolveRoot: () => string;
  /**
   * The DNA role set the Prompts channel serves, one `{role}-session` Prompt each, fixed for the
   * server's life (spec-004 §3.1, `dl-049` (b)). `wingfoil mcp` reads it in its pre-flight
   * (`loadDnaRoleSet`), so construction itself reads nothing (spec-014 §2).
   */
  readonly roles: readonly string[];
  /** Server identity `name`; defaults to `wingfoil`. */
  readonly name?: string;
  /** Server identity `version`; defaults to `0.0.0` (the `wingfoil mcp` command passes the real package version). */
  readonly version?: string;
}

/**
 * Declare the Tools channel and answer it with no Tools (task-174, `bug-151`), until P5.2.3 (v0.4)
 * registers real ones. A client that probes `tools/list` gets `{tools: []}` rather than the JSON-RPC
 * `-32601` it got while the channel was undeclared, and `initialize` advertises `tools: {}` — without
 * `listChanged`, since the list cannot change during a session.
 *
 * A `tools/call` necessarily names a Tool that does not exist. It is answered the way spec-004 §4.3
 * item 4 answers every Tool refusal — an `isError: true` result, not a JSON-RPC error — with the SDK's
 * own wording for an unknown Tool, `Tool <name> not found`.
 *
 * Owned on the low-level server, like the Prompts handlers (`./prompt.ts`): the SDK installs its own
 * Tools handlers only on the first `registerTool`, and a later `registerTool` on this server fails
 * loudly ("A request handler for tools/list already exists") instead of being silently shadowed.
 */
function registerEmptyToolsChannel(server: McpServer): void {
  server.server.registerCapabilities({ tools: {} });
  server.server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: [] }));
  server.server.setRequestHandler(
    CallToolRequestSchema,
    (request): CallToolResult => ({
      content: [{ type: 'text', text: `Tool ${request.params.name} not found` }],
      isError: true,
    }),
  );
}

/**
 * Construct the production `McpServer` and register its channel set on it (spec-014 §3): the read-only
 * Resources, the role Prompts over the given role set, and the empty Tools channel. Pure and
 * synchronous — no transport, no stdio, no filesystem read, no process side effects (spec-014 §2: "no
 * I/O at construction time beyond wiring handlers"); the role set arrives already read, and every
 * handler resolves the root and reads the project per request. So a test can connect it over the SDK's
 * in-memory transport and drive it with a real `Client`.
 */
export function createMcpServer(options: McpServerOptions): McpServer {
  const server = new McpServer({
    name: options.name ?? 'wingfoil',
    version: options.version ?? '0.0.0',
  });
  registerReadOnlyResources(server, { resolveRoot: options.resolveRoot });
  registerRolePrompts(server, { resolveRoot: options.resolveRoot, roles: options.roles });
  registerEmptyToolsChannel(server);
  return server;
}

/**
 * Construct the server via {@link createMcpServer} and connect it over a real `StdioServerTransport`.
 * Resolves once the transport is connected; the process then stays alive serving requests until the
 * transport closes (client disconnect / stdin EOF). The `server.connect(...)` line is the only part of
 * this module not covered by an automated test (the thin stdio seam — see the module doc).
 */
export async function startMcpServer(options: McpServerOptions): Promise<McpServer> {
  const server = createMcpServer(options);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  return server;
}
