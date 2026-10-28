---
id: "bug-108-directive-remove-resolves-its-target-on-the-working-tree"
type: bug
title: "`directive remove` resolves which directive it is removing from the working tree, so a file committed at `HEAD` but deleted on disk is answered `unknown directive` — the one shipped deviation from the baseline rule"
status: planned
severity: "low"
release-origin: "v0.2"
release: "v0.3.2"
feature: "P3.5"
contributor: ""
credit: ""
tmpl_version: 260703
---

## Summary

`directiveRemoveFn`'s step 3 resolves the directive name against `loadDirectives` — the **working
tree** — and returns `NOT_FOUND` at exit 1 when it finds nothing. That read **gates**: its answer
decides whether the command refuses. Under `dl-080` option (B) it should resolve at `HEAD`.

The visible consequence: a directive committed at `HEAD` but deleted in the working tree is answered
`unknown directive: <id>`, which is false — `HEAD` still carries the blob.

## Steps to Reproduce

```
$ rm .wingfoil/directives/custom/determinism.md
$ wingfoil directive remove determinism
error: unknown directive: determinism            exit 1        # but HEAD still has it
```

## Expected Behavior

The resolution read resolves at `HEAD`, and the working tree is consulted only to word the message —
so an untracked file still gets the accurate "carries uncommitted modifications" refusal, and a
deleted-but-committed file gets a message saying so rather than a denial that it exists.

## Actual Behavior

Both cases collapse into one message, and one of them is wrong.

## Notes

**`task-096` left this deliberately and was right to, at the time.** Measured before acting: `remove`
**already** refuses an untracked directive file at exit 1, through `task-092`'s
`requireUnmodifiedTarget` — `??` is a non-empty porcelain code. Moving the resolution read to `HEAD`
naively would have replaced that accurate refusal with `unknown directive`, which is worse. The task
chose the message it could keep.

**What its reviewer then measured is why this is filed rather than accepted.** The exception *costs*
an accurate message in the opposite direction, and **neither choice can destroy anything** —
`requireUnmodifiedTarget` decides the deletion after both reads. So it is a message-quality trade in
both directions, not a safety one, and a trade like that should be settled centrally rather than per
call site.

**`task-094` settles it as a defect rather than an exception**, and the clause it writes is better
than either branch of the original trade: *the working tree may be read to explain a refusal, never
to decide one.* Resolve at `HEAD`; on `NOT_FOUND`, look at the working tree only to choose the
wording. Both messages come out right.

**The primitive already exists.** `listPathsAtRev` (`src/storage/commit.ts`, from `task-096`) lists a
directory at a revision, which is exactly what the `HEAD`-side resolution needs.

**Filed late, and that is the point worth recording.** `task-096` proposed it twice — once as an
element for the orchestrator and once as "that is `task-094`'s, not this task's" — and it was filed
neither time. `task-094`'s reviewer caught that the directive would otherwise ship naming a live
deviation that nothing scheduled.

## Triage & Execution Notes

- triage (2026-09-24): **low**. Both paths refuse and nothing is destroyed; the cost is one
  inaccurate message on a path a user reaches by deleting a file by hand. Not scheduled to v0.2: the
  rule it deviates from is not merged yet, and the fix is small enough to ride with the next
  directives work.
