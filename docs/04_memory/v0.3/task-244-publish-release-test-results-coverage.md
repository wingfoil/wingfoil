---
id: "task-244-publish-release-test-results-coverage"
type: task
title: "Publish each release's test results and coverage"
status: backlog
release: "v0.3"
kind: "feature"
priority: "medium"
tags: ["v0.3", "process", "publishing", "testing", "ci"]
ref: "dl-136"
bug: []
depends_on: ["task-134-report-source-file-coverage-so-untested-file-counts", "task-146-make-suite-result-independent-concurrent-runs-machine-load", "task-207-drive-e2e-smoke-through-fresh-project-use-scenario", "task-238-publish-mcp-registry-github-actions-bound-publish-job"]
tmpl_version: 260703
---

## Description

A release keeps no test results or coverage, so its quality claims cannot be checked. The tag's CI run produces Jest JSON classified per suite, `coverage-summary.json` and `lcov.info`; the summary lands in the repository, the full reports as Release assets.

## Acceptance Criteria

- (red-first) `jest.config.js` `coverageReporters` include `json-summary` and `lcov`; a script classifies Jest JSON into unit / integration / BDD / smoke / API-docs / lint.clean with counts and writes the Markdown summary (commit, tag, run URL, build); unit tests on a JSON fixture.
- (red-first) `publish.yml` `gate` runs the suite with coverage and `--json`, uploads the reports; the task-229 `release` job attaches them; pinned in `publish-pipeline.test.ts`.
- (characterization) `release-submit.yaml` declares the reports under `produces:`; `release-publishing.yaml` the attached assets and the committed summary path; versions bumped; `07_sequencer.md` coverage criteria point to the summary (doc-versioning bump); `spec-015` §3 amended.

## Implementation Notes

- **Size:** M · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-136 (Q1 (c), Q2 (a), Q3 (a), Q4 (a)).
- **Notes:** Proposal key: D25. The spawned `npm publish --dry-run` flake under coverage (`bug-167`) is fixed by task-146 first; this task depends on it.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.
- **Handover from the parallel-release-lines decision (2026-10-07):** `dl-159` (`in-discussion`, to be ratified before the
  `v0.3.0` tag) opens `release/X.Y` maintenance lines beside `main`: patches land on `release/X.Y` and are merged
  forward into `main` with `--no-ff`, never cherry-picked or back-merged; patch tags go on the pushed `release/X.Y`.
  `task-265` and `task-266` (B9) edit `publish.yml` after this task (chain 229 → 238 → 244 → 265 → 266): leave the
  gate's tag-on-main step and the promote `npm stage publish` line as they are apart from what this task needs. Key
  the committed summary path by version, not by branch, and do not assume the committing branch is `main` in
  `release-publishing.yaml`: a 0.3.x summary is committed on `release/0.3` and merged forward, and two lines must
  not write the same path. The `spec-015` §3 Revision note does not restate "tag on `main`".

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
