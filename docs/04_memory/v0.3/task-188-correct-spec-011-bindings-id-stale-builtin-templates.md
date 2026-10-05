---
id: "task-188-correct-spec-011-bindings-id-stale-builtin-templates"
type: task
title: "Correct `spec-011` (bindings by id) and every stale \"built-in templates not yet implemented\" text"
status: in-progress
release: "v0.3"
kind: "fix"
priority: "low"
tags: ["v0.3", "core", "docs", "directives"]
ref: "dl-060"
bug: ["bug-040", "bug-191", "bug-213"]
depends_on: ["task-153-reconcile-req-state-08-p1-13-scenario-memory"]
tmpl_version: 260703
---

## Description

`spec-011` says `roles.yaml` binds by directive name (`:113,:126`), the code binds by id (`dl-060`). `.wingfoil/roles.yaml:3`, the six stand-ins' line 15, `spec-011:45-46,122` and `src/core/builtin-asset.ts:8` still say the P3.8 built-ins are not implemented (`bug-040`). One edit of `spec-011`, after task-153's row fix.

## Acceptance Criteria

- (characterization) `grep -rn "not yet implemented" .wingfoil src docs/04_memory/design/specs` finds none of the listed sites; `spec-011` says "id" with a Revision note; config files version-bumped.
- (characterization) the positive control is recorded: the same grep at the task's base commit hits each listed site; `src/core/builtin-asset.ts`'s "empty today" is corrected; the stand-in reconciliation itself is stated as out of scope in the stand-ins' text (from proposal D05).

## Implementation Notes

- **Size:** S · **wave:** 2 · **kind:** fix (`dl-133` Q1 (b)).
- **Implements:** dl-060; spec-011.
- **Features:** P3.7, P3.8.
- **Notes:** Proposal key: C37 (merged: D05). Merged with proposal D05 (same `dl-060`/`bug-040` change). Runs after task-153 because both edit the same `spec-011` passage; task-196 extends `spec-011`'s layout after this task.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.
- **Handover from wave 1 B3 (2026-10-02, `task-169`'s independent review).** `dl-062`'s approve Reason (`4cd18767`) keeps the Action "the write contract into spec-011, merged with dl-060's and bug-040's corrections": a `roles.yaml` write-contract subsection in `spec-011`. This task edits `spec-011` for `dl-060` and `bug-040`, so it carries that subsection too. `task-169` shipped the behaviour it describes: `directive assign` refuses the whole-file rewrite unless `--force`.

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
