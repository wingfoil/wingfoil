---
id: "task-093-dna-mutation-surface-add-remove-update"
type: task
title: "Build the DNA mutation surface: `dna add|remove|update <full path> --value <v>` in the grammar dl-082 ratified, and make the traversal refuse a path that does not resolve"
status: done
rejection_reason: ""
release: "v0.2"
priority: "high"
kind: "feature"
tags: ["v0.2", "dna", "cli", "mcp"]
ref: "dl-081-dna-mutation-surface-shape"
bug: ["bug-084-dna-key-alias-writes-unschemad-keys", "bug-083-dna-set-cannot-write-array-valued-fields"]
depends_on: ["task-091-reads-resolve-at-head"]
tmpl_version: 260703
---

## Description

`dl-081-dna-mutation-surface-shape` is `ready`, ratified as option **(E)**. Today `dna set` reaches
**7 of roughly 38 schema fields** — `version` and the six scalars under `project` — while 11 fields are
array-valued and 17 more live inside array entries, none of them reachable for create, update or
delete. This task builds the ratified surface.

**Two bugs close under it, in this order:**

- **`bug-084`** first, because the ratification makes it a *precondition*: a path that does not resolve
  must be **refused, never created**. `setDnaValue` currently creates an object for any segment it
  cannot descend into, which is how `dna set tech_stack.cli.framework X` writes `stacks.cli.framework`
  — a key in no schema — and commits it at exit 0.
- **`bug-083`** then, which the new verbs close.

## Acceptance Criteria

- **AC1** — **`bug-084` first, and independently verifiable.** After it, a `--field` path that does
  not resolve against the schema is refused at exit `1` naming the path; no intermediate object is
  created; and `dna set tech_stack.cli.framework Commander` fails instead of committing. The DNA
  pillar still **accepts** unknown keys when *reading* a document (pass-through on read is deliberate
  and must not regress) and refuses to *write* one — pin both halves.
- **AC2** — Three verbs exist: `dna add`, `dna remove`, `dna update`, each taking `--field` and
  `--value`, following `memory add --type … --title …`'s option-bearing grammar.
- **AC3** — **`--field` is a full path.** `--field team.roles` and `--field team.members.roles` are
  different fields and both resolve. Entries inside a collection are addressed **by `name`**, not by
  index: `--field team.members.roberto.roles` reaches that member's role list. Indices are not the
  addressing form — `dl-081` records why.
- **AC4** — **Name uniqueness is a prerequisite of AC3 and must be enforced, not assumed.** Add a
  uniqueness refinement per collection to `src/dna/schema.ts`, or make the verbs refuse when a path
  segment matches more than one entry. Choose and argue it; measured today, WingFoil's own `dna.yaml`
  has 45 entries across 11 collections with zero duplicates, so either choice is non-breaking here —
  establish that it is non-breaking for the scaffold templates too.
- **AC5** — All four path shapes work, each pinned: an array of strings at depth 2
  (`paths.sources`); an array of objects at depth 1 (`modules`); an array of objects at depth 2
  (`team.members`, `stacks.technologies`); and a string array nested inside an object array
  (`team.members.<name>.roles`) — the last being the shape that only this addressing form can express,
  and the one `dl-080` made routine.
- **AC6** — `--value` carries the new entry's identity when the path ends at a **collection** and the
  new value when it ends at a **leaf**. State it in `--help` rather than leaving it to be inferred.
- **AC7** — **MCP parity**: three new core functions mean three new Tools per `spec-006` §3 —
  `dna.add`, `dna.remove`, `dna.update`. Check `spec-004`, which owns Tool names, and report whether
  the shape is awkward there; `dl-081` records that a shape awkward on MCP is the wrong shape.
- **AC8** — **Amend the specs**, per `dl-081` action 3: `spec-002` and `spec-006` at minimum, and the
  CLI grammar spec since the grammar grows. In-place dated Revision notes under `dl-047`, the route
  `task-079`/`task-084`/`task-085` used on `spec-015`. A ratified shape that no spec records is the
  defect this whole class came from.
- **AC9** — `dna set` keeps working for scalars and is not removed. Its relationship to the new verbs
  — whether `set` remains the scalar verb or `update` subsumes it — is a decision: make it and say so.
- **AC10** — All six gates green; the full `tsc --noEmit -p tsconfig.json` silent.

## Implementation Notes

- **This is the largest task in the release. If you judge it too large to land coherently, stop and
  report a split proposal rather than half-building it** — a partially implemented ratified grammar,
  where `add` works for members but not modules, is worse than none. `dl-081` action 2 leaves exactly
  this open: whether the whole surface lands or only the collections `dl-080`'s flows need.
- Read `dl-081` in full before designing — the collision measurements, the four shapes, the index
  argument and the two wrinkles are all there, and the ratification's `Reason:` settles three
  questions you would otherwise have to re-open.
- `task-091` runs in parallel and touches the directive role-catalogue read. Coordinate by not
  touching it: this task owns `src/dna/` and the new core functions.
- Classify every AC per `dl-014`/T1.

## Execution Notes

<!-- filled in per phase -->

### design — role: architect

**Baseline.** Worktree `/home/robypomper/Workspaces/.wf2-wt/task-093`, branch
`task/task-093-dna-mutation-surface-add-remove-update`, from `main` at `eca728e`. `npx jest` before
any change: **116 suites / 1833 tests passed**.

#### read_related (`dl-015`, HARD gate)

- **`task-091-reads-resolve-at-head`** — the one `depends_on`. It is running **in parallel** and has
  **no Execution Notes yet**: read from its own branch without entering its worktree,
  `git show task/task-091-reads-resolve-at-head:docs/self/docs/04_memory/v0.2/task-091-reads-resolve-at-head.md`
  → the `## Execution Notes` section is still the empty `<!-- filled in per phase -->` placeholder.
  Acknowledged on its **Description and Acceptance Criteria** instead, which is what exists: it lands
  `dl-080`'s **read** half for `bug-081` (state machine read from the working tree) and `bug-082`
  (`directive assign` validating `--role` against the working-tree role catalogue), following
  `task-090`'s pattern of moving the **baseline** to `HEAD` rather than adding a guard.
  **Interface with this task:** `task-091` owns the directive role-catalogue read; this task owns
  `src/dna/` and the new `src/core` functions. The overlap is `team.roles` — `task-091` changes *which
  copy of `dna.yaml`* a role read resolves against, this task changes *how a path into `dna.yaml` is
  resolved and written*. They meet only in `src/core/index.ts` (both add code) and in
  `src/dna/schema.ts` (this task adds uniqueness refinements; `task-091` reads the catalogue through
  `src/dna/roles.ts`, which is untouched here). No behavioural conflict is expected; the merge is
  textual.
- **`task-092-writes-refuse-a-dirty-target`** is not a `depends_on` but is adjacent: it makes a write
  refuse while its target is dirty. The three verbs added here are writes on `.wingfoil/dna.yaml`, so
  they will inherit that rule when `task-092` lands. Nothing here pre-empts it — this task does not
  touch the commit path.

#### verify_specs

Every artefact this task needs already exists and is `approved`/`ready`; **no new `tech-spec` is
scaffolded**, so the design gate is a pass-through (no approver gate).

- `dl-081-dna-mutation-surface-shape` — `ready`, ratified as option **(E)** in `5aaa5af`. Read in full
  plus the approve commit's `Reason:` block.
- `bug-084-dna-key-alias-writes-unschemad-keys` (`in-progress`), `bug-083-dna-set-cannot-write-array-valued-fields`
  (`in-progress`) — the two bugs closing under this task.
- `spec-002-dna-yaml-schema` (`approved`), `spec-006-core-domain-api` (`approved`),
  `spec-008-cli-grammar` (`approved`), `spec-005-cli-command-contract` (`approved`),
  `spec-004-mcp-surface-contract` — all read; three are amended by AC8 (see below).

#### What the ratification settles, and is therefore not re-opened

Addressing by `name` (never by index); uniqueness as a prerequisite rather than an assumption; a path
that does not resolve is refused, never created; `--value` is the entry's identity at a collection and
the new value at a leaf; nothing extends `DNA_KEY_ALIASES`.

#### Design — the shape this lands

1. **`src/dna/path.ts` (new) — one schema-driven resolver, used by all four verbs.** It walks a
   dotted path against `DnaYaml` **itself** (Zod v4 exposes `def.shape` / `def.element` /
   `def.innerType`, verified to traverse `.passthrough()` and `.superRefine()` nodes alike), never
   against a hand-written table, so the mutation surface cannot drift from the schema it writes.
   Resolution classifies the target as one of: `section` (an object node), `scalar` (a string/number
   leaf), `string-list` (`z.array(z.string())`), `collection` (`z.array(z.object())`),
   `entry` (one element of a collection, addressed by `name`), or a **refusal**. A segment the schema
   does not declare is a refusal — this is `bug-084`'s repair and the precondition `dl-081` names.
   *Pass-through on read is untouched:* the resolver is on the **write** path only; `loadDnaYaml` /
   `dna show` keep returning unknown keys.
2. **`src/dna/mutate.ts` (new) — the pure `add|remove|update` semantics** over a cloned document, so a
   refused mutation leaves the input untouched. No git, no filesystem (spec-006 §1: the pillar stays a
   leaf under `core`).
3. **`src/dna/edit.ts` (new) — the comment-preserving structural edit.** `setDnaValueInText`
   (`task-063`, `bug-004`) rewrites or inserts exactly one **mapping** line and deliberately skips
   every sequence branch, so it cannot express any of the four shapes this task adds; the existing
   fallback for a shape it cannot edit is a whole-file `dump()`, which strips **every** comment
   including the `[SPEC]`/`[AUTHORING]` provenance annotations. That fallback is rare for `dna set`
   and would be the **norm** for `dna add` — on a freshly `init`-ed project every structured add would
   delete the scaffold's own guidance comments — so a sequence-aware minimal edit is part of this
   task, not a follow-up. It keeps the same safety contract as `setDnaValueInText`: return `undefined`
   when no provably-minimal edit exists, and verify every candidate by re-parsing it and comparing the
   **whole document** against the intended object before returning it.
4. **`src/core/index.ts` — three `CoreFn`s** (`dnaAdd`, `dnaRemove`, `dnaUpdate`) following `dnaSet`'s
   mutating-op template verbatim (git-identity pre-flight → argument validation → load → resolve →
   mutate → re-validate the serialized bytes → write + one scoped commit). Kept compact and
   contiguous, since parallel tasks share this file.
5. **Grammar** (AC2/AC3/AC6): `--field` carries the full path, `--value` the payload, plus one
   `--<entry-field>` option per field the entry schemas declare. Option names are the **schema field
   names verbatim** (`--executes_as`, not `--executes-as`): Commander camel-cases a dashed option
   (`--executes-as` → `executesAs`) while `CoreOption.name` is read back by its literal name in
   `buildOptionValues` (`src/cli/program.ts`), so a dashed name would silently never arrive.
   `dl-081`'s `--executes-as` spelling was illustrative of *which* options exist, not of their
   punctuation; the schema-name rule also keeps the option set derivable rather than mapped.
6. **Comma-separated values** where, and only where, the target's schema type is `z.array(z.string())`
   (`paths.*`, `team.members[].roles`, `team.agents[].executes_as`) — the precedent is
   `directive assign --directive testing,code-quality` (`task-056`).

#### Decisions this task owes an argument for

- **AC4 — uniqueness: a per-collection Zod refinement in `src/dna/schema.ts`, not a verb-level
  "refuse on more than one match".** The refinement is the stronger of the two because it makes the
  ambiguity *unreachable* rather than *handled*: once the load path rejects a duplicate, no verb can
  ever see a two-match resolution, so the alternative's check would be unreachable code in every path
  that can actually run — and the `testing` directive forbids adding dead code. It also protects the
  readers that are **not** verbs: `resolveRoleHolders` (`src/dna/roles.ts`), the directive bindings,
  and every future consumer that looks an entry up by name. It is consistent with the precedent
  `spec-002` already sets: `Team.superRefine` is a same-document integrity rule that makes a violating
  file fail to load, and duplicate names are the same kind of rule. The cost — a document that loads
  today would stop loading — is what AC4 asks be measured rather than assumed:
  - `.wingfoil/dna.yaml`: **0 duplicates**, 38 object entries across 6 collections plus 8
    strings across 5 `paths` categories (measured by parsing the file, not by reading it).
  - the **scaffold templates** (`dnaYaml()`, `src/storage/templates.ts`) — the second half of AC4, and
    a different question: `modules`, `stacks.technologies`, `team.members` and every `paths` category
    scaffold **empty**, `team.roles` scaffolds 7 distinct names, and `stacks.methodologies` scaffolds
    the chosen template's list (Scrum: `Scrum`, `Specification by Example (BDD)`, `TDD`; Kanban:
    `Kanban`, + the same two) — distinct in both. Pinned by a test over the real `templateScaffold`
    output for **every** registered template, so a future template cannot introduce a duplicate
    silently.
- **AC9 — `dna set` stays, and `update` does not subsume it.** `set` keeps its positional grammar
  (`dna set <key> <value>`), which `P2.1-dna-set.feature`, `spec-002` and `spec-005`'s worked examples
  all name; removing it would break a ratified acceptance contract for no gain. What changes inside it
  is `bug-084`'s repair: it resolves its key through the same `src/dna/path.ts` and refuses a path the
  schema does not declare. `update --field <path> --value <v>` reaches the same scalar leaves *and*
  the structured ones, so `set` becomes the positional shorthand for the scalar case rather than a
  separate mechanism — one resolver, one write path, two spellings.
- **The `tech_stack` alias is removed from the write path and kept on the read path.** `bug-084`'s
  Expected Behavior offers exactly two honest outcomes ("the alias translates the old *shape* as well…
  or the alias is removed and the old path is rejected as the unknown key it is"); a shape migration
  is not a path rewrite, so the second is the only one that can be implemented. `dna show tech_stack`
  keeps resolving (a read, and `P2.2-dna-show.feature` names it); `dna set tech_stack.…` is refused
  as the unknown key it always was. `DNA_KEY_ALIASES` stays exactly one entry and is now documented as
  read-side only — `dl-081`'s "nothing extends `DNA_KEY_ALIASES`", discharged.
- **Exit codes.** A **malformed** path (an empty segment, the BDD's `..language`) stays a usage error
  at exit `2` — `P2.1-dna-set.feature` pins it. A **well-formed but unresolvable** path is a
  validation failure at exit `1`, per `spec-005` §1 and the ruling recorded in `bug-076`'s Correction
  ("a dirty working tree is not a malformed invocation"; neither is a path that names a field the
  schema does not declare). A missing `--field`/`--value` is exit `2` (`spec-008` §5).

#### A consequence AC1 forces, recorded rather than worked around

`P2.1-dna-set.feature`'s first two scenarios are written against the **pre-`stacks`** shape
(`wingfoil dna set tech_stack.language python`, then `"language: python" under "tech_stack"`). They
pass today only because the first-segment alias rewrites `tech_stack`→`stacks` and `Stacks` is
`.passthrough()`, i.e. **only because of the defect `bug-084` files**. Once an unschema'd write is
refused they cannot pass as written, and AC1 requires exactly that refusal. The BDD file is an
acceptance contract in `docs/02_requirements/`, outside this task's declared amendment scope (AC8
names `spec-002`, `spec-006` and the CLI grammar spec), so it is **not edited here** — it is reported
as a proposed element instead. The Jest tests that encode the same stale expectation *are* in scope
and are re-pointed at a schema-declared path, with the old expectation kept as `bug-084`'s refusal
pin, so the change is visible in the diff rather than deleted.

#### T1 — acceptance-criterion classification (`dl-014`, `testing` directive)

| AC | Class | Evidence | Test |
|---|---|---|---|
| AC1 (unresolvable path refused, never created) | **red-first** | today `setDnaValue` creates an object for any segment it cannot descend into and `dna set tech_stack.cli.framework X` commits at exit 0 (`bug-084` Steps to Reproduce; `src/dna/set.ts` `if (!isPlainObject(node[segment])) node[segment] = {}`) | `test/dna/path.test.ts`, `test/core/dna-set.test.ts` "bug-084" |
| AC1 (read pass-through must not regress) | **characterization** | `.passthrough()` on every node is already `spec-002`'s declared behaviour and `loadDnaYaml` already returns unknown keys | `test/dna/path.test.ts` "read accepts what write refuses" |
| AC2 (three verbs exist) | **red-first** | `CORE_MODULES.dna` today registers `dnaSet`/`dnaShow` only (`src/core/index.ts`) | `test/core/dna-mutation-surface.test.ts` |
| AC3 (`--field` is a full path; entries by `name`) | **red-first** | no path in the codebase traverses an array | `test/dna/path.test.ts` |
| AC4 (uniqueness enforced) | **red-first** | `src/dna/schema.ts` carries exactly one refinement (`Team.superRefine`, referential) and no uniqueness constraint | `test/dna/schema-uniqueness.test.ts` |
| AC4 (non-breaking, own + scaffold) | **characterization** | measured: 0 duplicates in `.wingfoil/dna.yaml`; the scaffold's only non-empty collections are distinct | same file, "non-breaking" block |
| AC5 (all four path shapes) | **red-first** | none of the four is reachable today (`dl-081` E2) | `test/core/dna-mutation-surface.test.ts` |
| AC6 (`--value`'s two meanings stated in `--help`) | **red-first** | the option does not exist | `test/core/dna-mutation-surface.test.ts` ("states --value's two meanings") + `test/cli/program.integration.test.ts` (`dna add --help`) |
| AC7 (MCP parity: three Tools) | **red-first** | `dna.add|remove|update` do not exist, so the parity enumeration cannot contain them | `test/core/dna-mutation-surface.test.ts` "MCP parity" |
| AC8 (spec amendments) | **not testable — artefact** | a dated in-place Revision note is a document edit with no runtime behaviour; the route is `dl-047` as used on `spec-015` by `task-079`/`084`/`085` | verified by the artefacts + `grep -n "Revision (2026-09-23)" docs/self/docs/04_memory/design/specs/spec-00{2,6,8}*.md` |
| AC9 (`dna set` still works) | **characterization** | it works today for the 7 reachable scalars; the change must leave that intact | `test/core/dna-set.test.ts` (existing, re-pointed at `project.license`) |
| AC10 (six gates) | **characterization** | all six are green on `main` at `eca728e` | the gate commands, pasted in `### refactor` |

#### Size — the split permission, and why it is not used

The task carries permission to stop and propose a split. Measured against the surface above the work
is one coherent piece with one seam that could be deferred, and deferring it is what would make the
landing incoherent rather than smaller: the grammar must reach **every** collection or none
(`dl-081` action 2), and that part is fixed cost — one resolver, one mutator, three functions. The
only genuinely separable seam is the comment-preserving structural edit (design point 3), and its
fallback already exists and is already the shipped contract for `dna set`, so it fails **safe**: if it
proves unaffordable the surface still lands whole and correct, with a filed bug for the comments. That
is the split this task would take, and it is a fallback inside the task rather than a reason to stop
before starting it.

### red — role: developer (commit `bfcd90f`)

Seven new or rewritten suites; `npx jest test/dna test/core/dna` before any implementation:
**8 failed suites, 42 failed tests, 78 passed** (three of the failures are "Cannot find module
`../../src/dna/{path,mutate,edit}`" — the modules did not exist yet).

- `test/dna/path.test.ts` — the resolver: the four `dl-081` path shapes, entry addressing by name,
  the `team.roles` / `team.members.<name>.roles` collision, and every `bug-084` refusal (unknown root
  key, unknown key under a declared section, descending through a value or a list, an index where a
  name belongs, an absent entry, a duplicate name). Plus the AC1 pair asserted together: the SAME
  document that `DnaYaml` parses with its unknown keys intact is refused by the resolver when written.
- `test/dna/schema-uniqueness.test.ts` — AC4, one case per collection, plus the two non-breakage
  measurements (this repository's `dna.yaml`, and every registered `init` template's scaffold).
- `test/dna/mutate.test.ts` — the semantics, per verb and per target kind, including every refusal
  and the purity property.
- `test/dna/edit.test.ts` — the comment-preserving edit, including a table-driven round trip over
  **this repository's own `dna.yaml`** asserting that every comment line survives each of six real
  mutations.
- `test/core/dna-mutation-surface.test.ts` — the registered operations end-to-end in throwaway repos:
  registration, derived CLI verb and MCP Tool name, the four shapes, the commit subject and its
  scope, exit codes, the git-identity pre-flight.
- Re-pointed, rather than deleted, the existing expectations that encoded `bug-084`: `dna set
  tech_stack.language python` became `dna set project.license MIT` in `test/core/dna-set.test.ts`,
  and the old expectation is now the refusal pin. Same in `test/cli/program.integration.test.ts`, and
  in `test/dna/set-in-text.test.ts` where the alias test became a *no-aliasing* test.
- `test/core/dna-set-comment-preservation.test.ts`'s "a key absent from the file is inserted" case
  used `project.owner` — a key `Project` does not declare, so under AC1 it must now be refused. It
  moved to `stacks.technologies.Zod.version`, which the schema declares and the file omits; that also
  makes it the first assertion that an insertion works *inside a sequence entry*.

### green — role: developer (commit `a1615a9`)

Four pieces, the smallest that make the ratified grammar work end to end.

- **`src/dna/path.ts`** — `resolveDnaPath` walks a dotted path against `DnaYaml` itself. Zod v4's
  introspection (`def.shape` / `def.element` / `def.innerType`) traverses `.passthrough()` and
  `.superRefine()` nodes unchanged — verified before designing on this, not assumed:
  `node -e "const {z}=require('zod'); …"` printed `obj type object`, `refined has shape true`,
  `members type array`, `opt of array → optional → array → string`. So there is **no hand-written
  field table**: a collection added to `spec-002` becomes addressable without editing this module.
  The traversal classifies the target (`section | scalar | string-list | collection | entry`) and
  refuses anything the schema does not declare — `bug-084`'s repair.
- **`src/dna/mutate.ts`** — `applyDnaMutation` over a `structuredClone`, so a refusal cannot leave a
  half-applied document behind. Entry keys are written in schema order (REQ-SYS-07: the same call
  always renders the same bytes).
- **`src/dna/edit.ts`** — the sequence-aware, comment-preserving text edit (see `### design` point 3
  for why it is in scope). Verified per edit by re-parsing and comparing the **whole document**
  against the intended one, structurally rather than byte-wise, because key ORDER is a rendering
  detail; anything it cannot do provably-minimally returns `undefined` and the caller falls back to
  `dump()`, exactly as `dna set` has always done.
- **`src/core/index.ts`** — `runDnaMutation`, the shared mutating-op template, plus `dnaAdd`,
  `dnaRemove`, `dnaUpdate` and their `CoreOption` declarations. `CoreOption` gained an optional
  `description`, which `src/cli/program.ts` renders instead of the generic `"{name} value"` — that is
  AC6's mechanism.

**What was removed, and why that is not scope creep.** `setDnaValue` is gone: it *was* `bug-084`'s
mechanism (`if (!isPlainObject(node[segment])) node[segment] = {}`), and its semantics are now
`applyDnaMutation`'s. The write path also stopped applying `DNA_KEY_ALIASES`; `dna show` still
applies it, and the constant's doc comment now says which side it is for.

### refactor — role: developer (commit `63bb3c0`)

- `edit.ts` imported `set.ts`'s `inlineCommentIndex`/`valueOf` instead of carrying a second copy —
  two scanners that must agree about where a value ends and a comment begins are two chances to
  disagree.
- `dna set` stopped loading `dna.yaml` a second time to check its target is a scalar; the shared
  pipeline does it on the document it already holds, and both use `DNA_YAML_PATH` rather than a
  literal.
- `resolveDnaPath` and `applyDnaMutation` took the schema as a parameter (defaulting to `DnaYaml`).
  This was a **coverage finding turned into a design one**: the "which shapes are addressable" and
  "how is an option value coerced" rules had branches no test could reach, because `DnaYaml` happens
  to declare only objects, scalars, string arrays and object arrays. Rather than delete the rules or
  leave them as untested claims, they are now exercised against schemas `spec-002` does not declare
  (`test/dna/path.test.ts` "what counts as an addressable shape", `test/dna/mutate.test.ts` "a
  numeric field takes a number").
- Removed two unreachable `default:` arms over closed unions and one double-guard in `listAt`; added
  the decline-path table in `test/dna/edit.test.ts` — thirteen shapes the editor must refuse rather
  than guess at, one per entry of its documented refusal list.

**Spec amendments (AC8)** — in-place dated Revision notes, the `dl-047` route `task-079`/`084`/`085`
used on `spec-015`. None of the three specs carries a `version:` field, so the doc-versioning
directive's bump rule does not apply to them; the Revision note is the record.

- `spec-002-dna-yaml-schema` — the six object collections in the pinned Zod definition now read
  `uniquelyNamed(...)`, and a new section, *Unknown keys: accepted on read, refused on write*, states
  what `.passthrough()` does and does not govern. It also records that `tech_stack` is not an alias
  on the write path.
- `spec-006-core-domain-api` §3 — three rows in the DNA table, and the Revision note explains why the
  restriction was never stated and why three Tools rather than a dozen.
- `spec-008-cli-grammar` — new §9 pins the `--field`/`--value` grammar, `--value`'s two meanings,
  entry addressing by name and the refuse-rather-than-create rule; §1 names the DNA verbs; §5 gains
  the sentence separating a malformed path (exit `2`) from an unresolvable one (exit `1`).

### merge with `main` (commit `3413cf6`) and the `task-092` hand-off

`git merge main` (dl-035 — merge, never rebase) at `3c3d666`. **One conflict, in
`src/core/index.ts`'s `dnaSetFn`**, where both sides rewrote the same body: `task-092` added
`dl-080`(B)'s dirty-target guard to it, and this task replaced it with a delegation to
`runDnaMutation`. Resolved by taking **both** sides rather than regenerating the block — `dna set`
keeps its delegation, and `task-092`'s `requireUnmodifiedTarget` pre-flight and `committedScopeError`
post-condition moved **into `runDnaMutation`**, where all four DNA write verbs inherit them instead of
only the one that had them.

**Which rule applies, checked rather than assumed (the hand-off asked for this explicitly).** The
plain `requireUnmodifiedTarget` rule, unaltered. `task-092` argued two exceptions and neither fits:
`requireAbsentTarget` is for a verb whose target must be NEW (`memory add`), while all four DNA verbs
edit an existing `dna.yaml` in place; and `wingfoil init`'s exemption rests on `detectInitState`
refusing an already-initialized project before a guard could run, whereas these verbs *require* an
initialized project and load `dna.yaml` as their input. The guard sits before the load, so no refusal
and no written byte can depend on a value the dirty copy contributed — which is also what makes
`loadDnaYaml`'s working-tree read equivalent to `HEAD`'s here, and keeps these verbs out of the
worktree-baseline class `bug-085`/`bug-086`/`bug-087` name.

Regression guard added to `task-092`'s own suite rather than a parallel one
(`test/core/write-guard-dirty-target.test.ts`, commit `858412d`): each of the three verbs refuses a
dirty `dna.yaml` at exit `1` naming the file, writes nothing, and on a clean tree still commits
exactly `.wingfoil/dna.yaml`. Without it `bug-078` — a declared release blocker — would reopen for
three new callers on the day it closed for the six old ones.

Re-read after the merge, as the brief requires: `dl-081` (unchanged, still `ready` at `5aaa5af`),
`bug-083`/`bug-084` (unchanged), and the four bugs `task-092`'s review filed (`bug-085`..`bug-088`) —
none touches the DNA write path; `bug-088` is about `initWingfoilStorage`, not these verbs. No
sentence in these notes needed correcting.

### AC7 — the MCP side, checked rather than assumed

`dl-081` records that "a shape awkward on MCP is the wrong shape", so this is a design check.

- **Naming (`spec-004` §4.1, which owns it).** Nothing is special-cased: `deriveVerb('dna', 'dnaAdd')`
  → `add` → `deriveMcpToolName` → `dna.add`, and likewise `dna.remove` / `dna.update`. Asserted
  against the real registry in `test/core/dna-mutation-surface.test.ts`, and the REQ-SYS-05 parity
  diff in `test/core/parity.test.ts` now enumerates **twelve** mutating operations with 0 unmatched on
  either side.
- **Is the shape awkward there? No — it is the shape MCP wants.** A Tool call's arguments are a JSON
  object, so `{ "field": "team.members", "value": "roberto", "email": "…" }` is the natural rendering
  of `--field`/`--value`/`--<entry-field>`; a per-collection verb set would have been a dozen Tools
  for one pillar, and `dna edit` none at all. Option (E) is also *better* on MCP than on the CLI in one
  respect: `--field`'s legal values are a closed set derived from the schema (`dnaCollectionPaths`),
  which a Tool's input schema can express as an enum, where `--help` can only describe it.
- **`--value`'s two meanings** are the one wrinkle, and they land in a property description in the
  input schema — the same place `--help` carries them. Nothing about it is MCP-specific.
- **What is awkward is pre-existing and already scheduled, not introduced here.**
  `src/mcp/registrar.ts` registers every `mutates: true` operation as a Tool with a description and a
  **zero-argument** handler (`buildParams` receives only `root`), so `dna.add` over MCP would throw the
  same `UsageError` that `dna.set`, `memory.add` and the four Memory transition verbs already would,
  and `createMcpServer` deliberately registers no Tools at all — Tools are **P5.2.3 (v0.4)** scope
  (`src/mcp/server.ts`'s own module doc says so). `spec-004` §4.3's "each Tool's input schema mirrors
  its CLI's required flags one-to-one" is therefore unimplemented for **all twelve** mutating
  operations, not for these three; `task-051` recorded the same boundary ("MCP `inputSchema` details
  beyond what the registrar derives" — out of scope). No element is proposed for it: it is scheduled
  work, not a finding.
- **`spec-004` was read and not amended.** §4.1's list is illustrative and §4.2 states the bijection
  the three new Tools satisfy by construction; the enumeration source `spec-004` defers to is
  `spec-006` §3, which this task amended.

### AC9 — `dna set` stays, and why

`update` does **not** subsume `set`. `dna set <key> <value>` keeps its positional grammar, which
`P2.1-dna-set.feature` pins ("Set a DNA field", "Error - invalid dotted key path") and which
`spec-002` and `spec-005` §4 both name; removing it would break a ratified acceptance contract to
save one line of registry. What changed is underneath: it is now `update` restricted to a single
value, over the same resolver and the same write path, so there is one mechanism with two spellings
rather than two mechanisms. The restriction is enforced where the pipeline already holds the loaded
document, and a `<key>` naming a collection or a list is refused by **naming the verb that reaches
it** — `bug-083`'s headline symptom was that this failure used to read `expected array, received
string`, which says nothing about how to write the field.

### A consequence AC1 forces on the BDD, reported rather than silently fixed

`P2.1-dna-set.feature`'s first two scenarios are written against the **pre-`stacks`** shape:

```
When I run "wingfoil dna set tech_stack.language python"
Then ".wingfoil/dna.yaml" contains "language: python" under "tech_stack"
```

They pass today only because the first-segment alias rewrites `tech_stack`→`stacks` and `Stacks` is
`.passthrough()` — that is, **only because of the defect `bug-084` files**. AC1 requires that write to
be refused, so those two scenarios cannot both be satisfied and AC1 met. The feature file is an
acceptance contract under `docs/02_requirements/`, outside this task's declared amendment scope (AC8
names `spec-002`, `spec-006` and the CLI grammar spec), so it is **not edited here** and is reported
as a proposed element instead. The Jest expectations that encoded the same stale shape *are* in scope
and were re-pointed (see `### red`), with the old expectation kept as the refusal pin.

### second merge with `main`, and the gate record (AC10)

An account-level rate limit interrupted this task after its first gate run. Nothing was lost — the
branch was intact at `858412d` with the `renderInline` simplification and its tests uncommitted, which
were finished work (committed as `b5dfd1a`), not a half-applied edit. **Every gate below was then
re-run from scratch on the merged tree; no result is carried over from before the interruption.**

`git merge main` again at **`b82356e`**, which had since taken `task-091` (reads resolve at `HEAD`)
and filed `bug-085`/`bug-086` with `task-095`/`task-096`. **Clean this time** — `task-091` touched
`src/core/loaders.ts`, `src/core/directive-assign.ts` and `src/core/memory-transition.ts`, none of
which this task edits. The semantic-conflict route the orchestrator warned about (a clean textual
merge that does not compile, surfacing inside jest's `globalSetup`) was checked explicitly with
`npx tsc -p tsconfig.build.json` — the emitting build, not just `--noEmit` — which exits `0`.

Worth recording, because it is the class `task-091` was closing: `loadDnaYaml` still reads the
**working tree**, and these verbs still use it. That is correct here and not `bug-085`/`bug-086`'s
defect — those are *gating* reads (which state machine governs, which role exists, which directive
exists) resolved from a copy nobody committed. `dna.yaml` here is not a gate, it is the **file about
to be rewritten**, and `requireUnmodifiedTarget` has already established that the working tree, the
index and `HEAD` agree about it before the load happens. A `HEAD` read would answer the same question
and then write bytes derived from it over a file it had not looked at. Neither `bug-085` (`memory
add`'s type registry) nor `bug-086` (the directive inventory) touches any code this task changes.

| Gate | Command | Result at `991ba06` |
|---|---|---|
| tests | `npx jest` | **127 suites / 2089 tests passed**, 0 failed |
| coverage | `npx jest --coverage` | `All files 98.49 % stmts · 93.65 % branch · 99.07 % funcs · 99.34 % lines` |
| build typecheck | `npx tsc -p tsconfig.build.json --noEmit` | exit `0` |
| full typecheck | `npx tsc --noEmit -p tsconfig.json` | exit `0` — silent, no exception (`bug-026` stays closed) |
| lint | `npm run lint` | exit `0`, 0 errors |
| API docs | `npm run docs:api` | exit `0` |

**Coverage against the right baseline.** `main` at `b82356e`, measured the same way in the same
session (`npx jest --coverage`, 122 suites / 1909 tests): `98.71 / 93.52 / 98.90 / 99.24`. This branch:
`98.49 / 93.65 / 99.07 / 99.34`. **Branch +0.13, functions +0.17, lines +0.10, statements −0.22.**

**CORRECTED 2026-09-24 — the paragraph that stood here was false, and the reject caught it.** It
attributed the statement delta "entirely" to `path.ts` and `mutate.ts` fallback arms over Zod's untyped
`def`. That characterisation is accurate for the uncovered **branches** and wrong for the
**statements**, which it was written about: read out of `coverage/coverage-final.json`, most of the
uncovered statements in the new modules are in `edit.ts`. Writing it from the summary table's per-file
*percentages* rather than from the statement map is the claims-about-file-state class this release has
rejected on repeatedly. The measurement below is read from the file, by counting `s` entries with a
zero hit count in `coverage/coverage-final.json`:

```
47 uncovered statements of 3135 across src/, of which, in this task's modules:
   7  src/dna/edit.ts      2  src/dna/mutate.ts     1  src/dna/path.ts
   1  src/dna/schema.ts    1  src/cli/program.ts
```

So `edit.ts` is the **largest single contributor**, at 7 of the 11 uncovered statements in the modules
this task adds, and all seven are `return undefined` **decline guards** — `valueAtPath`'s two shape
checks, `renderItems` returning nothing for an unrenderable item, `locate` landing on something that is
not a mapping key (twice), and `rewriteFlow`'s non-array check. They are the module's refusal contract,
one line each, reachable only from a caller that hands the editor an edit its own resolver would never
produce. The `??`/`?:`-over-Zod arms in `path.ts`/`mutate.ts` are real, and they are **3** statements
rather than the whole delta.

The **re-parse `catch`** was in that list at submission — the last line of the safety contract these
notes ask a reviewer to trust — and is now covered: `test/dna/edit.test.ts` "declines when its own
candidate does not parse" drives the one route that reaches it. A key inserted under a parent that
already holds a scalar produces `a: 1` followed by an indented `b: x`, which is not a YAML document at
all; the test asserts both that the candidate is unparseable and that the editor declines rather than
writing it.

### review-ready summary

**What landed.** `dl-081`'s ratified option (E), whole: `dna add|remove|update --field <full path>
--value <v>`, over one schema-driven, non-creating traversal shared with `dna set`. The pillar went
from **7 of ~38 schema fields writable** to every field of every collection reachable for create,
update and delete. Both bugs close under it — `bug-084` first, as its precondition (an unresolvable
path is refused at exit `1`, never created; `dna set tech_stack.cli.framework Commander` no longer
commits), then `bug-083` (a role, a member, a module, a technology, a path entry, and one member's
roles are all writable by a command).

**The split permission was not used, and the measurement behind that.** The grammar had to reach every
collection or none (`dl-081` action 2), and that part is fixed cost — one resolver, one mutator, three
functions. The one separable seam was the comment-preserving structural edit, and it fails **safe**:
its fallback (`dump()`) is already `dna set`'s shipped contract, so had it proven unaffordable the
surface would still have landed whole and correct with a filed bug for the comments. It did not prove
unaffordable: `src/dna/edit.ts` is 476 lines, 96.9 % statements / 95.1 % branches covered, and the
suite asserts that **this repository's own comment-rich `dna.yaml` survives six different mutations
with every comment line byte-identical**.

**Where a reviewer should look hardest.**

1. `src/dna/edit.ts` is the largest new surface and the one doing textual surgery on a user's file.
   Its defence is that every candidate is re-parsed and compared against the intended document in full
   before it is returned, so a mis-located edit costs the comments (the `dump()` fallback), never the
   content. The decline list is tested twelve ways.
2. The **uniqueness refinement** (AC4) is the one change here that can make a document that loads
   today stop loading. Non-breakage was measured, not assumed, for both populations AC4 names — this
   repository's `dna.yaml` and every registered `init` template — and both are pinned by tests over
   the real artefacts rather than copies.
3. `P2.1-dna-set.feature`'s first two scenarios contradict AC1 and are **reported, not edited** (see
   the section above). That is the one place where this task's acceptance criteria and an existing
   acceptance contract disagree, and the approver should settle it.
4. The `task-092` hand-off is carried: all four DNA write verbs take `requireUnmodifiedTarget` and
   `committedScopeError`, under the plain "refuse a dirty target" rule, argued against both of that
   task's exceptions rather than assumed.

### second pass — the reject (`ab5e752d`), and what it changed

Rejected `in-review → in-progress` on 2026-09-23 for two narrow things, with the substance explicitly
settled and not reworked: `bug-084`'s repair, the uniqueness refinement, the comment-preserving
editor, the `task-092` hand-off, the three spec Revision notes, and the decision not to split all
stand as approved. Nothing below touches any of them.

#### 1. The derived `--version` option was shadowed, and the surface silently did nothing

**Reproduced first, on a real project, before any fix** — `npx tsc -p tsconfig.build.json`, then a
throwaway `git init` + `wingfoil init --template Scrum`:

```
$ node dist/cli.js dna add --field stacks.technologies --value Zod --category validation --version "4.0"
0.1.0
exit=0
$ # .wingfoil/dna.yaml:  technologies: []      — nothing written, nothing committed
$ node dist/cli.js dna add --field stacks.technologies --value Zod --category validation
{ "key": "stacks.technologies", "value": "Zod" }   → technologies: [{name: Zod, category: validation}]
```

`TechEntry` declares `version`, `dnaEntryOptionNames()` derives the option set from the schema, so
`--version <value>` was registered on `dna add`/`dna update` and Commander's program-level `-V,
--version` won. `--help` advertised it as a working option throughout. This is the class `bug-084`
files — a silent success in the pillar every other pillar reads — delivered inside the surface that
closes it.

**It is not a `version` problem, and the measurement says so.** Driving a synthetic Commander tree
with one subcommand option per global flag (`node`, a 10-line script, deleted after) gives three
outcomes, two of them silent:

| invocation | outcome |
|---|---|
| `--version 4.0` | the program's own action fires: prints the version, exits `0`, the value is lost |
| `--format json` | **swallowed** by the program-level option — never appears in the subcommand's parsed options |
| `--verbose x` | **swallowed**, same way |
| `--color blue` | survives (the program's is a negated boolean; the subcommand's value option wins) |
| `--notes n` | survives (no global of that name) |

So the failure mode is "the value vanishes", and every present and future global flag
(`spec-008` §2 is amendable) is a live collision for every present and future entry field.

**Fix: namespace, not refusal — argued rather than assumed.** Every schema-derived entry option is
registered as `--entry-<field>`, spelled with the schema's own field name. The reject offered refusing
to register a shadowing name as the alternative; it is the wrong half of the trade:

- `version` is a field `spec-002` **declares** on `TechEntry`. Refusing it would make a
  schema-declared field permanently unwritable, in a surface `dl-081` ratified as reaching every
  collection — a loud hole in place of a silent one.
- Refusal is unstable in the wrong direction: the global set can grow, and a new global flag would
  then retroactively disable an entry field that had been writable, with no code change nearby.
- A **conditional** prefix (only the colliding names) would be worse than either: an option's spelling
  would depend on a table declared elsewhere, so adding a global flag later would silently *rename* an
  existing option. The prefix is uniform, which makes the two namespaces disjoint **by construction**
  and the spelling predictable from the schema alone.

Two defects of the same class, found while fixing it and fixed with it:

- **`buildOptionValues` read Commander's options by the declared name.** That works only while every
  name is a single word: Commander camel-cases across `-`, so `--entry-version` is stored as
  `entryVersion` and the declared-name lookup would have returned `undefined` and dropped the value —
  the same silent-drop one layer further in, introduced by the fix itself. It now resolves Commander's
  key (`commanderKey`, `src/cli/program.ts`).
- **`dnaMutationRequest` accepted a bare field name as well as a namespaced one.** It no longer does:
  anything that is not `--field`, `--value` or `--entry-<field>` is a `UsageError` at exit `2` naming
  the namespace. Accepting both would have left the core layer speaking a vocabulary the CLI cannot
  produce — which is precisely how a green test at that layer coexisted with a command line that did
  nothing. The MCP surface, whose Tool arguments are arbitrary JSON, is the caller that can actually
  reach the refusal, and it gets a named one.

#### 2. The test that could not have caught it, repaired at the layer where it can

`test/cli/derived-option-namespace.test.ts`, two halves:

- **The invariant** (in-process, real `buildProgram` over the real `CORE_MODULES`): no option of any
  derived command may share a long name with a global flag. **Both sides are read off the built
  program** — the globals from `program.options` plus `--version`/`--help`, which Commander registers
  outside that list and which are exactly the two that take an action and exit — so a new global flag
  or a new schema field is checked against what is actually registered, never against a hand-copied
  transcription of `spec-008` §2 that can go stale.
- **The drive** (out-of-process, the compiled `dist/cli.js`): every entry-field option the registry
  declares, passed on a real command line, asserted on **what reached `dna.yaml`** rather than on the
  exit code — the defect exited `0`. A completeness check compares the driven set against the
  registry's declared set, so a field added to `spec-002` cannot slip in undriven, and the `--help`
  case asserts that the advertised names are exactly the ones that work.

**Verified to fail on the unfixed build**, which is the only way to know a regression test regresses:
`git checkout -- src/`, rebuild, run → 11 of 11 fail, and the invariant names the defect precisely —
`Array ["add --version", "update --version"]`. Restored, rebuilt, 11 of 11 pass.

The CoreFn-layer pins were re-pointed to the namespaced spelling at the same time, so that layer now
speaks the CLI's vocabulary rather than a superset of it.

#### 3. The coverage attribution

Corrected in place, above, from the statement map rather than the summary table — see
*CORRECTED 2026-09-24*. The re-parse `catch` it named is now covered by a test.

#### Gate record — second pass (all six re-run at `HEAD`, plus the emitting build)

| Gate | Command | Result |
|---|---|---|
| tests | `npx jest` | **128 suites / 2103 tests passed** |
| coverage | `npx jest --coverage` | `98.50 stmts · 93.65 branch · 98.89 funcs · 99.38 lines` |
| build typecheck | `npx tsc -p tsconfig.build.json --noEmit` | exit `0` |
| **emitting build** | `npx tsc -p tsconfig.build.json` | exit `0` |
| full typecheck | `npx tsc --noEmit -p tsconfig.json` | exit `0` |
| lint | `npm run lint` | exit `0` |
| API docs | `npm run docs:api` | exit `0` |

Baseline for the coverage comparison, `main` at `c2102c87`, measured the same way in the same session:
`98.71 / 93.52 / 98.90 / 99.24` (122 suites / 1909 tests). Branch **+0.13**, lines **+0.14**,
statements **−0.21**, functions **−0.01**.

**The full typecheck earned its place in this list.** Its first run on the second pass **failed** —
`TS2352` on the new test file's cast of a Commander `Command` — while `npx jest` on the same tree was
green, because `test/**` is not type-checked by jest (`isolatedModules`). The cast is gone: the walk
is typed as `Awaited<ReturnType<typeof buildProgram>>`, which is Commander's own `Command`, so the
traversal is checked against the real shape instead of an assertion about it. Re-run: exit `0`.

#### Merge

`git merge main` at `c2102c87`, clean — it carried only `bug-089`, `bug-090` and `bug-091`, the three
governance findings this task reported and the approver filed as their own elements. All three are
left alone, as instructed: `bug-089` (the two `P2.1-dna-set` scenarios), `bug-090` (`dna set`'s
grammar differing across three artefacts), `bug-091` (an entry name containing a dot).

### review-ready summary — second pass

The ratified surface is unchanged and still whole; what changed is that it now works from a command
line as well as from a `CoreFn` call. The defect the reject caught was mine in the sharpest possible
place — the failure mode this task exists to eliminate, inside the code that eliminates it — and the
repair is the general one: the derived and declared option namespaces are disjoint by construction,
and the invariant that keeps them so is asserted against the built program rather than against a
description of it.

**Where a reviewer should look, in order.**

1. `test/cli/derived-option-namespace.test.ts` — the answer to "why did no test catch it". Worth
   reading before the fix itself, because it is the part that has to hold for the next schema field.
2. `DNA_ENTRY_OPTION_PREFIX`'s doc comment (`src/core/index.ts`) — the argument for namespacing over
   refusal, and the measured table of what each global flag does to a colliding subcommand option.
3. `commanderKey` (`src/cli/program.ts`) — the one-line seam that would have re-introduced the same
   silent drop, and the reason the first half of the fix was not sufficient on its own.
4. The corrected coverage paragraph — what it says now is read from `coverage-final.json`'s statement
   map, and the command that reads it is in the notes.

### spec-008 §9 corrected to the shipped spelling (2026-09-24, after submit)

I flagged this in the second-pass report as a question for the approver rather than fixing it, and
that was the wrong call in both directions at once: it left a spec sentence I knew to be false
standing while the task sat in review, and it asked someone else to rule on something inside my own
task. The approver's answer, which is the right reading: AC8 being "settled by the reject" means **do
not re-open the amendments' scope** — not that an amendment may describe something untrue. Fixing a
sentence this pass made stale is finishing the pass, not widening it.

**What was wrong.** §9's worked examples and its `--<field>` option row documented the bare spelling
(`--email`, `--roles`, `--version`), which is what the first pass implemented and what §9 correctly
recorded *at the time*. The second pass changed the shipped grammar to `--entry-<field>`, so §9 became
a spec describing a grammar the tool does not have — and confidently, with worked examples a reader
would copy. `dna add --field team.members --value roberto --email r@example.it`, exactly as §9 printed
it, now answers `error: unknown option '--email'` at exit `1`.

**What it is not.** This is *new* drift, introduced by this pass, and distinct from
`bug-090-dna-set-grammar-differs-across-three-artefacts`, which owns a **pre-existing** divergence:
`X_cli-cmds.md` (approved v1.2) has specified `dna set [--field FIELD] [--value VALUE]` since before
this task existed, against a positional implementation that never matched it. `bug-090` is left
untouched, as are `bug-089` and `bug-091`.

**The correction**, as a dated in-place Revision note under `dl-047` alongside the 2026-09-23 one:
§9's seven worked examples and the option row now carry `--entry-<field>`, the row states that the
prefix is required and that an unprefixed spelling is an unknown option at exit `1` rather than a
silent no-op, and the note gives the reason as the **namespace** rather than the collision — a derived
option set and a declared flag set that nothing kept disjoint, of which `TechEntry`'s `version` was
merely the first instance. Only the spelling of the per-entry options changed; `--field`, `--value`,
entry addressing by name and the refusal rules are exactly as ratified.

**The sibling specs were checked, and carry none of it.** `grep -n -- '--[a-z]'` over both:
`spec-002` matches twice (`dna update --field team.members.roberto.roles`, and `--field`/`<key>` in
the *Unknown keys* section), `spec-006` four times (`--next` on `agentExecute`, `--directive`/`--role`
on `directiveAssign`, and `dna add|remove|update --field <full path> --value <v>`). Every one is
`--field`/`--value` or another command's grammar; **neither spec mentions a per-entry option at all**,
so neither needed correcting. `spec-008` §9 was the only artefact carrying the stale spelling.

**Gates re-run after the correction** (a documentation-only change, so unchanged as expected, but run
rather than assumed): `npx jest` **128 suites / 2103 tests passed**; `npx jest --coverage`
`98.50 stmts · 93.65 branch · 98.89 funcs · 99.38 lines`; `npx tsc -p tsconfig.build.json --noEmit`,
the **emitting** `npx tsc -p tsconfig.build.json`, `npx tsc --noEmit -p tsconfig.json`,
`npm run lint` and `npm run docs:api` all exit `0`. Identical to the second-pass run at `437e939a`,
which is the expected result for a change that touches only Markdown — and the reason to run them is
that "expected" is not "observed". The task stays `in-review`; this is a correction commit, not a
resubmission.

### third pass — the reject (`3570de87`), one defect and one ruling

The reject separates the two halves itself, and they are kept separate here. Nothing the second
reject declared settled is reopened: `bug-084`'s repair, the uniqueness refinement, the YAML editor,
the `task-092` hand-off, the `--entry-` namespace and the two same-class defects found inside it all
stand exactly as reviewed.

#### 1. The defect — `spec-008` §9 claimed something false, pinned where it could not fail

§9's option row ended: *"An unprefixed spelling is an unknown option (exit `1`), never a silent
no-op."* Measured against the build that shipped it, in a throwaway `wingfoil init` repository:

```
$ wingfoil dna add --field stacks.technologies --value Go --version 1.22
0.1.0
                                                exit 0, nothing written, nothing committed
$ wingfoil dna add --field stacks.technologies --value Go --notes x
error: unknown option '--notes'                 exit 1
```

Both outcomes are correct *behaviour* — `spec-008` §1 gives a global precedence over a subcommand
option of the same name, and `spec-005` §1 gives `--version` exit `0` — and the sentence describes
only the second. It is the worse kind of wrong: the claim is false for `version`, which is the one
name §9 itself uses as a worked example, and nothing goes red when a spec sentence is false.

The test pinning it drove `--category`, a name for which the sentence *does* hold. That is verifying
a criterion where it cannot fail, which is the pattern the first reject named, so the repair is in two
parts.

**The clause** now states both outcomes and names the overlap. There is exactly one name in it today,
and that is derived rather than recalled:

```
$ node -e "const {dnaEntryOptionNames}=require('./dist/dna/path');\
  const g=new Set(['format','verbose','color','interactive','version','help']);\
  console.log(dnaEntryOptionNames().filter(f=>g.has(f)))"
[ 'version' ]
```

**The test** (`test/cli/derived-option-namespace.test.ts`) now *derives* that set from the built
program — `program.options`, plus `version`/`help`, which `program.version()` and Commander register
outside `.option()` and which are precisely the two that take an action and exit — and drives both
cases through the compiled CLI:

- a name no global declares (`--category`) → exit `1`, `unknown option '--category'`, nothing written;
- a name a global declares (`--version`) → exit `0`, the CLI version on stdout, `dna.yaml` byte-identical
  before and after, asserted by reading the file rather than by trusting the exit code;
- the same field under `--entry-version` → written, which is what makes the prefix the fix rather than
  a rename.

There is also an `expect(shadowed).toEqual(['version'])`, deliberately exact: if a future schema or
flag change empties that set, §9's second bullet has no example left and must be re-measured rather
than quietly kept.

**Classification (`dl-014`/T1).** *Characterization.* The behaviour is correct and pre-existing; what
was wrong was the sentence describing it. The falsification is recorded above — the previous claim,
run as written, produces `0.1.0` at exit `0` — and the new test pins what actually happens.

**Mutation check on the namespace suite** (the reviewer's own method, re-run after the rewrite):
`DNA_ENTRY_OPTION_PREFIX` set to `''`, `dist` rebuilt → **11 of 13 red**. The two that survive are the
shadowed-set derivation and the `--version`-is-swallowed drive, which is correct: both characterize
the *environment* the prefix exists to defeat, not the prefix, and neither would change if the prefix
were removed. Restored → 13/13 green.

#### 2. The spelling sweep, finished — including three the reject did not list

The five doc comments named in the reject are refreshed to the post-`dl-082` grammar
(`src/dna/path.ts` ×2, `src/core/index.ts`, `src/dna/mutate.ts` ×2), and the orphaned `--field`/
`--value` block in `src/core/index.ts` is reattached to the consts it documents — it now sits directly
above `DNA_VALUE_OPTION`/`DNA_SET_VALUE_OPTION`/`DNA_ENTRY_OPTIONS`, and the prefix's own comment
keeps its own.

Running the sweep properly turned up **runtime messages** carrying the same staleness, which is worse
than a comment because a user reads it:

```
$ wingfoil dna add --field stacks.technologies --value Go        # before
error: an entry of 'stacks.technologies' requires --category     # an option that does not exist
$ wingfoil dna add stacks.technologies --value Go                # after
error: an entry of 'stacks.technologies' requires --entry-category
```

Five message sites in `src/dna/mutate.ts` printed bare `--<field>` names (the missing-required list,
the not-a-field-of-this-collection list, and the two "carries no change" lists). They were correct
before the second pass and were made false by it — my own staleness, so mine to fix.

Fixing them needed the prefix inside the pillar, and `src/dna` may not import `src/core`
(`spec-006` §1: the pillar is a leaf). `DNA_ENTRY_OPTION_PREFIX`, `dnaEntryOptionName` and
`dnaEntryFieldOfOption` therefore **moved to `src/dna/path.ts`**, which already owns the derivation
they belong to, and `src/core/index.ts` re-exports all three, so its public surface is unchanged.
Duplicating the literal in `mutate.ts` was the alternative and was declined: it would falsify
`dnaEntryOptionName`'s own comment ("the single place the prefix is applied"), which is the invariant
that makes the namespace trustworthy.

`test/dna/mutate.test.ts` gained three assertions that read the option names from
`dnaEntryOptionName` rather than spelling them, plus a negative lookbehind so a bare `--path` /
`--category` cannot creep back. One of them is how the staleness surfaced: the existing test matched
`/--path|--description/`, which `--entry-path` does not satisfy — a loose regex that had been
passing on a message it no longer described.

**Classification.** *Red-first* for the three message assertions (they fail against the pre-fix tree,
naming the bare spelling), *characterization* for the comment refresh.

#### 3. The ruling — `dl-082-cli-parameter-shape`, and only where the path lives

`dl-082` became `ready` on 2026-09-24 and states a rule no document had written down although nine of
the eleven `dna`/`memory` commands already followed it: **a parameter is positional when it identifies
the target of the command, and an option when it names an attribute of the action.** The path is the
target. The shipped grammar is now:

```
wingfoil dna set    <path> --value <v>
wingfoil dna add    <path> --value <v> [--entry-<field> <v> ...]
wingfoil dna remove <path> --value <v>
wingfoil dna update <path> --value <v>
```

Everything `dl-081` ratified about *semantics* is untouched, and deliberately so: entries addressed by
name and never by index, a path that does not resolve refused rather than created, uniqueness as a
prerequisite, `--value` meaning identity at a collection and new value at a leaf, and the
`--entry-<field>` namespace, which solves a different problem `dl-082` does not touch.

**Implementation.** `DNA_FIELD_OPTION` is gone; the three verbs and `dna set` all read
`positionals[0]` through one shared `dnaPathPositional`. No new CLI seam was needed — `program.ts` has
registered a variadic `[positionals...]` on every command since `task-025`, so the path arrives the
same way `dna show`'s section and `memory approve`'s id always have. `dnaSet` now declares its own
`--value` (`DNA_SET_VALUE_OPTION`, `required: true`) with a narrower `--help` line than the other
three: it is the scalar verb, so `--value` there carries only the second of the two meanings and
advertising the first would describe a case it refuses.

**The breaking change is made loud rather than silent.** `dna set <key> <value>` has shipped since
`task-025`. Dropping the second word quietly would make `dna set project.license MIT` refuse for a
reason naming neither the extra word nor the new grammar, so an extra positional is its own usage
error on all four verbs:

```
$ wingfoil dna set project.license MIT
error: wingfoil dna set takes one positional <path>; the value travels in --value (got 2 positionals)
                                                exit 2, nothing written
```

**The order of the three checks in `dnaPathPositional` is a contract, not an accident.** Malformed is
tested before extra-positional, because `P2.1-dna-set.feature`'s third scenario runs
`wingfoil dna set ..language python` — two positionals *and* a malformed path — and pins
`invalid key path: '..language'` at exit `2`. Measured after the change: unchanged, verbatim. A test
pins the ordering, and a mutation check confirms it is not vacuous — swapping the two checks turns
**exactly one** test red out of 2114, and it is that one.

**Classification.** *Red-first* throughout (a positional grammar that did not exist, a migration error
that did not exist), except the `..language` ordering test, which is *characterization* of a message
`P2.1` has pinned since `task-025` and which this pass had to work to preserve.

#### What the P2.1 BDD scenarios do after this change

Reported, not fixed: `bug-089` owns them and is sequenced after this, so they are rewritten once
(`dl-082`'s Actions 3–4). Measured on the compiled CLI:

| Scenario | Before this pass (branch at `c160072e`) | After |
|---|---|---|
| 1 — `dna set tech_stack.language python` | exit `1`, `unknown DNA field 'tech_stack.language': 'tech_stack' is not declared under the dna.yaml schema` | exit `2`, `wingfoil dna set takes one positional <path>; the value travels in --value (got 2 positionals)` |
| 2 — `dna set tech_stack.language go` | same as 1 | same as 1 |
| 3 — `dna set ..language python` → exit `2`, `invalid key path: '..language'` | **passes** | **passes, byte-identical** |

Scenarios 1 and 2 do not acquire a *second* reason to be stale — the reason **moves**. The argv is now
refused before the path is ever resolved, and under the new spelling the old refusal is still exactly
what they would get: `wingfoil dna set tech_stack.language --value python` → exit `1`, the same
unknown-DNA-field message. So `bug-089` still has one thing to rewrite per scenario, now in two
places at once: the spelling (`dl-082`) and the assertion (`bug-084`'s ratified refusal). Scenario 3
is untouched on purpose and now has a unit test defending it.

This repository has no automated BDD runner — `.feature` files are prose contracts hand-mapped into
Jest suites (`bug-089`'s own Actual Behavior section says so) — so nothing goes red either way. That
is why it is reported here in a table rather than left to be discovered.

#### Specs amended (dated in-place Revision notes, `dl-047` route)

- **`spec-008`** — §9 rewritten to the positional grammar and retitled (`<path>` / `--value`); the
  false clause replaced by the two-outcome statement above; §1's noun note respelled. The Revision
  note records the ruling and the defect as two separate things, because they are.
- **`spec-002`** — no schema change at all. The three invocations quoted in prose are respelled so a
  reader copying one gets a command that runs.
- **`spec-006`** — §3's table is untouched and could not be otherwise: its cells carry function names,
  `mutates`, a CLI command and an MCP Tool name, none of which `dl-082` moves; the MCP surface has no
  positional/option distinction at all. What is corrected is the 2026-09-23 note's *prose*, which
  quoted both old grammars.

`docs/01_vision/X_cli-cmds.md` is **not** touched: `dl-082` Action 3 puts it with `bug-090`, and
`bug-090` is out of scope here.

#### Also respelled, outside the reject's list — because this pass made them false

- **`README.md`** ×3 (the command table, the worked example, the sentence under it). Owned by the
  `user-docs` gate (`dl-013`), which owns the `CHANGELOG.md` entry `dl-082` requires; a factual
  correction to a command I broke is not the same thing as that gate's work, and leaving three false
  lines in the user-facing entry point is the exact pattern the last two rejects named.
- **`scripts/e2e-smoke.cjs`** — the `dl-023` gate drives `dna set` for real. Left unfixed it would
  have gone red at release, which is late.
- **`.wingfoil/workflows/custom/e2e-smoke.yaml`** — the `drive-cli` action string, `version`
  bumped `1.0 → 1.1` with the reason inline, per the doc-versioning directive and the file's own
  convention.
- **`test/cli/fixtures/cli-harness.cjs`**, **`src/cli/registrar.ts`**, **`src/core/registry.ts`** —
  the three comments describing the `positionals` seam, which was introduced *because* `dna set` took
  two data inputs. It no longer does: every command reads at most one positional, so the seam is now
  uniform rather than shaped by one verb, and it stays variadic precisely so an operation can refuse
  an extra positional with its own message.
- Two `dna set <key> <value>` invocations inside `src/dna/mutate.ts` / `src/dna/path.ts` doc comments,
  and `spec-008` §5's `..language` example. `src/dna/path.ts`'s account of what the *old* traversal
  did is left in the old spelling and marked as such — it quotes an invocation as it was typed at the
  time, and respelling a historical measurement would make it a different claim.

Deliberately **not** respelled: the `docs/05_plans/` phase plans and the earlier tasks' Execution
Notes under `docs/04_memory/`. Those are records of what was run on the day; editing them would
falsify a log.

#### `dl-083`'s seam, left rather than built

`dl-083-dotted-entry-names-in-paths` is `ready` and is explicitly a separate task, sequenced after
this one because it touches `src/dna/path.ts`. Nothing was built for it, and no unused abstraction was
added. What a reviewer should know is **where** it lands, so the estimate is not guessed:

- `isValidKeyPath` (`src/dna/set.ts`) — `keyPath.split('.').every(...)`, the well-formedness predicate;
- `resolveDnaPath` (`src/dna/path.ts`) — `keyPath.split('.')`, the resolution traversal;
- `setDnaValueInText`'s resolver (`src/dna/set.ts`) — the third `split('.')`, on the text path.

Three call sites, the same one-line split. The cheap shape is a `splitDnaPath(keyPath)` in
`src/dna/set.ts` returning segments or a refusal, with all three calling it; the unterminated-quote
exit `2` `dl-083` requires then has one place to live. That is a description, not a seam: adding the
function now with one caller would be dead code, and `dl-083` Action 1 is the task that should write
it together with its tests.

#### Gates — re-run for this pass, not carried over

All seven, on the final tree:

| Gate | Result |
|---|---|
| `npx jest` | **128 suites / 2114 tests passed** |
| `npx jest --coverage` | `98.50 stmts · 93.65 branch · 98.89 funcs · 99.38 lines` — all well over the 80% floor, and non-regressing |
| `npx tsc -p tsconfig.build.json --noEmit` | exit `0` |
| `npx tsc -p tsconfig.build.json` (**emitting**) | exit `0` |
| `npx tsc --noEmit -p tsconfig.json` (full, tests included) | exit `0` |
| `npm run lint` | exit `0` |
| `npm run docs:api` | exit `0` |

**One anomalous run, explained rather than re-rolled.** A `npx jest` I had left in the background
reported `3 suites / 48 tests failed` while a second `npx jest` was running in the **same worktree**.
Three runs before it and a deliberately sole run after it — `pgrep -fa jest` first, to establish
there was no second one — all report `128 suites / 2114 tests passed`. The cause is in
`test/global-setup.cjs`, which does `rmSync(dist)` + `tsc` at the start of every run: that is
`bug-003-cli-integration-dist-race`'s fix, and it removes the race **between the suites of one run**,
not **between two concurrent runs of one worktree**, where one deletes `dist/` while the other's
workers are spawning `node dist/cli.js`. Not a product defect and not introduced here, but a real
operator hazard with no guard, reported under "found, not fixed" below.

Test count `2103 → 2114`, and the +11 reconciles rather than being asserted:
`test/cli/derived-option-namespace.test.ts` **11 → 13** (the two new unprefixed-spelling drives;
7 → 9 `it`/`it.each` blocks, one of which expands over the 5-row `DRIVES` table in both versions),
`test/dna/mutate.test.ts` **48 → 50** (the three option-spelling assertions replacing one loose
regex), `test/core/dna-mutation-surface.test.ts` **+6** (the AC2 row now covers `dnaSet` too, plus
four migration cases and the ordering case), and `test/cli/program.integration.test.ts` **+1** (the
old spelling driven through the real command line). Coverage is unchanged to the digit from the
second pass, which is the expected result: no production branch was added, only moved.

#### Found, not fixed

- **The task's own `title` still reads `dna add|remove|update --field <full path> --value <v>`.** It
  records the shape as ratified when the task was filed, and `dl-082` amended that shape mid-flight.
  Left alone deliberately: rewriting a Memory element's title is an identity-level edit, and this
  pass has no mandate for one. The Execution Notes and the three amended specs carry the shipped
  grammar. The approver may want it corrected on approve.
- **Two concurrent `npx jest` runs in one worktree corrupt each other's `dist/`** (measured above).
  `test/global-setup.cjs`'s `rmSync` + rebuild has no lock and no per-run output directory, so the
  second run's `globalSetup` deletes the first run's `dist/` under its workers. The failure looks
  exactly like a real regression and disappears on re-run, which is the worst combination. Not this
  task's scope — it predates it and touches the test harness for every suite — and worth its own
  element.
- **`docs/03_backlog/04_backlog/backlog.json` and `by-release/v0.1.json`** carry `P2.1`'s scenario
  text verbatim, including `wingfoil dna set tech_stack.language python`. Left untouched: that JSON
  is an output of the specification phase and quotes the `.feature` file, so it follows `bug-089`'s
  rewrite rather than leading it.
- **`docs/01_vision/X_cli-cmds.md`** still specifies `dna set [--field FIELD] [--value VALUE]` with
  the retired `tech-stack.backend` example. That is `bug-090`'s scope by `dl-082` Action 3, and
  `bug-090` is `triaged`.
- **`dna set` and `dna update` are now indistinguishable in spelling as well as in effect** — the
  consequence `dl-082` E4 predicted and explicitly did not settle. `bug-092-dna-set-and-dna-update-are-indistinguishable`
  already owns it; nothing was decided here.

#### review-ready summary — third pass

Two things changed and they are unrelated to each other. The **grammar** moved where the path lives,
on a ruling that arrived after the work; the **spec clause** was corrected because it said something
that is not true, and its test was moved off the case where it could not fail. The second is the one
worth reading first — it is the third instance of the same class, and the only defence that has held
so far is the one applied again here: run the command that settles the claim, and put the command in
the note.

**Where a reviewer should look, in order.**

1. `spec-008` §9's two-outcome paragraph, and the three tests under
   `test/cli/derived-option-namespace.test.ts`'s new `describe` — the claim, and the drive that would
   catch it being wrong again.
2. `dnaPathPositional` (`src/core/index.ts`) — three checks whose **order** is the contract, and the
   one-test mutation result that proves it.
3. The P2.1 table above — the only place the breaking change is visible as a behaviour a contract
   already pins, and the hand-off `bug-089` needs.
4. `src/dna/mutate.ts`'s refusal messages, and why the prefix helpers moved into the pillar.

**Correction (2026-10-06, `task-184`, `bug-096`).** Two sentences above (the invariant's description
in the second-pass notes, and the third-pass paragraph on the derived overlap) say `--version` is
registered outside `program.options`. Measured, it is not: `program.version()` puts `--version` in
`program.options`, and only `--help` is absent. `test/cli/derived-option-namespace.test.ts` now
asserts both facts and adds only `--help` by hand, so commenting out `program.version()` in
`src/cli/program.ts` fails the invariant test, which it did not before. Recorded here rather than by
rewriting the notes, which stay the record of what was believed at the time.
