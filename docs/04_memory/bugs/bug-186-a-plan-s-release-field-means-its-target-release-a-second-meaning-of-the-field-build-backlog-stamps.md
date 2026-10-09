---
id: bug-186-a-plan-s-release-field-means-its-target-release-a-second-meaning-of-the-field-build-backlog-stamps
type: bug
title: "A plan's release field means its target release, a second meaning of the field build-backlog stamps"
status: in-review
severity: "low"           # REQUIRED — critical | high | medium | low
release-origin: "v0.3"     # optional — release where the bug was FOUND (dl-016), e.g. "v0.1"
release: "v0.3"            # optional — fix/implementation release, stamped by release-planning/build-backlog (dl-016)
feature: "P1.13"            # optional — related feature ID, e.g. "P1.6"
contributor: ""        # optional — who originated this contribution, if not the git author (dl-020); credited for AI-generated work derived from it
credit: ""             # optional — free-text credit note (dl-020)
tmpl_version: 260703   # Orignal template version
tags: ["v0.3"]
---

## Summary

The `plan` scaffold declares `release: ""` with the meaning "target release". build-backlog's `assign` gives `release` a different meaning, the release an element is scheduled into. This is the `bug-166` class, which `task-170` fixed for `service`. Because the plan scaffold declares `release`, `memory amend` keeps the field reserved on plans (`task-170`'s ruling (A)), so a plan's target release cannot be corrected through `amend`.

## Steps to Reproduce

1. `grep -n '^release' .wingfoil/memory/templates/plan.md` → `release: ""  # optional — target release`.
2. Edit a committed plan's `release` and run `memory amend <plan-id> --reason x`: it is refused for changing `release`.

## Expected Behavior

Each field name has one meaning. Either the plan's field gets its own name (as `set_up_in` for services), or the traceability directive states that a plan's `release` is the release it serves, set by its author.

## Actual Behavior

The two meanings share one name, and the plan's field has no owner verb.

## Notes

- Found by `task-170`'s developer (decision 2) and its independent reviewer.
- Same fix shape as `bug-166`/`task-170`.

## Triage & Execution Notes

Captured on 2026-10-01 by `bug-ingest-rel-v0.3-w1b1-review-findings-plan`, from the independent reviews
of wave 1 batch B1 (`dev-loop-rel-v0.3-plan`).
