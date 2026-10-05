---
id: bug-179-init-and-mcp-refuse-a-surplus-operand-in-commander-s-wording-not-the-shared-refusal
type: bug
title: "init and mcp refuse a surplus operand in Commander's wording, not the shared refusal"
status: in-progress
severity: "low"           # REQUIRED — critical | high | medium | low
release-origin: "v0.3"     # optional — release where the bug was FOUND (dl-016), e.g. "v0.1"
release: "v0.3"            # optional — fix/implementation release, stamped by release-planning/build-backlog (dl-016)
feature: "P5.1.4"            # optional — related feature ID, e.g. "P1.6"
contributor: ""        # optional — who originated this contribution, if not the git author (dl-020); credited for AI-generated work derived from it
credit: ""             # optional — free-text credit note (dl-020)
tmpl_version: 260703   # Orignal template version
tags: ["v0.3","cli","grammar"]
---

## Summary

`init` and `mcp` refuse a surplus operand at exit 2, but with Commander's message, not the shared refusal every registry command gives since `task-129`.

## Steps to Reproduce

1. `npm run build`.
2. `node dist/cli.js init extra`.
3. `node dist/cli.js workflow list extra`, for comparison.

## Expected Behavior

One message shape for every command: `wingfoil init takes no positional (got 1 positional)`, as `spec-008` §1 now states for every command.

## Actual Behavior

`error: too many arguments for 'init'. Expected 0 arguments but got 1: extra.`, exit 2. `mcp` behaves the same way. The registry commands print `wingfoil workflow list takes no positional (got 1 positional)`.

## Notes

- Found by `task-129`'s independent review. `init` and `mcp` are the bootstrap commands outside `CORE_MODULES`, so they do not use the registrar's refusal.
- The exit code is already right; only the wording differs. Related: `task-165` (bootstrap commands on the command surface).

## Triage & Execution Notes

Captured by `bug-ingest-rel-v0.3-wave0-review-findings-plan` (2026-10-01), from the independent
review of a wave-0 task of `dev-loop-rel-v0.3-plan`.
