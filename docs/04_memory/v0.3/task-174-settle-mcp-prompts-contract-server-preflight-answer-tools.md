---
id: "task-174-settle-mcp-prompts-contract-server-preflight-answer-tools"
type: task
title: "Settle the MCP Prompts contract and the server's pre-flight, and answer `tools/list` with an empty list"
status: in-progress
release: "v0.3"
kind: "fix"
priority: "high"
tags: ["v0.3", "core", "mcp", "first-use"]
ref: "dl-039"
bug: ["bug-035", "bug-151", "bug-184"]
depends_on: ["task-130-show-coreerror-details-surface-give-refusal-shape-under", "task-143-make-directive-loader-robust-dangling-symlinks-project"]
tmpl_version: 260703
---

## Description

`spec-004` §3.2's example uses `role: "system"` (impossible on MCP), "resolution order" overreaches, and embedded directive bodies invert heading levels (`src/mcp/prompt.ts:120`; `dl-039`); §3 lacks the undefined-role refusal the code already implements (`dl-048`); the role set is read per request while the spec says server start (`dl-049` (b): read in `runMcp`'s pre-flight). `wingfoil mcp` starts in a git root with no `.wingfoil/` and every read leaks a raw ENOENT with an absolute path (`bug-035`, `src/cli/mcp-command.ts:43-50`). `tools/list` answers -32601 (`bug-151`): the `registerCapabilities({tools:{}})` at `src/mcp/registrar.ts:74` never runs in production, and would not install a handler if it did.

## Acceptance Criteria

- (red-first) `wingfoil mcp` in a git root without `.wingfoil/` exits 1 before serving, with the "not initialized" message and no absolute path; the role set is read there and passed to `createMcpServer` (`dl-049` (b)); `listChanged` stays off.
- (red-first) `tools/list` returns `{tools: []}` and `initialize` advertises `tools`; the tests at `test/mcp/read-only-agent-channel.test.ts:185` and `test/mcp/role-prompts.test.ts:262` that pin -32601 are rewritten; the registrar comment is corrected.
- (red-first) a directive body's headings are demoted two levels inside the Prompt.
- (characterization) the undefined-role refusal (-32602, both messages) is pinned and written into `spec-004` §3.4; §3.2's example uses `role: "user"` and "resolution set" (id-ascending, spec-012 §5); `spec-014` §2/§3 drop "v0.1 channel"; one Revision note.

## Implementation Notes

- **Size:** M · **wave:** 2 · **kind:** fix (`dl-133` Q1 (b)).
- **Implements:** dl-039 (role 1, ordering 1, headings 1); dl-048 option 1 (§3.4 refusals); dl-049 (b) + editorial spec-014 §2/§3; spec-004 §3.
- **Features:** P5.2.2, P5.2.1.
- **Notes:** Proposal key: C32. B's `spec-004` §3.1–§3.2 Prompt-argument amendment (`element`, `state`; R18) edits the same section — whichever lands second rebases.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.
- **Handover from wave 1 B3 (2026-10-02, `task-143`).** Reuse `requireInitializedProject` and `WINGFOIL_NOT_INITIALIZED` (exported from `src/core`, `src/core/init.ts`) for the MCP server's pre-flight; do not word a second refusal. Known limit: when `.wingfoil` is a file, the message's "run 'wingfoil init' first" loops, because `init` refuses that case. `bug-198` covers the CLI read commands that should adopt the same refusal.

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
