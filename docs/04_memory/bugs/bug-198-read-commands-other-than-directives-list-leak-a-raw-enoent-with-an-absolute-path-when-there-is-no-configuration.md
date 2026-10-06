---
id: bug-198-read-commands-other-than-directives-list-leak-a-raw-enoent-with-an-absolute-path-when-there-is-no-configuration
type: bug
title: "Read commands other than directives list leak a raw ENOENT with an absolute path when there is no configuration"
status: closed
severity: "low"           # REQUIRED — critical | high | medium | low
release-origin: "v0.3"     # optional — release where the bug was FOUND (dl-016), e.g. "v0.1"
release: "v0.3"            # optional — fix/implementation release, stamped by release-planning/build-backlog (dl-016)
feature: "P5.1"            # optional — related feature ID, e.g. "P1.6"
contributor: ""        # optional — who originated this contribution, if not the git author (dl-020); credited for AI-generated work derived from it
credit: ""             # optional — free-text credit note (dl-020)
tmpl_version: 260703   # Orignal template version
tags: ["v0.3"]
---

## Summary

Without a `.wingfoil/` directory, `directives list` now refuses with the shared not-initialized message (`task-143`, `requireInitializedProject`). `dna show`, `paths` and `memory search` still answer with a raw `ENOENT` that names an absolute path.

## Steps to Reproduce

1. In a git repository with no `.wingfoil/`: `node dist/cli.js dna show --format json`, then the same for `paths` and `memory search x`.

## Expected Behavior

Each refuses with `WINGFOIL_NOT_INITIALIZED`, exit 1, and no absolute path.

## Actual Behavior

Each exits 1 with `{"error":"ENOENT: no such file or directory, open '/…/.wingfoil/…'"}` (re-run on `main` on 2026-10-02). `workflow list` exits 0 with an empty registry, as `task-136` decided.

## Notes

- Found by `task-143`'s developer.
- `task-174` reuses the same refusal for the MCP pre-flight.

## Triage & Execution Notes

Captured on 2026-10-02 by `bug-ingest-rel-v0.3-w1b3-review-findings-plan`, from the independent reviews of wave 1
batch B3 (`dev-loop-rel-v0.3-plan`).
