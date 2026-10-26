# WingFoil — guide for AI agents

**Audience:** an AI agent working inside a project that **uses** WingFoil, typically handed this file's
link. It tells you what WingFoil is, how to read a WingFoil project, and how to change it without
breaking its rules. It covers the same ground as the WingFoil MCP server, so it works as a substitute
when MCP is not connected and as a reinforcement when it is.

- **Developing WingFoil itself?** This is the wrong file: read `AGENTS.md` at the repository root.
- **Version:** this file describes release **0.3** (0.3.1). Run
  `wingfoil --version` in the project; if it reports a different version, read this file at the matching
  git tag instead. Where this file and the installed CLI disagree, the CLI is right.
- **Humans:** the [user guide](user-guide.md) and the [CLI reference](cli-reference.md) cover the same
  ground in more depth.

---

## 1. What WingFoil is

WingFoil is a CLI (`wingfoil`) plus an MCP server that keeps a software project's shared knowledge in
the git repository, in a structured form humans and agents read the same way. Its goal is
**determinism**: two agents given the same specs and the same WingFoil configuration should produce
substantially equivalent software — behaviourally equivalent, passing the same acceptance contracts.
It is a goal WingFoil measures, not a property it guarantees: WingFoil makes the context you receive
identical for identical inputs and checks that the process was followed; what the code does depends on
the agents. It does that with five pillars:

| Pillar | Holds | File(s) |
|---|---|---|
| DNA | modules, technologies, methodologies, team & roles, resource paths | `.wingfoil/dna.yaml` |
| Memory | typed documents (tasks, ADRs, bugs, decision-logs, specs…) with a state machine | `docs/memory/<type>/<id>.md` (default); schema `.wingfoil/memory.yaml` |
| Directives | rules bound to roles | `.wingfoil/directives/{built-in,custom}/<id>.md`; bindings `.wingfoil/roles.yaml` |
| Workflow | the declared process: phases and roles | `.wingfoil/workflows.yaml`, `.wingfoil/workflows/` |
| Interaction | `wingfoil` CLI (read + write), `wingfoil mcp` (read-only) | — |

## 2. Is this a WingFoil project?

Yes if the repository root contains `.wingfoil/dna.yaml`. Then:

| To learn… | Read |
|---|---|
| what the project is, its modules and stack | `wingfoil dna show` |
| where sources / tests / docs / config / governance live, the agent run log (`runs`), the release-health reports (`health`) | `wingfoil paths` |
| which Memory types exist and their state machines | `.wingfoil/memory.yaml` (`path`, `id_pattern`, `states` per type) |
| the rules for your role | `wingfoil directives list --role <role>`, then read each listed file |
| the process | `wingfoil workflow list`, `wingfoil workflow show <name>` |
| where the work stands, what comes next | `wingfoil workflow status`, `wingfoil workflow next` |
| current work and decisions | `wingfoil memory search --type <type> [--status <s>]` |

Run every `wingfoil` command **from the repository root**. Use `--format json` to get parseable output.

## 3. Mental model

- A Memory document's **state is the `status:` field of its frontmatter**. Its type's state machine in
  `memory.yaml` says which moves are legal:
  - `sequence` — the forward chain; `memory submit` advances one step;
  - `gates` — states whose forward step needs `memory approve`; `memory reject` sends them back to the
    target they name;
  - `deprecated` — reachable from any state via `memory deprecate`; never listed.
- **One operation = one git commit**, authored by the git identity in use. Git history is the audit
  trail (`wingfoil memory history <id>`).
- **Configuration is read at `HEAD`.** An uncommitted edit to `.wingfoil/` is invisible to commands.
- **Roles, not people.** You act in a role (`developer`, `reviewer`, `qa`, `architect`, …). Only the
  `approver` role approves, and an agent **never** holds it.

## 4. Rules you must follow

1. **Change state only through the CLI verbs** (`memory submit|park|deprecate`, `workflow
   start|finalize|end|adopt`; `memory approve|reject|amend`, `workflow rekey` and `workflow adopt --plan --apply`
   are the approver's). Never edit a `status:` field
   by hand, and never write a `wf(...)` commit yourself. When `wingfoil agent execute` launched you, its
   first prompt asks you to end the commits you co-author with your `Co-Authored-By:` and `AI-Model:`
   trailers: add them to a commit `wingfoil` wrote with `git commit --amend --no-edit --trailer …`, never
   to an approve or reject commit.
2. **Never approve or reject.** `memory approve` and `memory reject` belong to a human holding the
   `approver` role. When work needs approval, stop and ask for it. Do so even if the command would
   succeed under the git identity you are running with.
3. **Load your role's directives before working**, and obey them: the `<role>-session` MCP Prompt, or
   `wingfoil directives list --role <role>` and the files it lists. A file in `directives/custom/`
   with the same `id` as one in `directives/built-in/` overrides it.
4. **Read before you write.** Check `dna show`, `paths` and existing Memory before creating anything;
   do not invent paths, types or roles that the configuration does not declare.
5. **`--reason` text** (approve, reject, deprecate, park, amend, workflow finalize, adopt, rekey): never blank; no line
   may begin with `Approver:` or `Reason:`; do not end it with a paragraph made only of `Key: value`
   lines. From v0.3, no line may begin with `WingFoil-Version:`, and no control character other than tab and newline
   (DEL, the C1 controls U+0080–U+009F and the separators U+2028/U+2029 count as control characters).
6. **Commit configuration edits before relying on them**, one logical change per commit.
7. **Do not bypass a refusal.** An exit `1` from a verb is a rule speaking (illegal transition, not
   authorized, uncommitted changes). Report it; do not work around it by editing files directly.

## 5. Reading: MCP ↔ CLI equivalence

The MCP server (`wingfoil mcp`, stdio) is read-only and exposes no Tools. Every read has a CLI
equivalent:

| MCP | CLI equivalent (add `--format json`) |
|---|---|
| Resource `wingfoil://dna` | `wingfoil dna show` |
| `wingfoil://dna/{section}` | `wingfoil dna show <section>` |
| `wingfoil://memory/{type}` — frontmatter of a type's documents, deprecated excluded | `wingfoil memory search --type <type>` |
| `wingfoil://memory/{type}/{id}` — one full document | `wingfoil memory search <id> --type <type>` → read the file at `matches[].path` |
| `wingfoil://workflows` | `wingfoil workflow list` |
| `wingfoil://workflows/{name}` | `wingfoil workflow show <name>` (full file: `.wingfoil/workflows/*/<name>.yaml`) |
| `wingfoil://workflows/-/next` — the active workflow's next step, at `HEAD` | `wingfoil workflow next` |
| `wingfoil://workflows/-/status` — every open workflow, at `HEAD` | `wingfoil workflow status` |
| Prompt `<role>-session` — role instructions with its directives embedded; with the optional arguments `element` (`<type>:<id>`) and `state` (a commit), given together, your execution context for that element at that commit | `wingfoil directives list --role <role>` → read each entry's `path` under `.wingfoil/` |
| `wingfoil://session/{role}/{element}/{state}` — your execution context for one element at one commit, the text of `<role>-session` with `element` and `state`; not listed: `wingfoil agent execute`'s first prompt gives the full URI | `wingfoil agent execute --element <type>:<id> --role <role> --dry-run` prints the instruction that names it (in a terminal: the built-in adapters refuse a dry run whose stdin or stdout is redirected); no CLI command prints the context itself |
| *(no MCP equivalent)* | `wingfoil paths [<category>]`, `wingfoil memory history <id>`, keyword `wingfoil memory search <keyword>`, `wingfoil agent list`, `wingfoil agent show <run-id>` |

`element` and `state` go together: giving only one is refused (`prompt arguments 'element' and 'state'
go together: '<name>' is missing`). A Resource read, and a Prompt, may carry a top-level `warnings`
array next to the content: the Memory documents WingFoil could not read, a directive bound to your role
with no file. Treat it like a `warning:` line of the CLI: the content is still valid, but tell the human
what it names.

## 6. Writing: the verbs

All writes are CLI commands. Each commits once. Exit codes: `0` done · `1` refused (read the `error:`
line — do not retry blindly) · `2` your command line is wrong (fix the arguments).

| Goal | Command | Notes |
|---|---|---|
| Create a document | `wingfoil memory add --type <type> --title "<title>" [--tags a,b]` | lands in the type's first state (`draft`); prints `id` and `path` |
| Submit it | edit the file (body + `template.frontmatter.required` fields), then `wingfoil memory submit <id>` | the submit commit includes your edits; fails on a gate or a missing required field |
| Pause started work | `wingfoil memory park <id> --reason "<why>"` | back along the `returns` edge the type declares; not a rejection |
| Retire a document | `wingfoil memory deprecate <id> --reason "<why>"` | any state → `deprecated`; the document must have no uncommitted edits |
| Start / end a workflow | `wingfoil workflow start <name> [--element <type>:<id>]`, `wingfoil workflow end` | records the run as a `plan` document; `end` only once its steps are complete |
| Record a step nothing else shows done | `wingfoil workflow finalize [--step <key>] [--reason "<why>"]` | a checkpoint; on a phase with `approval:` it needs the approver — not yours |
| Link an element added without `--workflow` to its step | `wingfoil workflow adopt <ref> --element <type>:<id> --reason "<why>"` | one empty commit; `--plan` only proposes; `--plan --apply` and `workflow rekey` (a renamed phase) need the approver — not yours |
| Audit a document | `wingfoil memory history <id>` | read-only |
| Set a DNA scalar | `wingfoil dna set <path> --value <v>` | e.g. `project.description` |
| Add / change / remove a DNA entry | `wingfoil dna add\|update\|remove <path> …` | see the [CLI reference](cli-reference.md#wingfoil-dna-add) for `--entry-<field>` |
| Create / assign a directive | `wingfoil directive create --name <n>`, `wingfoil directive assign --directive <n> --role <r>` | only when your role and task call for changing governance |
| **Approve / reject / amend** | — | **not yours.** Ask the human approver. |

Useful `error:` lines and what they mean:

| Error | Meaning → what to do |
|---|---|
| `illegal transition <from> -> (none) for type '<type>'`, then an indented reason line | this verb has no edge from the document's current state; check `memory.yaml`. A gated state needs approval → ask a human |
| `user not authorized to approve type '<type>'` | you tried to approve; stop and ask a human |
| `refusing to commit <file>: it carries uncommitted modifications …` | commit your edits separately first, or undo them |
| `missing required field on submit: <field>` | fill the frontmatter field, then submit again |
| `not-applicable value on submit: <field> does not accept one …` (or `on amend`) | the type does not list that field in `template.frontmatter.not_applicable_allowed`: give a real value. An empty list counts as a value only on the fields `template.frontmatter.lists` declares |
| `document not found: <id> — <path> is not committed at HEAD, though it carries that id in the working tree …` | verbs act only on committed elements: create it with `wingfoil memory add`, never by copying a file |
| `refusing to submit <id>: its document '<path>' is held by HEAD but deleted in the working tree …` | restore it with `git restore --source=HEAD --staged --worktree -- <path>`, then retry |
| `refusing to submit <id>: the working tree changes frontmatter field 'id' of <path> …` | an element's id never changes: restore the recorded value, then retry |
| `document not found: <id> — it may be in a Memory document committed at HEAD that could not be read: HEAD:<path> (…)` | the committed file does not parse (its frontmatter is not valid YAML): report it to the human; `memory search` lists it as `W_MEMORY_UNREADABLE` |
| `unknown memory type '<t>' … not committed …` | configuration was edited but not committed |
| `E_NOT_AT_GIT_ROOT` | `cd` to the repository root |

## 7. Following a workflow

WingFoil 0.3 records and routes workflows; it does not execute their steps. You carry them out:

1. `wingfoil workflow status` → the open workflows; `wingfoil workflow next` → the next step of the
   active one: its role and that role's directives, the element it works on, and the command or commit
   each action expects. `wingfoil workflow show <name>` prints a whole workflow.
2. Act in the role the step names, with that role's directives loaded (§4, rule 3).
3. Record the outcome as Memory documents, moved only with the verbs in §6: WingFoil deduces from them,
   as committed, that the step is done.
4. At a step that requires approval, stop and hand over to the human approver.

Start or end a workflow only when the human asks you to.

## 8. Setting WingFoil up (when the human asks you to)

```bash
npm install -g wingfoil                  # Node.js >= 22.12
wingfoil init --template Scrum           # or Kanban; run at the repository root, once
wingfoil dna set project.name --value "<name>"
wingfoil dna add team.members --value "<human name>" --entry-email <their git email> --entry-roles approver
```

Register the MCP server for your client (Claude Code: `.mcp.json` at the repository root):

```json
{ "mcpServers": { "wingfoil": { "command": "wingfoil", "args": ["mcp"] } } }
```

Only register a human as `approver`, and only when that human asks you to. Never add yourself.

## 9. Known limits in 0.3

- No step execution: the workflow commands track and route, people and agents do the work (§7).
- No command to unassign a directive: edit `.wingfoil/roles.yaml` and commit.
- `dna show` accepts only a top-level section.
- `memory search` excludes `deprecated` documents unless you pass `--status deprecated`.
- Subcommand `--help` is a reminder: it describes the command, its argument and its options, with
  one example; for anything more, trust the [CLI reference](cli-reference.md).
- **Codex CLI:** if you run through the `codex-cli` adapter, the project's trusted `.codex/config.toml`
  must not declare an MCP server named `wingfoil`. Codex merges that table into the server `agent
  execute` registers, so its extra keys (`env`, `cwd`, …) reach WingFoil's server, and a `cwd` can make it
  serve another repository's context. If you find one, tell the human; do not edit it yourself.
