---
id: "task-241-compare-runs-write-proposals-backfill"
type: task
title: "Compare runs, write proposals and backfill the v0.1 and v0.2 baselines"
status: in-progress
release: "v0.3"
kind: "feature"
priority: "medium"
tags: ["v0.3", "process", "release-health", "scripts"]
ref: "dl-089"
bug: ["bug-344-the-release-health.measure-binding-passes-neither-any-node-nor-max-workers-to-measure.cjs", "bug-332-a-test-imports-ajv-which-package.json-does-not-declare"]
depends_on: ["task-231-measure-git-history-process-conformance-external-metrics", "task-232-measure-build-test-coverage-example-latency-install-metrics", "task-233-measure-static-memory-metrics-including-fix-share"]
tmpl_version: 260703
---

## Description

`compare.cjs` classifies every metric against the previous run (re-measuring like-for-like across catalogue versions), evaluates floors, settles the previous proposals and writes `RH-<version>-NN` proposals for untracked findings; the two baselines are produced so v0.3 compares against two real runs.

## Acceptance Criteria

- (red-first) improved/stable/regressed/new/not-comparable with dl-089's tolerances; a cross-version comparison re-measures the previous point; three-run trend shown; unit-tested.
- (red-first) `propose` searches Memory for a tracking element before proposing; G07/G10/G14 and Q01/Q02-at-tag breaches are flagged for immediate `bug-ingest` (§5).
- (characterization) v0.1 measured at `5b16ab61`, v0.2 at `v0.2.1`; both reports committed under `docs/08_health/` (`paths.health`); the provisional v0.2 table in dl-089 §7 is compared and differences explained.

## Implementation Notes

- **Size:** M · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-089 §3, §4, §5, §7.
- **Features:** P4.1.
- **Notes:** Proposal key: D18.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

- **Handover from wave 3 B5 (2026-10-11, W3 B5 follow-ups, `bug-ingest-rel-v0.3-w3b5-review-findings-plan` item 12;
  `task-231`'s independent review, finding F7).** Measured on `main` at `29b8406a`; no criterion changes. With
  `--previous <rev>`, `measure.cjs` writes placeholders in the report's `previous` object: `release` is the string
  `--previous <rev>` and `report` is `(none: named by --previous)` (`sed -n 967,968p
  scripts/release-health/measure.cjs`), while `docs/08_health/release-health.schema.json` documents `report` as the
  "Repository-relative path of the previous JSON report" (`grep -n "Repository-relative path" docs/08_health/release-health.schema.json`)
  and its `type: string` accepts either. `compare.cjs`, the reader of `previous`, decides how it treats such a run
  (no previous report to settle proposals against) and the schema either allows `report: null` with a `basis`
  (`report` or `--previous`) or the script writes the version the revision carries.

- **Handover (2026-10-11, W3 B5 gate: five minor inaccuracies in `measure.cjs` found by `task-231`'s independent
  review, finding F8).** Measured on `main` at `29b8406a`; no criterion changes. Settle each where the report or
  `compare.cjs` reads it:
  - `--at <rev>` on a commit that carries no tag is labelled `basis: 'released-transition'` even when it is not the
    commit of the release's `released` transition (`grep -n "released-transition" scripts/release-health/measure.cjs`,
    lines 943 and 955).
  - P01, P02 and P05 count the commits they cannot check inside `checked`/`items` (the review's v0.2.2 run: P02
    checked 529, of which 121 unchecked); the definition question is `dl-173`'s.
  - G08 with no judged commit is reported `measured` with `conforming_share: null` (line 534), against the header's
    rule that a share with no item is `not-measurable`.
  - P04 resolves an element id by prefix, so `dl-117` matches any `dl-117-*` (line 726).
  - `UNCHECKABLE_RE` (line 613) depends on the exact wording of a `check-governance.cjs` message.

- **Handover from wave 3 B6 (2026-10-12, W3 B6 follow-ups, `bug-ingest-rel-v0.3-w3b6-review-findings-plan` item B1;
  `task-232`'s independent review).** This task absorbs `bug-344`: the binding `release-health.measure`
  (`sed -n 103p .wingfoil/workflows/bindings.yaml`) runs `measure.cjs --release {release}` with neither
  `--any-node` nor `--max-workers`. Off Node 22.12.0 (`publish.yml` `NODE_VERSION`; this machine runs `v22.21.0`)
  every toolchain metric is then `not-measurable` (`sed -n 1446,1448p scripts/release-health/measure.cjs`), so
  `dl-089` §5's immediate-bug rule can never fire for them; on 22.12.0 the two jest runs use jest's default workers
  against `dl-170`'s interim rule (`sed -n 1466p scripts/release-health/measure.cjs`). The binding either declares
  how the step runs under the pinned Node or admits `--any-node` (recorded in the report), and passes
  `--max-workers 2`; the bindings test and `release-health.yaml`'s step description follow. Also from `task-232`'s
  review, for `compare.cjs`: Q17 (like G15 and E01–E05) is a reading at run time, not at the point, so a changed
  value between two reports is not a regression (`dl-089` §1); `dl-173` holds the catalogue question.

- **Handover from the approver's absorption of the inherited v0.3 bugs (2026-10-12,
  `bug-ingest-rel-v0.3-w3b6-review-findings-plan`).** This task also absorbs `bug-332`:
  `test/release-health/measure.test.ts:22` imports `ajv/dist/2020`, which `package.json` does not declare (`grep -n
  '"ajv"' package.json` → no match; `npm ls ajv` → only through `@modelcontextprotocol/sdk`). Declare `ajv` in
  `devDependencies` at the major the test uses (8), with the lockfile, sequenced with `task-234`'s `package.json`
  edit (`homepage`) so the two do not conflict.

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
