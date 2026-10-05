/**
 * The MCP adapter's Tool/Resource registrar (spec-006-core-domain-api §2/§4,
 * spec-004-mcp-surface-contract — task-006). `registerCoreModules` is the "Tool/Resource
 * registrar" spec-006 §4.1 refers to: it iterates the exact same `enumerateOperations` order as
 * `src/cli`'s registrar, and for each operation registers it as **either** an MCP Tool (`mutates:
 * true`) **or** an MCP Resource (`mutates: false`) — never both, and never a hardcoded allow/deny
 * list of operation names (§4.2). This is the structural half of REQ-SEC-05 ("MCP Resources are
 * read-only — mutations only via validated MCP Tools"): a `mutates: true` operation is
 * *structurally incapable* of being registered as a Resource by this function, and vice versa.
 *
 * Naming: Tool names use the dot form `{module}.{verb}` and Resource URIs use the `wingfoil://`
 * scheme, both per spec-004 (§4.1, §2.1) — spec-004 is the spec explicitly scoped to `src/mcp`
 * (`scope: "src/mcp"`), so it is authoritative for the actual wire-visible names here, ahead of
 * spec-006 §5's own (looser, `src/core`-scoped) naming note, which uses a snake_case Tool-name
 * form (`memory_approve`) that this task deliberately does not follow — see task-006's Execution
 * Notes for the full reasoning on that spec-004/spec-006 naming discrepancy.
 *
 * Resource URIs today are the mechanical, zero-argument `wingfoil://{module}/{verb}` form — spec-004
 * §2.1's fuller scheme (`wingfoil://memory/{type}/{id}`, `wingfoil://dna/{section}`, ...) adds
 * sub-resource addressing that today's `CoreOperation` shape (spec-006 §2: just `{name, mutates,
 * fn}`, no parameter metadata) cannot mechanically derive; that richer addressing is deferred to
 * whichever feature task (018-030) first registers an operation that needs it.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { ErrorDetail } from '../core/error-details';
import { errorDetails } from '../core/error-details';
import type { CoreModule, ParamsBuilder } from '../core/registry';
import { deriveVerb, enumerateOperations } from '../core/registry';

import { readRefusalError } from './read-only';

/** Ambient dependencies {@link registerCoreModules} needs: how to resolve the project root and how to shape each operation's params. */
export interface RegisterCoreModulesOptions {
  /** Resolves the project root a core call is served from (an ambient concern, not a Tool/Resource argument). */
  readonly resolveRoot: () => string;
  /** Turns a `ParamsContext` into one operation's typed params (`../core/registry.ts`'s {@link ParamsBuilder}). */
  readonly buildParams: ParamsBuilder;
}

/**
 * `{module}.{verb}` — spec-004 §4.1's Tool naming convention (mechanical transform of the CLI verb).
 * An empty `verb` (`deriveVerb`'s flat/no-verb form, task-028-implement-paths-category) collapses to
 * the bare module name — there is no verb segment to append a `.` before.
 */
export function deriveMcpToolName(moduleName: string, verb: string): string {
  return verb ? `${moduleName}.${verb}` : moduleName;
}

/**
 * `wingfoil://{module}/{verb}` — spec-004 §2.1's URI scheme, applied mechanically (see module doc).
 * Same empty-verb collapse as {@link deriveMcpToolName}: `wingfoil://{module}`, not a trailing-slash
 * `wingfoil://{module}/`.
 */
export function deriveMcpResourceUri(moduleName: string, verb: string): string {
  return verb ? `wingfoil://${moduleName}/${verb}` : `wingfoil://${moduleName}`;
}

/**
 * Register every operation in `modules` onto `server`: `mutates: true` as a Tool, `mutates: false`
 * as a Resource. Each handler wraps exactly one core call (spec-006 §2) and serializes its
 * `CoreResult` — a successful value as JSON text; a `CoreResult.error` as a Tool `isError: true`
 * response (spec-004 §4.3's "rejected identically to the CLI path") or, for a Resource read (which
 * has no `isError` flag in the MCP protocol), a thrown error surfaced as a protocol-level read
 * failure (spec-004 §2.2's "resource not found"-style refusal, generalized to any read failure).
 * Either way the error's operator-facing details (`../core/error-details.ts`) travel with it — as the
 * read error's JSON-RPC `error.data.details`, or as the tool result's `structuredContent` (task-130).
 * A successful Tool result carries the operation's `CoreResult.warnings`, when it has any, as
 * `structuredContent: {value, warnings}` (task-169). A Resource read has no such field: no read-only
 * operation returns warnings today, so a Resource's warnings are not rendered. Note that the shipped
 * `wingfoil mcp` server (`./server.ts`) does not call this function and registers no Tools (P5.2.3,
 * v0.4), so the Tool warning field is reachable only where this registrar is used; when Tools ship,
 * `directive.assign` and the four `dna` write Tools (task-193) also need `force` as a Tool input
 * (`spec-004` §4.3).
 */
export function registerCoreModules(
  server: McpServer,
  modules: readonly CoreModule[],
  options: RegisterCoreModulesOptions,
): void {
  // Declare both channels (spec-004 §1: Resources and Tools are fixed channel types of the MCP
  // surface), even when `modules` has zero operations of one kind. Declaring a capability installs no
  // request handler, though: the SDK installs `tools/list` / `tools/call` on the first `registerTool`
  // (and the Resources handlers on the first `registerResource`). So with zero `mutates: true`
  // operations in the `modules` passed (as in the parity test's read-only fixtures), `initialize`
  // advertises `tools` while `tools/list` still answers JSON-RPC -32601 "Method not found" (task-174
  // corrected this comment, which claimed the opposite; `test/core/parity.test.ts` documents the same
  // and skips the call). The production server does not use this registrar; it answers `tools/list`
  // with an empty list itself (`./server.ts`, `bug-151`).
  server.server.registerCapabilities({ tools: {}, resources: {} });

  for (const { module, operation } of enumerateOperations(modules)) {
    const verb = deriveVerb(module.name, operation.name);

    const callCore = async (): Promise<
      | { ok: true; value: unknown; text: string; warnings: readonly string[] }
      | { ok: false; message: string; details: readonly ErrorDetail[] }
    > => {
      const params = options.buildParams({
        moduleName: module.name,
        operationName: operation.name,
        root: options.resolveRoot(),
      });
      const result = await operation.fn(params);
      return result.ok
        ? { ok: true, value: result.value, text: JSON.stringify(result.value), warnings: result.warnings ?? [] }
        : { ok: false, message: result.error.message, details: errorDetails(result.error) };
    };

    if (operation.mutates) {
      const toolName = deriveMcpToolName(module.name, verb);
      server.registerTool(toolName, { description: `${module.name} ${verb} (mutating)` }, async () => {
        const outcome = await callCore();
        if (outcome.ok) {
          // The success-warning channel (task-169, `dl-062`): a Tool has no stderr, so the warnings ride
          // as `structuredContent: {value, warnings}` — the success twin of the refusal's `{error,
          // details}` below. The text stays the payload's JSON, so a client reading only `content` sees
          // what it always saw. No warnings, no `structuredContent`.
          return {
            content: [{ type: 'text', text: outcome.text }],
            ...(outcome.warnings.length > 0 ? { structuredContent: { value: outcome.value, warnings: outcome.warnings } } : {}),
          };
        }
        // A tool error is a RESULT, not a JSON-RPC error, so it has no `error.data`: the details ride as
        // `structuredContent`, in the CLI's `--format json` error shape (task-130, `dl-055` option 1).
        // The text stays the bare reason, identical to the CLI's (spec-004 §4.3).
        return {
          content: [{ type: 'text', text: outcome.message }],
          isError: true,
          ...(outcome.details.length > 0 ? { structuredContent: { error: outcome.message, details: outcome.details } } : {}),
        };
      });
    } else {
      const uri = deriveMcpResourceUri(module.name, verb);
      const resourceName = deriveMcpToolName(module.name, verb);
      server.registerResource(
        resourceName,
        uri,
        { description: `${module.name} ${verb} (read-only)` },
        async (readUri) => {
          const outcome = await callCore();
          if (outcome.ok) {
            return { contents: [{ uri: readUri.toString(), mimeType: 'application/json', text: outcome.text }] };
          }
          // A failed read IS a JSON-RPC error; the SDK forwards an `Error`'s `data` as `error.data`
          // (task-130, `dl-055` option 1). No details, no `data` — the shape it always had.
          throw readRefusalError(outcome.message, outcome.details);
        },
      );
    }
  }
}
