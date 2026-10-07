---
id: "task-214-add-community-health-files-shaped-ingestion"
type: task
title: "Add the community health files, shaped for ingestion"
status: in-progress
release: "v0.3"
kind: "feature"
priority: "medium"
tags: ["v0.3", "process", "community", "docs"]
ref: "dl-127"
bug: []
depends_on: ["task-199-align-wingfoil-workflows-custom-v0-3-schema-commands"]
tmpl_version: 260703
---

## Description

GitHub recognises no contributing guide, code of conduct, security policy or issue/PR templates. Each file is shaped so a submission can be ingested as a Memory element.

## Acceptance Criteria

- (characterization) `CONTRIBUTING.md` (short pointer to `COLLABORATION.md`, Q1 (a)), `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1 verbatim, enforcement contact from the approver), `SECURITY.md` (latest minor supported; GitHub private vulnerability reporting).
- (characterization) `.github/ISSUE_TEMPLATE/` bug form with the `bug` template's fields, proposal form shaped on `decision-log-ingest`, `config.yml`; `.github/PULL_REQUEST_TEMPLATE.md` pointing to `COLLABORATION.md` and asking for the implemented element.
- (characterization) `user-docs.yaml` `align-user-docs` `produces:` gains them; version bumped.
- (characterization) post-merge, approver: private vulnerability reporting on, recorded as a `service` (`kind: setting`); `gh api repos/wingfoil/wingfoil/community/profile` reports each file.

## Implementation Notes

- **Size:** S · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-127 (Q1–Q4 (a)).
- **Notes:** Proposal key: D33. the DL's `gh api` paths name `robypomper/wingfoil`; the repository is `wingfoil/wingfoil` since task-116.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
