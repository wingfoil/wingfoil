---
id: "task-182-build-secret-shaped-fixtures-runtime-gate-test-scanner"
type: task
title: "Build secret-shaped fixtures at runtime, gate `test/` with the scanner, and narrow the scan's claim"
status: backlog
release: "v0.3"
kind: "fix"
priority: "medium"
tags: ["v0.3", "core", "security", "tests"]
ref: "dl-122"
bug: ["bug-055", "bug-190", "bug-228"]
depends_on: ["task-135-make-init-scan-builtin-templates-secrets-refuse-reinitialize"]
tmpl_version: 260703
---

## Description

The scanner's own tests hold secret-shaped literals; one blocked the repository's first push (`test/validation/secret-scan.test.ts:68`; `bug-055`). Ratified `dl-122` (b): fixtures are assembled at runtime, and a suite test runs `scanText` over tracked `test/` files. `dl-073` (C) narrows what a clean scan claims ("0 findings on the configuration store"); `spec-007` §1 still names the pre-`task-111` `docs/self/` roots while `SCAN_SURFACE_ROOTS` is `['.wingfoil','docs/04_memory']`.

## Acceptance Criteria

- (red-first) a suite test scans every tracked file under `test/` and fails on a blocking finding; it fails on a planted literal and passes after the fixtures are rewritten.
- (characterization) each rewritten fixture builds a value byte-identical to the literal it replaces.
- (characterization) `security-secrets.md` gains S1 (version bump); `spec-007` §1 names the real roots and the narrowed claim (Revision note); a `service` element records the push-protection exception through `service-ingest` (dl-073 S3 / dl-122 Action 4), or the task records why it cannot.

## Implementation Notes

- **Size:** S · **wave:** 2 · **kind:** fix (`dl-133` Q1 (b)).
- **Implements:** dl-122 (b) + Action 2 (security-secrets S1); dl-073 (C)+S1, S2, S3; spec-007 §1.
- **Notes:** Proposal key: C34.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
