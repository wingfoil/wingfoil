---
id: "bug-157-dl-107-action-1-names-a-slug-rule-spec-009-does-not-hold"
type: bug
title: "`dl-107` Action 1 asks to amend a slug rule in `spec-009` §1, but `spec-009` holds no slug rule, so half of the Action has no target and is still open"
status: closed
severity: "low"
release-origin: "v0.2.2"
release: "v0.3"
feature: "P1.3"
contributor: ""        # optional — who originated this contribution, if not the git author (dl-020); credited for AI-generated work derived from it
credit: ""             # optional — free-text credit note (dl-020)
tmpl_version: 260703   # Orignal template version
---

## Summary

`dl-107` (`ready`) Action 1 reads: amend `spec-009-validation-strategy` §1 (slug rule) and
`spec-001-memory-yaml-schema`. `spec-001` was amended (`0f68c739`, fixed `33d89b7c`) and now carries
the rule in its `{slug}` row (line 140). `spec-009` §1 was not amended, and it has no slug rule to
amend. §1 is the two-pass model, and its only related text is the Pass-2 check that literal
`id_pattern` characters belong to `[a-z0-9-.]` (lines 65–68). `grep -n -i slug
docs/self/docs/04_memory/design/specs/spec-009-validation-strategy.md` → no hit.

## Steps to Reproduce

1. Read `dl-107` §Actions, item 1.
2. Run `grep -n -i slug docs/self/docs/04_memory/design/specs/spec-009-validation-strategy.md`.

## Expected Behavior

Every Action of a `ready` decision-log either names an existing target or is recorded as done or
void. Either `spec-009` §1 gains a pointer from its ID character class to `spec-001`'s `{slug}` rule,
since the two now share one character rule (`dl-107` S1 (a)), or Action 1's `spec-009` half is
recorded as void because `spec-001` owns the rule.

## Actual Behavior

The Action names a rule that does not exist, and nothing records that its `spec-009` half was
neither done nor dropped.

## Notes

- Found at `task-110`'s review (2026-09-29), recorded in its Execution Notes (Review, item 3). The
  approver ruled it a bug.
- `dl-107` Action 3 (`retrospective.yaml`'s `capture` action) is also open, but it waits on `dl-090`,
  as `dl-107` itself says. Not part of this bug.

## Triage & Execution Notes

<!-- triage (bug-ingest): severity call; fix: pointer to the fix task(s). -->
