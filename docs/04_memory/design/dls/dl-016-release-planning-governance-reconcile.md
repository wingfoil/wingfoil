---
id: "dl-016-release-planning-governance-reconcile"
type: decision-log
title: "Reconcile accumulated governance elements at release-planning (triage-bugs + reconcile-governance phases; uniform `release` assignment)"
status: ready
context: "process"
release: "v0.2"
tmpl_version: 260703
---

## Context

The four "base documents" — **adr, decision-log (DL), tech-spec, bug** — are created at any point in
the dev cycle: they start at `draft` and always move to their first working state
(`pending`/`in-discussion`/`open`) so there is content to work on. From there they can either

- **(path a) continue their own ingest flow immediately** (approved and pulled into the *current*
  work, e.g. to unblock the task in progress), or
- **(path b) sit in their pre-gate state until the next release planning**, where they are selected,
  approved, and scheduled.

`release-planning`'s downstream phases **consume** these elements in an already-decided state, but the
workflow has **no phase that brings the accumulated ones into that state**:

- `build-backlog` converts **DLs in `ready`** into task(s) and pulls **bugs in `triaged`** to create
  fix task(s) (bug `triaged → planned`).
- `identify-specs` consumes **tech-specs in `approved`** so tasks can reference them.

The consequence for elements raised *during* the previous delivery (e.g. dl-013/dl-014/dl-015 all
`in-discussion`; any bug left `open`): nothing in `release-planning` moves them forward, so they are
**silently skipped** and stay stuck until someone runs their originating ingest's `approve` gate by
hand. This contradicts the determinism principle (REQ-SYS-07 / REQ-STATE-09: prefer explicit declared
transitions over inferred/forgotten ones) and P1.13 (derive-from-state).

Per-type state today:

| Element | Approval transition | Where it happens today | Reconciled by release-planning? |
|---|---|---|---|
| decision-log | `in-discussion → ready` | `decision-log-ingest`/`approve`, `initial-design`/`seed-dls` | **No** — build-backlog consumes `ready`, nothing produces it |
| bug | `open → triaged` | `bug-ingest`/`triage` (tech-lead) | **No** at planning — build-backlog consumes `triaged`, nothing produces it there |
| tech-spec | `pending → approved` | `identify-specs`, `initial-design`/`seed-specs`, `dev-loop`/`design` | **Yes** — `identify-specs` surveys scope + approves (self-healing) |
| adr | `pending → accepted` | `adr-ingest`/`approve`, `initial-design`/`seed-adrs` | **No** — `record-adrs` does add+submit but **no approve**; leaves `pending` |

Two latent inconsistencies compound this:
1. `memory.yaml`'s `decision-log` `waiting` note claims release-planning converts `ready` DLs into
   tasks, but `build-backlog` has **no explicit DL→task action**. The consumer side is under-specified.
2. `record-adrs` creates ADRs without approving them — a traceability-hygiene gap (a task may cite a
   not-yet-`accepted` ADR).

A separate finding (recorded in `dl-017-decision-log-remove-delivery-states`): the DL states
`in-develop`/`done` introduced by `dl-012` presuppose a task→DL back-reference that was never
implemented. dl-017 removes those states, so under this DL a DL pulled into a release **stays at
`ready`** and does not advance further.

## Decision


### 1. Uniform `release` field for selection

Give every base document a **`release`** field with a single meaning — *the release this element's
implementation is assigned to* — uniform with `task.release`:

- **adr, tech-spec:** add `release`.
- **decision-log:** the existing `release` field takes this meaning (semantics clarified).
- **bug:** rename the existing `release` (which means "found in") to **`release-origin`**, and add the
  new **`release`** (the fix/implementation release).
- **task:** unchanged — its required `release` already is this field.

**Selection filter** (used by every planning phase that considers accumulated elements): pick elements
whose `release` is **empty** OR **`== {release in planning}`**. This prevents re-discussing or
re-pulling elements already assigned to another release, and fixes the "immediately-approved elements
would be ignored" case (an approved-but-unassigned element has empty `release`, so it is re-offered).

### 2. Two new phases + `record-adrs` approve; explicit assignment in `build-backlog`

Updated `release-planning` phase sequence:

```
define-scope → triage-bugs → reconcile-governance → record-adrs → identify-specs → build-backlog → commit-backlog
```

| # | Phase | Role | Actions & transitions | Gate | Sets `release`? |
|---|---|---|---|---|---|
| 1 | define-scope | product-owner | `memory.submit` → release `draft→planning` | — | — |
| 2 | **triage-bugs** *(new)* | tech-lead | select in-scope `open` bugs → `memory.approve` (`open→triaged`) | approver · reject→`closed` | no |
| 3 | **reconcile-governance** *(new)* | product-owner / approver | sweep accumulated not-ready in-scope governance: DL `in-discussion→ready` (+ optional adr `pending→accepted`). **Idempotent** — acts only on pre-gate elements | approver · reject→`draft` | no |
| 4 | record-adrs *(modified, optional)* | architect | `memory.add(adr)` + `memory.submit` (`draft→pending`) + **`memory.approve`** (`pending→accepted`) ← added | approver | (stamped in build-backlog) |
| 5 | identify-specs | architect | `agent.survey_specs` + `memory.add(tech-spec)` + `memory.submit` (`draft→pending`) + `memory.approve` (`pending→approved`) | approver | (stamped in build-backlog) |
| 6 | **build-backlog** *(modified)* | product-owner | create tasks (`draft→pending`); convert each in-scope `ready` DL into task(s) (**DL stays `ready`**); per `triaged` bug: create fix-task + `bug.set_state(planned)`. **Stamp `release = {planning}` on every included DL, bug, tech-spec, and adr** ← added | — | **yes**: DL, bug, tech-spec, adr, task |
| 7 | commit-backlog | tech-lead | `task.set_state(backlog)` (`pending→backlog`); `release.set_state(in-development)` (`planning→in-development`) | approver | — |

### 3. Three outcomes per element at the gate phases (triage-bugs, reconcile-governance)

- **not selected** → the file is **not touched** (no transition); stays available for a later release;
- **accepted** → advances (gate forward edge);
- **rejected** (tech-lead / approver, element incomplete) → goes to the gate's **fallback**
  (reject-target: DL/adr `→draft`, bug `→closed`).

"Not selected" (skip) is distinct from "rejected" (fallback) — do not conflate them.

### 4. Assignment is separate from approval

State advancement (triage/approve) and **assignment** (`release=`) are decoupled: assignment happens
**only in `build-backlog`**, when the element actually enters the release backlog. An approved but
not-included element keeps `release` empty and is re-offered at the next planning.

*(Amended 2026-11-08, with `task-347`.)* For bugs, `dl-191` (a) (`ready`, 2026-11-05) replaces the last
sentence: a `triaged` bug whose `release` is empty is given one at every planning, by `release-planning`'s
`assign-bugs` phase after `triage-bugs` — this release, a later one the approver names, or a close through the
`triaged` gate's reject — so no bug stays unassigned past a planning. Decision-logs, ADRs and tech-specs keep the
rule above: they are assigned only in `build-backlog`.

**Scope boundary:** the sweep covers **decision-log** and **bug** (the consume-without-produce gap);
**tech-spec** stays in `identify-specs` (already its reconciliation, and it needs the scope survey);
**adr** is approved for the release in `record-adrs`, and accumulated `pending` ADRs may optionally be
swept in `reconcile-governance`.

**Open questions to resolve before `ready`:**
- (a) Should accumulated `pending` ADRs be swept in `reconcile-governance`, or is the `record-adrs`
  approve enough?
- (b) Edge — immediate ingestion: an element approved ad-hoc during delivery keeps `release` empty
  until a `build-backlog` stamps it; if used ad-hoc and never included it is re-offered next planning.
  Should the ingest `approve` stamp `release` when the element is tied to an active task? (deferred)

## Rationale

- The gap is structural: `build-backlog` reads `ready`/`triaged` inputs but no phase writes them, so
  accumulated work is dropped without any signal. Explicit `triage-bugs` + `reconcile-governance`
  phases give planning an unambiguous "in this release or deferred" decision point per element — which
  makes the informal expectation ("approvals happen at planning") true *by construction*.
- **Uniform `release` field**: reusing one field name across all elements (equal to `task.release`)
  keeps the selection filter trivial and consistent; renaming the bug's found-in field to
  `release-origin` removes the semantic clash instead of overloading one field with two meanings.
- **Separating triage ownership**: `open→triaged` stays a tech-lead decision (its natural authority,
  as in `bug-ingest`), placed *before* the product-owner-led `reconcile-governance` so downstream
  phases see only `triaged` bugs.
- Alternatives considered:
  - **Status quo (approve via each element's ingest, by hand)** — rejected: nothing connects that
    approval to the release cadence; elements silently accumulate and are skipped.
  - **Approve during `retrospective`** — rejected: `retrospective` is scoped to its own
    `retro-{version}` DL and runs at release *close*, not at the *next* release's planning where the
    inclusion decision belongs.
  - **Reuse the bug's `release` field for assignment** — rejected: it already means "found in"; a
    uniform new `release` + `release-origin` rename is clearer.
- Cost is config-only (two new `release-planning` phases, a `record-adrs` approve, a `build-backlog`
  assignment action, and template/schema edits for the `release` fields) — no product code — and
  traces back to REQ-SYS-07 / REQ-STATE-09 and P1.13.

## Actions

- [ ] Ratify open questions (a)-(b) (owner: approver).
- [ ] On `ready`: implement (as config task(s)) — (1) `release` field scheme across adr/tech-spec/DL
  + bug `release-origin` rename (migrate bug-001/002/003) in the templates and `memory.yaml`/spec
  schemas; (2) `triage-bugs` + `reconcile-governance` phases in `release-planning.yaml`; (3)
  `memory.approve` added to `record-adrs`; (4) explicit DL→task conversion + `release` stamping (DL,
  bug, tech-spec, adr) in `build-backlog`; (5) selection filter (`release` empty or == planning) in
  triage-bugs / reconcile-governance / build-backlog; (6) any `traceability` directive update.
- [ ] Depends on `dl-017-decision-log-remove-delivery-states`: DL stays `ready` after conversion (no
  `ready → in-develop`).
- [ ] Future work (traceability): consider coupling DL / tech-spec / ADR to tasks as well — e.g. task
  fields `tech-spec-impl` and `tech-spec-consumer` (which tasks implement vs. consume a spec). Relates
  to `dl-015-inter-task-dependency-notes`; out of scope here.
- [ ] Backlog check: the open DLs (dl-013, dl-014, dl-015) and any `open` bug become the first real
  inputs these phases would reconcile at the next planning cycle.

> **Implemented out-of-flow in the v0.1→v0.2 config-bootstrap** (branch `design/config_bootstrap_v0.2`; see `docs/05_plans/rl-v1/rel-v0.1/retrospective-and-config-bootstrap-plan.md`). `release: v0.2` — already delivered; no further task derivation by v0.2 `build-backlog`.
