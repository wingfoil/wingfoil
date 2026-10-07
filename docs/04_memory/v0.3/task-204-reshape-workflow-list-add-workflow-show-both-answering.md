---
id: "task-204-reshape-workflow-list-add-workflow-show-both-answering"
type: task
title: "Reshape `workflow list` and add `workflow show`, both answering from `HEAD`"
status: backlog
release: "v0.3"
kind: "feature"
priority: "high"
tags: ["v0.3", "workflow", "cli"]
ref: "spec-017"
bug: []
depends_on: ["task-129-refuse-operand-beyond-command-declares-exit-2-before", "task-145-replace-cli-test-helpers-fabricated-stderr-child-real", "task-161-revise-command-baseline-which-verbs-read-head-filesystem", "task-194-check-workflows-against-memory-yaml-dna-yaml-state", "task-198-deduce-workflow-instances-phase-evidence-frontier-memory-head"]
tmpl_version: 260703
---

## Description

`workflow list` today prints the raw loader result. It becomes `ListResult`: startable workflows plus includable ones that are the current phase's sub on an open instance's frontier (`executableNow`), `--all` for every workflow, `no workflows defined` for an absent manifest. `workflow show <ref>` prints the resolved declaration recursively. Both read `HEAD` (the declared R15 exception), carry `baseline` and `diagnostics`. This is the breaking change spec-017 names.

## Acceptance Criteria

- (red-first) BDD P4.6 sc. 1–4 (P4.6 sc. 2 with an open instance whose frontier enters `dev-loop`); each entry has `name, startable, includable, description, executableNow`.
- (red-first) BDD P4.7 sc. 1–3: phases with role, directive ids (spec-012 §5), actions/checks with bindings, `produces` with owner, approval/awaits/fallback, iterate/selection, mode/distinct_from, cadence, evidence kinds, subs nested under their phase; `unknown workflow: ghost` exit 1.
- (red-first) A `spec-003` error makes both exit 1 `VALIDATION` with every diagnostic in `details`; warnings are listed and exit 0.
- (red-first) `workflow list x` and `workflow show a b` are refused at exit 2 (extra operands, per `bug-171`'s rule).
- (characterization) The MCP Resources `wingfoil://workflows` and `wingfoil://workflows/{name}` keep their payload and working-tree baseline (spec-017 §9); `scripts/e2e-smoke.cjs`'s `workflow list --format json` step and `test/cli/e2e-smoke.test.ts` still pass or are updated to the new payload.

## Implementation Notes

- **Size:** M · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** spec-017 §7.5, §7.6, §8 ListResult, §9 (shipped Resources unchanged), §11; ruling R15.
- **Features:** P4.6, P4.7.
- **Notes:** Proposal key: A08. `src/core/index.ts` (`workflowList` rewritten, `workflowShow` added to `CORE_MODULES`), `src/cli`. `bug-045`'s stale op counts are touched by whoever owns that bug.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.
- **Handover from wave 3 B1 (2026-10-07, `task-194`).** `workflow list` still loads the working tree, through `task-194`'s `loadWorkflowRegistry`; moving it to `HEAD` (`spec-017` §1.1, R15) is this task's: use `loadWorkflowRegistryAtHead`. Since `task-194` it also fails (exit `1`) when `dna.yaml` or `memory.yaml` is present but invalid, as `docs/cli-reference.md` says.

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
