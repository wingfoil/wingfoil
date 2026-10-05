---
id: "task-160-add-openssf-scorecard-workflow-private-results"
type: task
title: "Add the OpenSSF Scorecard workflow with private results"
status: in-progress
release: "v0.3"
kind: "feature"
priority: "low"
tags: ["v0.3", "process", "trust", "ci"]
ref: "dl-129"
bug: []
depends_on: []
tmpl_version: 260703
---

## Description

Nothing outside the code shows the project is maintained and safe. Scorecard runs on push to `main` and weekly, results private for the first run.

## Acceptance Criteria

- (characterization) `.github/workflows/scorecard.yml`: official action pinned by SHA, `publish_results: false`, only the documented permissions; a test pins these.
- (characterization) the first run's scores recorded in Execution Notes; each low check listed for the approver's decision before Q1 (a) publication.

## Implementation Notes

- **Size:** S · **wave:** 1 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-129 §1 (Q1 (b) first run).
- **Notes:** Proposal key: D35.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
