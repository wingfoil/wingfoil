---
id: "task-232-measure-build-test-coverage-example-latency-install-metrics"
type: task
title: "Measure the build, test, coverage, example, latency and install metrics"
status: backlog
release: "v0.3"
kind: "feature"
priority: "medium"
tags: ["v0.3", "process", "release-health", "scripts"]
ref: "dl-089"
bug: ["bug-329"]
depends_on: ["task-134-report-source-file-coverage-so-untested-file-counts", "task-222-declare-release-health-catalogue-v2-report-schema-release"]
tmpl_version: 260703
---

## Description

The quality half that runs the toolchain: build/typecheck/lint, tests, coverage (index files included), critical-module branch floor, `docs/examples` pass rate, CLI p95 on a 40-element fixture, the documented install command.

## Acceptance Criteria

- (red-first) each metric computed from the pipeline's pinned Node and `npm ci` in the throw-away worktree; unit cases with stubbed tool outputs pin the parsing (pass/fail/skip counts, coverage totals, p95).
- (characterization) Q04 reads per-file branch coverage of `memory/audit`, `memory/commit-message`, `memory/state-machine`; floor 90 %.
- (characterization) a metric whose tool fails records `not-measurable` with the reason, never a zero.

## Implementation Notes

- **Size:** M · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-089 §2 (Q01–Q04, Q11, Q12, Q17).
- **Features:** P4.1.
- **Notes:** Proposal key: D16.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
