---
id: dl-143-one-generator-turns-dna-and-directives-into-every-agent-s-instruction-formats-agents.md-agent-skills-hooks-and-an-agent-plugins-package
type: decision-log
title: "One generator turns DNA and Directives into every agent's instruction formats: AGENTS.md, Agent Skills, hooks and an Agent Plugins package"
status: ready
context: "ad-hoc"            # optional — short label for the context, e.g. "retrospective", "planning", "ad-hoc"
release: ""            # optional — implementation release this DL is assigned to (stamped at release-planning/build-backlog, dl-016), e.g. "v0.1"
contributor: ""        # optional — who originated this contribution, if not the git author (dl-020); credited for AI-generated work derived from it
credit: ""             # optional — free-text credit note (dl-020)
tmpl_version: 260703   # Orignal template version
tags: ["agents","generator","directives"]
---

## Context

**`dl-137` (`in-discussion`) decides that the agent instruction file WingFoil maintains is
`AGENTS.md`**, and leaves open Q1 (what happens to `CLAUDE.md`), Q2 (scaffold, export or both) and
Q3 (release). Its part (b) generates `AGENTS.md` from the configuration WingFoil holds: DNA,
directives by role, the Memory model and the workflows.

**`AGENTS.md` is one of several formats agents now read.** Read 2026-10-01/02:
- **Agent Skills.** Claude Code: "Create a `SKILL.md` file with instructions"
  (`.claude/skills/<name>/SKILL.md`), <https://code.claude.com/docs/en/skills>. Cursor: "Each skill
  is defined in a `SKILL.md` file with YAML frontmatter", <https://cursor.com/docs/context/skills>.
- **Agent Plugins 1.0** (GitHub, 2026-08-12): "an open standard that packages agent skills and MCP
  servers into one installable plugin", for VS Code, Copilot CLI and the Copilot app,
  <https://github.blog/changelog/2026-08-12-agent-plugins-1-0-in-vs-code-copilot-cli-and-the-copilot-app/>.
- **Hooks**, which Claude Code and Copilot run at fixed points of an agent's work.
- **`AGENTS.md` in Claude Code.** v2.1.277 (published to npm 2026-09-18) added: "in a project with
  no CLAUDE.md, Claude Code reads AGENTS.md instead"
  (<https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md>). It reads `AGENTS.md` only
  when there is no `CLAUDE.md`, which bears on `dl-137` Q1.

Each is a projection of the same information. Generated separately, or written by hand, they drift
from the configuration and from each other.

Raised by the approver on 2026-10-02 as the outcome of a market analysis. Recorded as its own
decision-log, extending `dl-137`, rather than as an amendment of it, so `dl-137`'s questions stay
where they are and its part (a) can land without this scope.

## Decision

**One generator, from DNA and Directives, produces every agent's instruction formats:**
- `AGENTS.md` (`dl-137` part (b));
- **Agent Skills** (`SKILL.md`), one per role or per workflow phase;
- **hooks** for Claude Code and Copilot;
- an **Agent Plugins 1.0** package bundling the skills and WingFoil's MCP server.

All outputs come from the committed configuration through one code path, with the same
determinism and drift detection `dl-137` asks for `AGENTS.md`. Which outputs are scaffolded by
`init` and which are exported on demand follows `dl-137` Q2.

## Rationale

- **One source, many readers.** The agent-agnostic position (`dl-137`, `dl-131`) is kept by
  generating each vendor's format, not by choosing one.
- **Drift is the problem WingFoil exists to remove.** A second generator per format would recreate
  the hand-maintained copies `align-agent-docs` checks today.
- **Skills and plugins carry the rules into the agent's own loop.** `AGENTS.md` is read once;
  skills and hooks reach the agent where it acts, and a plugin installs them with the MCP server in
  one step.

## Actions

1. **Ratify** at `in-discussion → ready`, together with or after `dl-137`. Owner: approver.
2. **Widen the tech-spec** `dl-137` Action 3 calls for, from `AGENTS.md` to all four outputs:
   sources, mapping per format, determinism, drift check. Then the task(s). Order in the roadmap:
   first (`dl-140`, D3).

## Relations

- **Extends:** `dl-137` (part (b), the generated `AGENTS.md`).
- **Related:** `dl-140` (roadmap order), `dl-142` (hooks may trigger plan import), `dl-145`
  (integration guides), `dl-025` (`align-agent-docs`).
