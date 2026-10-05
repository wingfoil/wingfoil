---
id: "task-199-align-wingfoil-workflows-custom-v0-3-schema-commands"
type: task
title: "Align `.wingfoil/workflows/custom/` with the v0.3 schema and commands, bind every token, and pin zero load errors"
status: backlog
release: "v0.3"
kind: "feature"
priority: "high"
tags: ["v0.3", "workflow", "configuration", "dogfooding"]
ref: "spec-003"
bug: ["bug-224"]
depends_on: ["task-126-declare-closed-wf-operation-grammar-bracket-set-state", "task-175-declare-phase-evidence-produces-ownership-selections-awaits-collections", "task-185-accept-validate-executor-attributes-mode-distinct-phase-cadence", "task-194-check-workflows-against-memory-yaml-dna-yaml-state"]
tmpl_version: 260703
---

## Description

The minor-v0.3 success criterion: every workflow under `.wingfoil/workflows/custom/` loads through the workflow commands with zero errors. Beyond task-175's `retrospective.explore` fix, this task rewrites the nine implicit-owner `produces` in `{ type, path }` form, gives `end-of-life.deprecate` a selection, rewrites `release-planning.build-backlog`'s `{dl.id}`/`{bug.id}` against a selection, removes `git.create_branch`'s partial interpolation (OQ6: `key: value` form, prefix into the binding), splits `e2e-smoke`'s `cli.run("…; …")`, reduces `agent.<x>` actions to `agent.execute` (the instruction moves to the phase `description`, carried by the role's session prompt, `dl-090` Q6 (b)), gives the approval-only phases their Memory action where one exists (`retrospective.approve` = `wf(decision-log): approve retro-{version}`), and writes the first `.wingfoil/workflows/bindings.yaml` (the `dev-loop.refactor.checks.post` bindings that today live in a comment first, then every remaining project token).

## Acceptance Criteria

- (red-first) A characterization-style test loads every workflow at `HEAD` through task-194's function and asserts **zero errors**, plus the exact remaining warning set (codes and paths), so any regression in files or loader is caught (spec-017 §12 last paragraph).
- (red-first) `W_PHASE_PRODUCES_OWNER_IMPLICIT` × 9, `W_PHASE_TOKEN_OUT_OF_SCOPE` × 2 and `W_PHASE_ACTION_UNTARGETED` × 1 are gone; `W_WORKFLOW_UNBOUND_TOKEN` counts only tokens deliberately left unbound, each listed in Execution Notes with its reason.
- (characterization) `workflow show dev-loop` reports each `agent` step as `wingfoil agent execute --workflow <id> --step <key>` and each `set_state` / `sync_state` as `manual` with a declared-verb subject (task-126's list only).
- (characterization) `spec-017` §12's deduction consequences re-measured and recorded: the 28 checkpoint phases and 7 finalize-approval phases listed, and each `produces` rewritten in D3 form no longer mis-completes `dev-loop.design` or `plan-next-release-line`.
- (characterization) Every edited file gets its `version:` bump with a one-line reason in its header comment (`doc-versioning`); `workflows.yaml` too if touched.
- (characterization) `dl-025` remainder (E sweep): `release-line-cycle.yaml`'s `plan-next-release-line` runs `user-docs`' `align-agent-docs` phase (the ratified open question: reuse the same phase), with a `version:` bump citing `dl-025`; the workflow loads with zero errors.

## Implementation Notes

- **Size:** L · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** spec-003 Consequences (alignment list) and OQ6; spec-017 §12; dl-104 Action 2; dl-090 Action 3; dl-079 (verbs in config); plan idea 7; dl-025 remainder (`plan-next-release-line` reuses `align-agent-docs`).
- **Features:** P4.1, P4.11.
- **Notes:** Proposal key: A17. `dev-loop.yaml`'s v1.5 *content* changes are task-205 (after this task, same file). Anyone adding a later workflow (task-212, the `dl-089`/`dl-100` phases) must keep task-199's test green. `bug-134` (`e2e-smoke`'s missing `produces:`) is task-207's, which depends on this task; if its absence leaves a warning here, it is listed with the others. `.wingfoil/workflows/custom/` is also edited later by task-205, task-213, task-221, task-219, task-230, task-222, task-215 — each keeps this task's zero-error test green.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.
- **Triage of 2026-10-05 (`bug-224`, split):** only the `initial-design.yaml` `produces:` bare
  `{release-line}` is in scope here (bind it to the release-line's id or version explicitly). Refusing a
  `memory add` release-line value that names no release-line is a separate v0.4 bug.

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
