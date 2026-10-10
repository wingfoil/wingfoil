---
id: traceability
name: "Requirement traceability chain"
type: directive
kind: custom
title: "Requirement traceability chain"
tags: [custom, traceability, requirements]
ref: [docs/02_requirements/X_specs-downcast-plan.md]
version: "1.1"   # 1.1 the filing-type rule (dl-118 (B)), who files and who authors criteria (dl-102 §1 (a), §3), a plan's release (bug-186) — task-197
---

# Directive — Requirement traceability chain

**Date:** 2026-10-09

Custom WingFoil rule. `roles.yaml` binds it to reviewers, architects and product owners. Its filing
rule is addressed to whoever files a Memory element: the `capture` phase of `bug-ingest` (role
`developer`) and of `decision-log-ingest` (role `product-owner`) point here (`dl-118` option (B)).

## The traceability chain

- Maintain the chain: **feature (P*) → user story (US-*) → BDD scenario → SARD requirement
  (REQ-*) → tech-spec (when the task implements a shared file format, schema, constant set, or
  module API) → task**.
- Every architecture decision references the SARD requirement(s) it implements.
- Every tech-spec references the SARD requirement(s)/feature it specifies for.
- Every task references its feature id and target release, and its tech-spec(s) when one exists.
- Keep each task's target-release assignment consistent with the planned release cadence in
  `docs/01_vision/07_sequencer.md` — roughly one release per week, each centered on a pillar
  (v0.1 → v1.0). Relocated here from the former `dna.yaml` `conventions.process.release_cadence`.
- Every base document (adr, decision-log, tech-spec, bug) carries a `release` field with the uniform
  meaning "the release this element's implementation is assigned to" (== `task.release`), stamped by
  `release-planning`'s `build-backlog` (`dl-016`). A bug additionally carries `release-origin` — the
  release it was *found in* — which must not be conflated with its fix `release`.
- A `service` (`dl-088`) is not a base document: it is never stamped, and it carries no `release`
  field. The release in which it was set up is its own field, `set_up_in` (`bug-166`), so a query or
  a planning sweep that selects by `release` never reads a service as scheduled work.
- A task's `depends_on` obligations (`dl-015`) are a required cross-reference: the `dev-loop` review
  gate rejects a task that ignored a declared upstream task's Execution-Notes constraint.
- A reviewer rejects work that breaks or omits a required cross-reference.

## Which type a finding is filed as (`dl-118`)

Ratified as `dl-118-choosing-between-decision-log-bug-and-directive` (`ready`) option (B). The
criterion is whether there is a choice to make, not which document is affected: an `approved` target
changes who signs off the correction, not whether there is anything to decide.

1. **Bug** — something is wrong and the fix is **mechanical and uncontested**: once the defect is
   described, any competent reader would make the same change. This includes an approved document
   that states something false, when the document is simply corrected to match what was already
   ratified.
2. **Decision-log** — there is **a real choice**: at least two options a reasonable approver could
   pick, each with a cost. This includes an approved document that is false when deciding which side
   is right, the document or the code, is itself the question. Example:
   `dl-060-roles-yaml-binds-by-directive-id` corrected an approved specification, and binding by
   `name` was a live alternative that was rejected, so it is a decision-log under this rule too.
3. **Directive change, proposed through a decision-log** — the finding is a rule meant to govern
   **all future work** of some role, not a single change. The decision-log argues it; the directive
   states it and cites it. Once the rule is written, the decision-log **stays `ready`**: it is neither
   deprecated nor superseded (the precedent is `command-baseline`, which cites
   `dl-080-which-baseline-each-command-reads`). `dl-118` itself is cited here in this way.

Elements filed before this rule keep their type, ids and states: they are history, and are not
retyped to fit it (`dl-118` Decision).

## Who files an element (`dl-102` §1 (a))

Ratified as `dl-102-acceptance-criteria-checked-against-the-standing-brief` (`ready`) option (a):
the rules a standing brief gives task agents live in the directives, by subject. This is the
element-filing rule; branches, merges and id allocation are `git-conventions`'.

- **A task agent working in a parallel worktree files no Memory element** — no bug, decision-log,
  task or other element. It reports each finding it would file in its final report: the type it
  proposes under the rule above, a title, and the evidence. One orchestrating session files them
  through the ingest workflows (`bug-ingest`, `decision-log-ingest`, `adr-ingest`, `service-ingest`).
- Allocating the id of what is filed follows `git-conventions` §6 (`dl-101-id-allocation-across-refs`
  §1), whose item 5 is the same rule seen from the allocation side.
- "Filed", in a task's notes or criteria, means an element exists. A finding that was only reported
  is called reported.

## Who authors acceptance criteria (`dl-102` §3)

Acceptance criteria are written under a declared role (REQ-SYS-08: bindings by role, never by
person), and the author's directives are that role's:

- **Backlog tasks** — `product-owner`, at `release-planning`'s `build-backlog`.
- **Out-of-band tasks** — created during development, e.g. from a review finding — the orchestrating
  session, acting as `tech-lead`.

There is no `orchestrator` role: orchestration is an activity `tech-lead` and `product-owner` already
hold, and `dna.yaml` `team.roles` declares none.

## A plan's `release` (`bug-186`)

A `plan` element is not a base document, and its `release` field has a meaning of its own: **the
release the plan serves, set by its author** when the plan is added and submitted.
`release-planning`'s `element.set_release` never stamps it: it stamps decision-logs, bugs,
tech-specs, ADRs and tasks only (`release-planning.yaml`, `build-backlog`). Because the `plan`
scaffold declares `release` (`.wingfoil/memory/templates/plan.md`), `memory amend` keeps the field
reserved on plans, as on every type whose committed scaffold declares it (`amendReservedFields`,
`src/core/memory-amend.ts`; approver ruling at `task-170`): a plan's `release` is not corrected
through `amend`. It is corrected by a hand `assign` commit that changes only that field,
`wf(plan): assign release vX to <id>` (`spec-003-workflows-yaml-schema`: `assign` writes `release` on any type;
`spec-008-cli-grammar` §2: the canonical subject `memory history` reads).

> Rationale: traceability is what lets Casey/Morgan see how requirements flow to test and release,
> and what makes the audit trail complete. Source: `docs/02_requirements/X_specs-downcast-plan.md`;
> the filing rule `dl-118`; the brief's rules and the criteria's author `dl-102`; a plan's `release`
> `bug-186`. Feature P3.5; REQ-SYS-08.
