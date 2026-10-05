---
id: "task-156-state-what-format-console-prints-today-until"
type: task
title: "State what `--format console` prints today, until P5.1.4 gives it a human rendering"
status: in-progress
release: "v0.3"
kind: "fix"
priority: "low"
tags: ["v0.3", "core", "cli", "docs"]
ref: "spec-008"
bug: ["bug-152", "bug-203"]
depends_on: []
tmpl_version: 260703
---

## Description

`console` (the default) falls back to indented JSON (`src/cli/output.ts`), while `spec-008` §2 promises colour and `✓/⚠/✗` (`bug-152`). The rendering is `dl-043`'s decision, deferred to v0.4 at gate 3 (F2). The honest v0.3 fix declares the fallback; the alternative is to pull `dl-043` into v0.3 and replace this task with its generic renderer (M).

## Acceptance Criteria

- (characterization) `spec-008` §2 and `docs/cli-reference.md` state that `console` prints indented JSON until P5.1.4, citing `dl-043`; `--help` text matches.
- (red-first) a test pins that the default output equals `--format json`'s indented form, so the v0.4 change is a visible, deliberate break.

## Implementation Notes

- **Size:** S · **wave:** 1 · **kind:** fix (`dl-133` Q1 (b)).
- **Implements:** spec-008 §2 (`console` row).
- **Features:** P5.1.4.
- **Planning ruling:** Approver ruling 2026-09-30 (plan R20, Q2): documentation-only fix in v0.3; the human rendering of `console` stays with `dl-043` in v0.4.
- **Notes:** Proposal key: C46.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
