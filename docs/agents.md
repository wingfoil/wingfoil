# WingFoil — guide for AI agents

**Audience:** an AI agent working inside a project that **uses** WingFoil, typically handed this file's
link. It tells you what WingFoil is, how to read a WingFoil project, and how to change it without
breaking its rules. It covers the same ground as the WingFoil MCP server, so it works as a substitute
when MCP is not connected and as a reinforcement when it is.

- **Developing WingFoil itself?** This is the wrong file: read `CLAUDE.md` at the repository root.
- **Version:** this file describes the `main` branch, currently release **0.2.2**. Run
  `wingfoil --version` in the project; if it reports a different version, read this file at the matching
  git tag instead. Where this file and the installed CLI disagree, the CLI is right.
- **Humans:** the [user guide](user-guide.md) and the [CLI reference](cli-reference.md) cover the same
  ground in more depth.

---

## 1. What WingFoil is

WingFoil is a CLI (`wingfoil`) plus an MCP server that keeps a software project's shared knowledge in
the git repository, in a structured form humans and agents read the same way. Its goal is
**determinism**: two agents given the same specs and the same WingFoil configuration should produce
substantially equivalent software. It does that with five pillars:

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
| where sources / tests / docs / config / governance live | `wingfoil paths` |
| which Memory types exist and their state machines | `.wingfoil/memory.yaml` (`path`, `id_pattern`, `states` per type) |
| the rules for your role | `wingfoil directives list --role <role>`, then read each listed file |
| the process | `wingfoil workflow list` |
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

1. **Change state only through the CLI verbs** (`memory submit|approve|reject|deprecate`). Never edit a
   `status:` field by hand, and never write a `wf(...)` commit yourself.
2. **Never approve or reject.** `memory approve` and `memory reject` belong to a human holding the
   `approver` role. When work needs approval, stop and ask for it. Do so even if the command would
   succeed under the git identity you are running with.
3. **Load your role's directives before working**, and obey them: the `<role>-session` MCP Prompt, or
   `wingfoil directives list --role <role>` and the files it lists. A file in `directives/custom/`
   with the same `id` as one in `directives/built-in/` overrides it.
4. **Read before you write.** Check `dna show`, `paths` and existing Memory before creating anything;
   do not invent paths, types or roles that the configuration does not declare.
5. **`--reason` text** (approve, reject, deprecate): never blank; no line may begin with `Approver:` or
   `Reason:`; do not end it with a paragraph made only of `Key: value` lines. From v0.3 (`amend` too):
   no line may begin with `WingFoil-Version:`, and no control character other than tab and newline
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
| `wingfoil://workflows/{name}` | `wingfoil workflow list`, the entry with that `name` (full file: `.wingfoil/workflows/*/<name>.yaml`) |
| Prompt `<role>-session` — role instructions with its directives embedded | `wingfoil directives list --role <role>` → read each entry's `path` under `.wingfoil/` |
| *(no MCP equivalent)* | `wingfoil paths [<category>]`, `wingfoil memory history <id>`, keyword `wingfoil memory search <keyword>` |

## 6. Writing: the verbs

All writes are CLI commands. Each commits once. Exit codes: `0` done · `1` refused (read the `error:`
line — do not retry blindly) · `2` your command line is wrong (fix the arguments).

| Goal | Command | Notes |
|---|---|---|
| Create a document | `wingfoil memory add --type <type> --title "<title>" [--tags a,b]` | lands in the type's first state (`draft`); prints `id` and `path` |
| Submit it | edit the file (body + `template.frontmatter.required` fields), then `wingfoil memory submit <id>` | the submit commit includes your edits; fails on a gate or a missing required field |
| Retire a document | `wingfoil memory deprecate <id> --reason "<why>"` | any state → `deprecated`; the document must have no uncommitted edits |
| Audit a document | `wingfoil memory history <id>` | read-only |
| Set a DNA scalar | `wingfoil dna set <path> --value <v>` | e.g. `project.description` |
| Add / change / remove a DNA entry | `wingfoil dna add\|update\|remove <path> …` | see the [CLI reference](cli-reference.md#wingfoil-dna-add) for `--entry-<field>` |
| Create / assign a directive | `wingfoil directive create --name <n>`, `wingfoil directive assign --directive <n> --role <r>` | only when your role and task call for changing governance |
| **Approve / reject** | — | **not yours.** Ask the human approver. |

Useful `error:` lines and what they mean:

| Error | Meaning → what to do |
|---|---|
| `illegal transition <from> -> <to> for type '<type>'` | this verb cannot move the document from its current state; check `memory.yaml`. A gated state needs approval → ask a human |
| `user not authorized to approve type '<type>'` | you tried to approve; stop and ask a human |
| `refusing to commit <file>: it carries uncommitted modifications …` | commit your edits separately first, or undo them |
| `missing required field on submit: <field>` | fill the frontmatter field, then submit again |
| `unknown memory type '<t>' … not committed …` | configuration was edited but not committed |
| `E_NOT_AT_GIT_ROOT` | `cd` to the repository root |

## 7. Following a workflow (no engine in 0.2.2)

WingFoil 0.2.2 cannot start or track a workflow. When asked to "run" one:

1. `wingfoil workflow list` → find the workflow and its phases.
2. For the current phase, act in the role it names, with that role's directives loaded (§4, rule 3).
3. Record the phase's outcome as Memory documents, and move them only with the verbs in §6.
4. At a phase that requires approval, stop and hand over to the human approver.

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

## 9. Known limits in 0.2.2

- No workflow engine (§7).
- No command to unassign a directive: edit `.wingfoil/roles.yaml` and commit.
- `dna show` accepts only a top-level section.
- `memory search` excludes `deprecated` documents unless you pass `--status deprecated`.
- Subcommand `--help` is a reminder: it describes the command, its argument and its options, with
  one example; for anything more, trust the [CLI reference](cli-reference.md).
