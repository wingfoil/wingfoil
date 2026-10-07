---
id: "task-213-write-retrospective-notes-during-release-templates-retrospective-workflow"
type: task
title: "Write retrospective notes during the release: templates and retrospective workflow"
status: in-progress
release: "v0.3"
kind: "feature"
priority: "medium"
tags: ["v0.3", "process", "workflow-config", "retrospective"]
ref: "dl-115"
bug: []
depends_on: ["task-199-align-wingfoil-workflows-custom-v0-3-schema-commands"]
tmpl_version: 260703
---

## Description

Retrospective input is reconstructed after the release. The task, bug and plan templates gain a `### Retrospective` subsection; `retrospective.yaml` lists every secondary source and gives every proposal a disposition before its gate. The `done` existence check is task-221.

## Acceptance Criteria

- (characterization) `task.md`, `bug.md`, `plan.md` templates end `## Execution Notes` (or the equivalent closing section) with `### Retrospective`, one line per item, "None" valid.
- (characterization) `retrospective.yaml` `explore` lists its secondary sources; `additional-points` gains a `checks.pre` that every proposal has one of dl-115's four outcomes; version bumped; loads with zero errors.
- (characterization) `memory add --type task` (worktree build) on a scratch repo scaffolds the new subsection (template copied verbatim).

## Implementation Notes

- **Size:** S · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-115 (Q1 (A), Q3 (x)).
- **Features:** P4.1.
- **Notes:** Proposal key: D07.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.
- **Handover from `dl-163` (2026-10-07, approver; `dl-115` amended the same day).** The `additional-points` check this task adds accepts six outcomes for a consumer feedback note: `dl-115`'s four plus `declined` and `needs-info`. A later task (dl-163 S3d, batch B5) adds the `collect-feedback` phase to `retrospective.yaml` after this task and `task-222`; keep the check written so that phase's notes can be listed as a secondary source of `explore`.

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
