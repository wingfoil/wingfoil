---
id: "bug-107-v0-1-backlog-json-quotes-scenario-text-that-moved"
type: bug
title: "The backlog JSON quotes P2.1 scenario text that `task-100` rewrote, and asserts a DNA shape retired two releases ago — in a file with one commit in its entire history"
status: in-progress
severity: "low"
release-origin: "v0.2"
release: "v0.3"
feature: ""
contributor: ""
credit: ""
tmpl_version: 260703
---

## Summary

`docs/03_backlog/04_backlog/backlog.json` and `by-release/v0.1.json` both carry, in
`TASK-023.acceptance_criteria`, the **verbatim pre-rewrite text of `P2.1-dna-set.feature` scenario 1**
— the scenario `task-100` replaced. The same entry's `acceptance_criteria_full` points at the live
file, which now says something else.

A second entry, `TASK-025` (`ref: P2.4`), asserts the DNA declares `modules, tech_stack, team,
conventions`. Measured, a fresh scaffold declares `version, project, modules, stacks, team, paths`.

## Steps to Reproduce

`grep -n 'tech_stack' docs/03_backlog/04_backlog/backlog.json` and read `TASK-023` and `TASK-025`.
`git log --oneline -- docs/03_backlog/04_backlog/backlog.json` → **one commit** (`b9c4df0b`), the
initial import.

## Expected Behavior

Either the backlog reflects the contracts it quotes, or it is understood to be a frozen record of
what was planned and nothing reads it as current.

## Actual Behavior

It is neither, and nothing says which it is.

## Notes

**`task-100` declined to fix it, and the reasoning is the substance of this bug.** Both entries record
`"release": "v0.1"` tasks in a release that is **already `released`**; the file has exactly one commit
in the whole history; and correcting one of two stale entries in the same file leaves it *harder* to
reason about than correcting neither, because a reader then cannot tell fresh from frozen.

**The real question is not the two entries.** It is whether `backlog.json` is a live artefact or an
archive. `feedback_backlog_json_not_authoritative` already records that `by-release/*.json` is a
suggestion for `build-backlog` rather than a source of truth, and CLAUDE.md §5.1 states that no
`approve` commit should ever touch it. If that is the settled reading, the fix is a header sentence
in the file saying so — not a correction of two rows, which would imply the rest is current.

**Worth resolving before `v0.2` publishes**, because the file ships in the repository and a new reader
has nothing telling them it is historical.

## Triage & Execution Notes

- triage (2026-09-24): **low**. Nothing reads these fields at runtime and no workflow consumes them;
  the cost is that a human or an agent mining the backlog for context is handed retired contracts.
- Handed from `task-093` to `task-100`, and declined there for the reason above rather than by
  omission.
