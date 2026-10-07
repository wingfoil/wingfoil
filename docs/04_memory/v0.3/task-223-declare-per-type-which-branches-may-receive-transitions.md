---
id: "task-223-declare-per-type-which-branches-may-receive-transitions"
type: task
title: "Declare per type which branches may receive its transitions, and refuse elsewhere"
status: backlog
release: "v0.3"
kind: "feature"
priority: "low"
tags: ["v0.3", "core", "memory", "git"]
ref: "dl-106"
bug: []
depends_on: ["task-210-add-dry-run-mutating-verb-through-commit-primitive"]
tmpl_version: 260703
---

## Description

Branch conventions (`task` transitions on `task/*`, `dl-014` G1; releases on `main`, `dl-024`) are written down only. Ratified W3 (b): `memory.yaml` declares branch patterns per type and the verb refuses on other branches.

## Acceptance Criteria

- (red-first) with `branches: ["task/*"]` on `task`, `memory approve` on `main` exits 1 naming the pattern; on `task/x` it succeeds; a type with no declaration is unrestricted.
- (red-first) a detached HEAD is refused for a restricted type.
- (characterization) `spec-001` carries the key; this repository's `memory.yaml` declares the practised patterns only if the approver confirms them in design (version bump).

## Implementation Notes

- **Size:** M · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-106 W3 (b), Action 2 (spec-001).
- **Features:** P1.13.
- **Notes:** Proposal key: C25.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.
- **Handover from the parallel-release-lines decision (2026-10-07):** `dl-159` (`in-discussion`, to be ratified before the
  `v0.3.0` tag) opens `release/X.Y` maintenance lines beside `main`: patches land on `release/X.Y` and are merged
  forward into `main` with `--no-ff`, never cherry-picked or back-merged; patch tags go on the pushed `release/X.Y`.
  The per-type branch patterns this task declares must not refuse the maintenance line: the pattern grammar accepts
  `release/*`, and the patterns this repository declares (if the approver confirms them in design) admit a release's
  and a bug's transitions on `release/X.Y` as on `main`, and `task/*` branches cut from either line. A `wf()` commit
  made on `release/X.Y` reaches `main` through a merge commit; the check runs at commit time on the current branch,
  so do not make it read the branch from history. `dl-159` Decision 3 (an element changes state only on the line
  that owns its fix) is not this key's job; the `release` `branch` field is `dl-159` A2.3, deferred.

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
