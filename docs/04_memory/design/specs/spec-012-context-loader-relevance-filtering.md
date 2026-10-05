---
id: spec-012-context-loader-relevance-filtering
type: tech-spec
title: "Agent Context Loader — deterministic assembly & relevance filtering"
status: approved
scope: "src/core"
supersedes: ""
tmpl_version: 260703   # Orignal template version
---

## Context

Before any AI agent executes a workflow step (`wingfoil agent execute [--next]`, P5.3.1), it must be
handed a **curated execution context**: the relevant slice of Project DNA, the directives bound to the
agent's role, and the relevant Memory documents — assembled into a single structured payload
(P5.4.3 Agent Context Pre-Loading, P5.4.4 Agent Execution Context). This is the harness's core value
proposition against "load everything" (Product Brief, Key Differentiators): selective + curated, not a
full codebase dump.

Two hard requirements make this a spec-worthy surface rather than an implementation detail:

- **REQ-SYS-07 (North Star — Deterministic context assembly).** Assembling the execution context twice
  for the same **task**, **role**, and **unchanged project state** must yield **byte-for-byte identical
  output**. Any non-determinism in selection, ordering, or serialization breaks the Determinism Index.
- **Context Load Time < 30 s** (Product Brief, Supporting Indicators; `agent execute` performance
  target). The payload must be **bounded** so it stays well under agent token limits and assembles fast.

There is **no ADR and no other tech-spec** covering this module today, so this document is the single
shared definition of *what gets loaded, in what order, and in what exact serialized form*. Without it,
`relevance-filter`, `directive-loader`, `dna-loader`, and `context-builder` would each re-derive selection
and ordering rules independently, and the byte-for-byte guarantee would be impossible to test.

Scope note: the Context Loader lives in the **`core`** module (`src/core/`, planned) per the current DNA
module list (`core, storage, memory, dna, directives, workflow, cli, mcp-server`). It **reads only** —
it never mutates Memory, DNA, or workflow state during assembly (REQ-SYS-03: state is derived, not
indexed). Semantic search is out of scope (deferred to v1.1 per Product Brief); relevance is
**keyword/link/frontmatter-based** and therefore fully deterministic.

## Specification

### 1. Placement & responsibilities

Four cooperating units under `src/core/` (folded into the `core` module):

| Unit                  | Responsibility                                                                 |
|-----------------------|--------------------------------------------------------------------------------|
| `dna-loader`          | Select the relevant DNA sections for the task/role.                            |
| `directive-loader`    | Resolve `role → directives` (via `roles.yaml`) + global directives.            |
| `relevance-filter`    | Rank and select relevant Memory documents (keyword/link/scope), bounded.       |
| `context-builder`     | Orchestrate the three loaders and emit the **canonical serialized payload**.   |

`context-builder` is the only public entry point. It is a **pure function** of its inputs (below): no
wall-clock, no randomness, no environment reads, no unordered map/set iteration in any output-affecting
path (REQ-SYS-07, Conventions §8 Determinism).

### 2. Input — `ContextRequest`

All inputs are explicit and content-addressed; nothing is inferred from ambient state.

```ts
interface ContextRequest {
  role: RoleId;            // e.g. "developer" — resolved from the workflow step (P5.3.2) or --element
  element: {               // the active Memory element the step operates on (usually a task)
    type: MemoryType;      // "task" | "bug" | "release" | ...
    id: string;            // e.g. "task-042-implement-cli-grammar"
  };
  stateRef: string;        // git commit SHA pinning "project state" (REQ-SYS-01/03)
  limits?: ContextLimits;  // optional caps; defaults in §6
}
```

`stateRef` makes "unchanged project state" concrete: the same `(role, element, stateRef)` MUST always
produce the same bytes. If any input differs, output MAY differ; if none differ, output MUST NOT differ.

### 3. Assembly pipeline (fixed order)

The builder runs these stages in this exact sequence and concatenates their outputs in this order:

```
1. resolve-element   → read the element's frontmatter + body (storage, read-only)
2. load-dna          → dna-loader:        DNA sections (§4)
3. load-directives   → directive-loader:  role directives + globals (§5)
4. filter-memory     → relevance-filter:  ranked, bounded Memory docs (§6)
5. serialize         → context-builder:   canonical envelope (§7)
```

Stages 2–4 are independent and MAY execute concurrently, but their results are placed into the envelope
in the **fixed section order** of §7 regardless of completion order.

### 4. DNA selection (`dna-loader`)

DNA is small and fully declared, so selection is inclusion-by-category, not fuzzy matching:

- Always include: `project`, `team` (roles/members). The rules the former `conventions` section held
  are directives since `spec-002` v1.1, and reach the context through §5.
- Include the `modules[]` entries the element's `modules:`/`scope:` frontmatter selects. Each entry is
  read by its leading token (`src/workflow — the engine` is `src/workflow`), which selects a module
  whose `name` equals it, or whose `path` equals it or lies under it at a segment boundary (`src`
  selects `src/core`, while a prefix that ends mid-segment selects nothing). If the element declares
  none, include **all** modules (deterministic superset, never a guess); if it declares some and none
  selects a module, include **all** modules too and record the note `no module matches the element's
  modules:/scope: (<entries>); all modules included` among the build's diagnostics, never in the
  payload.
- Always include the `paths:` section whole, so every query category it declares is included
  (`sources, tests, docs, config, governance`, and `runs` — `spec-016` §4.1).
- Emit sections in the **declared order of `dna.yaml`** (source order is the canonical order).

### 5. Directive resolution (`directive-loader`)

- Look up the request `role` in `roles.yaml`; collect its bound directives (P5.4.2, REQ-SYS-08 — bind by
  role, never by person).
- Add the **global** directives applied to all roles (`doc-versioning, documentation, security,
  security-secrets, claim-evidence`).
- Deduplicate by directive id; **sort the final list lexicographically by directive id** (stable,
  reproducible order — never rely on `roles.yaml` listing order or file-system enumeration order).
- **Precedence when two directives share an id: `custom/` wins over `built-in/`** — a local
  customization overrides the shipped default, matching P3.8's "teams can create custom directives"
  on top of pre-configured templates. Ratified by `dl-037-builtin-vs-custom-directive-precedence`
  (option A.1), which replaced an accidental rule: an earlier implementation broke the tie on shortest
  path, so `built-in/` won because `'b'` sorts before `'c'`.
- **A shadowed directive is reported, never silently dropped** (`dl-037` option B.1), and so is a
  **dangling binding** — an id bound to the role with no directive file on disk (`dl-042` D, ratified
  by `dl-051-dangling-directive-binding-warning`). Both are emitted through the resolution's
  `warnings` channel (the one `dl-029-role-with-no-directive-assignments` introduced); §5.1 fixes the
  exact texts and their order. Dropping one in silence would contradict this section's own
  "authoritative rules … never truncated" rule below, and would leave an agent unaware of a directive
  it was meant to obey.
- Each directive is included **verbatim** (full Markdown body); directives are authoritative rules and
  are never truncated by the bounding logic in §6.

#### 5.1 Resolution warnings — the three kinds, their texts and their order

Directive resolution emits **three** kinds of warning, and no others. They appear in this **fixed
order** (REQ-SYS-07 — the payload must be a pure function of the inputs, never of `roles.yaml` listing
order or file-system enumeration order): the no-assignments warning first, then dangling ids ascending,
then shadowed ids ascending. None of the three is an error; resolution always completes.

| # | Kind | Text | Cardinality |
|---|------|------|-------------|
| 1 | No assignments (`dl-029`) | `` no directives assigned to role '<role>' `` | 0 or 1 |
| 2 | Dangling binding (`dl-042` D, `dl-051`) | `` directive '<id>' bound to role '<role>' has no directive file `` | one per dangling id, ascending by id |
| 3 | Shadowed directive (`dl-037` B.1) | `` directive '<id>' defined in <paths>; using <winner> `` | one per shadowed id, ascending by id |

- **Kind 1** fires when the role contributes no assignments of its own — absent from `assignments`, or
  bound to an explicitly empty list. It still resolves to exactly the globals (`dl-029`'s ratified
  hybrid); the warning is the operator signal that the role is unbound, not a refusal.
- **Kind 2** checks *every* id bound to the role — through its own `assignments` entry **and** through
  `global`. A dangling **global** is therefore reported too, which matters most: a missing global
  removes a directive from **every** role.
- **Kind 3**: `<paths>` is every file defining the id, in ascending path order, joined with `, `;
  `<winner>` is the path the precedence rule above selects.

**These warnings reach context assembly, not only the listing.** All three are produced by the
directive resolver itself, so the same array is carried by `directives list --role <r>`'s `warnings`
**and** by the assembled execution context (`ExecutionContext.warnings`). The two surfaces are one
rule, never two: a listing-only warning would be a second implementation that can drift, and would
leave agent-session context assembly silent about the exact directive an agent will not receive
(`dl-051`). The warnings are diagnostics *about* the context, not content *of* it — §7's canonical
envelope has no warnings section, so they never enter the serialized payload and never perturb its
byte stream.

`directives list` **without** a role filter has no role to resolve against, so its `warnings` are kind
3 only, computed by the same selection primitive over every installed directive file.

### 6. Relevance filtering (`relevance-filter`) — Memory selection

Deterministic, keyword/link-based selection over Memory documents (no semantic/embedding search; that is
v1.1). Every document is scored by a **fixed tiered rule set**; higher tier = higher relevance:

| Tier | Rule                                                                                      |
|------|-------------------------------------------------------------------------------------------|
| T1   | **Explicit links**: ids the element references in frontmatter (`adr:`, `spec:`, `dl:`, `bug:`, `depends_on:`). |
| T2   | **Same release scope**: docs under the element's release / release-line path.             |
| T3   | **Shared traceability keys**: docs citing the same feature (`P*`) or requirement (`REQ-*`) as the element. |
| T4   | **Keyword/tag overlap**: docs whose `tags:` or title tokens intersect the element's tags/title tokens. |

Scoring and ordering:

```
score(doc) = 1000*T1 + 100*T2 + 10*T3 + overlapCount(T4)
order:      score DESC, then type ASC, then id ASC   // total, deterministic tie-break
```

Bounding (the "curated, not full dump" guarantee — Product Brief; keeps assembly < 30 s and under token
limits):

```ts
interface ContextLimits {
  maxDocs: number;   // default 40  — max Memory docs included
  maxBytes: number;  // default 262144 (256 KiB) — max total Memory body bytes
}
```

- Walk documents in the order above; include until either cap would be exceeded.
- **Deterministic truncation**: when a cap is reached, stop — never partially include a document, and
  never drop a higher-ranked doc to fit a lower-ranked one. Because the order is a total order, the
  included set is a pure function of `(element, stateRef, limits)`.
- Documents in states `draft`/`deprecated`/`superseded` are **excluded** (only stable, decided and
  still-current content enters an execution context), so a doc's frontmatter `status:` is part of the
  selection input. `superseded` — the terminal state of `adr`/`tech-spec` — is archived content and is
  excluded for the same reason as `deprecated`; the previously-listed `rejected` is dropped, as
  `spec-001-memory-yaml-schema` removed that status from every type's machine. Ratified by
  `dl-028-archived-states-excluded-from-context`; the shared predicate is `isArchivedStatus`. The
  type-scoped Memory lookups (`listMemoryDocumentsByType`, `findMemoryDocumentByTypeAndId` and its
  `…AtRev` form) exclude archived documents by default and take an explicit `includeArchived` opt-in
  (`dl-038` option 1, `task-171`), so a consumer that omits the filter fails closed. The context
  builder does not rest on that default: it reads the whole snapshot at `stateRef`
  (`loadMemoryDocumentsAtRev`), refuses an archived subject element itself, and drops archived
  candidates here through `isArchivedStatus`.

### 7. Canonical serialized payload (`context-builder`)

The output is a **single UTF-8, LF-terminated Markdown document** with a fixed section order and fixed
formatting. This canonical form is the byte-for-byte artifact REQ-SYS-07 tests against.

```
# WingFoil Agent Context
<!-- role: {role} | element: {type}:{id} | state: {stateRef} -->

## 1. Task
{element frontmatter as sorted YAML block}
{element body, verbatim}

## 2. Project DNA
{selected DNA sections, in dna.yaml declared order}

## 3. Directives ({role} + global)
### {directive-id}          <!-- repeated, ids sorted ascending -->
{directive body, verbatim}

## 4. Relevant Memory ({n} documents)
### {type}:{id}             <!-- repeated, in §6 order -->
{doc frontmatter as sorted YAML block}
{doc body, verbatim}
```

Canonicalization rules (all mandatory for the byte-for-byte guarantee):

- **No wall-clock / no environment data.** The header comment carries only `role`, `element`, and the
  caller-supplied `stateRef` (a commit SHA). No "generated at" timestamp, no host, no absolute paths.
- **Newlines** normalized to `\n`; exactly one trailing `\n`; no trailing whitespace on any line.
- **YAML frontmatter blocks** re-emitted with keys **sorted ascending**, so upstream key-order changes
  do not perturb output (paired with the doc-level `stateRef` which does capture real content changes).
- **Section headings and numbering are fixed literals**; a section with no content still renders its
  heading with an empty body (e.g. `## 4. Relevant Memory (0 documents)`), so structure is stable.
- **Paths are repo-relative**; the element/doc ids are the stable identifiers, never filesystem paths.

### 8. Determinism contract (maps to REQ-SYS-07 Fit Criterion)

Given identical `(role, element.type, element.id, stateRef, limits)`:

1. **Selection** is identical — pure function of pinned state (§4–§6).
2. **Ordering** is identical — total orders with lexical tie-breaks everywhere (§5, §6).
3. **Serialization** is identical — canonical form forbids clocks, randomness, and map-iteration order (§7).

Therefore `build(req) == build(req)` byte-for-byte — the North Star fit criterion. This is the primary
acceptance test for the module (Jest, comparing two independent assemblies of the same request).

### 9. Performance

- Target **< 30 s** end to end (`agent execute` target; P5.4.3). In practice bounded by `maxBytes`
  (256 KiB default) and `maxDocs` (40), keeping the payload well under agent token limits.
- All I/O is local git-backed file reads (REQ-SYS-01); no network. Stages 2–4 may run concurrently.

## Consequences

- **Depends on stable upstream contracts.** Relevance filtering reads element/doc **frontmatter**
  (`status`, `tags`, traceability keys, link fields) and `roles.yaml` bindings; changes to those field
  names ripple into §5–§6 and require a revision here. The link fields in §6/T1 must exist on the memory
  templates for T1 to fire.
- **Testability.** The determinism contract (§8) is directly executable: build twice, `assertEqual`
  bytes. Relevance tiers (§6) and canonicalization (§7) each get focused unit tests; this satisfies the
  "context building (relevance filtering)" unit-test line in the testing strategy.
- **Bounded by design.** If real workloads need larger contexts, tune `ContextLimits` — but any change to
  default caps, tier rules, ordering, or the canonical envelope is a **breaking change to the byte
  stream** and MUST supersede this spec (new `spec-*`, `supersedes: spec-012-...`) so the Determinism
  Index baseline is re-established intentionally, not silently.
- **Semantic search later.** When embeddings arrive (v1.1), they enter as an *additional* deterministic
  tier or a re-ranked candidate set with a fixed tie-break — they must not reintroduce nondeterministic
  ordering. That is a future spec, not this one.

## Process Notes

Grounded in `docs/02_requirements/03_sard/01_architecture.md` (REQ-SYS-07 North Star + fit criterion,
REQ-SYS-03 stateless derivation, REQ-SYS-08 role binding), `docs/01_vision/06_features.md`
(P5.3.3 / P5.4.3 / P5.4.4), and `docs/01_vision/01_product-brief.md` (Context Load Time < 30 s;
"selective + curated" differentiator; keyword-search-only constraint). The module relocates to
`src/core/` because the current DNA has no `context` module (its module list is `core, storage, memory,
dna, directives, workflow, cli, mcp-server`), and uses the current release-line-scoped Memory layout
applied by the T2 scope rule. Discovered proactively as a `release-planning/identify-specs` candidate:
it is a genuinely new architectural surface with no prior ADR/spec.

**Revision (2026-09-17) — §5.1 added: all three resolution warnings, their texts and their reach, per
`dl-051-dangling-directive-binding-warning`.** §5 named only the shadow warning (via `dl-037`) and the
`warnings` channel `dl-029` introduced — no warning text, and no mention of the dangling-binding
warning `task-055-auto-load-directives-by-role` shipped (merged at `9c83ca2`). `dl-051` (`ready`,
approved `8c3fe35`) ratified that warning, its inclusion of dangling **globals**, and the two texts as
written, together with the rule that it is emitted by the resolver and so reaches
`ExecutionContext.warnings` as well as `directives list --role`. The new §5.1 states points 1–4 of that
decision. Every statement in it was read off the code on `main` at `194ff91` —
`selectDirectivesById` and `resolveRoleDirectives` (`src/core/context.ts`: the warning literals at
`:122`, `:166`, `:173`, the `allowedIds = assignments ∪ global` union at `:169`, the ascending
`dangling` sort at `:172`, and the append order `:166` → `:173` → `:174`) and `buildDirectiveListing`
(`src/core/directives-list.ts`, which takes `selectDirectivesById(...).warnings` without a role filter
and `resolveRoleDirectives(...).warnings` with one) — and cross-checked against the shipped assertions
in `test/core/context.test.ts` and `test/core/directives-list.test.ts`. Edited in place without a
supersede or a state change, per the `spec-001` precedent `dl-041` cites.

**Revision (2026-09-24) — §5's global-directive enumeration gains `claim-evidence`, per
`task-094-write-the-baseline-rule-where-implementers-meet-it`.** The list is parenthetical but it is
an enumeration of what the loader adds for every role, and `roles.yaml` v1.1 binds a fourth global
directive, so the sentence would otherwise under-report what a role's context contains. The
resolution rules themselves — deduplicate by id, sort lexicographically, `custom/` wins over
`built-in/` — are untouched. Edited in place without a supersede or a state change.

**Revision (2026-10-05) — §6 states that the Memory scan primitives exclude archived documents by
default, per `task-171-make-memory-scan-primitives-fail-closed-archived-elements` (`dl-038` option 1).**
`dl-038`'s Actions ask for the new default to be stated here. The excluded set and the predicate are
unchanged. Edited in place without a supersede or a state change.

**Revision (2026-10-05) — §4 brought in line with `dna.yaml` as it is, per
`task-176-complete-spec-012-context-builder-dna-selection-relevance`.** §4 told the `dna-loader` to
always include `conventions`, a section `spec-002` v1.1 removed (its rules moved to directives, which
§5 already loads), and listed five `paths` categories where the schema has six since `task-138` added
`runs` (`spec-016` §4.1; `src/dna/schema.ts` `Paths`). The bullet now names no removed section and
includes the `paths` section whole. In the same pass, §5's global-directive enumeration gains
`security`, which `roles.yaml` binds globally since
`task-133-bind-builtin-security-directive-role-stop-tests-pinning` (`dl-059`) and which the enumeration
therefore under-reported (`grep -n -A8 '^global' .wingfoil/roles.yaml`). Selection rules, order and the
§7 envelope are untouched; the builder that implements them is `assembleExecutionContext`
(`src/core/context.ts`). The modules bullet now also matches an entry by path, not only by name, per
the approver's ruling D3 on this task (2026-10-05): a tech-spec's `scope:` is a path (`src/core`) or
prose led by one, which a name-only match never selected, leaving such an element with no module at
all. Edited in place without a supersede or a state change, as the two earlier Revision notes were.

**Revision (2026-10-05) — §6's sentence on the archived default names the primitives that have it,
per `task-176-complete-spec-012-context-builder-dna-selection-relevance`.** The sentence `task-171`
added said the primitives "the loader resolves an element with" exclude archived documents by
default. Since `task-176` the builder resolves the element from the commit's whole snapshot,
`loadMemoryDocumentsAtRev`, which takes no `includeArchived` and returns archived documents
(`grep -n "MemoryTypeScanOptions" src/memory/query.ts` lists the three lookups that do). It now names
those lookups and says how the builder keeps archived content out instead: it refuses an archived
subject and §6 drops archived candidates. The excluded set and the predicate are unchanged. Edited in
place without a supersede or a state change.
