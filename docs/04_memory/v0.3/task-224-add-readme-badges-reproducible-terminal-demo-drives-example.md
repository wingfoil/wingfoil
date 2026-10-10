---
id: "task-224-add-readme-badges-reproducible-terminal-demo-drives-example"
type: task
title: "Add README badges and a reproducible terminal demo that drives an example"
status: in-progress
release: "v0.3"
kind: "feature"
priority: "low"
tags: ["v0.3", "process", "presentation", "docs"]
ref: "dl-128"
bug: []
depends_on: ["task-214-add-community-health-files-shaped-ingestion"]
tmpl_version: 260703
---

## Description

The README shows nothing of what WingFoil does. The demo is a self-check: if the tool changes, the example fails instead of the animation going stale.

## Acceptance Criteria

- (characterization) README badges: npm version, licence, Node floor, `publish.yml` status — each derived from the registry, `package.json` or the run.
- (characterization) a `.tape` next to `docs/examples/01-first-project/` drives its `run.sh`; the rendered GIF committed under `docs/assets/`; the recorder is not an npm dependency.
- (characterization) `user-docs.yaml` `produces:` gains the tape and rendering; `checks.post` covers them; version bumped.

## Implementation Notes

- **Size:** S · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-128 items 1–2 (Q1 (a) VHS, Q2 (a) committed, Q3 (a)).
- **Notes:** Proposal key: D34.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
