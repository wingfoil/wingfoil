---
id: spec-003-workflows-yaml-schema
type: tech-spec
title: "workflows.yaml manifest + Workflow DSL schema"
status: approved
scope: ".wingfoil/workflows.yaml + .wingfoil/workflows/**/*.yaml"
supersedes: ""
tmpl_version: 260703   # Orignal template version
---

## Context

The Project Workflow pillar (P4.1) is configured by two kinds of YAML file that today have
**no shared, validated definition**:

1. **The main manifest** — `.wingfoil/workflows.yaml`. It carries a content revision `version`, a `format` (`dl-149`) and
   a single ordered list of workflow-file paths to load (P4.1: *"main file `.wingfoil/workflows.yaml`
   includes built-in/custom workflows"*). Every WingFoil command reads it at startup to build the
   workflow registry; a divergent or unvalidated shape breaks `workflow list/start/next/status`
   (P4.2–P4.6) and the `wingfoil://workflows` MCP resource.
2. **The per-workflow definition files** — `.wingfoil/workflows/**/*.yaml` (currently all
   under `custom/`). Each declares a workflow's `kind`, its bound `element`, and its ordered `phases`
   with roles, atomic actions, composition (`include`/`iterate_over`/`where` — P4.16), deliverables
   (`produces`), gates (`checks`, `approval`), and routing (`fallback`). These are loaded and executed
   but never structurally validated, so a typo in a phase field surfaces only as a runtime failure.

Without a single schema, every consumer re-parses these files ad hoc and each new workflow author
guesses field names. The `initial-design` scope for rl-v1 requires validating **both** layers, so
this spec covers the manifest **and** the workflow DSL, grounding every DSL field in the workflow
files that already exist in this repository.

The original version of this spec mandated one config change, renaming the manifest key `includes:`
(plural) to `include:` (singular). The rename is done: `.wingfoil/workflows.yaml:14` reads `include:`
and its comment at `:11` names the singular key canonical.

A third file, the **token-binding file** `.wingfoil/workflows/bindings.yaml` (Layer 3), was added
by the 2026-09-30 revision (`dl-090`): it declares which command each `actions:` and `checks:` token
runs, so that the engine never has to guess what a free-form string means. The same revision makes
every phase declare how its completion is known (`dl-104`), which is what lets `spec-017` deduce
workflow state without a stored status.

## Specification

Three layers are defined. Every file is parsed as YAML (via the shared parse infrastructure) and then
structurally validated: layer 1 for `workflows.yaml`, layer 2 for every file it lists, layer 3 for
`workflows/bindings.yaml` when it exists. Cross-file and cross-phase rules run after all three are
loaded (§ "Diagnostics").

### Layer 1 — `WorkflowsYaml` (the main manifest)

Resolved against `.wingfoil/workflows.yaml` under the project root. Fields:

| Field     | Type                 | Required | Description                                                                                                                            |
|-----------|----------------------|----------|--------------------------------------------------------------------------------------------------------------------------------------|
| `version` | number (positive)    | no       | Content revision (e.g. `1.0`, `dl-047`). Accepted but not required, for forward compatibility.                                        |
| `format`  | integer (positive)   | no       | The manifest's format (`dl-149`); absent = `1`. See § "Format".                                                                     |
| `include` | string[] (min 1)     | yes      | Ordered list of paths to workflow-definition YAML files, each resolved relative to the directory containing `workflows.yaml` (`.wingfoil/`). At least one path is required. |

```yaml
# workflows.yaml — layer-1 shape (canonical key: `include`, singular)
version: 1.0
include:
  - workflows/custom/sw-life-cycle.yaml        # startable (kind: main)
  - workflows/custom/bug-ingest.yaml           # startable (kind: main)
  - workflows/custom/release-line-cycle.yaml   # includable only
  - workflows/custom/dev-loop.yaml             # includable only
```

Zod shape:

```ts
export const WorkflowsYaml = z.object({
  version: z.number().positive().optional(),
  format: formatField(WORKFLOWS_YAML_FORMAT),
  include: z.array(z.string()).min(1),
});
```

**An absent manifest is an empty registry.** A project with no `.wingfoil/workflows.yaml` has no
workflows: loading yields an empty registry with no diagnostic, and the workflow commands report
`no workflows defined` (BDD `P4.6-workflow-list.feature` sc. 4; the command contract is `spec-017`'s).
A manifest that exists must satisfy this layer in full — `include` with at least one path and at
least one startable workflow among the files it loads.

Resolution semantics for each `include` path:

1. Resolve the path against the config root (`.wingfoil/`).
2. Verify the file exists; otherwise → `E_WORKFLOW_FILE_NOT_FOUND` (semantic, post-parse).
3. Parse and validate the referenced file against **Layer 2** (below). At least one loaded workflow
   must be **startable** (Layer 2 `startable: true`, or the `kind: main` alias) for the registry to
   be startable (REQ-STATE-03 allows several open mains); otherwise → `E_NO_MAIN_WORKFLOW`. The code
   keeps the name it had when its condition was "no `kind: main`"; the condition is now the
   `startable` flag (`dl-109` Action 1).

**A manifest `include` is a file path; a phase `include` (Layer 2) is a workflow name.** The two
share a key and a string type but not a value domain (`bug-144`): the manifest names files to load,
a phase names a workflow that one of those files declares. A path written in a phase `include` is
not resolved as a path; it fails the name-resolution check below.

> **Rename `includes` → `include` (done).** The original version of this spec made `include:`
> (singular) canonical — matching the P4.1 prose and the `include:` phase field of Layer 2 — and
> required renaming the manifest key. The rename is done (`.wingfoil/workflows.yaml:14`). The schema
> validates only `include` and treats `includes` as an unknown key.

### Layer 2 — `Workflow` DSL (one per file under `workflows/**/*.yaml`)

Every workflow-definition file validates against the following schema. Top-level fields:

| Field         | Type                    | Required | Description                                                                                                                                    |
|---------------|-------------------------|----------|----------------------------------------------------------------------------------------------------------------------------------------------|
| `name`        | string, `[a-z][a-z0-9-]*` | yes    | Unique workflow identifier; the token passed to `wingfoil workflow start` (startable workflows) or named by a phase's `include:` (includable workflows). The character class keeps `<workflow>.<phase>` splittable at its first `.` (§ "Names") — `E_WORKFLOW_NAME_INVALID`. |
| `startable`   | boolean                 | see below | `true` = the workflow may be started on its own (P4.2; REQ-STATE-03: multiple open startable workflows allowed). `dl-109` K1 (a).            |
| `includable`  | boolean                 | see below | `true` = a phase of another workflow may `include:` it (P4.1, P4.16). `dl-109` K1 (a).                                                      |
| `kind`        | `main` \| `sub`         | see below | **Alias kept readable during v0.3** (`dl-109` K1 (a)): `main` ≡ `startable: true, includable: false`; `sub` ≡ `startable: false, includable: true`. |
| `description` | string                  | no       | Human summary of the workflow's purpose.                                                                                                      |
| `version`     | number (positive)       | no       | The workflow file's content revision (e.g. `1.0`, `dl-047`).                                                                                  |
| `format`      | integer (positive)      | no       | The workflow file's format (`dl-149`); absent = `1`. See § "Format".                                                                        |
| `element`     | string (memory type)    | no       | The Memory element type this workflow operates on. When the workflow is included, it comes from the parent's `iterate_over`, or, for a plain `include`, from the including workflow's own bound element of the same type (`E_WORKFLOW_ELEMENT_MISMATCH` otherwise). When the workflow is started on its own, the start command provides it (`--element <type:id>`, falling back to the active context — `dl-109` K2). A startable workflow that declares no `element` and whose own phases `memory.add` an element is **self-creating**: the element its first such action creates becomes the instance's element. The command contracts are `spec-017`'s (§3.4). Absent for workflows that manage no single element. |
| `phases`      | `Phase[]` (min 1)       | yes      | Ordered list of phases; executed top to bottom (subject to `fallback` routing).                                                              |

**Startable and includable are two facts** (`dl-109`). A workflow declares **either** `kind` **or**
one or both of `startable` / `includable`:

- with `kind` only, the two facts follow the alias above, so every workflow file on disk validates
  unchanged (23 files, each `kind: main` or `kind: sub`: `grep -L "^kind: \(main\|sub\)$"
  .wingfoil/workflows/custom/*.yaml` → nothing);
- with the booleans, at least one of them is `true` (`E_WORKFLOW_NEITHER_STARTABLE_NOR_INCLUDABLE`);
  an absent boolean reads as `false`;
- declaring `kind` **and** either boolean is `E_WORKFLOW_KIND_CONFLICT` — one fact, one field;
- an unknown `kind` value keeps BDD `P4.1-workflow-config.feature`'s refusal
  (`invalid workflow kind 'hybrid' (allowed: main, sub)`, `E_WORKFLOW_INVALID_KIND`).

Each **`Phase`** object:

| Field           | Type                          | Required | Description                                                                                                                                                              |
|-----------------|-------------------------------|----------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `name`          | string, `[a-z][a-z0-9-]*`     | yes      | Phase identifier, unique within the workflow; also the target token for `fallback.step` and for `distinct_from`. The character class is `spec-009`'s ID characters `[a-z0-9-.]` without the `.` and starting with a letter, so a phase name is a legal segment of a run id (`spec-016`) and `<workflow>.<phase>` splits at its first `.` — `E_PHASE_NAME_INVALID`. The name `adhoc` is reserved for a run without a step (`spec-016`: no `--next`, `--workflow` or `--step`) — `E_PHASE_NAME_RESERVED`. |
| `description`   | string                        | no       | What the phase does and why.                                                                                                                                            |
| `role`          | string (a `dna.yaml` role)    | no       | The role executing the phase; its directives auto-load (P3.6). **This is the only path by which a directive reaches a phase**: the directives in force for a phase are exactly those `roles.yaml` binds to its `role`, plus `global` (`dl-066` option 1). A phase carries no directive reference of its own, so the referrer source for P3.3 / REQ-SEC-07 clause (b) is `roles.yaml` alone, workflow phases included by transitivity. Omitted when the phase only `include:`s another workflow (the included phases carry their own roles). |
| `optional`      | boolean (default `false`)     | no       | If true the phase may be skipped without failing the workflow: in v0.3 when a later phase of the same workflow is complete (`spec-017` §4.10); from v1.0 also when its `checks.pre` are unmet (P4.12). |
| `actions`       | string[]                      | no       | Ordered **atomic** actions (P4.10 / REQ-INT-06), each an action expression (see below). Executed in order.                                                             |
| `include`       | string (a workflow `name`)    | no       | Compose another workflow here (P4.16). Mutually the composition counterpart of `actions`: an `include:` phase delegates its body to the named workflow. The value is a workflow **name**, never a file path (`bug-144`); it must resolve to a loaded workflow (`bug-145`) that is includable (`dl-109` K3) — see § "Diagnostics". |
| `iterate_over`  | string: a memory type, or a collection reference | no | With `include`, run the composed workflow **once per matching element** of this type (P4.16) instead of once; the element is bound as the included workflow's `element`. Or, per `dl-104` D2 (b), once per entry of a collection declared in versioned configuration (§ "Collections"). |
| `where`         | map<string, scalar \| scalar[]> | no     | With `iterate_over`: the filter over the candidates, a live query over current Memory frontmatter (REQ-SYS-03) or over collection entries. Without `iterate_over`: the phase's **selection** (§ "Selections", `dl-016` §1). Each key is a frontmatter field (or entry field); a scalar value matches an equal value, a list value matches membership, and when the frontmatter field is itself a list it matches when the two share at least one element. Values may interpolate `{<field>}` / `{element.<field>}` / `{<type>.<field>}` from the enclosing scope. |
| `produces`      | (string \| `{ type, path }`)[] | no      | Deliverable artifact path patterns the phase creates/updates, used to deduce phase completion by artifact existence. A string entry is owned by the workflow's `element`; `{ type: T, path }` is owned by the elements of type `T` the phase creates (`dl-104` D3; § "Evidence"). Every entry's path must be a path pattern (`E_PHASE_PRODUCES_NOT_A_PATH`). |
| `checks`        | `{ pre?: string[], post?: string[] }` | no | Guard conditions. `pre` must hold before the phase runs; `post` must hold for it to complete. Each entry is a check expression (see below).                              |
| `approval`      | `{ by_role: string }` \| `{ by_person: string }` | no | Marks an approval gate: the phase completes only when the approval is given (P4.14). Exactly one of `by_role` (a `dna.yaml` role) or `by_person` (a `team.members[]` `name` or `email`, P4.14 sc. 2). Routing names who is asked; the authority to approve stays with the `approver` role (P1.7, REQ-SEC-03; agents never self-approve). |
| `awaits`        | `{ party: string, evidence: string }` | no | The phase waits on an actor outside the project (`dl-104` D4) — `party` names it (e.g. the npm registry, a GitHub environment reviewer), `evidence` is a check token (Layer 3) that observes the outcome. Distinct from `approval:`, which names one of the project's own roles or members. |
| `fallback`      | `{ step: string, set_state?: string }` | no | On rejection/failure, route back to the named phase (`step`) and optionally reset the active element's state to `set_state` before retrying.                             |
| `mode`          | `fresh` \| `resume` \| `reference` (default `fresh`) | no | Which non-fresh execution mode the phase **allows** for the agent run that executes it (`dl-135` point 3 and 4; `dl-134` §4 (a)). See § "Execution independence". |
| `distinct_from` | string[] (phase names)        | no       | Phases of the **same workflow** whose runs this phase's run must never share an agent session with, whatever `mode` is set (`dl-134` §4 (b)). See § "Execution independence". |
| `cadence`       | `once` \| `{ recurring: { cron: string } \| { on: string } }` (default `once`) | no | Whether the phase runs once per pass of its workflow or recurs, and on what trigger (`dl-105`). See § "Recurring phases". |

There is **no `entry:` field** (`dl-104` D5 (b)): the generic workflow commands (`workflow start`,
`workflow next`, P4.2–P4.7; `spec-017`) are the entry point of every phase, and a phase is enterable
when its predecessor's completion is deducible (§ "Evidence").

Zod shape (illustrative):

```ts
const Name = z.string().regex(/^[a-z][a-z0-9-]*$/);
const Check = z.string();
const Cadence = z.union([
  z.literal("once"),
  z.object({
    recurring: z.union([
      z.object({ cron: z.string() }).strict(),   // a five-field cron expression
      z.object({ on: z.string() }).strict(),     // an event name, <memory-type>-<state>
    ]),
  }).strict(),                                   // a closed union: no other key beside `recurring`
]);
const Produces = z.union([z.string(), z.object({ type: z.string(), path: z.string() }).strict()]);
const Phase = z.object({
  name: Name,
  description: z.string().optional(),
  role: z.string().optional(),
  optional: z.boolean().default(false),
  actions: z.array(z.string()).optional(),
  include: z.string().optional(),
  iterate_over: z.string().optional(),
  where: z.record(z.union([
    z.string(), z.number(), z.boolean(),
    z.array(z.union([z.string(), z.number(), z.boolean()])),
  ])).optional(),
  produces: z.array(Produces).optional(),
  checks: z.object({ pre: z.array(Check).optional(), post: z.array(Check).optional() }).optional(),
  approval: z.union([
    z.object({ by_role: z.string() }).strict(),
    z.object({ by_person: z.string() }).strict(),
  ]).optional(),
  awaits: z.object({ party: z.string().min(1), evidence: Check }).strict().optional(),
  fallback: z.object({ step: z.string(), set_state: z.string().optional() }).optional(),
  mode: z.enum(["fresh", "resume", "reference"]).optional(),   // absent reads as `fresh`; the
                                                               // checks below run on the raw value
  distinct_from: z.array(z.string()).optional(),
  cadence: Cadence.default("once"),
});
export const Workflow = z.object({
  name: Name,
  kind: z.enum(["main", "sub"]).optional(),
  startable: z.boolean().optional(),
  includable: z.boolean().optional(),
  description: z.string().optional(),
  version: z.number().positive().optional(),
  format: formatField(WORKFLOW_FORMAT),
  element: z.string().optional(),
  phases: z.array(Phase).min(1),
}); // + the kind/startable/includable rules above, as a refinement
```

#### Names

Workflow names and phase names share the class `[a-z][a-z0-9-]*`. Every name on disk matches it (23
workflow names, 85 phase names: the `E_WORKFLOW_NAME_INVALID` / `E_PHASE_NAME_INVALID` rows of the
§ "Diagnostics" measurement report none), so no file changes. A phase is addressed across files as
`<workflow>.<phase>`; because neither part contains a `.`, the split is unambiguous. The phase name
`adhoc` is reserved: `spec-016` uses it as the phase segment of a run without a step: no `--next`,
`--workflow` or `--step`.

#### Evidence — how a phase's completion is known (`dl-104` D1 (c), D3)

A phase's completion is deduced only from what it declares (P4.13; the deduction itself is
`spec-017` §4). The evidence a phase can declare:

| Evidence | Declared by | What it observes |
|---|---|---|
| state | a state-changing action on the workflow's element (`memory.submit`, `memory.approve`, `element.set_state`, `<type>.set_state` of the element's own type) | the element's `status` |
| created | a `memory.add(type: T)` followed by state-changing actions on what it added | the elements of type `T` the phase created, their `status` and their `{ type: T, path }` `produces` |
| produces | a string `produces` entry, owned by the workflow's `element` (or by no element); an implicit-owner entry (below) is not evidence until rewritten (`spec-017` §4.3) | the path's existence |
| selection | `where` without `iterate_over` (§ "Selections") | the selected elements' `status` |
| include | `include:` | the included workflow's completion |
| awaits | `awaits:` | its `evidence` check — evaluated from v1.0 with P4.12 |
| record | nothing — the phase is a **checkpoint** | a commit carrying the phase-record trailers below |

`dl-104` D1 (c): a phase whose completion is a fact in the repository declares it with one of the
first six; a phase whose only outcome is a human saying "go on" (a review checkpoint such as
`retrospective.additional-points`) declares none of them and is a **checkpoint**. A checkpoint's
completion — and the completion of an approval that no Memory transition carries — is a **phase
record**: a commit reachable from `HEAD` whose trailer block carries

```
WingFoil-Phase: <workflow>.<phase> completed
WingFoil-Instance: <instance-id>
WingFoil-Element: <type>:<id>          # when the phase runs on an element
WingFoil-Item: <collection>#<key>      # when the phase runs on a collection entry
```

`WingFoil-Phase` is `dl-104` D1 (b)'s trailer; `WingFoil-Instance`, and `WingFoil-Element` or
`WingFoil-Item`, are added here so that a record is attributable to one workflow instance and one
iteration. In v0.3 the record is written by `wingfoil workflow finalize` (ruling R11,
`release-planning-rel-v0.3-plan`; `spec-017` §7.9), and from v1.0 by the engine that executes
steps (P4.10).

**Ownership of `produces`** (`dl-104` D3). A string entry is owned by the workflow's `element`: its
`{id}` and `{<field>}` tokens resolve against that element. An entry that belongs to an element the
phase creates is written `{ type: T, path: "…/{T.id}.md" }`, and `T` must be a type the phase
`memory.add`s (`E_PHASE_PRODUCES_OWNER_NOT_CREATED`). A string entry with an `{id}` or `{<field>}`
token in a phase that also `memory.add`s is ambiguous — it is exactly the case D3 exists to remove —
and is reported `W_PHASE_PRODUCES_OWNER_IMPLICIT` until the workflow file is rewritten in the D3
form. A self-creating workflow's creating phase (§ Layer 2 `element`) is not ambiguous: the element it
creates *is* the workflow's element.

**A path pattern** is a string of the characters `[A-Za-z0-9._/{}-]` (no whitespace): a
repository-relative file path, a directory path ending in `/`, or either with `{…}` tokens. Any other
string is prose, which no engine can test for existence (`E_PHASE_PRODUCES_NOT_A_PATH`).

#### Selections (`where` without `iterate_over`, `dl-016`)

A phase that declares `where` without `iterate_over` does not iterate: its `where` is a
**selection**, the set of Memory documents at `HEAD` whose frontmatter matches every key (§ Layer 2
`where` row for the match rule). `dl-016` §1 introduced it for release-planning's sweeps
(`release-planning.yaml:53,65`: `triage-bugs`, `reconcile-governance`), whose filter is "`release`
empty or the release in planning". The phase's untyped Memory actions (`memory.approve`, …) act on
every selected element. Because `type` is itself a frontmatter field of every Memory document, a
selection names the type(s) it selects with a `type` key; a selection without one would select across
every type and is `E_PHASE_SELECTION_UNTYPED`. A selection is complete when no document matches it
(`spec-017` §4).

#### Collections (`iterate_over` over configuration, `dl-104` D2 (b))

`iterate_over` names either a `memory.yaml` type or a **collection reference**:

| Reference | Collection |
|---|---|
| `dna:<path>` | the list at `<path>` in `dna.yaml` (the `spec-008` §9 path syntax), e.g. `dna:modules` |
| `bindings:<name>` | the list declared under `collections.<name>` in `workflows/bindings.yaml` (Layer 3), e.g. the `init` templates `e2e-smoke`'s `fresh-init` prose names |

Both sources are versioned, which keeps REQ-STATE-09's determinism (`dl-104` D2 rationale); a
command's runtime output is not a collection (D2 (c) was not chosen). Each entry is one iteration:

- its **key** is the entry itself for a scalar entry, and the entry's `id` field, else its `name`
  field, for a map entry; keys must be unique and match `spec-009`'s ID characters;
- iterations run in the collection's **declared order**;
- `where` filters entry fields with the same match rule; collections have no `status`, so every
  matching entry is a candidate until the included workflow is complete for it;
- the included workflow declares no `element` (`E_WORKFLOW_ELEMENT_MISMATCH` otherwise), and its
  phases interpolate the entry as `{item}` (the key) or `{item.<field>}`.

REQ-STATE-07's fit criterion ("given N elements matching the `where` filter") reads "N elements or
collection entries" under this rule; the SARD amendment is `dl-104` Action 1's and is listed under
Consequences.

#### Execution independence (`mode`, `distinct_from`)

A role names a set of directives, not an executor: one agent entry may hold every role
(`.wingfoil/dna.yaml:127`, `executes_as: [ developer, reviewer, qa, architect ]`). What keeps one
phase from checking its own work is therefore a constraint on the **executor**, declared per phase
(`dl-134` §4, option (c): both fields).

- **`mode`** — which execution modes the phase **allows** for the agent run that executes it
  (`dl-135` point 3). The mode that runs is always `fresh` unless the caller asks for another with
  `--resume` / `--ref` (v0.4) **and** the phase declares that mode (`dl-135` point 4; the command
  contract is `spec-016`'s):
  - `fresh` — a new agent session; the agent receives only Memory, DNA and directives, never an
    earlier phase's conversation. Always allowed; the default when `mode` is absent.
  - `resume` — the agent resumes **its own** earlier session on the same element and role (e.g. a
    developer back in `green` after a reject). Allowed only where the phase declares it, and only
    for an agent whose adapter declares resume support (`spec-016`).
  - `reference` — the new agent receives a **summary** of named earlier runs, never their
    transcript; the summary is the run record's pointer to the task's Execution Notes (`dl-135` Q2 (c)).

  `fresh` is **mandatory** for a phase whose purpose is independent judgement — every phase whose
  `role` is `reviewer` or `qa` (`dl-135` point 3): declaring `resume` or `reference` there is
  `E_PHASE_MODE_NOT_INDEPENDENT`. The check runs on the raw declaration, before any default is
  applied.
- **`distinct_from`** — the phases (of this workflow) whose runs must not share an agent session
  with this phase's run on the same element. It holds even where `mode: resume` is set: a resume
  that would reuse the session of a named phase is refused. The session is identified by the
  session id the run record carries (`dl-135` point 2, amending `dl-114` Q2 (b)).

Validation (all releases): each `distinct_from` entry names a phase of the **same** workflow
(`E_PHASE_DISTINCT_FROM_UNKNOWN`), and a phase never names itself (`E_PHASE_DISTINCT_FROM_SELF`).

Worked example, the separation `dl-134` proposes for `dev-loop.yaml` v1.5 (not yet on disk: the
file is at `version: 1.4`, `.wingfoil/workflows/custom/dev-loop.yaml:27`, with `red` at role
`developer`, `:62`):

```yaml
  - name: red
    role: qa                                   # dl-134 §1; fresh is mandatory for qa (dl-135 point 3)
  - name: green
    role: developer
    distinct_from: [red]
  - name: refactor
    role: developer
    mode: resume                               # may resume green's session: both are the developer's
  - name: review
    role: reviewer
    distinct_from: [red, green, refactor]
    approval: { by_role: approver }
    fallback: { step: red, set_state: in-progress }
```

**Release boundaries.** v0.3 validates both fields, shows them (`workflow show`, `workflow next`),
and records each run's session id so that distinctness can be shown after the fact. In v0.3 every
run is `fresh`: `--resume` / `--ref` and the live-run registry are v0.4 (`dl-135` release split, plan
R5), so `resume` and `reference` are accepted by the schema and take effect from v0.4. **Enforcing**
`distinct_from` is a workflow check and lands with P4.12 in v1.0 (`dl-134` Action 6, plan R3/R4); no
v0.3 command refuses a run for sharing a session.

#### Recurring phases (`cadence`)

A phase declares `cadence: once` (the default — every existing phase is unchanged) or
`cadence: { recurring: … }` with exactly one trigger (`dl-105` Decision 1, R1):

- `{ cron: "<expr>" }` — a clock cadence, written as a five-field cron expression, the same string a
  GitHub Actions `on: schedule` trigger takes, so the provisional trigger and the engine share one
  source of timing (e.g. `cadence: { recurring: { cron: "0 6 * * 1" } }`);
- `{ on: "<event>" }` — an event cadence (e.g. `cadence: { recurring: { on: release-released } }`).
  An event is named `<memory-type>-<state>` (open question 3, settled): the element type whose
  transition fires it and the state the transition enters. Structurally an event is lower-case
  segments joined by single hyphens, at least two of them; since a type and a state may both contain
  hyphens (`release-line-in-progress`), the split and the check that the type and the state exist in
  `memory.yaml` are a **core** check (they need `memory.yaml`), so an event that can never fire is a
  validation error there.

`cadence` is a closed union and is checked structurally (spec-009's structural codes, as for any Zod
failure), each refusal at its own path:

- a value that is neither `once` nor a `{ recurring: … }` map, or a map with an unknown key at either
  level, at `phases[<i>].cadence`, message `cadence must be once or { recurring: { cron } | { on } }
  with no other key`, followed by ` (unknown key '<key>')` or ` (unknown key 'recurring.<key>')` for
  the first unknown key in declared order;
- two triggers or none, at `phases[<i>].cadence.recurring`, message `recurring cadence takes exactly
  one trigger: cron or on`;
- a cron that is not five fields of digits, names, `*`, `,`, `-` and `/` separated by spaces or tabs
  (one line), at `phases[<i>].cadence.recurring.cron`, message `cron must be a five-field cron
  expression (e.g. "0 6 * * 1")`;
- an event that does not have the shape above, at `phases[<i>].cadence.recurring.on`, message `on must
  be an event named <memory-type>-<state> (e.g. release-released)`.

The command a recurring phase runs is a bound token (Layer 3, `dl-105` R4). Its evidence is the
timestamp and outcome of its last run (`dl-105` Decision 2): while the trigger is provisional, the CI
run history; once the engine runs the phase, a run record in the repository (`dl-105` R2 (c)).
"Overdue" needs the current time, so where it is computed at all it is computed only where status is
displayed (`workflow status`, P4.5, as a warning) or where a phase explicitly declares a `checks.pre`
on it — never while an agent's context is assembled (`dl-105` R3 (a); REQ-STATE-09, REQ-SYS-07).

**Release boundaries.** v0.3 validates `cadence` and reports it; it computes no "overdue" and reports
the last run as `not-recorded` (`spec-017` §6.4), because the last run's evidence stays outside the
repository while the trigger is provisional (`dl-105` R2 (c)). The trigger is provisional: a
scheduled GitHub Actions job fires the phase's command (`dl-105` Decision 3; the first one, the
dependency check, is a v0.3 task). No v0.3 command fires a phase on its cadence; the engine taking
over the trigger depends on step execution (P4.10), which is v1.0 (plan R3).

#### Action expressions (`actions[]`)

String tokens naming one atomic operation each. The families observed in the current workflow files
(`grep -rhoE "^\s+- '?[a-z_]+(\.[a-z_]+)+" .wingfoil/workflows/custom/*.yaml`):

- **Memory operations** — `memory.add(type: tech-spec)`, `memory.submit`, and (approval-gated,
  by the `approver` role only) `memory.approve` / `memory.reject` / `memory.deprecate`.
- **Element state transitions** — `element.set_state(<state>)`, e.g. `element.set_state(active)`
  (release-line: `planning → active`), `element.set_state(in-progress)` (task: `backlog → in-progress`),
  and the typed form `<type>.set_state(<state>)` on the elements of a named type in scope
  (`task.set_state(backlog)`, `release.set_state(in-development)`, `bug.set_state(planned)`,
  `.wingfoil/workflows/custom/release-planning.yaml:122,135,136`). `superseded` is not reached by any
  workflow action: it is fired by the `supersedes:` engine trigger on the superseding element's
  `approve` (`dl-065` Q1.1), a Memory-engine rule owned by `spec-001` / `spec-010`, not by this schema.
- **Element field stamping** — `element.set_release("{release.version}")`
  (`release-planning.yaml:123`, `dl-016` §4).
- **Element cross-sync** — `bug.sync_state(for_each: task.bug)`, recomputing a linked element's
  state from the aggregate of its derived tasks.
- **Git operations** (P4.10) — `git.create_branch("task/{task.id}")` (`dev-loop.yaml:35`),
  `git.merge(to: main, ff: false)`.
- **Agent operations** — `agent.execute`, `agent.verify_specs`.
- **Test operations** — `tests.bdd.run`.

Arguments use the `key: value` form and may interpolate `{element.field}` / `{<type>.field}` from the
active element or enclosing iteration scope; `{element.<field>}` and the bare `{<field>}` both name a
field of the innermost bound element. When a token reaches a command, interpolation fills
**whole argv elements only**, and each interpolated value must match `spec-009-validation-strategy`'s
ID character class or a pattern the binding declares for that argument (`dl-090` Q3 (a)); no shell is
involved, so a token whose argument embeds a shell separator (`e2e-smoke.yaml`'s `cli.run("…; …")`)
is written as two tokens. `git.create_branch("task/{task.id}")` is, as written, a partial
interpolation (a literal prefix around a placeholder), which a binding cannot express (open question
6).

**Every action token resolves through a declared binding** (Layer 3, `dl-090`). The tokens WingFoil
implements itself are **built-in bindings**; a project may not rebind them
(`E_BINDING_BUILTIN_TOKEN`). Each built-in token has a binding kind, the command it names (if any),
and the Memory verb its commit carries:

| Built-in token | Binding kind | Command | Memory verb (`wf({type}): {verb}`) |
|---|---|---|---|
| `memory.add` | `wingfoil` | `wingfoil memory add` | `add` |
| `memory.submit` | `wingfoil` | `wingfoil memory submit` | `submit` |
| `memory.approve` | `wingfoil` | `wingfoil memory approve` | `approve` |
| `memory.reject` | `wingfoil` | `wingfoil memory reject` | `reject` |
| `memory.deprecate` | `wingfoil` | `wingfoil memory deprecate` | `deprecate` |
| `element.set_state(<s>)`, `<type>.set_state(<s>)` | `manual` (no v0.3 command) | — | `approve`, `finalize` or `start`, by the rule under the verb table |
| `<type>.sync_state(…)` | `manual` (no v0.3 command) | — | `sync` |
| `element.set_release(<v>)` | `manual` (no v0.3 command) | — | `assign` — added to `dl-079` (A)'s list by the approver's ruling of 2026-10-01; subject `wf({type}): assign release {version} to {id}, …`, the canonical form of the four practised ones (`git log --format=%s \| grep -E '^wf\([a-z-]+\): assign '`, e.g. `wf(adr): assign release v0.2 to adr-009`; `spec-008` §2) |
| `config.init` | `wingfoil` | `wingfoil init` | none (writes configuration, not Memory) |
| `agent.*` | `agent` | `wingfoil agent execute`, run under the phase's `role` (P5.3.2), the token name selecting the instruction document; the role's session prompt carries the content (`dl-090` Q6: (a) for execution, (b) for content) | none |

A `manual` binding means WingFoil names the step and the commit subject it expects, and a human
performs it (`dl-090` Q2 (c)). All other tokens are bound by the project in `bindings.yaml`.

**The Memory verbs an action emits form a closed, declared list** (`dl-079` (A)). A workflow action
that changes a Memory element produces exactly one `wf({type}): {verb} …` commit, and `{verb}` is one
of the following — no other:

| verb        | emitted by                                                     | `[from → to]` bracket |
|-------------|----------------------------------------------------------------|-----------------------|
| `add`       | `memory.add`                                                   | no                    |
| `submit`    | `memory.submit`                                                | no (`dl-054`)         |
| `approve`   | `memory.approve`; a `set_state` in a phase that declares `approval:` | yes             |
| `reject`    | `memory.reject`, and a `fallback.set_state` routed by a reject  | yes                   |
| `deprecate` | `memory.deprecate`                                             | yes                   |
| `start`     | a `set_state` that opens work on an element (`dev-loop` `start`: task `backlog → in-progress`, `dev-loop.yaml:37`) | yes |
| `finalize`  | a `set_state` that closes an element (`dev-loop` `done`: task `approved → done`, `dev-loop.yaml:104`); `workflow end` for a workflow instance's plan, `active → done` (`spec-017` §7.2) | yes |
| `sync`      | `<type>.sync_state` (`bug.sync_state`, `dl-045`); the bracket may chain several states (`[in-review → resolved → closed]`) | yes |
| `amend`     | the `memory amend` verb (`dl-108`); no workflow token emits it  | yes (`[s → s]`)       |
| `assign`    | `element.set_release`; writes only `release`, on any type, never `status`; no `Approver:` | no |
| `park`      | the `memory park` verb (`dl-110`); no workflow token emits it   | yes (`[in-progress → backlog]`) |

**Which verb a `set_state` emits.** `approve` when the phase declares `approval:`; otherwise
`finalize` when the target is the last state of the type's `sequence` (`memory.yaml`); otherwise
`start`. This matches the practised history: `commit-backlog`'s `release.set_state(in-development)`
under `approval:` is `wf(release): approve minor-v0.2 [planning → in-development]`, and `dev-loop`'s
`start` / `done` are `start` / `finalize`. Under it, `release-submit`'s `enter-releasing` and
`release-planning`'s `bug.set_state(planned)` emit `start`, and `release-publishing`'s
`mark-released` emits `finalize`; the practised `enter-releasing`, `mark-released`, `plan` and
`schedule` subjects stay in history (below). The rule is ratified together with the `spec-008` §2
grammar amendment.

The bracket column amends `spec-004` §4.3, whose approved text gives the bracket "to the
approver-gated verbs only" (`spec-004` §4.3, "The `[{from} → {to}]` bracket belongs…"): `dl-079` (A)
ratified the bracketed `start`, `finalize` and `sync` of practice, and `amend` / `park` follow them
(Consequences).

The subject-line grammar itself, and the parser `memory history` uses to read it back (P1.10), are
`spec-008-cli-grammar` §2's and are amended with the `dl-067` cluster; this table records only which
action emits which verb. History is not rewritten: the practised verbs outside the list stay in the
record as they are (`dl-035`) — among them `start-fix`, `schedule`, `plan`, `enter-releasing`,
`mark-released` and `deferred` (`git log --format=%s | grep -oE '^wf\([a-z-]+\): [a-z-]+' |
sed 's/.*: //' | sort | uniq -c`).

Commits that are not Memory operations stay outside the `wf({type})` list: the configuration family
`wf(directive): create|…` (`src/core/index.ts:1378`) and `wf(workflow): create|remove`
(`spec-017` §7.7–7.8), the phase record `workflow: finalize …` (`spec-017` §7.9) and the run record
`agent: record <run-id>` (`spec-016`). `memory history` reads none of them as a Memory operation.

#### Check expressions (`checks.pre` / `checks.post`)

Assertion strings, evaluated to a boolean gate. Observed forms:

- Test/coverage gates — `tests.exist`, `tests.failing`, `tests.passing`, `tests.coverage(min: 80)`,
  `tests.bdd.passing`, and `tests.unchanged(since: <phase>)` — the tests written in the named phase
  are unmodified (`dl-134` §2, declared on `green`/`refactor` by `dev-loop.yaml` v1.5, evaluated from
  v1.0).
- Frontmatter gates — `frontmatter.required: [title, scope]`. A gate may exempt named elements from
  one field: `frontmatter.required: [<fields>] except <field> for [<id>, …]` — the listed ids need not
  carry `<field>`; every other element needs every field (`release-planning`'s `define-scope` and
  `initial-design`'s `seed-releases`, for the releases added before `dl-092`, `bug-175`).
- Element-state gates — `tech-spec.approved`, `"all releases where release-line={release-line.version} are status: released"`.

**Every check resolves through a declared binding, and an unbound check fails closed** (`dl-090` Q2
(c)). A bound check's exit status means (`dl-090` Q4, REQ-INT-04):

| exit | meaning for a **check**                                                                     |
|------|---------------------------------------------------------------------------------------------|
| `0`  | the gate passes                                                                             |
| `1`  | the gate fails and routes to the phase's `fallback`                                         |
| `2`  | binding misconfiguration: the phase is blocked, and the gate does **not** count as failed   |
| any other status, a signal, or a timeout | an error                                        |

For an **action**, any non-zero status marks the step `failed` (REQ-INT-06). A check's binding may
declare a severity, `warn` or `reject` (default `reject`), for staged gates such as
`e2e-smoke.yaml`'s `gate.checks.post` (`dl-023`). **A check can never be bound to `agent execute`**: a
check an agent asserts about its own work is not a gate (`dl-090` Q6). An `awaits.evidence` is a check
and follows the same rules.

#### Worked example (grounded in `release-line-cycle.yaml`)

```yaml
name: release-line-cycle
kind: sub
version: 1.0
element: release-line
phases:
  - name: approve
    role: tech-lead
    actions:
      - memory.approve                       # release-line: planning -> active
    approval: { by_role: approver }
    fallback: { step: approve }
  - name: delivery
    include: release-cycle
    iterate_over: release
    where: { release-line: "{release-line.version}", status: [draft, planning, in-development] }
  - name: plan-next-release-line
    role: product-owner
    actions:
      - element.set_state(done)
      - 'memory.add(type: release-line)'
      - memory.submit
    produces:
      - { type: release-line, path: "docs/04_memory/planning/{release-line.id}.md" }   # D3 form
    checks:
      pre: ["all releases where release-line={release-line.version} are status: released"]
      post: ["frontmatter.required: [title, version]"]
```

(The file on disk still writes the last `produces` entry as the string
`"docs/04_memory/planning/{id}.md"`, `release-line-cycle.yaml:50`, which D3 reads as the iterated
release-line's own file; the D3 form above is what the workflow-alignment task writes. Inside a
`{ type: release-line, … }` entry, `{release-line.id}` names the created element.)

And the review gate with state-resetting fallback (grounded in `dev-loop.yaml`):

```yaml
  - name: review
    role: reviewer
    actions:
      - tests.bdd.run
      - memory.submit                        # task: in-progress -> in-review
    checks:
      pre: ["tests.bdd.passing"]
    approval: { by_role: approver }
    fallback: { step: red, set_state: in-progress }   # reject -> back to `red`, task -> in-progress
```

### Layer 3 — `Bindings` (`.wingfoil/workflows/bindings.yaml`)

Optional. Declares the command each project-bound token runs (`dl-090` Q1 (a)): a file of its own,
so a built-in workflow stays immutable (REQ-SEC-07) while each project binds its tokens, and one
binding serves every phase that uses the token. It also declares the named collections
`iterate_over: bindings:<name>` iterates (`dl-104` D2 (b)).

```yaml
# .wingfoil/workflows/bindings.yaml
version: 1.0
checks:
  tests.passing:           { run: [npm, test] }
  tests.coverage:          { run: [npm, run, coverage, --, --min, "{min}"], args: { min: "^[0-9]{1,3}$" } }
  docs.api.build:          { run: [npm, run, "docs:api"] }
  lint.clean:              { run: [npm, run, lint] }
actions:
  tests.bdd.run:           { run: [npm, run, "test:bdd"] }
  approver.execute:        { manual: true }   # e.g. the 2FA `npm stage approve` no command can perform (dl-087)
collections:
  init-templates:          [ default, kanban ]   # iterate_over: bindings:init-templates
```

The commands above are illustrative; today `dev-loop.yaml`'s `refactor.checks.post` names
`docs.api.build` and `lint.clean` and binds them only in a YAML comment (`npm run docs:api`,
`npm run lint`, `.wingfoil/workflows/custom/dev-loop.yaml:82-83`), which is what the first real
bindings file replaces (`dl-090` Action 3).

| Field                  | Type                     | Required | Description |
|------------------------|--------------------------|----------|-------------|
| `version`              | number (positive)        | no       | Content revision (`dl-047`); this file has no `format` key yet (§ "Format"). |
| `checks`               | map<token, CheckBinding> | no       | One entry per check token name. |
| `actions`              | map<token, ActionBinding>| no       | One entry per action token name. |
| `collections`          | map<name, (scalar \| map)[]> | no   | Named lists for `iterate_over: bindings:<name>`; entry keys per § "Collections". |
| `CheckBinding.run`     | string[] (min 1)         | yes      | The argument vector; the first element is the program. Never passed to a shell (`dl-090` Q3 (a)). |
| `CheckBinding.severity`| `warn` \| `reject`       | no       | Default `reject` (`dl-090` Q4). |
| `ActionBinding.run`    | string[] (min 1)         | one of   | As for checks. |
| `ActionBinding.manual` | `true`                   | one of   | The step has no command; the engine waits for a human to confirm it (`dl-090` Q2 (c)). Exactly one of `run` / `manual`. |
| `*.args`               | map<placeholder, pattern>| no       | A declared pattern per interpolated argument, where `spec-009`'s ID class is too narrow. |

A placeholder — `{<key>}` for a token's `key: value` argument, `{element.field}` or `{<type>.field}`
for the scope — may stand only as a **whole** element of `run` (`E_BINDING_PARTIAL_INTERPOLATION`
otherwise). A project binding may not rebind a built-in token
(`E_BINDING_BUILTIN_TOKEN`), and a check binding whose program is `wingfoil agent execute` is refused
(`E_BINDING_AGENT_CHECK`).

**Who may change a binding** (`dl-090` Q5 (c)): only through a task reviewed at `dev-loop`'s
`review` gate, never by an ordinary `docs(self)` commit; built-in bindings shipped with built-in
workflows are immutable (REQ-SEC-07). The check that no binding changed outside a task is `dl-103`'s
enforcement point.

### Format

`version` is a file's content revision (`dl-047`); `format` (`dl-149`) is the format the file is
written in. The manifest and the workflow files are two kinds with two counters,
`WORKFLOWS_YAML_FORMAT` and `WORKFLOW_FORMAT` (both `1`), declared once in `src/validation/format.ts`.
The key is optional and an absent one reads as format `1`, so every file written before it loads
unchanged. A value that is not a positive integer is a structural error on `format` (`E_VALIDATION`).
A kind's format is bumped **only** on a backward-incompatible change of that kind: an additive,
optional field (such as `task-185`'s `mode`, `distinct_from` and `cadence`) does not bump it. A file
whose `format` is greater than the highest this build reads is reported **instead of** its structural
pass, as one `E_INVALID_FORMAT` error on that file at path `format`, message
`this file is written in format <N>; this WingFoil reads up to format <M>: upgrade WingFoil`; for the
manifest that one diagnostic is the whole array, for a workflow file it takes the place of the file's
structural diagnostics. `wingfoil init` writes `format: <current>` in the manifest and in every
workflow file it scaffolds. `workflows/bindings.yaml` (Layer 3) is not one of `dl-149`'s file kinds and
has no `format` key yet.

### Diagnostics (load and validation)

This spec owns every diagnostic the workflow registry emits while it is loaded and validated — one
table, one order, one shape. `spec-017` references these codes and adds only the codes its
deduction raises (`spec-017` §2), in the same shape.

**Shape.** Every diagnostic is `{ code, severity, file, path, message }` — `severity` is `error` or
`warning`, `file` is the configuration file (relative to `.wingfoil/`), `path` locates the field
(e.g. `phases[3].include`). Commands carry them in one array named **`diagnostics`**
(`--format json|yaml`), and print warnings on stderr in console format (`dl-050`). An error makes the
operation fail with `VALIDATION` (exit `1`, `spec-005-cli-command-contract` §1): the first error, in
the order below, is the `reason`, and every diagnostic is in `details` (`dl-055`).

**Order.** Diagnostics come out in one deterministic order (REQ-SYS-07): `workflows.yaml` first,
then each workflow file in manifest `include` order, then `bindings.yaml`; within a file,
workflow-level before phase-level, phases in declared order; for one field, the rows of the table
below in table order. The same configuration yields the same list, in the same order, on every run.

**Where a cross-file diagnostic is reported.** `E_WORKFLOW_FILE_NOT_FOUND` is reported on
`workflows.yaml` at `include[<i>]`. `E_WORKFLOW_DUPLICATE_NAME` is reported on every file after the
first that declares the name; the first declaration is the one a phase `include` resolves to.
`E_WORKFLOW_INCLUDE_CYCLE` is reported at an `include` of a workflow W when the shortest include
path from its target back to W passes only through W and workflows listed after W in the manifest.
The message names that path. Every set of workflows that include one another in a cycle therefore
gets at least one diagnostic, at the member listed first, on each of its `include`s into the set.
Further cycles inside the set may be reported only after the reported ones are fixed. A file that
is not YAML is one `E_YAML_PARSE_ERROR` at its place in the order, with path `''`. A manifest that is
not YAML, or that fails its structural pass, is the whole array. An error's reason is
`<code> <path> (<file>): <message>`. A loader diagnostic is not decided when its inputs are
missing. While an included file is missing or has no string
`name`, a phase `include` may name that file's workflow, so `E_WORKFLOW_INCLUDE_UNRESOLVED` is not
reported. `E_NO_MAIN_WORKFLOW` is not reported in that case either, nor while a file fails its
structural pass. A structurally invalid file reports only its structural diagnostics, and checks
whose target it is are skipped. The error the user must fix first is therefore the one reported.

**Where each check runs.** *Loader* checks need only the workflow files and `bindings.yaml`, and run
in `loadWorkflowsYaml` (`src/core/loaders.ts`, the checks themselves in
`src/core/workflow-diagnostics.ts`) as caller-supplied semantic checks
(`spec-009-validation-strategy` §1), keeping the loader's pillar isolation (`src/core/loaders.ts:1-10`).
*Core* checks also need `memory.yaml`, `dna.yaml` or `roles.yaml` at `HEAD`, and run in the workflow
operations of `src/core` (`spec-017` §2). Structural (Zod) failures keep `spec-009`'s structural
codes, except the named `kind` refusal.

| Code | Severity | Runs in | Rule | Source |
|---|---|---|---|---|
| `E_WORKFLOW_FILE_NOT_FOUND` | error | loader | a manifest `include` path resolves to no file | Layer 1 |
| `E_INVALID_FORMAT` | error | loader | the manifest's or a workflow file's `format` is greater than this build reads; path `format`, message `this file is written in format <N>; this WingFoil reads up to format <M>: upgrade WingFoil`; it replaces that file's structural pass | § "Format"; `dl-149` |
| `E_WORKFLOW_INVALID_KIND` | error | loader | `kind` outside `main`/`sub`; message `invalid workflow kind '<kind>' (allowed: main, sub)` | P4.1 sc. 3 |
| `E_WORKFLOW_NAME_INVALID` | error | loader | a workflow `name` outside `[a-z][a-z0-9-]*` | § "Names" |
| `E_WORKFLOW_DUPLICATE_NAME` | error | loader | two files declare one `name` | registry uniqueness |
| `E_WORKFLOW_KIND_CONFLICT` | error | loader | `kind` declared together with `startable` or `includable` | `dl-109` K1 (a) |
| `E_WORKFLOW_NEITHER_STARTABLE_NOR_INCLUDABLE` | error | loader | both booleans absent or `false`, and no `kind` | `dl-109` K1 (a) |
| `E_NO_MAIN_WORKFLOW` | error | loader | a present manifest loads no startable workflow | Layer 1; `dl-109` Action 1 |
| `E_PHASE_NAME_INVALID` | error | loader | a phase `name` outside `[a-z][a-z0-9-]*` | § "Names"; `spec-016` run ids |
| `E_PHASE_NAME_RESERVED` | error | loader | a phase named `adhoc` | § "Names"; `spec-016` |
| `E_PHASE_DUPLICATE_NAME` | error | loader | a phase name repeats within one workflow | Layer 2 `name` |
| `E_WORKFLOW_INCLUDE_UNRESOLVED` | error | loader | a phase `include` names no loaded workflow (including a value written as a file path) | `bug-145`, `bug-144` |
| `E_WORKFLOW_NOT_INCLUDABLE` | error | loader | a phase `include` names a workflow that is not includable | `dl-109` K3 |
| `E_WORKFLOW_ELEMENT_MISMATCH` | error | loader | an included workflow declares `element: T` and the including phase neither iterates over `T` nor runs in a workflow bound to `T`; or it declares an element and is iterated over a collection | Layer 2 `element` |
| `E_WORKFLOW_INCLUDE_CYCLE` | error | loader | the include graph has a cycle; message `include cycle: <w1> -> … -> <w1>` | P4.16 |
| `E_PHASE_FALLBACK_STEP_UNKNOWN` | error | loader | `fallback.step` names no phase of the same workflow; message `fallback step '<step>' not found in workflow` | P4.15 sc. 3 |
| `E_PHASE_DISTINCT_FROM_UNKNOWN` | error | loader | a `distinct_from` entry names no phase of the same workflow; path `phases[<i>].distinct_from[<k>]`, message `distinct_from phase '<entry>' not found in workflow` | `dl-134` §4 |
| `E_PHASE_DISTINCT_FROM_SELF` | error | loader | a phase names itself in `distinct_from`; path `phases[<i>].distinct_from[<k>]`, message `phase '<name>' names itself in distinct_from` | `dl-134` §4 |
| `E_PHASE_MODE_NOT_INDEPENDENT` | error | loader | a phase whose `role` is `reviewer` or `qa` declares `mode` other than `fresh`; path `phases[<i>].mode`, message `phase '<name>' has role '<role>' and must run fresh (mode '<mode>' is not allowed)` | `dl-135` point 3 |
| `E_PHASE_EXECUTOR_WITHOUT_ROLE` | error | loader | a phase without `role` declares `mode` or `distinct_from`, on the raw declaration (an absent `mode` is not declared); one per field, path `phases[<i>].mode` / `phases[<i>].distinct_from`, message `phase '<name>' declares <field> but has no role (it has no executor)` | open question 4, settled |
| `E_PHASE_PRODUCES_NOT_A_PATH` | error | loader | a `produces` path is not a path pattern | `dl-104` D3 |
| `E_PHASE_PRODUCES_OWNER_NOT_CREATED` | error | loader | a `{ type: T, path }` entry in a phase that does not `memory.add(type: T)` | `dl-104` D3 |
| `E_PHASE_SELECTION_UNTYPED` | error | loader | `where` without `iterate_over` and without a `type` key | § "Selections"; `dl-016` |
| `E_BINDING_PARTIAL_INTERPOLATION` | error | loader | a placeholder that is not a whole `run` element | `dl-090` Q3 |
| `E_BINDING_BUILTIN_TOKEN` | error | loader | a project binding for a built-in token | `dl-090` Q5 |
| `E_BINDING_AGENT_CHECK` | error | loader | a check bound to `wingfoil agent execute` | `dl-090` Q6 |
| `E_BINDING_COLLECTION_KEY` | error | loader | a `bindings.yaml` collection entry with no key (a map with neither `id` nor `name`), a key outside the ID characters, or a key an earlier entry of the same collection already uses; path `collections.<name>[<i>]` | § "Collections"; approver ruling 2026-10-05 |
| `E_PHASE_ROLE_UNKNOWN` | error | core | `role` or `approval.by_role` is not a `dna.yaml` `team.roles` name; message `unknown role '<role>' (not defined in dna.yaml)` | P3.2, P4.14 |
| `E_PHASE_APPROVER_UNKNOWN` | error | core | `approval.by_person` names no `team.members[]` `name` or `email` | P4.14 sc. 2 |
| `E_WORKFLOW_ELEMENT_TYPE_UNKNOWN` | error | core | `element`, a Memory `iterate_over`, a `memory.add(type: T)` or a `produces` owner type is not a `memory.yaml` type | P1.13 |
| `E_WORKFLOW_COLLECTION_UNRESOLVED` | error | core | a collection `iterate_over` names no list in `dna.yaml` / `bindings.yaml`, or a `dna.yaml` list it names has an entry with no key, two entries sharing a key, or a key outside the ID characters (a `bindings.yaml` collection's keys are `E_BINDING_COLLECTION_KEY`'s) | `dl-104` D2 (b) |
| `W_WORKFLOW_UNBOUND_TOKEN` | warning | loader | an action or check token has neither a built-in nor a `bindings.yaml` binding | `dl-090` Q2 (c); open question 1, settled |
| `W_PHASE_PRODUCES_OWNER_IMPLICIT` | warning | loader | a string `produces` entry with an `{id}` or `{<field>}` token in a phase that `memory.add`s (not a self-creating workflow's creating phase) | `dl-104` D3 |
| `W_PHASE_ACTION_UNTARGETED` | warning | loader | an untyped Memory action (`memory.submit\|approve\|reject\|deprecate`, `element.*`) with no element to act on: the workflow binds none, no `memory.add` precedes it in the phase, and the phase has no selection | `spec-017` §4.2 |
| `W_PHASE_TOKEN_OUT_OF_SCOPE` | warning | core | a `{<type>.<field>}` token in `where`, `produces` or an action argument whose `<type>` is no enclosing scope's element type on some include path from a startable workflow, or whose `<field>` the type's template does not declare (a self-creating workflow's `{id}` before its element exists is not reported) | `spec-017` §4.1 |
| `W_PHASE_EXIT_STATE_UNDETERMINED` | warning | core | the phase's state-changing actions cannot be applied along the element's machine from the state the previous phase leaves (`spec-017` §4.4) | `spec-001` |
| `W_PHASE_FALLBACK_STATE_MISMATCH` | warning | core | `fallback.set_state` differs from `memory.yaml`'s reject target for the gate state the phase holds its element in | P4.15; `spec-001` |
| `W_PHASE_FALLBACK_NOT_REENTRANT` | warning | core | `fallback.step` names an earlier phase, but the reject target of the phase's gate lies forward in the `sequence`, so a reject completes the phase instead of re-entering it (`spec-017` §4.8) | P4.15 |

**Unbound tokens in v0.3 are warnings** (open question 1, settled at this revision). `dl-090` Q2 (c)
makes an unbound check fail closed and requires every action to be bound or `manual`; before any
engine runs a binding, `workflow list` reports each unbound token as `W_WORKFLOW_UNBOUND_TOKEN` in
`diagnostics` and exits `0`. It becomes an error when P4.10/P4.12 ship in v1.0 and the engine would
otherwise fail closed at run time.

**Measured on this repository** at `997e8998` (branch `design/release_planning_v0.3`), applying the
table to the committed files (`git show 997e8998:.wingfoil/<path>`; `npm run -s wingfoil -- workflow
list --format json` with the pinned build 0.2.2 loads the same 23 workflows and 85 phases, exit `0`):
one error, `E_PHASE_PRODUCES_NOT_A_PATH` on `retrospective.explore`
(`.wingfoil/workflows/custom/retrospective.yaml:23`); and 103 warnings — 90
`W_WORKFLOW_UNBOUND_TOKEN` (17 action occurrences over 10 distinct token names, 73 check entries; no
`bindings.yaml` exists), 9 `W_PHASE_PRODUCES_OWNER_IMPLICIT`, 2 `W_PHASE_TOKEN_OUT_OF_SCOPE`
(`release-planning.yaml:118,120`: `{dl.id}` names no Memory type, and no enclosing scope is a `bug` for
`{bug.id}`),
one `W_PHASE_ACTION_UNTARGETED` (`end-of-life.deprecate`) and one `W_PHASE_FALLBACK_NOT_REENTRANT`
(`bug-ingest.triage`). The per-phase list and its consequence for deduction are `spec-017` §12. The
error is removed by the workflow-alignment task (Consequences), which `dl-104` Action 2 requires "in
the same change".

### What v0.3 does with these fields

v0.3 ships the workflow commands, state deduction, approval routing, fallback,
`include`/`iterate_over` and the phase record (P4.2–P4.9, P4.13–P4.16; `workflow finalize`, ruling
R11) and `agent execute` (P5.3.1); it does **not** execute steps (P4.10) or evaluate checks (P4.12),
which are v1.0 (plan R3). So in v0.3 the loader validates all three layers, `workflow show` /
`workflow next` display each token with its binding, an `awaits` phase is completed by a phase record
(its `evidence` check is not evaluated), and the v1.0 engine is what runs a binding, reads its exit
status, evaluates `awaits`, and enforces `distinct_from` and `tests.unchanged`. The command contracts
are `spec-017` (workflow commands and state deduction) and `spec-016` (agent execution).

### Open questions carried by this amendment (settle at sign-off)

Settled at this revision: **1** (unbound tokens are warnings in v0.3, in `diagnostics` — § "Diagnostics")
and **2** (which verb a `set_state` emits — the rule under the verb table), both taking the
recommendation the review endorsed. **3**, **4** and **5** were settled by their recommendations when
this spec was approved at gate 5, and are implemented as stated (see the 2026-10-05 revision under
Process Notes).

3. **The event names of `cadence: { recurring: { on } }`.** `dl-105` R1 chose event names but listed
   none as a closed set. *Recommendation:* `<memory-type>-<state>` (e.g. `release-released`), checked
   against `memory.yaml` so an event that can never fire is a validation error.
4. **`mode` / `distinct_from` on a phase that executes nothing.** An `include:` phase has no executor.
   *Recommendation:* declaring either field on a phase without `role` is a validation error
   (`E_PHASE_EXECUTOR_WITHOUT_ROLE`, loader), checked on the raw declaration — the `fresh` default
   must not make an absent `mode` look declared. (The related rule that `fresh` is mandatory on
   `reviewer`/`qa` phases is not open: it is `dl-135` point 3, `E_PHASE_MODE_NOT_INDEPENDENT`.)
5. **More than one non-fresh mode per phase.** `dl-135` gives `mode` one value. *Recommendation:* one
   value in v0.3; revisit when `--resume` / `--ref` ship in v0.4.
6. **Positional token arguments.** Tokens on disk also take unnamed arguments
   (`git.create_branch("task/{task.id}")`, `dev-loop.yaml:35`), which a `{<key>}` placeholder cannot
   name, and that one is also a partial interpolation (a `task/` prefix around a placeholder), which
   `E_BINDING_PARTIAL_INTERPOLATION` forbids in a binding. *Recommendation:* rewrite them to the
   `key: value` form spec-003 already prescribes, and move the `task/` prefix out of the value — into
   the binding (`run: [git, switch, -c, …]` with a declared `args` pattern such as `^task/…$`) or into
   a token argument of its own — in the v0.3 task that aligns `workflows/custom/` with the workflow
   commands, rather than adding `{0}`-style positional placeholders.

## Consequences

- The workflow engine, `wingfoil workflow list/start/next/status/show/finalize` (P4.2–P4.7, ruling
  R11), and the `wingfoil://workflows` MCP resource family all consume these schemas; changing a field
  name here is a breaking change that requires updating every workflow file under `workflows/**` in
  the same change.
- Every existing workflow file must validate against Layer 2 as-is, except where a ratified decision
  makes a file on disk invalid: `dl-104` D3 does so for `retrospective.explore`'s prose `produces`
  (the one error measured above), and `dl-104` Action 2 requires the file to change in the same
  change as the validation. Every other 2026-09-30 field is optional with a default, and `kind` stays
  an alias, so every other file validates unchanged.
- Layer 2 fixes the vocabulary for future authors: phase composition (`include`/`iterate_over`/`where`,
  collections, selections), evidence (`produces` ownership, `awaits`, the phase record), gates
  (`checks`/`approval`), routing (`fallback`), executor independence (`mode`/`distinct_from`) and
  cadence are now named once, not re-invented per file.
- The action/check expressions stay **string families**, not a closed grammar, but no token is
  meaningless any more: each resolves through a built-in or a Layer-3 binding (`dl-090`). Adding a
  family is a documentation change here plus a binding; the **Memory verbs** those actions emit are a
  closed list (`dl-079`), so a new verb is a change to this spec and to `spec-008` §2 together.
- **Changes other documents must receive**, each carried to a task at build-backlog:
  - `dl-079`'s declared list gains `assign` (`element.set_release`), or the token is rebound to a
    listed verb — the `dl-079` task decides which, and `spec-008` §2 follows. *Done:* `assign`
    joins the list (approver ruling 2026-10-01, `task-126`).
  - `spec-004` §4.3: the sentence giving the `[{from} → {to}]` bracket "to the approver-gated verbs
    only" is amended with `dl-079` (A) (bracketed `start`, `finalize`, `sync`, `amend`, `park`).
  - REQ-STATE-07's fit criterion counts collection entries as well as elements (`dl-104` Action 1,
    D2 (b)).
  - `.wingfoil/workflows/custom/` is aligned with the commands and with `dl-104` Action 2, in one
    task: `retrospective.explore`'s `produces` becomes a path; the nine implicit-owner `produces`
    entries take the `{ type, path }` form; `end-of-life.deprecate` gains a selection;
    `release-planning.build-backlog`'s `{dl.id}`/`{bug.id}` arguments are rewritten against a
    selection; `git.create_branch` loses its partial interpolation (open question 6); the approval-only
    phases `dl-104` names gain the Memory action they stand for where one exists
    (`retrospective.approve` is `wf(decision-log): approve retro-{version}`); the `dl-079` verbs, the
    `dl-090` tokens and `agent.*` actions bound to `agent execute` are applied throughout.

## Process Notes

Grounded in the actual repo files: `.wingfoil/workflows.yaml` (at the time the manifest key was
`includes:`, plural — the rename target; renamed since, `.wingfoil/workflows.yaml:14`),
`workflows/custom/release-line-cycle.yaml` and `workflows/custom/dev-loop.yaml` (every Layer-2 field —
`include`, `iterate_over`, `where`, `produces`, `checks.pre/post`, `approval.by_role`,
`fallback.step/set_state`, and the `actions`/checks expression families — is drawn from these), plus
P4.1/P4.16 in `docs/01_vision/06_features.md`.

**Revision (2026-09-29) — Layer 1's resolution root, per
`task-111-configuration-moves-to-the-repository-root` (`bug-075`).** Layer 1 said the manifest
resolves "under the project (or `docs/self/`) root"; the `docs/self/` alternative was this
repository's nested dogfooding root, which that task moved to the repository root. Edited in place without a supersede or a state change (the `spec-001` precedent `dl-041` cites); pending the approver's sign-off at that task's review.

**Revision (2026-09-30) — v0.3 workflow-schema amendments, at `release-planning-rel-v0.3-plan`
step 5 (identify-specs), reviewed together with `spec-017` (ruling R14).** Every change below comes
from a decision-log ratified `ready`, from an approver ruling recorded in that plan (R11–R14), or
from a BDD scenario in `minor-v0.3`'s `features:`; no rule of the approved text is removed except
where a listed decision changes it.

- **Phase evidence, the phase record, `produces` ownership, collections, `awaits`, no `entry:`** —
  `dl-104` D1 (c), D2 (b), D3, D4, D5 (b) ("(c) for evidence, (b) for iteration scope, and the
  remaining points adopted as stated", approve `61fbf427`), folded in now by ruling R14. The record
  gains `WingFoil-Instance`, `WingFoil-Element` / `WingFoil-Item` next to D1 (b)'s `WingFoil-Phase`; in v0.3 it is written by
  `workflow finalize` (ruling R11).
- **Selections** (`where` without `iterate_over`) named, with a mandatory `type` key — `dl-016` §1 and
  its Action (5) (the sweeps it added to `release-planning`).
- **`approval: { by_person }`**, exactly one of `by_role` / `by_person` — BDD
  `P4.14-approval-routing.feature` sc. 2 (P4.14 is in `minor-v0.3` `features:`).
- **An absent manifest is an empty registry** — BDD `P4.6-workflow-list.feature` sc. 4.
- **Name classes** for workflows and phases, `adhoc` reserved — needed by `spec-016`'s run ids.
- **`fresh` mandatory for reviewer/qa phases** — `dl-135` point 3; and `mode` restated as the modes a
  phase *allows*, the mode that runs being `fresh` unless requested (`dl-135` point 4).
- **One diagnostics table** with a "runs in" column, one order and one `diagnostics` array, shared
  with `spec-017`; **built-in bindings** listed with binding kind and verb; the `set_state` verb rule
  (open questions 1 and 2 settled).
- **Per-phase `mode`** (`fresh` | `resume` | `reference`, default `fresh`; `resume`/`reference`
  effective from v0.4) — `dl-135` point 3 and Action 4 (Q1 (a), Q2 (c), Q3 (a), approve `7632947b`).
- **Per-phase `distinct_from`**, with its two validation rules (same-workflow names, no
  self-reference); enforcement is P4.12, v1.0 — `dl-134` §4 option (c), Actions 3 and 6
  (approve `e6a27440`).
- **Workflow `startable` / `includable`**, `kind` kept as an alias, Layer 1's "at least one `kind:
  main`" widened to "at least one startable", `include:` of a non-includable workflow refused —
  `dl-109` K1 (a), K2 (a)→(b), K3 (approve `960b6f08`).
- **Phase `include:` resolves by name** and an unresolved one is an error; the manifest/phase
  `include` distinction is stated — `bug-145`, `bug-144`. The table already typed the phase field as
  "a workflow `name`"; what is new is the check and the explicit contrast with Layer 1.
- **Per-phase `cadence`** (`once` | recurring on a cron string or an event), evidence and overdue
  semantics — `dl-105` R1 (a)+(c), R2 (c), R3 (a), R4 (approve `cf764f45`).
- **Layer 3 bindings file**, argv-only interpolation, fail-closed checks, `manual` actions, the check
  exit-code table and severity, the change-control rule, and `agent.*` → `agent execute` never
  satisfying a check — `dl-090` Q1 (a), Q2 (c), Q3 (a), Q4, Q5 (c), Q6 (a)+(b) (approve `201088db`).
  The REQ-SEC requirement for token arguments and the REQ-INT-04 clause for check exit codes
  (`dl-090` Action 2) belong to the SARD, not to this spec.
- **The closed list of Memory verbs an action emits**, including `start`, `finalize`, `sync`, and
  `amend` (`dl-108`) / `park` (`dl-110`) as CLI-only verbs — `dl-079` (A) (approve `3262ad92`). The
  subject grammar stays `spec-008` §2's.
- **`role` is the only path from a directive to a phase** — `dl-066` option 1 (approve `d1ad0a8b`).
  No schema field changes; the `role` row states it.
- **`superseded` is not a workflow action's target** — `dl-065` Q1.1 (approve `b9cc84c4`) chose a
  `supersedes:` engine trigger fired on the superseding element's `approve`; the trigger itself is
  `spec-001` / `spec-010`'s, so this spec records only that no workflow token reaches it.
- **Check family `tests.unchanged(since: <phase>)`** — `dl-134` §2 (Q2 (a)).
- **Editorial:** the `includes` → `include` rename is recorded as done; the `optional` row and the
  cadence release boundary state what v0.3 does; the `git.create_branch` example quotes the file.

Tech-specs carry no `version:` field, so there is nothing to bump; the amendment is recorded by this
dated note (`dl-047-tech-specs-carry-no-version-field`, option 1, approve `8e7e1e44`). Edited in place
without a supersede or a state change; `status` stays `approved`, pending the approver's sign-off at
identify-specs (`dl-022` spec-review gate), where open questions 3–6 above are settled.

Confirming dl-022 pass (2026-09-30): N4 applied.

**Revision (2026-09-30) — `element.set_release` emits `amend`, per ruling R20 (backlog question
Q6), carried out by `task-126-declare-closed-wf-operation-grammar-bracket-set-state`.** The table
left the token on `assign`, a verb outside `dl-079` (A)'s list, and its Consequences sent the choice
to the `dl-079` task. The approver ruled at `release-planning` that the token is rebound to a listed
verb. `task-126` chose `amend`, and `spec-008` §2 gives the reasons. Three cells change: the token's
row, the `amend` row's emitter, and the Consequences item, which is marked done. No schema field
changes. The choice awaits the approver's confirmation at `task-126`'s review. Edited in place without a
supersede or a state change (`dl-047`: no `version:` field).

**Revision (2026-10-01) — `element.set_release` emits `assign`, per the approver's ruling of
2026-10-01 (reversing `release-planning`'s R20/Q6 on this point), carried out by `task-126` at its
review.** This supersedes the 2026-09-30 revision above. `amend` is approver-gated and amendable only
per type (`dl-108`/`task-127`), while `build-backlog` stamps `release` on `adr` elements too, as
`product-owner` and with no approval. `assign` is therefore the eleventh listed verb. It writes only
`release`, on any type, never `status`, with no `Approver:` and no bracket. The `amend` row returns
to `dl-108`'s emitter alone. `assign` leaves the list of undeclared practised verbs. The
Consequences item names the outcome. No schema field changes. Edited in place without a supersede
or a state change (`dl-047`).

**Revision (2026-10-01) — loader diagnostics implemented, carried out by
`task-136-validate-workflows-startable-includable-resolve-phase-include-name`.** Two line
citations into `src/core/loaders.ts` (`:224` for `E_NO_MAIN_WORKFLOW`, `:196-233` for the loader)
stopped resolving when that task rewrote the loader. They now name the files. A paragraph under
§ "Diagnostics", "Where a cross-file diagnostic is reported", states what the table left open:
the file and path of `E_WORKFLOW_FILE_NOT_FOUND`, `E_WORKFLOW_DUPLICATE_NAME` and
`E_WORKFLOW_INCLUDE_CYCLE`, and which diagnostics are not reported when a file is missing or
structurally invalid. It also states that a YAML parse failure joins the array as
`E_YAML_PARSE_ERROR`, and that the reason of an error is `<code> <path> (<file>): <message>`. Every
implementation then produces the same array and the same reason. No code, severity or diagnostic
message changes. Edited in place without a supersede or a state change (`dl-047`).

**Revision (2026-10-02) — the frontmatter gate's exemption form, carried out by
`task-148-correct-stale-workflow-comments-workflow-md-diagrams-kind` (`bug-175`).** `memory.yaml`
requires `kind` on every release, and declares the releases added before `dl-092` (`minor-v0.1` …
`minor-v1.0`) immutable and without `kind:`. The approver ruled on 2026-09-30
(`release-planning-rel-v0.3-plan` R20) that those minors are exempt in the check and gain no field.
§ "Check expressions" now lists the form that states it, `frontmatter.required: [<fields>] except
<field> for [<id>, …]`, which `release-planning.yaml` 1.5 uses on `define-scope` and
`initial-design.yaml` 1.1 on `seed-releases`. No schema field
changes: a check is still a free string. Edited in place without a supersede or a state change
(`dl-047`).

**Revision (2026-10-05) — the executor attributes and `cadence` implemented, carried out by
`task-185-accept-validate-executor-attributes-mode-distinct-phase-cadence`.** Open questions 3–5 were
settled by their recommendations at gate 5; this revision writes them where the rest of the spec
reads them. § "Diagnostics" gains the row of open question 4, `E_PHASE_EXECUTOR_WITHOUT_ROLE`
(loader), after `E_PHASE_MODE_NOT_INDEPENDENT`, and the four executor rows name their path and
message, as the `fallback.step` row already did. § "Recurring phases" states the event shape of open
question 3 and that the existence of its type and state is a core check, and that a malformed
`cadence` is a structural failure, with the path and message of each refusal; the illustrative `Cadence` closes its outer object with
`.strict()`. Open question 5 needed no text: `mode` was already one value. No existing code,
severity or message changes. Edited in place without a supersede or a state change (`dl-047`).

**Revision (2026-10-05) — collection keys become a loader row; the Layer 3 example and a count
corrected, per `task-175-declare-phase-evidence-produces-ownership-selections-awaits-collections` and
the approver's ruling at its review (D1 (a)).** A key rule that failed `bindings.yaml`'s structural
pass left the whole file undecided, so a duplicate collection key also silenced every
`W_WORKFLOW_UNBOUND_TOKEN`. The key rules of a `bindings.yaml` collection (an entry with no key, a
key outside the ID characters, a repeated key) are therefore a loader row of their own,
`E_BINDING_COLLECTION_KEY`, and `E_WORKFLOW_COLLECTION_UNRESOLVED` keeps the unresolved name and the
key rules of a `dna.yaml` list, which need `dna.yaml` (core). The Layer 3 example bound
`tests.coverage` with `"--min={min}"`, a partial interpolation `E_BINDING_PARTIAL_INTERPOLATION`
refuses; it now passes `--min` and `"{min}"` as two elements. § "Diagnostics" "Measured" counted 13
distinct unbound action tokens; by name they are 10 (`cli.run` and `git.commit` were counted once
per phase). No other code, severity or message changes. Edited in place without a supersede or a
state change (`dl-047`).

**Revision (2026-10-05, `task-251-add-the-format-key-to-the-config-workflow-directive-and-template-schemas-check-it-in-the-loaders-and-write-it-in-the-init-scaffold`)
— the `format` key (`dl-149`).** Layers 1 and 2 gain the optional `format` field in their tables and
Zod listings; a new § "Format" gives its default (absent = 1), its bump rule and the newer-format
refusal, and § "Diagnostics" gains the `E_INVALID_FORMAT` row. The three `version` rows (Layers 1, 2 and 3), which called it
a format version, now call it the content revision (`dl-047`). Every file valid before stays valid.
Edited in place without a supersede or a state change (`dl-047`); pending the approver's sign-off at
`task-251`'s review.
