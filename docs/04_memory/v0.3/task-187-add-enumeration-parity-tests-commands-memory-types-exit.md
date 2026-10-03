---
id: "task-187-add-enumeration-parity-tests-commands-memory-types-exit"
type: task
title: "Add enumeration parity tests for commands, Memory types, exit codes and MCP surfaces"
status: backlog
release: "v0.3"
kind: "feature"
priority: "medium"
tags: ["v0.3", "process", "docs", "testing", "parity"]
ref: "dl-116"
bug: ["bug-206"]
depends_on: ["task-151-check-backticked-name-specs-adrs-requirements-resolves-head"]
tmpl_version: 260703
---

## Description

One test per enumeration a document restates, modelled on `cli-reference.test.ts`.

## Acceptance Criteria

- (red-first) one test each under `test/docs/`: spec-005/spec-008 command list vs `CORE_MODULES`; spec-001 types/states vs `memory.yaml`; spec-008 §5 / spec-009 §3 exit codes vs `src/core`; spec-004 §4 MCP Tools and §2.1 Resources vs the registered set; each fails on a fixture drift.
- (characterization) warn mode for v0.3 like task-151; findings counted.

## Implementation Notes

- **Size:** M · **wave:** 2 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-116 Q1 (A).
- **Notes:** Proposal key: D39. the agent-guide enumeration (dl-116 names it) is left to `align-agent-docs`.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
