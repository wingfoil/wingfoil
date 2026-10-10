---
id: "task-225-add-workflow-status-pending-approvals-role-routing-fallback"
type: task
title: "Add `workflow status` with pending approvals, role routing, fallback and \"human needed\" lines"
status: backlog
release: "v0.3"
kind: "feature"
priority: "high"
tags: ["v0.3", "workflow", "cli", "approvals", "notifications"]
ref: "spec-017"
bug: []
depends_on: ["task-216-add-workflow-next-naming-next-step-verb-role"]
tmpl_version: 260703
---

## Description

`workflow status [<ref>]` lists every open instance (active first) with phase progress, frontier, pending approvals and `late` candidates, then the ungated elements (elements sitting in a gate state no open instance carries). Approvals are detected on every carrier (bound, selection, created, typed `set_state` targets) and routed `by_role` / `by_person` to `dna.yaml` members; the fallback step is reported after a reject; the CLI output is the v0.3 notification channel.

## Acceptance Criteria

- (red-first) BDD P4.5 sc. 1–3 (both open workflows listed; `--format json|yaml` valid; `no open workflows` exit 0).
- (red-first) BDD P4.14 sc. 1–3: routed to Morgan by role, to Casey by person, and `routedTo: []` with `routingError: "no approver found for role 'approver' in dna.yaml"` (reported, exit 0); a routed member without the `approver` role raises `W_APPROVAL_ROLE_WITHOUT_AUTHORITY`.
- (red-first) BDD P4.15 sc. 1–2 as amended: after a reject the position moves to the `fallback.step` with `reentered: true`, the reject commit and the declared `set_state`; the state is the reject target (spec-017 §5.2). `dev-loop.done`'s fallback is reported only.
- (red-first) BDD X1.1 sc. 1–2 and X1.2 sc. 1: a "human needed" line names the action (`approve or reject`, or `finalize`), the element id(s) or step key and the routed members; none for automated steps.
- (red-first) The seven approval phases no element carries (§5.1 list) await a finalize record once their other evidence is satisfied (`recordNeeded: true`).
- (characterization) BDD files amended per spec-017 Consequences: P4.14 sc. 1 "recorded" → "reported"; P4.15 sc. 1 fixture keeps reject target = `set_state` (v0.3 note), sc. 2 "has the reject target's state", sc. 3 becomes a `workflow list` validation failure; X1.1 Background "notifications enabled" and sc. 3, X1.2 sc. 2 moved to v0.4 (tagged), X1.2 sc. 3 message aligned to P4.14's — each file with a `doc-versioning` bump.

## Implementation Notes

- **Size:** M · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** spec-017 §5.1–§5.4, §7.4, §8 StatusResult/PendingApproval; ruling R13; dl-033 (the P4.14 routing clause: `by_person` override).
- **Features:** P4.5, P4.14, P4.15, X1.1, X1.2.
- **Notes:** Proposal key: A10.
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
