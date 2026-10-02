---
id: bug-177-no-memory.yaml-type-name-is-refused-for-colliding-with-a-configuration-commit-scope
type: bug
title: "No memory.yaml type name is refused for colliding with a configuration commit scope"
status: in-progress
severity: "low"           # REQUIRED — critical | high | medium | low
release-origin: "v0.3"     # optional — release where the bug was FOUND (dl-016), e.g. "v0.1"
release: "v0.3"            # optional — fix/implementation release, stamped by release-planning/build-backlog (dl-016)
feature: "P1.13"            # optional — related feature ID, e.g. "P1.6"
contributor: ""        # optional — who originated this contribution, if not the git author (dl-020); credited for AI-generated work derived from it
credit: ""             # optional — free-text credit note (dl-020)
tmpl_version: 260703   # Orignal template version
tags: ["v0.3","memory","schema","audit"]
---

## Summary

`src/memory/audit.ts`'s `CONFIGURATION_SCOPES` treats `wf(dna)`, `wf(directive)` and `wf(workflow)` commits as configuration. Nothing stops a `memory.yaml` type from taking one of those names, and then its whole history reads as `operation: null`.

## Steps to Reproduce

1. In a scratch project, declare a Memory type named `workflow` in `.wingfoil/memory.yaml` and commit it.
2. `memory add --type workflow --title x`, then `memory submit` it.
3. `memory history <id>`.

## Expected Behavior

`memory.yaml` validation refuses the reserved names, as it already refuses `deprecated` as a declared state (`src/memory/schema.ts`), or `memory history` reads that type's operations.

## Actual Behavior

The type is accepted. Every entry of its history reports `operation: null`, with no warning. Inferred from the code, not run: `grep -n reserved src/memory/schema.ts` reserves only `deprecated`, and the scope check runs before the verb check in `parseMemoryOperation`.

## Notes

- Found by `task-126`'s independent review. `task-126` rewrote the `CONFIGURATION_SCOPES` comment to call the rule an unenforced convention (`f27e9a56`).
- The fix belongs with `spec-001`, the `memory.yaml` schema, which would list the reserved type names.

## Triage & Execution Notes

Captured by `bug-ingest-rel-v0.3-wave0-review-findings-plan` (2026-10-01), from the independent
review of a wave-0 task of `dev-loop-rel-v0.3-plan`.
