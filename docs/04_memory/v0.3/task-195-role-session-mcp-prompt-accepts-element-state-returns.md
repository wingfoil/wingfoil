---
id: "task-195-role-session-mcp-prompt-accepts-element-state-returns"
type: task
title: "The `{role}-session` MCP Prompt accepts `element` and `state` and returns the `spec-012` §7 payload at that commit"
status: backlog
release: "v0.3"
kind: "feature"
priority: "high"
tags: ["v0.3", "agent", "mcp", "context"]
ref: "spec-016"
bug: ["bug-231"]
depends_on: ["task-174-settle-mcp-prompts-contract-server-preflight-answer-tools", "task-176-complete-spec-012-context-builder-dna-selection-relevance"]
tmpl_version: 260703
---

## Description

`adr-012` point 3 and approver ruling R18 make the `{role}-session` Prompt the MCP primitive that carries the assembled context. It gains two optional arguments, `element="<type>:<id>"` and `state="<sha>"`. With both, it returns task-176's §7 payload for `(role, element, state)`, resolved at `state`. Without them it behaves exactly as today. This is the "via MCP" half of `REQ-INT-07`, the context that `agent execute`'s pre-flight (task-218) and the fake adapter (task-200) fetch.

## Acceptance Criteria

- (red-first) `prompts/list` declares `element` and `state` as optional arguments of every `{role}-session` Prompt.
- (red-first) `prompts/get developer-session` with `element="task:<id>"` and `state="<sha>"` returns one message whose text is byte-equal to task-176's payload for the same request. A later commit, or an uncommitted edit to that element, does not change the answer.
- (characterization) Without arguments the Prompt returns the current role header plus directive blocks unchanged, so `test/mcp/role-prompts.test.ts` and `mcp-prompts.feature.test.ts` stay green.
- (red-first) The refusals are `InvalidParams` (-32602, the code of `spec-004` §3.4 per dl-048): only one of the two arguments given; a malformed element-ref (`spec-008` §7); an unknown element at `state`; a `state` that is not a commit. Each message is fixed in the `spec-004` amendment.
- (red-first) The server still exposes no Tool, and the handler writes nothing (REQ-SEC-05). The existing byte-for-byte round-trip test extends to a call with arguments.
- (characterization) `spec-004` §3.1–§3.2 amended with a `doc-versioning` bump: the two optional arguments, and the embedding contract (the §7 payload resolved at `state`, not per request against the working tree).

## Implementation Notes

- **Size:** M · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** spec-016 §2.4 (R18); spec-004 §3.1–§3.2 amendment; adr-012 point 3.
- **Features:** P5.4.3, P5.4.4, P5.2.2.
- **Notes:** Proposal key: B03. `src/mcp/prompt.ts`, `docs/04_memory/design/specs/spec-004-mcp-surface-contract.md`. **Belongs with C's MCP work for file ownership**: if C's dl-039/048/049 task is scheduled first, this task rebases on it. The `agent` Resources stay v0.4 (R5, spec-016 §7).
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.
- **Handover from wave 2 B1 (2026-10-05, `task-171` and `task-176`).** `assembleExecutionContext`
  (`src/core/context.ts`) reads Memory tolerantly: an unreadable document is left out and reported as
  `W_MEMORY_UNREADABLE` in the result's `warnings` (`CoreResult`, third argument of `coreOk`), and a malformed subject
  element comes back as `NOT_FOUND` with `details.unreadable`. Neither is in the payload. Forward both to the
  surface this task builds (stderr / `--format json` warnings, or the MCP response), so they are never dropped.

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
