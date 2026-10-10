---
id: "task-231-measure-git-history-process-conformance-external-metrics"
type: task
title: "Measure the git-history, process-conformance and external metrics"
status: backlog
release: "v0.3"
kind: "feature"
priority: "medium"
tags: ["v0.3", "process", "release-health", "scripts"]
ref: "dl-089"
bug: []
depends_on: ["task-192-stamp-wingfoil-commit-wingfoil-version-semver-sha-pin", "task-222-declare-release-health-catalogue-v2-report-schema-release"]
tmpl_version: 260703
---

## Description

`scripts/release-health/measure.cjs`, history half: window/snapshot metrics derived from git at an immutable measurement point, in a throw-away worktree, never writing git config.

## Acceptance Criteria

- (red-first) G01–G15 and the P measures computed on a fixture repository with known answers (tests under `test/scripts/` or `test/release-health/`), raw counts beside every percentage, `small-sample` under 30 items.
- (red-first) the script never writes git configuration: a test snapshots `git config --list --show-origin` of the fixture before/after (identity via `git -c`/env only, dl-089 §6).
- (characterization) external snapshot (stars, forks, watchers, 14-day traffic, npm downloads) is recorded with the command and date read, or `not-measurable` offline.
- (characterization) report records Node/npm versions and lockfile hash; the scripts are not in the npm tarball (`npm pack --dry-run`).
- (red-first) the history half also measures `dl-111` Action 4's share of `wf()` commits carrying the `WingFoil-Version` trailer, `dl-101` Action 4's duplicate-id scan across branches (G15), and G08 against `dl-117`'s attribution rule (Action 3), each on the fixture with known answers.

## Implementation Notes

- **Size:** M · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-089 §1 measure, §6 (G01–G15); dl-131 Decision 3 (P); dl-130 step 3; dl-111 Action 4 (share of `wf()` commits carrying `WingFoil-Version`); dl-101 Action 4 (duplicate-id scan, G15); dl-117 Action 3 (G08 against the attribution rule).
- **Features:** P4.1.
- **Notes:** Proposal key: D15.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.
- **Handover from wave 3 B4 (2026-10-10, `task-222`'s independent review; W3 B4 follow-ups,
  `bug-ingest-rel-v0.3-w3b4-review-findings-plan`).** This task is the first consumer of the catalogue `task-222`
  wrote (`docs/08_health/metrics.yaml` version 2, validator `scripts/release-health/catalogue.cjs`), and the
  review found gaps in both:
  - **Validator gaps** in `catalogue.cjs` (each passes today and should be refused, with a rule test per case): a
    `floor` metric with `floor: null`; a `redefined` or `retired` id that names no metric; `added` given as a string
    instead of a list; a `direction` value outside the declared set on an `info` metric. Fix them before measuring,
    since the measure reads these fields.
  - **REQ-STATE-10's BDD is partial.** `P1.2-versioning-audit-trail.feature` has two scenarios under the comment
    "REQ-STATE-10 (US-6-12, task-222)" ("Process conformance names every failing item", "… byte-identical on a
    rerun"); both exercise check kind 1 (a malformed `wf()` commit). Kinds 2–5 of the fit criterion
    (`03_state-context.md`, REQ-STATE-10: legal transitions, `produces:` present, traceability links, actor per
    role) need a `Scenario Outline` with one example per kind, and the reviewer asked for an `@REQ-STATE-10` tag on
    them: the requirement is named in a comment only, and no feature file uses Gherkin tags yet (`grep -rln '^ *@'
    docs/02_requirements/02_bdd/features` → nothing, while `grep -rn "Scenario Outline"` over the same folder finds
    `P4.5` and `P4.18`), so the tag would be the first; keep the comment convention if a tag is not wanted. Kind 6 (two runs from one base) is the byte-identity scenario's neighbour and stays as it is unless the
    measure needs it.

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
