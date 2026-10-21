---
id: dl-142-a-plan-an-agent-writes-is-imported-into-a-plan-element-and-approved-with-identity-and-reason
type: decision-log
title: "A plan an agent writes is imported into a plan element and approved with identity and reason"
status: ready
context: "ad-hoc"            # optional — short label for the context, e.g. "retrospective", "planning", "ad-hoc"
release: ""            # optional — implementation release this DL is assigned to (stamped at release-planning/build-backlog, dl-016), e.g. "v0.1"
contributor: ""        # optional — who originated this contribution, if not the git author (dl-020); credited for AI-generated work derived from it
credit: ""             # optional — free-text credit note (dl-020)
tmpl_version: 260703   # Orignal template version
tags: ["plans","approval","agents"]
---

## Context

**Coding agents write plans, and nobody records their approval.** Read 2026-10-01/02:
- **Claude Code** saves plans under `~/.claude/plans` unless `plansDirectory` is set ("unset, so
  Claude Code uses `~/.claude/plans`", <https://code.claude.com/docs/en/settings>). From v2.1.283
  (published to npm 2026-09-25) "auto mode is the built-in starting permission mode", in which a
  classifier decides, <https://code.claude.com/docs/en/permission-modes>.
- In Claude Code agent teams a plan can be approved before the lead reviews it: issue
  [anthropics/claude-code#27265](https://github.com/anthropics/claude-code/issues/27265),
  "mode: "plan" auto-approves ExitPlanMode before team lead can review", opened 2026-02-20, closed
  as not planned.
- **Cursor:** "Plans are saved by default in your home directory.",
  <https://cursor.com/docs/agent/planning>.
- **VS Code Copilot:** plans live in "session memory at `/memories/session/plan.md`, not as a
  project file", <https://code.visualstudio.com/docs/copilot/agents/planning>, and session memory is
  cleared when the conversation ends (<https://code.visualstudio.com/docs/copilot/agents/memory>).

So the plan an agent works from is outside the repository, and its approval, when there is one, is
a click no record keeps.

**WingFoil already has the element.** `plan` is a Memory type (`dl-019`; `.wingfoil/memory.yaml`
`types.plan`, path `docs/05_plans/{scope}/{id}.md`, machine `draft → active → done`). It is used
for workflow phase plans, written by hand; no command imports a file an agent produced, and the
machine has no gate, so a plan's start carries no approver.

Raised by the approver on 2026-10-02 as the outcome of a market analysis.

## Decision

**WingFoil imports the plan file an agent produces into a `plan` element and approves it with
identity and reason.**
- The import takes a plan file (from the agent's plan directory or a given path), creates the
  element with its content and the plan's origin, and leaves it in the initial state.
- Approving it is a recorded transition with an `Approver:` and a `Reason:` (P1.7), like every other
  gated transition, so the plan an agent then executes is the one a human approved.
- The design — whether the existing `plan` type gains a gate or a new type is declared, and how the
  import finds each agent's plan directory — is settled by a tech-spec.

## Rationale

- **It is the approval no vendor records.** The agents keep plans outside the project and approve
  them by click or by classifier; the decision about *what will be built* is the least audited step.
- **The pieces exist.** The `plan` type, the approval verbs and the audit trail ship; the gap is
  the import and a gate.
- **It shows the differentiator in one step.** A plan approved with identity and reason is the demo
  `dl-140` (D6) asks for.

## Actions

1. **Ratify** at `in-discussion → ready`. Owner: approver.
2. **Tech-spec** at release-planning v0.4: import source per agent (Claude Code, Cursor, Copilot),
   element mapping, gate on the `plan` machine or a new type, determinism of the import. Then the
   task(s). Order in the roadmap: second (`dl-140`, D3).

## Relations

- **Extends:** `dl-019` (plans as a Memory element).
- **Related:** `dl-140` (positioning and roadmap order), `dl-143` (the generator, whose hooks may
  trigger the import).
