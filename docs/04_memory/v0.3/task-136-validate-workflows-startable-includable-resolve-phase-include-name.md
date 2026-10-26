---
id: "task-136-validate-workflows-startable-includable-resolve-phase-include-name"
type: task
title: "Validate workflows as startable/includable, resolve phase `include` by name, and emit one ordered diagnostics array"
status: done
release: "v0.3"
kind: "feature"
priority: "high"
tags: ["v0.3", "workflow", "schema", "loader"]
ref: "dl-109"
bug: ["bug-144", "bug-145"]
depends_on: []
tmpl_version: 260703
wave: "w1"
---

## Description

The loader today requires `kind: main|sub` and never resolves a phase's `include`, so the Kanban scaffold's include-by-path passes (`bug-144`) and `workflow list` echoes an unresolvable value (`bug-145`). This task replaces the Layer-1/Layer-2 structural rules with the revised `spec-003`: the `startable`/`includable` booleans with `kind` as alias, the name class for workflows and phases (`adhoc` reserved), phase `include` as a workflow name that must resolve to an includable workflow, element compatibility, include cycles, `fallback.step` existence, and the diagnostics model `{ code, severity, file, path, message }` in `spec-003`'s deterministic order. It fixes the Kanban template in `src/storage/templates.ts` in the same change.

## Acceptance Criteria

- (red-first) Each loader row of `spec-003` § Diagnostics owned here fires on a minimal fixture with its code, severity, `file`, `path` and message: `E_WORKFLOW_INVALID_KIND` (message `invalid workflow kind 'hybrid' (allowed: main, sub)`, BDD P4.1 sc. 3), `E_WORKFLOW_NAME_INVALID`, `E_WORKFLOW_DUPLICATE_NAME`, `E_WORKFLOW_KIND_CONFLICT`, `E_WORKFLOW_NEITHER_STARTABLE_NOR_INCLUDABLE`, `E_NO_MAIN_WORKFLOW` (now "no startable workflow"), `E_PHASE_NAME_INVALID`, `E_PHASE_NAME_RESERVED`, `E_PHASE_DUPLICATE_NAME`, `E_WORKFLOW_INCLUDE_UNRESOLVED` (a path-shaped value included), `E_WORKFLOW_NOT_INCLUDABLE`, `E_WORKFLOW_ELEMENT_MISMATCH`, `E_WORKFLOW_INCLUDE_CYCLE` (message `include cycle: <w1> -> … -> <w1>`), `E_PHASE_FALLBACK_STEP_UNKNOWN` (message `fallback step '<step>' not found in workflow`, BDD P4.15 sc. 3 as amended by spec-017 Consequences).
- (red-first) `kind: main` loads as startable-only and `kind: sub` as includable-only; a workflow declaring only `includable: true` is not startable (BDD P4.1 sc. 1–2).
- (red-first) An absent `.wingfoil/workflows.yaml` loads as an empty registry with no diagnostic (spec-003 Layer 1; BDD P4.6 sc. 4 groundwork).
- (red-first) Diagnostics come out in `spec-003`'s order (manifest, then files in `include` order, workflow-level before phase-level, table order per field); a test loads a fixture with several errors twice and asserts byte-identical arrays (REQ-SYS-07). The first error is the `VALIDATION` reason (exit 1) and every diagnostic is in `details`.
- (red-first) `wingfoil init --template Kanban` writes `include: kanban-delivery` and the scaffold loads with zero errors (`bug-144`); a test asserts every built-in template (default, Scrum, Kanban) loads with zero errors under the new loader (P4.17 integrity unchanged).
- (characterization) Every file under this repository's `.wingfoil/workflows/custom/` loads with no error from this task's rules (spec-003 § Names measured none).
- (characterization) `docs/01_vision/06_features.md` P4.2 and P4.6 descriptions speak of startable/includable workflows (`dl-109` Action 3), with a `doc-versioning` bump.

## Implementation Notes

- **Size:** M · **wave:** 1 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-109 K1 (a), K3; spec-003 Layer 1 (absent manifest, startable rule), Layer 2 top-level fields, § Names, § Diagnostics (shape, order, "runs in").
- **Features:** P4.1, P4.16.
- **Notes:** Proposal key: A01. files `src/workflow/schema.ts`, `src/core/loaders.ts` (semantic checks), `src/validation/` if the diagnostics type lives there, `src/storage/templates.ts`. The `workflow list` payload keeps its shape here; task-204 reshapes it.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

Branch `task/task-136-validate-workflows-startable-includable-resolve-phase-include-name`, worktree
`../.wf2-wt/task-136`, cut from `main` at `c43221c4`. Start `cc0ca67d`; `bug-144` `[planned →
in-progress]` `53f036bf`; `bug-145` `[planned → in-progress]` `96aeba91`.

### design (architect)

**`depends_on` read (dl-015).** `depends_on: []`: no upstream Execution Notes to read.

**Specs.** `spec-003-workflows-yaml-schema` and `spec-017-workflow-commands-and-state-deduction` are
`approved`, and `dl-109` is `ready` (`grep -m1 "^status"` over the three files). The loader rows of
spec-003 § "Diagnostics" fix every code, severity and message this task emits. Two messages are
pinned by BDD (P4.1 sc. 3; P4.15 sc. 3 as spec-017 Consequences amend it). The others are worded
here, lower-case and without a trailing period (spec-005 §3.1). The table does not say on which file
and path a cross-file diagnostic is reported, nor what happens when a file is missing or
structurally invalid. That is settled in a pending spec-003 amendment (below) rather than left to
the code.

**Design.**
- `Diagnostic` `{ code, severity, file, path, message }` and `DiagnosticsError` live in
  `src/validation/diagnostic.ts`. A `Diagnostic` is a `ValidationIssue` with a `severity`, so the
  error is a `ValidationError` (exit `1`, `EXIT_VALIDATION`) whose `message` is the first error's.
  `loadOrError` (`src/core/index.ts`) maps it to `VALIDATION` with `details: { diagnostics }`, the
  array name spec-003 uses.
- `src/workflow/schema.ts` stays structural: `kind` optional with BDD P4.1 sc. 3's message on the
  enum, `startable` / `includable` optional booleans, `workflowFacts()` for the `kind` alias, and
  the name class `WORKFLOW_NAME_RE` / `RESERVED_PHASE_NAMES`. The name class is a loader check, not
  a Zod regex, so a bad name has its own code and the rest of the file is still checked.
- The loader checks live in `src/core/workflow-diagnostics.ts`, called by `loadWorkflowsYaml`. This
  keeps `src/core/loaders.ts`'s diff small for `task-137` / `task-143`. The loader collects instead
  of throwing at the first failure. Order: the manifest's diagnostics (`E_WORKFLOW_FILE_NOT_FOUND`,
  then `E_NO_MAIN_WORKFLOW`), then each file in `include` order (structural, workflow-level,
  phase-level, rows in table order). *(Superseded at review, finding 5: YAML parse failures and
  manifest failures now join the array; see "review (independent)".)*
- Absent `workflows.yaml`: `{ manifest: null, workflows: [] }`. On success the payload keeps its
  `{ manifest, workflows }` shape. No warning row is owned here, so no `diagnostics` key is added to
  it; `task-204` reshapes the payload.

**AC classification (T1).**

| AC | Class | Why |
|---|---|---|
| 1 — each loader row fires with code/severity/file/path/message | **red-first** | none of the 14 codes is emitted today except `E_NO_MAIN_WORKFLOW` / `E_WORKFLOW_FILE_NOT_FOUND`, with another shape |
| 2 — `kind` alias, `includable: true` not startable | **red-first** | `kind` is required today and the booleans do not exist |
| 3 — absent manifest is an empty registry | **red-first** | today it is `ENOENT` → `NOT_FOUND` |
| 4 — deterministic order, byte-identical, first error as reason, all in `details` | **red-first** | no array exists |
| 5 — Kanban writes `include: kanban-delivery`; every template loads with zero errors | **red-first** for the content; the load tests are characterization on `main` (no include resolution) and fail once AC 1 lands without the template fix (see red) |
| 6 — this repository's workflows load with no error | characterization | spec-003 § Names measured none |
| 7 — `06_features.md` P4.2 / P4.6 | characterization (documentation) | — |

### red (developer)

`test/core/workflow-diagnostics.test.ts` (`2cce7084`).
`npx jest test/core/workflow-diagnostics.test.ts` → **28 failed, 5 passed, 33 total**. The 5 that
pass are the guard that legal element bindings are accepted, the three template-load tests and the
live-repository test (AC 5 load half, AC 6). Each of the 28 fails on its assertion
(`--json` per-test status), not on a compile error. The template-load half of AC 5 was shown red
after green: with the green code and `src/storage/templates.ts` reverted (`git checkout
src/storage/templates.ts`), `npx jest … -t template` → **4 failed**, each with `include
'workflows/custom/<slug>-delivery.yaml' names no loaded workflow (a phase include is a workflow
name, not a file path)`.

### green (developer)

`27514535` (`feat(workflow)`, bug-144, bug-145): `src/validation/diagnostic.ts`,
`src/core/workflow-diagnostics.ts`, `src/workflow/schema.ts`, `src/core/loaders.ts`,
`src/core/index.ts` (`loadOrError`), and `src/storage/templates.ts`. The template change is one
line in `templateScaffold`'s `sw-life-cycle` (`include: ${def.slug}-delivery`); it fixes Scrum
too, which had the same path include. Two existing tests read `manifest.include`, which is now
`manifest?.include` (`test/core/loaders.test.ts`, `test/core/service-memory-type.test.ts`).
`npx jest test/core/workflow-diagnostics.test.ts` → 33 passed.
`1b448bdc` (`docs(vision)`): `06_features.md` v1.5 → **v1.6**, date 2026-10-01 (first edit since
`2a7ee7e7` committed v1.5). The P4.2 and P4.6 rows and the "Context-aware `list`" bullet speak of
startable and includable workflows.

Changes in behaviour beyond the ACs:
- `E_WORKFLOW_FILE_NOT_FOUND` and `E_NO_MAIN_WORKFLOW` used to be thrown as
  `ValidationError.semantic`, whose internal `exitCode` is `2`. Only that internal field changed (it
  is now `1`). At the CLI and MCP surface nothing changed: `loadOrError` (`src/core/index.ts`) maps
  every `ValidationError` to `VALIDATION`, exit `1`, before and after this task. *(Corrected at
  review, finding 1.)*
- A missing manifest used to be `NOT_FOUND` (exit `1`); it is now an empty registry (exit `0`).

### refactor (developer)

`085720b0` adds the tests that coverage asked for: a three-workflow cycle, structural failures that
do not cascade, and `DiagnosticsError`'s reason (`test/validation/diagnostic.test.ts`).

| Command | Result |
|---|---|
| `npm test` (with the pending spec-003 amendment in the working tree) | exit 0; 168 suites / 2799 tests |
| `npx jest --coverage --coverageReporters=json-summary` | 98.73 / 94.75 / 94.23 / 99.51 (stmts / branches / funcs / lines). `main` `c43221c4`, the same command in a temporary detached worktree: 98.73 / 94.58 / 94.01 / 99.49. No regression. Per file, the only change on existing files is `src/validation/errors.ts` branches 4/5 → 5/5. New: `workflow-diagnostics.ts` 117/119 stmts, `diagnostic.ts` 9/9 |
| `npm run lint` | exit 0 |
| `npm run docs:api` | exit 0 |
| `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| `npx tsc -p tsconfig.build.json --noEmit` | exit 0 |
| `npm run build && node dist/cli.js workflow list --format json` on this repository | exit 0; 23 workflows, 85 phases (AC 6, same counts as spec-003's measurement) |
| scratch repo: `node dist/cli.js init --template Kanban`, then `workflow list --format json` | `include: kanban-delivery` at `sw-life-cycle.yaml:9`; exit 0. With the include rewritten to the old path: `error: include 'workflows/custom/kanban-delivery.yaml' names no loaded workflow (…)`, exit 1 |

During a full run, one perf test (`test/core/query-latency.test.ts`, REQ-PERF-02) failed under
parallel load. `npx jest test/core/query-latency.test.ts` run alone → 4 passed. The threshold was not
touched.

BDD: no test in `test/` runs the P4.1 / P4.15 feature files (`grep -rn "P4.1-workflow-config\|P4.15"
test/` → nothing). The behaviours of P4.1 sc. 1–3 and P4.15 sc. 3 (message) are covered by
`workflow-diagnostics.test.ts`. The P4.15 feature-file amendment (sc. 3 as a `workflow list`
failure) is `task-225`'s AC, so it is not edited here.

### review (reviewer, self)

- AC 1: all 14 codes, one `toEqual` on the whole diagnostic each (the element-mismatch variants and
  the cycle variants check code, path and message).
- AC 2: `kind: sub` only → `E_NO_MAIN_WORKFLOW`; including a `kind: main` → `E_WORKFLOW_NOT_INCLUDABLE`;
  `includable: true` only → `E_NO_MAIN_WORKFLOW`; both booleans → loads and is includable.
- AC 3: `toEqual({ manifest: null, workflows: [] })`, no throw.
- AC 4: an eight-diagnostic fixture over three files (one missing) in the expected order; two loads
  `JSON.stringify`-identical. `exitCode` 1, `message` is the first error. Through `workflowList`:
  `VALIDATION`, the same message, `details` `{ diagnostics }`.
- AC 5, 6, 7: as above.
- Determinism (directive): the checks iterate arrays and insertion-ordered `Map` / `Set` only. The
  cycle path is a breadth-first search with neighbours in phase order.
- `src/storage/templates.ts`: only the `sw-life-cycle` include line changes, away from `rolesYaml`
  (`task-133`).
- Same-class instance fixed: the Scrum scaffold had the same path include as Kanban.

### Pending amendments (approver)

- `spec-003-workflows-yaml-schema` (uncommitted in the worktree). Proposed `--reason`:
  "task-136 implemented the loader rows of § Diagnostics. Two line citations into
  src/core/loaders.ts stopped resolving and now name the files. A paragraph states where a
  cross-file diagnostic is reported, the guarantee for include cycles, which diagnostics are not
  decided while an included file is missing or structurally invalid, that a YAML parse failure joins
  the array, and that an error's reason is its code, path and file followed by its message. Every
  implementation then emits the same array and the same reason. No code, severity or diagnostic
  message changes."

### Decisions for the approver

1. Spec-003 says commands carry the array as `diagnostics`. `details` here is `{ diagnostics }`,
   not the `{ issues }` every other `VALIDATION` carries. `DiagnosticsError.issues` holds the same
   array for code that reads `issues`.
2. `E_WORKFLOW_FILE_NOT_FOUND` / `E_NO_MAIN_WORKFLOW`: only the internal `ValidationError.exitCode`
   changed (`2` → `1`). At the CLI and MCP surface this is a no-op: they exited `1` (`VALIDATION`)
   before and after. *(Corrected at review, finding 1.)*
3. *(Reversed at review, finding 5.)* A YAML parse failure, in a workflow file or in the manifest,
   is an `E_YAML_PARSE_ERROR` diagnostic in the array. A manifest that fails its structural pass is
   reported as its Zod issues (`E_VALIDATION` on `workflows.yaml`). spec-003 does not say that a
   manifest failure must be thrown outside the array (§ Layer 1 and § Diagnostics say nothing about
   it), so every failure now has the one `details` shape.
5. *(Review, finding 4.)* The reason is `<code> <path> (<file>): <message>` of the first error,
   which is the form a `ValidationError` reason always had. A BDD "the message is …" (P4.1 sc. 3,
   P4.15 sc. 3) therefore matches the diagnostic's `message` and is contained in the reason.
4. A structurally invalid file contributes its Zod issues as `E_VALIDATION` diagnostics, with paths
   in spec-003's `phases[3].include` form.

### review (independent)

Verdict: APPROVE WITH FIXES (coordinator, 2026-10-01). The task stays `in-review`; the fixes are on
the branch.

1. **Exit-code claim.** The notes said `E_WORKFLOW_FILE_NOT_FOUND` / `E_NO_MAIN_WORKFLOW` "used to
   be exit 2" and that YAML parse "still throws (exit 2)". At the CLI both were and are exit 1:
   `loadOrError` maps every `ValidationError` to `VALIDATION`. Restated in green and in decision 2.
2. **`06_features.md`, same class.** The P4.1 row, the MVP summary line "Workflow kinds (main/sub)"
   and the "Kinds" bullet still described every workflow as `kind: main` or `kind: sub`. The
   "Active context" bullet said "multiple main workflows". All four now speak of startable and
   includable workflows, with `kind` as an alias (`f5a25fca`). The file stays at v1.6, the version
   this task already bumped to.
3. **Cycle wording.** The pending spec-003 paragraph claimed every cycle is reported. The code
   (`src/core/workflow-diagnostics.ts`, the `cycle.every((member) => member >= i)` test) guarantees
   less. Kept the code and restated the guarantee in the amendment: a cycle is reported at an
   `include` of W when the shortest path back to W stays among W and later-listed workflows. Every
   cyclic set therefore gets at least one diagnostic, at its first-listed member, and further cycles
   inside it may surface only after a fix. Reporting every elementary cycle can be exponential in
   the number of workflows (Johnson's algorithm enumerates them all). One diagnostic per cyclic set
   is enough to make the load fail with the user pointed at the set. Pinned by `E_WORKFLOW_INCLUDE_CYCLE
   — every cyclic component is reported, at its first member` (fixture a→b→c→a plus c→d→b: one
   diagnostic at `a`; with c→a removed, `b -> c -> d -> b` at `b`). That test passed on first run
   (characterization of the existing behaviour, as the review asked for a pin, not a change).
4. **Regression: the reason lost its code and file.** On `main` the reason was the joined
   `ValidationError` text (`<code> <path> (<file>): <message>`). This task made it the bare message
   (`Invalid input: expected string, received undefined` names no file), and no renderer reads
   `details.diagnostics`. Red: `test/cli/workflow-list-diagnostics.integration.test.ts` (compiled
   `dist/cli.js`, console and `--format json`) plus the reason assertions in
   `workflow-diagnostics.test.ts` / `test/validation/diagnostic.test.ts`. 8 failed out of 44 in
   those three files (`214a1c85`). Fix (`d99167d5`): `formatDiagnostic` in
   `src/validation/diagnostic.ts`. `DiagnosticsError.message` is the first error in that form.
5. **YAML and manifest failures bypassed the array.** With a manifest [missing, m (bad fallback), p
   (bad YAML)], the load threw only `E_YAML_PARSE_ERROR` on p. Red: three tests in
   `workflow-diagnostics.test.ts`, "YAML and manifest failures join the one array" (`214a1c85`).
   Fix (`d99167d5`): `parseYamlOrDiagnostic` in `src/core/loaders.ts`. A workflow file that is not
   YAML is one `E_YAML_PARSE_ERROR` diagnostic at its place in the order. Its name is unknown, so
   `E_WORKFLOW_INCLUDE_UNRESOLVED` and `E_NO_MAIN_WORKFLOW` are not decided. A manifest parse or
   structural failure is the whole array. `node dist/cli.js workflow list` on a scratch repository
   with a bad `p.yaml`: `error: E_YAML_PARSE_ERROR (workflows/custom/p.yaml): unexpected end of the
   stream within a flow collection (3:1)` followed by the parser's snippet, exit 1.
6. **Noted, not fixed (follow-up for the coordinator to file).**
   - `src/core/builtin-integrity.ts` (`isValidWorkflowSource`) checks built-in workflow templates
     against the `Workflow` schema only. With `kind` now optional, a template that declares neither
     `kind` nor a boolean passes P4.17's integrity check and fails the loader
     (`E_WORKFLOW_NEITHER_STARTABLE_NOR_INCLUDABLE`). The built-in workflow list is empty today
     (`workflows/built-in/` holds only `.gitkeep`), so nothing fires yet.
   - A manifest that lists one file twice reports `E_WORKFLOW_DUPLICATE_NAME` on the second entry,
     naming the same file as the first declaration. Accepted as is.

Coverage follow-up (`ad7de779`, `c2b04812`): two commits close the lines the review fixes left uncovered. A
test now shows that the cycle search skips a structurally invalid file. Two branches that cannot be
reached are gone: `includeEdges` only ever sees valid workflows, and `parseYaml` throws only
`ValidationError.yamlParse`.

Gates after the review fixes, with the pending spec-003 amendment in the working tree:

| Command | Result |
|---|---|
| `npx jest --coverage` | exit 0; 169 suites / 2807 tests; 98.78 / 94.9 / 94.26 / 99.51 (`main` `c43221c4`: 98.73 / 94.58 / 94.01 / 99.49, no regression) |
| `npm run lint` | exit 0 |
| `npm run docs:api` | exit 0 |
| `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| `npx tsc -p tsconfig.build.json --noEmit` | exit 0 |

Merge note: `task-130`'s `errorDetails` reads `details.issues` only. The coordinator will have it
read `details.diagnostics` when it merges after this task. Whatever the merge order, the reason
alone now names the code, path and file.
