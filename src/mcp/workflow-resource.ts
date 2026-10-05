/**
 * `wingfoil://workflows` (collection) and `wingfoil://workflows/{name}` (a single workflow
 * definition) Resources — task-011-mcp-resources-read-only, REQ-INT-01,
 * spec-004-mcp-surface-contract §2.1. Distinct from `registerCoreModules`'s existing
 * `wingfoil://workflow/list` Resource (task-006-dual-interface-shared-core, the generic
 * `wingfoil://{module}/{verb}` transform of the `workflowList` `CoreOperation`) — both coexist; this
 * module adds the spec-004 §2.1-conformant plural `wingfoil://workflows` addressing plus
 * per-workflow single-document addressing, neither of which `registerCoreModules`'s mechanical,
 * zero-argument URI derivation can produce (spec-006 §2's `CoreOperation` shape has no
 * sub-resource/parameter metadata — see `src/mcp/registrar.ts`'s own doc comment).
 *
 * A workflow's `name` (Layer 2 `Workflow.name`, spec-003-workflows-yaml-schema) is the addressing key
 * — both `kind: main` and `kind: sub` workflows are addressable through the same URI form; nothing
 * here distinguishes them beyond what each workflow's own `kind` field already reports.
 *
 * Registered directly via `McpServer.registerResource`, not through `registerCoreModules`'s
 * `CoreModule[]` registry — no `workflowShow` `CoreOperation` exists yet; same
 * spec-006-core-domain-api §4 parity deviation `memory-resource.ts`/`dna-resource.ts` document for
 * their own Resources, for the same reason (task-030-implement-mcp-resources' scope).
 */
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { loadWorkflowsYaml } from '../core';

import { jsonResourceResult, refuseIfWriteIntent, resourceNotFoundError, withRefusalDetails } from './read-only';

/** Options for {@link registerWorkflowResources}. */
export interface RegisterWorkflowResourcesOptions {
  /** Resolves the project root each Workflow Resource read is served from (an ambient concern, not a request parameter). */
  readonly resolveRoot: () => string;
}

/** spec-004 §2.1 — every loaded workflow (main + sub), summary only. */
export const WORKFLOWS_COLLECTION_URI = 'wingfoil://workflows';
/** spec-004 §2.1 — one workflow definition, by `name` (Layer 2 `Workflow.name`). */
export const WORKFLOW_DOCUMENT_URI_TEMPLATE = 'wingfoil://workflows/{name}';

/**
 * Register both Workflow Resources on `server`. Reads `.wingfoil/workflows.yaml` + every included
 * Layer-2 file fresh on every request (no server-lifetime cache), matching every other Resource this
 * task registers.
 */
export function registerWorkflowResources(server: McpServer, options: RegisterWorkflowResourcesOptions): void {
  server.registerResource(
    'workflows.list',
    WORKFLOWS_COLLECTION_URI,
    { description: 'every loaded workflow definition, summary only (read-only)' },
    (uri, extra) =>
      withRefusalDetails(() => {
        refuseIfWriteIntent(extra._meta);
        const root = options.resolveRoot();
        const { workflows } = loadWorkflowsYaml(root);
        // Deterministic order (REQ-SYS-07): sorted by `name`, independent of `include` list order.
        const summaries = [...workflows]
          .map(({ name, kind, description }) => ({ name, kind, description }))
          .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

        return jsonResourceResult(uri, summaries);
      }),
  );

  const documentTemplate = new ResourceTemplate(WORKFLOW_DOCUMENT_URI_TEMPLATE, { list: undefined });
  server.registerResource(
    'workflows.show',
    documentTemplate,
    { description: 'one workflow definition, full content (read-only)' },
    (uri, variables, extra) =>
      withRefusalDetails(() => {
        refuseIfWriteIntent(extra._meta);
        const root = options.resolveRoot();
        const { workflows } = loadWorkflowsYaml(root);
        // `variables.name` is typed `string | string[]` (see `memory-resource.ts`'s identical note on
        // `{type}`/`{id}`) — this template's `{name}` has no explode modifier, so it is always a single
        // string in practice.
        const name = variables.name as string;
        const workflow = workflows.find((candidate) => candidate.name === name);
        if (!workflow) throw resourceNotFoundError(`workflows/${name}`);

        return jsonResourceResult(uri, workflow);
      }),
  );
}
