---
id: "task-234-publish-documentation-site-api-reference-llms-txt-index"
type: task
title: "Publish a documentation site with the API reference and an llms.txt index"
status: in-progress
release: "v0.3"
kind: "feature"
priority: "low"
tags: ["v0.3", "process", "trust", "docs", "ci"]
ref: "dl-129"
bug: []
depends_on: ["task-224-add-readme-badges-reproducible-terminal-demo-drives-example"]
tmpl_version: 260703
---

## Description

A site built from the Markdown `user-docs` already owns plus TypeDoc output, and an agent-facing index that a parity test keeps true.

## Acceptance Criteria

- (characterization) a Pages workflow assembles the user-docs Markdown and `npm run docs:api` output into one artefact; no new dependency.
- (red-first) `llms.txt` generated from a declared list at the site root and repository root; a test fails if a listed path does not exist (dl-116 shape).
- (characterization) `package.json` `homepage` set to the site URL; `user-docs.yaml` `produces:` gains `llms.txt` and the site sources; version bumped.
- (characterization) post-merge, approver: Pages enabled and repository homepage set, each recorded as a `service`.

## Implementation Notes

- **Size:** M · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-129 §2 (Q2 (b)), §3 (Q3 (b)).
- **Notes:** Proposal key: D36.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
