---
id: "task-162-fire-supersedes-trigger-superseding-element-approval"
type: task
title: "Fire the `supersedes:` trigger on the superseding element's approval"
status: in-progress
release: "v0.3"
kind: "feature"
priority: "medium"
tags: ["v0.3", "core", "memory", "state-machine"]
ref: "dl-065"
bug: []
depends_on: ["task-126-declare-closed-wf-operation-grammar-bracket-set-state"]
tmpl_version: 260703
---

## Description

`superseded` is a `waiting` state that nothing reaches (`grep -rn supersedes src/` → TSDoc only), and `a7d783aa` moved `adr-005` there by hand under a `deprecate` subject. Ratified: when an element whose `supersedes:` names another is approved into its accepted/approved state, the named element moves `accepted/approved → superseded`. `superseded → deprecated` stays legal.

## Acceptance Criteria

- (red-first) approving `adr-B` (`supersedes: adr-A`, `adr-A` `accepted`) moves `adr-A` to `superseded`; the commit(s) follow the grammar chosen in design (one `approve` plus one declared trigger commit, or one commit naming both — stated in `spec-010` and task-126's verb list).
- (red-first) a `supersedes:` naming a missing id, another type, or an element not in accepted/approved is refused before any write, exit 1.
- (characterization) `spec-010`'s "deprecate-adjacent … superseded" row and `spec-004`'s "approver-gated" wording are corrected (Q2, Q3); the task records how `adr-005` is expressed now (no history rewrite, `dl-035`).

## Implementation Notes

- **Size:** M · **wave:** 1 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-065 Q1.1, Q2, Q3; spec-001/spec-010 (trigger); spec-010 row reworded; spec-004 wording.
- **Features:** P1.7, P1.13.
- **Notes:** Proposal key: C27.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
