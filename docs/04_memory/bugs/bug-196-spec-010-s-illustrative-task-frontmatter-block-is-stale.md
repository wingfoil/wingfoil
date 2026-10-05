---
id: bug-196-spec-010-s-illustrative-task-frontmatter-block-is-stale
type: bug
title: "spec-010's illustrative task frontmatter block is stale"
status: closed
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

`spec-010`'s illustrative task frontmatter block ("Document template shape") no longer matches the task template. It shows `bug: ""` where tasks carry a list (`dl-045`), and it has neither `depends_on` nor `kind` (`task-150`).

## Steps to Reproduce

1. Compare `docs/04_memory/design/specs/spec-010-memory-frontmatter-schema.md` (around lines 73–83) with `.wingfoil/memory/templates/task.md`.

## Expected Behavior

The block matches the template, or it says it is an example and points to `memory.yaml` for type-specific fields.

## Actual Behavior

Three fields differ.

## Notes

- Found by `task-150`'s developer and reviewer. `spec-010` leaves type-specific fields to `spec-001`.

## Triage & Execution Notes

Captured on 2026-10-02 by `bug-ingest-rel-v0.3-w1b3-review-findings-plan`, from the independent reviews of wave 1
batch B3 (`dev-loop-rel-v0.3-plan`).
