---
id: "task-154-give-latency-budgets-statistical-shape-guard-says-what"
type: task
title: "Give the latency budgets one statistical shape and a guard that says what it enforces"
status: in-progress
release: "v0.3"
kind: "fix"
priority: "low"
tags: ["v0.3", "core", "tests", "performance"]
ref: ""
bug: ["bug-012", "bug-013", "bug-014"]
depends_on: []
tmpl_version: 260703
---

## Description

REQ-PERF-04's MCP budget is one `performance.now()` sample (`test/mcp/server.test.ts:104-108`; `bug-012`); REQ-PERF-02's fit criterion names the commands but nothing times `memory search` end to end since `task-067` (`bug-013`); the latency-placement guard claims more than its same-file textual scan enforces (`bug-014`).

## Acceptance Criteria

- (red-first) the MCP budget is p95 over N runs (the `RUNS`/`p95()` convention of `test/core/query-latency.test.ts`).
- (red-first) `memory search`, `dna show`, `memory history` each have a command-level p95 measured as marginal cost over a measured process-start floor, under a documented exemption in the placement guard; or, if the approver prefers rewording REQ-PERF-02, the task stops and a decision-log is filed (the bug's option 2 needs one).
- (characterization) the guard's module doc states the same-file textual invariant it enforces, and its failure message names the remedy.

## Implementation Notes

- **Size:** S · **wave:** 1 · **kind:** fix (`dl-133` Q1 (b)).
- **Implements:** REQ-PERF-02; REQ-PERF-04.
- **Features:** P1.5, P5.2.1.
- **Notes:** Proposal key: C41.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
