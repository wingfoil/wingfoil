---
id: "task-226-add-workflow-finalize-which-records-checkpoint-or-uncarried"
type: task
title: "Add `workflow finalize`, which records a checkpoint or an uncarried approval as a phase-record commit"
status: in-progress
release: "v0.3"
kind: "feature"
priority: "high"
tags: ["v0.3", "workflow", "cli", "approvals"]
ref: "spec-017"
bug: []
depends_on: ["task-126-declare-closed-wf-operation-grammar-bracket-set-state", "task-132-read-approver-identity-once-use-authority-check-approver", "task-192-stamp-wingfoil-commit-wingfoil-version-semver-sha-pin", "task-216-add-workflow-next-naming-next-step-verb-role"]
tmpl_version: 260703
---

## Description

28 phases on this repository complete only by a record (spec-017 §12). `finalize [<ref>] [--step <key>] [--reason]` writes one commit with no file change, subject `workflow: finalize <instance-id> <key>` (outside the `wf()` grammar) and the phase-record trailers; on an `approval:` phase it needs approver authority and a `dl-067`-shaped reason with `Approver:` / `Reason:` in the body.

## Acceptance Criteria

- (red-first) Finalizing a checkpoint step writes the trailers `WingFoil-Phase: <w>.<p> completed`, `WingFoil-Instance`, `WingFoil-Element`/`WingFoil-Item`, and the next deduction moves past the step; the output is the finalized step and the new next step.
- (red-first) Refusals: `step '<key>' is not on the frontier of <instance>` and `phase '<w>.<p>' completes from its evidence: <kinds>` (`CONFLICT`, exit 1); missing git identity (REQ-SEC-01).
- (red-first) On an approval phase: an identity without the `approver` role gets `memory approve`'s refusal; missing/blank/`Approver:`-leading reason → exit 2 with the `dl-067` messages; a valid one writes `Approver:` and `Reason:` exactly as `memory approve` does, with the identity read once (`bug-149`).
- (red-first) `memory history` does not report the finalize commit as a Memory operation.
- (characterization) The empty commit is written with `--allow-empty` through the storage commit helper with the pinned `--cleanup` mode (`bug-051`'s rule), and is refused on a dirty index rather than sweeping staged files (`dl-106`).

## Implementation Notes

- **Size:** M · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** spec-017 §7.9, §4.3 `record`, §5.1 (uncarried approvals), §5.4; ruling R11; dl-104 D1 (b)–(c); REQ-SEC-01; REQ-SEC-03; P1.7.
- **Features:** P4.13, P4.14.
- **Notes:** Proposal key: A13.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
