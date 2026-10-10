---
id: "task-227-link-added-element-workflow-step-memory-add-workflow"
type: task
title: "Link an added element to its workflow step with `memory add --workflow <ref> [--step <key>]`"
status: in-progress
release: "v0.3"
kind: "feature"
priority: "high"
tags: ["v0.3", "workflow", "memory", "cli"]
ref: "spec-017"
bug: []
depends_on: ["task-128-allocate-element-ids-highest-number-ref-across-folder", "task-163-implement-date-author-id-tokens-edit-frontmatter-through", "task-216-add-workflow-next-naming-next-step-verb-role"]
tmpl_version: 260703
---

## Description

The only way an element becomes "created by" a step is the pair of trailers on its add commit. `memory add` gains `--workflow <ref>` and `--step <key>`; `workflow next` already reports them filled on every `memory.add` action (task-216).

## Acceptance Criteria

- (red-first) With `--workflow`, the add commit carries `WingFoil-Instance: <id>` and `WingFoil-Step: <key>`, and the element appears in the step's `created` on the next deduction.
- (red-first) Without `--step`, the one frontier step adding `--type` is chosen; none → `no step of <instance> adds a <type>`; several → the same refusal listing the keys (`CONFLICT`, exit 1).
- (characterization) Without `--workflow`, `memory add`'s output and commit are byte-identical to before (existing suites unchanged).
- (characterization) `spec-008` gains both options in the `memory add` grammar, with a dated Revision note.

## Implementation Notes

- **Size:** S · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** spec-017 §7.10, §4.8 linkage; ruling R16; spec-008 amendment (`memory add --workflow`, `--step`).
- **Features:** P4.13, P4.11.
- **Notes:** Proposal key: A14.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
