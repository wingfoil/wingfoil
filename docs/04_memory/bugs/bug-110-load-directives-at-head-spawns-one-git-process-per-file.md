---
id: "bug-110-load-directives-at-head-spawns-one-git-process-per-file"
type: bug
title: "`loadDirectivesAtHead` spawns one git process per committed directive file — eleven on a fresh scaffold, and the count is the size of the directory rather than of the request"
status: triaged
severity: "low"
release-origin: "v0.2"
release: ""
feature: "P3.5"
contributor: ""
credit: ""
tmpl_version: 260703
---

## Summary

`loadDirectivesAtHead` (`src/core/loaders.ts`, `task-096`) reads the committed directive inventory as
one `git ls-tree` followed by **one `git show` per file**. On a fresh `wingfoil init --template Scrum`
scaffold that is 1 + 10 = **eleven processes**; after `task-094` added two directives to this
repository's own config it is thirteen here.

The cost scales with the *size of the directory*, not with what was asked for.

## Steps to Reproduce

Count the committed `.md` files under `.wingfoil/directives/custom/` and call any verb that resolves
the inventory at `HEAD` — `directive assign` is the shipped one.

## Expected Behavior

Reading an inventory at a revision costs a bounded number of subprocesses, or the cost is a recorded
decision rather than an accident of implementation.

## Actual Behavior

It is linear in the file count, and nothing says so at the call site.

## Notes

**Not a defect today, and that is why it is `low`.** `task-096` measured it and said so plainly rather
than discovering it later: the only shipped caller is `directive assign`, which is rare, interactive,
and already about to commit — so eleven processes are invisible beside the commit itself. `REQ-PERF-02`
budgets `memory search`, which never reaches this path, and `test/core/query-latency.test.ts` passes.

**What changes the answer is a second caller.** If any read-heavy path moves onto the committed
baseline — and `dl-080` pushes reads that way by design — `git cat-file --batch` becomes worth its
complexity. Filed so that decision is made when a caller arrives, rather than rediscovered by someone
watching a command be slow.

**Raised by `task-096` as a proposed element and not filed at the time.** It was held for the
retrospective, which meant it existed only in a conversation; recording it here is what "held for the
retrospective" should have meant.

## Triage & Execution Notes

- triage (2026-09-25): **low**. No budget is exceeded and no user can perceive it on the one path that
  reaches it. Filed for the second caller, not the first.
