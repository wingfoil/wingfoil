---
id: bug-184-the-production-mcp-server-gives-a-refusal-no-error.data-because-it-does-not-register-through-the-core-registrar
type: bug
title: "The production MCP server gives a refusal no error.data, because it does not register through the core registrar"
status: closed
severity: "medium"           # REQUIRED — critical | high | medium | low
release-origin: "v0.3"     # optional — release where the bug was FOUND (dl-016), e.g. "v0.1"
release: "v0.3"            # optional — fix/implementation release, stamped by release-planning/build-backlog (dl-016)
feature: "P5.2"            # optional — related feature ID, e.g. "P1.6"
contributor: ""        # optional — who originated this contribution, if not the git author (dl-020); credited for AI-generated work derived from it
credit: ""             # optional — free-text credit note (dl-020)
tmpl_version: 260703   # Orignal template version
tags: ["v0.3"]
---

## Summary

`task-130` gives an MCP refusal its details (`error.data.details` on a Resource read, `structuredContent` on a Tool) through `src/mcp/registrar.ts`. The production server, `wingfoil mcp` (`src/mcp/server.ts`), deliberately does not call `registerCoreModules`, so it does not expose mutating Tools. As a result, its Resources throw the loaders' errors without `error.data`, and an agent reading them through the shipped server gets no details.

## Steps to Reproduce

1. `grep -n registerCoreModules src/mcp/server.ts`: two comment lines, no call.
2. Start `wingfoil mcp` on a project with a malformed `.wingfoil/dna.yaml` and read the DNA Resource.

## Expected Behavior

A Resource refusal from the production server carries `error.data.details`, as `spec-004` §4.3 item 4 states (task-130's amendment `01462fab`).

## Actual Behavior

The refusal has a message and no `error.data`. The details path is exercised only by the registrar's own tests (`test/mcp/error-details.test.ts`).

## Notes

- Found by `task-130`'s developer and confirmed by its independent reviewer.
- The non-registration is intended (read-only server). The defect is only that the server's Resource error path does not apply `errorDetails`.

## Triage & Execution Notes

Captured on 2026-10-01 by `bug-ingest-rel-v0.3-w1b1-review-findings-plan`, from the independent reviews
of wave 1 batch B1 (`dev-loop-rel-v0.3-plan`).
