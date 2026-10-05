---
id: bug-164-memory-search-returns-non-element-files
type: bug
title: "`memory search` returns files that are not Memory elements — no frontmatter, so the match has a path and nothing else: no `id`, `type` or `status`"
status: closed
severity: "low"
release-origin: "v0.2.2"
release: "v0.3"
feature: "P1.10"
contributor: ""
credit: ""
tmpl_version: 260703   # Orignal template version
---

## Summary

`wingfoil memory search` treats every `.md` file under the scan roots as a Memory document, so the
14 plans `dl-019` grandfathered without frontmatter come back as matches that carry only a `path` —
no `id`, `type`, `title` or `status` — which no other verb can address and a consumer cannot place.

## Steps to Reproduce

In this repository, with `node dist/cli.js` built from `main` at `2f0bb682` (the installed
`wingfoil@0.2.1` gives the same numbers):

1. `node dist/cli.js memory search --format json > s.json && node -e "const m=require('./s.json').matches; console.log(m.length, m.filter(x=>!x.id).length)"`
   → `481 14`: 14 of the matches have no `id`.
   They are the 8 `docs/05_plans/X_*.md` and 6 plans under `docs/05_plans/rl-v1/`
   (`initial-design-rl-v1-plan.md` and five under `rl-v1/rel-v0.1/`), e.g.
   `{"path":"docs/05_plans/X_fix-bug-003-plan.md","tags":[]}`.
2. `node dist/cli.js memory search "Execution Plan" --format json` → 3 matches, one of them
   `{"path":"docs/05_plans/rl-v1/initial-design-rl-v1-plan.md","tags":[]}`: a free-text query reaches
   them too, through the body match.
3. `node dist/cli.js memory search --type plan --format json` → 18 matches, none without an `id`: the
   `--type` filter drops them, because their `type` is undefined.

## Expected Behavior

A search result is a list of Memory elements: every match has at least the `id` and `type` that
`memory history <id>`, `memory submit <id>` and the MCP resources address it by. A file under a
Memory directory that has no frontmatter — here, plans `dl-019` explicitly grandfathered — is not an
element and is left out, the way `listMemoryDocumentsByType` in the same module already leaves out any
document whose frontmatter `type` does not match.

## Actual Behavior

The file is returned as a match with `path` and an empty `tags` list only. The JSON has no field that
says the entry is not an element, so every consumer has to guess. The roadmap viewer
(`tools/roadmap`, which lists the project's documents through `memory search` since the CLI can read
this repository) reports each of the 14 twice: "listed by wingfoil memory search outside the
directories memory.yaml declares" and "type "undefined" is not declared in memory.yaml".

## Notes

- **Cause.** `searchMemoryDocuments` (`src/memory/query.ts`) pushes a match for every path
  `listMemoryDocumentPaths` yields that passes the archived-status and tag filters; nothing asks
  whether the file has an `id` or a declared `type`. `memorySearchFn` (`src/core/index.ts`) only
  applies `--type`/`--status` afterwards, which is why a filtered search looks right and an
  unfiltered one does not.
- **Not the archived exclusion.** `adr-005` (`superseded`) is also absent from an unfiltered search,
  but that is REQ-STATE-06 / `dl-028` working as specified (`--status superseded` returns it); it is
  not part of this bug.
- **Duplicate search:** `grep -rl "memory search" docs/04_memory/bugs | xargs grep -l -i "05_plans\|without frontmatter\|no frontmatter\|grandfather"`
  → only `bug-052` (REQ-STATE-08's retired default machine), unrelated.
- **Where it was found:** the roadmap viewer's snapshot warnings once task-111 let the CLI read this
  repository; captured under `bug-ingest-rel-v0.2.2-viewer-findings-plan`.

## Triage & Execution Notes

<!-- Running log, not the retrospective itself.
     - triage (bug-ingest): severity call, wontfix/duplicate rationale if rejected to `closed`.
     - fix: once fix task(s) exist (release-planning/build-backlog), day-to-day execution notes
       live on those tasks (docs/04_memory/{release}/{id}.md, `bug: {this id}`, their own
       Execution Notes section) — this section only needs a pointer plus anything that doesn't
       belong on a specific fix task (e.g. why 2 tasks were needed instead of 1). -->
