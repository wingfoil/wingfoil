---
id: "task-219-define-release-candidate-staging-rehearsal-phase-recut-reentry"
type: task
title: "Define the release candidate: staging rehearsal as a phase, re-cut re-entry, no-identity suite before the tag"
status: backlog
release: "v0.3"
kind: "feature"
priority: "high"
tags: ["v0.3", "process", "release-gate", "workflow-config"]
ref: "dl-099"
bug: []
depends_on: ["task-207-drive-e2e-smoke-through-fresh-project-use-scenario"]
tmpl_version: 260703
---

## Description

v0.2's gates found defects only when they ran. A candidate is any commit proposed for a tag; both checks run on each; the rehearsal becomes a declared phase. v0.2.2 showed the CI gate job runs without a git identity, which a local run does not reproduce.

## Acceptance Criteria

- (characterization) `release-publishing.yaml` gains `staging-rehearsal` before `tag` (role `qa`, action `npm run publish:staging`, `produces:` the transcript, `checks.post` on its closing line); version bumped; loads with zero errors.
- (characterization) `release-cycle.yaml` states that a re-cut candidate re-enters e2e-smoke and the rehearsal; version bumped.
- (red-first) a script (e.g. `npm run test:no-identity`) runs the full suite with no git identity (`GIT_CONFIG_GLOBAL`/`GIT_CONFIG_NOSYSTEM` pointed away, empty `HOME`), and `release-submit.yaml` `pre-release-checks` declares it; a test proves the script's environment has no `user.email` (`git config user.email` exits 1 inside it).
- (characterization) `spec-015` (the rehearsal's place in the release) amended with a Revision note; `dl-023` gains a dated note pointing to dl-099.
- (characterization) `.wingfoil/WORKFLOW.md` draws `staging-rehearsal`; task-148's phase-name test stays green.

## Implementation Notes

- **Size:** S · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-099 §1, §2, Actions 2–3, v0.2.2 carry-over (full `npx jest` with no git identity pre-tag).
- **Features:** P4.1.
- **Notes:** Proposal key: D10.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.
- **Handover from the parallel-release-lines decision (2026-10-07):** `dl-159` (`in-discussion`, to be ratified before the
  `v0.3.0` tag) opens `release/X.Y` maintenance lines beside `main`: patches land on `release/X.Y` and are merged
  forward into `main` with `--no-ff`, never cherry-picked or back-merged; patch tags go on the pushed `release/X.Y`.
  The `tag` phase's `pre: ["on-branch-is-main", …]` and `git.tag(…, on: main)` become a parametric base branch later
  (`dl-159` A2.4, deferred to the v0.3 retrospective and `patch-v0.3.1`). Write the `staging-rehearsal` phase, the
  re-cut re-entry rule and the no-identity check in terms of the candidate commit and the release's integration
  branch, not `main` by name, so A2.4 changes one parameter; the `spec-015` Revision note this task adds does not
  restate "tag on `main`" (`task-267` amends §3/§4 in B9).

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
