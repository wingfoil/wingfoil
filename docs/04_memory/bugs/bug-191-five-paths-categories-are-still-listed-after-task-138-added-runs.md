---
id: bug-191-five-paths-categories-are-still-listed-after-task-138-added-runs
type: bug
title: "Five paths categories are still listed after task-138 added runs"
status: closed
severity: "low"           # REQUIRED — critical | high | medium | low
release-origin: "v0.3"     # optional — release where the bug was FOUND (dl-016), e.g. "v0.1"
release: "v0.3"            # optional — fix/implementation release, stamped by release-planning/build-backlog (dl-016)
feature: "P2.5"            # optional — related feature ID, e.g. "P1.6"
contributor: ""        # optional — who originated this contribution, if not the git author (dl-020); credited for AI-generated work derived from it
credit: ""             # optional — free-text credit note (dl-020)
tmpl_version: 260703   # Orignal template version
tags: ["v0.3"]
---

## Summary

`task-138` added a sixth `paths` category, `runs`, but three documents still list five categories.

## Steps to Reproduce

1. `grep -n 'sources, tests, docs, config, governance' docs/01_vision/06_features.md docs/04_memory/design/specs/spec-011-storage-layout.md docs/04_memory/design/specs/spec-012-context-loader-relevance-filtering.md`.

## Expected Behavior

The six categories, or a reference to `spec-002`'s Categories section.

## Actual Behavior

`06_features.md:51` (the P2.5 row), `spec-011-storage-layout.md:111` and `spec-012-context-loader-relevance-filtering.md:97` list five.

## Notes

- Found by `task-138`'s independent reviewer.
- `docs/user-guide.md`, `CLAUDE.md` and `X_cli-cmds.md` are owned by `user-docs`, `align-agent-docs` and `task-245`, so they are left out here.

## Triage & Execution Notes

Captured on 2026-10-02 by `bug-ingest-rel-v0.3-w1b2-review-findings-plan`, from the independent reviews of wave 1
batch B2 (`dev-loop-rel-v0.3-plan`).
