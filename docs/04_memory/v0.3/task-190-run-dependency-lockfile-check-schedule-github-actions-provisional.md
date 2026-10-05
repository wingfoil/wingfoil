---
id: "task-190-run-dependency-lockfile-check-schedule-github-actions-provisional"
type: task
title: "Run the dependency and lockfile check on a schedule in GitHub Actions (provisional cadence trigger)"
status: in-progress
release: "v0.3"
kind: "feature"
priority: "low"
tags: ["v0.3", "workflow", "ci", "cadence"]
ref: "dl-105"
bug: ["bug-225", "bug-238"]
depends_on: ["task-140-run-packaging-gate-push-pull-request-separate"]
tmpl_version: 260703
---

## Description

Lockfile drift arriving from the registry is seen only at a tag (`dl-069`). `dl-105` schedules an intermediate task in v0.3: a GitHub Actions workflow with `on: schedule` that runs `npm ci` and `npm run check:lockfile`, read-only, keyed on exit status, until the engine takes the trigger over.

## Acceptance Criteria

- (red-first) A test in `test/cli/` (the `publish-pipeline.test.ts` style) parses the new workflow file and asserts: an `on: schedule` cron (five fields) plus `workflow_dispatch`, `permissions: contents: read` only, no push/tag/publish step, steps `npm ci` then `npm run check:lockfile`, pinned Node at the CI `NODE_VERSION`.
- (characterization) The cron string is recorded in the file header next to a pointer to `dl-105`, so the future phase `cadence: { recurring: { cron } }` reuses the same string (R1 (a)).

## Implementation Notes

- **Size:** S · **wave:** 2 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-105 Decision 3–4, Action 2; R2 (c); R4.
- **Features:** P4.1.
- **Notes:** Proposal key: A21. coordinate with the `dl-076` (D) `ci.yml` task and `dl-129`'s Scorecard workflow (other domains) so CI files and their pinning test stay consistent. Declaring `cadence` on `dl-089`/`dl-100`/`dl-088` phases (Action 3) waits for those phases to exist and for the engine (v1.0); not in v0.3.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.
- **Triage of 2026-10-05 (`bug-ingest-rel-v0.3-w1b6-review-findings-plan`):** the scheduled check also runs
  `npm audit --omit=dev --audit-level=high` (`bug-223`, fixed by `task-250`), and `bug-225` adds a
  directory-wide test that every `uses:` in `.github/workflows/` is a full commit SHA with its tag comment.

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
