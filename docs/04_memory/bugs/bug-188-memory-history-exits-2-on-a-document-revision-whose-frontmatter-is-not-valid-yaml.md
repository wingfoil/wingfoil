---
id: bug-188-memory-history-exits-2-on-a-document-revision-whose-frontmatter-is-not-valid-yaml
type: bug
title: "memory history exits 2 on a document revision whose frontmatter is not valid YAML"
status: in-review
severity: "medium"           # REQUIRED — critical | high | medium | low
release-origin: "v0.3"     # optional — release where the bug was FOUND (dl-016), e.g. "v0.1"
release: "v0.3"            # optional — fix/implementation release, stamped by release-planning/build-backlog (dl-016)
feature: "P1.10"            # optional — related feature ID, e.g. "P1.6"
contributor: ""        # optional — who originated this contribution, if not the git author (dl-020); credited for AI-generated work derived from it
credit: ""             # optional — free-text credit note (dl-020)
tmpl_version: 260703   # Orignal template version
tags: ["v0.3"]
---

## Summary

`memory history` exits 2 when any revision of the document has frontmatter that is not valid YAML. `readStatusAt` (`src/memory/audit.ts`) does not catch the parse error, so one bad historical revision makes the whole history unreadable.

## Steps to Reproduce

1. `npm run build`.
2. `node dist/cli.js memory history task-070-license-file`.

## Expected Behavior

The history is listed. The bad revision appears as an entry whose state could not be read, as `scripts/check-governance.cjs` already does since its commit `4cf02924`.

## Actual Behavior

Exit 2: `error: bad indentation of a mapping entry (5:264)`, caused by revision `a651335d`. Re-run on `main` on 2026-10-02. The pinned 0.2.1 behaves the same. Seven documents are affected (`task-167`'s full-history run).

## Notes

- Found by `task-167`'s developer, confirmed by its independent reviewer.
- Changing what `memory history` renders needs a P1.10 BDD scenario.

## Triage & Execution Notes

Captured on 2026-10-02 by `bug-ingest-rel-v0.3-w1b2-review-findings-plan`, from the independent reviews of wave 1
batch B2 (`dev-loop-rel-v0.3-plan`).
