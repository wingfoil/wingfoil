---
id: "task-215-directives-list-role-sweep-over-dna-role-fails"
type: task
title: "A `directives list --role` sweep over every DNA role fails on any resolution warning (dl-050 option 1)"
status: in-progress
release: "v0.3"
kind: "feature"
priority: "low"
tags: ["v0.3", "agent", "directives", "governance", "workflow-config"]
ref: "dl-050"
bug: []
depends_on: ["task-199-align-wingfoil-workflows-custom-v0-3-schema-commands"]
tmpl_version: 260703
---

## Description

`dl-050` was ratified with options 1 and 4 (`ec0de106`). Option 4 is task-218. Option 1 gives the directive-resolution warnings a reviewable home. The config sweep (release-planning `reconcile-governance`, and `dev-loop` design if the approver prefers) runs `wingfoil directives list --role <r>` for every `team.roles` name and fails on any warning. The ratified text does not say whether that means a declared `checks:` entry or an npm script the sweep names. The task picks one at design and records why.

## Acceptance Criteria

- (red-first) A repository script (e.g. `npm run check:role-directives`) exits 1 when any role's `directives list --role <r> --format json` carries a non-empty `warnings`, and exits 0 on this repository today. Both paths are tested on a fixture with a dangling binding.
- (characterization) `release-planning.yaml` `reconcile-governance` declares the check (with a `doc-versioning` bump), in the token grammar that `dl-090` / `spec-003` define.

## Implementation Notes

- **Size:** S · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-050 option 1.
- **Features:** P3.6, P5.4.2.
- **Notes:** Proposal key: B17. **may be merged into the workflow-alignment task (idea 7)** by the consolidator, because both edit `release-planning.yaml`. Kept separate from task-199 (the workflow-alignment task) so the script can be reviewed on its own; it lands after task-199 on the same `release-planning.yaml`.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
