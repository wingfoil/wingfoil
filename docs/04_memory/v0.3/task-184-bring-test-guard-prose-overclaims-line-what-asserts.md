---
id: "task-184-bring-test-guard-prose-overclaims-line-what-asserts"
type: task
title: "Bring the test guard prose that overclaims in line with what it asserts (T1 instances)"
status: in-progress
release: "v0.3"
kind: "fix"
priority: "medium"
tags: ["v0.3", "core", "directives", "tests"]
ref: "dl-121"
bug: ["bug-045", "bug-096", "bug-194"]
depends_on: ["task-139-extend-documentation-doc-versioning-testing-directives-ratified-clauses"]
tmpl_version: 260703
---

## Description

`dl-121` T1: a guard says exactly what it asserts; task-139 writes the rule into `testing.md`. Two named instances: module docs of `production-registry.test.ts:5-8`, `parity.test.ts:16-20`, `read-only-agent-channel.test.ts:12-14` still describe a read-only registry (`bug-045`); `test/cli/derived-option-namespace.test.ts:217-220` claims `--version` is absent from `program.options`, and `src/core/index.ts:342` shows the retired `dna set version 2` grammar (`bug-096`).

## Acceptance Criteria

- (red-first) the `--version` comment's claim is replaced by an assertion of the measured fact (or removed); the other prose is corrected to what the assertions check.

## Implementation Notes

- **Size:** S · **wave:** 2 · **kind:** fix (`dl-133` Q1 (b)).
- **Implements:** dl-121 T1 (named instances; the directive text is task-139).
- **Notes:** Proposal key: C40.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
