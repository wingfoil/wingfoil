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
 * `CoreModule[]` registry — `workflowList` / `workflowShow` (task-204) answer from `HEAD` with another
 * payload, while these keep theirs and the working tree in v0.3 (spec-017 §9); same
 * spec-006-core-domain-api §4 parity deviation `memory-resource.ts`/`dna-resource.ts` document for
 * their own Resources, for the same reason (task-030-implement-mcp-resources' scope).
 */
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { loadWorkflowsYaml, workflowNextAtHead, workflowStatusAtHead, type CoreResult } from '../core';

import { coreResultResource, jsonResourceResult, refuseIfWriteIntent, resourceNotFoundError, withRefusalDetails } from './read-only';

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

/** spec-017 §9 — the active instance's next step: `wingfoil workflow next --format json`'s `NextResult`, at `HEAD`. */
export const WORKFLOW_NEXT_URI = 'wingfoil://workflows/-/next';
/** spec-017 §9 — every open instance: `wingfoil workflow status --format json`'s `StatusResult`, at `HEAD`. */
export const WORKFLOW_STATUS_URI = 'wingfoil://workflows/-/status';

/**
 * Register the two workflow-state Resources on `server` (task-239; `spec-017` §9, ruling R12; `spec-004` §2.1).
 * They cannot collide with `wingfoil://workflows/{name}`: their second segment is `-`, which no workflow name
 * can be (`spec-003` names start with a letter), and they have a third segment, which the single-segment
 * `{name}` template never matches — so a workflow named `next` stays `wingfoil://workflows/next`. Each read runs the core
 * function the CLI command runs with no operand — `workflowNextAtHead` / `workflowStatusAtHead`, the
 * deduction at `HEAD` — and returns its value serialized as the CLI's `--format json` prints it (without the
 * final newline). Nothing is cached: every read deduces again. A refusal is a failed read carrying the CLI's
 * message and details (spec-004 §4.3 item 4), whether core returns it (`CoreResult.error`, through
 * `coreResultResource`) or a loader throws it (`withRefusalDetails`); a read carrying a write intent is refused
 * first (spec-004 §2.3). With no operand neither function returns a `CoreResult.error` today (only an
 * unresolvable `<ref>` does, `spec-017` §10), so the first path is the shared helper's, tested on its own.
 */
export function registerWorkflowStateResources(server: McpServer, options: RegisterWorkflowResourcesOptions): void {
  const register = (name: string, uri: string, description: string, read: (root: string) => CoreResult<unknown>): void => {
    server.registerResource(name, uri, { description }, (readUri, extra) =>
      withRefusalDetails(() => {
        refuseIfWriteIntent(extra._meta);
        return coreResultResource(readUri, read(options.resolveRoot()));
      }),
    );
  };
  register('workflows.next', WORKFLOW_NEXT_URI, 'the next step of the active workflow instance, as committed at HEAD (read-only)', (root) =>
    workflowNextAtHead(root),
  );
  register('workflows.status', WORKFLOW_STATUS_URI, 'every open workflow instance, its pending approvals and the elements waiting at a gate, as committed at HEAD (read-only)', (root) =>
    workflowStatusAtHead(root),
  );
}
