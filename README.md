<p align="center"><img src="docs/assets/wingfoil-mark.svg" width="140" alt="WingFoil logo"></p>

<p align="center"><a href="https://glama.ai/mcp/servers/wingfoil/wingfoil"><img src="https://glama.ai/mcp/servers/wingfoil/wingfoil/badges/score.svg" alt="WingFoil MCP server on Glama"></a></p>

# WingFoil

[![npm version](https://img.shields.io/npm/v/wingfoil)](https://www.npmjs.com/package/wingfoil)
[![licence](https://img.shields.io/npm/l/wingfoil)](https://github.com/wingfoil/wingfoil/blob/main/LICENSE)
[![node](https://img.shields.io/node/v/wingfoil)](https://www.npmjs.com/package/wingfoil)
[![publish](https://github.com/wingfoil/wingfoil/actions/workflows/publish.yml/badge.svg)](https://github.com/wingfoil/wingfoil/actions/workflows/publish.yml)

**A structured harness for AI-assisted software development, built to make it deterministic.**

WingFoil solves a critical problem: as your software project grows, AI agents lose consistency and control. Context gets
scattered, conventions drift, and decisions made in one session don't carry forward to the next.

WingFoil centralizes your project's **memory, DNA, and directives** in a structured, git-backed format — giving both
humans and AI agents a shared source of truth.

![WingFoil in a terminal: init, configure an approver, add a task, submit and approve it, then show its git log](docs/assets/wingfoil-demo-first-project.gif)

*The first example, [`docs/examples/01-first-project`](docs/examples/01-first-project/run.sh), recorded from
[`docs/examples/01-first-project/demo.tape`](docs/examples/01-first-project/demo.tape). The example checks its own
results, and the recording stops if a check fails, so if WingFoil stops matching the example the recording fails
instead of going stale.*

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

This keeps everything synchronized, so that two runs from the same specs and configuration can produce
equivalent software: the goal the *Determinism Index* measures (see *Success Metric* below).

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

### Five Pillars — status in 0.3

- ✓ **Project Memory** — Git-backed documents (tasks, ADRs, decision-logs, bugs, specs…) with per-type
  state machines, approval gates and an audit trail (**shipped**: create, search, submit, approve,
  reject, deprecate, history; **new in 0.3**: amend, park, work-in-progress limits)
- ✓ **Project DNA** — Structured config: modules, tech stack, team & roles, resource paths
  (**shipped**: show, set, add, update, remove)
- ✓ **Project Directives** — Role-scoped rules: six built-in templates installed by `init`, your own
  custom directives, role assignments (**shipped in 0.2**)
- ✓ **Interaction Layer** — CLI for humans and agents; MCP server for agents with read-only Resources
  and one Prompt per role (**shipped**); `agent execute` launches Claude Code or Codex CLI on a Memory
  element with its context assembled and checked first, and records the run (**new in 0.3**)
- ✓ **Workflow State Management** — start, follow and end workflows: the next step and its role,
  the open workflows, approvals routed to the approver, checkpoints (**new in 0.3**). WingFoil records
  and routes the steps; people and agents carry them out

### CLI at a glance

| Area | Commands |
|---|---|
| Setup | `wingfoil init [--template Scrum\|Kanban]` · `wingfoil mcp` |
| DNA | `wingfoil dna show [section]` · `dna set <path> --value <v>` · `dna add` · `dna update` · `dna remove` · `wingfoil paths [category]` |
| Memory | `wingfoil memory add --type <t> --title <t> [--set <name>=<value>]` · `submit <id>` · `approve <id> --reason <r>` · `reject <id> --reason <r>` · `amend <id> --reason <r>` · `park <id> --reason <r>` · `deprecate <id>` · `history <id>` · `search [keyword]` |
| Directives | `wingfoil directive create --name <n>` · `directive assign --directive <n> --role <r>` · `directive remove <n>` · `wingfoil directives list [--role <r>]` |
| Workflow | `wingfoil workflow list` · `show <name>` · `start <name>` · `next` · `status` · `finalize` · `end` · `create <name>` · `remove <name>` |
| Agent | `wingfoil agent execute --element <type:id> \| --next` · `agent list` · `agent show <run-id>` |

Every command accepts `--format console|json|yaml` and ends with exit code `0` (success), `1` (refused)
or `2` (bad command line); every command that commits accepts `--dry-run`, except `init`. Full details: **[CLI reference](docs/cli-reference.md)**.

### For AI Agents

- ✓ **MCP server** (`wingfoil mcp`, stdio) — DNA, Memory and workflows as read-only Resources, the
  workflow state as `wingfoil://workflows/-/next` and `wingfoil://workflows/-/status`, plus a
  `<role>-session` Prompt per role that embeds the role's directives; given an `element` and a `state`
  (a commit), the Prompt — and the Resource `wingfoil://session/{role}/{element}/{state}` — return the
  agent's execution context for that element
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

It also installs the built-in agent adapters (`claude-code`, `codex-cli`) under `.wingfoil/agents/`.

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

WingFoil-Version: 0.3.0 (6ca54978a01dc29c81e395d363efcdeac8a513fd)
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
| **[Comparison](docs/comparison.md)** | WingFoil beside agent-rule files, spec-driven development tools, coding agents and IDEs |
| **[Case study](docs/case-study.md)** | How WingFoil develops WingFoil, with the release-health figures of v0.1 and v0.2 |
| **[Changelog](CHANGELOG.md)** | What changed in each release |

---

## Value Proposition

**For** developers and teams already using AI agents  
**WingFoil** is built to make the development process **deterministic**, and measures how far it does  
**By** centralizing memory, conventions, and directives — keeping them synchronized across all actors

### Success Metric: Determinism Index

Two independent development runs from the same specs + WingFoil config using different AI agents should produce
substantially equivalent software, with all team members and agents maintaining shared understanding of project workflow
state, progress, and alignment. This is the goal WingFoil is measured against, not a property it already has.

*Substantially equivalent* means **behaviourally equivalent**: both codebases pass the same acceptance contracts. The
Index has three components:

- **Input** — the context WingFoil assembles is identical for identical inputs: guaranteed, by tests.
- **Process conformance** — the run followed its workflow (well-formed commits, legal transitions, phase outputs
  present, roles respected): measured on every run.
- **Outcome equivalence** — the two runs' software behaves the same: the agents and models write the code, so this is
  measured, never promised.

---

## What Comes Later

**0.4 — Interaction Layer + Polish** (planned): adopting WingFoil in a project already
under way (`init --mode infer`, `dna infer`, `memory import`, `audit`), MCP Tools through which agents
submit their work, reference workflow templates (Scrum, Kanban, Lean Inception, Trunk-Based), and
polished CLI help, errors and console output.

**1.0 — MVP complete**, all five pillars integrated.

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
| **0.3** | + Project Workflow: workflow state, approval routing, agent execution | ✓ Released (`wingfoil@0.3.0` on npm) |
| **0.4** | + Interaction Layer polish | Planned |
| **1.0** | MVP complete | Planned |

**Dogfooding:** WingFoil's own development is managed with WingFoil — its configuration lives in
`.wingfoil/` and its Memory in `docs/04_memory/`, at the repository root. Every verb that writes a
`wf()` commit there (`add`, `submit`, `approve`, `reject`, `deprecate`, `amend`, `park`) runs on the
build compiled from the checkout (`npm run build`, then `node dist/cli.js <command>`); the read commands
and the MCP server registered in `.mcp.json` run on a published, pinned build of WingFoil
(`npm run -s wingfoil -- <command>`), so they answer as the version users have. See
[COLLABORATION.md](COLLABORATION.md).

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

- **CLI**: Humans (and agents) use `wingfoil` commands to manage Memory, DNA and Directives, to start, follow and end
  Workflows, and to launch an agent on an element
- **MCP Server**: Agents connect via Model Context Protocol to query Memory/DNA, receive Directives and their execution
  context, and read Workflow definitions, the next step and the open workflows
- **Git Backend**: All changes (memory, decisions, workflow state) are versioned and auditable
- **Read-Only MCP**: The MCP surface is read-only; state changes go through the CLI, and approvals belong to a
  human holding the `approver` role
- **Workflow Synchronization**: All team members and agents read the same workflow state, deduced from the
  repository: the next step, its role, and the approvals waiting

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
| Vision         | MVP features (5 pillars + notifications)                    | 66       |
| User Story Map | Journey files · edge-case / interruption stories            | 7 · 15   |
| BDD            | Gherkin feature files / scenarios                           | 66 / 267 |
| SARD           | Architecture & NFR requirements (measurable Fit Criteria)   | 46       |
| Backlog        | Implementation-ready tasks, as imported (63 stories + 43 technical) | 106      |

All artifacts are scheduled across 5 release waves (v0.1 → v1.0), sequenced by risk in
`docs/01_vision/07_sequencer.md`.

---

## License

MIT — open source and free to use.

---

## Contributing

Early feedback is welcome. Open a GitHub issue with the **Bug report** or the **Proposal** form: each is
captured as a Memory element (a `bug`, a `decision-log`, or a `change-proposal` for a feature request)
without asking you again.

See **[`COLLABORATION.md`](COLLABORATION.md)** — how to contribute through Memory artifacts
(Bug / Decision-Log / Change-Proposal / ADR / Tech-Spec) instead of code, with credit for the AI-generated work
derived from your contribution. Everyone follows the [Code of Conduct](CODE_OF_CONDUCT.md); report a
vulnerability privately, as [`SECURITY.md`](SECURITY.md) explains, never in a public issue.

---

## Questions?

- **GitHub Issues:** bug reports and proposals, through the issue forms
- **Documentation:** Start from the [user guide](docs/user-guide.md); WingFoil's own specifications (vision, USM · BDD ·
  SARD, backlog) are under [`docs/`](docs/)
- **Community:** ask and share in [GitHub Discussions](https://github.com/wingfoil/wingfoil/discussions)

---

**WingFoil: governing AI-assisted development toward determinism, not chaos.**