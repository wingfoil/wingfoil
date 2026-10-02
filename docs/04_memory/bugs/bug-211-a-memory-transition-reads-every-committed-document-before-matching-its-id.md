---
id: bug-211-a-memory-transition-reads-every-committed-document-before-matching-its-id
type: bug
title: "A Memory transition reads every committed document before matching its id"
status: open
severity: "low"           # REQUIRED — critical | high | medium | low
release-origin: "v0.3"     # optional — release where the bug was FOUND (dl-016), e.g. "v0.1"
release: ""            # optional — fix/implementation release, stamped by release-planning/build-backlog (dl-016)
feature: "P1.6"            # optional — related feature ID, e.g. "P1.6"
contributor: ""        # optional — who originated this contribution, if not the git author (dl-020); credited for AI-generated work derived from it
credit: ""             # optional — free-text credit note (dl-020)
tmpl_version: 260703   # Orignal template version
tags: ["v0.3"]
---

## Summary

Since `task-247` a Memory transition finds its document at HEAD (`findMemoryDocumentByIdAtRev`, `src/memory/query.ts`), which reads every committed Memory blob in one batch (`readPathsAtRev`) before it parses lazily up to the match. The working-tree lookup it replaced stopped reading at the match. On this repository (694 documents) the HEAD lookup costs about 130–175 ms whatever the id, against 2 ms (early id) to 25 ms (full scan) for the working-tree lookup. It is inside every REQ-PERF budget (< 1,000 ms p95), but the cost grows with the whole Memory, not with the position of the match.

## Steps to Reproduce

1. `npm run -s build`, then a node script over `dist/` on `main` (`243f8f05`), median of 7 runs each, `uptime` load average ≈ 5 on 12 cores:
   ```
   documents at HEAD: 694 working tree: 694
   zzz-missing-id working-tree findMemoryDocumentById median ms: 24.8
   zzz-missing-id HEAD findMemoryDocumentByIdAtRev median ms: 164.6
   first id bug-001-cli-version-flag wt: 2.0 head: 131.5
   readPathsAtRev(all) ms 118.56
   ```
2. `sed -n 187,193p src/memory/query.ts` → `parseMemoryDocumentsAtSha` iterates `readPathsAtRev(root, sha, paths).entries()`: the whole batch is read before the first parse, although its doc comment says "Lazy so that a lookup can stop at its match, as the working-tree lookup does" — the parse is lazy, the read is not.

## Expected Behavior

A transition's lookup cost stays close to the working-tree lookup — for example, find the id from the path pattern first (an `id`-keyed path is the common case), or read blobs in chunks and stop at the match.

## Actual Behavior

~130–175 ms per transition on this repository, dominated by reading ~118 ms of blobs, roughly 6× the full working-tree scan and 65× an early match.

## Notes

- Found by `task-247`'s independent reviewer (~150 ms vs ~40 ms); re-measured here with the numbers above.
- Not a budget breach: REQ-PERF-02/04 are 1,000 ms p95 and name read commands, not transitions; `task-154` gives the budgets one statistical shape.

## Triage & Execution Notes

Captured on 2026-10-02 by `bug-ingest-rel-v0.3-w1b4-review-findings-plan`, from the independent reviews of wave 1
batch B4 (`dev-loop-rel-v0.3-plan`), against `main` at `243f8f05` (B4 merges up to `ea637c43`).
