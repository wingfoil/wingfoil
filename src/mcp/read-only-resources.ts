/**
 * The spec-004 §2 read-only Resources bundle: {@link registerReadOnlyResources} wires the Memory, DNA and Workflow
 * Resources and the structural `resources/write` refusal onto a server in one call.
 *
 * task-354 (bug-345) moved it here, verbatim, from the `src/mcp` barrel (`./index.ts`): `./server.ts` imports it
 * from this leaf module, so the barrel's re-export of `./server.ts` no longer closes an import cycle. The barrel
 * still re-exports both names.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { registerDnaResources } from './dna-resource';
import { registerMemoryResources } from './memory-resource';
import { registerWriteRefusalHandler } from './read-only';
import { registerWorkflowResources, registerWorkflowStateResources } from './workflow-resource';

/** Options for {@link registerReadOnlyResources}. */
export interface RegisterReadOnlyResourcesOptions {
  /** Resolves the project root each Resource read is served from (an ambient concern, not a request parameter). */
  readonly resolveRoot: () => string;
}

/**
 * Wire the full spec-004 §2 read-only Resources channel onto `server` in one call: the Memory, DNA,
 * and Workflow Resources — the two workflow-state Resources `wingfoil://workflows/-/next` and `-/status`
 * included (task-239, `spec-017` §9) — plus the structural `resources/write` refusal. Deliberately does not touch
 * `registerCoreModules`/`CORE_MODULES`; `createMcpServer` does not call it either (see `./registrar.ts`).
 */
export function registerReadOnlyResources(server: McpServer, options: RegisterReadOnlyResourcesOptions): void {
  registerWriteRefusalHandler(server);
  registerMemoryResources(server, options);
  registerDnaResources(server, options);
  registerWorkflowResources(server, options);
  registerWorkflowStateResources(server, options);
}
