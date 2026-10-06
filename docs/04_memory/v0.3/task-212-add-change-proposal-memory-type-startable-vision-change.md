---
id: "task-212-add-change-proposal-memory-type-startable-vision-change"
type: task
title: "Add the `change-proposal` Memory type and the startable `vision-change` workflow"
status: backlog
release: "v0.3"
kind: "feature"
priority: "medium"
tags: ["v0.3", "workflow", "memory", "vision", "configuration", "process"]
ref: "dl-132"
bug: ["bug-270"]
depends_on: ["task-199-align-wingfoil-workflows-custom-v0-3-schema-commands"]
tmpl_version: 260703
---

## Description

After inception the vision can only be changed by hand. `dl-132` adds a `change-proposal` type (`kind: feature | vision`, machine `draft → in-analysis(→ draft) → accepted → scheduled`, plus `deprecated`), its template (the change, the impact analysis per layer with explicit "no impact" entries, the target release), and a startable `vision-change` workflow: capture → impact analysis (approval gate) → scoped downcast (includes the existing `user-story-mapping`, `specification-by-examples`, `volere-requirements` only for the layers the analysis names) → schedule (assigned to a release in the sequencer and the release's `features:`). Configuration only (REQ-SYS-04: a new type needs no code).

## Acceptance Criteria

- (red-first) `memory add --type change-proposal` → `memory submit` → `memory approve` / `reject` walk the declared machine on a fixture copy of this repository's config, with no source change (REQ-SYS-04 fit criterion).
- (red-first) `vision-change` loads with zero errors (task-199's test), is `startable`, its capture phase is self-creating (`memory.add(type: change-proposal)`), and `workflow show vision-change` nests the three included subs.
- (characterization) `COLLABORATION.md` *What you can contribute* gains the fifth row; `.wingfoil/README.md` / `WORKFLOW.md` list the new type and workflow; `memory.yaml` and `workflows.yaml` version bumps.
- (characterization) The downcast subs accept being included from a second workflow (they are `kind: sub` and element-compatible), checked by the loader.
- (characterization) `memory.yaml` declares `change-proposal`'s path and `id_pattern`; its template has sections for the change, the per-layer impact analysis (P / US / BDD / REQ / tasks, an explicit "no impact" allowed per Q2 (ii)) and the target release (from proposal D13).
- (characterization) The REQ-SYS-04 walk is also run on a scratch clone of this repository with the worktree build, transcript in Execution Notes; `WORKFLOW.md` draws `vision-change` and task-148's phase-name test stays green.

## Implementation Notes

- **Size:** M · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-132 Q1 (a), Q2 (ii), Q3 (x), Actions 2–4; dl-109 (startable).
- **Features:** P1.13, P4.1.
- **Notes:** Proposal key: A20 (merged: D13). the feature id for the process (`dl-132` Action 5) is the first output of the process itself, not this task. Merged with proposal D13 (same `dl-132` configuration). A Persona-7 journey (`dl-113`, task-186) is the process's natural first input.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
