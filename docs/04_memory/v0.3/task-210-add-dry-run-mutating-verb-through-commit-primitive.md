---
id: "task-210-add-dry-run-mutating-verb-through-commit-primitive"
type: task
title: "Add `--dry-run` to every mutating verb through the commit primitive"
status: backlog
release: "v0.3"
kind: "feature"
priority: "medium"
tags: ["v0.3", "core", "cli"]
ref: "dl-106"
bug: ["bug-217"]
depends_on: ["task-129-refuse-operand-beyond-command-declares-exit-2-before", "task-192-stamp-wingfoil-commit-wingfoil-version-semver-sha-pin"]
tmpl_version: 260703
---

## Description

Ratified: every operation registered `mutates: true` in `CORE_MODULES` (28 today, `grep -c "mutates: true" src/core/index.ts`) accepts `--dry-run`: it prints the transition, the paths and the diff the commit would contain, writes nothing and exits 0, or exits with the refusal's code. Implemented once, at the registry/commit-primitive level, so A's and B's new mutating operations inherit it.

## Acceptance Criteria

- (red-first) table-driven over the registry: every `mutates: true` op accepts `--dry-run`; afterwards `git status --porcelain` and `git rev-parse HEAD` are unchanged.
- (red-first) a dry run of a refused operation exits with that refusal's code.
- (red-first) `--format json` dry-run output lists `{paths, subject, diff}`.
- (characterization) `spec-008` §2 lists `--dry-run`; `docs/cli-reference.md` documents it.

## Implementation Notes

- **Size:** M · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-106 W2; spec-008 §2 (global flags).
- **Features:** P5.1.4.
- **Notes:** Proposal key: C24.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
