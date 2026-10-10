---
id: "task-241-compare-runs-write-proposals-backfill"
type: task
title: "Compare runs, write proposals and backfill the v0.1 and v0.2 baselines"
status: backlog
release: "v0.3"
kind: "feature"
priority: "medium"
tags: ["v0.3", "process", "release-health", "scripts"]
ref: "dl-089"
bug: []
depends_on: ["task-231-measure-git-history-process-conformance-external-metrics", "task-232-measure-build-test-coverage-example-latency-install-metrics", "task-233-measure-static-memory-metrics-including-fix-share"]
tmpl_version: 260703
---

## Description

`compare.cjs` classifies every metric against the previous run (re-measuring like-for-like across catalogue versions), evaluates floors, settles the previous proposals and writes `RH-<version>-NN` proposals for untracked findings; the two baselines are produced so v0.3 compares against two real runs.

## Acceptance Criteria

- (red-first) improved/stable/regressed/new/not-comparable with dl-089's tolerances; a cross-version comparison re-measures the previous point; three-run trend shown; unit-tested.
- (red-first) `propose` searches Memory for a tracking element before proposing; G07/G10/G14 and Q01/Q02-at-tag breaches are flagged for immediate `bug-ingest` (§5).
- (characterization) v0.1 measured at `5b16ab61`, v0.2 at `v0.2.1`; both reports committed under `docs/08_health/` (`paths.health`); the provisional v0.2 table in dl-089 §7 is compared and differences explained.

## Implementation Notes

- **Size:** M · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-089 §3, §4, §5, §7.
- **Features:** P4.1.
- **Notes:** Proposal key: D18.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
