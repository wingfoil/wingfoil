---
id: "task-243-e2e-smoke-gate-drives-agent-execute-through-fake"
type: task
title: "The `e2e-smoke` gate drives `agent execute` through the fake adapter in a fresh `init` project from the packed tarball"
status: in-progress
release: "v0.3"
kind: "feature"
priority: "medium"
tags: ["v0.3", "agent", "e2e-smoke", "testing"]
ref: "spec-016"
bug: []
depends_on: ["task-196-wingfoil-init-installs-builtin-adapters-protected-builtin-assets", "task-207-drive-e2e-smoke-through-fresh-project-use-scenario", "task-220-wingfoil-agent-show-run-id-prints-recorded-run", "task-228-agent-execute-launches-agent-forwards-right-signals-records", "task-240-wingfoil-agent-list-past-waiting-lists-recorded-runs"]
tmpl_version: 260703
---

## Description

The smoke gate exercises the packaged tarball. With `agent execute` shipped it also runs one adhoc run from a fresh `init` project, with the fake as a custom adapter and an agent entry pointing at it. It then re-validates what the command wrote: the run log line passes task-206's reader, and `agent show` returns it (`bug-133`'s rule, re-load what was written).

## Acceptance Criteria

- (red-first) `test/cli/e2e-smoke.test.ts` (or the smoke script) installs the tarball in a temp project, runs `init`, adds the fake adapter under `agents/custom/` and the agent entry, and runs `agent execute --element … --role developer`. Exit 0; exactly one `agent: record` commit; `agent show <id>` exit 0.
- (red-first) Outcomes are asserted beyond exit 0: the record's `adapter` is `custom/fake`, and `agent list --past --format json` contains the id.
- (characterization) The smoke plan / report template names the new step.

## Implementation Notes

- **Size:** S · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** spec-016 §2.7 (last bullet); dl-023; dl-099 (per-candidate gate).
- **Features:** P5.3.1.
- **Notes:** Proposal key: B16. Reuses task-207's reworked smoke script (exact exits, re-load of what was written, report under `produces:`).
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
