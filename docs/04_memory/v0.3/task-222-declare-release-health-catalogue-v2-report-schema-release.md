---
id: "task-222-declare-release-health-catalogue-v2-report-schema-release"
type: task
title: "Declare the release-health catalogue v2, its report schema and the release-health workflow"
status: backlog
release: "v0.3"
kind: "feature"
priority: "medium"
tags: ["v0.3", "process", "release-health", "workflow-config"]
ref: "dl-089"
bug: ["bug-299"]
depends_on: ["task-199-align-wingfoil-workflows-custom-v0-3-schema-commands", "task-213-write-retrospective-notes-during-release-templates-retrospective-workflow"]
tmpl_version: 260703
---

## Description

The two catalogues are fixed in a versioned file, not chosen per run. v2 adds the fix share (Q18/Q19), the process-conformance measures P (dl-131), the external visibility snapshot as `info` metrics (dl-130), bug net flow (dl-100 §4 (a)) and a mechanical Q15 definition (dl-116).

## Acceptance Criteria

- (characterization) `docs/06_health/metrics.yaml` (catalogue v2) holds G01–G15, Q01–Q19, D01 and the new P and external entries, each with id, definition, scope, kind, direction/tolerance; D01 is O (dl-131), with dl-089's equivalence criterion (≥ 90 % agreeing, every critical scenario passing).
- (characterization) a JSON schema for `release-health-<version>.json` and the `.md` layout; `dna.yaml` `paths:` gains the `health` entry for `docs/06_health/` (dl-089 (A)).
- (characterization) `release-health.yaml` (measure → compare → propose, roles per dl-089 §1) added; `release-cycle.yaml` runs it between `publishing` and `retrospective` (D01 on major/minor only); `retrospective.yaml` `explore`/`additional-points` read it and `retro-*` gains `## Release health`; versions bumped; zero load errors.
- (red-first) a test validates `metrics.yaml` against the catalogue rules (unique ids; every metric has scope/kind; a `retired` metric keeps its entry).
- (characterization) `.wingfoil/WORKFLOW.md` draws `release-health`; task-148's phase-name test stays green.

## Implementation Notes

- **Size:** M · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-089 §1, §2 (`{health-dir}` (A)), Actions 3–4; dl-133 §1 (Q18, Q19); dl-131 Action 8 (P measures); dl-130 step 3 / Q2 (a); dl-100 §4 (a); dl-116 Action 2 (Q15 definition).
- **Features:** P4.1.
- **Notes:** Proposal key: D14. `script.run(...)` tokens bind through `bindings.yaml` (dl-090); until P4.10 the scripts run by hand. `dl-090` Action 4: the `script.run(...)` tokens of this workflow are bound in task-199's `bindings.yaml`. `dl-114` Action 3 (cost metrics from the run records) is optional in the catalogue, decided at design.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.
- **Handover from wave 1 B2 (2026-10-02, `task-141`'s independent review).** REQ-STATE-10 (`docs/02_requirements/03_sard/03_state-context.md`, ratified 2026-10-01) cites the catalogue v2 process-conformance entries that this task declares: add the P entries its fit criterion lists (checks 1-6, byte-identical reruns), and give REQ-STATE-10 its user story and BDD scenario, which it still lacks.
- **Handover from wave 3 B3 (2026-10-09, `task-207`'s review; W3 B3 follow-ups).** `docs/07_gates/` is a new
  numbered folder, used by the e2e-smoke gate's report (`e2e-smoke.yaml` `gate` `produces:`
  `docs/07_gates/rl-{release.release-line}/rel-{release.version}-e2e-smoke.md`, `task-207`): fold it into the
  numbering ruling `bug-299` asks for.

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
