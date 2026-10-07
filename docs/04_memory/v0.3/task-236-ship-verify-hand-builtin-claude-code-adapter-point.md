---
id: "task-236-ship-verify-hand-builtin-claude-code-adapter-point"
type: task
title: "Ship and verify by hand the built-in `claude-code` adapter, and point this repository's agent at it"
status: backlog
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

This task writes `claude-code.yaml` from the Claude Code CLI's own help output and documentation, at a pinned version recorded in `verified_with`. It fills `command`, `launch.interactive.args`, `terminal: required`, `prompt.via`, `mcp.*`, `session.*`, `usage.*` and `version_args`, and ships the file as a built-in (installed by task-196). It then verifies by hand, in a real terminal, that: - the `wingfoil` MCP server registers for the launched process (and which server wins when `.mcp.json` also declares one); - the agent obtains the `{role}-session` Prompt with `element`/`state` from the bootstrap alone, with no user help; - session, model and usage lookups give values or `not-reported`; - the run record is committed. This repository's `team.agents` entry gains `adapter: claude-code`.

## Acceptance Criteria

- (red-first) The shipped manifest validates under task-177 as a built-in and is installed by `init`. A unit test pins its `name`, `format`, `terminal: required` and a non-empty `verified_with`.
- (characterization) The by-hand verification transcript goes into Execution Notes: the commands run, the agent CLI version, the observed record line, and the `agent: record` commit sha. It names no flag as a fact without the help output that shows it (`claim-evidence`).
- (characterization) The Prompt-fetch check passes. **If it or the MCP registration fails, the task stops and returns the choice to the approver** (`spec-016` §2.8; R17 is not narrowed silently).
- (characterization) `.wingfoil/dna.yaml` `team.agents[0]` gains `adapter: claude-code` through `dna update … --entry-adapter` (task-138), with a `doc-versioning` bump. `agent execute --element <real task> --role developer` on this repository is part of the by-hand pass.

## Implementation Notes

- **Size:** M · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** R17; adr-012 point 2; spec-016 §2.2, §2.5, §2.8 (N1: the `{role}-session` Prompt fetch check).
- **Features:** P5.3.1, P5.4.3.
- **Notes:** Proposal key: B14. CI cannot run it (`adr-012` Consequences). `verified_with` is the only version pin.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.
- **Handover from the W3 B1 triage (2026-10-07, `task-196`'s review).** No BDD scenario pins the refusal `init` prints when a built-in adapter manifest fails its integrity check or its secret scan (`built-in adapter template integrity check failed: <name>`, `… secret scan failed: <name> (<rule>, line <n>)`; `grep -rli adapter docs/02_requirements/02_bdd/` finds nothing). With the first real built-in adapter, add that scenario under P5.1.1 or P5.3.1.

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
