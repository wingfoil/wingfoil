---
id: "task-164-file-new-release-under-folder-siblings-use"
type: task
title: "File a new release under the folder its siblings use"
status: in-progress
release: "v0.3"
kind: "fix"
priority: "low"
tags: ["v0.3", "core", "memory", "config"]
ref: "spec-001"
bug: ["bug-163"]
depends_on: ["task-128-allocate-element-ids-highest-number-ref-across-folder"]
tmpl_version: 260703
---

## Description

`release`'s path is `planning/{release-line}/{id}.md` filled from the field, but every release sits under `planning/rl-v1/` while carrying `release-line: "v1"` (6 of 6), so no value puts a new release next to its siblings (`bug-163`).

## Acceptance Criteria

- (red-first) `memory add --type release --set release-line=v1 …` writes under `planning/rl-v1/` (path pattern resolved from the release-line id), and the field keeps `v1`.
- (characterization) existing releases are untouched; `.wingfoil/memory.yaml` version bumped.

## Implementation Notes

- **Size:** S · **wave:** 1 · **kind:** fix (`dl-133` Q1 (b)).
- **Implements:** spec-001 path tokens.
- **Features:** P1.11.
- **Notes:** Proposal key: C30.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
