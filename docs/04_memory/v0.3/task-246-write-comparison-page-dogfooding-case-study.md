---
id: "task-246-write-comparison-page-dogfooding-case-study"
type: task
title: "Write the comparison page and the dogfooding case study"
status: in-progress
release: "v0.3"
kind: "feature"
priority: "low"
tags: ["v0.3", "process", "presentation", "docs"]
ref: "dl-128"
bug: []
depends_on: ["task-141-reposition-brief-governance-layer-make-determinism-index-composite", "task-234-publish-documentation-site-api-reference-llms-txt-index", "task-241-compare-runs-write-proposals-backfill"]
tmpl_version: 260703
---

## Description

Places WingFoil beside the tools dl-112 names and shows how WingFoil develops itself.

## Acceptance Criteria

- (characterization) `docs/comparison.md` from dl-112's ratified position; every fact about another tool carries its source and date read; content integrated, not linked (D2).
- (characterization) `docs/case-study.md` with figures from the committed release-health reports (task-241), each with its definition and measurement point.
- (characterization) both in `user-docs.yaml` `produces:`; version bumped.

## Implementation Notes

- **Size:** M · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-128 items 3–4 (Q3 (a) order).
- **Notes:** Proposal key: D37.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
