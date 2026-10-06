---
id: "task-239-serve-wingfoil-workflows-next-wingfoil-workflows-status-production"
type: task
title: "Serve `wingfoil://workflows/-/next` and `wingfoil://workflows/-/status` on the production MCP server"
status: backlog
release: "v0.3"
kind: "feature"
priority: "medium"
tags: ["v0.3", "workflow", "mcp"]
ref: "spec-017"
bug: ["bug-258", "bug-259"]
depends_on: ["task-147-detect-created-files-commits-req-sec-05-nopersistence", "task-225-add-workflow-status-pending-approvals-role-routing-fallback"]
tmpl_version: 260703
---

## Description

The two read-only Resources are registered next to `registerWorkflowResources` in `registerReadOnlyResources`, answer `NextResult` / `StatusResult` from `HEAD`, and cannot collide with `wingfoil://workflows/{name}` (second segment `-`, third segment present).

## Acceptance Criteria

- (red-first) `resources/read` on both URIs returns the same JSON as `workflow next|status --format json` at the same commit; a workflow named `next` stays at `wingfoil://workflows/next`.
- (red-first) The REQ-SEC-05 no-persistence guard covers both handlers (no file written, no commit — using `bug-036`'s widened helper if merged).
- (characterization) `docs/examples/04-mcp-server/run.sh`'s static-resource assertion (`"wingfoil://dna wingfoil://workflows"`) is updated and the example still self-checks; `npm run check:mcp` passes with the new resource count.
- (characterization) `spec-004` §2.1 lists the two URIs with the non-collision rule; §4.1's `workflow.next` Tool row moves to v1.0 step advancement (spec-006 Q1); dated Revision notes (`dl-047`).

## Implementation Notes

- **Size:** S · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** spec-017 §9 (the two v0.3 Resources); ruling R12; R15; spec-004 §2.1 and §4.1 amendments; spec-006 §3 rows.
- **Features:** P4.4, P4.5.
- **Notes:** Proposal key: A11.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.
- **Handover from the W2 B4a triage (2026-10-06).** `bug-258` and `bug-259` are absorbed here. With this task's
  `spec-004` §4.1 amendment: the nine mutating verbs as rows (`dna set`, `add`, `update`, `remove`; `directive
  create`, `assign`, `remove`; `memory amend`, `memory park`), §4.2's Memory sentence, and `spec-005` §Context's
  noun list gaining `directives`; remove the matching entries from `test/docs/enumeration-parity.allowlist.ts`.
  Both specs are approved elements: their amendments are recorded by the approver at the gate.

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
