---
id: "task-207-drive-e2e-smoke-through-fresh-project-use-scenario"
type: task
title: "Drive e2e-smoke through a fresh-project use scenario with exact exit codes and a report"
status: in-progress
release: "v0.3"
kind: "fix"
priority: "high"
tags: ["v0.3", "process", "release-gate", "smoke", "ci"]
ref: "dl-099"
bug: ["bug-132", "bug-133", "bug-134"]
depends_on: ["task-140-run-packaging-gate-push-pull-request-separate", "task-199-align-wingfoil-workflows-custom-v0-3-schema-commands"]
tmpl_version: 260703
---

## Description

The smoke asserts only exit 0, never re-loads what a command wrote, and its phase declares no `produces:`, so it can neither fail on a wrong error code nor be deduced complete. v0.3 also flips it from warn to hard reject.

## Acceptance Criteria

- (red-first) bug-132: each step declares an expected exit; at least one exit-1 and one exit-2 step per spec-005 §3; a step returning the wrong code fails the smoke (pinned in `test/cli/e2e-smoke.test.ts` with a fault-injected step).
- (red-first) bug-133: after the last writer, every written artifact is re-loaded through its own loader (`dna show`, `memory search`/`history`, `directives list`, `workflow list`); a corrupted write fails the smoke (fault-injection case).
- (characterization) for every template `init` supports, one element of each built-in machine shape goes `add → submit → approve`, plus one `reject`, one `deprecate`, `memory history` each; clean tree after every mutation (dl-099 §3).
- (red-first) bug-134: `e2e-smoke.yaml` declares the report under `produces:` (a path), the gate's severity is `reject` (dl-023), version bumped; the script writes that report.
- (characterization) `ci.yml` (task-140) gains a smoke job on push/PR running the smoke against the packed tarball (dl-099 §4 (c) smoke part); the staging rehearsal stays out of CI.

## Implementation Notes

- **Size:** M · **wave:** 3 · **kind:** fix (`dl-133` Q1 (b)).
- **Implements:** dl-099 §3, §4 ((c) smoke part); dl-023 (hard-reject from v0.3).
- **Features:** X1.2 (smoke gate).
- **Notes:** Proposal key: D09. spec-015 §3's staging smoke uses the same script; confirm the publish-staging gate still passes (`npm run publish:staging` transcript in Execution Notes). Single owner of the smoke-gate cluster `bug-132`/`bug-133`/`bug-134` (Appendix A): the `produces:` fix needs the report the reworked script writes, so it is not an task-199 alignment edit.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.
- **Handover from the parallel-release-lines decision (2026-10-07):** `dl-159` (`in-discussion`, to be ratified before the
  `v0.3.0` tag) opens `release/X.Y` maintenance lines beside `main`: patches land on `release/X.Y` and are merged
  forward into `main` with `--no-ff`, never cherry-picked or back-merged; patch tags go on the pushed `release/X.Y`.
  `task-267` (B9) adds `release/**` to `ci.yml` `on.pull_request.branches` and may make the concurrency group spare
  `release/*` pushes as it spares `main`. The smoke job inherits the workflow's `on:` and declares no trigger or
  `if:` of its own that names `main`, nor compares against `origin/main`; keep `test/cli/ci-workflow.test.ts`'s
  trigger assertion a single expectation `task-267` can widen.

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
