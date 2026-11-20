/**
 * The MCP Tools channel derived from `CORE_MODULES` (P5.2.3, `spec-004` §4, `spec-006` §4, `spec-014` §3, `spec-018`
 * §1.2; task-367, moved out of `./registrar.ts`, whose `registerCoreModules` calls it for its Tools half).
 *
 * {@link registerCoreTools} registers every `mutates: true` operation of the given modules as a Tool named
 * `{module}.{verb}` (`spec-004` §4.1), its input schema derived from the operation's parameter metadata
 * (`deriveToolInputSchema`, task-364), and answers `tools/list` and `tools/call` itself, on the low-level server: a
 * server that uses it cannot also `registerTool`. A `tools/call` runs, in this order (`spec-004` §4.3, approver
 * ruling D2):
 *
 * 1. an unknown name → `Tool <name> not found`;
 * 2. the argument check (`toolArgumentsToParams`) → its refusal, the operation not called;
 * 3. for an operation the agent trailers apply to (`agentAttribution !== false`), a non-blank `WINGFOIL_AGENT_MODEL`
 *    in the server's environment that is not one line → {@link MULTI_LINE_AGENT_MODEL} (`spec-018` §2.4);
 * 4. the call, as an **agent context** — inside `withAgentInvocation({ env, surface: 'mcp' })`, marker row 5 of
 *    `spec-018` §1 (ruling D1), so an approver-gated operation refuses with `E_AGENT_CONTEXT` and every other one
 *    signs its commit with the agent trailers, the entry and the model read from the server's environment —, inside
 *    one warning sink per call (ruling D7), and through `runAsDryRun` when `dry-run` is given.
 *
 * Results: a success's text is the payload's JSON, with `structuredContent: {value, warnings}` when any warning was
 * raised during the call or returned with it; a refusal — the argument check, the model check, a thrown error mapped
 * by `exitCodeForThrow` as the CLI maps it, or a `CoreResult.error` — is an `isError: true` result whose text is the
 * bare reason, with `structuredContent` the CLI's `--format json` error object `{error, hint?, details?}` plus
 * `warnings?`, present when any of those three is (ruling D3).
 *
 * Only the Tools run the agent invocation: the Resources and the Prompts read, and run none.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';

import { AGENT_MODEL_VARIABLE, isMultiLineValue, MULTI_LINE_AGENT_MODEL, withAgentInvocation } from '../core/agent-context';
import { runAsDryRun } from '../core/dry-run';
import type { ErrorDetail } from '../core/error-details';
import { errorDetails } from '../core/error-details';
import { exitCodeForThrow } from '../core/exit-code';
import type { CoreModule, CoreOperation, ParamsBuilder, ToolInputSchema } from '../core/registry';
import { deriveToolInputSchema, deriveVerb, enumerateOperations, toolArgumentsToParams } from '../core/registry';
import type { CoreResult } from '../core/types';
import { withWarningSink } from '../validation/warning';

/** Ambient dependencies {@link registerCoreTools} needs: the project root, the params builder and the server's environment. */
export interface RegisterCoreToolsOptions {
  /** Resolves the project root a Tool call is served from (an ambient concern, not a Tool argument). */
  readonly resolveRoot: () => string;
  /** Turns a `ParamsContext` into one operation's typed params (`../core/registry.ts`'s {@link ParamsBuilder}). */
  readonly buildParams: ParamsBuilder;
  /**
   * The server's environment, which a Tool call's agent context reads: the environment markers, the launcher
   * variable and `WINGFOIL_AGENT_MODEL` (`spec-018` §1.2, §2.3–§2.4). Defaults to `process.env`.
   */
  readonly env?: Readonly<Record<string, string | undefined>>;
}

/**
 * `{module}.{verb}` — spec-004 §4.1's Tool naming convention (mechanical transform of the CLI verb).
 * An empty `verb` (`deriveVerb`'s flat/no-verb form, task-028-implement-paths-category) collapses to
 * the bare module name — there is no verb segment to append a `.` before.
 */
export function deriveMcpToolName(moduleName: string, verb: string): string {
  return verb ? `${moduleName}.${verb}` : moduleName;
}

/** `schema` in the SDK's mutable wire type (a copy: the derived schema stays read-only). */
function wireSchema(schema: ToolInputSchema): Tool['inputSchema'] {
  const { required, ...rest } = schema;
  return { ...rest, properties: { ...rest.properties }, ...(required === undefined ? {} : { required: [...required] }) };
}

/** A refusal of a Tool call: its reason and what the CLI's `--format json` error object carries beside it. */
interface ToolRefusal {
  readonly reason: string;
  readonly hint?: string;
  readonly details?: readonly ErrorDetail[];
}

/**
 * The `isError: true` result of `refusal`: the bare reason as text and, when the refusal has a hint or details or a
 * warning was raised, `structuredContent` `{error, hint?, details?, warnings?}` — the CLI's `--format json` error
 * object (`src/cli/error.ts`, same keys, same order) plus the warnings (rulings D3, D7).
 */
function refusalResult(refusal: ToolRefusal, warnings: readonly string[]): CallToolResult {
  const details = refusal.details ?? [];
  const extra = {
    ...(refusal.hint ? { hint: refusal.hint } : {}),
    ...(details.length > 0 ? { details: [...details] } : {}),
    ...(warnings.length > 0 ? { warnings: [...warnings] } : {}),
  };
  return {
    content: [{ type: 'text', text: refusal.reason }],
    isError: true,
    ...(Object.keys(extra).length > 0 ? { structuredContent: { error: refusal.reason, ...extra } } : {}),
  };
}

/** The result of `result`, with the warnings collected during the call before the ones it returned. */
function resultOf(result: CoreResult<unknown>, collected: readonly string[]): CallToolResult {
  if (!result.ok) {
    return refusalResult({ reason: result.error.message, hint: result.error.hint, details: errorDetails(result.error) }, collected);
  }
  const warnings = [...collected, ...(result.warnings ?? [])];
  // The success-warning channel (task-169, `dl-062`): a Tool has no stderr, so the warnings ride as
  // `structuredContent: {value, warnings}`; the text stays the payload's JSON. No warnings, no `structuredContent`.
  return {
    content: [{ type: 'text', text: JSON.stringify(result.value) }],
    ...(warnings.length > 0 ? { structuredContent: { value: result.value, warnings } } : {}),
  };
}

/**
 * The model refusal of `spec-018` §2.4 for an operation the agent trailers apply to: a non-blank
 * `WINGFOIL_AGENT_MODEL` in `env` that is not one line. Every Tool call is an agent context, so the variable is always
 * read (the CLI reads it only in an agent context).
 */
function agentModelRefusal(operation: CoreOperation, env: Readonly<Record<string, string | undefined>>): string | undefined {
  if (operation.agentAttribution === false) return undefined;
  const variable = env[AGENT_MODEL_VARIABLE];
  return variable !== undefined && variable.trim().length > 0 && isMultiLineValue(variable) ? MULTI_LINE_AGENT_MODEL : undefined;
}

/**
 * Register every `mutates: true` operation in `modules` onto `server` as a Tool, and answer `tools/list` and
 * `tools/call` (see the module doc for the order of a call's checks and the shape of its result). Declares the Tools
 * capability without `listChanged`: the list is fixed for the server's life. With no mutating operation in
 * `modules`, `tools/list` answers `[]` and every call `Tool <name> not found`.
 */
export function registerCoreTools(server: McpServer, modules: readonly CoreModule[], options: RegisterCoreToolsOptions): void {
  server.server.registerCapabilities({ tools: {} });
  const env = options.env ?? process.env;

  const tools = new Map<string, { moduleName: string; operation: CoreOperation; tool: Tool }>();
  for (const { module, operation } of enumerateOperations(modules)) {
    if (!operation.mutates) continue;
    const verb = deriveVerb(module.name, operation.name);
    const toolName = deriveMcpToolName(module.name, verb);
    tools.set(toolName, {
      moduleName: module.name,
      operation,
      tool: { name: toolName, description: `${module.name} ${verb} (mutating)`, inputSchema: wireSchema(deriveToolInputSchema(operation)) },
    });
  }

  server.server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: [...tools.values()].map((entry) => entry.tool) }));
  server.server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
    const entry = tools.get(request.params.name);
    // The SDK's own wording for an unknown Tool (task-174).
    if (entry === undefined) return refusalResult({ reason: `Tool ${request.params.name} not found` }, []);
    const mapped = toolArgumentsToParams(entry.operation, request.params.arguments);
    if (!mapped.ok) return refusalResult({ reason: mapped.reason }, []);
    const modelRefusal = agentModelRefusal(entry.operation, env);
    if (modelRefusal !== undefined) return refusalResult({ reason: modelRefusal }, []);

    const collected: string[] = [];
    try {
      // Inside the try, as on the CLI (bug-002): an ambient failure resolving the root is a refusal, not a crash.
      const params = options.buildParams({
        moduleName: entry.moduleName,
        operationName: entry.operation.name,
        root: options.resolveRoot(),
        ...mapped.context,
      });
      // A fresh invocation per call: the agent context is resolved once per invocation (`resolveOperationAgentContext`).
      const call = (): Promise<CoreResult<unknown>> => withAgentInvocation({ env, surface: 'mcp' }, () => entry.operation.fn(params));
      const result = await withWarningSink(
        (text) => collected.push(text),
        () => (mapped.dryRun ? runAsDryRun(call) : call()),
      );
      return resultOf(result, collected);
    } catch (error) {
      // A thrown usage error (`requireReason`'s blank `reason`) is an `isError` result with the CLI's reason
      // (`dl-199` (b), ruling D7), never a JSON-RPC error.
      return refusalResult({ reason: exitCodeForThrow(error).reason }, collected);
    }
  });
}
