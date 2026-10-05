<p align="center"><img src="docs/assets/wingfoil-mark.svg" width="140" alt="WingFoil logo"></p>

<p align="center"><a href="https://glama.ai/mcp/servers/wingfoil/wingfoil"><img src="https://glama.ai/mcp/servers/wingfoil/wingfoil/badges/score.svg" alt="WingFoil MCP server on Glama"></a></p>

# WingFoil

**A structured harness for deterministic AI-assisted software development.**

WingFoil solves a critical problem: as your software project grows, AI agents lose consistency and control. Context gets
scattered, conventions drift, and decisions made in one session don't carry forward to the next.

WingFoil centralizes your project's **memory, DNA, and directives** in a structured, git-backed format — giving both
humans and AI agents a shared source of truth.

---

## The Problem

When using AI agents to write software, you face growing friction:

- **Context collapse:** Large context windows and full codebase scans become expensive and noisy
- **Convention drift:** Agents don't respect established patterns unless you re-explain them every session
- **Decision scatter:** Architectural decisions, patterns, and constraints live in Slack, old docs, or nowhere
- **Governance gaps:** No way to enforce rules consistently across human developers and AI agents

The larger the project, the worse the signal-to-noise ratio.

---

## The Solution

WingFoil provides a **structured, authoritative interface** to your project:

- **Project Memory** — Git-backed storage for decisions, artifacts, and domain knowledge
- **Project DNA** — Structural map of modules, tech stack, and conventions
- **Project Directives** — Role-based rules that both humans and agents respect
- **Workflow State Management** — Unified tracking and communication of project flow, progress, and blockers
- **Interaction Layer** — CLI for humans, MCP for agents

This keeps everything synchronized and deterministic.

---

## Who It's For

**Alex, the Solo Developer**  
Every new AI session forces you to re-explain context. WingFoil loads relevant info in seconds — no more context loss
between sessions.

**Sam, the Code Reviewer**  
You're starting with AI for code review but aren't confident enough for full development yet. WingFoil lets you enforce
quality standards and gradually expand AI usage as you gain confidence.

**Jordan, the Team Developer**  
You don't know what conventions your tech lead has defined, and agents ignore team rules. WingFoil keeps everyone
aligned on directives, decisions, and project state without constant manual updates.

**Morgan, the Tech Lead**  
You need agents to follow the team's rules automatically, not invent new ones. WingFoil encodes governance once; it
auto-loads for every agent. It also keeps the whole team synchronized on progress and blockers.

**Casey, the Manager**  
You need visibility into decisions and methodology. WingFoil provides an audit trail, queryable knowledge base, and
real-time tracking of project state.

---

## Key Features

### Five Pillars — status in 0.2.2

- ✓ **Project Memory** — Git-backed documents (tasks, ADRs, decision-logs, bugs, specs…) with per-type
  state machines, approval gates and an audit trail (**shipped**: create, search, submit, approve,
  reject, deprecate, history)
- ✓ **Project DNA** — Structured config: modules, tech stack, team & roles, resource paths
  (**shipped**: show, set, add, update, remove)
- ✓ **Project Directives** — Role-scoped rules: six built-in templates installed by `init`, your own
  custom directives, role assignments (**shipped in 0.2**)
- ✓ **Interaction Layer** — CLI for humans and agents; MCP server for agents with read-only Resources
  and one Prompt per role (**shipped**)
- **Workflow State Management** — workflows are declared and listable today; the engine that starts
  and tracks them is planned for 0.3

### CLI at a glance

| Area | Commands |
|---|---|
| Setup | `wingfoil init [--template Scrum\|Kanban]` · `wingfoil mcp` |
| DNA | `wingfoil dna show [section]` · `dna set <path> --value <v>` · `dna add` · `dna update` · `dna remove` · `wingfoil paths [category]` |
| Memory | `wingfoil memory add --type <t> --title <t> [--set <name>=<value>]` · `submit <id>` · `approve <id> --reason <r>` · `reject <id> --reason <r>` · `deprecate <id>` · `history <id>` · `search [keyword]` |
| Directives | `wingfoil directive create --name <n>` · `directive assign --directive <n> --role <r>` · `directive remove <n>` · `wingfoil directives list [--role <r>]` |
| Workflow | `wingfoil workflow list` |

Every command accepts `--format console|json|yaml` and ends with exit code `0` (success), `1` (refused)
or `2` (bad command line). Full details: **[CLI reference](docs/cli-reference.md)**.

### For AI Agents

- ✓ **MCP server** (`wingfoil mcp`, stdio) — DNA, Memory and workflows as read-only Resources, plus a
  `<role>-session` Prompt per role that embeds the role's directives
- ✓ **Read-only by construction** — the MCP surface has no Tools; changes go through the CLI, and
  approvals belong to a human holding the `approver` role
- ✓ **[`docs/agents.md`](docs/agents.md)** — the same knowledge as a document an agent can read from a
  link: what WingFoil is, the rules to follow, the CLI equivalent of every MCP Resource and Prompt

---

## Getting Started

### Installation

```bash
npm install -g wingfoil
```

This installs the `wingfoil` binary (**Node.js 22.12+** required). Verify it:

```bash
wingfoil --version
```

### Quick Start

Run this from the root of a **git repository** with a git identity configured
(`git config user.name` / `user.email`).

**1. Initialize WingFoil** — scaffolds `.wingfoil/` (DNA, Memory schema and templates, directives,
workflows) and commits it:

```bash
$ wingfoil init --template Scrum
```

**2. Name the project and register yourself as the approver** — approvals need a team member holding
the `approver` role, with your git email:

```console
$ wingfoil dna set project.name --value "My Project"
{
  "key": "project.name",
  "value": "My Project"
}
$ wingfoil dna add team.members --value "Ada Lovelace" --entry-email ada@example.com --entry-roles approver,developer
{
  "key": "team.members",
  "value": "Ada Lovelace"
}
```

**3. Create a task, write it, submit it:**

```console
$ wingfoil memory add --type task --title "My first task"
{
  "id": "task-001-my-first-task",
  "path": "docs/memory/task/task-001-my-first-task.md"
}
$ wingfoil memory submit task-001-my-first-task
{
  "id": "task-001-my-first-task",
  "path": "docs/memory/task/task-001-my-first-task.md",
  "from": "draft",
  "to": "pending"
}
```

(Write the task's body in the file before submitting — the submit commit records it.)

**4. Approve it** — the commit records who approved and why:

```console
$ wingfoil memory approve task-001-my-first-task --reason "Scope is clear."
{
  "id": "task-001-my-first-task",
  "path": "docs/memory/task/task-001-my-first-task.md",
  "from": "pending",
  "to": "approved"
}
$ git log -1 --format=%B
wf(task): approve task-001-my-first-task [pending → approved]

Approver: Ada Lovelace <ada@example.com> (approver)
Reason: Scope is clear.
```

**5. Connect your AI agent** — for Claude Code, add `.mcp.json` at the repository root:

```json
{ "mcpServers": { "wingfoil": { "command": "wingfoil", "args": ["mcp"] } } }
```

### Documentation

| Document | For |
|---|---|
| **[User guide](docs/user-guide.md)** | Step by step: install, configure DNA / Memory / Directives, daily use, agents, CI |
| **[CLI reference](docs/cli-reference.md)** | Every command: arguments, output, exit codes, the commit it writes |
| **[Examples](docs/examples/)** | Runnable, self-checking scripts for the main scenarios |
| **[Guide for AI agents](docs/agents.md)** | What an agent needs to operate in a WingFoil project |
| **[Changelog](CHANGELOG.md)** | What changed in each release |

---

## Value Proposition

**For** developers and teams already using AI agents  
**WingFoil** makes the development process **deterministic**  
**By** centralizing memory, conventions, and directives — keeping them synchronized across all actors

### Success Metric: Determinism Index

Two independent development runs from the same specs + WingFoil config using different AI agents should produce
substantially equivalent software, with all team members and agents maintaining shared understanding of project workflow
state, progress, and alignment.

---

## What Comes Later

**0.3 — Project Workflow:** the workflow engine (`workflow start|next|status|show|end`…), approval
routing by role, agent execution with directives and Memory context auto-loaded, reference workflow
templates, notifications when an approval is required.

**0.4 — Interaction Layer + Polish** · **1.0 — MVP complete**, all five pillars integrated.

Later, based on early adopter feedback: semantic search, IDE integrations beyond MCP, notification
routing (email, Slack), multi-project management.

---

## Release Roadmap

WingFoil is built one pillar per release until all five are integrated in 1.0.

| Release | Focus | Status |
|---|---|---|
| Lean Inception · Requirements | Product vision, USM · BDD · SARD · backlog | ✓ Complete |
| **0.1** | Project Memory + DNA | ✓ Released (not published to npm) |
| **0.2** | + Project Directives, Memory approvals, DNA editing, MCP role Prompts | ✓ Released (`wingfoil@0.2.1` on npm) |
| **0.2.2** | Patch: configuration at the repository root, staged npm publishing, first-use fixes | ✓ Released (`wingfoil@0.2.2` on npm) |
| **0.3** | + Project Workflow | Planned |
| **0.4** | + Interaction Layer polish | Planned |
| **1.0** | MVP complete | Planned |

**Dogfooding:** WingFoil's own development is managed with WingFoil — its configuration lives in
`.wingfoil/` and its Memory in `docs/04_memory/`, at the repository root. From there the Memory verbs
(`add`, `submit`, `approve`, `reject`, `deprecate`, `history`, `search`) run on WingFoil's own Memory,
through a published, pinned build of WingFoil (`npm run -s wingfoil -- <command>`), whose MCP server
is registered in `.mcp.json`. See [COLLABORATION.md](COLLABORATION.md).

---

## Architecture Overview

```
┌─────────────────────────────────────────────────┐
│  Humans (CLI)        Agents (MCP Client)        │
├─────────────────────────────────────────────────┤
│           WingFoil Harness                      │
│  ┌─────────────────────────────────────────┐    │
│  │ Memory | DNA | Directives | Workflow    │    │
│  └─────────────────────────────────────────┘    │
├─────────────────────────────────────────────────┤
│         Git Repository                          │
│  (versioning, audit trail, state history)       │
└─────────────────────────────────────────────────┘
```

- **CLI**: Humans (and agents) use `wingfoil` commands to manage Memory, DNA and Directives, and to read Workflows
- **MCP Server**: Agents connect via Model Context Protocol to query Memory/DNA, receive Directives, and view Workflow
  definitions
- **Git Backend**: All changes (memory, decisions, workflow state) are versioned and auditable
- **Read-Only MCP**: The MCP surface is read-only; state changes go through the CLI, and approvals belong to a
  human holding the `approver` role
- **Workflow Synchronization** *(0.3)*: All team members and agents stay aligned on current progress and blockers

---

## Project Documentation

Before implementation, the product is fully specified through a **traceable documentation pipeline** under `docs/`,
taking the Lean Inception vision down to an implementation-ready backlog (the *specification downcast*):

```
docs/
├── 01_vision/         Lean Inception — product brief, vision, personas, 8 journeys, features, sequencer, MVP canvas
├── 02_requirements/   Specification downcast:
│   ├── 01_user_story_map/   User Story Map (Jeff Patton) — journey backbone + prioritized stories, incl. edge cases
│   ├── 02_bdd/              BDD suite (Gojko Adzic) — Gherkin scenarios per feature (happy + error/edge paths)
│   └── 03_sard/             System & Architecture Requirements (Volere) — NFRs with measurable Fit Criteria
└── 03_backlog/        Operational backlog — schema-validated JSON work items, partitioned by release wave
```

**Traceability chain.** Every item links back through the layers:
`Backlog task → SARD requirement / BDD scenario → User Story → Journey → Vision feature`.

**MVP scope at a glance:**

| Layer          | Artifact                                                    | Count    |
|----------------|-------------------------------------------------------------|----------|
| Vision         | User journeys                                               | 8        |
| Vision         | MVP features (5 pillars + notifications)                    | 63       |
| User Story Map | Journey files · edge-case / interruption stories            | 7 · 14   |
| BDD            | Gherkin feature files / scenarios                           | 63 / 190 |
| SARD           | Architecture & NFR requirements (measurable Fit Criteria)   | 43       |
| Backlog        | Implementation-ready tasks (63 user stories + 43 technical) | 106      |

All artifacts are scheduled across 5 release waves (v0.1 → v1.0), sequenced by risk in
`docs/01_vision/07_sequencer.md`.

---

## License

MIT — open source and free to use.

---

## Contributing

Early feedback is welcome. Please open issues on GitHub to share:

- Use cases and pain points
- Feature requests
- Bug reports

See **[`COLLABORATION.md`](COLLABORATION.md)** — how to contribute through Memory artifacts
(Bug / Decision-Log / ADR / Tech-Spec) instead of code, with credit for the AI-generated work
derived from your contribution.

---

## Questions?

- **GitHub Issues:** Bug reports, feature requests
- **Documentation:** Start from the [user guide](docs/user-guide.md); WingFoil's own specifications (vision, USM · BDD ·
  SARD, backlog) are under [`docs/`](docs/)
- **Community:** Join discussions (links coming soon)

---

**WingFoil: Making AI-assisted development deterministic, not chaotic.**