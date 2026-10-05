---
id: "task-185-accept-validate-executor-attributes-mode-distinct-phase-cadence"
type: task
title: "Accept and validate the executor attributes `mode` / `distinct_from` and the phase `cadence`"
status: in-progress
release: "v0.3"
kind: "feature"
priority: "medium"
tags: ["v0.3", "workflow", "schema"]
ref: "spec-003"
bug: []
depends_on: ["task-136-validate-workflows-startable-includable-resolve-phase-include-name"]
tmpl_version: 260703
---

## Description

`dl-134` §4 (c) and `dl-135` add per-phase `mode` (fresh | resume | reference, default fresh) and `distinct_from`; `dl-105` adds `cadence: once | { recurring: { cron } | { on } }`. The schema accepts none of them today (they pass only through `.passthrough()`). This task adds them with their loader rules, and implements `spec-003` open questions 3–5 by their recommendations, which were settled when spec-003 was approved at gate 5 (no new ruling needed).

## Acceptance Criteria

- (red-first) `E_PHASE_DISTINCT_FROM_UNKNOWN`, `E_PHASE_DISTINCT_FROM_SELF` and `E_PHASE_MODE_NOT_INDEPENDENT` (a `reviewer` or `qa` phase declaring `resume`/`reference`, checked on the raw declaration) fire with spec-003's messages and paths.
- (red-first) OQ4: `mode` or `distinct_from` on a phase without `role` is a loader error (`E_PHASE_EXECUTOR_WITHOUT_ROLE`, raw declaration, an absent `mode` never counts as declared). OQ5: `mode` takes exactly one value.
- (red-first) `cadence` accepts `once`, `{ recurring: { cron: "<5-field expr>" } }` and `{ recurring: { on: <event> } }`, refuses two triggers or an unknown key; the default is `once` and existing files are unchanged.
- (red-first) OQ3: an `on:` event is `<memory-type>-<state>`; the check that the type and state exist runs as a core check in task-194 (listed there).
- (characterization) `workflow list --all` / `show` (task-204) will report the parsed values; here a unit test pins the parsed shape and that no v0.3 code path enforces `distinct_from` at run time (spec-003 release boundaries).

## Implementation Notes

- **Size:** S · **wave:** 2 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** spec-003 § Execution independence, § Recurring phases; dl-134 §4 (c); dl-135 points 3–4 (schema half); dl-105 R1 (a)+(c); R2 (c); R3 (a); spec-003 open questions 3, 4, 5 (recommendations, settled at gate 5).
- **Features:** P4.1.
- **Notes:** Proposal key: A02. `src/workflow/schema.ts`. Enforcement of `distinct_from` and `tests.unchanged` stays P4.12 (v1.0, `dl-134` Action 6).
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
