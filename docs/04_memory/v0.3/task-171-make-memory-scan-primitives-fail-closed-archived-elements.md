---
id: "task-171-make-memory-scan-primitives-fail-closed-archived-elements"
type: task
title: "Make the Memory scan primitives fail closed on archived elements and tolerant of unreadable files"
status: in-progress
release: "v0.3"
kind: "fix"
priority: "high"
tags: ["v0.3", "core", "memory", "query"]
ref: "dl-038"
bug: ["bug-031", "bug-164", "bug-188", "bug-189", "bug-201"]
depends_on: ["task-130-show-coreerror-details-surface-give-refusal-shape-under"]
tmpl_version: 260703
---

## Description

`listMemoryDocumentsByType` and `findMemoryDocumentByTypeAndId` (`src/memory/query.ts:207,241`) have no `includeArchived` option (`dl-038` option 1: default exclusion, mirroring `MemorySearchOptions`); one unparseable frontmatter throws from `parseYaml` (`query.ts:138`) and breaks search and by-id lookup repo-wide without naming the file (`bug-031`); files with no frontmatter come back as matches with a path and nothing else (`bug-164`, 14 of 481 matches here).

## Acceptance Criteria

- (red-first) both primitives exclude `deprecated`/`superseded` by default and include them with `includeArchived: true`; `task-038`'s characterization test is amended deliberately, citing `dl-038`.
- (red-first) one malformed Memory file no longer fails `memory search` or `memory submit <other-id>`; the malformed file is reported as a warning naming its repository-relative path (P4.13 sc.3's wording, `W_MEMORY_UNREADABLE`, shared with A's deduction).
- (red-first) `memory search` returns only elements with `id` and `type`; frontmatter-less files are left out (`bug-164`).
- (characterization) the TSDoc at `query.ts:126-129` matches the tolerant behaviour.

## Implementation Notes

- **Size:** M · **wave:** 2 · **kind:** fix (`dl-133` Q1 (b)).
- **Implements:** dl-038 option 1; spec-017 §1.4 (tolerant reads, P4.13 sc.3).
- **Features:** P1.5, P1.12, P4.13.
- **Notes:** Proposal key: C08.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
