---
id: "task-191-add-absence-claim-falsifiability-clause-claim-evidence-reword"
type: task
title: "Add the absence-claim falsifiability clause to claim-evidence and reword the determinism directive to the I/P/O split"
status: in-progress
release: "v0.3"
kind: "feature"
priority: "medium"
tags: ["v0.3", "process", "directives"]
ref: "dl-097"
bug: []
depends_on: ["task-139-extend-documentation-doc-versioning-testing-directives-ratified-clauses", "task-141-reposition-brief-governance-layer-make-determinism-index-composite", "task-161-revise-command-baseline-which-verbs-read-head-filesystem"]
tmpl_version: 260703
---

## Description

`claim-evidence` gains `dl-097` §1's falsifiability clause for absence claims, and the `determinism` directive stops promising "substantially equivalent software" as an input guarantee, which `dl-131` retires. The audience, `spec-006` §6 and filesystem-effect revisions of the same directives (`dl-084`/`dl-085`/`dl-086`) are task-161's, which lands first.

## Acceptance Criteria

- (characterization) `claim-evidence.md` carries dl-097 §1's clause verbatim in *Absence and presence*.
- (characterization) `determinism.md`'s first rule is reworded to the I/P/O split of dl-131 Decision 3 (WingFoil guarantees I; P measured; O reported, never promised).

## Implementation Notes

- **Size:** S · **wave:** 2 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-097 §1; dl-131 Action 9 (directive half).
- **Features:** P3.5.
- **Notes:** Proposal key: D04. coordinate with domain C, which owns `dl-084`'s cli-reference/spec-008 fix of the same family. Reduced after dedupe: `dl-085`/`dl-086` (audience, normative `spec-006` §6, the filesystem-effect category, the TSDoc status words) are owned by task-161.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
