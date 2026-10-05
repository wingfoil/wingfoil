---
id: "task-175-declare-phase-evidence-produces-ownership-selections-awaits-collections"
type: task
title: "Declare phase evidence: `produces` ownership, selections, `awaits`, collections and the Layer-3 bindings file"
status: in-progress
release: "v0.3"
kind: "feature"
priority: "high"
tags: ["v0.3", "workflow", "schema", "bindings"]
ref: "dl-104"
bug: []
depends_on: ["task-136-validate-workflows-startable-includable-resolve-phase-include-name"]
tmpl_version: 260703
---

## Description

A phase must say how its completion is known (`dl-104`) and every token must resolve through a binding (`dl-090`). This task adds the `produces` union (`string | { type, path }`), the path-pattern rule, typed selections, `awaits`, collection references (`dna:<path>`, `bindings:<name>`), the optional `.wingfoil/workflows/bindings.yaml` (Layer 3) with the built-in binding table, and their loader diagnostics. `dl-104` Action 2 requires the on-disk error to be removed "in the same change": `retrospective.explore`'s prose `produces` becomes a path here.

## Acceptance Criteria

- (red-first) Loader rows fire on fixtures: `E_PHASE_PRODUCES_NOT_A_PATH`, `E_PHASE_PRODUCES_OWNER_NOT_CREATED`, `E_PHASE_SELECTION_UNTYPED`, `E_BINDING_PARTIAL_INTERPOLATION`, `E_BINDING_BUILTIN_TOKEN`, `E_BINDING_AGENT_CHECK`, `W_WORKFLOW_UNBOUND_TOKEN` (warning in v0.3, exit 0), `W_PHASE_PRODUCES_OWNER_IMPLICIT`, `W_PHASE_ACTION_UNTARGETED`.
- (red-first) `bindings.yaml` validates per Layer 3: exactly one of `run`/`manual`, `run` min 1, `severity` warn|reject default reject, `args` patterns, `collections` with unique keys matching spec-009's ID class; an absent file is no bindings.
- (red-first) The built-in bindings resolve without a `bindings.yaml`: `memory.*` → `wingfoil` with argv; `element.set_state` / `<type>.set_state` / `<type>.sync_state` / `element.set_release` → `manual`; `config.init` → `wingfoil init`; `agent.*` → `agent` (spec-003 built-in table). A resolver function returns `{ kind, argv?, expectedCommit? }` for any token (consumed by task-216).
- (red-first) `retrospective.yaml`'s `explore.produces` is a path pattern (the friction inventory's file), with a `version:` bump; after this task the repository's workflows load with **zero errors** (spec-003 § Diagnostics "Measured"), pinned by a characterization test that task-199 extends.
- (characterization) SARD amended per `dl-090` Action 2: a REQ-SEC requirement for token arguments (argv only, ID class or declared pattern, no shell) in `05_security-compliance.md`, and a REQ-INT-04 clause for check exit codes (0 pass / 1 fail → fallback / 2 misconfiguration, blocked) in `04_integrations.md`, each with a `doc-versioning` bump and traceability to `dl-090`.

## Implementation Notes

- **Size:** M · **wave:** 2 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-104 D1 (c), D2 (b), D3, D4, D5 (b), Actions 1 (spec half), 3; dl-090 Q1 (a), Q2 (c), Q3 (a), Q4, Q5 (c), Q6 (a)+(b), Actions 1, 2; spec-003 § Evidence, § Selections, § Collections, § Action expressions (built-in table), § Check expressions, Layer 3.
- **Features:** P4.1, P4.11, P4.13.
- **Notes:** Proposal key: A03. `src/workflow/schema.ts`, a new `src/workflow/bindings.ts`, `src/core/loaders.ts`, `.wingfoil/workflows/custom/retrospective.yaml`. The real `bindings.yaml` for this repository is task-199's.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
