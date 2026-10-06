---
id: "task-201-add-claim-rerun-rereview-items-code-review-task"
type: task
title: "Add the claim re-run and re-review items to code-review and the task template"
status: in-progress
release: "v0.3"
kind: "feature"
priority: "medium"
tags: ["v0.3", "process", "directives", "review"]
ref: "dl-097"
bug: []
depends_on: ["task-191-add-absence-claim-falsifiability-clause-claim-evidence-reword"]
tmpl_version: 260703
---

## Description

Unverified claims and repeated reject classes reached review in v0.2. The reviewer's checklist gains both items; the task template names the per-item answer the implementer writes on a re-review. The dev-loop `checks.pre` entries are task-221.

## Acceptance Criteria

- (characterization) `code-review.md` gains (i) "re-run each state claim of the review-ready summary; every absence claim shows its positive case" (dl-097 (a)); (ii) the re-review procedure of dl-098 §1 (re-verify each previous `Reason:` item by command, then search the new pass for the same class; one line per item in the verdict's `Reason:`), reading the previous reason through `memory history` (dl-098 (a)).
- (characterization) `.wingfoil/memory/templates/task.md` Execution Notes placeholder names the required review-stage entry: one line per previous `Reason:` item with its command (dl-098 (b)); `tmpl_version` handled per the template convention.
- (characterization) `claim-evidence.md` states dl-098 §3 (the clause applies to every sentence written in response to a reject).

## Implementation Notes

- **Size:** S · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-097 (a) (directive half); dl-098 ((a)+(b), §3).
- **Features:** P3.5, P4.14.
- **Notes:** Proposal key: D06.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
