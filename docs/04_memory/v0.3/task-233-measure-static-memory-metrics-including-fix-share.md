---
id: "task-233-measure-static-memory-metrics-including-fix-share"
type: task
title: "Measure the static and Memory metrics, including the fix share"
status: backlog
release: "v0.3"
kind: "feature"
priority: "medium"
tags: ["v0.3", "process", "release-health", "scripts"]
ref: "dl-089"
bug: []
depends_on: ["task-150-declare-task-kind-stop-line-threshold", "task-222-declare-release-health-catalogue-v2-report-schema-release"]
tmpl_version: 260703
---

## Description

Complexity, duplication, import cycles and bypasses, unused dependencies and install size, dangling process-id references, SARD-cited-by-tests, bug and DL flow, document-divergence share, Memory volume, and Q18/Q19 from the `kind` field (heuristic before v0.3).

## Acceptance Criteria

- (red-first) each metric on a fixture with known answers; no new dependency (`dl-010`): where a metric needs a tool the repo lacks (e.g. clone detection), a minimal in-repo implementation or `not-measurable` with the reason, decided at design.
- (red-first) Q18/Q19 read `kind` for v0.3+ and the name-or-`bug:` heuristic for v0.1/v0.2; a feature task that absorbed a bug counts as feature (dl-133 §1).
- (characterization) Q15 classifies with dl-116's definition written in the catalogue.
- (characterization) `dl-010` Action 3 (E sweep): the production dependency count (`npm ls --omit=dev --depth=0`) is reported in the static metrics, so every retrospective sees it.

## Implementation Notes

- **Size:** M · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-089 §2 (Q05–Q10, Q13–Q16); dl-133 §1 (Q18, Q19 + v0.1/v0.2 heuristic backfill); dl-116 Action 2; dl-010 Action 3 (dependency count audit, E sweep).
- **Features:** P4.1.
- **Notes:** Proposal key: D17.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.
- **Handover from wave 3 B4 (2026-10-10, `task-222`'s independent review; W3 B4 follow-ups,
  `bug-ingest-rel-v0.3-w3b4-review-findings-plan`).** Three gaps in what this task measures, found against the
  catalogue `task-222` wrote (`docs/08_health/metrics.yaml` version 2):
  - **Q20 (bug net flow) has no owner.** It is in the catalogue's `added` list (`dl-100` §4 (a)) but neither this
    task's criteria nor `task-231`'s name it (`grep -n "Q20" docs/04_memory/v0.3/task-23*.md` → nothing). It is a
    Memory metric (bugs moved to `closed`/`deprecated` minus bugs added in the window), so it belongs here unless the
    approver assigns it elsewhere; record the choice in the Execution Notes.
  - **The dependency count of the last criterion has no catalogue metric.** The criterion reports `npm ls
    --omit=dev --depth=0` (`dl-010` Action 3), but no metric id carries it: either Q08 is redefined to hold it, or a
    new entry is added, with a decision-log if the choice is contested (`traceability`, filing rule 2), following
    the catalogue's `added`/`redefined` rules.
  - **Q15's mechanical rule will misclassify** bugs absorbed by large feature tasks: it classifies a bug as a
    document divergence from the non-merge commits of its fix (its definition), and a bug absorbed by a feature
    task (e.g. `bug-307` by `task-208`) shares its fix commits with the feature's code. Restrict the rule to the
    commits that cite the bug, or report such bugs as `not-classifiable`, and pin the case with a fixture.

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
