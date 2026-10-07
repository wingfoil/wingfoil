---
id: "task-198-deduce-workflow-instances-phase-evidence-frontier-memory-head"
type: task
title: "Deduce workflow instances, phase evidence and the frontier from Memory at `HEAD`"
status: in-progress
release: "v0.3"
kind: "feature"
priority: "high"
tags: ["v0.3", "workflow", "deduction", "determinism"]
ref: "spec-017"
bug: []
depends_on: ["task-137-read-pillar-configuration-memory-documents-any-commit-not", "task-171-make-memory-scan-primitives-fail-closed-archived-elements", "task-175-declare-phase-evidence-produces-ownership-selections-awaits-collections", "task-194-check-workflows-against-memory-yaml-dna-yaml-state"]
tmpl_version: 260703
---

## Description

The heart of v0.3: one pure deduction over `HEAD` that every consumer (`next`, `status`, `list`, MCP, `agent execute --next`) calls. Open instances are `plan` elements (`workflow` field, `draft|active`, no `parent`), ordered by start commit; phases are evaluated sequentially from their declared evidence (state, produces, selection, include, record); the frontier is the list of leaf steps with keys `<workflow>.<phase>[@<type>:<id>]`. `iterate_over`, the linkage/re-entry parts of the history walk and optional/archived rules are task-202/task-203.

## Acceptance Criteria

- (red-first) Instances: a fixture repo with three `plan` files (one `done`, one `active` sub-plan with `parent`, two open mains) yields exactly the open mains, most recently started first by `git rev-list --topo-order`, the first `active: true` (spec-017 §3.2–§3.3); `<ref>` resolves a workflow name (most recent open instance) or an instance id, else `workflow is not open: <ref>`.
- (red-first) Evidence kinds `state`, `produces` (string entries resolved, `/`-suffixed patterns match a committed file below), `selection`, `include` (plain), `record` (a commit in the instance's walk carrying `WingFoil-Phase: <w>.<p> completed`, `WingFoil-Instance`, `WingFoil-Element`/`WingFoil-Item`) each complete a phase on a fixture, and an implicit-owner `produces` is shown but not evidence (§4.3). A checkpoint completes only by a record.
- (red-first) Tolerant reads: a Memory file with unparseable frontmatter, no `status`, or a status outside its machine is excluded and reported (`W_MEMORY_UNREADABLE`, `W_MEMORY_INVALID_STATE` with message `invalid state '<status>' for type '<type>' in <file>`, BDD P4.13 sc. 3); the deduction never throws on them.
- (red-first) `W_UNCOMMITTED_INPUTS` names the dirty paths under the Memory paths, `.wingfoil/workflows*`, `produces:` patterns and `paths.runs`, and the answer is still computed from `HEAD` (§1.2); a test proves the same result with and without the dirty file.
- (red-first) Determinism: two runs at one commit give byte-identical JSON; Memory is enumerated from `HEAD`'s tree in sorted path order; no `Date.now`/random in `src/workflow` or the deduction module (a grep-based test, the `determinism` directive).
- (red-first) BDD P4.13 sc. 1–2: task `in-progress` / release `releasing` are reported at the phase whose exit state they sit before, derived only from Memory (no `.wingfoil/state/`).
- (characterization) BDD P4.11 sc. 1–3 still hold (pinned by `test/memory/state-machine.test.ts:461` and the `memory add` suites since `task-036`); the deduction reuses `validateFrontmatterState` rather than re-implementing the membership rule.

## Implementation Notes

- **Size:** L · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** spec-017 §1 (baseline, W_UNCOMMITTED_INPUTS, determinism orders, tolerant reads), §3.1–§3.3, §3.4 "Declared" and "None", §3.5, §4.1–§4.5, §4.8 records, §4.9; adr-007; adr-008.
- **Features:** P4.13, P4.16, P4.11.
- **Notes:** Proposal key: A05. new `src/workflow/deduce*.ts` (pure, fed a HEAD snapshot) + a `src/core` reader for the snapshot and the git walk. Spec-017 §1.4's tolerant read is local to deduction; `bug-031` (search/by-id) stays with the Memory domain's task.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.
- **Handover from wave 3 B1 (2026-10-07, `task-194`).** Load through `loadWorkflowRegistryAtRev` / `loadWorkflowRegistryAtHead` and reuse `workflowExitStates` / `iterationStartState`, all from the `src/core` barrel: every input is read at one sha. Since `task-194`'s review, a typed `<T>.set_state(s)` on a selection of type `T` moves nothing and holds each selected gate whose approve target is `s` (`spec-017` §4.2, §5.1); `run` and `created` are unchanged.

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
