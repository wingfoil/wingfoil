/**
 * Core result & error shapes (spec-006-core-domain-api §2 — "Function shape").
 *
 * Every core function returns `Promise<CoreResult<T>>`, a discriminated union — never a thrown
 * error for *expected* domain failures (illegal state transition, missing element, schema
 * violation). That is what lets `src/cli`'s exit-code/stderr rendering and `src/mcp`'s Tool
 * `isError`/Resource-read-failure response be driven off the very same value, rather than each
 * surface independently deciding what counts as a failure and how to report it.
 */

/** The fixed `CoreError.code` enumeration (spec-006 §2, verbatim). */
export type CoreErrorCode = 'NOT_FOUND' | 'INVALID_TRANSITION' | 'VALIDATION' | 'CONFLICT' | 'IO';

/**
 * An expected domain failure carried by a failed {@link CoreResult} (spec-006 §2): a fixed
 * {@link CoreErrorCode}, a human-readable `message`, and optional structured `details`. The single
 * shape both surfaces map to an exit code / MCP error response.
 */
export interface CoreError {
  readonly code: CoreErrorCode;
  readonly message: string;
  readonly details?: Record<string, unknown>;
}

/**
 * The discriminated-union return of every {@link CoreFn} (spec-006 §2): `ok: true` with the operation's
 * `value` (and, for a mutation, the `commit` it produced), or `ok: false` with a {@link CoreError}.
 * Expected domain failures travel here, never as a thrown exception.
 *
 * `warnings` (task-169, `dl-062` Q1 option 3) is the **success-warning channel**: what a successful
 * operation wants the operator told — e.g. that `directive assign --force` rewrote `roles.yaml` as a
 * whole file and what that normalized — kept apart from `value` so it never becomes part of the
 * payload a script parses. Each entry is one operator-facing sentence, in the order core recorded it
 * (REQ-SYS-07). The key is absent when there is nothing to say, never an empty list. Each surface
 * renders it in one place: the CLI on stderr (`src/cli/warning.ts`), the MCP Tool result in
 * `structuredContent` (`src/mcp/registrar.ts`).
 */
export type CoreResult<T> =
  | {
      readonly ok: true;
      readonly value: T;
      /**
       * The commit the operation produced. `message` is the operation's message, not the stored body:
       * `commitPaths` appends the `WingFoil-Version:` trailer paragraph to what it records (task-192,
       * `dl-111`), and `git log --format=%B <sha>` reads the stored body.
       */
      readonly commit?: { readonly sha: string; readonly message: string };
      readonly warnings?: readonly string[];
    }
  | { readonly ok: false; readonly error: CoreError };

/**
 * Build a success {@link CoreResult}, optionally carrying the git commit the operation produced and
 * the warnings to show the operator (task-169). An empty `warnings` list is the same as none: the
 * result then has no `warnings` key, the shape every success had before the channel existed.
 */
export function coreOk<T>(
  value: T,
  commit?: { sha: string; message: string },
  warnings?: readonly string[],
): CoreResult<T> {
  return {
    ok: true,
    value,
    ...(commit ? { commit } : {}),
    ...(warnings !== undefined && warnings.length > 0 ? { warnings: [...warnings] } : {}),
  };
}

/** Build a failure {@link CoreResult} from a {@link CoreError}. */
export function coreErr<T = never>(error: CoreError): CoreResult<T> {
  return { ok: false, error };
}
