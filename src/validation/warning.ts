/**
 * Unknown-field warning policy for `.passthrough()` schemas (spec-009-validation-strategy §2), and the
 * **warning sink** every warning raised while an operation runs goes through (task-218, `bug-202`).
 *
 * Unknown-ness is decided against the schema's own declared key set (`schema.shape`), NOT against
 * the passthrough-parsed output. Under `.passthrough()` the parsed object retains every unknown
 * key, so a `raw` vs `parsed` diff is always empty — the "known-defective mechanism" spec-009 §2
 * explicitly warns against. Diffing raw keys against `schema.shape` is the correct mechanism.
 *
 * The same diff is applied recursively at every nesting level that is itself a `.passthrough()`
 * object schema (spec-009 §2: "the same diff is applied recursively at each nesting level that
 * itself has a `.passthrough()` schema, so unknown fields inside nested config blocks are reported
 * too, not only at the document root"). This matters because the files this module guards —
 * `memory.yaml`, `dna.yaml`, `workflows.yaml` — all carry deeply nested config blocks (per-type
 * state machines, phase objects, etc.), where an unknown field would otherwise go undetected.
 *
 * **The sink.** A loader deep inside `src/` does not know the surface it serves or its `--format`, so it
 * never writes a warning itself: it hands it to {@link reportWarning}. The surface that runs the
 * operation installs a sink around the call ({@link withWarningSink}) — the CLI registrar renders each
 * warning through `src/cli/warning.ts`, the one renderer, in the active `--format`, at the moment it is
 * raised, so it precedes whatever the command prints after it (an error, or `agent execute`'s pre-flight
 * refusal, `spec-016` §3.3 step 8). The mode travels in an `AsyncLocalStorage`, as the dry run's does,
 * so no loader signature changes. Outside any sink (the MCP server, a library caller) the warning is
 * written to stderr as `Warning: <text>`, the line these loaders always wrote.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

/** Where a raised warning goes: one operator-facing sentence, no prefix. */
export type WarningSink = (text: string) => void;

const sinkStore = new AsyncLocalStorage<WarningSink>();

/**
 * Run `run` with `sink` receiving every warning {@link reportWarning} raises inside it, its awaited
 * continuations included. Returns what `run` returns.
 */
export function withWarningSink<T>(sink: WarningSink, run: () => T): T {
  return sinkStore.run(sink, run);
}

/**
 * Raise one warning: to the sink {@link withWarningSink} installed around the running operation, or,
 * with none installed, to stderr as `Warning: <text>`.
 */
export function reportWarning(text: string): void {
  const sink = sinkStore.getStore();
  if (sink !== undefined) sink(text);
  else process.stderr.write(`Warning: ${text}\n`);
}

/**
 * Run `run` with each distinct warning raised inside it passed on once (task-228, the B3 handover: a
 * pipeline that loads one file twice raises its warning twice), after `rewrite` (identity by default).
 * The warnings go to the sink installed around the call, or to stderr outside any.
 */
export function withDistinctWarnings<T>(run: () => T, rewrite: (text: string) => string = (text) => text): T {
  const outer = sinkStore.getStore();
  const seen = new Set<string>();
  return sinkStore.run((text) => {
    const shown = rewrite(text);
    if (seen.has(shown)) return;
    seen.add(shown);
    if (outer !== undefined) outer(shown);
    else process.stderr.write(`Warning: ${shown}\n`);
  }, run);
}

/**
 * A **notice**: an informational line an operation prints while it runs, neither a warning nor an error
 * — `agent execute`'s launch banner (`spec-016` §3.3 step 13, task-228). It travels like a warning, to
 * the sink the surface installs ({@link withNoticeSink}); the CLI renders it in the active `--format`
 * on stderr. Outside any sink it is written to stderr as is.
 */
export type NoticeSink = (text: string) => void;

const noticeStore = new AsyncLocalStorage<NoticeSink>();

/** Run `run` with `sink` receiving every notice {@link reportNotice} raises inside it. */
export function withNoticeSink<T>(sink: NoticeSink, run: () => T): T {
  return noticeStore.run(sink, run);
}

/** Raise one notice: to the installed sink, or, with none, to stderr as a bare line. */
export function reportNotice(text: string): void {
  const sink = noticeStore.getStore();
  if (sink !== undefined) sink(text);
  else process.stderr.write(`${text}\n`);
}

/**
 * Minimal structural view of a Zod object schema: only its declared top-level `shape` is needed.
 * Typed structurally rather than as `AnyZodObject` (spec-009 §2's listing) because Zod 4 — the
 * version pinned in `dna.yaml` / `package.json` (`zod@^4`) — no longer exports the `AnyZodObject`
 * alias; every `.passthrough()` object schema still exposes `.shape`, which is all this check reads.
 */
export interface HasShape {
  readonly shape: Record<string, unknown>;
}

/**
 * Minimal structural view of a Zod array schema: only its `element` schema is needed, to reach an
 * array-of-nested-objects shape (e.g. `workflows.yaml`'s `phases:` — an array of phase objects).
 * Zod 4 exposes the element schema as `.element`; a `ZodObject` never has it and a `ZodArray`
 * never has `.shape`, so the two structural guards below are mutually exclusive.
 */
interface HasElement {
  readonly element: unknown;
}

/** True when `v` is a Zod object schema (structurally: exposes a `.shape` record). */
function isHasShape(v: unknown): v is HasShape {
  return (
    typeof v === 'object' &&
    v !== null &&
    'shape' in v &&
    typeof (v as { shape: unknown }).shape === 'object' &&
    (v as { shape: unknown }).shape !== null
  );
}

/** True when `v` is a Zod array schema (structurally: exposes an `.element` schema). */
function isHasElement(v: unknown): v is HasElement {
  return typeof v === 'object' && v !== null && 'element' in v;
}

/** True for a plain (non-array) object — a candidate raw value to recurse into. */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Recursively collect the paths of every raw key that is not declared in the schema's shape.
 * Top-level unknowns are reported by bare name (`mysteryField`); nested unknowns carry a dotted /
 * indexed path (`nested.field`, `phases[0].field`) so the operator can locate the offending block.
 */
function collectUnknownFields(
  raw: Record<string, unknown>,
  schema: HasShape,
  prefix: string,
): string[] {
  const known = new Set(Object.keys(schema.shape));
  const out: string[] = [];
  for (const key of Object.keys(raw)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (!known.has(key)) {
      out.push(path);
      continue;
    }
    // Known key: descend when the declared field is itself a passthrough object schema (or an
    // array of them) AND the raw value has the matching shape. Anything else (scalars, records,
    // mismatched raw shapes) is left to Pass-1's own field-level validation.
    const fieldSchema = schema.shape[key];
    const rawValue = raw[key];
    if (isHasShape(fieldSchema) && isPlainObject(rawValue)) {
      out.push(...collectUnknownFields(rawValue, fieldSchema, path));
    } else if (isHasElement(fieldSchema) && Array.isArray(rawValue)) {
      const elementSchema = fieldSchema.element;
      if (isHasShape(elementSchema)) {
        rawValue.forEach((item, index) => {
          if (isPlainObject(item)) {
            out.push(...collectUnknownFields(item, elementSchema, `${path}[${index}]`));
          }
        });
      }
    }
  }
  return out;
}

/**
 * Raise one warning (spec-009 §2) listing every raw key not declared in `schema`'s shape, recursively
 * through nested passthrough object/array-of-object schemas, through {@link reportWarning} (`bug-202`):
 * `<file>: unknown field(s) ignored: <paths>`. Raises nothing when there are no unknown fields.
 */
export function emitUnknownFieldWarning(
  raw: Record<string, unknown>,
  schema: HasShape,
  filePath: string,
): void {
  const unknown = collectUnknownFields(raw, schema, '');
  if (unknown.length > 0) {
    reportWarning(`${filePath}: unknown field(s) ignored: ${unknown.join(', ')}`);
  }
}
