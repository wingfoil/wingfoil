---
id: "task-158-reconcile-adr-001-adr-010-node-22-floor"
type: task
title: "Reconcile adr-001 and adr-010 with the Node 22 floor"
status: in-progress
release: "v0.3"
kind: "fix"
priority: "low"
tags: ["v0.3", "process", "docs", "adr"]
ref: ""
bug: ["bug-054", "bug-069"]
depends_on: []
tmpl_version: 260703
---

## Description

adr-001 states "Node.js 18+ … per dna.yaml" in the present tense; adr-010's Consequences still say `@types/node` is pinned `^18`. Dated correction notes, not rewrites.

## Acceptance Criteria

- (characterization) `adr-001:32` gains a dated Correction note (dl-001 precedent) naming dna.yaml's 22.12+ and adr-010; `adr-010:195-196,236` gain a Revision note naming `^22.20.4` (`package.json:70`).
- (characterization) no status change; `grep -n "Node.js 18+\|still \`\^18\`"` hits only inside the correction notes.

## Implementation Notes

- **Size:** S · **wave:** 1 · **kind:** fix (`dl-133` Q1 (b)).
- **Implements:** .
- **Notes:** Proposal key: D30.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
