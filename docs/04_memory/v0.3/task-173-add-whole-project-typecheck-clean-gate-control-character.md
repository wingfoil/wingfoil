---
id: "task-173-add-whole-project-typecheck-clean-gate-control-character"
type: task
title: "Add the whole-project `typecheck.clean` gate and a control-character gate, and run them in CI and before release"
status: in-progress
release: "v0.3"
kind: "feature"
priority: "high"
tags: ["v0.3", "core", "tests", "gates", "ci"]
ref: "dl-044"
bug: ["bug-073", "bug-185"]
depends_on: ["task-140-run-packaging-gate-push-pull-request-separate"]
tmpl_version: 260703
---

## Description

`test/**` lost its only standing typecheck gate; `tsc --noEmit` runs only by hand at release-submit (`dl-044`). No gate detects a raw NUL or other control character in a tracked text file (`bug-073`; `test/lint/` has only `coverage-scope`, `lint-clean`, `pack-ignore-scripts`).

## Acceptance Criteria

- (red-first) a `test/lint/` suite runs the full-project `tsc --noEmit` (src and test configs) and fails on a planted type error.
- (red-first) a `test/lint/` suite fails on a tracked text file holding a byte in `[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]`, naming file and offset; binary files are excluded by `git ls-files --eol` or an explicit list.
- (characterization) an `npm run typecheck` script exists; `ci.yml` (task-140) runs it; `release-submit.yaml` `pre-release-checks` declares `typecheck.clean` (version bump); `tsconfig.test.json`'s `ignoreDeprecations: "6.0"` carries a comment citing `dl-044` (accepted until TS 7). The `dev-loop.yaml` `refactor.checks.post` declaration is made by task-221, in the single v1.6 revision after task-205.
- (characterization) `.wingfoil/directives/custom/testing.md`'s `typecheck.clean` pointer, written by task-139 to name this task as the gate's deliverer, is rewritten to state the gate as running (`npm run typecheck`, the `test/lint/` suite) and no longer names this task (`dl-120` D3); it does not claim that `refactor` declares `typecheck.clean` before task-221 lands (the dev-loop declaration is task-221's).
- (characterization) `dl-044`'s third Action (the regression record on `task-065`) is written in this task's Execution Notes instead of editing a `done` element.

## Implementation Notes

- **Size:** S · **wave:** 2 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-044 (recommended; main, repo-level scope, pin accepted until TS 7) — merged from proposal D20; bug-073 control-character gate.
- **Notes:** Proposal key: C22 (merged: D20). Merged with proposal D20 (same `dl-044` gate): one owner for the typecheck gate. Files: `test/lint/`, `package.json`, `.github/workflows/ci.yml`, `release-submit.yaml`, `tsconfig.test.json`.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
