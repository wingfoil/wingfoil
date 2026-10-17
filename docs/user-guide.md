# WingFoil user guide

A step-by-step guide to configuring and using WingFoil **0.3** in your own project. It starts from an
empty git repository and ends with an AI agent reading your project through MCP.

- Every command is documented in full in the [CLI reference](cli-reference.md).
- Every scenario below also exists as a runnable, self-checking script in [`examples/`](examples/).
- If you are an AI agent, [`agents.md`](agents.md) is written for you.

---

## Contents

0. [Concepts](#0-concepts)
1. [Prerequisites](#1-prerequisites)
2. [Install](#2-install)
3. [Initialize a project](#3-initialize-a-project)
4. [Configure the DNA](#4-configure-the-dna)
5. [Configure the Memory](#5-configure-the-memory)
6. [Configure the Directives](#6-configure-the-directives)
7. [Workflows](#7-workflows)
8. [Daily use: the life of a Memory document](#8-daily-use-the-life-of-a-memory-document)
9. [Connect an AI agent](#9-connect-an-ai-agent)
10. [CI and scripting](#10-ci-and-scripting)
11. [Known limitations in 0.3](#11-known-limitations-in-03)
12. [Upgrading from 0.2.x](#12-upgrading-from-02x)

---

## 0. Concepts

WingFoil keeps a project's shared knowledge **in the repository**, in a structured form that humans and
AI agents read the same way. Five pillars:

| Pillar | What it is | Where it lives |
|---|---|---|
| **DNA** | The project's structural map: modules, technologies and methodologies, team and roles, resource paths | `.wingfoil/dna.yaml` |
| **Memory** | Decisions, tasks, bugs, specs… as Markdown documents with a lifecycle | `docs/memory/<type>/<id>.md`, schema in `.wingfoil/memory.yaml` |
| **Directives** | Rules bound to roles, loaded by whoever acts in that role | `.wingfoil/directives/`, bindings in `.wingfoil/roles.yaml` |
| **Workflow** | The declared process: phases, who does what | `.wingfoil/workflows.yaml` + `workflows/` |
| **Interaction layer** | `wingfoil` CLI for writing and reading; `wingfoil mcp` for agents, read-only | — |

A few ideas run through everything:

- **A Memory document has a type and a state.** The type (`task`, `adr`, `bug`, …) is declared in
  `memory.yaml` and fixes the document's path, id, template and **state machine**. The state is simply
  the `status:` field in the document's frontmatter — there is no hidden database.
- **One operation, one commit.** Every change WingFoil makes is exactly one git commit, authored by your
  git identity. Git history *is* the audit trail: `wingfoil memory history` reads it back.
- **Roles, not people.** Directives bind to roles. Approvals need the `approver` role, which a team
  member holds in `dna.yaml`. AI agents act in roles such as `developer` or `reviewer` and never approve.
- **Configuration is read as committed.** Commands read `.wingfoil/` as it is at `HEAD`. Edit a config
  file by hand → commit it → then use it.

---

## 1. Prerequisites

- **Node.js 22.12 or later** — `node --version`.
- **git**, and a **git repository** to work in. WingFoil must be run from the repository root.
- **A git identity** — WingFoil refuses to commit without one:

  ```bash
  git config user.name "Ada Lovelace"
  git config user.email "ada@example.com"
  ```

  Use the email you will register as a team member in step 4: that is how WingFoil recognizes who is
  approving.

## 2. Install

```bash
npm install -g wingfoil
wingfoil --version
```

Or run it without installing: `npx wingfoil <command>`. Coming from 0.2.x? Read
[§12](#12-upgrading-from-02x) first.

## 3. Initialize a project

From the root of your repository (run `git init` first if it is new):

```console
$ wingfoil init --template Scrum
{
  "root": "/home/ada/my-project",
  "template": "Scrum",
  "files": [
    ".wingfoil/agents/built-in/claude-code.yaml",
    …
    ".wingfoil/workflows/custom/sw-life-cycle.yaml"
  ]
}
```

`--template` is `Scrum` or `Kanban` (`wingfoil init --help` lists them); omit it in a terminal to be
asked. Without a terminal, or with `--no-interactive`, it is required, and leaving it out fails with
`error: missing required argument: --template (one of: Scrum, Kanban)`, exit `2`. `init` creates and
commits:

```
.wingfoil/
├── dna.yaml                  project, modules, stacks, team & roles, paths
├── memory.yaml               Memory types and their state machines
├── memory/templates/         one Markdown scaffold per type (adr, bug, decision-log, plan, release, release-line, task, tech-spec)
├── roles.yaml                which directives apply to which role
├── directives/
│   ├── built-in/             architecture, code-quality, code-review, documentation, security, testing
│   └── custom/               determinism, doc-versioning, security-secrets, traceability (yours to edit)
├── agents/
│   ├── built-in/             agent adapters shipped by WingFoil: claude-code, codex-cli
│   └── custom/               your own agent adapters (empty)
├── workflows.yaml            the workflow manifest
└── workflows/custom/         sw-life-cycle, bug-ingest, decision-log-ingest, adr-ingest, scrum-delivery (or kanban-delivery)
```

The commit is `chore(wingfoil): initialize .wingfoil/ with the Scrum template (P5.1.1)`. Running `init`
again fails with exit `1`: the project is already initialized. From then on, change the configuration
by editing the files under `.wingfoil/` and committing them, or with the `dna` and `directive`
commands, which commit for you (sections 4 and 6).

## 4. Configure the DNA

The DNA tells people and agents what the project *is*. Look at it:

```bash
wingfoil dna show            # the whole file
wingfoil dna show project    # one section: project, modules, stacks, team, paths
```

Two kinds of writes:

- **Scalar fields** with `dna set <path> --value <v>`.
- **Collections and lists** with `dna add`, `dna update`, `dna remove`.

Each write is one commit (`wf(dna): …`). Paths are dotted; a name containing a dot is quoted:
`'stacks.technologies."Node.js"'`.

### 4.1 Project

```bash
wingfoil dna set project.name --value "My Project"
wingfoil dna set project.description --value "Online bookshop"
```

### 4.2 Team and the approver

Register every person who will use WingFoil, with the roles they hold. **At least one member must hold
the `approver` role**, with the same email as their git identity, or nobody can approve anything:

```bash
wingfoil dna add team.members --value "Ada Lovelace" --entry-email ada@example.com --entry-roles approver,developer
```

The roles a member holds must exist in `team.roles`. `init` declares `developer`, `reviewer`, `qa`,
`architect`, `product-owner`, `tech-lead`, `approver`; add your own:

```bash
wingfoil dna add team.roles --value designer --entry-description "UI design"
```

Declare the AI agents that work on the project and the roles they act in. `approval_authority: false`
documents that they never approve:

```bash
wingfoil dna add team.agents --value claude --entry-executes_as developer,reviewer --entry-approval_authority false
```

**Agent commit identity.** An agent entry may also carry an `email`; with its
`name`, it is the identity written in the `Co-Authored-By: <name> <<email>>` trailer of the commits the
agent co-authors (WingFoil's own `git-conventions` directive adds an `AI-Model:` trailer with the model
identifier). The field is optional unless the entry declares an `adapter` (below), and there are two
ways to fill it:

- **The vendor's address (the default).** Use the address the agent's vendor publishes for
  co-authorship — for Claude, `noreply@anthropic.com`:

  ```bash
  wingfoil dna update team.agents.claude --entry-email noreply@anthropic.com
  ```
- **A machine account of your own (optional).** To trace every agent under one GitHub account, create
  that account and use its **id-qualified** noreply address, `<id>+<login>@users.noreply.github.com`
  (GitHub shows it in the account's email settings), or any address your project owns. The bare form
  `<login>@users.noreply.github.com` is refused: a login nobody has registered can be claimed by anyone,
  who would then be credited with every commit that names it.

An agent's `name` may not be empty or blank, nor contain `<`, `>` or a line break, since it is written
into the trailer. An `email` on a top-level domain RFC 2606 reserves (`.test`, `.example`, `.invalid`,
`.localhost`), or carrying git's guessed `.(none)` domain, is refused: no mailbox exists there, and
WingFoil's attribution audit treats such an identity as unattributed. The `email` is required on an entry that declares an `adapter`: that
agent can be launched, and every commit it co-authors names it.

### 4.3 Modules, stacks, paths

```bash
wingfoil dna add modules --value api --entry-path src/api --entry-description "HTTP API"
wingfoil dna update modules.api --entry-description "Public HTTP API"

wingfoil dna add stacks.technologies --value TypeScript --entry-category language --entry-version 5.x

wingfoil dna add paths.sources --value src
wingfoil dna add paths.docs --value docs,README.md
wingfoil dna remove paths.docs --value README.md
```

Each technology is a `{name, category}` entry: `category` is required, `version` and `notes` are
optional. The `dna.yaml` that `init` writes shows the shape as a commented example above
`technologies: []`.

`paths` has seven categories — `sources`, `tests`, `docs`, `config`, `governance`, `runs`, `health` —
and `wingfoil paths <category>` answers "where is X?" for people and agents alike. `runs` is the
directory of the agent run log (§9.4); `init` declares it as `docs/runs/`. `health` is the directory of
the release-health catalogue and reports; `init` does not declare it, so `wingfoil paths health` fails
with `error: no paths mapped for category 'health'` (exit `1`) until you add it.

The fields each collection accepts are listed in the
[CLI reference](cli-reference.md#wingfoil-dna-add). You can also edit `dna.yaml` by hand — then commit it.

## 5. Configure the Memory

`memory.yaml` declares the document types. Each type has:

| Key | Meaning |
|---|---|
| `path` | Where its documents live, e.g. `docs/memory/task/{id}.md` |
| `id_pattern` | How ids are built: `{n}` is a per-type counter (`001`, `002`, …), `{slug}` comes from the title, and any other `{name}` is a frontmatter field you give with `memory add --set name=value` |
| `template.file` | The scaffold `memory add` copies, under `.wingfoil/` |
| `template.frontmatter.required` | Fields that must be filled |
| `states` | Optional: the type's own state machine. Without it, the type uses `defaults.states` |

### 5.1 State machines

A state machine has two parts:

- `sequence` — the ordered forward chain. `memory submit` moves one step along it.
- `gates` — states whose forward step needs **approval** instead of a submit. Each gate names where a
  rejection goes back to.

The default machine that `init` writes:

```yaml
defaults:
  states:
    sequence: [ draft, pending, approved ]
    gates:
      pending: { reject: draft }
```

That reads: `draft` → (`submit`) → `pending` → (`approve`) → `approved`, and `reject` sends `pending`
back to `draft`. `deprecated` is always reachable from any state with `memory deprecate` and is never
listed.

From v0.3, the `bug` type in the scaffold carries a commented-out `states:` block of its own. Uncomment
it to see how a type overrides the default; the states in it are an example, not a recommendation.
It also shows the two optional keys of 0.3: `returns`, the edge `memory park` takes back to an earlier
state, and `limits`, a work-in-progress cap per state (§8.6). The scaffold also declares `plan`, the record of a started workflow, with its own
machine `draft → active → done`: `wingfoil workflow start` adds and submits a plan (`draft → active`), and
`wingfoil workflow end` takes its `waiting` edge (`active → done`), which no `memory` verb drives.
Commit the edited `memory.yaml` before running Memory commands: they read it as committed, not from
your working tree. Existing `bug` documents whose status is not a state of the new machine (for
example `pending` or `approved`) are no longer in a valid state once it applies.

### 5.2 Add your own type

A `story` type with its own lifecycle — `ready` is a gate, the rest are plain steps:

```yaml
types:
  # …existing types…
  story:
    path: docs/memory/story/{id}.md
    id_pattern: "story-{n}-{slug}"
    states:
      sequence: [ draft, ready, in-progress, done ]
      gates:
        ready: { reject: draft }
    template:
      file: memory/templates/story.md
      frontmatter:
        required: [id, type, title, status]
```

Then create `.wingfoil/memory/templates/story.md`:

```markdown
---
id: ""
type: story
title: ""
status: draft
---

<!-- As a <user>, I want <goal>, so that <benefit>. -->
```

From v0.3, a type may not be named `directive`, `dna` or `workflow`: those names mark configuration
commits (`wf(dna): …`), so `memory.yaml` fails validation if a type takes one.

**Commit both files** before using the type. Until you do, `memory add --type story` fails and tells you
the type is defined in the working tree but not committed.

The document walks: `submit` (draft → ready), `approve` (ready → in-progress), `submit`
(in-progress → done). Full script: [`examples/02-custom-memory-type`](examples/02-custom-memory-type/run.sh).

## 6. Configure the Directives

A directive is a short Markdown rule. `roles.yaml` decides who must follow it:

```yaml
assignments:
  developer: [code-quality, testing, determinism]
  reviewer:  [code-review, traceability]
  # …
global:      # every role
  - doc-versioning
  - documentation
  - security
  - security-secrets
```

See what applies to a role:

```bash
wingfoil directives list --role developer
```

### 6.1 Built-in and custom directives

- **Built-in** (`directives/built-in/`) ship with WingFoil: `architecture`, `code-quality`,
  `code-review`, `documentation`, `security`, `testing`. They cannot be removed. `init` binds `security`
  globally, so every role loads it.
- **Custom** (`directives/custom/`) are yours. `init` adds four starters you can edit or delete.
- To **adapt a built-in**, create a custom directive with the same id: it takes precedence, and
  `directives list` reports the override.

### 6.2 Write, assign, retire

```bash
wingfoil directive create --name api-style          # scaffolds directives/custom/api-style.md
# write the rule into the file's body, then commit it
wingfoil directive assign --directive api-style --role developer
```

`--directive` accepts several names: `--directive api-style,architecture`.

To retire a directive, first remove it from `roles.yaml` by hand (there is no unassign command in
0.3), commit, then:

```bash
wingfoil directive remove api-style
```

Full script: [`examples/03-directives-per-role`](examples/03-directives-per-role/run.sh).

## 7. Workflows

`workflows.yaml` includes the workflow files under `workflows/`. `init` gives you:

| Workflow | Started or included | Phases |
|---|---|---|
| `sw-life-cycle` | startable | inception → specification → delivery → sunset |
| `scrum-delivery` / `kanban-delivery` | includable (by `delivery`) | plan → build → review → deliver |
| `bug-ingest`, `decision-log-ingest`, `adr-ingest` | startable | capture |

A phase includes another workflow by its **name** (`include: scrum-delivery`), not by its file path.

```bash
wingfoil workflow list                 # the workflows you can run now (--all: every one)
wingfoil workflow show sw-life-cycle   # one workflow: its phases, roles, directives, actions, checks
```

Both read the workflow files as committed at `HEAD`. A workflow is run in four steps:

1. **Start it.** `wingfoil workflow start <name>` opens a workflow: it records it as a `plan` document
   (an `add` and a `submit` commit) and makes it the active workflow. `--element <type>:<id>` names the
   element it runs on.
2. **Ask what comes next.** `wingfoil workflow next` names the next step of the active workflow: its role
   and that role's directives, the element it works on, and for each action the command to run or the
   commit subject it expects (`--assigned-to me` keeps the steps your role holds). `wingfoil workflow
   status` lists every open workflow with its phases and ready steps, the approvals waiting for a
   decision and who they are routed to, and the documents sitting at a gate that no open workflow carries,
   each as a "human needed" line.
3. **Do the step.** Do that phase's work in the role it names, with that role's directives loaded, and
   record the outcome as Memory documents moved through their states with the verbs in §8. WingFoil
   deduces from those documents, as committed, that the step is done. A step that nothing in the
   repository can show as done — a checkpoint, a wait for a third party, an approval no element carries —
   is recorded with `wingfoil workflow finalize`, an empty commit that `workflow next` then moves past (on
   a phase with `approval:`, only an approver can, with `--reason`). An agent can be launched on a step
   with `wingfoil agent execute --next` (§9.4).
4. **End it.** `wingfoil workflow end` closes the active workflow once its steps are complete, and makes
   the previous one active again.

**WingFoil records and routes; it does not execute.** Nothing runs a step or its checks for you: the
workflow files describe your process so that people and agents read the same one, and the commands above
tell you where you are in it.

`wingfoil workflow create <name> --kind main|sub` writes a new workflow file under `workflows/custom/`
with one phase to replace, and adds it to `workflows.yaml`; `wingfoil workflow remove <name>` deletes a
custom one that no other workflow includes and no open workflow runs (built-in workflows cannot be
removed). See the [CLI reference](cli-reference.md#wingfoil-workflow-list).

A workflow run from `workflow start` to `workflow end`, with a routed approval and a checkpoint recorded
by `workflow finalize`: [`examples/06-workflow-approval`](examples/06-workflow-approval/run.sh).

## 8. Daily use: the life of a Memory document

### 8.1 Create

```console
$ wingfoil memory add --type task --title "My first task" --tags demo,quickstart
{
  "id": "task-001-my-first-task",
  "path": "docs/memory/task/task-001-my-first-task.md"
}
```

The document is in `draft`, with the type's template as its body.

### 8.2 Write and submit

Open the file, write its body, fill every field in `template.frontmatter.required` (a missing one
stops the submit: `error: missing required field on submit: title`). Then:

```bash
wingfoil memory submit task-001-my-first-task      # draft → pending
```

The submit commit records your content **and** the state change. You do not need to commit the edits
first. The commit body names what it carries besides the state change, e.g.
`Carries content: frontmatter field 'title', the body`. The template's placeholder comments are yours
to replace: neither `memory add` nor `memory submit` writes the body for you.

### 8.3 Approve or reject

Someone holding the `approver` role (§4.2) decides:

```bash
wingfoil memory approve task-001-my-first-task --reason "Scope is clear."
wingfoil memory reject  task-001-my-first-task --reason "Add acceptance criteria before resubmitting."
```

- `--reason` is mandatory and may not be blank. It may span several lines, but no line may begin with
  `Approver:` or `Reason:`, and it may not end with a paragraph made only of `Key: value` lines.
  From v0.3, no line may begin with `WingFoil-Version:` either, and the reason may not contain a
  control character other than tab and newline (C0, DEL, C1, or the separators U+2028 and U+2029).
- The commit records the approver and the reason:

  ```
  wf(task): approve task-001-my-first-task [pending → approved]

  Approver: Ada Lovelace <ada@example.com> (approver)
  Reason: Scope is clear.

  WingFoil-Version: 0.3.0 (6ca54978a01dc29c81e395d363efcdeac8a513fd)
  ```

- A reject also writes the reason into the document's `rejection_reason` field; the next submit clears
  it.
- These verbs commit the state change **and nothing else**. If the document has uncommitted edits they
  refuse — commit or stash them first.
- Without the approver role you get `error: user not authorized to approve type 'task'` (exit `1`).

### 8.4 Retire

```bash
wingfoil memory deprecate dl-001-use-postgresql --reason "Superseded by the hosted-DB decision."
```

Any state → `deprecated`. No approver role needed; `--reason` is optional but, if given, not blank.

### 8.5 Find and audit

```bash
wingfoil memory search login                        # keyword: title, id, tags, body
wingfoil memory search --type task --status pending # metadata only
wingfoil memory history task-001-my-first-task      # every commit: who, when, from → to, approver, reason
```

`memory search` leaves out `deprecated` documents unless you ask for them with `--status deprecated`.

Full script: [`examples/01-first-project`](examples/01-first-project/run.sh).

### 8.6 Park and amend

Two verbs change a document without walking its `sequence` forward.

**Park** returns a started document to an earlier state along a `returns` edge its type declares (§5.1),
when the work stops for now — which is not a rejection. With the scaffold's commented `bug` machine
uncommented and committed:

```console
$ wingfoil memory park bug-001-login-fails --reason "Waiting for the upstream fix."
{
  "id": "bug-001-login-fails",
  "path": "docs/memory/bug/bug-001-login-fails.md",
  "from": "in-progress",
  "to": "open",
  "reason": "Waiting for the upstream fix."
}
```

The commit is `wf(bug): park bug-001-login-fails [in-progress → open]` with the reason; no approver role
is needed. A state may also declare a `limits:` count: entering a full state with `add`, `submit` or
`approve` is refused, naming the documents that hold it; `reject` and `park` are never refused by a
limit.

**Amend** records a correction to a document whose state should not change — an `approved` tech-spec,
for example. Edit the file (not its `status`, `id`, `type`, `release`, `rejection_reason` or
`supersedes`), then:

```bash
wingfoil memory amend spec-001-storage-layout --reason "Later measurements corrected the §2 figures."
```

It commits that edit alone as `wf(tech-spec): amend spec-001-storage-layout [approved → approved]`, with
the `Approver:` and `Reason:` lines: like `approve`, it needs the `approver` role. The type must declare
`amendable: true` in `memory.yaml`; `init` declares it for every type except `release-line`.

## 9. Connect an AI agent

Agents read the project through WingFoil in two ways, which complement each other.

### 9.1 The MCP server

`wingfoil mcp` is an MCP server over stdio. Register it with your MCP client, launched from the project
root. For Claude Code, a `.mcp.json` at the repository root:

```json
{
  "mcpServers": {
    "wingfoil": {
      "command": "wingfoil",
      "args": ["mcp"]
    }
  }
}
```

or `claude mcp add wingfoil -- wingfoil mcp`. Other clients take the same `command` + `args`.

What the server exposes — all **read-only**:

| Kind | Name / URI | Content |
|---|---|---|
| Resource | `wingfoil://dna` | the whole `dna.yaml` |
| Resource template | `wingfoil://dna/{section}` | one top-level section |
| Resource template | `wingfoil://memory/{type}` | documents of a type, frontmatter only (deprecated ones left out) |
| Resource template | `wingfoil://memory/{type}/{id}` | one document, full content |
| Resource | `wingfoil://workflows` | every workflow, summary |
| Resource template | `wingfoil://workflows/{name}` | one workflow, full definition |
| Resource | `wingfoil://workflows/-/next` | the next step of the active workflow, as `wingfoil workflow next --format json` prints it |
| Resource | `wingfoil://workflows/-/status` | every open workflow, as `wingfoil workflow status --format json` prints it |
| Resource template | `wingfoil://session/{role}/{element}/{state}` | the agent's execution context for `element` (`<type>:<id>`) at the commit `state`, the same text as `<role>-session` with those two arguments; not listed, read by its full URI |
| Prompt | `<role>-session` (one per role, e.g. `developer-session`) | session instructions for the role, embedding its directives |

The server has **no Tools**: an agent cannot change anything through MCP. It writes by running the CLI,
like a person — and never approves. `tools/list` answers an empty list, and the server reads the role
list from `dna.yaml` when it starts — restart it after adding or removing a role. `<role>-session` takes two optional arguments, `element="<type>:<id>"`
and `state="<commit>"` (any name of one commit; a sha is recommended); given together, the Prompt returns the agent's execution context for that
element as the commit holds it (later commits and uncommitted edits do not change it). The Resource
`wingfoil://session/<role>/<type>:<id>/<commit>` returns the same text, for agents whose client lets the model read
Resources but not get Prompts; it is the one `wingfoil agent execute` tells the agent to read. A Memory
Resource read, and such a Prompt or session Resource, list the documents WingFoil could not read in a `warnings` array next
to the content. Full script: [`examples/04-mcp-server`](examples/04-mcp-server/run.sh).

### 9.2 `agents.md`

[`agents.md`](agents.md) is written for an agent: what WingFoil is, how to recognize a WingFoil project,
the rules to follow, and the CLI equivalent of every MCP Resource and Prompt. Point an agent at it
(for example by giving it the file's GitHub link) when MCP is not available, or alongside MCP to
reinforce the rules.

### 9.3 Roles for agents

Tell the agent which role it acts in, and have it load that role's rules — through the
`<role>-session` Prompt, or with `wingfoil directives list --role <role>` and the listed files.

### 9.4 Launch an agent

`wingfoil agent execute` launches an agent CLI on one Memory element, with its context assembled and
checked first. `init` installs two adapters under `.wingfoil/agents/built-in/`: `claude-code` (Claude
Code) and `codex-cli` (Codex CLI); `.wingfoil/agents/custom/` takes your own. Declare the agent in
`dna.yaml` with the adapter it is launched through and the email its commits are co-authored with (§4.2):

```bash
wingfoil dna add team.agents --value claude --entry-adapter claude-code --entry-email noreply@anthropic.com --entry-executes_as developer,reviewer
```

Then launch it on an element, or on the next step of the active workflow (§7):

```bash
wingfoil agent execute --element task:task-001-my-first-task --role developer
wingfoil agent execute --next
```

Before anything is spawned it checks the element, the role (never `approver`), the adapter, your git
identity, `paths.runs` and the context, and refuses with exit `1` on the first failure. The agent is
handed the terminal; its first prompt tells it to read its context from the MCP Resource
`wingfoil://session/<role>/<type>:<id>/<commit>`, served by a WingFoil MCP server of the same build that
`agent execute` registers for it. When the agent exits, the run is recorded as one line of
`<paths.runs>/<element-id>.jsonl`, committed as `agent: record <run-id>`. `--dry-run` runs every check and
prints the launch it would make; both built-in adapters need a terminal, so a dry run with stdin or
stdout redirected fails with `error: interactive launch needs a terminal on stdin and stdout`.

```bash
wingfoil agent list            # the recorded runs, and the workflow steps waiting for an agent
wingfoil agent show task-001-my-first-task/adhoc/1
```

**Codex CLI: do not declare a server named `wingfoil` in a trusted project's `.codex/config.toml`.** The
`codex-cli` adapter registers WingFoil's MCP server with Codex's `-c mcp_servers.wingfoil=…` override, and
Codex merges that override with a same-named table of a trusted project's `.codex/config.toml`: the
keys the project sets and the override does not (`env`, `cwd`, …) reach WingFoil's server, and a `cwd`
can make it serve another repository's context.

## 10. CI and scripting

- `--format json` prints compact JSON and nothing else; `--format yaml` prints YAML. Errors become
  `{"error": "<reason>"}` on stderr — every error, a mistyped command or option included — with a
  `hint` when a suggestion applies and a `details` array (`file`, `detail`) when the error names one.
- Exit codes: `0` success (an empty search included), `1` the request cannot be carried out, `2` the
  command line is wrong.

A gate that fails the build while tasks are waiting for approval:

```bash
PENDING=$(wingfoil memory search --type task --status pending --format json \
  | node -e 'console.log(JSON.parse(require("fs").readFileSync(0,"utf8")).matches.length)')
[ "$PENDING" -eq 0 ] || { echo "$PENDING task(s) awaiting approval"; exit 1; }
```

Full script: [`examples/05-ci-json-exit-codes`](examples/05-ci-json-exit-codes/run.sh).

## 11. Known limitations in 0.3

- **No step execution** — WingFoil tracks workflows and routes their approvals, but people and agents
  carry out the steps and run their checks (§7).
- **No unassign command for directives** — edit `roles.yaml` and commit (§6.2).
- **Run from the repository root** — a subdirectory fails with `E_NOT_AT_GIT_ROOT`.
- **`dna show` takes only a top-level section** (`team`, not `team.members`).

## 12. Upgrading from 0.2.x

A project initialised by 0.2.x keeps working with 0.3 after these changes. Each was checked by
initialising a project with 0.2.2 and running both versions on it.

- **A phase `include:` is a workflow name.** 0.2.x scaffolded `include: workflows/custom/scrum-delivery.yaml`
  in `sw-life-cycle.yaml`; 0.3 refuses a path, so every workflow command fails with exit `1`:
  `error: E_WORKFLOW_INCLUDE_UNRESOLVED phases[2].include (workflows/custom/sw-life-cycle.yaml): include 'workflows/custom/scrum-delivery.yaml' names no loaded workflow (a phase include is a workflow name, not a file path)`.
  Write `include: scrum-delivery` (or `kanban-delivery`) and commit.
- **`wingfoil workflow list` has a new output.** It prints `{baseline, workflows: [{name, startable,
  includable, description, executableNow}]}` for the workflows you can run now (`--all` for every one)
  instead of the raw manifest; `wingfoil workflow show <name>` prints one workflow's phases.
- **To run workflows and agents, add what 0.3's `init` scaffolds.** `workflow start` needs the `plan`
  type (`error: memory type 'plan' is not declared in memory.yaml; workflow start records an instance as a
  plan element`); `agent execute` needs `paths.runs` and an adapter. Copy the `plan` entry of
  `memory.yaml`, `memory/templates/plan.md`, `paths.runs: [docs/runs/]` and `.wingfoil/agents/` from a
  project `wingfoil init` creates in an empty repository, then commit.
- **A surplus operand is refused** with exit `2` before anything is read or written:
  `wingfoil memory search a b` exited `0` in 0.2.2 and now prints
  `error: wingfoil memory search takes one positional <keyword> (got 2 positionals)`.
- **No `.wingfoil/`, no answer.** In a git repository without `.wingfoil/`, `wingfoil mcp` and
  `wingfoil directives list` exited `0` in 0.2.2; they now exit `1` with `error: WingFoil not initialized
  (no .wingfoil/ directory at the project root): run 'wingfoil init' first`.
- **Refusal wordings changed.** A missing operand reads `error: missing required argument: <id>` with the
  usage on a `hint:` line; an illegal transition names the attempted move, `(none)` when the verb has no
  edge from that state, followed by a reason line (`error: illegal transition draft -> (none) for type
  'task'`, where 0.2.2 printed `draft -> approved`). Scripts matching 0.2.2's stderr text must be updated;
  exit codes are unchanged.
- **`wingfoil --version` prints the build's commit too**: `0.3.0 (<sha>)`, where 0.2.2 printed `0.2.2`.
- **Library users:** the package's main entry no longer exports `prepareMemoryTransition` (use
  `beginMemoryTransition`), and `dist/storage` no longer exports the unconfined `resolveMemoryPath`.
