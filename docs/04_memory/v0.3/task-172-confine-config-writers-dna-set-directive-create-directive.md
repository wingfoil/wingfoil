---
id: "task-172-confine-config-writers-dna-set-directive-create-directive"
type: task
title: "Confine the config writers (`dna set`, `directive create`, `directive assign`, `init`)"
status: in-progress
release: "v0.3"
kind: "fix"
priority: "high"
tags: ["v0.3", "core", "security"]
ref: "spec-011"
bug: ["bug-121"]
depends_on: ["task-131-make-dirty-target-guard-refuse-path-cannot-inspect"]
tmpl_version: 260703
---

## Description

Confinement is wired only in `directive remove` and the transition verbs; `writeDocument` in `dna set` and `directive create`, `directive-assign.ts` and `storage/layout.ts` write through a symlinked config file to a target outside the root (`bug-121`). The existing `requireConfinedWriteTarget` is the fix; `init`'s scaffold case needs its ruling in design.

## Acceptance Criteria

- (red-first) each of the four writers, with its target symlinked outside the root, exits 1 before writing and leaves the outside file unchanged.
- (characterization) in-root writes are unchanged.

## Implementation Notes

- **Size:** S · **wave:** 2 · **kind:** fix (`dl-133` Q1 (b)).
- **Implements:** REQ-SEC-06; spec-011.
- **Features:** P2.1, P3.1, P3.2, P5.1.1.
- **Notes:** Proposal key: C12.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
