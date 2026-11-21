/**
 * The PRODUCTION MCP server entry point (task-030-implement-mcp-resources, P5.2.1,
 * spec-014-mcp-server-entry-point §2/§3, spec-004-mcp-surface-contract §1). This is the first place in
 * the codebase that constructs a real `McpServer` for a shippable process — everything before it
 * (task-006's `registerCoreModules`, task-011's `registerReadOnlyResources`) only ever ran against the
 * SDK's in-memory transport inside tests.
 *
 * The module is split into a testable constructor and a thin transport seam — the same
 * pattern `src/cli/program.ts`'s `commander` wiring and `src/cli/init-command.ts`'s `createReadlinePrompt`
 * already use, and for the same reason:
 *
 *  - {@link createMcpServer} does all the wiring (construct the `McpServer`, register its channel set)
 *    and performs NO transport / stdio / process I/O, so it is exercised end-to-end over the SDK's
 *    in-memory transport + a real `Client` in `test/mcp/server.test.ts` (the three P5.2.1 acceptance
 *    criteria + the read-only-only scope assertion).
 *  - {@link startMcpServer} adds the single line that would open a real stdio channel:
 *    `server.connect(new StdioServerTransport())`. `test/mcp/start-mcp-server.test.ts` covers it over a jest
 *    mock of the SDK's stdio transport, so no real stdio channel is opened (a test must never open a real
 *    stdio server against a repo).
 *
 * Channel scope (spec-014 §3): `createMcpServer` registers the read-only Resources channel
 * (`registerReadOnlyResources` — spec-004 §2, P5.2.1), the read-only role Prompts channel
 * (`registerRolePrompts` — spec-004 §3, P5.2.2, since task-058-mcp-prompts-role-based), the session Resource, the
 * `wingfoil://capabilities` Resource (`registerCapabilitiesResource` — `spec-019` §6, task-362), and the **Memory
 * Tools** derived from `CORE_MODULES` (`registerCoreTools`, `./tools.ts` — spec-004 §4, P5.2.3, task-367):
 * `memory.add`, `amend`, `approve`, `deprecate`, `park`, `reject` and `submit`. Every Tool call is an agent
 * context (`spec-018` §1.2), so the approver-gated three always refuse with `E_AGENT_CONTEXT` and the others
 * sign their commit with the agent trailers, the entry and the model read from the server's environment. The
 * module filter is staged (approver ruling D6, stated in `spec-014` §3): `task-368` passes `CORE_MODULES`
 * whole. It does NOT call `registerCoreModules`, whose derived Resources the server does not serve.
 *
 * The server connects through {@link withBareErrorMessages} (`./wire-errors.ts`, `bug-034`): a JSON-RPC
 * error it sends carries the reason alone, without the SDK's `MCP error <code>: ` prefix.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

import { CORE_MODULES } from '../core';
import { buildCoreParams } from '../core/registry';

// Leaf modules, not the `./index` barrel: the barrel re-exports this file, so importing it here closed an import
// cycle (task-354, bug-345).
import { registerCapabilitiesResource } from './capabilities-resource';
import { registerRolePrompts } from './prompt';
import { registerReadOnlyResources } from './read-only-resources';
import { registerSessionContextResource } from './session-resource';
import { registerCoreTools } from './tools';
import { withBareErrorMessages } from './wire-errors';

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
  /**
   * The environment a Tool call's agent context reads — the environment markers, the launcher variable and
   * `WINGFOIL_AGENT_MODEL` (`spec-018` §1.2, §2.3–§2.4); defaults to `process.env`. A test passes its own, so no
   * case depends on the environment it runs in.
   */
  readonly env?: Readonly<Record<string, string | undefined>>;
}

/** The `McpServer` whose `connect` connects through {@link withBareErrorMessages} (`bug-034`). */
class BareErrorMcpServer extends McpServer {
  override async connect(transport: Transport): Promise<void> {
    return super.connect(withBareErrorMessages(transport));
  }
}

/**
 * Construct the production `McpServer` and register its channel set on it (spec-014 §3): the read-only
 * Resources, the role Prompts over the given role set, the capabilities Resource, and the Memory Tools. Pure and
 * synchronous — no transport, no stdio, no filesystem read, no process side effects (spec-014 §2: "no
 * I/O at construction time beyond wiring handlers"); the role set arrives already read, and every
 * handler resolves the root and reads the project per request. So a test can connect it over the SDK's
 * in-memory transport and drive it with a real `Client`.
 */
export function createMcpServer(options: McpServerOptions): McpServer {
  const server = new BareErrorMcpServer({
    name: options.name ?? 'wingfoil',
    version: options.version ?? '0.0.0',
  });
  registerReadOnlyResources(server, { resolveRoot: options.resolveRoot });
  registerRolePrompts(server, { resolveRoot: options.resolveRoot, roles: options.roles });
  registerSessionContextResource(server, { resolveRoot: options.resolveRoot, roles: options.roles });
  // task-362 (`spec-019` §6): the capabilities document of this build; it reads no project, so no `resolveRoot`.
  registerCapabilitiesResource(server);
  // The `memory` module only, until task-368 (approver ruling D6, `spec-014` §3): a staged module filter, not a
  // list of operation names (`spec-006` §4.2).
  registerCoreTools(
    server,
    CORE_MODULES.filter((module) => module.name === 'memory'),
    { resolveRoot: options.resolveRoot, buildParams: buildCoreParams, env: options.env ?? process.env },
  );
  return server;
}

/**
 * Construct the server via {@link createMcpServer} and connect it over a real `StdioServerTransport`.
 * Resolves once the transport is connected; the process then stays alive serving requests until the
 * transport closes (client disconnect / stdin EOF). The thin stdio seam is covered by
 * `test/mcp/start-mcp-server.test.ts` over a jest mock of the SDK's stdio transport, so no real stdio channel is
 * opened (see the module doc).
 */
export async function startMcpServer(options: McpServerOptions): Promise<McpServer> {
  const server = createMcpServer(options);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  return server;
}
