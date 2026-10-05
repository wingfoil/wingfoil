---
id: "task-180-add-memory-park-declared-returns-edge-optional-per"
type: task
title: "Add `memory park`, a declared `returns` edge and optional per-state WIP limits"
status: backlog
release: "v0.3"
kind: "feature"
priority: "medium"
tags: ["v0.3", "core", "memory", "workflow-support"]
ref: "dl-110"
bug: ["bug-214"]
depends_on: ["task-126-declare-closed-wf-operation-grammar-bracket-set-state", "task-132-read-approver-identity-once-use-authority-check-approver"]
tmpl_version: 260703
---

## Description

No verb steps a started task back to the backlog, and no state can declare a WIP limit. Ratified: `returns: { in-progress: backlog }` next to `gates`/`waiting`, taken by `memory park <id> --reason` (`wf(<type>): park <id> [in-progress → backlog]`), and `limits: { in-progress: N }` enforced by the verb that enters the state. P2 (dev-loop worktree/branch/bug sync on park) is `dev-loop.yaml`'s, owned by the task implementing `dl-134`'s dev-loop rewrite (domain A).

## Acceptance Criteria

- (red-first) `memory park` on an `in-progress` task writes one commit with the subject above and a `Reason:`; on a state with no `returns` edge it exits 1; missing reason exits 2.
- (red-first) with `limits: {in-progress: 1}` and one task in progress, moving a second task into `in-progress` (by any verb, including A's `start` emitter through the shared primitive) exits 1 and names the holder.
- (red-first) the schema refuses a `returns` target that is not an earlier state of the sequence.
- (characterization) `.wingfoil/memory.yaml` `task` declares `returns`; the Kanban template's WIP sentence (`src/storage/templates.ts`, `KANBAN`) is made true with a declared limit or reworded.

## Implementation Notes

- **Size:** M · **wave:** 2 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-110 P1 (a); P3 (a), Actions 1 and 3; spec-001 (`returns`, `limits`); spec-008.
- **Features:** P1.13, P4.13.
- **Notes:** Proposal key: C26.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
