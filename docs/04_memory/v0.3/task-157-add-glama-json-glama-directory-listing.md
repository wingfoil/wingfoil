---
id: "task-157-add-glama-json-glama-directory-listing"
type: task
title: "Add glama.json for the Glama directory listing"
status: in-progress
release: "v0.3"
kind: "feature"
priority: "low"
tags: ["v0.3", "process", "visibility", "mcp"]
ref: "dl-093"
bug: []
depends_on: []
tmpl_version: 260703
---

## Description

R7 moved `glama.json` to v0.3. A root file lets the maintainer claim the Glama listing.

## Acceptance Criteria

- (characterization) `glama.json` at the root is valid against the schema its `$schema` names (source URL and date read in Execution Notes), with `maintainers` naming the approver's GitHub account.
- (characterization) absent from the tarball: `npm publish --dry-run` file list unchanged against the base (`files` is `["dist","README.md"]`).
- (characterization) post-merge, approver: the approver claims the Glama listing; recorded as a `service` (`kind: listing`).

## Implementation Notes

- **Size:** S · **wave:** 1 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-093 (plan R7).
- **Features:** P5.2.1.
- **Notes:** Proposal key: D26. **`smithery.yaml`: recommend out of scope for v0.3** — no ratified decision names it, and the directory claims of retro-v0.2 §6.7 are approver external steps; re-enter through a DL if wanted.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
