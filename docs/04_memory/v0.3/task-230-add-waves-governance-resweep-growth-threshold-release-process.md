---
id: "task-230-add-waves-governance-resweep-growth-threshold-release-process"
type: task
title: "Add waves, the governance re-sweep and the growth threshold to the release process"
status: backlog
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

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
