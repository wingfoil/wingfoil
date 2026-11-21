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
 * `registerCoreModules` derives the `wingfoil://{module}/{verb}` Resource URIs (a URI template
 * `wingfoil://{module}/{verb}/{name}` for an operation with a required positional), the `{module}.{verb}`
 * Tool names and each Tool's input schema from the operations' parameter metadata in `CORE_MODULES`
 * (task-364, `dl-040` option 1, `spec-004` §2.1 and §4.3); its Tools half is `registerCoreTools`
 * (`./tools.ts`, task-367). It backs the parity and channel-enumeration harness of REQ-SEC-05
 * (`test/core/parity.test.ts`, `test/mcp/helpers/channel-enumeration.ts`) and the Tool set
 * `test/docs/mcp-surface-parity.test.ts` compares with spec-004 §4.1; the `wingfoil mcp` server
 * (`createMcpServer`) does not call it and serves none of its URIs: it serves the Memory Tools through
 * `registerCoreTools` (`spec-014` §3). The Resources the server serves are `wingfoil://dna`, `wingfoil://workflows`,
 * `wingfoil://workflows/-/next` and `wingfoil://workflows/-/status`, with the templates
 * `wingfoil://memory/{type}`, `wingfoil://memory/{type}/{id}`, `wingfoil://dna/{section}`,
 * `wingfoil://workflows/{name}` and `wingfoil://session/{role}/{element}/{state}`, registered by
 * `registerMemoryResources`, `registerDnaResources`, `registerWorkflowResources`,
 * `registerWorkflowStateResources` (through `registerReadOnlyResources`) and
 * `registerSessionContextResource`.
 */
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { errorDetails } from '../core/error-details';
import type { CoreModule, CoreOperation, CorePositional, ParamsBuilder, ParamsContext } from '../core/registry';
import type { CoreResult } from '../core/types';
import { deriveVerb, enumerateOperations } from '../core/registry';

import { readRefusalError, withWarnings } from './read-only';
import { deriveMcpToolName, registerCoreTools } from './tools';

export { deriveMcpToolName } from './tools';

/** Ambient dependencies {@link registerCoreModules} needs: how to resolve the project root and how to shape each operation's params. */
export interface RegisterCoreModulesOptions {
  /** Resolves the project root a core call is served from (an ambient concern, not a Tool/Resource argument). */
  readonly resolveRoot: () => string;
  /** Turns a `ParamsContext` into one operation's typed params (`../core/registry.ts`'s {@link ParamsBuilder}). */
  readonly buildParams: ParamsBuilder;
  /** The environment a Tool call's agent context reads (`./tools.ts`, `spec-018` §1.2); defaults to `process.env`. */
  readonly env?: Readonly<Record<string, string | undefined>>;
}

/**
 * `wingfoil://{module}/{verb}` — spec-004 §2.1's URI scheme, applied mechanically (see module doc).
 * Same empty-verb collapse as {@link deriveMcpToolName}: `wingfoil://{module}`, not a trailing-slash
 * `wingfoil://{module}/`. A REQUIRED `positional` adds one template segment named after it
 * (`wingfoil://memory/history/{id}`, `spec-006` §3, task-364 design D7); an optional one adds nothing.
 */
export function deriveMcpResourceUri(moduleName: string, verb: string, positional?: CorePositional): string {
  const base = verb ? `wingfoil://${moduleName}/${verb}` : `wingfoil://${moduleName}`;
  return positional?.required === true ? `${base}/{${positional.name}}` : base;
}

/**
 * The template variable `name` of a read, percent-decoded (design D8: a run id travels as one encoded
 * segment). The SDK types a variable `string | string[]`; a simple `{name}` is always one string.
 * Malformed encoding is a failed read naming the parameter.
 */
function templateVariable(variables: Readonly<Record<string, string | string[]>>, name: string): string {
  // The SDK matched the template, so the variable is present; `String` of a one-string value is the value.
  const text = String(variables[name]);
  try {
    return decodeURIComponent(text);
  } catch {
    throw readRefusalError(`invalid argument: ${name} must be percent-encoded`, []);
  }
}

/**
 * Register every operation in `modules` onto `server`: `mutates: true` as a Tool, `mutates: false`
 * as a Resource. The Tools are {@link registerCoreTools}'s (`./tools.ts`, task-367): named
 * `{module}.{verb}`, their input schemas derived from the operations' parameter metadata, each call
 * checked by `toolArgumentsToParams`, run as an agent context (`spec-018` §1.2) inside one warning sink,
 * a refusal an `isError` result whose `structuredContent` is the CLI's `--format json` error object plus
 * the warnings, a success's warnings `structuredContent: {value, warnings}`. This function registers the
 * Resources: each read wraps exactly one core call (spec-006 §2); a successful value is JSON text, with
 * the operation's `CoreResult.warnings` as a top-level `warnings` array beside `contents` (task-195,
 * `bug-231`: since task-171 a read-only scan does report the documents it left out); a `CoreResult.error`
 * — a Resource read has no `isError` flag in the MCP protocol — is a thrown error surfaced as a
 * protocol-level read failure (spec-004 §2.2's "resource not found"-style refusal, generalized to any read
 * failure), its operator-facing details (`../core/error-details.ts`) as the JSON-RPC `error.data.details`
 * (task-130).
 *
 * A read-only operation with a required positional is a URI template whose decoded variable is the
 * positional (task-364); every other one is a static URI that serves the call with none of the optional
 * parameters. The Tools handlers are answered on the low-level server, so a server that uses this
 * function cannot also `registerTool`. The shipped `wingfoil mcp` server (`./server.ts`) does not call
 * this function: it calls {@link registerCoreTools} for the Memory Tools and serves its own Resources
 * (`spec-014` §3).
 */
export function registerCoreModules(
  server: McpServer,
  modules: readonly CoreModule[],
  options: RegisterCoreModulesOptions,
): void {
  // Declare both channels (spec-004 §1: Resources and Tools are fixed channel types of the MCP
  // surface), even when `modules` has zero operations of one kind. The Tools handlers are installed by
  // `registerCoreTools` whatever the modules hold, so with no `mutates: true` operation `tools/list`
  // answers `[]` (task-364). The Resources handlers are installed by the SDK on the first `registerResource`.
  server.server.registerCapabilities({ resources: {} });
  registerCoreTools(server, modules, options);

  for (const { module, operation } of enumerateOperations(modules)) {
    if (operation.mutates) continue;
    const verb = deriveVerb(module.name, operation.name);
    const uri = deriveMcpResourceUri(module.name, verb, operation.positional);
    const resourceName = deriveMcpToolName(module.name, verb);
    const metadata = { description: `${module.name} ${verb} (read-only)` };
    const serve = async (readUri: URL, context: Omit<ParamsContext, 'moduleName' | 'operationName' | 'root'>) => {
      const result = await callResource(operation, module.name, context);
      if (result.ok) {
        // Its warnings ride beside `contents` (task-195, same class as `bug-231`): `memorySearch`
        // reports the documents its scan left out (task-171), which a client must not lose.
        return withWarnings(
          { contents: [{ uri: readUri.toString(), mimeType: 'application/json', text: JSON.stringify(result.value) }] },
          result.warnings ?? [],
        );
      }
      // A failed read IS a JSON-RPC error; the SDK forwards an `Error`'s `data` as `error.data`
      // (task-130, `dl-055` option 1). No details, no `data` — the shape it always had.
      throw readRefusalError(result.error.message, errorDetails(result.error));
    };
    const positional = operation.positional;
    if (positional?.required === true) {
      // `list: undefined`: `resources/templates/list` lists it, `resources/list` does not (spec-004 §2.1).
      server.registerResource(resourceName, new ResourceTemplate(uri, { list: undefined }), metadata, async (readUri, variables) => {
        const value = templateVariable(variables, positional.name);
        return serve(readUri, { positional: value, positionals: [value] });
      });
    } else {
      server.registerResource(resourceName, uri, metadata, async (readUri) => serve(readUri, {}));
    }
  }

  /** One read-only core call with `context`'s parameters. */
  function callResource(
    operation: CoreOperation,
    moduleName: string,
    context: Omit<ParamsContext, 'moduleName' | 'operationName' | 'root'>,
  ): Promise<CoreResult<unknown>> {
    // An operation that reads no project (`readsProject: false`, `spec-019` §1) resolves no root: no `root` key at all
    // (`spec-006` §2: declared on the operation, never by a name in a registrar).
    const project = operation.readsProject === false ? {} : { root: options.resolveRoot() };
    return operation.fn(options.buildParams({ moduleName, operationName: operation.name, ...project, ...context }));
  }
}
