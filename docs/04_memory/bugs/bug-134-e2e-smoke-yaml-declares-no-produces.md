---
id: "bug-134-e2e-smoke-yaml-declares-no-produces"
type: bug
title: "`e2e-smoke.yaml` declares no `produces:`, although dl-023 asked for a smoke-test report, so the phase's completion cannot be deduced"
status: closed
severity: "low"
release-origin: "v0.2"
release: "v0.3"
feature: "P4.1"
contributor: ""
credit: ""
tmpl_version: 260703
---

## Summary

A non-Memory-backed workflow phase is complete when its `produces:` artifacts exist. None of
`e2e-smoke.yaml`'s three phases declares a `produces:`, so the only evidence that the phase ran
is the approval itself. `dl-023` (`ready`) asked for the workflow to produce *"a smoke-test
report"*.

## Steps to Reproduce

1. `grep -n "produces" docs/self/.wingfoil/workflows/custom/e2e-smoke.yaml` returns nothing.
2. `grep -n "smoke-test report" docs/self/docs/04_memory/design/dls/dl-023-init-cli-e2e-smoke-gate.md`
   shows the Actions item: author `e2e-smoke.yaml` (`kind: sub`, `element: release`,
   `produces:` a smoke-test report).
3. By contrast, `grep -n "produces" docs/self/.wingfoil/workflows/custom/user-docs.yaml` shows that
   the neighbouring release gate declares its artifacts.

## Expected Behavior

`e2e-smoke.yaml` declares the report it produces, for example a per-release smoke log, so that its
completion is deducible like every other document-backed phase. Alternatively, a ruling explains why
this gate is exempt.

## Actual Behavior

The workflow was authored without the `produces:` that its DL specified. In v0.2 the run log and the
delta audit live only in the phase plan's Execution Notes.

## Notes

- This overlaps with S5.3 of `e2e-smoke-rel-v0.2-plan` ("does `e2e-smoke.yaml` gain a
  `produces:`?"), which is the approver's decision. That ruling decides this bug's triage: triage it
  if the answer is yes; close it as won't-fix, with the exemption recorded, if the answer is no.
- The same plan notes that the edit could ride with the `dl-025` amendment queued for the same
  directory. That amendment has since landed as `user-docs.yaml` v1.1, so this edit would stand on its
  own.
- The amendment is a workflow-file change and belongs behind a task. The qa gate run does not make it
  inline (plan H8).

## Triage & Execution Notes

- capture: found by the v0.2 `e2e-smoke` phase delta audit (`e2e-smoke-rel-v0.2-plan` §3.2 and its
  Execution Notes, 2026-09-25), filed under `bug-ingest-rel-v0.2-e2e-smoke-findings-plan` on
  2026-09-28. Proposed severity is `low`, because the gate is staged (`warn` until a release runs it
  green) and the gap is measured and recorded. `release` is left empty: the approver's decision of
  2026-09-22 authorises the gaps other than G1 to the next release.
- triage follow-up (2026-09-28): the approver ruled that the gate flips to **hard-reject in v0.3**
  (`dl-023`, "Staging record — 2026-09-28"). The fix task for this bug edits `e2e-smoke.yaml` anyway, so
  it must also restate the `gate` phase's staging text (its description and its `checks.post` string)
  as hard-reject. The fix has to land before v0.3's `e2e-smoke` phase runs, which makes this bug a
  v0.3 blocker for release-planning to schedule.
