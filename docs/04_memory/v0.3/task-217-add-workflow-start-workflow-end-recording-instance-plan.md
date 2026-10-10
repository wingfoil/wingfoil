---
id: "task-217-add-workflow-start-workflow-end-recording-instance-plan"
type: task
title: "Add `workflow start` and `workflow end`, recording each instance as a `plan` element"
status: in-progress
release: "v0.3"
kind: "feature"
priority: "high"
tags: ["v0.3", "workflow", "cli", "memory"]
ref: "spec-017"
bug: []
depends_on: ["task-126-declare-closed-wf-operation-grammar-bracket-set-state", "task-128-allocate-element-ids-highest-number-ref-across-folder", "task-129-refuse-operand-beyond-command-declares-exit-2-before", "task-203-read-instance-history-walk-step-linkage-created-elements"]
tmpl_version: 260703
---

## Description

`start <name> [--element <type>:<id>] [--title] [--set phase=|scope=]` refuses a non-startable workflow, resolves the element (declared, inherited from the active instance, context, or self-creating), derives the plan tokens (phase = element id else `1`, with a `-<n>` collision suffix checked on every ref per `dl-101`; scope = workflow name) and writes `wf(plan): add` then `wf(plan): submit` through the Memory verbs. `end [<ref>]` refuses an incomplete or draft instance and writes `wf(plan): finalize <id> [active → done]`.

## Acceptance Criteria

- (red-first) BDD P4.2 sc. 1–3 with the positional `<name>`: the instance becomes active and its first step is printed; a second start makes the new one active; `cannot start a sub workflow directly: dev-loop` exit 1, nothing written.
- (red-first) BDD P4.3 sc. 1–3 with complete instances: `end` closes it and reports the now-active one; `no active workflow to end` exit 1; a new scenario: `workflow '<name>' is not complete: current step <key>` exit 1 with the `memory deprecate` hint.
- (red-first) Each `start` commit touches only the plan file (`verifyCommittedScope`); a failing second commit leaves the plan `draft` and names `wingfoil memory submit <id>`; a project without a `plan` type is refused with spec-017 §10's message.
- (red-first) Element errors of §10: `needs a <type> element`, `element not found: <type>:<id>`, `plan id already exists: <id>` (`CONFLICT`) for a colliding `--set phase=`.
- (characterization) `.wingfoil/memory.yaml` / the plan template gain the optional `parent` field; `src/storage/templates.ts` declares the `plan` type in `init`'s scaffold (spec-017 Consequences, `templates.ts:171`); a fresh `init` can `workflow start` without edits.
- (characterization) `spec-008` §1/§7 carry the `workflow` grammar of spec-017 §7 and `--element`; REQ-STATE-03's `--name` wording and BDD P4.2/P4.3 `--name <w>` become the positional (spec-017 Consequences), with `doc-versioning` bumps.

## Implementation Notes

- **Size:** M · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** spec-017 §3.1, §3.4 (element resolution), §3.5, §7.1, §7.2, §10; ruling R18; dl-109 K2 (a)→(b); REQ-STATE-03.
- **Features:** P4.2, P4.3.
- **Notes:** Proposal key: A12. the grammar lines for `memory add --workflow/--step` are task-227's; `agent execute --step` is the agent domain's.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
