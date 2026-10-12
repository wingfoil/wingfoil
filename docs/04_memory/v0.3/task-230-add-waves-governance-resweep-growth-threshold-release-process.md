---
id: "task-230-add-waves-governance-resweep-growth-threshold-release-process"
type: task
title: "Add waves, the governance re-sweep and the growth threshold to the release process"
status: in-review
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

- **Size:** M, resized to **L** on 2026-10-12 (approver ruling D1 (i): the `element:<field>` loader and deduction code joins this task) · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
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

### Design, first pass (architect, 2026-10-11) — STOPPED: the wave is not expressible in spec-003's vocabulary

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

### Design, second pass (architect, 2026-10-12) — after the approver's rulings

Rulings (2026-10-12, `devloop-kit/w3-b6-notes.md` "Approver rulings on task-230" and "second set"): **D1 (a)** —
`spec-003` gains `element:<field>`, and a workflow iterated over it keeps the enclosing bound element; **(i)** the
code joins this task (M → L); **D2** — for `ready` decision-logs `reconcile-governance` only checks coverage, no
transition, no assignment; **D3** — `release` `amendable: true` (memory.yaml 3.2), `release-line` stays false, the
`init` scaffold kept in sync; **D4** — the growth threshold is declared, in force from v0.4's planning;
`minor-v0.3` gets `backlog_committed: 121` and a `## Scope changes` row by amendment. Handover from `task-239`
(bug-292): the `KNOWN_READ_FAILURES` sentence in `advance-pinned-build`. Main merged first (`8febbd06`, main
`3e692099`).

Design decisions taken here (for the approver to confirm):
- **Scope label.** An `element:` iteration's scope is `<type>:<id>/<field>#<key>` (e.g.
  `release:minor-v0.4/waves#w0`), not `element:waves#w0`: a phase record carries no element for an item scope
  (`hasRecord`, `src/workflow/deduce.ts`), so two releases' `w0` in one instance would share a record.
- **No `include: e2e-smoke` inside the wave.** `e2e-smoke.gate` produces
  `docs/07_gates/rl-…/rel-{release.version}-e2e-smoke.md`; a wave including it would write the release's own
  gate report and satisfy `release-cycle.e2e-smoke` (and need its approval) at every wave. `wave-checks` is a
  leaf phase instead, with its own per-wave report (`…-{item}-e2e-smoke.md`) checked by the bound
  `e2e-smoke-passed`, plus `docs.parity` (bound) and `docs.examples.passing` (unbound: no single command runs the
  five `run.sh`, `docs/examples/README.md`). The ruling's "may include" is still implemented and tested
  (`wave.yaml` declares `element: release`).
- **`re-plan` is its own checkpoint phase** after `re-sweep`: a selection phase cannot also be a record, and the
  growth threshold needs a record to be cleared by. It is an approval with no carried element, so `workflow
  finalize` records it (checkpoints 29 → 30, finalize approvals 6 → 7).
- **The growth threshold counts** tasks with this release's `release` and a status other than `deprecated`
  (the `task.stop_the_line.open` reading of 2026-10-10), strictly more than 125 % of `backlog_committed`; a
  release with no `backlog_committed` never fires.
- **Malformed entries** (not a list, a duplicate or invalid key) make the phase one unexpanded step with
  `W_UNRESOLVED_TOKEN` at `phases[<i>].iterate_over`, like a `where` token with no value; no new diagnostic code
  (so no spec-009 / parity change).

AC classification (testing directive T1; config is new declared content, so red-first like `task-219`'s AC 2):

| AC | Class | Test |
|---|---|---|
| 1 — wave + re-sweep in spec-003's vocabulary (+ the `element:` code, D1) | red-first | `test/workflow/deduce-element-collection.test.ts`, `test/core/workflow-element-collection-checks.test.ts`, `test/core/release-waves-config.test.ts` AC 1 |
| 2 — release-planning reconcile/growth/build-backlog/define-scope | red-first | `release-waves-config.test.ts` AC 2 |
| 3 — templates, `memory.yaml` release fields, zero errors | red-first | `release-waves-config.test.ts` AC 3; conformance at `HEAD` |
| 4 — versions, `workflow list` zero errors | red-first | `release-waves-config.test.ts` AC 4; `test/lint/version-bump.test.ts`; `node dist/cli.js workflow list` |
| 5 — WORKFLOW.md draws the wave; task-148's test green | characterization of the existing test | `test/docs/workflow-md.test.ts` |

### Red (2026-10-12)

- `effe3116` — three new suites. `npx jest test/workflow/deduce-element-collection.test.ts` → **7 failed / 7**
  (`TypeError: Cannot read properties of undefined (reading 'id_pattern')`: `element:waves` read as a type);
  `test/core/workflow-element-collection-checks.test.ts` → 5 failed, 1 passed; `test/core/release-waves-config.test.ts`
  → **21 failed / 21** (e.g. `Expected: "wave"`, `Received: "dev-loop"`; `no workflow 'wave' in the registry`).
- Two red corrections, each committed before green and each re-run red against the unchanged `src/`
  (`git diff --stat 8febbd06 2b6669f1 -- src` → empty; deviation from T4's single red, recorded as `task-211`
  did): `af9a0b13` — the load fixture's `dna.yaml` lacked `paths:`, so
  the registry refused it before any workflow check (still 5 failed, 1 passed); `2b6669f1` — a trail scope's
  `ElementRef` carries `status` (still 7 failed / 7).

### Green (2026-10-12)

- `9e5b1735` — code: `src/core/workflow-diagnostics.ts` (`element:` is a collection reference; the
  `E_WORKFLOW_ELEMENT_MISMATCH` rule keeps the enclosing element), `src/core/workflow-core-checks.ts`
  (`E_WORKFLOW_COLLECTION_UNRESOLVED` for no field name or no including element), `src/workflow/deduce.ts`
  (`elementCollection`: entries from the innermost bound element, label, undecided cases). Config: new
  `.wingfoil/workflows/custom/wave.yaml` 1.0 (`tasks`, `re-sweep`, `re-plan`, `wave-checks`), `workflows.yaml`
  1.5 → 1.6, `release-cycle.yaml` 1.4 → 1.5, `release-planning.yaml` 1.8 → 1.9 (separate blocks per phase:
  advance-pinned-build comment, define-scope, reconcile-governance, build-backlog, commit-backlog — `task-277`
  adds its define-scope sweep next to them), `dev-loop.yaml` 1.8 → 1.9, `memory.yaml` 3.1 → 3.2, templates
  `release.md` and `task.md` (`tmpl_version: 261012`), `src/storage/templates.ts` (`release: true`),
  `WORKFLOW.md` (Phase 6, the new *Wave* sub-diagram, dev-loop start, release-planning, release amendable, roles),
  and `test/core/adr-amendable.test.ts` (the release value it pins, D3).
- `61e403ac`, `d57ce591` — the repository pins re-measured: `workflow-repository-conformance.test.ts` (5 new
  unbound checks, `wave.re-plan` checkpoint and finalize approval) and `workflow-status.test.ts` (§5.1's list).
- `cdbad5bc` — `.wingfoil/README.md` tree; `docs/cli-reference.md` `memory amend` (the `init` scaffold's amendable
  types now include `release`, and `plan`, missing before; the error example names `release-line`).
- `npx jest test/workflow/deduce-element-collection.test.ts test/core/workflow-element-collection-checks.test.ts
  test/core/release-waves-config.test.ts` → 7 + 6 + 21 passed.

### Refactor (2026-10-12)

- `673f63ec`, `1b933a1b` (the type cast) — the mismatch rule returns no mismatch when the including workflow has no
  element (the core check reports it, once); two refactor suites cover the unbound cases
  (`test/workflow/deduce-element-collection-unbound.test.ts`, `test/core/workflow-element-collection-unbound-checks.test.ts`).
- Gates (dl-170 slot via `waitslot.sh`, `--maxWorkers=2`, foreground or tracked):
  - `npm test -- --maxWorkers=2` at `9e5b1735`+`61e403ac` → 1 failed (`workflow-status.test.ts`, §5.1's list, fixed
    in `d57ce591`), then `npm run test:coverage -- --maxWorkers=2` at `d57ce591` → **385 suites, 7105 passed**,
    All files **99.29 % stmts / 97.18 % branches / 97.94 % funcs / 99.71 % lines** (B5 gate: 99.3 / 97.22 / 97.93 /
    99.7, `devloop-kit/gate-w3b5-cov2.log`); `deduce.ts` 99.69/99.42 (573-574 then uncovered, covered by the
    refactor suite), `workflow-core-checks.ts` 100, `workflow-diagnostics.ts` 100/98.93.
  - after the refactor: `npx jest test/core/workflow test/workflow test/docs test/lint test/core/release-waves-config.test.ts
    test/core/adr-amendable.test.ts` → **66 suites, 835 passed**.
  - `npm run lint` exit 0; `npx tsc --noEmit -p tsconfig.json` exit 0 (after the cast fix); `npx tsc -p
    tsconfig.build.json --noEmit` exit 0; `npm run docs:api` exit 0.
  - `node dist/cli.js workflow list --format json` → **0 errors**, 90 warnings, exit 0. The registry at `HEAD`:
    27 workflows, 105 phases, 0 errors, 84 warnings (`main` `3e692099`: 26, 101, 0, 79).
  - `node scripts/check-governance.cjs --base 0671d035` → 0 findings; `node scripts/lint-claims.cjs --base 0671d035`
    → 0 warnings before these notes were written, then 1 on this notes file (the red-corrections line, fixed at
    review, F4).
- No sw-life-cycle instance is open here (`node dist/cli.js workflow status`: nine ingest instances), so the
  repository's reported deduction does not change.

### Review (2026-10-12) — independent review: approve with fixes

Findings and what changed (all same-class instances in the files this task touched):
- **F1** — an absent `waves:` made `implementation` vacuously complete, the template defaults to `waves: []`, and
  `commit-backlog` checked only `backlog_committed`. Now an **absent** field is undecided (one unexpanded step +
  `W_UNRESOLVED_TOKEN`, `src/workflow/deduce.ts`); an explicit `[]` stays vacuous. `commit-backlog` gains
  `waves.declared` (a non-empty list; a separate token because `frontmatter.required` counts a list value as
  missing outside `memory.yaml`'s `lists:`), `build-backlog` gains `task.wave.declared`. Red first: `438071b7`
  (`test/workflow/deduce-element-collection-absent.test.ts`, 1 failed against the unchanged `deduce.ts`), fix
  `1c7a3741`.
- **F2** — `wave.tasks` selected by `tags: ["{release.version}"]`; per the `dl-159` handover it now selects
  `release: "{release.version}"` (22 of 153 v0.3 tasks carry no `v0.3` tag, the reviewer's count). Also in
  `WORKFLOW.md` and `.wingfoil/README.md`.
- **F3 (option (a))** — "in declared order" was false: every collection entry is a candidate at once. Reworded
  in `release-cycle.yaml`, `wave.yaml`, `memory.yaml`, the release template, `release-planning.yaml`,
  `WORKFLOW.md`, `.wingfoil/README.md` and `spec-017` §4.6: waves are ordered keys, all listed waves open at
  once, and `re-plan` appends the next. A sequential `element:` iteration is a follow-up decision-log (the
  coordinator's).
- **Wave order (reviewer suggestion, adopted)** — `tasks → wave-checks → re-sweep → re-plan`, so a wave-check
  failure is a bug the same wave's re-sweep schedules (`dl-133` §2).
- **F4** — the red-corrections line now names its command (above); the claims-lint count is corrected.
- **F5** — `test/core/memory-amend.test.ts`'s header describes the fixture's `release`, not this repository's.
- **F6** — `spec-017` §4.6 (pending) states the limit: inside an `element:` iteration a sub bound to the enclosing
  element runs on the entry's scope and its `state` evidence cannot be satisfied; no included sub moves the
  release's state today.
- **F7** — the re-sweep's prose and actions agree: `memory.approve` only for `open` bug → `triaged`,
  `in-discussion` decision-log → `ready`, `pending` ADR → `accepted` (never `triaged` → `planned` without a fix
  task); a new `memory.reject` action is a bug's legal close (`dl-123`); `memory.deprecate` for the others.
- Decision 2 (no `include: e2e-smoke` in the wave) stays as is; it goes to the approver (reviewer).
- **T4 deviation (for the approver).** `1bb7882a` edits two of red's files after green: in
  `deduce-element-collection.test.ts` the vacuous case now declares `waves: []` (F1 changed what an absent field
  means), and `release-waves-config.test.ts` follows F2, F7, the wave order and F1's two checks. Check: `git log
  --first-parent --no-merges --format='%h %s' 2b6669f1..HEAD -- test/workflow/deduce-element-collection.test.ts
  test/core/workflow-element-collection-checks.test.ts test/core/release-waves-config.test.ts` → that one commit.
- Conformance at `HEAD` (re-pinned in `1417ee8a`, `test/core/workflow-repository-conformance.test.ts`): 27 workflows, 105 phases, 0 errors, 86
  warnings (+ `waves.declared`, `task.wave.declared`; `docs.examples.passing` now at `wave` `phases[1]`).
- Gates after the fixes (slot via `waitslot.sh`, `--maxWorkers=2`): `npm test -- --maxWorkers=2` → **388 suites,
  7115 passed**; `npm run test:coverage -- --maxWorkers=2` → 388 suites, 7115 passed, All files **99.31 / 97.22 /
  97.94 / 99.71** (`deduce.ts` 100 / 99.8, `workflow-core-checks.ts` 100, `workflow-diagnostics.ts` 100 / 99.46);
  `npm run typecheck` exit 0; `npm run lint` exit 0; `npm run docs:api` exit 0; `node dist/cli.js workflow list
  --format json` → 0 errors, 97 warnings; `node scripts/check-governance.cjs --base 0671d035` → 0 findings.
- **Handover to `task-277`:** D3 made `release` `amendable: true` (`memory.yaml` 3.2); `task-277`'s description
  assumes `false` — its ruling stands, only that premise changed.

### Pending amendments (approver) — uncommitted in the worktree

- `spec-003-workflows-yaml-schema` — Proposed `--reason`: "task-230 (approver ruling D1 (a), 2026-10-12): §
  Collections gains element:<field>, a list read from the bound element, and the rule that such an iteration keeps
  the enclosing bound element; the ELEMENT_MISMATCH and COLLECTION_UNRESOLVED rows gain the element: cases and the
  Layer 2 file count is 27. The code is in task-230."
- `spec-017-workflow-commands-and-state-deduction` — Proposed `--reason`: "task-230 (approver ruling D1 (a),
  2026-10-12): §4.6 iterates an element's field with a per-element scope label, §5.1 lists wave.re-plan among the
  approvals finalize records, and §12 is re-measured at 27 workflows, 105 phases and 86 warnings. It also states
  that an absent field is undecided, that every listed entry is open at once, and the limit of a sub bound to the
  enclosing element."
- `spec-001-memory-yaml-schema` — Proposed `--reason`: "task-230 (approver ruling D3, 2026-10-12): the release type
  is amendable in this repository's example, as memory.yaml 3.2 declares; release-line stays false."
- `minor-v0.3` (release; amendable only once this branch's `memory.yaml` 3.2 is on `main`, so the coordinator
  records it after the merge, or by hand before) — `backlog_committed: 121` and a `## Scope changes` row: 152
  counted against 121, +25.6 %, over 151.25. Proposed `--reason`: "task-230 (approver ruling D4, 2026-10-12): the
  backlog committed at release-planning was 121 tasks, and the scope grew to 152 counted tasks without a re-plan
  checkpoint. The growth threshold is in force from v0.4."
- No `dl-100` note: D2 does not change `dl-100`, whose Action 2 already asks the filter to include `ready`
  decision-logs.

### Retrospective

- Design stopped once on a vocabulary gap the AC itself foresaw; the ruling and the code then fit in one branch.
  Evidence: the first-pass design above, `e07b9adf`.
- Two red corrections came from fixture shape (a `dna.yaml` with no `paths:`, an `ElementRef` with `status`), not
  behaviour: a red fixture is cheaper to check by loading it once before asserting. Evidence: `af9a0b13`, `2b6669f1`.
- `tsc --noEmit -p tsconfig.json` caught a readonly cast in a refactor-only test that targeted jest runs accept.
