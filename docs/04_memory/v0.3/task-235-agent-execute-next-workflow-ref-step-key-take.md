---
id: "task-235-agent-execute-next-workflow-ref-step-key-take"
type: task
title: "`agent execute --next`, `--workflow <ref>` and `--step <key>` take workflow, phase, element and role from the workflow's frontier"
status: backlog
release: "v0.3"
kind: "feature"
priority: "high"
tags: ["v0.3", "agent", "workflow", "cli"]
ref: "spec-016"
bug: []
depends_on: ["task-185-accept-validate-executor-attributes-mode-distinct-phase-cadence", "task-216-add-workflow-next-naming-next-step-verb-role", "task-228-agent-execute-launches-agent-forwards-right-signals-records"]
tmpl_version: 260703
---

## Description

This task wires `spec-017`'s deduction into step 1 of the resolution: - `--workflow <ref>` selects the instance, and `--step <key>` selects a frontier step (either one implies `--next`); without `--step` the step is `NextResult.next`; - the element comes from `--element`, else the step's scope element, else the instance's bound element; - the role comes from `--role`, else the step's `role`. The run record carries the workflow and phase, and `n` counts per `(element, phase)`. Every v0.3 run is `fresh` whatever the phase allows. `distinct_from` is not checked (P4.12, v1.0).

## Acceptance Criteria

- (red-first) P5.3.1 sc. 1: with an active instance whose next step targets `task:<id>` as `developer`, `agent execute --next` launches the fake as `developer` on that element. The record has the step's `workflow` and `phase` and id `<id>/<phase>/1`.
- (red-first) P5.3.1 sc. 3: `next: null`, or no open instance → exit 1 `no next step to execute`, and no process is spawned.
- (red-first) P5.3.2 sc. 1–2: the role comes from the step. sc. 3: a step role not in DNA → exit 1 `step role 'ghost' not defined in dna.yaml` (verbatim).
- (red-first) `--step <key>` not on the frontier → `CONFLICT` `step '<key>' is not on the frontier of <instance>`. `--workflow` naming no workflow → `unknown workflow: <name>`; no open instance → `workflow is not open: <ref>`. `NO_STEP_ELEMENT` and `NO_STEP_ROLE` use their §3.7 messages.
- (red-first) With two parallel frontier steps, `--workflow <instance> --step <key>` launches on the named one. This is the `agent` binding argv of `spec-017` §6.1, run as written.
- (red-first) A phase declaring `mode: [fresh, resume]` still runs `fresh` and prints no warning. `--resume` → exit 2 (v0.4).
- (characterization) BDD `P5.3.1` / `P5.3.2` gain scenarios for `--workflow`, `--step` and the recorded `mode`, with a `doc-versioning` note. The `--resume`-refused-on-a-fresh-only-phase scenario is written tagged v0.4. `spec-008` / `cli-reference` `agent execute` entries are updated if task-228 did not already carry the step flags.

## Implementation Notes

- **Size:** M · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** spec-016 §3.1 (`--next`, `--workflow`, `--step`), §3.2 steps 1–3, §3.7 (step rows); R16; dl-135 point 3 (v0.3: `fresh` only).
- **Features:** P5.3.1, P5.3.2.
- **Notes:** Proposal key: B11.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.
- **Handover from wave 3 B4 (2026-10-10, `task-216`'s independent review; W3 B4 follow-ups,
  `bug-ingest-rel-v0.3-w3b4-review-findings-plan`).** `workflow next` (`task-216`) prints a `bug.sync_state` manual
  action without the aggregate rule of `dev-loop.yaml` `done`'s `bug.sync_state(for_each: task.bug)` ("in-review ->
  resolved -> closed (once all ITS tasks are done)"): `task-216`'s decision 5 says "a `sync_state` ignores the
  aggregate 'all tasks of the bug' rule". So `next` can print a sync the dev-loop would not make yet, for a bug that
  another open task also names. This task consumes that output (`NextResult`): apply the rule before reporting or
  acting on a sync step — a bug moves past `in-review` only when every task whose `bug:` list names it is `done` —
  and pin a two-task fixture.

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
