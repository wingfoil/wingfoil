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
 * (task-364, `dl-040` option 1, `spec-004` §2.1 and §4.3). At this commit it backs the parity and
 * channel-enumeration harness of REQ-SEC-05 (`test/core/parity.test.ts`,
 * `test/mcp/helpers/channel-enumeration.ts`) and the Tool set `test/docs/mcp-surface-parity.test.ts`
 * compares with spec-004 §4.1; the `wingfoil mcp` server (`createMcpServer`) does not call it and serves
 * none of its URIs. The Resources the server serves are `wingfoil://dna`, `wingfoil://workflows`,
 * `wingfoil://workflows/-/next` and `wingfoil://workflows/-/status`, with the templates
 * `wingfoil://memory/{type}`, `wingfoil://memory/{type}/{id}`, `wingfoil://dna/{section}`,
 * `wingfoil://workflows/{name}` and `wingfoil://session/{role}/{element}/{state}`, registered by
 * `registerMemoryResources`, `registerDnaResources`, `registerWorkflowResources`,
 * `registerWorkflowStateResources` (through `registerReadOnlyResources`) and
 * `registerSessionContextResource`.
 */
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';

import { runAsDryRun } from '../core/dry-run';
import type { ErrorDetail } from '../core/error-details';
import { errorDetails } from '../core/error-details';
import type { CoreModule, CoreOperation, CorePositional, ParamsBuilder, ParamsContext, ToolInputSchema } from '../core/registry';
import { deriveToolInputSchema, deriveVerb, enumerateOperations, toolArgumentsToParams } from '../core/registry';
import type { CoreResult } from '../core/types';

import { readRefusalError, withWarnings } from './read-only';

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
 * `wingfoil://{module}/`. A REQUIRED `positional` adds one template segment named after it
 * (`wingfoil://memory/history/{id}`, `spec-006` §3, task-364 design D7); an optional one adds nothing.
 */
export function deriveMcpResourceUri(moduleName: string, verb: string, positional?: CorePositional): string {
  const base = verb ? `wingfoil://${moduleName}/${verb}` : `wingfoil://${moduleName}`;
  return positional?.required === true ? `${base}/{${positional.name}}` : base;
}

/** The outcome of one core call, rendered once for both channels. */
type CoreOutcome =
  | { ok: true; value: unknown; text: string; warnings: readonly string[] }
  | { ok: false; message: string; details: readonly ErrorDetail[] };

/** `result` as {@link CoreOutcome}: the value's JSON and its warnings, or the refusal's message and details. */
function outcomeOf(result: CoreResult<unknown>): CoreOutcome {
  return result.ok
    ? { ok: true, value: result.value, text: JSON.stringify(result.value), warnings: result.warnings ?? [] }
    : { ok: false, message: result.error.message, details: errorDetails(result.error) };
}

/** `schema` in the SDK's mutable wire type (a copy: the derived schema stays read-only). */
function wireSchema(schema: ToolInputSchema): Tool['inputSchema'] {
  const { required, ...rest } = schema;
  return { ...rest, properties: { ...rest.properties }, ...(required === undefined ? {} : { required: [...required] }) };
}

/** A Tool result whose only content is `text`, flagged as an error. */
function toolRefusal(text: string): CallToolResult {
  return { content: [{ type: 'text', text }], isError: true };
}

/**
 * The template variable `name` of a read, percent-decoded (design D8: a run id travels as one encoded
 * segment). The SDK types a variable `string | string[]`; a simple `{name}` is always one string.
 * Malformed encoding is a failed read naming the parameter.
 */
function templateVariable(variables: Readonly<Record<string, string | string[]>>, name: string): string {
  const raw = variables[name];
  const text = Array.isArray(raw) ? raw.join(',') : (raw ?? '');
  try {
    return decodeURIComponent(text);
  } catch {
    throw readRefusalError(`invalid argument: ${name} must be percent-encoded`, []);
  }
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
 * `structuredContent: {value, warnings}` (task-169). A successful Resource read carries them as a
 * top-level `warnings` array beside `contents` (task-195, `bug-231`: since task-171 a read-only scan does
 * report the documents it left out).
 *
 * The parameters come from the operation's metadata (task-364, `dl-040` option 1, `bug-272`): each Tool's
 * `inputSchema` is {@link deriveToolInputSchema}'s, a Tool call's arguments are checked and mapped by
 * {@link toolArgumentsToParams} to the {@link ParamsContext} the CLI registrar builds for the same
 * invocation (a refusal is an `isError` result and the operation is not called), and `dry-run: true` runs
 * the call through `runAsDryRun`, as `--dry-run` does on the CLI. A read-only operation with a required
 * positional is a URI template whose decoded variable is the positional; every other one is a static URI
 * that serves the call with none of the optional parameters. The registrar answers `tools/list` and
 * `tools/call` itself, on the low-level server (design D5), so a server that uses it cannot also
 * `registerTool`. The shipped `wingfoil mcp` server (`./server.ts`) does not call this function and
 * registers no Tools (P5.2.3, v0.4).
 */
export function registerCoreModules(
  server: McpServer,
  modules: readonly CoreModule[],
  options: RegisterCoreModulesOptions,
): void {
  // Declare both channels (spec-004 §1: Resources and Tools are fixed channel types of the MCP
  // surface), even when `modules` has zero operations of one kind. The Tools handlers are installed
  // below whatever the modules hold, so with no `mutates: true` operation `tools/list` answers `[]`
  // (task-364; before it the SDK left the method unhandled, JSON-RPC -32601). The Resources handlers are
  // installed by the SDK on the first `registerResource`.
  server.server.registerCapabilities({ tools: {}, resources: {} });

  /** One core call with `context`'s parameters, optionally as a dry run. */
  const callCore = async (
    moduleName: string,
    operation: CoreOperation,
    context: Omit<ParamsContext, 'moduleName' | 'operationName' | 'root'>,
    dryRun: boolean,
  ): Promise<CoreOutcome> => {
    const params = options.buildParams({ moduleName, operationName: operation.name, root: options.resolveRoot(), ...context });
    const call = (): Promise<CoreResult<unknown>> => operation.fn(params);
    return outcomeOf(await (dryRun ? runAsDryRun(call) : call()));
  };

  const tools = new Map<string, { moduleName: string; operation: CoreOperation; tool: Tool }>();

  for (const { module, operation } of enumerateOperations(modules)) {
    const verb = deriveVerb(module.name, operation.name);

    if (operation.mutates) {
      const toolName = deriveMcpToolName(module.name, verb);
      tools.set(toolName, {
        moduleName: module.name,
        operation,
        tool: { name: toolName, description: `${module.name} ${verb} (mutating)`, inputSchema: wireSchema(deriveToolInputSchema(operation)) },
      });
      continue;
    }

    const uri = deriveMcpResourceUri(module.name, verb, operation.positional);
    const resourceName = deriveMcpToolName(module.name, verb);
    const metadata = { description: `${module.name} ${verb} (read-only)` };
    const serve = async (readUri: URL, context: Omit<ParamsContext, 'moduleName' | 'operationName' | 'root'>) => {
      const outcome = await callCore(module.name, operation, context, false);
      if (outcome.ok) {
        // Its warnings ride beside `contents` (task-195, same class as `bug-231`): `memorySearch`
        // reports the documents its scan left out (task-171), which a client must not lose.
        return withWarnings({ contents: [{ uri: readUri.toString(), mimeType: 'application/json', text: outcome.text }] }, outcome.warnings);
      }
      // A failed read IS a JSON-RPC error; the SDK forwards an `Error`'s `data` as `error.data`
      // (task-130, `dl-055` option 1). No details, no `data` — the shape it always had.
      throw readRefusalError(outcome.message, outcome.details);
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

  server.server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: [...tools.values()].map((entry) => entry.tool) }));
  server.server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
    const entry = tools.get(request.params.name);
    // The wording the empty Tools channel uses (`./server.ts`, task-174).
    if (entry === undefined) return toolRefusal(`Tool ${request.params.name} not found`);
    const mapped = toolArgumentsToParams(entry.operation, request.params.arguments);
    if (!mapped.ok) return toolRefusal(mapped.reason);
    const outcome = await callCore(entry.moduleName, entry.operation, mapped.context, mapped.dryRun);
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
      ...toolRefusal(outcome.message),
      ...(outcome.details.length > 0 ? { structuredContent: { error: outcome.message, details: outcome.details } } : {}),
    };
  });
}
