/**
 * `wingfoil://memory/{type}` (collection) and `wingfoil://memory/{type}/{id}` (single document)
 * Resources — task-011-mcp-resources-read-only, REQ-INT-01, spec-004-mcp-surface-contract §2.1/§2.2.
 * This REPLACES task-009-mcp-resource-fetch-latency's placeholder `wingfoil://memory/{id}` adapter
 * (that module's own doc-comment flagged itself as non-conformant and due for replacement, not
 * extension, precisely because its single `{id}` segment collides with spec-004's `{type}` segment —
 * see `src/memory/query.ts`'s `findMemoryDocumentById` doc comment for the full history). REQ-PERF-04
 * coverage is ported forward onto this conformant URI, not dropped (`test/mcp/resource-latency.test.ts`).
 *
 * The two handlers differ deliberately on **archived content** (REQ-STATE-06, the set ratified by
 * `dl-028-archived-states-excluded-from-context`, fixed by
 * `task-069-fix-archived-excluded-from-agent-context` for `bug-010-deprecated-reaches-agent-context`).
 * The **collection** withholds documents whose `status` is archived (`{deprecated, superseded}`), so
 * an agent browsing a type is never handed a replaced or retired decision as if it were current — the
 * same guarantee `wingfoil://memory/search` and default `memory search` already give. The
 * **single-document** Resource does **not** filter: addressing a document by its id is explicit
 * retrieval, which REQ-STATE-06 preserves ("remaining present on disk and in git history"). Since
 * task-171 (`dl-038` option 1) the primitives exclude archived content by default, so the collection
 * inherits its filter and the single-document Resource asks for archived content with
 * `includeArchived: true`. It is the
 * MCP counterpart of `memory search --status deprecated` on the CLI, whose own opt-in
 * (`memorySearchFn`, `src/core/index.ts`) is gated on the same `isArchivedStatus`. `draft` is not
 * archived and is withheld by neither handler; only the *context* path (`src/core/relevance.ts`)
 * excludes it as well.
 *
 * Both handlers are thin adapters over `src/memory/query.ts`'s primitives
 * (`listMemoryDocumentsByType`, `findMemoryDocumentByTypeAndId`, both new in this task) — no scanning
 * logic lives here, only URI-variable extraction, the read-only guard (`./read-only`), and MCP
 * envelope shaping. Registered directly via `McpServer.registerResource` rather than through
 * `registerCoreModules`'s `CoreModule[]` registry (`src/core/registry.ts`): no `memoryShow`/`memoryList`
 * `CoreOperation` exists in `src/core`'s production `CORE_MODULES` yet (see `src/core/index.ts`'s SCOPE
 * note). This is the same spec-006-core-domain-api §4 (Parity rule) deviation task-009 already
 * documented for this surface — acceptable because it is read-only and has no CLI/Tool counterpart to
 * keep in parity with, to be reconciled (or re-confirmed as permanent) by
 * task-030-implement-mcp-resources, which also wires a real `StdioServerTransport`/`wingfoil mcp`
 * entry point around this registrar (out of this task's scope — see this task's Execution Notes for
 * the task-011-vs-task-030 boundary).
 */
import { join } from 'path';

import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { loadMemoryYaml } from '../core';
import { findMemoryDocumentByTypeAndId, listMemoryDocumentsByType } from '../memory/query';
import { readDocument } from '../storage';

import { jsonResourceResult, refuseIfWriteIntent, resourceNotFoundError, withRefusalDetails } from './read-only';

/** Options for {@link registerMemoryResources}. */
export interface RegisterMemoryResourcesOptions {
  /** Resolves the project root each Memory Resource read is served from (an ambient concern, not a request parameter). */
  readonly resolveRoot: () => string;
}

/** spec-004 §2.1 — collection listing (frontmatter only, no `{id}`). */
export const MEMORY_COLLECTION_URI_TEMPLATE = 'wingfoil://memory/{type}';
/** spec-004 §2.1 — a single Memory document (full frontmatter + body). */
export const MEMORY_DOCUMENT_URI_TEMPLATE = 'wingfoil://memory/{type}/{id}';

/**
 * Register both Memory Resources on `server`. Reads `.wingfoil/memory.yaml` fresh on every request
 * (no server-lifetime cache) — same "no cold-start cost, no stale-config either" contract the rest of
 * `src/mcp`'s Resources already follow.
 */
export function registerMemoryResources(server: McpServer, options: RegisterMemoryResourcesOptions): void {
  const collectionTemplate = new ResourceTemplate(MEMORY_COLLECTION_URI_TEMPLATE, { list: undefined });
  server.registerResource(
    'memory.list',
    collectionTemplate,
    { description: 'Memory documents of one type, frontmatter only (read-only)' },
    (uri, variables, extra) =>
      withRefusalDetails(() => {
        refuseIfWriteIntent(extra._meta);
        const root = options.resolveRoot();
        const memoryYaml = loadMemoryYaml(root);
        // `variables.type` is typed `string | string[]` (the SDK's generic `Variables` shape), but
        // this template's `{type}` variable has no `*`/`+` explode modifier, so a match always binds
        // it to a single string (see the SDK's `UriTemplate.match`) — the `string[]` case is
        // unreachable here (mirrors task-009's own `{id}` reasoning for this same SDK behaviour).
        const type = variables.type as string;
        if (!(type in memoryYaml.types)) throw resourceNotFoundError(`memory/${type}`);

        // REQ-STATE-06 / `dl-028-archived-states-excluded-from-context` (`bug-010`): this collection is
        // an agent-facing read path, so archived documents — `{deprecated, superseded}`, per the shared
        // `isArchivedStatus` — are withheld. Since task-171 (`dl-038` option 1) the primitive withholds
        // them by default, so this call site no longer filters: omitting a filter fails closed.
        const summaries = listMemoryDocumentsByType(root, memoryYaml, type)
          .map(({ id, title, status, tags }) => ({
            id,
            title,
            status,
            tags,
          }));

        return jsonResourceResult(uri, summaries);
      }),
  );

  const documentTemplate = new ResourceTemplate(MEMORY_DOCUMENT_URI_TEMPLATE, { list: undefined });
  server.registerResource(
    'memory.show',
    documentTemplate,
    { description: 'one Memory document, full content + metadata (read-only)' },
    (uri, variables, extra) =>
      withRefusalDetails(() => {
        refuseIfWriteIntent(extra._meta);
        const root = options.resolveRoot();
        const memoryYaml = loadMemoryYaml(root);
        const type = variables.type as string;
        const id = variables.id as string;
        if (!(type in memoryYaml.types)) throw resourceNotFoundError(`memory/${type}/${id}`);

        // `includeArchived: true`, said here on purpose (task-171, `dl-038` option 1): REQ-STATE-06 keeps
        // an archived document "present on disk and in git history", and this Resource is how an agent
        // retrieves one explicitly.
        const doc = findMemoryDocumentByTypeAndId(root, memoryYaml, type, id, { includeArchived: true });
        if (!doc) throw resourceNotFoundError(`memory/${type}/${id}`);

        // spec-004 §2.2 wants the *full file content* (frontmatter + body), not the re-serialized
        // parsed frontmatter `loadMemoryDocumentSummary` already split apart for the scan — so this
        // re-reads the resolved path's raw bytes via `storage.readDocument` (still a read primitive
        // reuse, not a reimplemented scan: the scan itself already happened inside
        // `findMemoryDocumentByTypeAndId`).
        const fullText = readDocument(join(root, doc.path));

        // spec-004 §2.2 depicts `metadata` as a sibling of `uri`/`mimeType`/`text`, i.e. flat on the
        // result — not nested inside a `contents[]` entry (whose shape the real MCP wire schema fixes
        // to `{uri, mimeType, text|blob, _meta?}`, `ReadResourceResultSchema`'s `contents` union in the
        // SDK's `types.d.ts`). The top-level `ReadResourceResultSchema` object itself is passthrough
        // (`z.core.$loose`), so this extra top-level `metadata` key is preserved end to end (server ->
        // wire -> client parse) without needing a non-standard content shape. Built via an
        // untyped-at-the-literal `result` variable (assigned, not returned directly) so TypeScript's
        // excess-property check — which only applies to object literals in a contextually-typed
        // position — never triggers on this extra key.
        const result = {
          contents: [
            {
              uri: uri.toString(),
              mimeType: 'text/markdown',
              text: fullText,
            },
          ],
          metadata: {
            id: doc.frontmatter.id,
            type: doc.frontmatter.type,
            status: doc.frontmatter.status,
            title: doc.frontmatter.title,
          },
        };
        return result;
      }),
  );
}
