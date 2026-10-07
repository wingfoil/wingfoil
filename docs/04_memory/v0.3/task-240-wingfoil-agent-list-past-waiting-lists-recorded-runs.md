---
id: "task-240-wingfoil-agent-list-past-waiting-lists-recorded-runs"
type: task
title: "`wingfoil agent list --past|--waiting` lists recorded runs and the frontier steps an agent role can take, from `HEAD`"
status: backlog
release: "v0.3"
kind: "feature"
priority: "medium"
tags: ["v0.3", "agent", "cli", "read-only"]
ref: "dl-135"
bug: []
depends_on: ["task-161-revise-command-baseline-which-verbs-read-head-filesystem", "task-206-agent-execute-records-run-json-lines-line-under", "task-225-add-workflow-status-pending-approvals-role-routing-fallback"]
tmpl_version: 260703
---

## Description

`agentList` (`mutates: false`, CLI only in v0.3). It has two sources: - past = the run logs at `HEAD`; - waiting = every frontier step of every open instance whose `agentRole` is true, in `spec-017` §1.3's order. Both can be filtered by `--element` and `--phase`. Console and JSON/YAML follow §5, and the payload carries `baseline` and `diagnostics`. `W_UNCOMMITTED_INPUTS` is emitted when `--past` alone runs no deduction. The command reads at `HEAD` as the declared R15 exception.

## Acceptance Criteria

- (red-first) Past: records from two element files, ordered by element id (byte order) and then append order. Each console line is `<id>  <role>  <agent>  <exit_status>  <duration>  <tokens>`, with tokens as `in/out` or `not-reported`. An empty result prints `no past runs`, exit 0.
- (red-first) Waiting: two open instances with parallel frontier steps, one of them with a non-agent role. Only agent-role steps are listed, in frontier order, each with the DNA-ordered `agents` that have an adapter.
- (red-first) No flag, or both flags → both sections. `--active` → exit 2 (v0.4).
- (red-first) A run log changed only in the working tree is not read (HEAD). Its path appears in a `W_UNCOMMITTED_INPUTS` diagnostic, printed as a `warning:` line on the console.
- (red-first) Missing `paths.runs` → past is empty, with `warning: dna.yaml declares no run log (paths.runs)`, exit 0. A §4.5 violation → exit 1.
- (characterization) Docs, each with a `doc-versioning` bump: new BDD `p5-interaction/P5.3.4-agent-list.feature` (id per the new row); `06_features.md` new P5.3 row "agent list" (proposed `P5.3.4`) (`dl-135` Action 3); `spec-006` §3's feature column replaces the `dl-135` citation with the new id; `minor-v0.3` `features:` gains the id through `memory amend` (dl-108); `docs/cli-reference.md` entry naming its `HEAD` baseline.

## Implementation Notes

- **Size:** M · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-135 points 1, 4 (v0.3 half: `--past`, `--waiting`); spec-016 §5, §5.1; R15.
- **Features:** P5.3.1 (until the new row lands), new P5.3 row "agent list.
- **Notes:** Proposal key: B12.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.
- **Handover from wave 3 B2 (2026-10-07, `task-198`).** `W_UNCOMMITTED_INPUTS` is emitted once per dirty input path (`spec-017` §1.2's "naming the paths" read per path); keep that form or settle it before reusing the code.

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
