---
id: "task-221-declare-v0-3-dev-loop-gates-revision-dev"
type: task
title: "Declare the v0.3 dev-loop gates in one revision of dev-loop.yaml"
status: in-progress
release: "v0.3"
kind: "feature"
priority: "medium"
tags: ["v0.3", "process", "workflow-config", "dev-loop"]
ref: "dl-097"
bug: []
depends_on: ["task-150-declare-task-kind-stop-line-threshold", "task-173-add-whole-project-typecheck-clean-gate-control-character", "task-201-add-claim-rerun-rereview-items-code-review-task", "task-205-rewrite-dev-loop-yaml-v1-5-red", "task-213-write-retrospective-notes-during-release-templates-retrospective-workflow"]
tmpl_version: 260703
---

## Description

Seven ratified decisions each add a check to `dev-loop.yaml`. One revision (v1.6) declares them all, so the file changes once after `dl-134`'s rewrite and the v0.3 dev-loop plan is updated in the same change (the `dl-034` lesson: agents execute the plan, not the YAML).

## Acceptance Criteria

- (characterization) `design` declares the criterion-vs-directives/specs check (dl-102 §4); `refactor.checks.post` gains `typecheck.clean` (dl-044), bound in `bindings.yaml` to task-173's `npm run typecheck`; `review.checks.pre` gains the claim re-run check (dl-097 (a)), the re-review check (dl-098) and names the document-parity suites (dl-116); `done.checks.post` gains the `### Retrospective` existence check (dl-115 Q2 (a)); `start.checks.pre` gains the stop-the-line check: no feature task is picked up while open fix tasks exceed 30 % of the release's open tasks (dl-133 Q3 (a), Q4 (i)).
- (characterization) `workflow show dev-loop` (v0.3 build) shows each new check with its binding or as an unbound warning, zero errors; the warnings are listed in Execution Notes.
- (characterization) the active v0.3 dev-loop phase plan states the same gates in the same change.

## Implementation Notes

- **Size:** S · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-097 (a) `review` checks.pre; dl-098 Action 2; dl-102 §4; dl-044 (`refactor.checks.post` declaration; the gate is task-173); dl-115 Q2 (a); dl-116 Action 4; dl-133 §3 Q4 (i).
- **Features:** P4.1, P4.12 (declared only).
- **Notes:** Proposal key: D08. Single owner of the dev-loop `start` stop-the-line check (`dl-133` Q4 (i)); task-205 (v1.5) lands first.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.
- **Handover from wave 1 B3 (2026-10-02, `task-150`).** Read the threshold from `.wingfoil/memory.yaml` `task.stop_the_line` (`max_share: 30`, `open: "status != done"`, `blocks: feature`, `at: "dev-loop start"`) rather than restating 30 percent. The approver ruled `dl-133` option (a) on 2026-10-02: the threshold applies as ratified, counting every open task of the release, so fixes are taken first until the share falls under it. Decide in design whether `deprecated` (and `draft`/`pending`) tasks count as open: as written they do.

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
