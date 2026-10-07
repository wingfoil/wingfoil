---
id: "task-198-deduce-workflow-instances-phase-evidence-frontier-memory-head"
type: task
title: "Deduce workflow instances, phase evidence and the frontier from Memory at `HEAD`"
status: in-review
release: "v0.3"
kind: "feature"
priority: "high"
tags: ["v0.3", "workflow", "deduction", "determinism"]
ref: "spec-017"
bug: []
depends_on: ["task-137-read-pillar-configuration-memory-documents-any-commit-not", "task-171-make-memory-scan-primitives-fail-closed-archived-elements", "task-175-declare-phase-evidence-produces-ownership-selections-awaits-collections", "task-194-check-workflows-against-memory-yaml-dna-yaml-state"]
tmpl_version: 260703
---

## Description

The heart of v0.3: one pure deduction over `HEAD` that every consumer (`next`, `status`, `list`, MCP, `agent execute --next`) calls. Open instances are `plan` elements (`workflow` field, `draft|active`, no `parent`), ordered by start commit; phases are evaluated sequentially from their declared evidence (state, produces, selection, include, record); the frontier is the list of leaf steps with keys `<workflow>.<phase>[@<type>:<id>]`. `iterate_over`, the linkage/re-entry parts of the history walk and optional/archived rules are task-202/task-203.

## Acceptance Criteria

- (red-first) Instances: a fixture repo with three `plan` files (one `done`, one `active` sub-plan with `parent`, two open mains) yields exactly the open mains, most recently started first by `git rev-list --topo-order`, the first `active: true` (spec-017 §3.2–§3.3); `<ref>` resolves a workflow name (most recent open instance) or an instance id, else `workflow is not open: <ref>`.
- (red-first) Evidence kinds `state`, `produces` (string entries resolved, `/`-suffixed patterns match a committed file below), `selection`, `include` (plain), `record` (a commit in the instance's walk carrying `WingFoil-Phase: <w>.<p> completed`, `WingFoil-Instance`, `WingFoil-Element`/`WingFoil-Item`) each complete a phase on a fixture, and an implicit-owner `produces` is shown but not evidence (§4.3). A checkpoint completes only by a record.
- (red-first) Tolerant reads: a Memory file with unparseable frontmatter, no `status`, or a status outside its machine is excluded and reported (`W_MEMORY_UNREADABLE`, `W_MEMORY_INVALID_STATE` with message `invalid state '<status>' for type '<type>' in <file>`, BDD P4.13 sc. 3); the deduction never throws on them.
- (red-first) `W_UNCOMMITTED_INPUTS` names the dirty paths under the Memory paths, `.wingfoil/workflows*`, `produces:` patterns and `paths.runs`, and the answer is still computed from `HEAD` (§1.2); a test proves the same result with and without the dirty file.
- (red-first) Determinism: two runs at one commit give byte-identical JSON; Memory is enumerated from `HEAD`'s tree in sorted path order; no `Date.now`/random in `src/workflow` or the deduction module (a grep-based test, the `determinism` directive).
- (red-first) BDD P4.13 sc. 1–2: task `in-progress` / release `releasing` are reported at the phase whose exit state they sit before, derived only from Memory (no `.wingfoil/state/`).
- (characterization) BDD P4.11 sc. 1–3 still hold (pinned by `test/memory/state-machine.test.ts:461` and the `memory add` suites since `task-036`); the deduction reuses `validateFrontmatterState` rather than re-implementing the membership rule.

## Implementation Notes

- **Size:** L · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** spec-017 §1 (baseline, W_UNCOMMITTED_INPUTS, determinism orders, tolerant reads), §3.1–§3.3, §3.4 "Declared" and "None", §3.5, §4.1–§4.5, §4.8 records, §4.9; adr-007; adr-008.
- **Features:** P4.13, P4.16, P4.11.
- **Notes:** Proposal key: A05. new `src/workflow/deduce*.ts` (pure, fed a HEAD snapshot) + a `src/core` reader for the snapshot and the git walk. Spec-017 §1.4's tolerant read is local to deduction; `bug-031` (search/by-id) stays with the Memory domain's task.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.
- **Handover from wave 3 B1 (2026-10-07, `task-194`).** Load through `loadWorkflowRegistryAtRev` / `loadWorkflowRegistryAtHead` and reuse `workflowExitStates` / `iterationStartState`, all from the `src/core` barrel: every input is read at one sha. Since `task-194`'s review, a typed `<T>.set_state(s)` on a selection of type `T` moves nothing and holds each selected gate whose approve target is `s` (`spec-017` §4.2, §5.1); `run` and `created` are unchanged.

## Execution Notes

### design (architect)

**`depends_on` read (dl-015).** `task-137`, `task-171`, `task-175`, `task-194` are `done` (`grep -m1 "^status"` over each).
Taken from their handovers: resolve `HEAD` once and read every input at that sha (`resolveRevision`, task-137);
`loadMemoryDocumentsAtRev(..., { onDiagnostic })` is the tolerant scan and `memoryUnreadableDiagnostic` the one
`W_MEMORY_UNREADABLE` builder (task-171, which left reporting the frontmatter-less plans to this task);
`tokenName` / `memoryAddType` and the `produces` ownership rule (task-175); `loadWorkflowRegistryAtRev` and
`workflowExitStates` (task-194, B1 handover above).

**Specs.** `spec-017` and `spec-003` are `approved`, `adr-007` / `adr-008` `accepted` (`grep -m1 "^status"`). No
spec is missing; no spec edit, no pending amendment (readings below are for the approver to confirm).

**Scope boundary** (Description): §4.6–§4.7, §4.10–§4.11 are task-202's; linkage, re-entry and the single union
walk of §4.8 are task-203's; §5 approvals are task-225's; §6 action/check views are the `next`/`status` tasks'.

**Design.**
- `src/workflow/deduce.ts` — pure `deduceWorkflowState(snapshot): Deduction` and `resolveInstanceRef`. Shapes follow
  `spec-017` §8 (`Instance`, `ElementRef`, `ScopeRef`, `TrailEntry`, `PhaseProgress`; `DeducedStep` is the part of
  §8's `Step` deduction decides). The four codes are exported constants. It imports `workflow-exit-state` and
  `workflow-diagnostics` as **modules**, not through the `src/core` barrel the handover names, because the barrel
  re-exports this module (an import cycle otherwise).
- `src/core/workflow-deduction.ts` — `readDeductionSnapshotAtHead(root)` (the one impure step: registry, `memory.yaml`,
  `dna.yaml`, Memory scan, `HEAD` tree, start commits, phase records, dirty input paths), `deduceWorkflowStateAtHead`,
  and `selectWorkflowInstance(deduction, ref?)` → `NOT_FOUND` `workflow is not open: <ref>`. All exported from `src/core`.
- `src/core/workflow-diagnostics.ts` — `creatingPhaseIndex` exported and `isImplicitOwnerProduces` extracted from the
  `W_PHASE_PRODUCES_OWNER_IMPLICIT` row, so loader and deduction apply one implicit-owner rule.
- Git: start commits by one `git log --topo-order --no-renames --diff-filter=A` over the candidate plan paths (the
  order of its commits is `rev-list --topo-order`'s, so it gives the position too); records by one
  `git log -E --grep=^WingFoil-Phase:` bounded by the oldest start's parents, then one `rev-list <sha> --not <start>^@`
  per distinct start only when a candidate record exists; `git status --porcelain=v1 -z --no-renames
  --untracked-files=all` over literal pathspecs for `W_UNCOMMITTED_INPUTS`.

**Readings taken (approver to confirm; none needs a spec change to implement):**
1. §1.4 codes: no frontmatter, no `type`, a type `memory.yaml` does not declare, no `id`, no `status` →
   `W_MEMORY_UNREADABLE` with that reason; a status outside the machine → `W_MEMORY_INVALID_STATE` (path `status`). On
   this repository the first pass reported 14 files, which was **wrong** (review F3): 8 of them are the top-level
   `docs/05_plans/X_*.md` plans `dl-019` grandfathers, not the six §1.4 counts. Fixed in review (below).
2. `where` match: an absent field reads as `""` (so `release: ["", "{release.version}"]` selects an element with no
   `release`), a list field matches on a shared element, values compared as strings.
3. `created` without linkage: every step has created nothing, so the kind is satisfied when the phase declares other
   evidence, else the step completes by a `record` (§4.3's rule for a step that created no element).
4. `awaits` and a checkpoint report the missing kind as `record`; `finalizable` = missing is exactly `[record]`.
5. A step's `trail` runs from the instance down to and including the step itself.
6. `ProducesView` carries an extra `evidence: boolean` (§8 has no field telling "shown but not evidence" apart from an
   entry of a workflow with no element, both `owner: null`).
7. An instance whose workflow the registry does not load is `complete: false` with an empty frontier.
8. `W_UNRESOLVED_TOKEN` is emitted for `produces` and `where` tokens of frontier steps only; action-argument tokens
   are interpolated by `next` (§6.1), not here. A self-creating instance's tokens are pending, never reported.
9. An `iterate_over` phase is reported as its own leaf (kind `include`, missing) until task-202 expands it.

**AC classification (T1, `testing` directive)** — `grep -rln "deduce\|Deduction" src` before the change found only a
comment in `src/memory/query.ts`: no deduction existed.

| AC | Class | Why |
|---|---|---|
| 1 instances / `<ref>` | red-first | no instance reader existed |
| 2 evidence kinds, implicit owner, checkpoint | red-first | new |
| 3 tolerant reads | red-first | the scan reports parse failures only; `W_MEMORY_INVALID_STATE` and the no-status/no-frontmatter reports are new |
| 4 `W_UNCOMMITTED_INPUTS` | red-first | new |
| 5 determinism (+ grep test) | red-first | the module did not exist (the grep test's "covers the deduction module" case fails) |
| 6 BDD P4.13 sc. 1–2 | red-first | new |
| 7 BDD P4.11 sc. 1–3 | characterization | pinned by `test/memory/state-machine.test.ts` since task-036; the new test checks the deduction calls `validateFrontmatterState` and spells no message of its own |

### red

`test/core/workflow-deduction.test.ts` (AC 1–4, 6, 7; fixture git repositories) and
`test/workflow/deduce-determinism.test.ts` (AC 5, grep over `src/workflow/*.ts` + `src/core/workflow-deduction.ts`
for `Date.now(`, `new Date(`, `Math.random(`, `performance.now(`, `process.hrtime`, `crypto.random*`, `randomUUID(`).
`npx jest test/core/workflow-deduction.test.ts test/workflow/deduce-determinism.test.ts` → **19 failed, 4 passed, 23
total** (`deduceWorkflowStateAtHead is not a function`, `ENOENT src/workflow/deduce.ts`; the passing four are the
grep over the existing workflow files and AC 7's message pin). Commit `3208d17e`.

### green

Implementation as designed; same command → **24 passed, 24 total** (the grep test gains `src/workflow/deduce.ts`).
Commit `785baef3`.

Measured on this repository (ts-node, three runs at the branch head, load average ~60 from 8 parallel agents,
`uptime`): 7 open instances (6 `decision-log-ingest`, 1 `service-ingest`, each `element: null`, context
`release:minor-v0.3`, frontier `<w>.capture` — linkage is task-203's), 14 `W_MEMORY_UNREADABLE` at that pass (six after
the review F3 fix), no other deduction code. Time: snapshot 3.4–6.7 s, of which registry load 1.7–2.4 s and Memory scan
1.3–2.0 s (both existing primitives, task-194 / task-137); the reads this task adds (start commits, records, status)
cost ~0.2 s; the pure deduction 29–107 ms. A first version ran one `git log -- <path>` per open plan (+1.6 s under
the same load); replaced by one `git log --topo-order` before commit. REQ-PERF-03 (`workflow next` < 1,000 ms p95)
is not measurable on this machine now; see the report.

### refactor

- `test/workflow/deduce.test.ts` (pure, synthetic snapshots): every §1.4 exclusion reason, every §4.1 token rule
  (`{element.<f>}`, `{<type>.<f>}`, `{item}`, out-of-scope type, blank field, `/` pattern), the self-creating and
  context bindings, a typed `<T>.set_state`, a selection token, an unexpanded `iterate_over`, a `{ type, path }`
  entry, and the empty answer of a repository with no commit. Commit `4ca79c9c`.
- `test/docs/name-resolvability.allowlist.ts`: removed the 7 `planned` entries this task resolves (`W_UNCOMMITTED_INPUTS`
  in spec-006/008/016/017, `W_MEMORY_INVALID_STATE`, `W_UNRESOLVED_TOKEN`, `W_INSTANCE_WORKFLOW_UNKNOWN` in spec-017),
  listed as `stale` by `npx jest test/docs/name-resolvability.test.ts` before the edit and absent after.

Gates at `4ca79c9c` (logs kept private to this worktree; load average ~60):
- `npm test` → 293 suites / 5452 tests passed (at `785baef3` + the allowlist edit); `npm run test:coverage` at
  `4ca79c9c` → **294 suites, 5459 tests passed**; All files **99.23 % stmts / 96.53 % branches / 96.85 % funcs /
  99.73 % lines**. New files: `src/workflow/deduce.ts` 98.25 / 89.87 / 100 / 100, `src/core/workflow-deduction.ts`
  98.07 / 82.69 / 100 / 100; `src/core/workflow-diagnostics.ts` 100 / 99.44 / 100 / 100.
- `npm run lint` exit 0; `npm run docs:api` exit 0; `npx tsc --noEmit -p tsconfig.json` exit 0;
  `npx tsc -p tsconfig.build.json --noEmit` exit 0.
- BDD: P4.13 sc. 1–3 are pinned by `test/core/workflow-deduction.test.ts` (AC 6, AC 3, scenario titles quoted); P4.11
  sc. 1–3 stay pinned by `test/memory/state-machine.test.ts` (unchanged). No feature file edited.
- No CLI command, option, exit code or Memory type added: no parity, `cli-reference.md` or dry-run row applies.

### review (self, reviewer)

Each AC against its evidence:
1. AC 1 — "AC 1" describe: two open mains out of five plans (done / `parent` / sub-workflow plans ignored), newest
   first, first active; tie by id; `<ref>` by name, by id, `workflow is not open: <ref>` (NOT_FOUND); unknown workflow
   → empty frontier + `W_INSTANCE_WORKFLOW_UNKNOWN`.
2. AC 2 — `produces` (file and `site/` pattern), `selection`, plain `include` (trail into `helper.only`), `record`
   (and records of another instance / another phase / not `completed` / with a scope trailer do not count; a record
   older than the start commit does not count), `state`; implicit owner shown with `evidence: false`.
3. AC 3 — unparsable, no status, illegal status (exact P4.13 sc. 3 message + ` in <file>`), no frontmatter: excluded,
   reported in path order, no throw.
4. AC 4 — dirty Memory file, untracked `produces` targets, a workflow file and a `paths.runs` file reported, `README.md`
   and `src/` not; the answer equals the clean one.
5. AC 5 — byte-identical `JSON.stringify` on two runs; `W_MEMORY_*` in sorted path order; grep test green.
6. AC 6 — P4.13 sc. 1 (`implement` current for an `in-progress` task) and sc. 2 (`releasing` phase), a committed
   `.wingfoil/state/index.json` changes nothing.
7. AC 7 — source check: imports and calls `validateFrontmatterState`, spells no `invalid state '` text.

Same-class sweep in touched files: the implicit-owner rule now lives once (`isImplicitOwnerProduces`), used by the
loader row and the deduction. No other change outside the deduction.

### review fixes (independent review: approve with fixes, F1–F5)

- **F2 (behaviour, red-first).** A phase with `awaits` completed without a record when its other evidence was
  satisfied; §4.3's `awaits` row and §5.4 need a record. Red `6f1a1add` (`npx jest test/workflow/deduce.test.ts`
  → 2 failed, 5 passed: F2 and F3), fix `b4e73b4b`: `recordNeeded = phase.awaits !== undefined || only created`.
- **F3 (behaviour, red-first).** A file with no frontmatter is reported only when its path matches a type's `path`
  pattern (a file-name token one name, a directory token one or more directories, since `{scope}` nests). Red
  `6f1a1add` also adds a characterization on this repository: exactly the six §1.4 plans
  (`initial-design-rl-v1-plan.md` and the five `rl-v1/rel-v0.1/` plans), it failed with 14 before and passes after
  (`npx jest test/core/workflow-deduction.test.ts -t "review F3"`). Fix `b4e73b4b`.
- **F1 (coverage).** Unreachable branches removed with the reason in a code comment, not tested: duplicate workflow
  names and an unresolved `include` (both refused by the registry at load), `memory.yaml` absent while a plan exists
  (a plan is an element of a declared type), an unknown `element` type (`E_WORKFLOW_ELEMENT_TYPE_UNKNOWN`), the
  `exits[p]` / `fileOf` lookups (built from the same registry), the creating phase's `actions` (it holds the
  `memory.add`), the item scope in `hasRecord` and the step key (no collection scope until task-202). Reachable
  branches tested (`5b3a8534`): the `where` rule (absent `""`, shared list element, non-string value), an unresolved
  `where` token, `awaits`, a status outside the sequence (`deprecated`) and an undetermined exit, a numeric field
  token, an unknown context id, an empty declared element, a plan with no workflow and one with no start commit, a
  typeless `memory.add`, no `memory.yaml`; on the reader: a repository with no `.wingfoil/`, a `produces` pattern
  starting with a token, `dna.yaml` without `paths.runs`, a plan with no status. The six barrel exports the review
  named are now used by tests through `src/core` (`W_*` constants, `readDeductionSnapshotAtHead`,
  `resolveInstanceRef`). Targeted run: `npx jest test/workflow test/core/workflow-deduction.test.ts --coverage
  --collectCoverageFrom=src/workflow/deduce.ts --collectCoverageFrom=src/core/workflow-deduction.ts` → both files
  100 / 100 / 100 / 100.
- **F4 (pending amendments, uncommitted, approver).** `ProducesView.evidence` is kept public and goes into
  `spec-017` §8 (the `next`/`status` views need it to say "shown but not evidence").
  - `spec-017` (record after task-199's spec-017 amendment) — proposed `--reason`: "task-198 (review F3/F4): §1.4
    names every W_MEMORY_UNREADABLE reason and leaves out a no-frontmatter file that lies on no type's path pattern,
    so the six pre-dl-019 plans are reported and the grandfathered top-level X_* plans are not; §4.9 states that an
    instance of an unloaded workflow is complete: false despite its empty frontier; §8 adds produces[].evidence. No
    deduction rule changed."
  - `spec-003` (record after task-264's and task-199's) — proposed `--reason`: "task-198 (review F4): the Layer 2
    where row states that values compare as text and that a field a document does not carry reads as an empty
    string, the reading dl-016's release-empty filter needs and spec-017's deduction applies. No diagnostic
    changed."
- **F5 (for downstream tasks).**
  - `selectWorkflowInstance` returns only `workflow is not open: <ref>` (NOT_FOUND). §10's
    `unknown workflow: <name>` for a `<ref>` naming no loaded workflow is task-204's / task-216's to add.
  - `W_UNCOMMITTED_INPUTS` is **one diagnostic per dirty path** (`file` = the path, `path` = `''`), in sorted order.
  - `readRecords` runs one `rev-list <sha> --not <start>^@` per distinct start commit, and only when a record
    candidate exists. task-203's single union walk replaces it.
  - The snapshot cost is dominated by the registry load and the Memory scan (figures under green), not by the reads
    this task adds. That is a REQ-PERF-03 risk for task-216 (`workflow next` < 1,000 ms p95), to be measured on an
    idle machine.
- **Gates after the fixes**, run with the two pending amendments in the working tree: `npx jest --coverage` gave 294
  suites and 5469 tests passed. All files were 99.33 % statements, 97.25 % branches, 97.29 % functions and 99.73 %
  lines, against main `4fd77678`'s 99.29 / 97.07 / 97.11 / 99.72 by the same command (reviewer's figures). No figure
  regresses. `npm run lint`, `npx tsc --noEmit -p tsconfig.json`, `npx tsc -p tsconfig.build.json --noEmit` and
  `npm run docs:api` each exit 0.
