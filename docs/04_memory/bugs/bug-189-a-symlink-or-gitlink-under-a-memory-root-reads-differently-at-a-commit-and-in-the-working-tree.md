---
id: bug-189-a-symlink-or-gitlink-under-a-memory-root-reads-differently-at-a-commit-and-in-the-working-tree
type: bug
title: "A symlink or gitlink under a Memory root reads differently at a commit and in the working tree"
status: closed
severity: "low"           # REQUIRED — critical | high | medium | low
release-origin: "v0.3"     # optional — release where the bug was FOUND (dl-016), e.g. "v0.1"
release: "v0.3"            # optional — fix/implementation release, stamped by release-planning/build-backlog (dl-016)
feature: "P1.10"            # optional — related feature ID, e.g. "P1.6"
contributor: ""        # optional — who originated this contribution, if not the git author (dl-020); credited for AI-generated work derived from it
credit: ""             # optional — free-text credit note (dl-020)
tmpl_version: 260703   # Orignal template version
tags: ["v0.3"]
---

## Summary

A symbolic link committed under a Memory scan root is read as its link text when read at a commit (`listMemoryDocumentPathsAtRev`, `readPathsAtRev`, `task-137`), but followed to its target by the working-tree scan (`listMarkdownFilesUnder`). A gitlink (submodule) is walked in the working tree and filtered out at a commit. The same clean tree therefore gives two different Memory snapshots depending on the baseline.

## Steps to Reproduce

1. Commit a symlink `docs/04_memory/bugs/link.md -> ../somewhere/real.md`.
2. Compare `loadMemoryDocuments` (working tree) with `loadMemoryDocumentsAtRev(HEAD)`.

## Expected Behavior

One rule for both baselines: refuse, skip, or follow links under Memory roots, and the same for gitlinks.

## Actual Behavior

At the commit the link parses as a document with empty frontmatter; in the working tree it is the target's content. Following a link can also leave the project root (REQ-SEC-06). Reproduced by `task-137`'s independent reviewer.

## Notes

- The at-commit read is the deterministic one; the working-tree follow is the riskier side.

## Triage & Execution Notes

Captured on 2026-10-02 by `bug-ingest-rel-v0.3-w1b2-review-findings-plan`, from the independent reviews of wave 1
batch B2 (`dev-loop-rel-v0.3-plan`).
