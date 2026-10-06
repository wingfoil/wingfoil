---
id: bug-183-built-in-workflow-templates-pass-the-p4.17-integrity-check-without-being-startable-or-includable
type: bug
title: "Built-in workflow templates pass the P4.17 integrity check without being startable or includable"
status: in-review
severity: "low"           # REQUIRED — critical | high | medium | low
release-origin: "v0.3"     # optional — release where the bug was FOUND (dl-016), e.g. "v0.1"
release: "v0.3"            # optional — fix/implementation release, stamped by release-planning/build-backlog (dl-016)
feature: "P4.17"            # optional — related feature ID, e.g. "P1.6"
contributor: ""        # optional — who originated this contribution, if not the git author (dl-020); credited for AI-generated work derived from it
credit: ""             # optional — free-text credit note (dl-020)
tmpl_version: 260703   # Orignal template version
tags: ["v0.3"]
---

## Summary

`isValidWorkflowSource` (`src/core/builtin-integrity.ts`) checks a built-in workflow template against the `Workflow` schema only. Since `task-136` made `kind` optional, a template with neither `kind` nor `startable`/`includable` passes the P4.17 integrity check, and the loader then refuses it with `E_WORKFLOW_NEITHER_STARTABLE_NOR_INCLUDABLE`.

## Steps to Reproduce

1. Read `src/core/builtin-integrity.ts` (`isValidWorkflowSource`, `runValidation(Workflow, …)`).
2. Compare with `src/core/workflow-diagnostics.ts`, which refuses a workflow that is neither startable nor includable.

## Expected Behavior

The integrity check of a built-in workflow template applies the same per-file rules the loader applies, so a template that passes integrity also loads.

## Actual Behavior

The two checks diverge for a template with neither `kind` nor the booleans. Latent today: no built-in workflow template ships (`ls .wingfoil/workflows/built-in/` holds only `.gitkeep`).

## Notes

- Found by `task-136`'s independent review (finding 6).
- Related: `task-196` (built-in adapters as protected built-in assets) touches the same integrity module.

## Triage & Execution Notes

Captured on 2026-10-01 by `bug-ingest-rel-v0.3-w1b1-review-findings-plan`, from the independent reviews
of wave 1 batch B1 (`dev-loop-rel-v0.3-plan`).
