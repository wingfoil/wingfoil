---
id: "task-183-gate-four-versioned-config-files-version-bump-pending"
type: task
title: "Gate the four versioned config files on a `version:` bump in the pending change"
status: in-progress
release: "v0.3"
kind: "fix"
priority: "medium"
tags: ["v0.3", "core", "directives", "gates"]
ref: "dl-047"
bug: ["bug-143"]
depends_on: ["task-139-extend-documentation-doc-versioning-testing-directives-ratified-clauses"]
tmpl_version: 260703
---

## Description

Nine v0.2-era content commits to `dna.yaml`/`memory.yaml`/`workflows.yaml` left `version:` unchanged and nothing checks it (`bug-143`). Once task-139 has scoped `doc-versioning` to documents that carry a `version:` (dl-047 option 1), a `test/lint/` check enforces the bump on the four versioned config files (`dna.yaml`, `memory.yaml`, `workflows.yaml`, `roles.yaml`) for the pending change.

## Acceptance Criteria

- (red-first) a `test/lint/` check fails when the working tree changes one of the four files (`dna.yaml`, `memory.yaml`, `workflows.yaml`, `roles.yaml`)' content relative to `HEAD` without changing `version:` (a check on the pending change, so it runs in every dev-loop refactor; history is not re-judged).

## Implementation Notes

- **Size:** S · **wave:** 2 · **kind:** fix (`dl-133` Q1 (b)).
- **Implements:** dl-047 option 1 (the check half; the directive text is task-139); doc-versioning.
- **Notes:** Proposal key: C39. The directive wording (dl-047 V1) is task-139's; task-208's governance CI runs the suite, so the check is also enforced on push. `bug-143` is owned here only.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
