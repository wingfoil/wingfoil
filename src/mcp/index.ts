/**
 * `mcp-server` module — agent interface (MCP over stdio, `@modelcontextprotocol/sdk`); Resources, Prompts, Tools.
 * Path is `src/mcp` per `dna.yaml`'s module entry (`name: mcp-server`, `path: src/mcp`).
 *
 * task-006-dual-interface-shared-core adds the thin adapter (spec-006 §2, spec-004): `registerCoreModules`
 * derives every MCP Tool (mutating) and Resource (read-only) from the same `CoreModule[]` registry
 * `src/cli` builds its commands from (`src/core/index.ts`'s `CORE_MODULES`), with no business logic
 * of its own.
 *
 * task-011-mcp-resources-read-only adds the spec-004-mcp-surface-contract §2-conformant Resources
 * channel (REQ-INT-01 / REQ-SEC-05): `registerMemoryResources` (`wingfoil://memory/{type}`,
 * `wingfoil://memory/{type}/{id}` — REPLACING task-009-mcp-resource-fetch-latency's placeholder
 * `wingfoil://memory/{id}` adapter), `registerDnaResources` (`wingfoil://dna`, `wingfoil://dna/{section}`),
 * `registerWorkflowResources` (`wingfoil://workflows`, `wingfoil://workflows/{name}`; task-239 adds
 * `registerWorkflowStateResources`, `wingfoil://workflows/-/next` and `-/status`), and
 * `registerWriteRefusalHandler` (the structural `resources/write` refusal, spec-004 §2.3).
 * `registerReadOnlyResources` wires all five together — the one call a future production entry point
 * (`task-030-implement-mcp-resources`'s `StdioServerTransport`/`wingfoil mcp` command, out of this
 * task's scope) needs alongside `registerCoreModules`. See `./read-only.ts` for the shared
 * write-refusal/not-found conventions every one of these Resources follows.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/** This module's `dna.yaml` name (`mcp-server`) — the stable identifier surfaces and tests key it by. */
export const MODULE_NAME = 'mcp-server' as const;

export { registerCoreModules, deriveMcpToolName, deriveMcpResourceUri } from './registrar';
export type { RegisterCoreModulesOptions } from './registrar';

export {
  registerMemoryResources,
  MEMORY_COLLECTION_URI_TEMPLATE,
  MEMORY_DOCUMENT_URI_TEMPLATE,
} from './memory-resource';
export type { RegisterMemoryResourcesOptions } from './memory-resource';

export { registerDnaResources, DNA_WHOLE_URI, DNA_SECTION_URI_TEMPLATE } from './dna-resource';
export type { RegisterDnaResourcesOptions } from './dna-resource';

export {
  registerWorkflowResources,
  registerWorkflowStateResources,
  WORKFLOWS_COLLECTION_URI,
  WORKFLOW_DOCUMENT_URI_TEMPLATE,
  WORKFLOW_NEXT_URI,
  WORKFLOW_STATUS_URI,
} from './workflow-resource';
export type { RegisterWorkflowResourcesOptions } from './workflow-resource';

export {
  registerWriteRefusalHandler,
  refuseIfWriteIntent,
  resourceNotFoundError,
  WRITE_REFUSAL_MESSAGE,
  WRITE_INTENT_META_KEY,
} from './read-only';

// task-039-mcp-prompts-role-based-infra adds the spec-004 §3 Prompts channel (REQ-INT-02): one
// `{role}-session` prompt per `dna.yaml` role, embedding that role's directives, resolved per
// request. Deliberately NOT folded into `registerReadOnlyResources` below (that call is spec-004 §2's
// Resources bundle); `createMcpServer` registers it alongside that bundle since
// `task-058-mcp-prompts-role-based` (P5.2.2, spec-014 §3). See `./prompt.ts`.
export { registerRolePrompts, roleSessionPromptName } from './prompt';
export type { RegisterRolePromptsOptions } from './prompt';

// task-236: the same execution context as the `{role}-session` Prompt with `element` and `state`, served also
// as the read-only Resource template `wingfoil://session/{role}/{element}/{state}` (spec-004 §2.1), because an
// agent CLI may let its model read Resources but not get Prompts. See `./session-resource.ts`.
export { registerSessionContextResource, SESSION_CONTEXT_URI_TEMPLATE } from './session-resource';
export type { RegisterSessionContextResourceOptions } from './session-resource';

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
 * `registerCoreModules`/`CORE_MODULES` — a caller building a real server still calls that separately
 * for the (today, zero) Tools/legacy-shaped Resources it derives from `src/core`.
 */
export function registerReadOnlyResources(server: McpServer, options: RegisterReadOnlyResourcesOptions): void {
  registerWriteRefusalHandler(server);
  registerMemoryResources(server, options);
  registerDnaResources(server, options);
  registerWorkflowResources(server, options);
  registerWorkflowStateResources(server, options);
}

// The production stdio entry point (task-030-implement-mcp-resources, spec-014-mcp-server-entry-point):
// `createMcpServer` builds a real `McpServer` with the read-only Resources and Prompts channels above wired on,
// `startMcpServer` connects it over `StdioServerTransport`. Exported here so the `bin`/`wingfoil mcp`
// seam imports the whole `src/mcp` surface from one module.
export { createMcpServer, startMcpServer } from './server';
export type { McpServerOptions } from './server';
