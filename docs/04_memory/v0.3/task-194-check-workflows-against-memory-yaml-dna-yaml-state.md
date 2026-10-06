---
id: "task-194-check-workflows-against-memory-yaml-dna-yaml-state"
type: task
title: "Check workflows against `memory.yaml`, `dna.yaml` and the state machines at `HEAD`"
status: in-progress
release: "v0.3"
kind: "feature"
priority: "high"
tags: ["v0.3", "workflow", "validation"]
ref: "spec-003"
bug: ["bug-150"]
depends_on: ["task-175-declare-phase-evidence-produces-ownership-selections-awaits-collections", "task-185-accept-validate-executor-attributes-mode-distinct-phase-cadence"]
tmpl_version: 260703
---

## Description

`bug-150`: a phase naming an undefined role or Memory type loads silently. The core checks need `memory.yaml`, `dna.yaml` and `roles.yaml` at `HEAD`, so they run in the workflow operations of `src/core`, not in the pillar-isolated loader (spec-003 "Where each check runs"). This task adds them and exposes one function that returns the full registry + ordered diagnostics for every workflow command.

## Acceptance Criteria

- (red-first) `E_PHASE_ROLE_UNKNOWN` (`unknown role '<role>' (not defined in dna.yaml)`), `E_PHASE_APPROVER_UNKNOWN`, `E_WORKFLOW_ELEMENT_TYPE_UNKNOWN`, `E_WORKFLOW_COLLECTION_UNRESOLVED`, `W_PHASE_TOKEN_OUT_OF_SCOPE`, `W_PHASE_EXIT_STATE_UNDETERMINED`, `W_PHASE_FALLBACK_STATE_MISMATCH`, `W_PHASE_FALLBACK_NOT_REENTRANT` each fire on a fixture, in spec-003 order after the loader diagnostics (`bug-150`'s `role: nobody` / `memory.add(type: nonsense)` reproduction is one fixture).
- (red-first) A cadence `on:` event whose `<type>` or `<state>` is not in `memory.yaml` is a validation error (OQ3 recommendation, code named at design).
- (red-first) The exit-state computation of spec-017 §4.4 (static application of a phase's actions along the machine, the `set_state` verb rule of spec-003) is a pure function unit-tested on `dev-loop`, `release-planning.commit-backlog` and `bug-ingest.triage` fixtures; it is reused by task-198.
- (red-first) Every read is at `HEAD`: a test with a dirty `dna.yaml` that removes a role still validates against the committed roles.
- (characterization) On this repository the core checks raise exactly spec-017 §12's set (2 × `W_PHASE_TOKEN_OUT_OF_SCOPE` at `release-planning.yaml:118,120`, 1 × `W_PHASE_FALLBACK_NOT_REENTRANT` on `bug-ingest.triage`) and no error — recorded; task-199 then removes the removable ones.

## Implementation Notes

- **Size:** M · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** spec-003 § Diagnostics "core" rows; spec-017 §2; spec-003 OQ3 (event names).
- **Features:** P4.1, P4.14, P4.15.
- **Notes:** Proposal key: A04. `src/core/workflow-*.ts` (new), `src/core/loaders.ts`. Relies on the existing HEAD readers (`loadDirectivesAtHead` pattern).
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
