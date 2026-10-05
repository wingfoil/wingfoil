/**
 * Shared conventions for every bespoke Resource this task registers (`memory-resource`,
 * `dna-resource`, `workflow-resource`): the read-only-channel guarantee — spec-004-mcp-surface-contract
 * §2.3's verbatim write-refusal string, plus the standard MCP "resource not found" shape (§2.2) — and
 * the common JSON-bodied result envelope, factored once so every module refuses/reports/shapes
 * identically rather than re-deriving the same strings/shape per handler
 * (task-011-mcp-resources-read-only, REQ-INT-01 / REQ-SEC-05).
 *
 * Two distinct write-attempt shapes must be refused (spec-004 §2.3):
 *
 * 1. An unsupported `resources/write` JSON-RPC call — {@link registerWriteRefusalHandler} installs a
 *    handler for that literal method name (which the MCP protocol itself does not define at all — see
 *    the SDK's `types.d.ts`: there is no `ResourceWrite*` schema) that unconditionally refuses. This
 *    is structural, not a gated check: the handler has no branch that could ever succeed.
 * 2. A `resources/read` request "carrying a write intent/payload". The real wire schema
 *    (`ReadResourceRequestSchema`) strips any unknown key placed directly on `params` before a
 *    handler ever sees it (Zod `$strip` mode) — the one part of that schema that is *not* stripped is
 *    the nested `_meta` sub-object, which the SDK itself models as passthrough (`$loose`) for
 *    out-of-band caller metadata. {@link WRITE_INTENT_META_KEY} is WingFoil's own convention (MCP
 *    defines no write-intent field) for exercising that one channel a misbehaving/malicious client
 *    could still smuggle a write payload through; {@link refuseIfWriteIntent} is called by every
 *    bespoke read handler before it does anything else.
 */
import { z } from 'zod';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { coreErrorOf } from '../core';
import { errorDetails, type ErrorDetail } from '../core/error-details';

/** spec-004 §2.3's exact, verbatim write-refusal string. */
export const WRITE_REFUSAL_MESSAGE = 'resources are read-only';

/**
 * The `_meta` key WingFoil's own bespoke Resource handlers treat as "this `resources/read` call is
 * carrying a write intent/payload" — not an MCP-defined field (see module doc). Any truthy value
 * under this key refuses the read identically to an unsupported `resources/write` call.
 */
export const WRITE_INTENT_META_KEY = 'wingfoil/write-intent';

/**
 * Refuse a read carrying a write intent (see module doc, case 2). Called first, before any other
 * work, by every bespoke Resource handler this task registers — so the refusal is unconditional and
 * precedes any read/scan/file-access, never a check bolted on after a read already started.
 */
export function refuseIfWriteIntent(meta: Record<string, unknown> | undefined): void {
  if (meta && WRITE_INTENT_META_KEY in meta) {
    throw new Error(WRITE_REFUSAL_MESSAGE);
  }
}

/** spec-004 §2.2's "resource not found" shape — distinct wording from the write refusal above, per
 * the BDD scenario (`P5.2.1-mcp-resources.feature`) `resource not found: {identifier}` format. */
export function resourceNotFoundError(identifier: string): Error {
  return new Error(`resource not found: ${identifier}`);
}

/**
 * A failed read's JSON-RPC error: `message` as its text and, when there are any, the refusal's
 * operator-facing `details` as `error.data.details` (spec-004 §4.3 item 4; task-130, `dl-055` option 1).
 * The SDK forwards an `Error`'s `data` as the JSON-RPC `error.data`. No details, no `data` — the shape
 * a refusal always had. Shared by the core-derived Resources (`./registrar.ts`) and the bespoke ones.
 */
export function readRefusalError(message: string, details: readonly ErrorDetail[]): Error {
  return details.length > 0 ? Object.assign(new Error(message), { data: { details } }) : new Error(message);
}

/**
 * Run a Resource or Prompt read, and give a loader refusal it throws the same details the CLI prints
 * (task-174, `bug-184`). The handlers registered here call the pillar loaders directly, not through a
 * `CoreOperation`, so a refusal reached the client without the `error.data` `./registrar.ts` gives
 * one. The thrown error is mapped once, by core's own `coreErrorOf`; one that carries details is
 * re-thrown as {@link readRefusalError} with its message unchanged, and anything else — a refusal with
 * no details, a write refusal, a "resource not found", a programmer bug — is re-thrown as it was.
 */
export async function withRefusalDetails<T>(read: () => T | Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (error) {
    const refusal = coreErrorOf(error);
    const details = refusal === null ? [] : errorDetails(refusal);
    if (refusal === null || details.length === 0) throw error;
    throw readRefusalError(refusal.message, details);
  }
}

/**
 * The `ReadResourceResult` shape every JSON-bodied Resource in `memory-resource.ts` (collection
 * listing), `dna-resource.ts`, and `workflow-resource.ts` returns — one `contents[]` entry,
 * `mimeType: 'application/json'`, `value` serialized as its `text`. Factored here purely to avoid
 * re-deriving the same three-line envelope at each of those five call sites; `memory-resource.ts`'s
 * single-document read builds its own `text/markdown` + `metadata` result directly, since that shape
 * differs (spec-004 §2.2).
 */
export function jsonResourceResult(uri: URL, value: unknown): { contents: [{ uri: string; mimeType: string; text: string }] } {
  return {
    contents: [
      {
        uri: uri.toString(),
        mimeType: 'application/json',
        text: JSON.stringify(value),
      },
    ],
  };
}

/** The raw JSON-RPC shape of an (unsupported) `resources/write` request — just enough to extract the
 * method literal `setRequestHandler` needs; `params` is never inspected, since every call is refused
 * unconditionally regardless of its payload. */
const ResourcesWriteRequestSchema = z.object({
  method: z.literal('resources/write'),
  params: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Install the `resources/write` refusal (see module doc, case 1). MCP's own protocol does not define
 * `resources/write` at all — no client capability or built-in handler exists for it — so this method
 * name has no default routing on the server; without this handler such a call would fail with a
 * generic JSON-RPC "Method not found" rather than spec-004 §2.3's specific refusal text. There is no
 * write path here to gate: the handler always throws, unconditionally.
 */
export function registerWriteRefusalHandler(server: McpServer): void {
  server.server.setRequestHandler(ResourcesWriteRequestSchema, async () => {
    throw new Error(WRITE_REFUSAL_MESSAGE);
  });
}
