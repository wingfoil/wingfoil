---
id: "task-189-cover-or-remove-untested-paths-src-core-index"
type: task
title: "Cover or remove the untested paths of `src/core/index.ts`"
status: in-progress
release: "v0.3"
kind: "fix"
priority: "low"
tags: ["v0.3", "core", "tests", "coverage"]
ref: ""
bug: ["bug-161"]
depends_on: ["task-132-read-approver-identity-once-use-authority-check-approver", "task-134-report-source-file-coverage-so-untested-file-counts"]
tmpl_version: 260703
---

## Description

`src/core/index.ts` has 8 statements and 14 branch arms no test reaches (`bug-161`, measured at `68f64091`). Measured again after task-132's preamble refactor moves them.

## Acceptance Criteria

- (red-first) each reachable arm gets a test; each unreachable one is removed or carries an ignore comment stating why; the task lists the before/after counts with the command.

## Implementation Notes

- **Size:** S · **wave:** 2 · **kind:** fix (`dl-133` Q1 (b)).
- **Implements:** coverage gate.
- **Notes:** Proposal key: C44.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
