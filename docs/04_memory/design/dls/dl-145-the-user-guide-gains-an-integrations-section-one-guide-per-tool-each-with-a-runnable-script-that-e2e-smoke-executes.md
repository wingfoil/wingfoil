---
id: dl-145-the-user-guide-gains-an-integrations-section-one-guide-per-tool-each-with-a-runnable-script-that-e2e-smoke-executes
type: decision-log
title: "The user guide gains an Integrations section: one guide per tool, each with a runnable script that e2e-smoke executes"
status: ready
context: "ad-hoc"            # optional — short label for the context, e.g. "retrospective", "planning", "ad-hoc"
release: ""            # optional — implementation release this DL is assigned to (stamped at release-planning/build-backlog, dl-016), e.g. "v0.1"
contributor: ""        # optional — who originated this contribution, if not the git author (dl-020); credited for AI-generated work derived from it
credit: ""             # optional — free-text credit note (dl-020)
tmpl_version: 260703   # Orignal template version
tags: ["docs","integrations","e2e-smoke"]
---

## Context

**The user guide documents one agent.** `docs/user-guide.md` §9 "Connect an AI agent" covers the
MCP server with Claude Code's registration (§9.1), `agents.md` (§9.2) and roles for agents (§9.3);
§10 "CI and scripting" covers JSON output and exit codes. No other agent and no spec-driven tool has
a guide (`grep -n "^##\|^###" docs/user-guide.md`).

**The guide's examples are runnable.** `docs/examples/` holds five self-checking scripts,
`01-first-project` … `05-ci-json-exit-codes`, each a `run.sh` (`ls docs/examples/*/`). `user-docs`'
`align-user-docs` phase lists `docs/examples/` in its `produces:`
(`.wingfoil/workflows/custom/user-docs.yaml`). `e2e-smoke` (v1.2) does not run them: its phases are
`fresh-init`, `drive-cli`, `mcp-registration` and `gate`
(`.wingfoil/workflows/custom/e2e-smoke.yaml`).

`dl-140` makes integrations with agents and spec-driven tools the acquisition channel, and
`dl-143` generates the files those tools read; users need a guide per tool that is known to work.

Raised by the approver on 2026-10-02 as the outcome of a market analysis.

## Decision

**The user guide gains an Integrations section**, extending §9 and §10, written by
`align-user-docs` after v0.3 ships.
- **One decision-log for the whole section (this one), then one task per guide.**
- **Every guide has a mandatory runnable script** at `docs/examples/NN-<tool>/run.sh`, executed by
  `e2e-smoke`. Where a GUI or an account prevents a full run, the guide's note says so and the
  script still tests as much as it can:
  - validates the generated configuration against the tool's documented schema;
  - exercises `wingfoil mcp` with a scripted MCP client;
  - checks that `AGENTS.md` and the skills exist and parse;
  - uses the tool's headless mode where it has one.
  Each guide carries a **"Testability"** line stating what its script covers.
- **Official guides only at first**; links to community guides once they exist.

**First group:**
- agent hosts through MCP and `AGENTS.md`: Claude Code (already in §9.1), OpenAI Codex CLI,
  Cursor, GitHub Copilot;
- Ruler / rulesync, after `dl-137`;
- coexistence with Spec Kit and OpenSpec, once the workflow exists.

**Later, for step 2 of `dl-141`:** Kosli (attestations from approval commits), Entire (agent
sessions next to Memory elements), OpenViking (a read-only index only), LiteLLM (gateway for the
`agent execute` adapters, `spec-016`).

## Rationale

- **A guide nobody runs goes stale.** The examples are already self-checking; tying each
  integration guide to a script `e2e-smoke` runs keeps it true release after release.
- **Honest about limits.** A "Testability" line says what is verified and what is not, rather than
  implying a full run.
- **One decision, many tasks.** The rules are shared; each guide is independent work.

## Actions

1. **Ratify** at `in-discussion → ready`. Owner: approver.
2. **Amend `e2e-smoke`** to run `docs/examples/*/run.sh` as a phase (a workflow change, through a
   task). Owner: qa.
3. **One task per guide** of the first group, at release-planning after v0.3. Order in the roadmap:
   sixth (`dl-140`, D3).

## Relations

- **Extends:** `dl-013` (`align-user-docs`), `dl-023` (`e2e-smoke`).
- **Related:** `dl-140`, `dl-141`, `dl-143`, `dl-144`, `dl-137`.
