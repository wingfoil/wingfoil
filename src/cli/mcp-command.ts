/**
 * `wingfoil mcp` command handler (task-030-implement-mcp-resources, P5.2.1,
 * spec-014-mcp-server-entry-point §1). `mcp` is a SPECIAL command: it does not wrap a single `src/core`
 * `CoreOperation` (so it is not a `CORE_MODULES` noun-verb op) — it owns a long-running process
 * lifecycle, starting the production MCP server over stdio. It is wired directly onto the program
 * (see ./program.ts), exactly like `wingfoil init` (task-029).
 *
 * `runMcp` owns the spec-014 §1 pre-flight: resolve the project root, refuse a root with no
 * `.wingfoil/` (`bug-035`), and read the DNA role set the Prompts channel serves for the server's whole
 * life (`dl-049` (b), task-174). On any failure it emits the standard `error: <reason>` line and exits
 * `1` (a user/logic error) WITHOUT starting a partially-wired server. The side-effecting server start (`startMcpServer`, which opens a
 * real `StdioServerTransport`) is injected as `deps.start`, so this whole pre-flight is unit-testable
 * without ever opening a real stdio channel against a repo — the same seam `init-command.ts`'s
 * injectable `runInit` uses.
 */
import { loadDnaRoleSet } from '../core';
import { errorDetails } from '../core/error-details';
import { startMcpServer } from '../mcp/server';

import { emitError } from './error';
import { exitWith } from './exit';
import { isValidFormat, type OutputFormat } from './output';

/** The options `runMcp` acts on (injected so the resolve-root/error path needs no real stdio server). */
export interface McpCliDeps {
  /** Resolve the project (git) root; throws when the cwd is not inside an initialized WingFoil project. */
  readonly resolveRoot: () => string;
  /** The CLI version to advertise as the MCP server's identity `version` (read from `package.json`). */
  readonly version: string;
  /** The output format for the pre-flight error path; defaults to `console`. */
  readonly format?: OutputFormat;
  /** Start the server; defaults to {@link startMcpServer} (overridden in tests to avoid real stdio). */
  readonly start?: (options: {
    resolveRoot: () => string;
    roles: readonly string[];
    name: string;
    version: string;
  }) => Promise<unknown>;
}

/**
 * Execute `wingfoil mcp`. The pre-flight runs up front, fail-fast, and never starts the server on a
 * failure — each one emits `error: <reason>` on stderr and exits `1`:
 *
 * 1. resolve the project root once (no git root);
 * 2. read the DNA role set (`loadDnaRoleSet`): refused when the root has no `.wingfoil/`, with the
 *    shared not-initialized message, which names no path (`bug-035`), or when `dna.yaml` cannot be
 *    loaded, with the loader's reason and details. This is the one start-time read spec-014 §2
 *    allows (`dl-049` (b)); `createMcpServer` itself still reads nothing.
 *
 * It then hands the server start a closure returning the already-resolved root and the role set. On
 * success it does not exit — the server runs over stdio until the transport closes, and stdout carries
 * only the protocol.
 */
export async function runMcp(deps: McpCliDeps): Promise<void> {
  const format: OutputFormat = deps.format && isValidFormat(deps.format) ? deps.format : 'console';

  let root: string;
  try {
    root = deps.resolveRoot();
  } catch (error) {
    emitError(error instanceof Error ? error.message : String(error), { format });
    exitWith(1);
    return;
  }

  const roles = loadDnaRoleSet(root);
  if (!roles.ok) {
    emitError(roles.error.message, { format, details: errorDetails(roles.error) });
    exitWith(1);
    return;
  }

  const start = deps.start ?? startMcpServer;
  await start({ resolveRoot: () => root, roles: roles.value, name: 'wingfoil', version: deps.version });
}
