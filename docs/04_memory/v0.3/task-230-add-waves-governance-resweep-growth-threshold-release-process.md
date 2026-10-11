---
id: "task-230-add-waves-governance-resweep-growth-threshold-release-process"
type: task
title: "Add waves, the governance re-sweep and the growth threshold to the release process"
status: in-progress
release: "v0.3"
kind: "feature"
priority: "medium"
tags: ["v0.3", "process", "workflow-config", "governance"]
ref: "dl-100"
bug: []
depends_on: ["task-199-align-wingfoil-workflows-custom-v0-3-schema-commands", "task-219-define-release-candidate-staging-rehearsal-phase-recut-reentry", "task-222-declare-release-health-catalogue-v2-report-schema-release"]
tmpl_version: 260703
---

## Description

v0.2 grew 134 % after planning with no trigger. A wave becomes a declared unit of `implementation`; a re-sweep and re-plan checkpoint runs at each wave boundary; a growth threshold forces it early; `release-planning`'s reconcile filter includes `ready` DLs; `build-backlog` checks criteria against the bound directives.

## Acceptance Criteria

- (characterization) `release-cycle.yaml` declares the wave and a `re-sweep` phase at its boundary (triage-bugs + reconcile-governance with `ready` DLs), expressed with spec-003's vocabulary (`iterate_over`/`where`/collections); if it cannot be, design raises a spec-003 amendment before green. The wave-boundary phase also runs e2e-smoke and the mechanical user-doc checks (`docs/examples` scripts, document-parity suites) (dl-133 §2); a failure opens a bug.
- (characterization) `release-planning.yaml`: reconcile filter includes `ready` DLs; a growth check refuses the next task start when tasks exceed `backlog_committed` by 25 % (dl-100 §3 (a)); `build-backlog.checks.post` = every criterion checked against the bound directives and ratified specs (dl-102 §2); the 20 % bug/debt reservation is stated at `define-scope` (§4 (b)).
- (characterization) `release.md` template gains `## Scope changes`; `memory.yaml` `release` gains `backlog_committed` `[AUTHORING]`; loads with zero errors.
- (characterization) all edited files versioned; `workflow list` zero errors.
- (characterization) `.wingfoil/WORKFLOW.md` draws the wave and `re-sweep` phase; task-148's phase-name test stays green.

## Implementation Notes

- **Size:** M · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-100 §1 (a), §2, §3 (a), §4 ((b) planning rule); dl-102 §2; dl-133 §2 (Q2 (a)) (the wave-boundary phase).
- **Features:** P4.1, P4.13.
- **Planning ruling:** Approver ruling 2026-09-30 (plan R19): `dl-100` §5 (a WIP limit on decision-logs) is dropped — no limit on decision-logs is implemented.
- **Notes:** Proposal key: D11. dl-100 §5 (WIP limit on DLs) has **no option recorded** in `edd953ed`'s `Reason:`; excluded until the approver rules (recommended (b) + (a) backstop). dl-100 §4 (a) is a catalogue measure (task-222). `bug-175` (the define-scope `kind` check) moved to task-148, which fixes it in wave 1.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.
- **Handover from the parallel-release-lines decision (2026-10-07):** `dl-159` (`in-discussion`, to be ratified before the
  `v0.3.0` tag) opens `release/X.Y` maintenance lines beside `main`: patches land on `release/X.Y` and are merged
  forward into `main` with `--no-ff`, never cherry-picked or back-merged; patch tags go on the pushed `release/X.Y`.
  A patch (`kind: patch`, `dl-092` Q2 (ii)) will run its own release-cycle on `release/X.Y` while the next minor
  runs on `main`. Declare the wave, the `re-sweep` and the growth threshold per `release` element (its
  `backlog_committed`, the elements with `release: <this release>`), never per branch or as "the tasks on `main`",
  so two open release-cycles do not count each other's work. The `release` `branch` field and the patch-seeding
  action are `dl-159` A2.3 (deferred): do not add them here.

## Execution Notes

### Design (architect, 2026-10-11) — STOPPED: the wave is not expressible in spec-003's vocabulary

Read (dl-015): the Execution Notes of `task-199` (zero-error test, `{ type, path }` produces, selections),
`task-219` (release-cycle 1.3, the candidate re-cut re-entry) and `task-222` (release-cycle 1.4,
`release-health`); `dl-100`, `dl-102` §2, `dl-133` §2 and its 2026-10-10 note, `dl-163` R6, `task-272`'s
`## Scope changes` handover, `task-148`'s `test/docs/workflow-md.test.ts`. Specs: `spec-003` and `spec-017`
are `approved` (`grep -m1 '^status:' docs/04_memory/design/specs/spec-00{3,17}-*.md`).

**AC 1 cannot be met without a spec-003 amendment** (the AC's own exit, and the B6 notes' stop rule).
What has to be expressed: per `release` element (dl-159 handover), a variable number of waves, each
running its tasks' dev-loops and then a `re-sweep` phase that also runs e2e-smoke and the user-doc checks.
- **A wave is neither a Memory type nor a collection spec-003 knows.** `iterate_over` takes a type or a
  `dna:<path>` / `bindings:<name>` reference (spec-003 § "Collections"; `COLLECTION_REF_RE = /^(dna|bindings):/`,
  `src/core/workflow-diagnostics.ts:58`; the deduction reads only those two, `src/core/workflow-deduction.ts:349-352`).
  Both are project-wide, not per release. Today a wave lives only in plan prose (dev-loop plan §3,
  `release-planning-rel-v0.3-plan` Appendix E) and in each task's Implementation Notes (`**wave:** 3`); no
  task carries a `wave:` field (`grep -l '^wave:' docs/04_memory/v0.3/*.md` → nothing).
- **Rejected: `iterate_over: bindings:waves` (a static key list) + a task `wave:` field.** (i) The list is
  the project's, not the release's (dl-159 handover). (ii) Collection entries have no status, so every
  entry is a candidate until its iteration completes (spec-003 § "Collections"): a release with 4 waves
  against a 10-key list owes 6 empty re-sweeps before `user-docs`. (iii) It does not load once the wave runs
  e2e-smoke: a collection-iterated workflow declares no element, and `e2e-smoke` (`element: release`)
  cannot be included from it. Probe (throw-away jest file, deleted, never committed): a `wave` sub iterated
  over `bindings:waves` loads with zero diagnostics with only a dev-loop include, and with
  `include: smoke` (element `release`) fails with `E_WORKFLOW_ELEMENT_MISMATCH: workflow 'smoke' declares
  element 'release', but this phase neither iterates over 'release' nor runs in a workflow bound to 'release'`
  (`npx jest test/core/zz-task230-wave-probe.test.ts` → 3 passed, diagnostics printed).
- **Rejected: a recurring phase** (`cadence: { recurring: { on: … } }`, dl-100 §1 (c)): an event is
  `<memory-type>-<state>`, and no Memory transition marks a wave's end; (c) is not the ratified option.
- **Rejected: unrolled phases** (`implementation-w0`, `re-sweep-w0`, …) in `release-cycle.yaml`: a fixed
  wave count shared by every release.
- **Rejected: one `re-sweep` after `implementation`:** runs once per release, not at each boundary.

**Proposed spec-003 amendment (for the approver's ruling; not written, spec-003 untouched):**
1. A third collection reference, `element:<field>` — the list in frontmatter field `<field>` of the
   enclosing workflow's bound element, read at the snapshot's commit like every Memory read (REQ-SYS-03,
   versioned, so REQ-STATE-09 holds as dl-104 D2's rationale requires). Same entry rules (keys in the ID
   characters, declared order, `{item}`).
2. A workflow iterated over an `element:` collection keeps the enclosing bound element (it may declare
   `element:` equal to that type), so it can `include` `e2e-smoke` / `user-docs` (both `element: release`);
   `E_WORKFLOW_ELEMENT_MISMATCH` stays for `dna:` / `bindings:`.
3. spec-017 §4 (collection expansion per instance) follows; code in `workflow-diagnostics.ts`,
   `workflow-deduction.ts`, `src/workflow/deduce.ts` (new task, or this one resized M → L).
Then: `release` gains `waves: [w0, …]` (`[AUTHORING]`, fixed at `commit-backlog`, extended only at a
re-plan checkpoint, recorded in `## Scope changes`) and `task` gains `wave:` (`[AUTHORING]`, set at
`build-backlog` / at admission); `release-cycle.implementation` becomes `include: wave`,
`iterate_over: element:waves`; a new sub `wave.yaml` runs `tasks` (`include: dev-loop`,
`iterate_over: task`, `where: { status: [backlog], tags: ["{release.version}"], wave: "{item}" }`) then
`re-sweep`, `e2e-smoke` (include) and the user-doc checks. Alternative the approver may prefer: a
`group_by: wave` key on an `iterate_over: task` phase (heavier: a new key and a new deduction shape).

**Design of the remaining ACs (ready to implement after the ruling; nothing written yet):**
- *re-sweep (one phase, one selection):* `where: { type: [bug, decision-log, adr], status: [open,
  in-discussion, pending, ready], release: [""] }` — dl-100 §1's population is the **unscheduled**
  elements, so `release: [""]` only. Actions `memory.approve` (gate states), `element.set_release` (this
  or a named later release), `memory.deprecate` (exit); `approval: { by_role: approver }`, role
  `tech-lead`. A failure of the smoke / doc checks opens a bug through `bug-ingest` (dl-133 §2).
- *reconcile-governance + `ready`:* a `ready` decision-log never leaves the selection (dl-017), so the
  phase completes only through spec-017 §4.7, as `build-backlog` already does (spec-017 §12 note), and
  `memory.approve` has no edge from `ready`. The phase needs a disposition for a selected `ready` DL:
  this release (left to `build-backlog`), a named later release (`element.set_release` here — which
  contradicts the file's comment "Assignment (`release=`) happens only in build-backlog", dl-016 §4), or
  exit (`memory.deprecate`). **Decision for the approver** (D2 below).
- *growth threshold:* one statement in `memory.yaml` `release.growth_threshold` (mirrors
  `task.stop_the_line`: `field: backlog_committed`, `counts: "tasks with release == this release, status
  not deprecated"`, `max_growth: 25` percent, strictly more, `at: "dev-loop start"`, cleared by a re-plan
  checkpoint recorded after the crossing); `dev-loop.start.checks.pre` gains
  `growth.clear(rule: memory.yaml release.growth_threshold)` (dev-loop 1.8 → 1.9). `release-planning`
  declares where the count is fixed: `commit-backlog.checks.pre` `frontmatter.required: [backlog_committed]`.
- *build-backlog `checks.post`* += `acceptance-criteria.consistent(…bound directives and ratified specs…)`
  (the token `dev-loop.design` already uses, so no new unbound class). *define-scope*: the 20 % bug/debt
  reservation stated in its description (dl-100 §4 (b)).
- *template/memory.yaml:* `release.md` `## Scope changes` (one row per task added after `commit-backlog`:
  task, source element, admitting checkpoint; dl-163 R6 patch triage); `backlog_committed` optional in the
  template (pre-dl-100 releases carry none), `memory.yaml` 3.1 → 3.2. Versions: release-planning 1.8 → 1.9,
  release-cycle 1.4 → 1.5; WORKFLOW.md + `workflow-repository-conformance` counts.

**Decisions for the approver.**
- D1 — the spec-003 amendment above (or another trigger); and whether its code joins this task or a new one.
- D2 — the disposition of a `ready` decision-log at `reconcile-governance` (set_release here vs. only in
  `build-backlog`), given that the selection never empties.
- D3 — `release` is `amendable: false` (`.wingfoil/memory.yaml`), yet `## Scope changes` and
  `backlog_committed` change during `in-development` at every checkpoint: either `amendable: true` for the
  release (dl-108 A3 ruling revisited) or a coordinator hand `wf(release): amend` per checkpoint (precedent
  `3b585e33`).
- D4 — the threshold already fires on v0.3: 121 tasks at `commit-backlog` (Appendix E); today 153 task
  files carry `release: "v0.3"`, 1 `deprecated`, so 152 counted, +25.6 % > 25 %
  (`grep -l '^release: "v0.3"' docs/04_memory/v0.3/task-*.md | xargs grep -h -m1 '^status:' | sort | uniq -c`).
  Whether `minor-v0.3` gets `backlog_committed: 121` (a hand amend) and whether the rule is in force for
  the rest of v0.3 (dev-loop plan §2: a rule is in force from its task's approval).

No red, green or refactor ran; no gate ran (no code or config changed).
