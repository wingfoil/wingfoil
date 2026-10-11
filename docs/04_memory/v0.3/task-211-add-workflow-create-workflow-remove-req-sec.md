---
id: "task-211-add-workflow-create-workflow-remove-req-sec"
type: task
title: "Add `workflow create` and `workflow remove`, with the REQ-SEC-07 referrer check"
status: in-progress
release: "v0.3"
kind: "feature"
priority: "medium"
tags: ["v0.3", "workflow", "cli", "security"]
ref: "spec-017"
bug: []
depends_on: ["task-129-refuse-operand-beyond-command-declares-exit-2-before", "task-194-check-workflows-against-memory-yaml-dna-yaml-state", "task-198-deduce-workflow-instances-phase-evidence-frontier-memory-head"]
tmpl_version: 260703
---

## Description

`create <name> (--kind main|sub | [--startable] [--includable]) [--element] [--description]` writes `.wingfoil/workflows/custom/<name>.yaml` (one phase `step-1`) and appends it to `workflows.yaml` in one `wf(workflow): create <name>` commit. `remove <ref>` refuses built-ins, workflows still included elsewhere (all referrers in `details`) and workflows with an open instance, otherwise deletes file and manifest line in one `wf(workflow): remove <name>` commit. Under `dl-066` option 1 no directive references a phase, so neither side checks the other.

## Acceptance Criteria

- (red-first) BDD P4.8 sc. 1–3 with the positional name: file under `custom/`, never `built-in/`; in-flight instances untouched; `workflow already exists: <name>` exit 1 and no overwrite (also when only the file exists on disk, `dl-086`); invalid name, `--kind` with a boolean, or neither → exit 2.
- (red-first) BDD P4.9 sc. 1–3 plus the new scenario: `built-in workflows cannot be removed`; `cannot remove '<name>': included by '<referrer>'`; `cannot remove '<name>': open instance <id>` (`CONFLICT`); a modified `workflows.yaml` is refused by the write guard.
- (red-first) The created file loads with zero diagnostics errors through task-136–task-194.
- (characterization) `dl-066` option 1 amendments: `P3.3-directive-remove.feature:9` drops "or workflow step"; REQ-SEC-07 names `roles.yaml` as the directive half's referrer source with phases covered through `role`; P4.19 sc. 2 reworded for v0.4; P4.8/P4.9 `--name` → positional and the P4.9 open-instance scenario; `06_features.md` P4.8 "interactive" marked post-v0.3 — each with a `doc-versioning` bump.
- (characterization) `dl-030` remainder (E sweep): the still-included refusal is asserted with a test citing `dl-030`, and the TSDoc in `src/core/directive-assign.ts` that says "P4.9's workflow half of clause (b) has no owner in v0.2" points at this command.

## Implementation Notes

- **Size:** M · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** spec-017 §7.7, §7.8, §10, §11; dl-066 option 1 (P3.3:9, REQ-SEC-07, P4.19 sc. 2 rescope); dl-030; REQ-SEC-07.
- **Features:** P4.8, P4.9.
- **Notes:** Proposal key: A15. the `wf(workflow): create|remove` scopes are declared non-Memory by task-126.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
