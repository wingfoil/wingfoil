---
id: dl-137-agents.md-replaces-claude.md-as-the-agent-instruction-file-wingfoil-maintains
type: decision-log
title: "AGENTS.md replaces CLAUDE.md as the agent instruction file WingFoil maintains"
status: in-discussion
context: "ad-hoc"            # optional — short label for the context, e.g. "retrospective", "planning", "ad-hoc"
release: ""            # optional — implementation release this DL is assigned to (stamped at release-planning/build-backlog, dl-016), e.g. "v0.1"
contributor: ""        # optional — who originated this contribution, if not the git author (dl-020); credited for AI-generated work derived from it
credit: ""             # optional — free-text credit note (dl-020)
tmpl_version: 260703   # Orignal template version
tags: ["governance","agents","docs"]
---

## Context

**AGENTS.md is the cross-vendor convention** for the file that tells a coding agent how to work in a
repository. It is one of the three founding projects of the Agentic AI Foundation, which the Linux
Foundation formed on 2025-12-09 with MCP (from Anthropic) and goose (from Block). The foundation's
announcement describes AGENTS.md as "a simple, universal standard that gives AI coding agents a
consistent source of project-specific guidance". Source:
<https://www.linuxfoundation.org/press/linux-foundation-announces-the-formation-of-the-agentic-ai-foundation>,
read 2026-10-01.

**WingFoil neither generates nor maintains an AGENTS.md** (`ls AGENTS.md` at `58342a45` finds no
file). The one agent-facing file it keeps aligned is `CLAUDE.md`:
- the `align-agent-docs` phase of `user-docs` (`dl-025`) lists `CLAUDE.md` and `.wingfoil/README.md`
  in its `produces:` (`.wingfoil/workflows/custom/user-docs.yaml`);
- its checks are phrased against `CLAUDE.md` ("CLAUDE.md project status matches the shipped command
  surface", "… element/state tables match memory.yaml", "… workflow list matches workflows.yaml",
  "… role-directive bindings match roles.yaml").

`CLAUDE.md` is the file name of one vendor's agent, so WingFoil's own agent-facing contract depends
on one vendor. That contradicts the product's agent-agnostic position: the North Star is defined
over runs "using different AI agents" (`docs/01_vision/01_product-brief.md`, North Star), `task-141`
adds a *Works with* list of coding agents to the brief, and
`dl-131`/`spec-016` design agent execution around per-agent adapters.

The gap has two independent parts:
- **(a) this repository.** Its own agent entry point is `CLAUDE.md`. It is cited by `dl-025`, by
  `user-docs.yaml`, by `.wingfoil/README.md`, and by source comments (for example
  `src/storage/commit.ts`, `src/core/approval-authority.ts`).
- **(b) the product.** A project that uses WingFoil gets no AGENTS.md from `wingfoil init` or from
  any command, although WingFoil holds exactly the information such a file carries: DNA, directives
  by role, the Memory model and the workflows.

Raised by the approver on 2026-10-01, with the request to adopt AGENTS.md as early as possible.

## Decision

The approver has decided the direction: **the agent instruction file WingFoil maintains is
`AGENTS.md`.** The following remain open and are settled at ratification:

**Q1 — what happens to `CLAUDE.md` in this repository.**
- **(a) Removed.** `AGENTS.md` takes its content. Claude Code reads AGENTS.md only if it supports
  the convention, which is to be verified for the version in use.
- **(b) Reduced to a pointer.** `CLAUDE.md` holds one line that defers to `AGENTS.md` (for example
  an import of it), so any agent that only reads `CLAUDE.md` still gets the same instructions.
  `align-agent-docs` checks only `AGENTS.md`, plus that the pointer exists.

**Q2 — scope of the product feature.**
- **(i) Scaffold.** `wingfoil init` writes an `AGENTS.md` generated from the configuration it
  scaffolds.
- **(ii) Export.** A command (for example `wingfoil agents-md` or an `export` verb) regenerates
  `AGENTS.md` from the committed configuration, so it can be kept current, and a check reports
  drift.
- **(iii) Both.**

**Q3 — release.** Part (a), this repository's migration, is small. Part (b) is a feature with a
spec. The approver chooses whether either enters v0.3 or v0.4.

**Recommendation:** Q1 (b), Q2 (iii), and Q3: part (a) in v0.3, part (b) in v0.4.
- **Q1 (b)** keeps every agent working during the transition, at the cost of one line.
- **Q2 (iii):** a scaffold alone goes stale the first time the configuration changes; an export
  alone leaves a fresh project without the file.
- **Q3:** part (a) is a rename plus reference updates, and part (b) needs a tech-spec for what the
  generated file contains.

## Rationale

- **Agent-agnostic by construction.** The file an agent reads first should not be named after one
  agent. AGENTS.md is the name the agents themselves converged on, and it now has a neutral
  steward, the same foundation that holds MCP, which WingFoil already implements (P5.2).
- **WingFoil is the right owner of the file.** Its content is a projection of DNA, directives,
  Memory and workflows, which WingFoil already holds and validates. Generating it removes a
  hand-maintained second copy, which is exactly what `align-agent-docs` exists to check by hand.
- **Two parts, two elements.** The repository's migration and the product feature have different
  sizes and owners. Keeping them separate lets the first land without waiting for the second's
  spec.

## Actions

1. **Ratify Q1–Q3** at `in-discussion → ready`. Owner: approver.
2. **Part (a), this repository**, once ratified. One task:
   - move `CLAUDE.md`'s content to `AGENTS.md`;
   - apply Q1 to `CLAUDE.md`;
   - amend `dl-025` and `user-docs.yaml` (`align-agent-docs` `produces:` and checks name
     `AGENTS.md`);
   - update `.wingfoil/README.md` and the source comments that cite `CLAUDE.md` as the conventions'
     home.
3. **Part (b), the product**, once ratified. A tech-spec for the generated `AGENTS.md`: sections,
   sources, determinism, and drift detection. Then the task(s) implementing Q2. The tech-spec must
   meet these constraints, agreed on 2026-10-05 with the WingFoil-Templates `base` pack (approver):
   - **R1 — never a pack file.** `AGENTS.md`, and `CLAUDE.md` as its pointer, is never a file a
     template pack provides; packs write only under `.wingfoil/`.
   - **R2 — generated from the composed configuration.** WingFoil generates the file from the
     composed DNA, role directives, Memory and workflows. A pack contributes at most a fragment it
     declares under `.wingfoil/`, which the generator includes. The tech-spec defines that fragment
     input.
   - **R3 — two owners.** A region delimited by markers belongs to WingFoil and is regenerated; the
     rest of the file belongs to the project and is never touched. Drift detection reads only the
     generated region. The tech-spec defines the marker format.
   - **R4 — until the export exists**, a repository writes `AGENTS.md` by hand, already with the
     markers; part (a) does so for this repository.
4. **Re-check the fact** that Claude Code reads AGENTS.md, for the version this repository's agents
   use, before choosing Q1 (a).

## Relations

- **Amends, when ratified:** `dl-025-agent-facing-docs-ownership` (the `align-agent-docs` phase and
  its `produces:`).
- **Related:** `dl-131` (the Determinism Index, agent-agnostic positioning), `spec-016` (agent
  execution through per-agent adapters), `dl-112` (the brief's *Works with*).
- **Related:** `dl-138` (templates consumed from a remote versioned source): the generated
  region depends on the packs a project composes (R2).
