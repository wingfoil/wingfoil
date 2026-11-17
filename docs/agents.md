# WingFoil — guide for AI agents

**Audience:** an AI agent working inside a project that **uses** WingFoil, typically handed this file's
link. It tells you what WingFoil is, how to read a WingFoil project, and how to change it without
breaking its rules. It covers the same ground as the WingFoil MCP server, so it works as a substitute
when MCP is not connected and as a reinforcement when it is.

- **Developing WingFoil itself?** This is the wrong file: read `AGENTS.md` at the repository root.
- **Version:** this file describes release **0.3** (0.3.2). Run
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
| current work and decisions, your own pending records included | `wingfoil memory search --type <type>` (every state but `deprecated`; §6) |

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
   by hand, and never write a `wf(...)` commit yourself. When `wingfoil agent execute` launched you, a plain
   `wingfoil` runs the build that launched you (its first prompt names the version `wingfoil --version`
   prints; if it prints another, run `"$WINGFOIL_CLI"` instead), and the commits `wingfoil` writes for you
   already end with your `Co-Authored-By:` and `AI-Model:` trailers: pass `--ai-model <your model identifier>`
   to each command that writes a commit and never amend one to add them again. Add both trailers only to a
   commit you write yourself with `git commit`.
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
| `wingfoil://session/{role}/{element}/{state}` — your execution context for one element at one commit, the text of `<role>-session` with `element` and `state`; not listed: `wingfoil agent execute`'s first prompt gives the full URI | `wingfoil agent execute --element <type>:<id> --role <role> --dry-run` prints the instruction that names it (with stdin or stdout redirected, a dry run of a built-in adapter's interactive launch adds a `warning:` line and still prints it); no CLI command prints the context itself |
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
| Short ids (new in 0.3.2; earlier versions take full ids only) | any `<id>` above, and `--element <type>:<id>` of `workflow start`, `workflow adopt` and `agent execute`, accepts `<type prefix>-<n>` (`dl-1`) or a unique prefix of the full id; `agent list --element` stays exact | an ambiguous reference is refused with every full id listed (exit `1`, nothing written); outputs and commits carry the full id |
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

**Your own records wait for the approver.** A document you add and submit stops at the first gate of its type's state
machine (`pending` in the one `init` scaffolds) and stays there until the approver approves or rejects it: nothing you
run moves it on. It is still current work: read it and build on it like any other document.

**Which states to read.** `wingfoil memory search --type <type>` with no `--status` lists every state but
`deprecated`, your pending records included: use it for current work and decisions. `--status <state>` keeps one
state; pass it only to narrow a read on purpose. `--status approved` alone hides everything still waiting for the
approver, your own records first.

**Knowledge given in a request.** A rule the human gives you in a request and means for later work is not kept in
your own notes or memory, where no other agent reads it: record it as a `decision-log` (`wingfoil memory add --type
decision-log --title "<title>"`, inside the `decision-log-ingest` workflow when the project runs one), and submit it
for the approver; once approved, it holds for every agent. A rule that changes what a role must do becomes a
directive (`wingfoil directive create`) only when your role and task call for changing governance. A fact about one
element goes in that element's body.

## 7. Following a workflow

WingFoil 0.3 records and routes workflows; it does not execute their steps. Until the workflow engine's driver runs
them itself (planned for 1.0), a run is driven by hand, by a human or by you.

### Levels of process

A project names the level of process its agents follow, in its own instructions to agents or in a global directive.
Two levels:

- **Light:** Memory is the project's register. You add, submit, park and deprecate documents with the verbs in §6
  and read them back (§2); no workflow is opened, and each document waits for the approver on its own.
- **Strict:** the work runs inside an open workflow, through the cycle below: each element is added linked to its
  step, each step is recorded, and the run stops at every gate.

When the project names no level, follow the cycle for the work of a workflow `wingfoil workflow status` lists as
open, and the light level otherwise.

### The cycle

1. `wingfoil workflow status`, then `wingfoil workflow next`: the open workflows, then the next step of the active
   one — its role and that role's directives, the element it works on, and the command or commit each action
   expects. `wingfoil workflow show <name>` prints a whole workflow.
2. Act in the role the step names, with that role's directives loaded (§4, rule 3).
3. Record the outcome with the verbs in §6. An element the step adds is added linked to it, with the command
   `workflow next` prints: `wingfoil memory add --type <type> --title "<title>" --workflow <instance>
   --step <step-key>`. WingFoil deduces from the documents, as committed, that the step is done.
4. A step that nothing in the repository can show as done, such as a checkpoint, is recorded with `wingfoil
   workflow finalize`; `workflow next` then moves past it.
5. At a gate — a step waiting for the approver, shown as `human needed:` by `workflow next` and `workflow
   status` — stop and hand over to the human approver. The approver's verbs refuse to run in an agent's session
   (`E_AGENT_CONTEXT`, new in 0.4).

Then run `wingfoil workflow next` again, until the workflow's steps are complete. An agent following this cycle is
a hand-driven run, not a coordinator. Start (`wingfoil workflow start <name>`) or end (`wingfoil workflow end`) a
workflow only when the human asks you to.

### The coordinator

A project may declare a `coordinator` role, which an agent may execute. It decides only what the configuration
cannot:

1. which frontier steps to run in parallel, within the declared caps;
2. the triage of a failure the driver reports (rerun, open a bug, stop);
3. the content of an element that no other role's step writes.

The coordinator never approves, rejects or amends, and never decides a gate. It never does a step's work in place
of the step's role. A coordinator session is recorded as a run: it is launched with `wingfoil agent execute
--element <type>:<id> --role coordinator`, which appends its record to the run log and commits it as `agent:
record <run-id>` when the session exits; the element is the `plan` of the run it coordinates. Until the driver ships,
the coordinator may run the driver's mechanical steps as a hand-driven run, each recorded exactly as the step declares
it, with the subject or command `workflow next` prints.

### What removes each manual step

| Manual step | Done today by | Removed by |
|---|---|---|
| reading the run: `workflow status`, `workflow next` | you, or the human | the driver, 1.0 |
| opening and ending a workflow: `workflow start`, `workflow end` | the human, or you when asked | the driver, 1.0 |
| adding an element linked to its step: `memory add --workflow --step` | the step's role | the driver, 1.0 |
| launching the agent of the step's role: `agent execute --next` | the human, or a coordinator | the driver, 1.0 (a launch without a terminal, `--headless`, is new in 0.4) |
| running a phase's checks | the step's role, by hand | the driver, 1.0 |
| recording a step no evidence completes: `workflow finalize` | you, or a coordinator | the driver, 1.0 |
| writing an element's content and doing the step's work | the step's role | never: it stays the agent's |
| deciding a gate | the human approver | never: a gate stays the approver's |

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
- **Codex CLI:** if you run through the `codex-cli` adapter, `agent execute` refuses the launch while Codex's
  own configuration (a trusted project's `.codex/config.toml`) declares an MCP server named `wingfoil`:
  `error: adapter 'codex-cli': the agent's own configuration declares an MCP server named 'wingfoil', …`.
  Codex would merge that table into the server `agent execute` registers, so its extra keys (`env`, `cwd`, …)
  would reach WingFoil's server. If you meet the refusal, tell the human; do not edit that file yourself.
