---
id: "bug-013-req-perf-02-command-level-unasserted"
type: bug
title: "REQ-PERF-02's Fit Criterion is worded against the commands, and nothing asserts memory search at that level any more"
status: in-progress
severity: "medium"
release-origin: "v0.2"
release: "v0.3"
feature: "P1.5"
contributor: ""
credit: ""
tmpl_version: 260703
---

## Summary

REQ-PERF-02's Fit Criterion reads *"`wingfoil memory search`, `wingfoil dna show`, and `wingfoil
memory history` each return in < 1,000 ms (p95) on the reference repository"* — a statement about the
**commands**. After `task-067` correctly moved `memory search`'s budget in-process, no test measures
that command end to end, so for `memory search` the criterion as written is unverified.

## Steps to Reproduce

1. `grep -rn "toBeLessThan(1000)\|P95_BUDGET_MS" test/` — every surviving budget for `memory search`
   is measured around the `memory.memorySearch` `CoreFn`, inside the process.
2. Confirm nothing times `node dist/cli.js memory search …` end to end: `test/cli/program.integration.test.ts`
   now asserts exit code, JSON shape and content only, and `test/core/latency-budget-placement.test.ts`
   actively forbids reintroducing a spawn-plus-clock measurement.

## Expected Behavior

Either the criterion is asserted as written, or the criterion is reworded to describe what is worth
measuring. Not neither.

## Actual Behavior

`task-067` removed the only command-level timing assertion, because it measured Node process startup
and CPU contention rather than query cost — which was `bug-011`, and removing it was right. The
consequence is simply that the SARD text and the test suite no longer describe the same thing.

## Notes

**Two candidate resolutions; this bug should pick one, not both.**

1. **Cover the criterion.** Add an end-to-end p95 over N spawned invocations with a budget that
   accounts for process startup honestly (measure the floor, then assert the query's marginal cost, or
   set a separate, larger command-level budget). Note this fights `task-067`'s guard by construction —
   the guard forbids exactly the spawn-plus-clock shape — so it would need an explicit, documented
   exemption. The approver asked for coverage *"if possible"*, which this caveat is about.
2. **Reword REQ-PERF-02** so the budget binds the operation rather than the command, matching where
   the cost actually is and what `task-021`/`task-067` measure. This is a SARD amendment, so it needs
   its own decision-log rather than being done inside a fix task.

Only `memory search` is known to be affected. Whoever takes this should first check whether
`wingfoil dna show` and `wingfoil memory history` — the criterion's other two commands — are measured
at command level or in-process, and widen the fix accordingly.

Raised by `task-067`'s reviewer, who flagged that the task's own claim of being *"strictly stronger on
every axis"* was an overstatement precisely on this axis.

## Triage & Execution Notes

- capture (`bug-ingest`): raised by `task-067`'s review; scheduled to `v0.3` on the approver's
  instruction, with the *"if possible"* caveat recorded in Notes above.
