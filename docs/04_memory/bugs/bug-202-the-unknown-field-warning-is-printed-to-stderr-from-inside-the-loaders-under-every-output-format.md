---
id: bug-202-the-unknown-field-warning-is-printed-to-stderr-from-inside-the-loaders-under-every-output-format
type: bug
title: "The unknown-field warning is printed to stderr from inside the loaders, under every output format"
status: in-progress
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

`emitUnknownFieldWarning` (`src/validation`) writes `Warning: …` to stderr from inside the loaders, whatever the output format. Under `--format json`, stderr may then carry a warning line plus the error object, breaking `spec-005` §3.2 (one object), and `spec-009` §2 itself says that warning is suppressed under a machine-readable format.

## Steps to Reproduce

1. Add an unknown key to `.wingfoil/workflows.yaml` and run a command that fails under `--format json`.

## Expected Behavior

The warning is suppressed under `json`/`yaml`, or rides a warnings channel (`task-169`'s, or a payload's) instead of being printed from inside `src/`.

## Actual Behavior

It is printed (`src/core/loaders.ts` calls it for the workflow files and the manifest).

## Notes

- Found by `task-143`'s independent reviewer. `task-143` removed `src/core`'s other stderr writes, and the B3 integration fix (`89c93556`) moved `task-144`'s version warning to the inventory.

## Triage & Execution Notes

Captured on 2026-10-02 by `bug-ingest-rel-v0.3-w1b3-review-findings-plan`, from the independent reviews of wave 1
batch B3 (`dev-loop-rel-v0.3-plan`).
