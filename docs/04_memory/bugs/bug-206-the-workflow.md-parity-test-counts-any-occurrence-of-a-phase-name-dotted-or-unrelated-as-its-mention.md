---
id: bug-206-the-workflow.md-parity-test-counts-any-occurrence-of-a-phase-name-dotted-or-unrelated-as-its-mention
type: bug
title: "The WORKFLOW.md parity test counts any occurrence of a phase name, dotted or unrelated, as its mention"
status: open
severity: "medium"           # REQUIRED — critical | high | medium | low
release-origin: "v0.3"     # optional — release where the bug was FOUND (dl-016), e.g. "v0.1"
release: ""            # optional — fix/implementation release, stamped by release-planning/build-backlog (dl-016)
feature: "P4.1"            # optional — related feature ID, e.g. "P1.6"
contributor: ""        # optional — who originated this contribution, if not the git author (dl-020); credited for AI-generated work derived from it
credit: ""             # optional — free-text credit note (dl-020)
tmpl_version: 260703   # Orignal template version
tags: ["v0.3"]
---

## Summary

`test/docs/workflow-md.test.ts` (`task-148`) requires every workflow and phase name of `workflows.yaml` to appear in `.wingfoil/WORKFLOW.md` as a whole word. Its boundary class `(?<![A-Za-z0-9_-])…(?![A-Za-z0-9_-])` does not include `.`, and the match is document-wide, not per workflow. A phase named with a common word is therefore satisfied by any occurrence anywhere: `submit` by the twenty `memory.submit` mentions, `approve` by fifteen `memory.approve`, and `gate`, `design`, `capture` by prose. Removing, say, the `release-cycle`/`submit` (the `include: release-submit` step) or `e2e-smoke`/`gate` node from the reference would not fail the test.

## Steps to Reproduce

1. `sed -n 21,25p test/docs/workflow-md.test.ts` → `return new RegExp(\`(?<![A-Za-z0-9_-])${escaped}(?![A-Za-z0-9_-])\`).test(text);`
2. Count whole-word matches: `for n in submit approve gate design capture; do printf "%s: " $n; grep -oP "(?<![A-Za-z0-9_-])$n(?![A-Za-z0-9_-])" .wingfoil/WORKFLOW.md | wc -l; done` → `submit: 25`, `approve: 23`, `gate: 24`, `design: 15`, `capture: 8`.
3. Strip every occurrence not preceded by `.` and re-apply the test's own predicate (a node script using the same regex) → `submit dotted-occurrences= 20 mentions-after-stripping-undotted= true`, `approve dotted-occurrences= 15 mentions-after-stripping-undotted= true`.
4. `grep -n "name: gate\|name: design\|name: capture\|name: submit\|name: approve" .wingfoil/workflows/custom/*.yaml` → `gate` (e2e-smoke), `design` (dev-loop), `capture` (decision-log-ingest, retrospective, service-ingest), `approve` (four workflows), `submit` (release-cycle).

## Expected Behavior

A phase counts as documented only where `WORKFLOW.md` names it for its own workflow — for example `workflow/phase` pairs, or the phase within that workflow's section or diagram — and `.` is a boundary that does not satisfy a phase name (`memory.submit` is an action, not the phase).

## Actual Behavior

The guard passes for any phase whose name is a common word or an action suffix, so the parity it claims holds only for distinctive names.

## Notes

- Found by `task-148`'s independent reviewer (F3).
- The test's module comment says "every phase name in it to appear in `WORKFLOW.md` as a whole word" — accurate to the code, but weaker than the parity the gate is meant to give (bug-170).

## Triage & Execution Notes

Captured on 2026-10-02 by `bug-ingest-rel-v0.3-w1b4-review-findings-plan`, from the independent reviews of wave 1
batch B4 (`dev-loop-rel-v0.3-plan`), against `main` at `243f8f05` (B4 merges up to `ea637c43`).
