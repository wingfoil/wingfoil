---
id: bug-201-atheador-treats-a-failed-git-read-as-nothing-committed
type: bug
title: "atHeadOr treats a failed git read as nothing committed"
status: closed
severity: "low"           # REQUIRED — critical | high | medium | low
release-origin: "v0.3"     # optional — release where the bug was FOUND (dl-016), e.g. "v0.1"
release: "v0.3"            # optional — fix/implementation release, stamped by release-planning/build-backlog (dl-016)
feature: "P1.2"            # optional — related feature ID, e.g. "P1.6"
contributor: ""        # optional — who originated this contribution, if not the git author (dl-020); credited for AI-generated work derived from it
credit: ""             # optional — free-text credit note (dl-020)
tmpl_version: 260703   # Orignal template version
tags: ["v0.3"]
---

## Summary

`atHeadOr` (`src/core/revision.ts`) maps a failed git read (`E_GIT_READ_FAILED`) at `HEAD` to the "nothing committed" fallback. A read that fails for another reason, such as git that cannot be spawned or output over the 256 MiB buffer, is treated as an empty baseline instead of a refusal.

## Steps to Reproduce

1. Read `atHeadOr` in `src/core/revision.ts` and the `…AtHead` loaders that call it.

## Expected Behavior

Only an unborn `HEAD` or a missing repository gives the fallback; any other read failure is a named refusal.

## Actual Behavior

Every `E_GIT_READ_FAILED` gives the fallback. This predates `task-142`, which now routes `readPathAtRev` through that error.

## Notes

- Found by `task-142`'s developer.

## Triage & Execution Notes

Captured on 2026-10-02 by `bug-ingest-rel-v0.3-w1b3-review-findings-plan`, from the independent reviews of wave 1
batch B3 (`dev-loop-rel-v0.3-plan`).
