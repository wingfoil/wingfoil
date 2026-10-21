---
id: decision-log-ingest-rel-v0.3-agents-md-plan
type: plan
title: "Decision-log-ingest — rel-v0.3 AGENTS.md as the agent file"
status: done
version: "1.0"
workflow: "decision-log-ingest"
phase: "rel-v0.3-agents-md"
element: "minor-v0.3"
release: "v0.3"
tmpl_version: 260703   # Orignal template version
---

## Context

On 2026-10-01 the approver asked to adopt AGENTS.md as early as possible, in place of `CLAUDE.md`, as
the agent instruction file WingFoil maintains. The request reached this session from another working
session. The decision is captured through `decision-log-ingest`
(`.wingfoil/workflows/custom/decision-log-ingest.yaml` v1.0), during v0.3's dev-loop.

Every fact the decision-log states is checked at capture:
- the Agentic AI Foundation and AGENTS.md's role, against the Linux Foundation announcement;
- the absence of AGENTS.md, with `ls`;
- `align-agent-docs`' `produces:` and checks, against `user-docs.yaml`.

The decision-log cites no material outside this repository except that public source.

## Phases / Steps

1. **capture** (product-owner): `memory add --type decision-log` → `dl-137` (`3dd4949c`), then
   `memory submit` → `in-discussion` (`93ae0af0`). Both use the code version.
2. **approve** (⛔ approver): ratify Q1 (what happens to `CLAUDE.md`), Q2 (scaffold, export or both)
   and Q3 (release for part (a) and part (b)). Then `in-discussion → ready`.

## Handoff

- **Approver:** Q1–Q3 and the ratification. The tasks for parts (a) and (b) follow the ruling.
- **Agent:** capture, the fact checks, and the tasks once ruled.
- **Completion criteria:** `dl-137` `ready` (or `rejected → draft`); this plan `active → done`.

## Execution Notes
