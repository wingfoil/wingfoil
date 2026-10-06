---
id: bug-194-core-and-cli-writes-nothing-tests-check-one-file-and-head-never-the-working-tree-or-refs
type: bug
title: "Core and CLI writes-nothing tests check one file and HEAD, never the working tree or refs"
status: closed
severity: "medium"           # REQUIRED — critical | high | medium | low
release-origin: "v0.3"     # optional — release where the bug was FOUND (dl-016), e.g. "v0.1"
release: "v0.3"            # optional — fix/implementation release, stamped by release-planning/build-backlog (dl-016)
feature: "P5.4"            # optional — related feature ID, e.g. "P1.6"
contributor: ""        # optional — who originated this contribution, if not the git author (dl-020); credited for AI-generated work derived from it
credit: ""             # optional — free-text credit note (dl-020)
tmpl_version: 260703   # Orignal template version
tags: ["v0.3"]
---

## Summary

`task-147` made the MCP no-persistence check compare the working tree (ignored files included), `HEAD`, its symbolic target and every ref. The core and CLI tests that assert a refused write "writes nothing" still check one file's bytes and `HEAD` only. A verb that writes a stray file, a branch or a tag and then refuses would pass them.

## Steps to Reproduce

1. Read `test/core/memory-approve.test.ts` (around line 274), `test/core/dna-mutation-surface.test.ts` (around line 243) and `test/core/directive-assign.test.ts` (around line 238), the "writes nothing" assertions.

## Expected Behavior

One shared snapshot helper (`PersistenceSnapshot`, moved out of `test/mcp/helpers/channel-enumeration.ts`) used by every "writes nothing" assertion on a write path.

## Actual Behavior

Each checks one file and/or `HEAD`; `directive-assign`'s AC9 checks only `roles.yaml`'s bytes.

## Notes

- Found by `task-147`'s independent reviewer.
- Measure the genuine instances first: the raw `grep "byte-for-byte\|writes nothing"` count of 26 includes false positives such as comment-preservation and output-equality checks.

## Triage & Execution Notes

Captured on 2026-10-02 by `bug-ingest-rel-v0.3-w1b3-review-findings-plan`, from the independent reviews of wave 1
batch B3 (`dev-loop-rel-v0.3-plan`).
