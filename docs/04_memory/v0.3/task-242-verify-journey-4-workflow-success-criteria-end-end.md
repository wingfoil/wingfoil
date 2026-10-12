---
id: "task-242-verify-journey-4-workflow-success-criteria-end-end"
type: task
title: "Verify Journey 4 and the workflow success criteria end to end on a fresh project and on this repository"
status: backlog
release: "v0.3"
kind: "feature"
priority: "medium"
tags: ["v0.3", "workflow", "verification"]
ref: "spec-017"
bug: ["bug-327-no-bdd-scenario-covers-workflow-finalize-or-the-phase-record-it-writes", "bug-328-the-e2e-smoke-drives-no-workflow-start-end-finalize-or-status"]
depends_on: ["task-199-align-wingfoil-workflows-custom-v0-3-schema-commands", "task-205-rewrite-dev-loop-yaml-v1-5-red", "task-211-add-workflow-create-workflow-remove-req-sec", "task-217-add-workflow-start-workflow-end-recording-instance-plan", "task-226-add-workflow-finalize-which-records-checkpoint-or-uncarried", "task-227-link-added-element-workflow-step-memory-add-workflow", "task-235-agent-execute-next-workflow-ref-step-key-take", "task-239-serve-wingfoil-workflows-next-wingfoil-workflows-status-production"]
tmpl_version: 260703
---

## Description

A verification task: on a fresh `init` project, Morgan's Journey 4 (directives, a workflow started, a deliverable submitted, a "human needed" line, approval routed and given, `agent execute --next` launched on the step); on this repository, the nine commands against the committed configuration, including closing the hand-started `service-ingest-rel-v0.3-listings-plan` instance the way spec-017 §12 prescribes.

## Acceptance Criteria

- (characterization) A scripted run (a `docs/examples/` self-checking script, so it can join `e2e-smoke`) passes on a fresh project: `start → next → memory add --workflow → submit → status` (human-needed line) `→ approve → next → finalize → end`.
- (characterization) On this repository at the release candidate: `workflow list --all` and `workflow show` on every workflow report zero errors; `workflow status` output is recorded in Execution Notes.
- (characterization) Journey 4 steps checked by hand with the adapter of R17, each step's command and result recorded (minor-v0.3 "manually tested end-to-end").

- (red-first, `bug-327`; added 2026-10-12 at the approver's absorption of the inherited v0.3 bugs) P4.13's feature
  file gains a scenario in which a step completed only by a record is complete after `workflow finalize`, and one for
  the refusal of an off-frontier step (`spec-017` §10, "step not on the frontier"); P4.14 gains the uncarried-approval
  case only if the approver keeps it there (asked at design). The BDD acceptance run executes them.
- (characterization, `bug-328`; added 2026-10-12, same ruling) The scripted Journey 4 run above is hooked into the
  e2e smoke's fresh-project run, so the smoke starts a workflow, reads `workflow next` and `workflow status`, records a
  step with `workflow finalize`, and ends the instance with `workflow end`, each checked for its exit code and its
  `wf()` commit.

## Implementation Notes

- **Size:** S · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** minor-v0.3 Success Criteria (workflow commands functional; `workflow next` names verb/role/element; approval routing; CLI notifications; zero-error load); spec-017 §12.
- **Features:** P4.2, P4.3, P4.4, P4.5, P4.6, P4.7, P4.8, P4.9, P4.14, P4.15, X1.1.
- **Notes:** Proposal key: A22. may be folded into the v0.3 `e2e-smoke` phase if the approver prefers; listed here so the success criterion has an owner.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

- **Handover from the approver's absorption of the inherited v0.3 bugs (2026-10-12,
  `bug-ingest-rel-v0.3-w3b6-review-findings-plan`).** This task absorbs `bug-327` (no BDD scenario covers `workflow
  finalize` or the phase record it writes; `task-226`'s review F5) and `bug-328` (the e2e smoke drives no `workflow
  start`/`end`/`finalize`/`status`); the two criteria marked 2026-10-12 above are theirs. Order inside B8: `task-282`
  (Fix B) edits `scripts/e2e-smoke.cjs` first; hook this task's script after merging its branch.

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
