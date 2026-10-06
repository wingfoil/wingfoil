---
id: "task-245-correct-x-cli-cmds-md-stale-claims-unify"
type: task
title: "Correct `X_cli-cmds.md`'s stale claims, unify positional notation and add every v0.3 command row"
status: backlog
release: "v0.3"
kind: "fix"
priority: "medium"
tags: ["v0.3", "process", "docs", "vision"]
ref: ""
bug: ["bug-099", "bug-100", "bug-274"]
depends_on: ["task-127-add-memory-amend-id-reason-approver-gated-verb", "task-138-dna-yaml-declares-team-agents-adapter-runs-paths", "task-169-make-directive-assign-refuse-whole-file-rewrite-unless", "task-180-add-memory-park-declared-returns-edge-optional-per", "task-204-reshape-workflow-list-add-workflow-show-both-answering", "task-210-add-dry-run-mutating-verb-through-commit-primitive", "task-211-add-workflow-create-workflow-remove-req-sec", "task-216-add-workflow-next-naming-next-step-verb-role", "task-217-add-workflow-start-workflow-end-recording-instance-plan", "task-220-wingfoil-agent-show-run-id-prints-recorded-run", "task-225-add-workflow-status-pending-approvals-role-routing-fallback", "task-226-add-workflow-finalize-which-records-checkpoint-or-uncarried", "task-227-link-added-element-workflow-step-memory-add-workflow", "task-228-agent-execute-launches-agent-forwards-right-signals-records", "task-235-agent-execute-next-workflow-ref-step-key-take", "task-240-wingfoil-agent-list-past-waiting-lists-recorded-runs"]
tmpl_version: 260703
---

## Description

The CLI vision reference declares sync against the retired `tech-stack` key, repeats false "interactive" claims, and mixes `<ANGLE>` and `[BRACKET]` positionals. It is edited once, after the v0.3 commands exist, so the workflow, agent and Memory rows are written in one notation matching the shipped grammar.

## Acceptance Criteria

- (characterization) `bug-099`: `grep -n "tech-stack\|interactive or flag-based" docs/01_vision/X_cli-cmds.md` → no hit (positive control at the base commit recorded); the `--dry-run` row is kept and now matches task-210's shipped global flag (`dl-106` W2, `spec-008` §2) instead of being deleted.
- (characterization) bug-100: every required positional is `<ANGLE>`; the pillar note at line ~251 removed; `grep -c "\[[a-z-]*-id\]"` → 0.
- (characterization) the nine `workflow` commands (spec-017) and `agent execute|list|show` (spec-016) rows match the approved specs' spelling; version bumped with a dated entry.
- (characterization) the P2.5 `paths` category list and the `--entry-<field>` list gain `runs` / `--entry-adapter` (task-138); `directive assign --force` (task-169) and `memory amend`/`memory park` (task-127, task-180) rows are present in the same notation.

## Implementation Notes

- **Size:** M · **wave:** 3 · **kind:** fix (`dl-133` Q1 (b)).
- **Implements:** plan Appendix C (`X_cli-cmds.md` amendment from spec-016 and spec-017); single owner of `X_cli-cmds.md` for v0.3.
- **Features:** P2.5, P4.2, P4.3, P4.4, P4.5, P4.6, P4.7, P4.8, P4.9, P5.3.1.
- **Notes:** Proposal key: D29. Single owner of `X_cli-cmds.md` in v0.3 (task-138, task-228 and the workflow tasks hand their rows here); runs late on purpose.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
