---
id: bug-200-mcp-resource-reads-drop-an-operation-s-warnings
type: bug
title: "MCP Resource reads drop an operation's warnings"
status: closed
severity: "low"           # REQUIRED — critical | high | medium | low
release-origin: "v0.3"     # optional — release where the bug was FOUND (dl-016), e.g. "v0.1"
release: "v0.4"            # optional — fix/implementation release, stamped by release-planning/build-backlog (dl-016)
feature: "P5.2"            # optional — related feature ID, e.g. "P1.6"
contributor: ""        # optional — who originated this contribution, if not the git author (dl-020); credited for AI-generated work derived from it
credit: ""             # optional — free-text credit note (dl-020)
tmpl_version: 260703   # Orignal template version
tags: ["v0.3"]
rejection_reason: "Closed at the approver's triage of the W3 B1 review findings on 2026-10-07 as already fixed: since task-195 (merged 2026-10-07), Resource reads derived from core operations carry the operation's warnings as a top-level warnings array (src/mcp/registrar.ts, withWarnings over outcome.warnings), which is what this bug asked for; no v0.3 or v0.4 task needs to carry it."
---

## Summary

`task-169` added a success-warning channel (`coreOk(…, warnings)`). On MCP, a Tool result carries the warnings in `structuredContent`, but the Resource read path in `src/mcp/registrar.ts` ignores `result.warnings`. No read-only operation returns warnings today, so nothing is lost yet, and nothing guards it either.

## Steps to Reproduce

1. Read the Resource read path in `src/mcp/registrar.ts`; `grep -rn warnings src/core` shows only `directive assign` returning them.

## Expected Behavior

A Resource read surfaces an operation's warnings, or a test pins that no read-only operation returns any.

## Actual Behavior

Silently dropped.

## Notes

- Found by `task-169`'s independent reviewer.

## Triage & Execution Notes

Captured on 2026-10-02 by `bug-ingest-rel-v0.3-w1b3-review-findings-plan`, from the independent reviews of wave 1
batch B3 (`dev-loop-rel-v0.3-plan`).
