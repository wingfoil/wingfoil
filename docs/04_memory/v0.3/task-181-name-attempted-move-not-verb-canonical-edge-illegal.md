---
id: "task-181-name-attempted-move-not-verb-canonical-edge-illegal"
type: task
title: "Name the attempted move, not the verb's canonical edge, in illegal-transition errors"
status: in-progress
release: "v0.3"
kind: "fix"
priority: "medium"
tags: ["v0.3", "core", "memory", "errors"]
ref: "dl-032"
bug: ["bug-165"]
depends_on: ["task-130-show-coreerror-details-surface-give-refusal-shape-under"]
tmpl_version: 260703
---

## Description

`contractTarget` (`src/memory/state-machine.ts`) prints the verb's canonical edge, so `approve` on a `planned` bug reads `planned -> triaged` (backward) and on `triaged` `triaged -> resolved` (skipping three states). `bug-127`'s cases (task end, gate `(none)`, custom machine) were folded into this bug.

## Acceptance Criteria

- (red-first) `approve` from a state with no approve edge prints `<to>` = `(none)` or the detail line "`approve` is not available from `planned` (a waiting state)" — choice in design, pinned in BDD P1.6 sc.2 and `spec-004` §4.3's example.
- (red-first) the four cases carried from `bug-127` each have a test.

## Implementation Notes

- **Size:** S · **wave:** 2 · **kind:** fix (`dl-133` Q1 (b)).
- **Implements:** dl-032; dl-053 revisit; REQ-STATE-01.
- **Features:** P1.6, P1.7, P1.8.
- **Notes:** Proposal key: C31.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
