---
id: bug-176-spec-001-declares-the-n-n-id-token-which-the-id-engine-rejects-as-malformed
type: bug
title: "spec-001 declares the {n:N} id token, which the id engine rejects as malformed"
status: in-review
severity: "low"           # REQUIRED — critical | high | medium | low
release-origin: "v0.3"     # optional — release where the bug was FOUND (dl-016), e.g. "v0.1"
release: "v0.3"            # optional — fix/implementation release, stamped by release-planning/build-backlog (dl-016)
feature: "P1.3"            # optional — related feature ID, e.g. "P1.6"
contributor: ""        # optional — who originated this contribution, if not the git author (dl-020); credited for AI-generated work derived from it
credit: ""             # optional — free-text credit note (dl-020)
tmpl_version: 260703   # Orignal template version
tags: ["v0.3","memory","ids"]
---

## Summary

`spec-001`'s placeholder table defines the `{n:N}` token, but the id engine accepts only `{n}`, `{nn}` and `{nnn}` and reports `{n:N}` as malformed.

## Steps to Reproduce

1. `npm run build`.
2. `node -e "console.log(require('./dist/validation').idPatternIssues('task-{n:3}-{slug}'))"`.

## Expected Behavior

Either the engine accepts `{n:N}` (zero-padded to `N` digits) as `spec-001` line 139 defines it, or the spec stops declaring it.

## Actual Behavior

`['malformed token {n:3}']`. The spec also says `{n}` has no padding, while the engine pads `{n}` to 3 digits.

## Notes

- Found by `task-128`'s independent review. `task-128` left the placeholder row unchanged and made its own counter step 3 say that `{n:N}` is not implemented (`spec-001` lines 173–176). That step's sentence, with its two consecutive parentheticals, should be reworded with this fix.
- Same class as `bug-158` (`{date}` and `{author}` declared but not implemented), which `task-163` fixes. Proposed for absorption into `task-163` (`dl-045`).

## Triage & Execution Notes

Captured by `bug-ingest-rel-v0.3-wave0-review-findings-plan` (2026-10-01), from the independent
review of a wave-0 task of `dev-loop-rel-v0.3-plan`.
