---
id: "task-165-put-bootstrap-commands-command-surface-mcp-specs-bootstrap"
type: task
title: "Put the bootstrap commands on the command surface: `mcp` in the specs, bootstrap exempt from REQ-SYS-05"
status: backlog
release: "v0.3"
kind: "fix"
priority: "low"
tags: ["v0.3", "core", "docs", "specs"]
ref: "dl-046"
bug: ["bug-028", "bug-179", "bug-204"]
depends_on: ["task-129-refuse-operand-beyond-command-declares-exit-2-before"]
tmpl_version: 260703
---

## Description

`wingfoil mcp` is missing from the command-surface lists in `spec-005`, `spec-006` §3 and `spec-008` §1 (`bug-028`). `dl-046`: bootstrap commands are exempt from REQ-SYS-05's "every mutating operation reachable via an MCP tool" (A(a)), `audit` is flat (B(a)), and the `{module}{Verb}` naming rule is relaxed for flat self-named ops (C) — which also covers the flat ops v0.3 adds.

## Acceptance Criteria

- (characterization) the three specs list `init`, `mcp`, `audit`, `paths` consistently; REQ-SYS-05's fit criterion states the bootstrap exemption; each with a Revision note.
- (red-first) `test/docs/cli-reference.test.ts` (or a sibling) fails if a registered bootstrap command is missing from `spec-008` §1's list.

## Implementation Notes

- **Size:** S · **wave:** 1 · **kind:** fix (`dl-133` Q1 (b)).
- **Implements:** dl-046 A(a), B(a), C; REQ-SYS-05 amendment; spec-006 §3; spec-005; spec-008 §1.
- **Features:** P5.1.3, P5.2.
- **Notes:** Proposal key: C38.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
