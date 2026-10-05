/**
 * `wingfoil://dna` (whole file) and `wingfoil://dna/{section}` (one top-level key) Resources —
 * task-011-mcp-resources-read-only, REQ-INT-01, spec-004-mcp-surface-contract §2.1. Distinct from
 * `registerCoreModules`'s existing, mechanically-derived `wingfoil://dna/show` Resource
 * (task-006-dual-interface-shared-core): that URI is `registerCoreModules`'s generic
 * `wingfoil://{module}/{verb}` transform of the `dnaShow` `CoreOperation` and is left untouched here —
 * this module adds the spec-004 §2.1-conformant addressing alongside it (both can and do coexist on
 * the same server; they are different URIs, never registered twice for one address).
 *
 * `{section}` is any top-level key of the parsed `dna.yaml` document (`version`, `project`, `modules`,
 * `stacks`, `team`, `paths`) — spec-002-dna-yaml-schema's own top-level shape, not a hand-maintained
 * allowlist here, so a future DNA schema field is addressable the moment it exists in `dna.yaml`
 * without a change to this module.
 *
 * Registered directly via `McpServer.registerResource`, not through `registerCoreModules`'s
 * `CoreModule[]` registry — no `dnaSection`/`dnaShowFull` `CoreOperation` exists yet; same
 * spec-006-core-domain-api §4 parity deviation `memory-resource.ts` documents for its own two
 * Resources, for the same reason (task-030-implement-mcp-resources' scope, not this task's).
 */
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { loadDnaYaml } from '../core';

import { jsonResourceResult, refuseIfWriteIntent, resourceNotFoundError, withRefusalDetails } from './read-only';

/** Options for {@link registerDnaResources}. */
export interface RegisterDnaResourcesOptions {
  /** Resolves the project root each DNA Resource read is served from (an ambient concern, not a request parameter). */
  readonly resolveRoot: () => string;
}

/** spec-004 §2.1 — the whole `dna.yaml` document. */
export const DNA_WHOLE_URI = 'wingfoil://dna';
/** spec-004 §2.1 — one top-level `dna.yaml` section (`team`, `paths`, `modules`, `stacks`, ...). */
export const DNA_SECTION_URI_TEMPLATE = 'wingfoil://dna/{section}';

/**
 * Register both DNA Resources on `server`. Reads `.wingfoil/dna.yaml` fresh on every request (no
 * server-lifetime cache), matching every other Resource this task registers.
 */
export function registerDnaResources(server: McpServer, options: RegisterDnaResourcesOptions): void {
  server.registerResource(
    'dna.read',
    DNA_WHOLE_URI,
    { description: 'the whole dna.yaml document (read-only)' },
    (uri, extra) =>
      withRefusalDetails(() => {
        refuseIfWriteIntent(extra._meta);
        const root = options.resolveRoot();
        const dna = loadDnaYaml(root);
        return jsonResourceResult(uri, dna);
      }),
  );

  const sectionTemplate = new ResourceTemplate(DNA_SECTION_URI_TEMPLATE, { list: undefined });
  server.registerResource(
    'dna.section',
    sectionTemplate,
    { description: 'one top-level dna.yaml section (read-only)' },
    (uri, variables, extra) =>
      withRefusalDetails(() => {
        refuseIfWriteIntent(extra._meta);
        const root = options.resolveRoot();
        const dna = loadDnaYaml(root) as Record<string, unknown>;
        // `variables.section` is typed `string | string[]` (see `memory-resource.ts`'s identical note
        // on `{type}`/`{id}`) — this template's `{section}` has no explode modifier, so it is always a
        // single string in practice.
        const section = variables.section as string;
        if (!(section in dna)) throw resourceNotFoundError(`dna/${section}`);

        return jsonResourceResult(uri, dna[section]);
      }),
  );
}
