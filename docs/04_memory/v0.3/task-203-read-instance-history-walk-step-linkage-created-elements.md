---
id: "task-203-read-instance-history-walk-step-linkage-created-elements"
type: task
title: "Read the instance history walk: step linkage, created elements, self-creating workflows and re-entry after reject or park"
status: in-progress
release: "v0.3"
kind: "feature"
priority: "high"
tags: ["v0.3", "workflow", "deduction", "git"]
ref: "spec-017"
bug: []
depends_on: ["task-142-run-memory-git-read-through-helper-captures-stderr", "task-198-deduce-workflow-instances-phase-evidence-frontier-memory-head"]
tmpl_version: 260703
---

## Description

The bounded walk (commits reachable from `HEAD` and not from the start commit's parents) finds the `WingFoil-Instance` / `WingFoil-Step` linkage on add commits, which makes an element "created by" a step, binds a self-creating workflow's element (the four ingest mains, `sw-life-cycle`), and finds re-entries (`wf(<type>): reject|park <ids> [<from> → <to>]`) after which evidence from the `fallback.step` onward must be newer. One `git log` over the union of walks keeps REQ-PERF-03.

## Acceptance Criteria

- (red-first) A `bug-ingest` instance with no linked add reports `element: null` and frontier `bug-ingest.capture`; after an add commit carrying its trailers the bug is bound and `capture` completes from `created` evidence; a second linked bug is listed in `Instance.created` and does not rebind (§3.4).
- (red-first) After `wf(task): reject task-X [in-review → in-progress]` in a `dev-loop` pass, `start` and `design` stay complete, `red` needs a new record and `review` a new `submit` (§4.8 example); the same for a `park` subject.
- (red-first) A record, linkage or reject older than the start commit does not count.
- (red-first) REQ-SYS-03 / REQ-STATE-02 descriptions in the SARD read "from Memory files and the commit history reachable from the commit" (spec-017 Consequences), with a `doc-versioning` bump; a test recomputes the deduction at a fixed commit twice and gets the same answer.
- (characterization) The walk calls `git` once per invocation for the union of walks plus one lookup per re-entered element (a spy-based test counts spawns), and uses the shared git helper that captures stderr (`bug-093`'s task, if merged; otherwise `stdio` is set explicitly).

## Implementation Notes

- **Size:** M · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** spec-017 §3.4 "Self-creating", §4.3 `created`, §4.8 (linkage, re-entries, cost), §5.2 re-entry; dl-104 D1 (b).
- **Features:** P4.13, P4.15.
- **Notes:** Proposal key: A07. pairs with `bug-072` (maxBuffer on `walkGitLogFields`) if the walk reuses that function — depend on that task if so, decided at design.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.
- **Handover from wave 3 B2 (2026-10-07, `task-198`).** `readRecords` (`src/core/workflow-deduction.ts`) runs one `rev-list` per distinct start once any record exists; §4.8 asks for one walk over the union of instances — replace it here. No linkage is read yet, so every step has created nothing: a `created` phase completes by its other evidence or a record.

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
