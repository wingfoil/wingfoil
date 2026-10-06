---
id: "spec-013-directive-frontmatter-schema"
type: tech-spec
title: "Directive frontmatter schema: the Directives pillar's per-file YAML frontmatter shape"
status: approved
scope: ".wingfoil/directives/**/*.md frontmatter (the Directives pillar file shape loaded by src/directives)"
supersedes: ""
tmpl_version: 260703
---

## Context

The Directives pillar is one of the four independently-loadable config artefacts required by
**REQ-SYS-02** (`docs/02_requirements/03_sard/01_architecture.md`) — alongside `memory.yaml` (DNA
`spec-001`), `dna.yaml` (`spec-002`), and `workflows.yaml` (`spec-003`). Each pillar "owns its own
schema and its own validation pass", and `task-004-decoupled-pillars` built the per-pillar loaders
(`src/directives` → `DirectiveFrontmatter`, wired through `src/core`'s pillar loaders and the shared
two-pass pipeline of `spec-009`).

Unlike the other three pillars, the Directives pillar had **no dedicated tech-spec** when its schema
was first written: `spec-010-memory-frontmatter-schema`'s scope is explicitly
`docs/04_memory/**/*.md` (Memory documents), **not** `.wingfoil/directives/**`. So the
`DirectiveFrontmatter` schema shipped in `task-004` as an explicit `[AUTHORING]` shape grounded in the
ten files then under `.wingfoil/directives/custom/*.md` (twelve today), with a single field (`name`)
traced to a BDD scenario. This spec closes that traceability gap: it is the authoritative definition
of the Directives-pillar file shape, retroactively blessing (and where noted, constraining) the shape
`task-004` implemented. It is deliberately **minimal** — it fixes only what the loader must enforce to
keep the pillar decoupled and to satisfy the one BDD contract that touches directive frontmatter; it
does **not** specify directive *body* content (the rule text a directive carries), which is authored
prose, not a validated schema.

Two upstream anchors bound this shape:

- **P3.5 (project directives)** — `docs/02_requirements/02_bdd/features/p3-directives/P3.5-project-directives.feature`
  has an explicit "Error — a directive file missing required header fields" scenario: a custom
  directive file that lacks its required `name` header is reported as invalid. This is the one
  hard `[SPEC]` requirement in the schema.
- **P3.8 (built-in directive templates)** — the official P3.8 templates ship since
  `task-057-builtin-directive-templates`: `wingfoil init` installs them under `directives/built-in/`
  with `kind: built-in`. This repository's own configuration predates them and still keeps the six
  as `kind: custom` stand-ins citing `ref: [P3.8]` (`.wingfoil/README.md`). Reconciling the two is
  out of scope of `bug-040`, which corrected only the documentation that said the templates did not
  exist, and is not scheduled. The schema accepts both `kind` values without change.

> **Note on the `task-004` Acceptance Criteria wording.** REQ-SYS-02's AC (and `task-004`'s copy of
> it) writes the fourth pillar as `directives/*.yaml`. The real files are **`.md` with YAML
> frontmatter**, not `.yaml`. That AC phrasing is a literal error; this spec uses the real extension.

## Specification

### File shape

A Directives-pillar file is a Markdown file under `.wingfoil/directives/{custom,built-in}/`
whose leading YAML frontmatter block (delimited by `---` … `---`, extracted per `spec-011`'s storage
layer) validates against the schema below. The Markdown body after the frontmatter is the directive's
rule text and is **out of scope** for this spec (not schema-validated).

### Frontmatter fields

Validated structurally (`spec-009` Pass 1, Zod) with `.passthrough()` — unknown keys are preserved and
surface as a warning (`spec-009` §2), never a failure, so the shape stays forward-compatible.

| Field   | Type                | Req?      | Provenance    | Notes |
|---------|---------------------|-----------|---------------|-------|
| `id`    | string              | required  | `[AUTHORING]` | Stable directive identifier (e.g. `code-quality`); matches the filename stem. |
| `name`  | string              | required  | `[SPEC]` P3.5 | Human-readable directive name. **The one field whose required-ness is mandated by an upstream BDD scenario** — a file lacking it is reported invalid (P3.5 "missing required 'name' header"). |
| `type`  | literal `directive` | required  | `[AUTHORING]` | Pillar discriminator; every directive file carries exactly `type: directive`. |
| `kind`  | string              | required  | `[AUTHORING]` | `custom` (the P3.8 stand-ins today) or `built-in` (once official templates ship). Left as `string`, not an enum, so `built-in` needs no schema change (see Context, P3.8). |
| `title` | string              | required  | `[AUTHORING]` | Display title; currently identical to `name` on every file, but kept distinct to mirror the other pillars' `title`. |
| `tags`  | string[]            | optional  | `[AUTHORING]` | Free-form classification tags. |
| `ref`   | string[]            | optional  | `[AUTHORING]` | Upstream traceability references (feature IDs like `P3.8`, REQ codes, or requirement doc paths). May be empty (`[]`) for pure-WingFoil conventions (e.g. `doc-versioning`). |
| `scope` | string              | optional  | `[AUTHORING]` | `global` declares that the directive binds every role — the one value this spec defines. **`roles.yaml`'s `global:` list is the authority**, not this key: see *`scope` and `roles.yaml`* below. Any other value loads and is reported by `directives list`, never a validation failure (forward compatibility). |
| `version` | string \| number  | optional  | `[AUTHORING]` | The directive's document version, where it declares one (`doc-versioning`; approver ruling 2026-10-01). A string or a number, like `memory.yaml`'s and `roles.yaml`'s `version`; never a reason to fail the pillar — see *`version`* below. |
| `format` | integer (positive) | optional | `[SPEC]` `dl-149` | The frontmatter's format, distinct from `version`; absent = `1`. See *`format`* below. |

### Reference implementation

`src/directives/schema.ts` (`task-004-decoupled-pillars`) is the shipped realization:

```ts
export const DirectiveFrontmatter = z
  .object({
    id: z.string(),
    name: z.string(),
    type: z.literal('directive'),
    kind: z.string(),
    title: z.string(),
    tags: z.array(z.string()).optional(),
    ref: z.array(z.string()).optional(),
    scope: z.string().optional(),
    version: z.union([z.string(), z.number()]).optional(),
    format: formatField(DIRECTIVE_FORMAT),
  })
  .passthrough();
```

### `scope` and `roles.yaml`

A directive binds every role when `roles.yaml`'s `global:` list names its `id` (`spec-012` §5). That
list is the **authority**: context assembly and `directives list` read it, and a directive's `scope`
never changes a binding. `scope: global` is the same fact stated in the directive file, for its
reader. Only a **declared** `scope` is compared: a file without one claims nothing and is never
reported, so a project that never writes `scope` lists clean. `directives list` (without a role
filter) reports, in its own `warnings` array, at most one entry per directive id, comparing the file
in force (`dl-037`):

- the file declares `scope: global` and `global:` does not list the id — the directive is not global;
- the file declares another value and `global:` lists the id — the directive is global;
- the file declares another value and `global:` does not list the id — the value is undefined here
  and has no effect.

A `global:` id with no directive file is not a scope disagreement. A shipped built-in template
declares no `scope`: whether a directive binds every role is the project's `roles.yaml` to say.

### `version`

A `version` never fails the Directives pillar. A quoted value loads as written. An unquoted YAML
number loads as the number it parses to; when that number does not read back as written (`1.10` →
`1.1`, `1.0` → `1`), loading warns the author to quote it. A value that is neither a string nor a
number is dropped with a warning, and the rest of the file loads. These warnings are spec-009 §2
stderr warnings (`Warning: <file>: …`), like the unknown-field one.

### `format`

`version` is the directive's document revision; `format` (`dl-149`) is the format its frontmatter is
written in. It is optional, and an absent key reads as format `1`, so every directive written before
the key existed loads unchanged. A value that is not a positive integer is a schema error on `format`
(`E_VALIDATION`), which fails the pillar like any other schema error. The format is bumped **only** on a
backward-incompatible change of this frontmatter's shape; an additive, optional field such as `scope`
does not bump it. The highest format this build reads is `DIRECTIVE_FORMAT` (`1`), declared once in
`src/validation/format.ts` beside every other file kind's. A directive whose `format` is higher is
refused **before** the structural pass, as the one issue `E_INVALID_FORMAT` on `format`, exit `1`
(`spec-005` §1; `spec-009` §3), message
`this file is written in format <N>; this WingFoil reads up to format <M>: upgrade WingFoil`.
`wingfoil init` writes `format: <current>` in every directive it scaffolds, built-in and custom.

`roles.yaml` follows the same rule with its own counter, `ROLES_YAML_FORMAT` (`1`): an optional
top-level `format`, absent = `1`, a newer one refused by its loader and by `directive assign`, which
never rewrites a file in a format it does not read.

### Isolation obligation (REQ-SYS-02)

The Directives loader (`loadDirectives` in `src/core`) validates each directive file independently and
must not depend on `memory.yaml`, `dna.yaml`, or `workflows.yaml` — a validation failure in any other
pillar must not block loading directives, and vice versa (exercised by `task-004`'s
`test/core/pillar-isolation.test.ts`).

## Consequences

- **Stable for:** `task-004-decoupled-pillars` (the loader already built against this shape) and any
  later Directives-pillar feature work (P3.5/P3.6/P3.8 — directive loading, role→directive binding,
  built-in templates). Those consume this shape rather than re-deriving it.
- **`[AUTHORING]` fields may tighten later.** Only `name`'s required-ness is `[SPEC]` (P3.5). The
  required-ness of `id`/`type`/`kind`/`title` is authoring-level, grounded in "every current file
  carries them". If a legitimate future directive omits one, `loadDirectives` would reject the whole
  pillar — revisit this spec (and the schema) before adding such a file, rather than loosening it
  reactively. Making any of them optional is a backward-compatible change; making a new field
  required is not.
- **`kind` stays a `string`, not an enum**, precisely so the eventual P3.8 `built-in` directives load
  without a schema/spec change. If a closed value set is ever wanted, that is a superseding revision.
- **Body content is not governed here.** A separate spec would be needed if directive *rule text*
  ever gains a required structure (e.g. mandatory sections) — this spec is frontmatter-only.

## Process Notes

Authored **reactively** as a fast-follow to `task-004-decoupled-pillars`, not proactively by
`release-planning/identify-specs`. Why identify-specs missed it: the release's spec sweep enumerated
one schema spec per *config file* it already knew needed one (`spec-001/002/003` for the three
`.yaml` pillars) but did not register the Directives pillar as needing its own file-shape spec — the
Directives pillar's files are Markdown-with-frontmatter (visually closer to Memory documents, which
`spec-010` already covered) rather than a standalone `.yaml`, so it fell between the two. `task-004`'s
`design` phase surfaced the gap but, on the approver's instruction, proceeded with an `[AUTHORING]`
schema and deferred the spec to this fast-follow rather than halting the task. Feedback for planning:
when a pillar is enumerated in a REQ (REQ-SYS-02 lists four), cross-check that each has either its own
schema spec or an explicit note that it shares another's — the Directives pillar had neither.

**Revision (2026-10-01) — `scope` and `version` declared, per `task-144-declare-directive-scope-report-when-disagrees-roles-yaml`
(`bug-113`, `bug-148`; approver ruling 2026-10-01 at `task-128`'s review for `version`, and approver
rulings R1–R3 of 2026-10-02 at `task-144`'s review).** `scope` becomes a declared optional string, so
it no longer prints the unknown-field warning on every global directive; `global` is the one value
defined, and any other is a `directives list` warning, never a validation failure. The new *`scope`
and `roles.yaml`* section states that `roles.yaml` decides and that `directives list` reports a
declared `scope` contradicting it; an absent `scope` is not reported, and built-in templates declare
none. `version` becomes a declared optional string or number, so a directive declares its
`doc-versioning` version in the frontmatter rather than a `**Version:**` body line; the new
*`version`* section makes it never a reason to fail the pillar. Every directive file valid before
stays valid, except one whose `scope` is not a string (a list, a number), which no directive in this
repository or in the `init` scaffold carries. The Context is brought up to date: the P3.8 built-ins ship, and the custom directives
are twelve.

**Revision (2026-10-05, `task-251-add-the-format-key-to-the-config-workflow-directive-and-template-schemas-check-it-in-the-loaders-and-write-it-in-the-init-scaffold`)
— the `format` key (`dl-149`).** The field table and the reference implementation gain the optional
`format` field, and a new *`format`* section gives its default (absent = 1), its bump rule, the
newer-format refusal, and the same key in `roles.yaml`. Every directive valid before stays valid.
Edited in place without a supersede or a state change (`dl-047`); pending the approver's sign-off at
`task-251`'s review.

**Revision (2026-10-05, `task-188-correct-spec-011-bindings-id-stale-builtin-templates`) — who owns
the stand-in reconciliation.** The P3.8 anchor said reconciling the stand-ins with the shipped
templates "is `bug-040`". `bug-040` corrected only the documentation that called the templates
unimplemented; the reconciliation is out of its scope and not scheduled, as the stand-ins' own note,
`roles.yaml`'s header and `spec-011`'s `built-in/` paragraph now say. No field, rule or other section
changed. Edited in place without a supersede or a state change (`dl-047`); pending the approver's
sign-off at `task-188`'s review.
