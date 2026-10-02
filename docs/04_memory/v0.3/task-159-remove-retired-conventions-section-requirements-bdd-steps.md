---
id: "task-159-remove-retired-conventions-section-requirements-bdd-steps"
type: task
title: "Remove the retired `conventions` section from requirements, BDD steps and the v0.1 backlog JSON"
status: in-progress
release: "v0.3"
kind: "fix"
priority: "low"
tags: ["v0.3", "process", "docs", "requirements"]
ref: ""
bug: ["bug-105", "bug-106", "bug-107"]
depends_on: []
tmpl_version: 260703
---

## Description

`conventions` survives in US-0A narrative, three P2 features and two BDD steps that would fail once a BDD runner exists; the v0.1 backlog JSON quotes moved scenarios with no sign it is frozen.

## Acceptance Criteria

- (characterization) bug-105: `01_init-migrate.md:23,33,92,99`, `P2.1…:2`, `P2.3…:3`, `P2.4…:2` no longer name `conventions` as a DNA section (US first, then BDD, per the chain).
- (characterization) bug-106: `P2.4…:11` and `P2.2…:9` steps assert sections the schema has; the `tech_stack` alias at `P2.2:13-14` left alone.
- (characterization) bug-107: `backlog.json` (or its directory) carries a header stating it is a frozen v0.1 archive; its content is not rewritten.

## Implementation Notes

- **Size:** S · **wave:** 1 · **kind:** fix (`dl-133` Q1 (b)).
- **Implements:** .
- **Features:** P2.1, P2.2, P2.3, P2.4.
- **Notes:** Proposal key: D31. coordinate with the DNA domain if it also edits P2 features.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
