---
id: "task-200-fake-agent-custom-adapter-let-agent-execute-path"
type: task
title: "A fake agent and its custom adapter let every `agent execute` path run under Jest and CI with no real agent and no terminal"
status: backlog
release: "v0.3"
kind: "feature"
priority: "high"
tags: ["v0.3", "agent", "testing", "fixtures"]
ref: "adr-012"
bug: ["bug-234"]
depends_on: ["task-177-adapter-manifests-load-validate-wingfoil-agents-builtin-custom", "task-195-role-session-mcp-prompt-accepts-element-state-returns"]
tmpl_version: 260703
---

## Description

`spec-016` §2.7 fixes that the fake is a **custom** adapter covering every §2.2 field. The fake is a Node script, `test/fixtures/agents/fake-agent.cjs`. It: - records its argv, stdin and environment **names**; - can connect to the registered `wingfoil` server and fetch `{role}-session` with `element`/`state`; - prints a declared JSON document (session, model, usage); - exits with a declared code or waits for a signal. Two manifests declare it: `terminal: optional` (the success path) and `terminal: required` (the `NO_TERMINAL` refusal).

## Acceptance Criteria

- (red-first) `custom/fake.yaml` passes task-177's validation and exercises every §2.2 field (assert by walking the schema's keys against the fixture).
- (red-first) Driven directly (without `agent execute`) through a rendered MCP config pointing at `node dist/cli.js mcp`, the fake completes `initialize` and the Prompt fetch and writes the Prompt text to its record file. That text equals task-176's payload.
- (characterization) The fixture writes environment variable names only, never values (`REQ-SEC-08`). The `security-secrets` / `dl-122` rules hold: no secret-shaped literal in the fixture.
- (characterization) No test in the suite needs a pseudo-terminal (`grep -rn "node-pty\|script -q" test` → nothing).

## Implementation Notes

- **Size:** S · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** adr-012 point 6; spec-016 §2.7.
- **Features:** P5.3.1, P5.4.3.
- **Notes:** Proposal key: B07. the exact paths are the task's choice (§2.7). Headless-result Tool calls are v1.0 and stay out.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
