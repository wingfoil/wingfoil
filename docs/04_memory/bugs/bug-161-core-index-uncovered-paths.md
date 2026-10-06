---
id: bug-161-core-index-uncovered-paths
type: bug
title: "`src/core/index.ts` has 8 statements and 14 branch arms that no test reaches, now visible since task-122 measures the file"
status: in-progress
severity: "low"
release-origin: "v0.2.2"
release: "v0.3"
feature: ""
contributor: ""
credit: ""
tmpl_version: 260703
---

## Summary

`task-122` (`bug-021`) brought `src/core/index.ts` into the coverage report. Its function coverage
is low only because of the compiler-generated re-export getters, which the approver accepted. The
file also has real logic that no test reaches: 8 statements and 14 branch arms. They sit above the
global thresholds, so nothing fails, but they are untested paths in the module every command goes
through.

## Steps to Reproduce

1. On `main` at `68f64091`, run `npx jest --coverage`.
2. Read `src/core/index.ts` from `coverage/coverage-final.json` and list the entries with a zero
   count in `s` (statements) and `b` (branch arms).

## Expected Behavior

Every statement and branch arm with behaviour is exercised by a test. Or, where a path cannot be
reached, it is removed, or marked with an ignore comment that states why.

## Actual Behavior

On `68f64091` (the run of 2026-09-29):
- uncovered statements, 8, at lines 193, 366, 698, 708, 1077, 1367, 1533, 1568;
- uncovered branch arms, 14, at lines 190, 366, 384, 409, 445, 515, 600, 698, 704, 705, 1077, 1367,
  1533, 1568.

## Notes

- Found at `task-122`'s review (2026-09-29). The approver ruled it a bug.
- The line numbers are the ones of `68f64091`. Any later edit of `src/core/index.ts` moves them, so
  the fix task re-derives them with the same command.
- `task-120` (help descriptions, W5 of the v0.2.2 dev-loop) is expected to edit the command
  declarations in this file.

## Triage & Execution Notes

<!-- triage (bug-ingest): severity call; fix: pointer to the fix task(s). -->
