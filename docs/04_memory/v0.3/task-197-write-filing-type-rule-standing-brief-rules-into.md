---
id: "task-197-write-filing-type-rule-standing-brief-rules-into"
type: task
title: "Write the filing-type rule and the standing brief's rules into the traceability directive"
status: in-progress
release: "v0.3"
kind: "feature"
priority: "medium"
tags: ["v0.3", "process", "directives", "traceability"]
ref: "dl-118"
bug: ["bug-186"]
depends_on: ["task-178-add-git-conventions-directive-id-allocation-hand-rule"]
tmpl_version: 260703
---

## Description

No rule chooses between bug, decision-log and directive change, and the rules task agents received in a standing brief live outside the repository. Both are traceability text. (`bug-166`, the `service` `release` field, is task-170's.)

## Acceptance Criteria

- (characterization) `traceability.md` gains dl-118 rules 1–3 with the `dl-060` example, citing `dl-118`; `bug-ingest.yaml` and `decision-log-ingest.yaml` `capture` descriptions each point at the rule (dl-118 (B)); versions bumped.
- (characterization) dl-102 §1 (a): every standing rule the v0.2/v0.2.2 dev-loop phase plans gave task agents is listed in Execution Notes with its source (plan path + heading) and its landing place: element filing → `traceability.md`; id allocation → `git-conventions.md` (`dl-101` §1, task-178); branch, worktree, merge → `git-conventions.md` (task-178). A rule left task-specific says why. The approver confirms the list at review.
- (characterization) dl-102 §3: `traceability.md` states that the orchestrating session writes out-of-band task criteria as `tech-lead` and backlog criteria as `product-owner`; no new role.

## Implementation Notes

- **Size:** S · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-118 ((B)); dl-102 (§1 (a), §3).
- **Features:** P3.5.
- **Notes:** Proposal key: D03. dl-102 §2 (build-backlog `checks.post`) is task-230; §4 (design check) is task-221.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
