# WingFoil user guide

A step-by-step guide to configuring and using WingFoil **0.2.2** in your own project. It starts from an
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
11. [Known limitations in 0.2.2](#11-known-limitations-in-022)

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

Or run it without installing: `npx wingfoil <command>`.

## 3. Initialize a project

From the root of your repository (run `git init` first if it is new):

```console
$ wingfoil init --template Scrum
{
  "root": "/home/ada/my-project",
  "template": "Scrum",
  "files": [
    ".wingfoil/directives/built-in/architecture.md",
    …
    ".wingfoil/workflows.yaml"
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
├── memory/templates/         one Markdown scaffold per type (adr, bug, decision-log, release, release-line, task, tech-spec)
├── roles.yaml                which directives apply to which role
├── directives/
│   ├── built-in/             architecture, code-quality, code-review, documentation, security, testing
│   └── custom/               determinism, doc-versioning, security-secrets, traceability (yours to edit)
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

`paths` has five categories — `sources`, `tests`, `docs`, `config`, `governance` — and
`wingfoil paths <category>` answers "where is X?" for people and agents alike.

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
0.2.2), commit, then:

```bash
wingfoil directive remove api-style
```

Full script: [`examples/03-directives-per-role`](examples/03-directives-per-role/run.sh).

## 7. Workflows

`workflows.yaml` includes the workflow files under `workflows/`. `init` gives you:

| Workflow | Kind | Phases |
|---|---|---|
| `sw-life-cycle` | main | inception → specification → delivery → sunset |
| `scrum-delivery` / `kanban-delivery` | sub (included by `delivery`) | plan → build → review → deliver |
| `bug-ingest`, `decision-log-ingest`, `adr-ingest` | main | capture |

```bash
wingfoil workflow list
```

**WingFoil 0.2.2 has no workflow engine**: nothing starts a workflow, tracks its phase or runs its
checks. The workflow files describe your process so that people and agents read the same one, and you
follow it by hand. In practice:

1. Pick the workflow and phase you are in, from `workflow list`.
2. Do that phase's work in the role it names, with that role's directives loaded.
3. Record the outcome as Memory documents and move them through their states with the verbs in §8.

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
first.

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
| Prompt | `<role>-session` (one per role, e.g. `developer-session`) | session instructions for the role, embedding its directives |

The server has **no Tools**: an agent cannot change anything through MCP. It writes by running the CLI,
like a person — and never approves. Unreleased (v0.3): `tools/list` answers an empty list, and the
server reads the role list from `dna.yaml` when it starts — restart it after adding or removing a
role. Full script: [`examples/04-mcp-server`](examples/04-mcp-server/run.sh).

### 9.2 `agents.md`

[`agents.md`](agents.md) is written for an agent: what WingFoil is, how to recognize a WingFoil project,
the rules to follow, and the CLI equivalent of every MCP Resource and Prompt. Point an agent at it
(for example by giving it the file's GitHub link) when MCP is not available, or alongside MCP to
reinforce the rules.

### 9.3 Roles for agents

Tell the agent which role it acts in, and have it load that role's rules — through the
`<role>-session` Prompt, or with `wingfoil directives list --role <role>` and the listed files.

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

## 11. Known limitations in 0.2.2

- **No workflow engine** — workflows are followed by hand (§7).
- **No unassign command for directives** — edit `roles.yaml` and commit (§6.2).
- **Run from the repository root** — a subdirectory fails with `E_NOT_AT_GIT_ROOT`.
- **`dna show` takes only a top-level section** (`team`, not `team.members`).
- **Adding the first entry of a collection `dna.yaml` does not contain yet** (for example the first
  `team.agents` entry) rewrites `dna.yaml` without its comments. Other DNA writes keep them.
