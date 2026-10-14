---
id: "task-237-ship-verify-hand-builtin-codex-cli-adapter"
type: task
title: "Ship and verify by hand the built-in `codex-cli` adapter"
status: in-progress
release: "v0.3"
kind: "feature"
priority: "high"
tags: ["v0.3", "agent", "adapter", "manual-verification"]
ref: "adr-012"
bug: []
depends_on: ["task-196-wingfoil-init-installs-builtin-adapters-protected-builtin-assets", "task-228-agent-execute-launches-agent-forwards-right-signals-records"]
tmpl_version: 260703
---

## Description

The same procedure as task-236 for Codex CLI. This proves the adapter shape against a second vendor in the release that introduces it (North Star "different AI agents"). `grep -rniI codex --exclude-dir=node_modules --exclude-dir=.git .` finds nothing about its flags in the repository today, so every declaration comes from its own help output and documentation at the `verified_with` version.

## Acceptance Criteria

- (red-first) The manifest validates as a built-in and is installed by `init`, pinned as in task-236.
- (characterization) By-hand verification of MCP registration, the `{role}-session` fetch with `element`/`state`, the lookups, and the record commit, recorded in Execution Notes with evidence. The same stop-and-return-to-approver rule applies.
- (characterization) An agent entry naming `adapter: codex-cli` in a scratch project runs one `agent execute` end to end. The run is recorded with `adapter: "built-in/codex-cli"`.

## Implementation Notes

- **Size:** M · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** R17; adr-012 point 2; spec-016 §2.8 (N1).
- **Features:** P5.3.1, P5.4.3.
- **Notes:** Proposal key: B15.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
