---
id: "task-153-reconcile-req-state-08-p1-13-scenario-memory"
type: task
title: "Reconcile REQ-STATE-08, the P1.13 scenario and `memory.yaml`'s annotations with `spec-001`, and ship the commented per-type example"
status: in-progress
release: "v0.3"
kind: "fix"
priority: "low"
tags: ["v0.3", "core", "docs", "memory", "init"]
ref: "dl-072"
bug: ["bug-052", "bug-053", "bug-177", "bug-196"]
depends_on: []
tmpl_version: 260703
---

## Description

REQ-STATE-08 (`03_state-context.md:96`), `P1.13-memory-element-schema.feature:17` and `.wingfoil/memory.yaml:56` still name the retired `approved/rejected` default (`bug-052`); `spec-011`'s `memory.yaml` row and `memory.yaml:14,72` still say `values/initial/transitions` (`bug-053`). `dl-072` ratifies the shipped shared `defaults` machine and adds a commented `states:` example on `bug` in the scaffold (S1).

## Acceptance Criteria

- (characterization) the SARD is edited first, then the BDD, then the `[SPEC]` annotations (field provenance rule); `memory.yaml` `version:` bumped.
- (red-first) `wingfoil init`'s `memory.yaml` carries a commented `states:` example on `bug` that, uncommented, loads without error (test).

## Implementation Notes

- **Size:** S · **wave:** 1 · **kind:** fix (`dl-133` Q1 (b)).
- **Implements:** dl-072 (A)+S1+S3/S4; spec-001.
- **Features:** P1.13, P5.1.1.
- **Notes:** Proposal key: C36.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
