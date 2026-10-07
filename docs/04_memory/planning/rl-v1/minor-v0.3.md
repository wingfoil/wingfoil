---
id: "minor-v0.3"
type: release
title: "WingFoil v0.3 - Project Workflow"
status: in-development
version: "v0.3"
pillar: "P4"
features: [P4.1, P4.2, P4.3, P4.4, P4.5, P4.6, P4.7, P4.8, P4.9, P4.11, P4.13, P4.14, P4.15, P4.16, P5.3.1, P5.3.2, P5.3.3, P5.3.5, P5.4.1, P5.4.2, P5.4.3, P5.4.4, X1.1, X1.2]
requirements: "docs/03_backlog/04_backlog/by-release/v0.3.json"
release-line: "v1"
tmpl_version: 260703
---

## Scope

v0.3 delivers the Project Workflow pillar (P4) and agent execution (P5.3), unifying project progress
tracking with approval cycles and AI agent integration. This release introduces workflow
configuration (main/sub kinds, `include()` composition, `iterate_over`), the workflow commands
(`start`, `end`, `next`, `status`, `list`, `show`, `create`, `remove`), workflow state deduced from
Memory (P4.13) and validated against the per-type state machines, approval routing by role (P4.14),
fallback on rejection (P4.15), and `wingfoil agent execute`, which launches the agent's own CLI
through a declared adapter with role-based directives and Memory context pre-loaded. A notification
system alerts when approvals are required, through the CLI output of `workflow status` and
`workflow next`; git-hook notifications moved to v0.4 (plan R13).

In v0.3 WingFoil **tells humans and agents what to do next and tracks it**; it does not yet
**execute** workflow steps or run workflow checks. Atomic step execution (P4.10) and pre/post checks
(P4.12) are v1.0. The reference workflow templates (P4.18–P4.20) moved to v0.4, where the release is
about adoption and onboarding (approver ruling, 2026-09-29, `release-planning-rel-v0.3-plan` R3).

## Pillar Focus

**Pillar 4 (Project Workflow)** is the synchronization layer that keeps humans and agents aligned on
project state. It tracks deliverables (releases, tasks, ADRs, specs, bugs) through explicit state
machines, routes approvals by role, and recovers from rejections. Combined with Pillar 5.3 (Agent
Execution), workflows let an agent learn "what to do next" and start with the directives and context
of the role the current step names. Each agent run is recorded, so the cost and the provenance of a
task, a phase or a release can be derived (`dl-114`). This is where the previous pillars (Memory,
DNA, Directives) converge into actionable work.

## Success Criteria

Per `docs/01_vision/07_sequencer.md` (Week 3 Definition of Done):

- All v0.2 features stable (no regressions)
- Workflow commands functional (start, end, list, show, create, remove, next, status)
- `workflow next` names the current step's verb, role and element; `agent execute --next` launches the
  agent on it (the steps themselves are executed by P4.10 in v1.0)
- State transitions working (per-type state machines; default draft → pending → approved/rejected; reject → fallback step)
- Approval routing by role functional
- Notification system (basic CLI output) functional; git-hook notifications are v0.4 (plan R13)
- `agent execute` launches the agent's own CLI through a declared adapter, with context loaded in
  <30 sec (REQ-PERF-01), and records every run (`dl-114`)
- >80% test coverage on workflow module
- npm package v0.3.0 published
- Journey 4 (Morgan - enforce) manually tested end-to-end
- The workflows under `.wingfoil/workflows/custom/` load through the workflow commands with zero errors

## Execution Notes

### Planning (release-planning)

<!-- identify-specs: artefacts discovered late or missed; build-backlog: scope/estimation
     surprises, bugs selected for this release and their derived fix tasks. -->

**define-scope (2026-09-29, `release-planning-rel-v0.3-plan` step 1).**
- `features:` lost P4.18, P4.19 and P4.20, which moved to `minor-v0.4` (plan R3). P4.10 and P4.12
  stay in `minor-v1.0`.
- The Success Criterion "Memory lifecycle verbs (submit/approve/reject) integrated into workflow
  steps" needed P4.10, a v1.0 feature. It now reads as what v0.3 can deliver: `workflow next` names
  the step, `agent execute --next` launches the agent on it.
- The agent-execute criterion names the adapter model (plan R2, `adr-012` to be recorded) and the run
  record (`dl-114`). A criterion was added for the workflow definitions of this repository, which the
  workflow commands read from v0.3 on.
- No `kind:` field is added: `memory.yaml` declares the `minor-*` ids added before `dl-092`
  immutable and without `kind:`. `release-planning.yaml`'s define-scope check still lists `kind` as
  required, which contradicts that rule (recorded in the plan's Observations; `bug-175`).

**identify-specs rulings (2026-09-30, plan R11–R14).** The workflow commands gain `workflow finalize`,
which records a phase with no Memory or file evidence (R11); the read-only MCP Resources for workflow
`next` and `status` ship in v0.3 (R12); git-hook notifications move to v0.4 (R13); `dl-104` is folded
into the `spec-003` revision (R14).

**build-backlog (2026-09-30, `release-planning-rel-v0.3-plan` step 6): 121 tasks, `task-126` … `task-246`**,
all `pending` under `docs/04_memory/v0.3/`, each with `kind:` (`dl-133` Q1 (b)).
- By wave: 0 → 4, 1 → 41, 2 → 23, 3 → 53. Wave 0 is `task-126` (the closed `wf()`
  grammar, `dl-079`), `task-127` (`memory amend`, `dl-108`), `task-128` (id allocation, `dl-101`, `bug-087`,
  `bug-162`) and `task-129` (one operand per command, `bug-171`, `bug-131`).
- By kind: 81 feature, 40 fix. By area: core 47, process 35, workflow 21,
  agent 18. By size: 57 S, 61 M, 3 L.
- Coverage: the 86 v0.3 bugs are each named by exactly one task and moved `[triaged → planned]`
  with `release: "v0.3"`; the 63 v0.3 decision-logs each have at least one implementing task; the
  six older decision-logs whose remainder is in v0.3 are stamped v0.3. Not scheduled on purpose:
  `dl-009` (v0.4), `dl-010` Action 2 (v1.0), `dl-100` §5 (dropped, R19), `dl-103` §2 (iii) (v0.4 or
  v1.0, R19), `smithery.yaml`.
- Budget (`dl-096`). By task count: 121 ÷ 6.5 per active day ≈ **18.6 active days**, close to the
  sequencer's proxy of ≈ 20. By task size (S 0.25, M 0.75, L 2 active days): **≈ 66 active days**.
  The two figures diverge by more than three times, and the approver kept the whole scope (R20,
  2026-09-30) knowing it: the count is the planning rate `dl-096` ratified, the size estimate is the
  signal `dl-100`'s capacity rule and `dl-133`'s stop-the-line are there to watch. The longest chain is
  9 tasks (≈ 8 active days weighted by size).

### Implementation (dev-loop, per task)

<!-- Recurring blockers across tasks, tech-specs revised mid-release, review rejections and why,
     anything that deviated from the plan in Scope/Pillar Focus above. -->

### Submit & Publishing

<!-- pre-release-checks failures and fixes, approve-release rejections, publishing issues. -->
