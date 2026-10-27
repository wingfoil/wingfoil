# How WingFoil compares

WingFoil is the **governance layer** around AI-assisted development. It records who decided what, under which
rules, in which state, and keeps that record in git where every human and every agent reads the same thing. It does
not generate specifications, plans or code, and it does not validate a specification: it works beside the tools that
do (`dl-112-positioning-as-a-governance-layer`; the scope boundaries are in
[`03_is-isnot.md`](01_vision/03_is-isnot.md)).

This page describes WingFoil 0.3, the release being published; a capability new in 0.3 says so.

**How to read this page.**

- A fact about another tool carries a source marker such as `[S1]`. The [Sources](#sources) section gives each
  source's address and the date it was read. Tools change from one release to the next: a fact is what the source
  said on that date, and the `user-docs` release gate re-reads the sources.
- A cell that none of the sources read settles says exactly *not stated in the sources read*. It means the page does
  not know, not that the tool lacks the capability.
- A fact about WingFoil names the file or the command of this repository that shows it, so it can be checked here.

## What WingFoil replaces

Coding agents read their project rules from plain files, one format per tool. WingFoil keeps the same kind of rules
as **directives**: Markdown files under `.wingfoil/directives/`, each bound to the **roles** that must obey it in
`.wingfoil/roles.yaml`, and handed to an agent by role (`wingfoil directives list --role <role>`, or the MCP Prompt
`<role>-session`).

| Approach | How it works | What WingFoil does instead |
|---|---|---|
| `AGENTS.md` | Plain Markdown with no required fields; a monorepo places one per package, and the closest file to the edited file wins [S7]. Codex concatenates the files from the git root down to the working directory, so the closer file comes later and overrides [S14]. | Rules are separate directive files, each bound to roles; an agent receives the rules of the role it runs as, not every rule of every directory. |
| Claude Code `CLAUDE.md` | Loaded at the start of every session, as context rather than enforced configuration; files can import others with `@path`, and `.claude/rules/` holds rules that can be scoped to file paths; from Claude Code v2.1.277 it reads a repository's `AGENTS.md` directly when there is no `CLAUDE.md` [S8]. | The rules an agent receives are declared per role; whether a phase ran under its role is measured afterwards from the commits (metric P05 in the [case study](case-study.md)). |
| Cursor project rules | `.mdc` files under `.cursor/rules`, whose `alwaysApply`, `description` and `globs` fields decide when a rule enters the conversation [S9]. | Selection is by role and task, recorded in configuration that every clone shares. |
| GitHub Copilot repository instructions | `.github/copilot-instructions.md` for the whole repository, plus `.github/instructions/*.instructions.md` files whose `applyTo` glob scopes them; added to requests automatically [S10]. | The same rules reach every agent through one MCP server and one CLI, whatever the agent. |

The other things WingFoil replaces are not products but habits:

| Instead of | What WingFoil adds |
|---|---|
| A README and scattered documents | One versioned, indexed Memory: each element is a Markdown file with YAML frontmatter at the path its type declares in `.wingfoil/memory.yaml`, and its state is read from that frontmatter. |
| Brute-force context (a large window, or the whole codebase) | Context selected by role and task; the same inputs assemble the same context (the Input component of the Determinism Index, below). |
| Manual governance | Approval gates in each type's state machine: `wingfoil memory approve` crosses a gate and `wingfoil memory reject` sends the element back, each writing the approver and the reason into its commit. |
| Implicit workflow state | Workflows declared in YAML (`.wingfoil/workflows.yaml`); which phase a workflow is in is deduced from Memory and the committed files, and shared by every actor (`wingfoil workflow status`, 0.3). |

## What WingFoil works with

### Spec-driven development tools

These tools turn a specification into plans, tasks and code. WingFoil governs the lifecycle around that work.

| Axis | WingFoil | GitHub Spec Kit | Kiro | OpenSpec |
|---|---|---|---|---|
| What it produces | No specification, plan or code: the record of the decisions, rules, roles and states around them. | A specification, a technical plan and actionable tasks, then implementation against them: a constitution "once per project", then specify, plan, tasks, implement and converge "for each feature" [S1]. | A spec of three files: `requirements.md` (user stories and acceptance criteria, in EARS notation), `design.md` and `tasks.md` [S3] [S4]. | For each change, a proposal, its requirements and scenarios, a `design.md` and a `tasks.md` checklist [S6]. |
| Where its artefacts live | In the project's git repository, at the paths `.wingfoil/memory.yaml` declares. | Feature specifications under `specs/<branch-name>/`, on a git branch created per feature; the constitution in `memory/constitution.md` [S2]. | Under `.kiro/specs/<name>/` [S3]. | An `openspec/` folder holding `specs/` and `changes/`, the second tracking in-flight and archived changes [S6]. |
| Phases and gates | Workflow phases, each with its role, the files it produces and its checks; a phase with `approval: { by_role: approver }` waits for the human approver. | "Phase -1: Pre-Implementation Gates" in the implementation plan (Simplicity, Anti-Abstraction, Integration-First): “The LLM cannot proceed without either passing the gates or documenting justified exceptions in the "Complexity Tracking" section.” [S2]. | Requirements, design and tasks in sequence; Quick Spec runs the three phases "without approval gates between them" [S4]. | Propose, apply, archive; planning is where "human and AI align on specs before code gets written" [S6]. |
| Record of who approved what, when and why | Every approve and reject is one git commit, `wf(<type>): approve <id> [<from> → <to>]`, carrying an `Approver:` line and a `Reason:` block; `wingfoil memory history <id>` reads them back. | not stated in the sources read | not stated in the sources read | not stated in the sources read |
| State of each artefact | A state machine per type in `.wingfoil/memory.yaml`; an illegal transition is refused. | not stated in the sources read | A task execution interface for `tasks.md` with real-time status updates [S3]. | Each change is in flight or archived [S6]. |
| Rules for the agent | Directives bound to roles (`.wingfoil/roles.yaml`). | A constitution of principles, written by `/speckit-constitution` [S1] [S2]. | Steering files in `.kiro/steering/`, included always, by file pattern, manually or automatically, and `AGENTS.md` [S5]. | not stated in the sources read |
| Agent interface | The `wingfoil` CLI and an MCP server over stdio (`wingfoil mcp`). | `/speckit-*` skills run "in your agent's chat, not your terminal", plus the `specify` CLI that installs and initializes a project [S1]. | An IDE, a CLI, Web and, in preview, Mobile [S3]. | Slash commands such as `/opsx:propose`, `/opsx:apply` and `/opsx:archive` [S6]. |
| Agents it works with | Any MCP client; adapters for Claude Code and Codex CLI ship with `wingfoil init` (0.3). | GitHub Copilot in its examples, other agents through an integration key [S1]. | Kiro's own agent, in its IDE, CLI and Web surfaces [S3]. | "30+ tools", GitHub Copilot, Cursor and Amazon Q among them [S6]. |
| Licence and distribution | MIT; the npm package `wingfoil`, Node.js 22.12 or later. | MIT; installed with `uv tool install specify-cli`, needing Python 3.11+ [S1]. | not stated in the sources read | MIT; the npm package `@fission-ai/openspec` [S6]. |

### Coding agents

They write and change the code with the model the user chooses. WingFoil launches them with their role's directives
and context, and records every state change they make in git.

| Axis | WingFoil | Claude Code | Codex CLI |
|---|---|---|---|
| What it is | A governance layer the agent reads and writes through. | A coding tool started in a terminal by running `claude`, also available in the VS Code extension and the desktop app [S11]. | "Codex CLI is a coding agent from OpenAI that runs locally on your computer." [S12] |
| Project rules it reads | Directives by role, through MCP or the CLI. | `CLAUDE.md` files, `AGENTS.md` (read directly from v2.1.277, or imported from a `CLAUDE.md`), and `.claude/rules/` [S8]. | `AGENTS.md` files, from the global one down to the working directory [S14]. |
| How it reaches WingFoil | `wingfoil mcp`, a local stdio MCP server. | Local stdio MCP servers, and project-scoped servers in a `.mcp.json` at the project root [S11]. | MCP servers in `~/.codex/config.toml`, stdio ones included [S13]. |
| Licence and distribution | MIT, npm. | not stated in the sources read | Apache-2.0; npm `@openai/codex` or Homebrew [S12]. |

### IDEs

WingFoil ships no IDE plugin. An IDE reaches it through MCP, the open protocol by which an application connects a
model to external context and tools, with Resources, Prompts and Tools as the server's features [S15]; or through
the CLI in its terminal.

| Axis | WingFoil | VS Code |
|---|---|---|
| MCP | The server offers read-only Resources (DNA, Memory, workflows, and an agent's session context in 0.3) and one Prompt per role; it registers no Tool, so it cannot write. | MCP servers used in chat, stdio ones included, configured in a `.mcp.json` at the workspace root; `.vscode/mcp.json` is listed as deprecated, kept for compatibility [S16]. |

### Using WingFoil beside a spec-driven tool

Nothing ties WingFoil to a particular specification tool, and no integration with any of them is built. What
WingFoil offers such a tool's output is the same as it offers any document:

- a specification can be registered as a `tech-spec` element (`wingfoil memory add --type tech-spec --title "<title>"`), so it has an id, a
  state, and an approval gate the human approver crosses with `wingfoil memory approve`;
- the tasks that implement it are `task` elements with their own state machine, and the decisions taken on the way
  are `decision-log` and `adr` elements;
- the agent that writes the code receives its role's directives, and each state change it makes is a `wf()` commit
  that `wingfoil memory history` can read back.

## Ideas seen elsewhere, not adopted

Three ideas seen in other tools were considered when WingFoil's position was decided, and none was adopted
(`dl-112-positioning-as-a-governance-layer`, Q4 (x)). Any of them can return only through its own decision-log.

- **Gates inside the specification steps.** Spec Kit checks an implementation plan against its constitution
  through its "Phase -1: Pre-Implementation Gates" [S2], and Kiro stops for approval between requirements, design and tasks unless Quick Spec
  is used [S4]. WingFoil's gates sit on the state machines of its elements and on the phases of its workflows, not
  inside how a specification is written.
- **Changes tracked apart from the current specification.** OpenSpec keeps each in-flight change in its own folder
  under `openspec/changes/`, beside the current `openspec/specs/` [S6]. In WingFoil a change to an approved element
  goes through `wingfoil memory amend` (0.3), in git history.
- **Property-based tests derived from a specification.** Kiro lists "Correctness (property-based testing)" among
  its spec capabilities [S3]. WingFoil writes no tests; its `testing` directive asks the agents that do to write the
  failing test first.

## Determinism, stated as a goal

WingFoil's north star is the **Determinism Index**: two independent runs from the same specifications and the same
WingFoil configuration, with different agents, should produce software that behaves the same. It is a goal and a
measurement, not a property already reached, and its three components promise different things
(`dl-131-determinism-index-scope`):

- **Input** — the context WingFoil assembles is identical for identical inputs. WingFoil controls it, and tests
  guarantee it.
- **Process conformance** — the run followed its workflow: well-formed commits, legal transitions, phase outputs
  present, roles respected. Measured on every run.
- **Outcome equivalence** — the two runs' software behaves the same. The agents and models the user chooses write
  the code, so this is measured, never promised.

The first process-conformance figures, and what is not measurable yet, are in the [case study](case-study.md).

## Sources

- [S1] GitHub Spec Kit, repository README — <https://github.com/github/spec-kit> — read 2026-10-26.
- [S2] GitHub Spec Kit, "Specification-Driven Development" (`spec-driven.md`) — <https://github.com/github/spec-kit/blob/main/spec-driven.md> — read 2026-10-26.
- [S3] Kiro documentation, "Specs" — <https://kiro.dev/docs/specs/> — read 2026-10-26.
- [S4] Kiro documentation, "Feature Specs" — <https://kiro.dev/docs/specs/feature-specs/> — read 2026-10-26.
- [S5] Kiro documentation, "Steering" — <https://kiro.dev/docs/steering/> — read 2026-10-26.
- [S6] OpenSpec, repository README — <https://github.com/Fission-AI/OpenSpec> — read 2026-10-26.
- [S7] "AGENTS.md", the format's home page — <https://agents.md/> — read 2026-10-26.
- [S8] Claude Code documentation, "How Claude remembers your project" — <https://code.claude.com/docs/en/memory> — read 2026-10-26.
- [S9] Cursor Docs, "Rules" — <https://cursor.com/docs/rules> — read 2026-10-26.
- [S10] GitHub Docs, "Adding repository custom instructions for GitHub Copilot" — <https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/add-custom-instructions/add-repository-instructions> — read 2026-10-26.
- [S11] Claude Code documentation, "Connect Claude Code to tools via MCP" — <https://code.claude.com/docs/en/mcp> — read 2026-10-26.
- [S12] Codex CLI, repository README — <https://github.com/openai/codex> — read 2026-10-26.
- [S13] ChatGPT Learn, "Model Context Protocol" (Codex CLI) — <https://learn.chatgpt.com/docs/extend/mcp?surface=cli> — read 2026-10-26.
- [S14] ChatGPT Learn, "Custom instructions with AGENTS.md" — <https://learn.chatgpt.com/docs/agent-configuration/agents-md> — read 2026-10-26.
- [S15] Model Context Protocol, "Specification" — <https://modelcontextprotocol.io/specification> — read 2026-10-26.
- [S16] VS Code documentation, "Add and manage MCP servers in VS Code" — <https://code.visualstudio.com/docs/agent-customization/mcp-servers> — read 2026-10-26.
