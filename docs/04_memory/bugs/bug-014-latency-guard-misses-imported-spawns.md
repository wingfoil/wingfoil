---
id: "bug-014-latency-guard-misses-imported-spawns"
type: bug
title: "The latency-placement guard enforces less than its own doc claims: a spawn reached through an imported helper is invisible to it"
status: closed
severity: "low"
release-origin: "v0.2"
release: "v0.3"
feature: ""
contributor: ""
credit: ""
tmpl_version: 260703
---

## Summary

`test/core/latency-budget-placement.test.ts` states it enforces *"no test-suite file may both start a
child process and read the wall clock"*, but it implements a **same-file textual** scan: a file fails
only if it itself contains both a spawn marker and a clock marker. A spawn reached through an imported
helper passes.

## Steps to Reproduce

1. Note that `test/core/query-latency.test.ts` reads `performance.now()` and imports
   `test/storage/helpers/git-fixture.ts`, which spawns git via `execFileSync`.
2. Run `npx jest test/core/latency-budget-placement.test.ts` — it passes.

So the file that now owns P1.5's budget transitively starts child processes while timing, and the
guard does not see it.

## Expected Behavior

Either the guard detects spawns reached through imports, or its module doc states the narrower
invariant it actually enforces. The current wording would let a future maintainer believe a class of
regression is impossible when it is merely harder.

## Actual Behavior

Same-file substring matching only. Also unmatched: `new Date()`, `Date.now` without the open paren,
and `setTimeout`-derived timing. In the other direction it has false positives — the marker names
appearing in a *comment* trip it, which the author of `task-067` hit on their own explanatory comment
and worked around by rewording it.

## Notes

The guard is still worth having: it raises the cost of the specific copy-paste regression that
produced `bug-011`, it is consistent with the project's three existing structural guards
(`module-layout`, `pillar-isolation`, `parity`), and it is deterministic (`readdirSync(...).sort()`,
POSIX-normalised paths). Its non-vacuity check (`> 40` files scanned) is a real safeguard against the
scan going silently blind. This bug is about the gap between what it claims and what it does.

Cheapest honest fix: scope the module doc to the same-file textual check. A fuller fix would follow
imports (an AST or import-graph pass), which is a different instrument and a much larger change —
worth weighing against how much the guard is actually load-bearing.

Also worth folding in: the failure message names the offending clock marker but not the remedy, so a
future hit costs a lookup.

Raised by `task-067`'s reviewer.

## Triage & Execution Notes

- capture (`bug-ingest`): raised by `task-067`'s review; scheduled to `v0.3` on the approver's
  instruction.
