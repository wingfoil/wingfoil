---
id: "task-193-keep-dna-yaml-comments-when-dna-set-dna"
type: task
title: "Keep `dna.yaml`'s comments when `dna set`/`dna add` cannot edit in place, or say they were lost"
status: in-progress
release: "v0.3"
kind: "fix"
priority: "medium"
tags: ["v0.3", "core", "dna"]
ref: "spec-002"
bug: ["bug-019", "bug-126"]
depends_on: ["task-169-make-directive-assign-refuse-whole-file-rewrite-unless"]
tmpl_version: 260703
---

## Description

The whole-file `dump()` fallback (`src/core/index.ts:386`) strips every comment and `[SPEC]`/`[AUTHORING]` provenance marker with no warning, for block scalars in `dna set` (`bug-019`) and for `dna add` into a collection the file does not declare yet (`insertMissingScalarPath` handles only `set-scalar`, `src/dna/edit.ts:433`; `bug-126`). v0.3's adapters need `team.agents` declared, which is exactly that path.

## Acceptance Criteria

- (red-first) `dna add team.agents …` on a `dna.yaml` with no `agents:` keeps every comment.
- (red-first) any remaining fallback prints a warning naming the file and that comments were not preserved (exit 0), on stderr and in the `--format json` warnings, through task-169's success-warning channel — or, if the approver rules for consistency with `dl-062` (backlog question Q10), is refused unless `--force`; the choice is recorded in Execution Notes and in the `dna set`/`dna add` cli-reference entries.
- (characterization) in-place edits are byte-identical outside the edited node.

## Implementation Notes

- **Size:** M · **wave:** 2 · **kind:** fix (`dl-133` Q1 (b)).
- **Implements:** spec-002; dl-081; dl-062 (same class of fallback, for `dna.yaml`).
- **Features:** P2.1.
- **Planning ruling:** Approver ruling 2026-09-30 (plan R20, Q9): same rule as `dl-062` — the whole-file rewrite is refused unless `--force`, and a forced rewrite prints a warning that comments were lost.
- **Notes:** Proposal key: C14.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
