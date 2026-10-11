---
id: decision-log-ingest-rel-v0.3-gate-concurrency-plan
type: plan
title: "Decision-log-ingest — rel-v0.3 gate concurrency"
status: active
version: "1.0"
workflow: "decision-log-ingest"
phase: "rel-v0.3-gate-concurrency"
element: "minor-v0.3"
release: "v0.3"
tmpl_version: 261007   # Orignal template version
---

## Context

On 2026-10-11 the v0.3 dev-loop's wave 3 batch B5 saturated the machine it runs on. Measured from outside: 12
cores, load average 33 (peak 76, and 165 earlier the same morning), 43 node processes; `npm run test:coverage` and
`tsc` running at once in 8–10 task worktrees (task-217, 225, 226, 227, 229, 231, 272, 274, 276, 278); one `npm
test` tree orphaned to `systemd` after its session ended, at 458 % CPU on its own; dozens of `until grep …; do
sleep N; done` pollers. The machine was unusable for the approver, who stopped the batch.

The suites already ran with `--maxWorkers=2` (the batch's load rule of the same morning). The cause is the number of
worktrees whose gates run **at the same time**: 8 worktrees × 2 workers plus the `tsc` runs is over 20 active
processes on 12 cores, so the runs overlap faster than they finish. `dev-loop.yaml`'s `start` phase creates one
worktree per task (`git.create_worktree(task: "{task.id}")`, `dl-014` G2, REQ-INT-06), which is what lets dev-loops
run in parallel; nothing in the project bounds how many of those worktrees run their gates at once.

A concurrency cap is a rule for all future work, not a mechanical fix, so under the traceability directive's filing
rule (`dl-118`) it is captured as a decision-log, through `decision-log-ingest`
(`.wingfoil/workflows/custom/decision-log-ingest.yaml` v1.1), on branch `ingest/dl-gate-concurrency` in its own
worktree. Memory operations use the pinned build, as the approver asked: `npm run -s wingfoil -- --version` prints
`0.2.2`, the version `package.json` pins for `wingfoil-released`.

Interim behaviour, in force without waiting for the ratification (approver, 2026-10-11): one worktree's test or
coverage gate at a time, one poller at a time, no gate started while the 1-minute load is above 14, no run detached
from the session that launched it.

## Phases / Steps

1. **capture** (product-owner): `memory add --type decision-log`, then `memory submit` → `in-discussion`. The
   decision-log states the numeric cap and how it is measured, why it leaves `dl-014` G2 / REQ-INT-06 untouched (the
   per-task worktree stays; only how many gates run together is bounded), and where the enforcement lives. Check
   `frontmatter.required: [title]`.
2. **approve** (⛔ approver): `memory approve` (`in-discussion → ready`) only on the approver's instruction; a reject
   returns to capture. Not run by an agent on its own.

## Handoff

- **Approver:** the ratification (or reject to `draft`), and the option for each question the decision-log asks.
- **Agent:** capture and its fact checks. After the ratification, the tooling change (the semaphore in
  `scripts/run-tests.cjs` and/or a `dev-loop.yaml` gate) is a `task` delivered through `dev-loop`, never an ad hoc
  edit.
- **Merge:** the branch is merged `--no-ff` onto `main` by the dev-loop coordinator, as the ingest branches are.
- **Completion criteria:** the decision-log `ready` (or rejected and re-captured); this plan `active → done`.

## Execution Notes

- **capture (2026-10-11)** — see below.

### Retrospective

- 14 task agents in parallel (W3 B5) each ran a full coverage gate at the end of their cycle; with no cap on
  concurrent gates the load reached 165 on 12 cores, restarts orphaned the runs, and resuming agents blindly spawned
  duplicate instances (task-231). Proposal: the cap this plan captures, plus resuming an agent only after checking
  its worktree has no live process.
