---
id: "task-202-deduce-iterate-over-over-memory-types-collections-live"
type: task
title: "Deduce `iterate_over` over Memory types and collections, live queries, optional and archived phases"
status: in-progress
release: "v0.3"
kind: "feature"
priority: "high"
tags: ["v0.3", "workflow", "deduction"]
ref: "spec-017"
bug: []
depends_on: ["task-198-deduce-workflow-instances-phase-evidence-frontier-memory-head"]
tmpl_version: 260703
---

## Description

`release-cycle` and `release-line-cycle` iterate over tasks and releases; `where` splits into an entry filter (`status`) and a scope filter so an element the sub moved on stays counted; collection entries iterate in declared order; a live query stops reopening once a later phase is complete (`late` candidates); optional phases are skipped; archived elements (`deprecated`, `superseded` on adr/tech-spec, `dl-065`) are never eligible and an archived bound element abandons its instance.

## Acceptance Criteria

- (red-first) BDD P4.16 sc. 1–3: 3 backlog + 1 done task → 3 iterations; a plain include runs once; zero matches → vacuously complete with note `no elements matched the iterate_over filter`.
- (red-first) Eligible / entered / complete classification of §4.6, including a task moved from `backlog` to `in-progress` by `dev-loop.start` staying entered; list-valued `where` fields match on shared elements (`tags: ["{release.version}"]`).
- (red-first) `iterate_over: dna:modules` and `bindings:<name>` iterate entries in declared order, keyed per spec-003 § Collections, with `{item}` / `{item.<field>}` interpolation.
- (red-first) §4.7: after a later phase completes non-vacuously, a newly matching candidate is reported `late`, not put back on the frontier; a vacuous completion never makes an earlier phase complete or skipped.
- (red-first) §4.10 optional skip; §4.11 `abandoned: true` with an empty frontier when the bound element is `deprecated`.
- (characterization) REQ-STATE-07's fit criterion in `docs/02_requirements/03_sard/03_state-context.md` reads N as the eligible plus entered candidates and counts collection entries (`dl-104` Action 1; spec-017 §4.6), with a `doc-versioning` bump.

## Implementation Notes

- **Size:** M · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** spec-017 §4.6, §4.7, §4.10, §4.11; dl-104 D2 (b), Action 1 (SARD half); REQ-STATE-07.
- **Features:** P4.16, P4.13.
- **Notes:** Proposal key: A06.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.
- **Handover from wave 3 B2 (2026-10-07, `task-198`).** `task-198` removed the `iterate_over` `item` scope, dead until this task: put it back in `elementKey` (it now casts the scope to `{element}`) and in `hasRecord` (it now requires `record.item === null`) in `src/workflow/deduce.ts`. An `iterate_over` phase is reported as one unexpanded leaf until this task expands it.

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
