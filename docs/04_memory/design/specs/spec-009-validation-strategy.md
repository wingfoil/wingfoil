---
id: spec-009-validation-strategy
type: tech-spec
title: "Validation strategy: two-pass Zod pipeline, passthrough warnings, error codes"
status: approved
scope: "src/validation"
supersedes: ""
tmpl_version: 260703
---

## Context

Every WingFoil-owned file — `dna.yaml`, `memory.yaml`, `workflows.yaml`, and every Memory
document's frontmatter — is validated before WingFoil trusts or mutates it. Four other specs
each own one artefact's schema: `spec-001-memory-yaml-schema` (`memory.yaml`),
`spec-002-dna-yaml-schema` (`dna.yaml`), `spec-003-workflows-yaml-schema` (`workflows.yaml`),
and `spec-008-cli-grammar` (CLI-level input/error conventions that validation errors must
conform to). Without a single shared validation module those specs would each reinvent parsing,
error-code naming, and unknown-field handling — producing divergent regexes, inconsistent exit
codes, and copy-pasted bugs. `src/validation` is that shared module: it is consumed by every
schema in `spec-001/002/003` (and by the not-yet-authored Memory-frontmatter schema spec) and by
the CLI/MCP surfaces described in `spec-008`.

`dna.yaml`'s `tech_stack.validation: Zod` (`.wingfoil/dna.yaml`) fixes Zod as the only
runtime validator project-wide — this spec assumes Zod throughout and does not evaluate
alternatives.

This spec defines **how** validation runs (the two-pass pipeline, trigger points, unknown-field
policy, and error-code convention), not **what** each file's fields must contain — field-level
constraints stay owned by `spec-001/002/003` and the frontmatter schema.

## Specification

### 1. Two-pass model

Validation of any WingFoil-owned file or data structure runs in two ordered passes. Pass 2 never
executes if Pass 1 fails.

**Pass 1 — Structural (Zod schema, fatal on failure).** Type/shape/format checks with no
knowledge of other files or runtime state:

1. Parse the raw text as YAML. A parse failure never reaches Zod — see `E_YAML_PARSE_ERROR` below.
2. Run `Schema.safeParse(raw)` for the file's Zod schema (owned by `spec-001/002/003` or the
   frontmatter schema).
3. Collect **all** Zod issues (`ZodError.issues`) — do not stop at the first failure.
4. Map every issue to an `E_*` code (see "Error-code convention" below).
5. Any mapped error ⇒ throw a `ValidationError` carrying the full list; **Pass 2 does not run**.

Pass 1 answers questions a single file can answer on its own: "is `scope` a non-empty string?",
"is `retention_days` a positive integer?", "does `id` match the id-character class?".

**Pass 2 — Semantic / cross-field (fatal on failure, runs only after Pass 1 succeeds).**
Checks that require either more than one field of the same document, or state loaded from
elsewhere:

- Cross-field, same document — e.g. (`workflows.yaml`) *"a phase's `gates` key must reference a
  step name that is itself a member of that phase's `sequence` array"*: this cannot be expressed
  as a per-field Zod `.regex()`/`.min()` because it compares one array's contents against
  another's; it runs as a `.superRefine()` step (still inside the Zod schema, logically Pass 2)
  or as a caller-supplied semantic-check function once Pass 1 has produced a typed object.
- Cross-file — e.g. (Memory frontmatter) *"`wingfoil.type` must be a key registered in
  `memory.yaml`"*, *"`wingfoil.status` must be a state of that type's machine — a member of its
  `sequence`, a `gates` reject target, or `deprecated`"* (`spec-001`'s `sequence`/`gates`/`waiting`
  encoding, or `defaults.states` for a type that declares none): these
  require the caller to have already loaded `memory.yaml`, so they run as a list of
  caller-supplied `SemanticCheck` functions executed by the validation pipeline after Pass 1.
- Character-class checks that reference another artefact's rule set — e.g. (`memory.yaml`)
  *"every literal character in a type's `id_pattern` (outside `{placeholder}` tokens) must be a
  member of `[a-z0-9-.]`"* — is Pass 2 because it enforces a rule owned by the shared ID
  constants (below), not by the `id_pattern` field's own type (`string`). The slug that fills a
  `{slug}` token obeys the same character class; how a title is normalized into it (a `.` kept
  between two alphanumerics, every other run outside `[a-z0-9]` collapsed to `-`) is stated once, in
  `spec-001-memory-yaml-schema`'s `{slug}` row (`dl-107` S1 (a)), and is not repeated here.

Each Pass-2 check either passes silently or throws a single mapped `E_*` error; the caller decides
whether to keep collecting after the first Pass-2 failure or to stop.

```ts
// src/validation/two-pass.ts
import { ZodSchema } from 'zod'

type SemanticCheck = () => void   // throws ValidationError on failure

export function runValidation<T>(
  schema: ZodSchema<T>,
  raw: unknown,
  filePath: string,
  opts: { errorMap?: Record<string, string>; semanticChecks?: SemanticCheck[] } = {},
): T {
  const result = schema.safeParse(raw)
  if (!result.success) {
    throw toValidationError(result.error, filePath, opts.errorMap)   // Pass 1 fatal — Pass 2 never runs
  }
  emitUnknownFieldWarning(raw, schema, filePath)                     // see §2 — fires regardless of Pass 2 outcome
  for (const check of opts.semanticChecks ?? []) check()             // Pass 2
  return result.data
}
```

### 2. Unknown-field warning policy (`.passthrough()`)

Every schema in `spec-001/002/003` and the frontmatter schema uses `.passthrough()`, so an
unrecognized key does not fail Pass 1 — it is preserved on the parsed object. That forward
compatibility is only useful if the operator is actually told about the unknown key; the warning
must fire, not silently pass.

**Known-defective mechanism (do not reproduce).** A prior draft of this policy compared the keys
of the *parsed* object against the keys of the *raw* input:

```ts
const unknown = Object.keys(raw).filter(k => !(k in parsed))   // WRONG — always []
```

Because `.passthrough()` copies every unknown key onto `parsed` (that is the entire point of
`.passthrough()`), `parsed` always has a superset of `raw`'s keys, so this diff is always empty
and the warning code path is dead — a no-op that never fires regardless of how many unknown
fields are present.

**Correct mechanism.** Unknown-ness must be decided against the schema's own known-key set, not
against the passthrough output. Every schema module exports its declared key list (Zod exposes
this as `schema.shape`); the check diffs the *raw* keys against *that*, not against `parsed`, and
**recurses** into every nested key whose declared field is itself a passthrough object schema (or
an array of them) so unknown fields inside nested config blocks are reported too — not only at the
document root. The schema is typed *structurally* (only `.shape` / `.element` are read) rather than
as `AnyZodObject`, because Zod 4 — the version pinned in `dna.yaml` / `package.json` — no longer
exports that alias:

```ts
// src/validation/warning.ts
/** Structural view of a Zod object schema — only its declared `.shape` is read. */
interface HasShape { readonly shape: Record<string, unknown> }
/** Structural view of a Zod array schema — only its `.element` schema is read. */
interface HasElement { readonly element: unknown }

// (isHasShape / isHasElement / isPlainObject: the obvious structural type guards.)

/**
 * Recursively collect the paths of every raw key not declared in the schema's shape. Top-level
 * unknowns are reported by bare name (`mysteryField`); nested unknowns carry a dotted / indexed
 * path (`nested.field`, `phases[0].field`) so the operator can locate the offending block.
 */
function collectUnknownFields(
  raw: Record<string, unknown>,
  schema: HasShape,
  prefix: string,
): string[] {
  const known = new Set(Object.keys(schema.shape))
  const out: string[] = []
  for (const key of Object.keys(raw)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (!known.has(key)) { out.push(path); continue }
    // Known key: descend when the declared field is itself a passthrough object schema (or an
    // array of them) AND the raw value has the matching shape. Anything else (scalars, records,
    // mismatched raw shapes) is left to Pass-1's own field-level validation.
    const fieldSchema = schema.shape[key]
    const rawValue = raw[key]
    if (isHasShape(fieldSchema) && isPlainObject(rawValue)) {
      out.push(...collectUnknownFields(rawValue, fieldSchema, path))
    } else if (isHasElement(fieldSchema) && Array.isArray(rawValue)) {
      const elementSchema = fieldSchema.element
      if (isHasShape(elementSchema)) {
        rawValue.forEach((item, index) => {
          if (isPlainObject(item)) {
            out.push(...collectUnknownFields(item, elementSchema, `${path}[${index}]`))
          }
        })
      }
    }
  }
  return out
}

export function emitUnknownFieldWarning(
  raw: Record<string, unknown>,
  schema: HasShape,
  filePath: string,
): void {
  const unknown = collectUnknownFields(raw, schema, '')
  if (unknown.length > 0) {
    process.stderr.write(`Warning: ${filePath}: unknown field(s) ignored: ${unknown.join(', ')}\n`)
  }
}
```

**Trigger point.** `emitUnknownFieldWarning` is called inside `runValidation`, immediately after
`schema.safeParse(raw)` returns success and *before* any Pass-2 semantic check runs (see the
`runValidation` listing above) — so the warning fires exactly once per successful Pass-1 parse,
using the schema's own declared shape as ground truth, independent of what `.passthrough()` did
to the output object. Nested objects: the same diff is applied recursively at each nesting level
that itself has a `.passthrough()` schema, so unknown fields inside nested config blocks are
reported too, not only at the document root.

The warning always goes to stderr and is suppressed when the active output format is
machine-readable (`--format json` / `--format yaml`), matching `spec-008`'s rule that diagnostic
text never mixes into structured stdout.

### 3. Shared error-code convention

Three code families cover every validation failure; consuming specs (`spec-001/002/003`, the
frontmatter schema) must reuse these families rather than invent parallel ones:

| Family | Pattern | When | Owner |
|---|---|---|---|
| Schema-level structural failure | `E_INVALID_<SCHEMA>_SCHEMA` | Pass 1 fails for a whole-document schema, e.g. `E_INVALID_MEMORY_YAML_SCHEMA`, `E_INVALID_DNA_YAML_SCHEMA`, `E_INVALID_WORKFLOWS_YAML_SCHEMA` | `src/validation` names the family; the owning spec (`spec-001/002/003`) fixes the exact `<SCHEMA>` token |
| Field/constraint-level failure | `E_INVALID_<X>` | A single named rule fails in Pass 1 or Pass 2, e.g. `E_INVALID_ID`, `E_INVALID_GATES_REF`, `E_INVALID_ID_PATTERN_CHARS` | The spec that defines rule `<X>` |
| Pre-parse failure | `E_YAML_PARSE_ERROR` | `js-yaml` (or equivalent) cannot parse the file as YAML at all — Zod never runs | `src/validation` (this spec) |

Generic fallback: any Zod issue whose dot-path has no explicit entry in the schema's `ErrorMap`
maps to `E_VALIDATION` (owned by `src/validation`), carrying the path and the raw Zod message, so
no failure is ever silently dropped for lack of a specific code.

```ts
// src/validation/error-mapper.ts
export function toValidationError(
  zodError: ZodError,
  filePath: string,
  errorMap: Record<string, string> = {},
): ValidationError {
  const issues = zodError.issues.map(issue => {
    const path = issue.path.join('.')
    const code = errorMap[path] ?? 'E_VALIDATION'
    return { code, path, file: filePath, message: issue.message }
  })
  return new ValidationError(issues)
}
```

Exit codes follow **the nature of the failure, not the pass that detects it** — an earlier wording of
this paragraph keyed on the pass and on the code family at the same time, which made a Pass-2
`E_INVALID_*` failure both a `2` and a `1`. The rule is:

- **`2`** — parse and system-integrity failures: `E_YAML_PARSE_ERROR`, and the cross-file integrity
  checks that presuppose a parseable tree. The input could not be understood, or the installation is
  inconsistent.
- **`1`** — every other validation failure: any mapped `E_INVALID_*`/`E_INVALID_*_SCHEMA`, **including
  business-rule failures detected in Pass 2** such as `E_INVALID_TRANSITION`, plus the generic
  `E_VALIDATION` fallback. The input was understood and the rule said no.

This matches `spec-008`'s exit-code table and REQ-INT-04 (`0` success, `1` user/logic error, `2`
usage/argument error). Ratified by `dl-032-illegal-transition-message-contract`; it also removes an
inconsistency in `src/core/exit-code.ts`, whose `EXIT_CODE_BY_ERROR` already maps `INVALID_TRANSITION`
to `1` on the return path while the throw path produced `2` for the same failure.

## Consequences

- `spec-001-memory-yaml-schema`, `spec-002-dna-yaml-schema`, `spec-003-workflows-yaml-schema`, and
  the not-yet-authored Memory-frontmatter schema spec must implement their Zod schemas as
  `.passthrough()` objects, supply an `ErrorMap` keyed by dot-path, and route every field-level
  code through the `E_INVALID_<X>` family defined here — they do not invent their own
  warning/error plumbing.
- Any future schema added to WingFoil (new config file or Memory type) must call
  `runValidation()` rather than calling `schema.safeParse()` directly, so the unknown-field
  warning and error-code mapping stay uniform.
- If the unknown-field diff logic is ever changed, it must keep comparing against the schema's
  declared shape (not the passthrough output) — reintroducing a `raw` vs `parsed` diff would
  silently resurrect the no-op defect described above.
- Revising the two-pass split (e.g. moving a currently-Pass-2 check into Pass 1, or vice versa)
  is a change to this spec, not to the consuming schema specs, since the split itself — not just
  its instances — is owned here.

## Process Notes

Authored proactively during `initial-design` to give `spec-001/002/003/008` a shared validation
contract. The error-code family names (`E_INVALID_<SCHEMA>_SCHEMA`, `E_INVALID_<X>`,
`E_YAML_PARSE_ERROR`) and schema/spec ownership mapping were cross-checked against the current
`docs/04_memory/design/specs/` catalog (spec-001/002/003/008) and
`.wingfoil/dna.yaml`'s `tech_stack.validation: Zod`.

**Revision (2026-10-02, `task-163-implement-date-author-id-tokens-edit-frontmatter-through`) — §1
points to the `{slug}` rule.** `dl-107` Action 1 asked to amend a slug rule in §1, which held none
(`bug-157`). The rule lives in `spec-001`'s `{slug}` row since `dl-107` was ratified; §1's
character-class bullet now names that row instead of restating it, so the two specs cannot drift. No
other section changed.

**Revision (2026-10-05, `task-188-correct-spec-011-bindings-id-stale-builtin-templates`) — §1's
cross-file example names a field that exists, per `bug-213`.** The example said a status must be a
member of the type's `states.values`, a key of the `values`/`initial`/`transitions` encoding `spec-001`
retired; no machine in `memory.yaml` uses it (`grep -n "transitions:\|initial:" .wingfoil/memory.yaml`
→ no output). It now names the states of `spec-001`'s machine. No other section changed.
