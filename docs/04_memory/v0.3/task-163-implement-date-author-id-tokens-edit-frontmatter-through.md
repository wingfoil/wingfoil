---
id: "task-163-implement-date-author-id-tokens-edit-frontmatter-through"
type: task
title: "Implement the `{date}` and `{author}` id tokens and edit frontmatter through the shared setter"
status: in-progress
release: "v0.3"
kind: "fix"
priority: "low"
tags: ["v0.3", "core", "memory"]
ref: "spec-001"
bug: ["bug-033", "bug-157", "bug-158", "bug-176"]
depends_on: ["task-128-allocate-element-ids-highest-number-ref-across-folder"]
tmpl_version: 260703
---

## Description

`spec-001` declares `{date}` (UTC `YYYYMMDD`) and `{author}` (slugged `user.name`); `memory add` fails on them and `--set` refuses them with a false message (`bug-158`). `dl-107` Action 1 names a slug rule `spec-009` §1 does not hold (`bug-157`). `add.ts`'s private `setFrontmatterField` (`src/memory/add.ts:121-127`) edits indented keys and strips inline comments, while `frontmatter-edit.ts` exists unused (`bug-033`).

## Acceptance Criteria

- (red-first) `id_pattern: "bug-{date}-{slug}"` creates `bug-<UTC date>-x`; `{author}` expands to the slugged identity; the clock is read once per call through an injectable seam (tests fix it).
- (red-first) `--set date=…` is either accepted or refused with a true message (design decides, `spec-008` §10 states it).
- (red-first) `memory add` leaves nested keys and inline comments of the template intact.
- (characterization) `spec-009` §1 points to `spec-001`'s `{slug}` rule, closing `dl-107` Action 1.

## Implementation Notes

- **Size:** M · **wave:** 1 · **kind:** fix (`dl-133` Q1 (b)).
- **Implements:** spec-001 id_pattern tokens; dl-107 Action 1 (spec-009 half).
- **Features:** P1.3.
- **Notes:** Proposal key: C29.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
