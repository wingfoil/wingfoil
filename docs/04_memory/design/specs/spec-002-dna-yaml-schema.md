---
id: spec-002-dna-yaml-schema
type: tech-spec
title: "dna.yaml schema (DnaYaml)"
status: approved
scope: ".wingfoil/dna.yaml"
supersedes: ""
tmpl_version: 260703   # Orignal template version
---

## Context

`dna.yaml` is the **Project DNA** configuration file (P2.4). It is a structural map of the project —
`project` identity, `modules`, `stacks` (technologies + methodologies), `team` (members / agents /
roles), and `paths` — that lets humans and agents navigate the project without full codebase scans.
WingFoil manages its own development, so the authoritative live instance is
`.wingfoil/dna.yaml` at the repository root (moved there from `docs/self/.wingfoil/dna.yaml` by
`task-111`).

Without a single shared schema definition, the CLI and the MCP server would each re-implement parsing
and validation of this file, and they could drift — a divergence forbidden by **REQ-SYS-05** (one
behaviour behind both surfaces). This spec pins the **DnaYaml** Zod schema that validates the file at
load time and is shared verbatim by:

- `wingfoil dna show` / `wingfoil dna set` — display and mutate the DNA map (P2.4).
- `wingfoil paths [category]` — query the `paths` section by category (P2.5).
- MCP Resource `wingfoil://dna` — read-only exposure of the same parsed structure (REQ-SYS-05).
- Any engine resolving role-to-directive bindings — role **names** are consumed from `team.roles`
  (see [Role binding](#role-binding-req-sys-08) below).

The schema is deliberately **project-shape-agnostic**: `stacks` holds flat, generically-shaped lists
rather than fixed per-surface keys, so the same schema fits a CLI tool, a web service, a GUI app, or a
batch job — not only WingFoil's own CLI+MCP shape.

## Specification

`DnaYaml` is the top-level Zod object. The TypeScript type is derived exclusively via
`z.infer<typeof DnaYaml>` — no hand-written duplicate `interface`. Every object node is declared with
`.passthrough()` (forward-compat convention): unknown keys are **preserved, not stripped**, so a file
written by a newer WingFoil version stays loadable by an older client, with validation still
succeeding.

### Top-level fields

| Field      | Type        | Required | Provenance                | Notes                                                          |
|------------|-------------|----------|---------------------------|----------------------------------------------------------------|
| `version`  | `number`    | yes      | [AUTHORING]               | Content revision (e.g. `1.1`, `dl-047`). `z.number().positive()`. |
| `format`   | `integer`   | no       | [SPEC: dl-149]            | The file's format; absent = `1`. See *`format`* below.         |
| `project`  | `Project`   | no       | [AUTHORING]               | Identity/strategy block; `north_star` is its one [SPEC] field. |
| `modules`  | `Module[]`  | yes      | [SPEC: P2.4]              | Ordered list of project modules.                               |
| `stacks`   | `Stacks`    | yes      | [SPEC: P2.4]              | Technologies + methodologies, as flat generic lists (see below). |
| `team`     | `Team`      | yes      | [SPEC: P2.4 / REQ-SYS-08] | Members, agents, and the canonical role catalogue.             |
| `paths`    | `Paths`     | yes      | [SPEC: P2.5]              | Resource path categories queried by `wingfoil paths`.          |

`conventions` is **not** a top-level field of `DnaYaml` — the "how we work" rules it used to hold now
live in `.wingfoil/directives/custom/` (see [Consequences](#consequences) for the value-by-value
mapping).

### Zod definition

```typescript
import { z } from "zod";

// Per-collection NAME UNIQUENESS. Entries of a collection are addressed by `name`
// (`dna update team.members.roberto.roles --value …`, dl-081 + dl-082-cli-parameter-shape), so two
// entries sharing one makes the address ambiguous — and the ambiguity would reach every reader that
// looks an entry up by name (resolveRoleHolders, the role bindings), not only the write verbs.
// Enforced here rather than in each verb so a violating document fails to LOAD, the same way Team's
// referential check below does. [SPEC: dl-081]
function uniquelyNamed<T extends z.ZodType>(entry: T): z.ZodArray<T> {
  return z.array(entry).superRefine((value, ctx) => { /* one issue per repeated `name` */ });
}

const Project = z.object({
  name:        z.string().optional(),
  description: z.string().optional(),
  license:     z.string().optional(),
  repository:  z.string().optional(),
  methodology: z.string().optional(),
  north_star:  z.string().optional(),   // [SPEC] Product Brief North Star / REQ-SYS-07
}).passthrough();

const Module = z.object({
  name:        z.string(),              // [SPEC: P2.4]
  description: z.string().optional(),   // [AUTHORING]
  path:        z.string().optional(),   // [AUTHORING]
}).passthrough();

// A technology in use. `category` is a FREE STRING, not a fixed enum — e.g. language, runtime,
// framework, library, testing, protocol, sdk, storage, distribution, versioning, and (for other
// project shapes) database, ui_toolkit, ci_cd, … This is what keeps the schema flexible across
// project shapes. [SPEC: P2.4] values ← Product Brief §Technical Stack; list/entry shape [AUTHORING].
const TechEntry = z.object({
  name:     z.string(),
  category: z.string(),
  version:  z.string().optional(),
  notes:    z.string().optional(),
}).passthrough();

// A practice/methodology in use. `phase` is a free string naming the workflow phase it is scoped to
// (e.g. inception, specification, delivery) when applicable; omitted when project-wide. [AUTHORING].
const MethodologyEntry = z.object({
  name:  z.string(),
  phase: z.string().optional(),
  notes: z.string().optional(),
}).passthrough();

// stacks replaces the old fixed-key tech_stack (cli/mcp/testing sub-objects). Both lists are
// optional so a minimal project may declare technologies without methodologies (or vice versa).
const Stacks = z.object({
  technologies:  uniquelyNamed(TechEntry).optional(),  // [SPEC: P2.4] (values) / [AUTHORING] (shape)
  methodologies: uniquelyNamed(MethodologyEntry).optional(), // [AUTHORING]
}).passthrough();

const TeamMember = z.object({
  name:  z.string(),
  email: z.string().optional(),
  roles: z.array(z.string()),           // role names → validated against team.roles[].name
}).passthrough();

const AgentEntry = z.object({
  name:               z.string(),
  executes_as:        z.array(z.string()),
  approval_authority: z.boolean().optional(),  // always false — agents never approve (REQ-SYS-08)
  // The adapter manifest that says HOW the agent is launched: its basename under
  // .wingfoil/agents/{built-in,custom}/, held to the shared id class [a-z0-9-.] (spec-009 §1).
  // Optional — an agent without one can be named but not launched. [SPEC: spec-016 §2.1]
  adapter:            z.string().refine(isIdPiece).optional(),
}).passthrough();

const RoleEntry = z.object({
  name:        z.string(),              // [SPEC: REQ-SYS-08] canonical role name
  description: z.string().optional(),   // [AUTHORING]
}).passthrough();

const Team = z.object({
  members: uniquelyNamed(TeamMember),   // [SPEC: P2.4]
  agents:  uniquelyNamed(AgentEntry).optional(),  // [AUTHORING] agent execution model
  roles:   uniquelyNamed(RoleEntry),    // [SPEC: REQ-SYS-08] canonical role catalogue
}).passthrough();

// paths: category name → list of path strings. Fixed category names per P2.5 / X_cli-cmds.md,
// but tolerant of extra categories via passthrough. `runs` holds EXACTLY one directory, the run
// log. [SPEC: spec-016 §4.1]
const Paths = z.object({
  sources:    z.array(z.string()).optional(),
  tests:      z.array(z.string()).optional(),
  docs:       z.array(z.string()).optional(),
  config:     z.array(z.string()).optional(),
  governance: z.array(z.string()).optional(),
  runs:       z.array(z.string()).length(1).optional(),
}).passthrough();

export const DnaYaml = z.object({
  version: z.number().positive(),
  format:  formatField(DNA_YAML_FORMAT),   // optional positive integer ≤ the format this build reads
  project: Project.optional(),
  modules: uniquelyNamed(Module),
  stacks:  Stacks,
  team:    Team,
  paths:   Paths,
}).passthrough();

export type DnaYaml = z.infer<typeof DnaYaml>;
```

### `format`

`version` is the file's content revision (`dl-047`); `format` (`dl-149`) is the format the file is
written in. It is optional and an absent key reads as format `1`, so a file written before the key
existed loads unchanged. A value that is not a positive integer is a schema error on `format`
(`E_VALIDATION`). `dna.yaml`'s format is bumped **only** on a backward-incompatible change of its shape;
an additive, optional field does not bump it. The highest format this build reads is
`DNA_YAML_FORMAT` (`1`), declared once in `src/validation/format.ts` beside every other file kind's. A
file whose `format` is higher is refused by the loader **before** the structural pass, as the one issue
`E_INVALID_FORMAT` on `format`, exit `1` (`spec-005` §1; `spec-009` §3), message
`this file is written in format <N>; this WingFoil reads up to format <M>: upgrade WingFoil`. `dna set`
cannot write a format this build does not read: the post-edit validation refuses it. `wingfoil init`
writes `format: <current>`.

### `stacks` — why a generic list

The old `tech_stack` object used fixed keys (`cli: { framework, formatting }`, `mcp: { protocol,
transport, sdk }`, `testing: { framework, coverage_target }`, …). That shape only fits a TypeScript
CLI+MCP project. `stacks` instead holds two flat lists whose entries are generically shaped:

- `stacks.technologies` — `{ name, category, version?, notes? }`. `category` is a free string, so a
  web service can declare `database` / `http_framework`, a GUI app `ui_toolkit`, etc., without any
  schema change.
- `stacks.methodologies` — `{ name, phase?, notes? }`. Lets agents discover which practices apply and,
  via `phase`, when. Representative values on this project: Lean Inception (inception), User Story
  Mapping / Specification by Example (BDD) / SARD (specification), TDD (delivery).

Beyond navigation, `stacks` is what lets an engine select which directive content (`testing`,
`code-quality`, `architecture`, …) is relevant for a given technology or methodology.

### Role binding (REQ-SYS-08)

`team.roles` is the **canonical role catalogue**: each entry is `{ name, description? }`, and it
enumerates every role the project recognises (`developer, reviewer, qa, architect, product-owner,
tech-lead, facilitator, approver`). Role names referenced elsewhere — `team.members[].roles`,
`team.agents[].executes_as`, and the bindings in `.wingfoil/roles.yaml` and workflow/directive
definitions — are **referenced by name** and semantically validated against this list. This keeps a
single source of truth for "what roles exist" (BDD `P4.20` — role not defined in `dna.yaml`). Agents
execute under a role but never hold approval authority; `agents[].approval_authority`, when present,
is always `false`.

`team.roles` is **not** delegated to `.wingfoil/roles.yaml`: that file *binds directives to roles*
(P3.2/P3.7) — it is keyed by role name but does not define the role set. It omits `facilitator` and
`approver` (which carry no directive bindings) and carries no per-role `description`, so it cannot
serve as the catalogue. `dna.yaml` therefore remains the authoritative role registry.

### Unknown keys: accepted on read, refused on write

Every node is `.passthrough()`, which is a statement about **reading**: a document carrying fields a
newer (or older) WingFoil does not know still loads, and those fields are preserved rather than
stripped. It is **not** a statement about writing. A write command resolves its `<path>` argument
against this schema and **refuses a path the schema does not declare rather than creating it**
(`dl-081-dna-mutation-surface-shape`, ratified; implemented in `src/dna/path.ts`); the refusal is a
validation failure, exit `1` per `spec-005-cli-command-contract` §1.

The two halves are deliberately asymmetric. Pass-through on read is forward compatibility; pass-through
on **write** meant `dna set nonsense.at.any.depth --value v` invented a key at any depth and committed it at
exit `0`, in the pillar every other pillar reads
(`bug-084-dna-key-alias-writes-unschemad-keys`). Creating a node the schema **declares** and the
document merely omits — an absent optional `project:`, an absent `paths.tests` — is not that case and
stays legal; it is the only way an optional section can ever be filled.

A consequence worth stating: `tech_stack` is not an alias on the write path. `dna show tech_stack`
still resolves to `stacks` (see Consequences below), but `dna set tech_stack.<key> --value <v>` is refused as
the unknown key it is, because `stacks` replaced a fixed-key object and a first-segment rewrite cannot
perform a change of shape.

### Categories (P2.5)

`wingfoil paths [category]` queries `paths` by the six category names **sources, tests, docs, config,
governance, runs** (X_cli-cmds.md; `runs` per `spec-016-agent-execution` §4.1). Each maps to an
ordered `string[]`; missing categories are permitted, and `.passthrough()` allows a future category to
be added without invalidating existing files.

`runs` is the one category with a cardinality rule: it names the directory of the agent run log
(`<runs>/<element-id>.jsonl`), so it holds **exactly one** entry, and a document declaring zero or two
is a validation error at `paths.runs`. `wingfoil init` scaffolds `paths.runs: [docs/runs/]`.
`governance` was not reused for it, because it already holds `.wingfoil/` and the run log would be
ambiguous there (`spec-016` §4.1).

### Minimal valid instance

```yaml
version: 1.1
modules:
  - name: core
    path: src/core
stacks:
  technologies:
    - name: TypeScript
      category: language
    - name: Node.js
      category: runtime
      version: "18+"
team:
  members:
    - name: Roberto Pompermaier
      email: robypomper@gmail.com
      roles: [ developer, approver ]
  roles:
    - name: developer
    - name: approver
paths:
  sources: [ src/ ]
  tests: [ test/ ]
  docs: [ docs/ ]
  config: [ package.json ]
  governance: [ docs/self/.wingfoil/ ]
```

## Consequences

- **Load-time contract.** Every `wingfoil` invocation validates `dna.yaml` against `DnaYaml` before
  running; a schema failure is fatal (the command aborts). CLI and MCP share this exact schema
  (REQ-SYS-05), so neither surface can accept a file the other rejects.
- **`stacks` replaces `tech_stack`.** The fixed-key `cli`/`mcp`/`testing` sub-objects are gone; the
  same facts are now list entries. Every former `tech_stack` value survives as a
  `stacks.technologies` entry — `language: TypeScript` → `{ name: TypeScript, category: language }`,
  `mcp.transport: stdio` → folded into the Model Context Protocol entry's `notes`, `testing.coverage_target: ">80%"`
  → the Jest entry's `notes`, `versioning: semantic versioning` → `{ name: semantic versioning,
  category: versioning }`, and so on. Any consumer that read `tech_stack.<key>` must now scan
  `stacks.technologies` by `name`/`category`.
- **`conventions` removed; every value relocated (nothing lost).** The former `conventions:` section
  is gone from `dna.yaml`; its rules now live where they are actually enforced:

  | Former `conventions` value                        | New home                                                     |
  |---------------------------------------------------|--------------------------------------------------------------|
  | `documentation.versioning`                        | `directives/custom/doc-versioning.md` (already stated it)    |
  | `documentation.traceability`                      | `directives/custom/traceability.md` (already stated it)      |
  | `engineering.methodology` (TDD / test-first)      | `directives/custom/testing.md` (already stated it)           |
  | `engineering.coverage` (`>80% (Jest)`)            | `directives/custom/testing.md` (already stated it)           |
  | `engineering.versioning` (semantic versioning)    | `stacks.technologies` — the `semantic versioning` entry      |
  | `process.determinism`                             | `directives/custom/determinism.md` (already stated it)       |
  | `process.commits` (conventional commits; state change = git commit w/ author + timestamp) | `directives/custom/code-quality.md` — **new bullet added**   |
  | `process.release_cadence` (~1 release/week, one pillar per release) | `directives/custom/traceability.md` — **new bullet added**, tied to task→release assignment |

  The first six were already covered by an existing directive (or, for semantic versioning, by the
  `stacks` list) and were simply dropped. The last two were not captured anywhere, so they were
  **added** to the directive files noted above rather than lost.
- **`team.roles` stays load-bearing.** It is the canonical role registry (REQ-SYS-08 / BDD P4.20);
  removing it would break role-name validation. `roles.yaml` binds directives to roles but does not
  define the role set, so it is not a substitute.
- **Forward-compatible.** Because every node is `.passthrough()`, additive fields do not break older
  clients — schema evolution can proceed without a hard version bump, provided existing required
  fields are preserved.
- Depends on this staying stable: `wingfoil dna show/set`, `wingfoil paths`, the `wingfoil://dna` MCP
  Resource, and any role-binding resolution.

## Process Notes

**Revision (2026-09-23) — the six object collections gain a per-collection `name` uniqueness
refinement, and the write path's treatment of unknown keys is stated, per
`dl-081-dna-mutation-surface-shape` (`ready`, approve commit `5aaa5af`) and
`task-093-dna-mutation-surface-add-remove-update`.** Two things this spec did not say, both now
load-bearing:

- *Uniqueness.* `dl-081` ratified addressing entries by `name` rather than by index, which makes
  uniqueness a prerequisite rather than a convention; the schema carried no constraint keeping it
  (the one refinement was `Team`'s referential check). The ratification left the mechanism open — a
  refinement per collection, or verbs that refuse on more than one match — and the refinement was
  chosen, because it makes the ambiguity unreachable and protects readers that are not verbs.
  Measured non-breaking before adoption: WingFoil's own `dna.yaml` carries 38 object entries across
  these six collections with zero duplicates, and both registered `wingfoil init` templates scaffold
  distinct names (pinned by `test/dna/schema-uniqueness.test.ts` over the real `templateScaffold`
  output, so a future template cannot introduce one silently).
- *Unknown keys.* This spec ratified `.passthrough()` on every node without saying whether it governs
  writes as well as reads. It does not, and the new *Unknown keys* section above says so. Nothing
  about the read contract changed.

Edited in place without a supersede or a state change, per the `dl-041` / `spec-001` precedent
`spec-006`'s 2026-09-17 revision cites.

**Revision (2026-09-24) — the write-path examples are respelled to `dl-082-cli-parameter-shape`'s
grammar.** `dl-082` (`ready`) moves a DNA verb's path out of `--field` into a positional, and turns
`dna set`'s second positional into `--value`, under a rule the other nine `dna`/`memory` commands
already followed: a positional carries the identity of the target, an option a named attribute of the
action. Nothing in this schema changes — not a field, not a refinement, not the read/write asymmetry
the 2026-09-23 revision added. Only the three invocations quoted above are respelled, so a reader
copying one out of this document gets a command that runs. `spec-008` §9 holds the grammar itself.

Edited in place without a supersede or a state change, per the `dl-041` / `spec-001` precedent
`spec-006`'s 2026-09-17 revision cites.

**Revision (2026-09-24) — the path form a write resolves against may quote a segment, and no character
constraint joins `uniquelyNamed`, per `dl-083-dotted-entry-names-in-paths` (`ready`) and `task-099`.**
The *Unknown keys* section above describes a write resolving its `<path>` against this schema, and the
2026-09-23 revision made `name` the key an entry is addressed by. Neither said what happens when a
`name` contains a `.` — and three do, in the file this spec scopes: measured at `c2102c87`,
`stacks.technologies` carries `Node.js` and `Commander.js`, and `team.agents` carries
`AI agent (Claude/Cursor/etc.)`.

Two things follow, and the second is the one that belongs in a schema document:

- *The path.* A segment may be double-quoted and is then taken verbatim, dots included:
  `dna update 'stacks.technologies."Node.js".version' --value 22.14+` (the outer single quotes are the
  **shell's**, the inner double quotes are **WingFoil's**). `spec-008` §9 holds the grammar itself.
- *The schema.* **No dot constraint is added.** `uniquelyNamed` remains the only per-collection
  refinement, and nothing constrains the characters a `name` may contain. The alternative — extending
  that refinement, which is the cheapest change and the one uniqueness itself took — was declined:
  because the refinement runs inside `DnaYaml`, and therefore on every `loadDnaYaml`, it would reject
  this project's own configuration **on read** rather than on write; and because `Node.js`,
  `Commander.js`, `Vue.js`, `Socket.io` and `ASP.NET` are the correct names of the things they name, so
  a schema that cannot hold them fails at the one thing it exists to do (`bug-091`'s Correction;
  `dl-083`'s Rationale declines it on the second ground even for a clean corpus).

`test/dna/path-quoting.test.ts` carries the three live names as a fixture and asserts both halves — the
document loads, and each name is addressable — so a future dot constraint goes red rather than landing
silently.

Edited in place without a supersede or a state change, per the `dl-041` / `spec-001` precedent
`spec-006`'s 2026-09-17 revision cites.

**Revision (2026-09-29) — the live instance's path, per
`task-111-configuration-moves-to-the-repository-root` (`bug-075`).** The Context named
`docs/self/.wingfoil/dna.yaml` and said it "will move to the repository-root `.wingfoil/dna.yaml`";
that task moved it. The illustrative example under Specification is not the live file and keeps its
values. Edited in place without a supersede or a state change (the `spec-001` precedent `dl-041` cites); pending the approver's sign-off at that task's review.

**Revision (2026-10-01) — `team.agents[].adapter` and the sixth `paths` category, `runs`, are
declared, per `task-138-dna-yaml-declares-team-agents-adapter-runs-paths` and `spec-016-agent-execution`
§2.1 and §4.1 (approver ruling R18, `release-planning-rel-v0.3-plan`).** Both were already tolerated on
read by `.passthrough()`, which is why `spec-016` could name them before this spec did; but the
*Unknown keys* section above refuses an undeclared path on write, so `dna update team.agents.<name>
--entry-adapter <a>` and `dna add paths.runs --value <dir>` were refused until they were declared here.
`adapter` takes the shared id class (`spec-009` §1) because it is a manifest's file basename; `runs`
takes exactly one entry because two would make where a run is recorded ambiguous. Nothing else in the
schema changes, and a document carrying neither field — this repository's own included, until the tasks
that adopt them land — loads as before (`test/dna/schema.test.ts`, "validates the real, live
.wingfoil/dna.yaml").

Edited in place without a supersede or a state change, per the `dl-041` / `spec-001` precedent
`spec-006`'s 2026-09-17 revision cites.

**Revision (2026-10-05, `task-251-add-the-format-key-to-the-config-workflow-directive-and-template-schemas-check-it-in-the-loaders-and-write-it-in-the-init-scaffold`)
— the `format` key (`dl-149`).** The top-level table and the Zod listing gain the optional `format`
field, and a new *`format`* section gives its default (absent = 1), its bump rule and the newer-format
refusal. `version`'s row, which called it the "config-file format version", now calls it the content
revision (`dl-047`). Every file valid before stays valid. Edited in place, with no `version:` bump
(`dl-047`); pending the approver's sign-off at `task-251`'s review.
