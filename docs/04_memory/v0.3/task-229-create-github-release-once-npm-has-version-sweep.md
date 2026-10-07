---
id: "task-229-create-github-release-once-npm-has-version-sweep"
type: task
title: "Create a GitHub Release once npm has the version, and sweep service verifies before publishing"
status: backlog
release: "v0.3"
kind: "feature"
priority: "high"
tags: ["v0.3", "process", "publishing", "ci", "visibility"]
ref: "dl-130"
bug: []
depends_on: ["task-219-define-release-candidate-staging-rehearsal-phase-recut-reentry"]
tmpl_version: 260703
---

## Description

A release reaches npm and nowhere else. A `publish.yml` job creates the Release with the version's CHANGELOG section. **Since adr-011, `promote` only stages the version**; the ratified premise "after promote = npm has it" no longer holds, so the job must wait for the version to be live.

## Acceptance Criteria

- (red-first) a `release` job `needs: promote`, `contents: write` on that job alone, which refuses to create the Release until `npm view wingfoil@<version> version` returns the version (a bounded poll, or an environment the approver approves after the npm stage approval — design picks and records); pinned in `publish-pipeline.test.ts`.
- (red-first) the notes are extracted from `CHANGELOG.md`'s section for the version by a script with unit tests (missing section → fail).
- (characterization) `release-publishing.yaml` `publish.checks.pre` declares the service verify sweep (severity `warn`, dl-130 Q3 (a)); a script lists every `service` element's `verify:` for the approver to run and record (the agent never runs third-party-account commands).
- (characterization) `spec-015` §3 amended (Revision note); `publish.yml` header runbook updated.

## Implementation Notes

- **Size:** M · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-130 step 1 (Q1 (a)), step 4 (Q3 (a)); spec-015 §3 amendment.
- **Planning ruling:** Approver ruling 2026-09-30 (plan R20, Q3): the job waits for the version to be live on npm with a bounded poll (`npm view wingfoil@<version>`, a declared timeout such as 24 h, then a readable failure), not with a second environment approval.
- **Notes:** Proposal key: D23. Q4 (a) (backfilled Release for v0.2.1 only) is already done: `svc-010-github-release-v0.2.1`.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.
- **Handover from the parallel-release-lines decision (2026-10-07):** `dl-159` (`in-discussion`, to be ratified before the
  `v0.3.0` tag) opens `release/X.Y` maintenance lines beside `main`: patches land on `release/X.Y` and are merged
  forward into `main` with `--no-ff`, never cherry-picked or back-merged; patch tags go on the pushed `release/X.Y`.
  `task-265` (gate: a tag on `origin/main` or `origin/release/X.Y`) and `task-266` (promote: an explicit `--tag`,
  `latest` only for the highest published version, else `latest-X.Y`) edit `publish.yml` after this task, in B9. Do
  not hard-code that the GitHub Release is the repository's latest (a forced `--latest` / `make_latest: true`):
  leave one place `task-266` can set from the same rule. The live-on-npm poll checks the exact version (`npm view
  wingfoil@<version> version`), never `wingfoil@latest`, which a `latest-X.Y` publish does not move. The CHANGELOG
  extraction works on a `release/X.Y` tree that lacks later minors' sections. The `spec-015` §3 Revision note does
  not restate "tag on `main`".

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
