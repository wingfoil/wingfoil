---
id: "task-179-give-missing-operand-unknown-command-errors-shape-spec"
type: task
title: "Give missing-operand and unknown-command errors the one shape `spec-005`/`spec-008` declare"
status: backlog
release: "v0.3"
kind: "fix"
priority: "medium"
tags: ["v0.3", "core", "cli", "errors"]
ref: "spec-005"
bug: ["bug-104", "bug-168", "bug-180", "bug-198", "bug-226", "bug-245"]
depends_on: ["task-129-refuse-operand-beyond-command-declares-exit-2-before", "task-130-show-coreerror-details-surface-give-refusal-shape-under"]
tmpl_version: 260703
---

## Description

The missing-operand line names `memory submit <id>` for Memory/directive verbs but a full `wingfoil dna update <path> --value <value>` usage for DNA verbs (`bug-168`). The unknown-command suggestion is Commander's `(Did you mean memory?)` rather than `spec-005` §3.1's `hint:` line, and a test pins Commander's wording (`test/cli/commander-parse-exit-codes.integration.test.ts:174`; `bug-104`). v0.3 adds many verbs, so the new ones must be born consistent.

## Acceptance Criteria

- (red-first) every verb with a required operand prints the one `spec-008` form when it is missing, exit 2 (table-driven over the registry).
- (red-first) `wingfoil memry` prints the `hint:` line through `src/cli/error.ts`, exit 2; the Commander-wording test is rewritten.
- (characterization) `bug-115`/`bug-116` (v0.4) stay out of scope; their text is not changed.

## Implementation Notes

- **Size:** S · **wave:** 2 · **kind:** fix (`dl-133` Q1 (b)).
- **Implements:** spec-005 §3.1 (`hint:` line); spec-008 §4/§5.
- **Features:** P5.1.4.
- **Notes:** Proposal key: C10.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
