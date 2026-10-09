# WingFoil CLI reference

Every `wingfoil` command in release **0.2.2**, one entry each. For a guided, step-by-step introduction
read the [user guide](user-guide.md); for runnable scenarios see [`examples/`](examples/).

> This reference is checked against the CLI by `test/docs/cli-reference.test.ts`: every shipped command
> has exactly one `### wingfoil …` entry below, and no entry documents a command that does not ship.
> `wingfoil --help` and `wingfoil <noun> --help` list the same surface. New in 0.2.2: each command's
> `--help` opens with the first sentence of its entry, names its argument as the entry does, and shows
> one example and the exit codes.

---

## Conventions shared by every command

### Where to run it

Run `wingfoil` from the **root of a git repository** that has been initialized with `wingfoil init`.
Outside a git repository a command fails with `error: E_NO_GIT_ROOT: not inside a git repository`; in a
subdirectory it fails with `error: E_NOT_AT_GIT_ROOT: run wingfoil from the project root` (both exit `1`).

Unreleased (v0.3): a command that reads the configuration, run where there is no `.wingfoil/`, exits `1`
with `error: WingFoil not initialized (no .wingfoil/ directory at the project root): run 'wingfoil init'
first`. When `.wingfoil/` exists but lacks the file the command needs, the error names that file from
the project root — `error: .wingfoil/dna.yaml is missing: restore it from git, or re-create it (…)` —
and a file that does not validate is named the same way (`(.wingfoil/dna.yaml)`), never by its path on
your machine.

### Argument grammar

- **The positional argument is the target** — the thing the command acts on: a document id
  (`memory submit task-001-my-first-task`), a DNA path (`dna set project.name`), a section or category
  (`dna show project`, `paths sources`), a directive name (`directive remove api-style`).
- **A command takes at most one positional**, and one document per call: to approve two documents, run
  `memory approve` twice. An operand beyond the one a command declares — or any operand, on a command
  that declares none — is refused with exit `2` before anything is written:
  `wingfoil memory approve task-001 task-002 --reason ok` →
  `error: wingfoil memory approve takes one positional <id> (got 2 positionals)`.
  Unreleased (v0.3): the four `dna` path verbs refuse it the same way, from any directory, and add
  where the value goes — `error: wingfoil dna set takes one positional <path>; the value travels in
  --value (got 2 positionals)`.
- Unreleased (v0.3): **a missing positional** is refused with exit `2` in one form for every command,
  the command's usage following on a `hint:` line:
  ```
  $ wingfoil memory approve
  error: missing required argument: <id>
  hint: usage: wingfoil memory approve <id> --reason <text>
  ```
  A missing option keeps its own form, `error: missing required argument: --title`.
- The global `--format` value is checked first: an invalid one is refused before anything else,
  whatever command it is given to (Unreleased (v0.3): `init` and `mcp` too).
- **Options are attributes** — the values the command writes or filters by (`--value`, `--reason`,
  `--type`, `--role`, …).
- A **DNA path** is dotted: `project.name`, `modules.api`, `stacks.technologies.TypeScript`. A segment
  that itself contains a dot is quoted: `'stacks.technologies."Node.js"'` (quote the whole argument for
  your shell, and the segment with double quotes inside it).
- A list value is comma-separated: `--tags demo,quickstart`, `--entry-roles approver,developer`.

### Global options

Accepted by every command, except `--dry-run`, which only the commands that change the project take:

| Option | Effect |
|---|---|
| `--format <console\|json\|yaml>` | Output format. On success, `console` (default) prints the result `json` prints, indented by two spaces — it has no human rendering yet (Unreleased (v0.3): except `agent show`, which prints `key: value` lines); errors and warnings keep their `error:`/`warning:` lines on stderr. A human rendering is planned with the CLI UX work (P5.1.4, `dl-043`), and will change what the default prints. `json` prints compact single-line JSON; `yaml` prints YAML. `json`/`yaml` write only the result — nothing else — so scripts can parse stdout directly: a script should pass `--format json` rather than parse the default. |
| `--dry-run` | Unreleased (v0.3). Show the commit the command would make, and make nothing. Taken by every command that changes the project — `memory add`, `submit`, `approve`, `reject`, `deprecate`, `park`, `amend`, `dna set`, `add`, `update`, `remove`, `directive create`, `assign`, `remove`, `agent execute` — after the verb (`wingfoil memory submit task-001-my-first-task --dry-run`); any other command refuses it as an unknown option (exit `2`). The command runs all its checks, then prints `{"dryRun": true, "subject", "message", "paths", "diff"}`: the commit subject, its full message, the files it would contain, and the unified diff from the last commit — and exits `0`, leaving the working tree, the index and the branch untouched. If the real run would be refused, the dry run is refused the same way, with the same exit code; the warnings the real run would print are printed too, a rewrite warning worded as a plan (`dna.yaml would be rewritten as a whole file (--force): …`). The diff is of what the commit would store — after your `core.autocrlf` or `.gitattributes` line-ending conversion — and is laid out with git's default diff settings, whatever your own git configuration says, so `git show` with a customized `diff.*` configuration can group the same changes into different hunks. It does not run git hooks, and for a `memory approve` that also moves a superseded document it shows only the approve commit. `agent execute` prints the launch it would make instead, with no `message` or `diff`: its commit records how the agent's run ended, which cannot be known beforehand (see [`agent execute`](#wingfoil-agent-execute)). |
| `--verbose` | Emit diagnostic logs to stderr. |
| `--no-color` | Disable ANSI colors. Accepted, but no output is colored yet, so it changes nothing; neither does the `NO_COLOR` environment variable. Both will apply once `console` has a colored rendering (P5.1.4, `dl-043`). |
| `--no-interactive` | Fail on a missing argument instead of prompting for it. |
| `-h`, `--help` | Show help for the command. |
| `-V`, `--version` | Print the version (top level only). Unreleased (v0.3): prints `<version> (<commit>)`, e.g. `0.3.0 (4f1c2d9b7e3a5c80d61f2a94b7c3e5d08a1f9e9a)` — the commit the build was made from, as every commit it writes records it. |

### Exit codes

Every invocation ends with exactly one of three codes:

| Code | Meaning | Example |
|---|---|---|
| `0` | Success — including a search that matches nothing | `wingfoil memory search nothingmatches` |
| `1` | The request was well-formed but cannot be carried out | `wingfoil memory submit task-999-nope` → `error: document not found: task-999-nope` |
| `2` | The command line itself is wrong: unknown command, missing or blank argument, invalid value | `wingfoil memory add --type task` → `error: missing required argument: --title` |

A non-zero exit always prints one `error: <reason>` line to stderr — or, under `--format json`/`yaml`,
the object `{"error": "<reason>"}`, whichever part of the CLI refused (an unknown command or option too).
A suggestion follows on a `hint:` line (the object's `hint` field). Unreleased (v0.3): an unknown command
within two edits of a known one is answered in that form —
`error: unknown command 'memroy'` then `hint: did you mean "memory"?` — where it used to print
`(Did you mean memory?)`.
When the refusal names a file or explains itself, indented lines follow the `error:` line, one per
finding (`<file>: <detail>`); under `--format json`/`yaml` they are a `details` array of
`{"file", "detail"}` entries beside `error`.

Unreleased (v0.3): when a Memory verb cannot move a document from its current state, the line is
`error: illegal transition <from> -> (none) for type '<type>'` — the verb reaches nothing from
`<from>` — and the indented line under it says why (a gate that needs `memory approve`, a state only a
workflow moves on, the last state). 0.2.x printed, in place of `(none)`, a state the verb reaches from
somewhere else in the machine, which could read as a backward move (`planned -> triaged`).

Unreleased (v0.3): a command that succeeds can also print **warnings** — something it did that you
should know about, such as `directive assign --force` or `dna add --force` rewriting a whole file. A warning goes to stderr
only, as a `warning: <text>` line, or under `--format json`/`yaml` as one `{"warning": "<text>"}`
document per warning (under `yaml`, each closed by `...`, so a following error is a separate
document). Stdout is the same with or without warnings, so a script parsing it is not affected.

### Git side effects

Every command that changes the project writes **exactly one git commit**, authored by your git identity.
Read-only commands never commit. Unreleased (v0.3): if git refuses that commit — a `pre-commit` hook
that fails, a full disk, another git command holding the index lock — the command puts back every file
it wrote (removing the files and folders it created), and the index, as they were, and
fails (exit `1`) with `error: E_COMMIT_FAILED: git did not commit <paths>: <git's explanation> — nothing
was committed, and the working tree and the index are as they were`. A `memory add` you retry gets the
same id; 0.2.x left the new file written and staged. The commit subject is listed per command below; `wingfoil memory
history` reads the Memory ones back.

Unreleased (v0.3): every such commit ends with a paragraph naming the WingFoil build that wrote it,

```
WingFoil-Version: 0.3.0 (4f1c2d9b7e3a5c80d61f2a94b7c3e5d08a1f9e9a)
```

the same value `wingfoil --version` prints: the package version, then the full commit hash the build
was made from (with `-dirty` when the build had uncommitted changes to its own inputs — the sources,
`package.json`, `package-lock.json`, a `tsconfig` or `scripts/write-build-info.cjs` — and `unknown` when the build recorded none). A commit without that line was not written by WingFoil. Read it with
`git log --format='%(trailers:key=WingFoil-Version,valueonly)'`. The commit body is also normalized
the same way whatever your git `commit.cleanup` setting (trailing whitespace removed, runs of blank
lines collapsed, lines starting with `#` kept).

Which state a command reads depends on whether that state can stop it:

- **Commands that change the project read the configuration as committed at `HEAD`** — `memory add`,
  `submit`, `approve`, `reject`, `deprecate`, `park`, `amend`, the `dna` verbs `set`, `add`, `update`,
  `remove`, and `directive assign`. If you edit `dna.yaml`, `memory.yaml` or `roles.yaml` by hand,
  commit it before running the command that depends on it — otherwise the command fails and says the
  change is not committed.
- **Read-only commands read the working tree** — `dna show`, `paths`, `directives list`,
  `memory search`, `memory history`, and the MCP server's Resources. They show what
  is on disk, uncommitted edits included: a draft you have not committed is exactly what
  `memory search` should find. So `memory add --type <t>` can refuse a type your working copy of
  `memory.yaml` declares, while `memory search` searches the documents that same working copy
  declares — the type is on disk and in no commit; commit `memory.yaml` and the two agree.
- Unreleased (v0.3): **`agent execute` reads `HEAD`** like the other commands that write: the
  commit it reads becomes the run's `state_ref`.
- Unreleased (v0.3): **`agent show` reads `HEAD`**, though it changes nothing: it answers from the
  same commit as the run ids `agent execute` counts, and when only your working tree holds the run it
  is asked for, it says so on a `hint:` line instead of showing it.
- Unreleased (v0.3): **`workflow list` and `workflow show` read `HEAD`**, though they change nothing:
  they answer from the same commit as the other workflow commands, and an uncommitted change to a file
  they read is reported as a `W_UNCOMMITTED_INPUTS` warning instead of being used.
- **Safety checks on the file about to be written or deleted look at the disk itself** — for
  example, whether a path leads outside the project through a symbolic link — because that is what
  the write will follow.

The Memory transition verbs (`submit`, `approve`, `reject`, `deprecate`, `park`, `amend`) find the document
their `<id>` names, and read its current status, as committed at `HEAD`; what `submit` and `amend`
commit is the file in your working tree. A document you created by hand and never committed is
refused (exit `1`) with a message naming `memory add`, and editing `status` by hand does not change
which transition runs. One known defect breaks this rule today: `directive remove` looks up the
directive to delete in the working tree (`bug-108`).

### Git identity

Every command that commits requires a git identity — usually `git config user.name` and
`git config user.email`. Before it reads or writes anything else, it checks that both identities a
commit carries resolve, the way git itself resolves them:

- the **author** from `GIT_AUTHOR_NAME` / `GIT_AUTHOR_EMAIL`, then `author.name` / `author.email`,
  then `user.name` / `user.email`;
- the **committer** from `GIT_COMMITTER_NAME` / `GIT_COMMITTER_EMAIL`, then `committer.name` /
  `committer.email`, then `user.name` / `user.email`.

A variable that is set but blank does not fall back to the config: git refuses a blank name and
records a blank email as `<>`; the check refuses both. Git's `EMAIL` variable and its hostname guess are not used. If any of the four values is missing, the command exits `1` with
`git identity not configured (user.name/user.email)`; if one contains `<`, `>` or a control character,
it exits `1` with `git identity not usable: …`. Either way nothing is written.

`memory approve`, `memory reject` and `memory amend` additionally require the author's email to
belong to a `team.members` entry holding the `approver` role in the committed `dna.yaml` (see
[`memory approve`](#wingfoil-memory-approve)). The `memory` commands that move or amend a document
use that one author identity for the approver check, the `Approver:` line and the commit's author,
so the three never disagree.

---

## Setup

### `wingfoil init`

Scaffold `.wingfoil/` in the current git repository and commit it.

```
wingfoil init [--template <Scrum|Kanban>]
```

| Option | Description |
|---|---|
| `--template <name>` | Methodology template: `Scrum` or `Kanban` (`init --help` lists them). Omit it in a terminal to be prompted; required without a terminal or with `--no-interactive`. |

Creates `.wingfoil/dna.yaml`, `memory.yaml` (+ `memory/templates/`), `roles.yaml`, the six built-in
directives in `directives/built-in/` plus four starter custom directives in `directives/custom/`,
`workflows.yaml` (+ `workflows/custom/`), and `agents/built-in/` (the built-in agent adapters; none ships
yet) with an empty `agents/custom/`. The two templates differ only in the delivery sub-workflow
(`scrum-delivery` vs `kanban-delivery`) and in `project.methodology` / `stacks.methodologies`.

- **Output:** `{ root, template, files: [...] }` — the files it created.
- **Commit:** `chore(wingfoil): initialize .wingfoil/ with the <Template> template (P5.1.1)`
- **Errors:** already initialized → exit `1` (`error: WingFoil already initialized (to change its
  configuration, edit the files under .wingfoil/ and commit them, or use the wingfoil dna and wingfoil
  directive commands)`); `--template` omitted without a terminal or with `--no-interactive` → exit `2`
  (`error: missing required argument: --template (one of: Scrum, Kanban)`); unknown template → exit `2`
  (`error: unknown template "Foo", expected one of: Scrum, Kanban`); not a git repository → exit `1`.

### `wingfoil mcp`

Start the WingFoil MCP server (read-only Resources and role Prompts) over stdio. Meant to be launched
by an MCP client, not typed by hand.

```
wingfoil mcp
```

Exposes the project **read-only**: Resources for DNA, Memory and workflows, and one Prompt per role
(`<role>-session`) embedding that role's directives. It exposes no Tools — every write goes through the
CLI. See the [user guide §9](user-guide.md#9-connect-an-ai-agent) for client configuration and the
full Resource list.

Unreleased (v0.3): `tools/list` answers an empty list instead of a protocol error. Before serving, the
server checks the project and reads the role set from `dna.yaml`; the role set then holds until the
server restarts (a change of directive assignments shows on the next Prompt request). With no
`.wingfoil/` at the project root it exits `1` without starting: `error: WingFoil not initialized (no
.wingfoil/ directory at the project root): run 'wingfoil init' first`. A `dna.yaml` that cannot be
loaded also exits `1`, with the reason. The `<role>-session` Prompts take two optional arguments,
`element="<type>:<id>"` and `state="<commit>"` (any name of one commit; a sha is recommended), given together: the Prompt then returns the
execution context for that element at that commit. Memory Resource reads and those Prompts report the
documents that could not be read in a `warnings` array beside the content.

---

## DNA — the project's structural map

`dna.yaml` holds `project`, `modules`, `stacks` (`technologies`, `methodologies`), `team` (`members`,
`roles`, `agents`) and `paths`. **Scalar** fields are written with `dna set`; **collections and lists**
with `dna add` / `dna update` / `dna remove`.

**Comments are kept, or the write is refused** (Unreleased (v0.3)). The four write commands edit
`dna.yaml` in place: only the lines of the field or entry they change are written, and every comment
stays. This now includes the first entry of a collection the file does not list yet (the first
`team.agents` entry), a field whose value is a `>-` or `|` block, and a file with CRLF line endings,
which 0.2.2 rewrote without a single comment. A file whose every line ends in CRLF keeps CRLF in your
working tree, with `core.autocrlf` set to `true` or `false`; the commit stores it as that setting says
(LF under `true`). When a change still cannot be made in place (for
example, `paths` is written inline as `paths: { sources: [src/] }` and you add `paths.tests`), the
command exits `1`, writes nothing, and says
`error: dna.yaml cannot be updated in place; edit <path> by hand, or pass --force to rewrite the whole file`.
**`--force`** allows that rewrite: the whole file is written again from its parsed content, in the
same one commit, and a warning on stderr names what was not kept:
`warning: dna.yaml was rewritten as a whole file (--force): comments are not kept, and neither are quoting, flow style, blank lines, line endings or number formatting (1.0 becomes 1)`.
`--force` changes nothing when the in-place edit works.

### `wingfoil dna show`

Print `dna.yaml`, or one top-level section of it.

```
wingfoil dna show [<section>]
```

`<section>` is a top-level key: `project`, `modules`, `stacks`, `team`, `paths`. Deeper paths are not
accepted here — `dna show team.members` fails with `error: no DNA key named 'team.members'`.

```console
$ wingfoil dna show project
{
  "name": "My Project",
  "description": "",
  "methodology": "Scrum"
}
```

- **Commit:** none.
- **Errors:** unknown section → exit `1`.

### `wingfoil dna set`

Set one scalar field.

```
wingfoil dna set <path> --value <value> [--force]
```

```console
$ wingfoil dna set project.name --value "My Project"
{
  "key": "project.name",
  "value": "My Project"
}
```

- **Commit:** `wf(dna): set <path>`
- **Errors:** `<path>` names a collection or list → exit `1`, pointing you to `dna add|remove|update`;
  a change that cannot be made in place → exit `1` unless `--force` (see above).
- **`--force`** — allow the whole-file rewrite of `dna.yaml` when the in-place edit cannot apply; the
  success then carries the warning above.

### `wingfoil dna add`

Add an entry to a collection, or values to a list.

```
wingfoil dna add <path> --value <name-or-values> [--entry-<field> <value> ...] [--force]
```

- When `<path>` is a **collection** (`modules`, `stacks.technologies`, `stacks.methodologies`,
  `team.members`, `team.roles`, `team.agents`), `--value` is the new entry's `name` and the
  `--entry-<field>` options set its other fields.
- When `<path>` is a **list** (`paths.sources`, …), `--value` is the value(s) to append,
  comma-separated.

| Collection | Fields (`--entry-<field>`) |
|---|---|
| `modules` | `description`, `path` |
| `stacks.technologies` | `category` (required), `version`, `notes` |
| `stacks.methodologies` | `phase`, `notes` |
| `team.members` | `email`, `roles` (comma-separated) |
| `team.roles` | `description` |
| `team.agents` | `email` (one address, `local@domain.tld`: the agent's `Co-Authored-By:` identity, by default the vendor's published address; a GitHub noreply address must be id-qualified, `<id>+<login>@users.noreply.github.com`; not on a reserved top-level domain, `.test`/`.example`/`.invalid`/`.localhost`, nor on git's guessed `.(none)` domain; required when the entry has an `adapter`), `executes_as` (comma-separated), `approval_authority` (`true`/`false`), `adapter` (the agent's adapter name: lowercase letters, digits, `-` and `.`) |

```console
$ wingfoil dna add team.members --value "Ada Lovelace" --entry-email ada@example.com --entry-roles approver,developer
{
  "key": "team.members",
  "value": "Ada Lovelace"
}
$ wingfoil dna add paths.sources --value src
{
  "key": "paths.sources",
  "value": "src"
}
```

- **Commit:** `wf(dna): add <path> <value>`
- **Errors:** a field the collection does not declare → exit `1`
  (`error: '--entry-executes_as' is not a field of 'team.members' entries; they carry --entry-email, --entry-roles`);
  a required field missing → exit `1` (`error: an entry of 'stacks.technologies' requires --entry-category`);
  an entry of that name already in the collection → exit `1`, nothing written
  (`error: 'modules' already carries an entry named 'core' — …`; for `team.roles`,
  `error: role already defined: reviewer`).
- **`--force`** — allow the whole-file rewrite of `dna.yaml` when the in-place edit cannot apply
  (see above). The first `team.agents` entry no longer needs it: it is added in place.
- A role added to `team.roles` is usable as soon as the command returns, because its commit is what
  `directive assign` reads: `wingfoil directive assign --directive <name> --role <role>` accepts it next. A role you add to
  `dna.yaml` by hand is refused until you commit it.

### `wingfoil dna update`

Change fields of an existing collection entry.

```
wingfoil dna update <collection>.<name> [--entry-<field> <value> ...] [--force]
wingfoil dna update <collection>.<name>.<field> --value <value> [--force]
```

The second form sets one field of an entry; `dna set` on the same path is equivalent for a scalar
field (`dna set 'stacks.technologies."Node.js".version' --value 24`).

```console
$ wingfoil dna update modules.api --entry-description "Public HTTP API"
{
  "key": "modules.api"
}
```

- **Commit:** `wf(dna): update <path>`
- **Errors:** no entry with that name → exit `1` (`error: no entry named 'x' in 'modules'`).
- **`--force`** — allow the whole-file rewrite of `dna.yaml` when the in-place edit cannot apply (see above).

### `wingfoil dna remove`

Remove a collection entry, or values from a list.

```
wingfoil dna remove <collection>.<name> [--force]
wingfoil dna remove <list-path> --value <values> [--force]
```

```console
$ wingfoil dna remove 'stacks.technologies."Node.js"'
{
  "key": "stacks.technologies.\"Node.js\""
}
$ wingfoil dna remove paths.docs --value README.md
{
  "key": "paths.docs",
  "value": "README.md"
}
```

- **Commit:** `wf(dna): remove <path>[ <value>]`
- **Errors:** no such entry → exit `1`.
- **`--force`** — allow the whole-file rewrite of `dna.yaml` when the in-place edit cannot apply (see above).

### `wingfoil paths`

Print the resource paths declared in `dna.yaml` `paths:`.

```
wingfoil paths [<category>] [--list]
```

`<category>` is `sources`, `tests`, `docs`, `config`, `governance` or `runs`. Without it the whole
map is printed. `--list` is accepted for a planned drill-down view, but in this release it does not
change the output.

`runs` is the directory of the agent run log, and it holds exactly one entry: a `dna.yaml` that
declares none or two is refused, naming `paths.runs`. `wingfoil init` scaffolds it as `docs/runs/`;
change it with `wingfoil dna update paths.runs --value <dir>`.

```console
$ wingfoil paths sources
{
  "category": "sources",
  "paths": [
    "src"
  ]
}
```

- **Commit:** none.

---

## Memory — documents with a state machine

A Memory document is a Markdown file with YAML frontmatter. Its **type** (declared in `memory.yaml`)
fixes its path, its id pattern, its template and its state machine; its **state** is the `status:` field
of its frontmatter. The verbs below are the only supported way to change a state.

Unreleased (v0.3): the transition verbs (`submit`, `approve`, `reject`, `deprecate`, `park`, `amend`) look an
id up among the documents committed at `HEAD`. A committed document whose frontmatter is not valid
YAML, or a symbolic link, no longer stops a verb acting on a different document. It is skipped, and the
verb still succeeds, printing a `W_MEMORY_UNREADABLE` warning on stderr that names the file. If the id
is not found and such a document was skipped, the refusal is still `error: document not found: <id>`
(exit `1`). A second sentence then names each skipped `HEAD:<path>`, because the id may be in one of
them.

### `wingfoil memory add`

Create a document in its type's initial state (the first state of its sequence; `draft` by default) from the type's template.

Unreleased (v0.3): the initial state is the first state of the type's `sequence` in the committed
`memory.yaml` (or of `defaults.states` for a type with no machine of its own); until then `add` wrote
`draft` whatever the machine (`bug-214`). When that state declares a WIP limit (`limits:`, see
[`memory park`](#wingfoil-memory-park)) that its documents have reached, `add` is refused at exit `1`.

```
wingfoil memory add --type <type> --title <title> [--tags <t1,t2>] [--set <name>=<value> ...]
```

```console
$ wingfoil memory add --type task --title "My first task" --tags demo,quickstart
{
  "id": "task-001-my-first-task",
  "path": "docs/memory/task/task-001-my-first-task.md"
}
```

| Option | Description |
|---|---|
| `--type <type>` | The Memory type, as the committed `memory.yaml` declares it. Required. |
| `--title <title>` | The document title; also the source of the `{slug}` token. Required. |
| `--tags <t1,t2>` | Comma-separated tags, written as the `tags` list. |
| `--set <name>=<value>` | New in 0.2.2. Repeatable. Gives the `id_pattern` or `path` token `{name}` its value and writes the frontmatter field `name`, so the id and the field agree. |

The id comes from the type's `id_pattern`. For `task-{n}-{slug}` that is a per-type counter plus a
slug of the title. The slug keeps a `.` between two letters or digits (`v0.2` stays `v0.2`); every
other run of non-alphanumeric characters becomes one `-`.

Any other token in the pattern names a frontmatter field, and you give its value with `--set`. A
`release` type with `id_pattern: "{kind}-{version}"` and `path: "docs/04_memory/planning/rl-{release-line}/{id}.md"`
(a token may share a path segment with literal text, here the release-line id prefix `rl-`):

```console
$ wingfoil memory add --type release --title "v0.2.3" --set kind=patch --set version=v0.2.3 --set release-line=v1
{
  "id": "patch-v0.2.3",
  "path": "docs/04_memory/planning/rl-v1/patch-v0.2.3.md"
}
```

The workflow tokens `{workflow}`, `{phase}` and `{scope}` are given the same way. They are written
to the frontmatter only where the type's template has a field of that name.

Two tokens are never given with `--set`. `{date}` is the UTC date, as `YYYYMMDD`, of the add
commit's author date: today (UTC), or the date in `GIT_AUTHOR_DATE` when that is set. The commit is
recorded with the same date. `{author}` is the git author name, slugged like the title. The counter
token `{n}` is padded to three digits; `{n:N}` pads to `N` digits instead, and `{n:1}` not at all.

- **Commit:** `wf(<type>): add <id>`
- **Errors:**
  - Exit `2`: a missing `--type` or `--title`. Also a `--set` with no `=`, a name that is not a field
    name (`[a-z][a-z0-9_-]*`, so no dots), a blank value, or the same name twice. So is a name
    `memory add` fills itself: `id`, `type`, `status`, `title`, `tags`, `n`, `slug`, `date`, `author`.
  - Exit `1`: a type not in the committed `memory.yaml`. Also a `--set` name the type's `id_pattern`
    and `path` do not use, or a token left without a value
    (`missing value for token {version}: give it with --set version=<value>`). Also, for a pattern
    with `{author}`, a git author name with no letter or digit in `a-z0-9`
    (`value for token {author} is empty once the git author name "李明" is slugged`), and, for a
    pattern with `{date}`, a `GIT_AUTHOR_DATE` git cannot parse
    (`E_GIT_READ_FAILED: git var GIT_AUTHOR_IDENT failed in <root>: fatal: invalid date format: <value>`).

### `wingfoil memory submit`

Move a document one step forward along its type's sequence — for the default machine, `draft → pending`.

```
wingfoil memory submit <id>
```

Before running it, fill the document's body and every frontmatter field its type lists in
`template.frontmatter.required` — you do not need to commit those edits first: the submit commit
records the document's content **and** its state change together. A submit also clears a previous
`rejection_reason`.

Unreleased (v0.3): a required field that does not apply to this document can hold
`n/a — <reason>` (`n/a`, an em dash, then the reason; any letter case; quoting the value is
recommended) — but only if the type lists the field in `template.frontmatter.not_applicable_allowed`
in `memory.yaml`.

Unreleased (v0.3): a list, an explicit empty list (`features: []`) included, counts as filled only
on a field the type declares in `template.frontmatter.lists` in `memory.yaml`. On any other required
field a list or a mapping counts as missing. An empty value (`features:`) is always missing.

```console
$ wingfoil memory submit task-001-my-first-task
{
  "id": "task-001-my-first-task",
  "path": "docs/memory/task/task-001-my-first-task.md",
  "from": "draft",
  "to": "pending"
}
```

- **Commit:** `wf(<type>): submit <id>`, with no `[from → to]` bracket. Unreleased (v0.3): when the
  document carries edits beyond the state move, the commit body says which, in one line — the
  frontmatter fields that changed, sorted by name, then the body:

  ```
  wf(task): submit task-001-my-first-task

  Carries content: frontmatter field 'title', the body
  ```

  A submit that only moves `status` (and clears `rejection_reason`) has no such line. The edits are
  measured against the document as committed at `HEAD`, with line endings normalized, so a CRLF
  working tree under `core.autocrlf` is not content; a change of line endings that git would commit
  is declared as `the line endings`, after any other item.
- **Errors:** unknown id → exit `1`; the current state is a **gate** (its forward step needs
  `memory approve`) or the end of the sequence → exit `1` (`error: illegal transition …`); a required
  field is empty → exit `1` (`error: missing required field on submit: <fields>`). Unreleased (v0.3):
  a required field holds `n/a` but the type does not list it, holds it with no reason, or separates
  the reason with anything but an em dash → exit `1`, naming the field
  (`error: not-applicable value on submit: <field> …`).

### `wingfoil memory approve`

Pass a gate: move a document forward from a gated state (default machine: `pending → approved`).

```
wingfoil memory approve <id> --reason <text>
```

Requires the **approver role**: your git email must match a `team.members` entry whose `roles` include
`approver`, in the committed `dna.yaml`:

```console
$ wingfoil dna add team.members --value "Ada Lovelace" --entry-email ada@example.com --entry-roles approver
$ wingfoil memory approve task-001-my-first-task --reason "Scope and acceptance criteria are clear."
{
  "id": "task-001-my-first-task",
  "path": "docs/memory/task/task-001-my-first-task.md",
  "from": "pending",
  "to": "approved"
}
```

- **Commit:** subject plus body

  ```
  wf(task): approve task-001-my-first-task [pending → approved]

  Approver: Ada Lovelace <ada@example.com> (approver)
  Reason: Scope and acceptance criteria are clear.
  ```

Unlike `submit`, `approve` (and `reject`, `deprecate`) records the state change **and nothing else**:
if the document has uncommitted edits the command refuses (exit `1`, `error: refusing to commit …`) —
commit or stash them first.

- **Errors:** missing `--reason` → exit `2`; blank `--reason` → exit `2`
  (`error: invalid flag value: --reason must not be blank`); not an approver → exit `1`
  (`error: user not authorized to approve type 'task'`); the state is not a gate → exit `1`
  (`error: illegal transition draft -> (none) for type 'task'`; 0.2.x prints `draft -> backlog`, see
  [Exit codes](#exit-codes)).

Unreleased (v0.3): **`supersedes:`**. When an `adr` is approved into `accepted`, or a `tech-spec`
into `approved`, and its `supersedes:` field names another element of the same type, that element
moves to `superseded`. The move is a second commit, made right after the approve. It changes only
that element's `status`:

```
wf(adr): finalize adr-1-old [accepted → superseded]

Reason: superseded by adr-2-new (its supersedes: field), approved in <sha of the approve commit>.
```

The result then has a `superseded` entry (`id`, `path`, `from`, `to`). The approve is refused with
exit `1`, and neither commit is written, when the named element does not exist, is of another type,
is not `accepted` (`approved` for a `tech-spec`), or has uncommitted edits:
`error: cannot approve adr-2-new: its supersedes: field names adr-9, which cannot be superseded: document not found: adr-9`.
Leave `supersedes:` empty when nothing is replaced. A `superseded` element can still be deprecated.
`supersedes:` holds the element's **full id** (`adr-2-git-backed-storage`); a short form such as
`adr-2` is not resolved, and the approve is refused with `document not found`.

Unreleased (v0.3): a project scaffolded by `wingfoil init` has neither half of the trigger. Its `adr`
and `tech-spec` templates have no `supersedes:` field, and its `memory.yaml` gives every type the
default machine, which has no `superseded` state; their template comments say so. To use the trigger,
add `supersedes: ""` to the type's template and give the type its own `states:` whose `sequence` ends
in a state listed in `gates`, then an approved state listed in `waiting`, then `superseded`. The
trigger fires only when `memory approve` lands in that `waiting` state, and `approve` moves a document
only out of a gate. Otherwise retire the replaced element with
`memory deprecate`, naming its replacement in `--reason`.

The approve reads `supersedes:` as committed, so it cannot be corrected in place. If it names an
element that can no longer be superseded, for example one already `deprecated`, the approve is
refused every time. Reject the element back to `draft`, fix or empty `supersedes:`, then submit and
approve it again.

One exit-`1` case does leave a commit behind: the approve commit lands, and then git fails on the
second commit (a commit hook refuses it, the disk is full). The error says so and names the approve
commit. The superseded element's new `status` is left in the working tree. The error ends with the
command that completes the pair, ready to paste:

```
git commit --only -F - -- docs/adrs/adr-1-old.md <<'EOF'
wf(adr): finalize adr-1-old [accepted → superseded]

Reason: superseded by adr-2-new (its supersedes: field), approved in <sha of the approve commit>.
EOF
```

### `wingfoil memory reject`

Send a gated document back to its gate's reject target (default machine: `pending → draft`).

```
wingfoil memory reject <id> --reason <text>
```

Same approver requirement as `approve`. The reason is recorded in the commit **and** copied to the
document's `rejection_reason` frontmatter field.

```console
$ wingfoil memory reject task-001-my-first-task --reason "Add acceptance criteria before resubmitting."
{
  "id": "task-001-my-first-task",
  "path": "docs/memory/task/task-001-my-first-task.md",
  "from": "pending",
  "to": "draft",
  "reason": "Add acceptance criteria before resubmitting."
}
```

- **Commit:** `wf(<type>): reject <id> [<from> → <to>]` with `Approver:` and `Reason:` body lines.
- **Errors:** as for `approve`.

### `wingfoil memory deprecate`

Retire a document, from any state, to `deprecated`.

```
wingfoil memory deprecate <id> [--reason <text>]
```

No approver role is required. `--reason` is optional, but when given it must not be blank.

```console
$ wingfoil memory deprecate dl-001-use-postgresql --reason "Superseded by the hosted-DB decision."
{
  "id": "dl-001-use-postgresql",
  "path": "docs/memory/decision-log/dl-001-use-postgresql.md",
  "from": "draft",
  "to": "deprecated",
  "reason": "Superseded by the hosted-DB decision."
}
```

- **Commit:** `wf(<type>): deprecate <id> [<from> → deprecated]`, with a `Reason:` body line when given.

### `wingfoil memory park`

Return a started document to an earlier state along its type's declared `returns` edge (for a `task`, `in-progress → backlog`).

**Unreleased (v0.3)** — not in 0.2.2.

```
wingfoil memory park <id> --reason <text>
```

A type's state machine in `memory.yaml` may declare return edges next to `gates` and `waiting`:
`returns: { in-progress: backlog }`. Each target must be an earlier state of the `sequence`. `park`
takes that edge: the work is not being done now, which is not the same as rejecting it. `--reason` is
required. No approver role is required.

```console
$ wingfoil memory park task-001-my-first-task --reason "Blocked on the schema decision; back to the backlog."
{
  "id": "task-001-my-first-task",
  "path": "docs/memory/task/task-001-my-first-task.md",
  "from": "in-progress",
  "to": "backlog",
  "reason": "Blocked on the schema decision; back to the backlog."
}
```

- **Commit:** `wf(<type>): park <id> [<from> → <to>]` with a `Reason:` body line; `wingfoil memory
  history` reports it as `"operation": "park"`.
- **WIP limits.** A machine may also declare `limits: { in-progress: 3 }`: at most that many documents
  of the type in that state. Every command that moves a document into a limited state (`add`, `submit`,
  `approve`, `reject`, `park`) is refused at exit `1` once the limit is reached, before anything is
  written, and the message names the documents holding the state:
  `error: WIP limit reached for 'in-progress' on type 'task' (limit 3): held by task-004-…, task-007-…, task-009-…. Move one of them out of 'in-progress', then retry.`
- **Errors:** missing or blank `--reason` → exit `2`; the document's state declares no `returns` edge →
  exit `1` (`error: illegal transition in-review -> (none) for type 'task'`); the target state is at
  its WIP limit → exit `1`.

### `wingfoil memory amend`

Record an uncommitted correction to a document as an amendment, leaving its state unchanged.

**Unreleased (v0.3)** — not in 0.2.2.

```
wingfoil memory amend <id> --reason <text>
```

Edit the document first (its body, or any frontmatter field except `status`, `id`, `type`, `release`,
`rejection_reason` and `supersedes`), then
run `amend`: it commits that edit, and only that file, as one recorded operation. It is the verb for a
correction to an element no other verb can move, such as an `approved` tech-spec. Same approver
requirement as `approve`. The type must declare `amendable: true` in the committed `memory.yaml`;
absent means not amendable. A project created by `wingfoil init` declares it for `tech-spec`,
`decision-log`, `task`, `bug` and `adr` (for a dated correction note: a
changed decision is a new ADR), and declares `false` for `release` and `release-line`.
`release` is fixed only on a type whose scaffold, as committed, declares a `release` field. On any
other type an amendment may remove a `release` key, as when a `service`'s set-up release moves to
`set_up_in`.

```console
$ wingfoil memory amend spec-001-storage-layout --reason "Later measurements corrected the §2 figures."
{
  "id": "spec-001-storage-layout",
  "path": "docs/memory/tech-spec/spec-001-storage-layout.md",
  "from": "approved",
  "to": "approved"
}
```

- **Commit:** subject plus body; `wingfoil memory history` reports it as `"operation": "amend"`

  ```
  wf(tech-spec): amend spec-001-storage-layout [approved → approved]

  Approver: Ada Lovelace <ada@example.com> (approver)
  Reason: Later measurements corrected the §2 figures.
  ```

Other modified or staged files are left as they are and are not committed.

- **Errors:** missing or blank `--reason` → exit `2`; the document has no uncommitted change, or is not
  committed at all → exit `1`; the edit changes one of those six fields → exit `1`, naming the field;
  past `draft`, the edit empties `title` or a required field → exit `1`
  (`error: missing required field on amend: <fields>`), or (Unreleased (v0.3)) sets a not-applicable
  value the type does not allow on that field → exit `1` (`error: not-applicable value on amend: <field> …`);
  the type is not amendable → exit `1` (`error: type 'release' is not amendable: …`); not an approver →
  exit `1` (`error: user not authorized to approve type 'tech-spec'`).

#### Rules for `--reason` (approve, reject, deprecate, park, amend)

- It may span several lines, but it may not be blank.
- No line of it may begin with `Approver:` or `Reason:` — those keys are reserved for the commit trailer.
  Unreleased (v0.3): `WingFoil-Version:` is reserved too, and all three keys are matched in any letter
  case.
- It may not end with a paragraph made only of `Key: value` lines; end with a sentence instead.
  Unreleased (v0.3): the refusal says so (`… add a closing sentence after it, or fold those lines into
  prose`).
- Unreleased (v0.3): it may not contain a control character other than tab and newline. That covers
  the C0 controls, DEL (U+007F), the C1 controls (U+0080 to U+009F) and the Unicode line and paragraph
  separators (U+2028, U+2029). The refusal exits `2` and names the first one by code point, e.g.
  `error: invalid flag value: --reason must not contain a control character other than tab or newline
  (found U+001B)`.
- Trailing whitespace is stripped, runs of blank lines collapse to one, and leading/trailing blank lines
  are dropped.

### `wingfoil memory history`

Print a document's audit trail, reconstructed from git.

```
wingfoil memory history <id>
```

Each entry carries `sha`, `author`, `timestamp` (ISO-8601), `operation`, `from`, `to`, `approver`,
`reason` and the commit `subject`. Unreleased (v0.3): every entry also carries `wingfoil`, the build
that wrote the commit, from its `WingFoil-Version:` line (see [Git side effects](#git-side-effects)):
`"wingfoil": "0.3.0 (4f1c2d9b7e3a5c80d61f2a94b7c3e5d08a1f9e9a)"`, or `null` for a commit written by
hand or by an older build. In 0.2.2, `operation` is one of `add`, `submit`, `approve`,
`reject`, `deprecate`. A commit that touched the document without being one of them appears too,
with `"operation": null` (a hand edit you committed yourself, for example).

Unreleased (v0.3): `operation` is one of eleven declared verbs, the five above plus `start`,
`finalize`, `sync`, `amend`, `park` and `assign`. A subject with any other verb reads as `null`, and so does a
configuration commit such as `wf(dna): …`, `wf(directive): …` or `wf(workflow): …`, whatever its
verb.

```console
$ wingfoil memory history task-001-my-first-task
{
  "id": "task-001-my-first-task",
  "path": "docs/memory/task/task-001-my-first-task.md",
  "entries": [
    {
      "sha": "cc871612ce9ec0120644e97e4a6281b552b99b02",
      "author": "Ada Lovelace <ada@example.com>",
      "timestamp": "2026-09-25T16:56:39+02:00",
      "operation": "add",
      "from": null,
      "to": "draft",
      "approver": null,
      "reason": null,
      "subject": "wf(task): add task-001-my-first-task"
    },
    …
    {
      "sha": "ef9669e07a182feb3bddc964aa1d7a2e16f7e7f2",
      "author": "Ada Lovelace <ada@example.com>",
      "timestamp": "2026-09-25T16:56:43+02:00",
      "operation": "approve",
      "from": "pending",
      "to": "approved",
      "approver": "Ada Lovelace <ada@example.com> (approver)",
      "reason": "Scope and acceptance criteria are clear.",
      "subject": "wf(task): approve task-001-my-first-task [pending → approved]"
    }
  ]
}
```

Unreleased (v0.3): a revision of the document whose frontmatter is not valid YAML no longer fails the
command. Its entry has `"to": null`, an extra `"unreadable"` key giving the parse error, and the next
entry's `from` is `null`. A `W_MEMORY_UNREADABLE` warning on stderr names the file and the commit. A
different Memory document whose frontmatter does not parse is skipped with the same warning.

- **Commit:** none.
- **Errors:** missing id → exit `2`; unknown id → exit `1`.

### `wingfoil memory search`

Find documents by keyword and/or metadata.

```
wingfoil memory search [<keyword>] [--type <type>] [--status <status>] [--tag <tag>]
```

The keyword is a case-insensitive substring matched against each document's title, id, tags and body
— a title/id/tag match ranks above a body-only match. It is not semantic search. The filters narrow by
frontmatter (`--type` and `--status` exactly, `--tag` exactly). With no keyword, the filters alone
browse by metadata.

```console
$ wingfoil memory search --status approved --type task
{
  "query": "",
  "matches": [
    {
      "path": "docs/memory/task/task-001-my-first-task.md",
      "id": "task-001-my-first-task",
      "title": "My first task",
      "type": "task",
      "status": "approved",
      "tags": [
        "demo",
        "quickstart"
      ]
    }
  ]
}
```

No match is still a success (exit `0`), with `"matches": []` and
`"message": "no documents matched the query"`.

Unreleased (v0.3): every match is a Memory element, with an `id` and a `type`. A Markdown file under a
Memory directory with neither, such as an old plan with no frontmatter, is left out. A file whose
frontmatter is not valid YAML, or a symbolic link, is left out too, and a `W_MEMORY_UNREADABLE` warning
on stderr names it. One bad file no longer fails the search.

- **Commit:** none.

---

## Directives — rules bound to roles

A directive is a Markdown file under `.wingfoil/directives/built-in/` (shipped by WingFoil, cannot be
removed) or `.wingfoil/directives/custom/` (yours). `roles.yaml` binds directives to roles, plus a
`global:` list that applies to every role.

### `wingfoil directives list`

List directives with the roles each is assigned to.

```
wingfoil directives list [--role <role>]
```

Each entry carries `path`, `frontmatter` (`id`, `name`, `kind`, …), `roles`, `global` and a readable
`assignment`. `--role` keeps only the directives that apply to that role, globals included.

The payload also carries `warnings`, which lists what the entries cannot show:
- an entry under `.wingfoil/directives/` that cannot be read (a symbolic link whose target does not
  exist, a file or directory without permission, a directory link back to one of its own parents),
  which is skipped and named there while the other directives are listed;
- without `--role`, every id defined by two files (and the one in force), and every directive whose
  declared `scope` contradicts `roles.yaml`'s `global:` list (`roles.yaml` decides) or is a value
  other than `global`. A directive that declares no `scope` is not reported;
- with `--role`, a role with no assignments of its own, a binding with no directive file, and
  shadowed ids.

- **Commit:** none.
- **Errors:** no `.wingfoil/` at the project root → exit `1`, `WingFoil not initialized (no .wingfoil/ directory at the project root): run 'wingfoil init' first`;
  `.wingfoil/directives/` itself unreadable, or an invalid directive file or `roles.yaml` → exit `1`.

### `wingfoil directive create`

Create a custom directive from a scaffold.

```
wingfoil directive create --name <name>
```

```console
$ wingfoil directive create --name api-style
{
  "name": "api-style",
  "path": ".wingfoil/directives/custom/api-style.md"
}
```

Then write the rule into the file's body. To adapt a **built-in** directive, create a custom one with
the same id: it takes precedence, and `directives list` reports the override.

- **Commit:** `wf(directive): create <name>`
- **Errors:** missing `--name` → exit `2`; the directive already exists → exit `1`.

### `wingfoil directive assign`

Assign one or more directives to a role in `roles.yaml`.

```
wingfoil directive assign --directive <name[,name...]> --role <role> [--force]
```

```console
$ wingfoil directive assign --directive api-style --role developer
{
  "directives": [
    "api-style"
  ],
  "role": "developer",
  "assignments": [
    "code-quality",
    "testing",
    "determinism",
    "api-style"
  ]
}
```

- **Commit:** `wf(directive): assign <name> to <role>`
- **Errors:** missing option → exit `2`; role not in the committed `dna.yaml` → exit `1`.
- **`--force`** — Unreleased (v0.3). `directive assign` edits `roles.yaml` in place, keeping its
  comments and layout. When it cannot — for example, the role's list is written inline as
  `developer: [code-quality]` — it refuses with exit `1`, writes nothing, and says
  `error: roles.yaml cannot be updated in place; edit assignments.<role> by hand, or pass --force to rewrite the whole file`.
  This applies whether or not the file has comments (0.2.2 rewrote a file without comments silently).
  `--force` allows the rewrite: the whole file is written again from its parsed content, one commit
  holds only `roles.yaml`, and a warning on stderr names what was not kept:
  `warning: roles.yaml was rewritten as a whole file (--force): comments are not kept, and neither are quoting, flow style, blank lines, line endings or number formatting (1.0 becomes 1)`.
  `--force` changes nothing when the in-place edit works. A project with no `roles.yaml` yet gets
  one written whole without the flag, since there is nothing to keep.

### `wingfoil directive remove`

Delete a custom directive.

```
wingfoil directive remove <name>
```

A directive still assigned to a role is refused
(`error: cannot remove 'api-style': still assigned to role 'developer'`). There is no unassign command
in 0.2.2: delete the name from `roles.yaml`, **commit** that change, then run `directive remove`.
Built-in directives are refused (`error: built-in directives cannot be removed`).

- **Commit:** `wf(directive): remove <name>`
- **Errors:** still assigned, built-in, or unknown → exit `1`.

---

## Workflow

### `wingfoil workflow list`

List the workflows you can run now, as committed at `HEAD`.

```
wingfoil workflow list [--all]
```

Unreleased (v0.3). Read-only. It reads the workflow files, `memory.yaml`, `dna.yaml` and the Memory
documents **as committed at `HEAD`**, not the working tree (see [Git side effects](#git-side-effects)), so
it answers from the same state as the other workflow commands. An uncommitted change to one of those inputs
does not change the answer: it is reported as a `W_UNCOMMITTED_INPUTS` warning naming the file.

Without `--all` it lists the workflows you can start (`startable`), plus an includable workflow when an
open workflow has reached a phase that includes it — `dev-loop` while a `release-cycle` is in its
development phase. An open workflow is a `plan` document in `draft` or `active` that names it (see
`workflow show`). With `--all` it lists every workflow the configuration loads. Each entry has `name`,
`startable`, `includable`, `description` and `executableNow`, sorted by name:

```console
$ wingfoil workflow list --format json
{"baseline":{"rev":"HEAD","commit":"<sha>"},"workflows":[{"name":"adr-ingest","startable":true,"includable":false,"description":"Capture a single Architectural Decision Record (ADR) into Memory.","executableNow":true}, …],"diagnostics":[…]}
```

With no `workflows.yaml` at `HEAD` it lists nothing and adds `"message": "no workflows defined"`, exit `0`.

This replaces the 0.2.x output, which printed `workflows.yaml` and every workflow file with their phases;
`wingfoil workflow show <name>` prints a workflow's phases now. The MCP Resources `wingfoil://workflows`
and `wingfoil://workflows/{name}` keep the 0.2.x content and read the working tree in v0.3.

`diagnostics` carries the warnings of the load and of the checks against the rest of the configuration
(below), then the warnings about uncommitted inputs and about Memory documents that could not be read. A
warning does not change the exit code; an error in any of the files exits `1`, with every diagnostic in
the error's details.

The workflows are also checked against the rest of the configuration: a phase `role` or
`approval: { by_role }` that `dna.yaml`'s `team.roles` does not define (`E_PHASE_ROLE_UNKNOWN`), an
`approval: { by_person }` that names no `team.members[]` entry, a Memory type `memory.yaml` does not
register (in `element`, `iterate_over`, `memory.add(type: …)` or a `produces` owner), an `iterate_over`
collection that resolves to no list, and a `cadence` event that can never fire are errors (exit `1`).
A `{<type>.<field>}` token outside its scope, a phase whose actions its element's state machine cannot
apply, and a `fallback` that does not match the reject it answers are warnings. Without `dna.yaml` or
`memory.yaml` the checks that need it cannot run: each missing file is reported as a
`W_WORKFLOW_CHECKS_NOT_RUN` warning naming the checks that were skipped. The command fails (exit `1`)
when `dna.yaml` or `memory.yaml` is present but invalid.

- **Commit:** none.

### `wingfoil workflow next`

Print the next step of an open workflow: its verb, role, element, directives and bindings, as committed at HEAD.

```
wingfoil workflow next [<ref>] [--assigned-to <who>]
```

| Option | Description |
|---|---|
| `--assigned-to <who>` | Keep only the steps whose role `<who>` holds: `me` (the `team.members[]` entry whose email is your git identity's), a member's name or email, or a role name. |

Unreleased (v0.3). Read-only, and it reads `HEAD` as `workflow list` does: an uncommitted change is
reported as `W_UNCOMMITTED_INPUTS`, never read. `<ref>` is a workflow name (its most recently started open
instance) or the id of an open instance; without it, the active instance (the most recently started one).

The answer is the instance's **frontier**, the steps that are ready now. The first is the next step; the
others are listed under `more` (several tasks iterated in parallel give several ready steps). Each step
reports its `key` (`<workflow>.<phase>`, then `@<type>:<id>` for the element it runs on, e.g.
`dev-loop.red@task:task-130`), its `trail` from the instance down, its `scope`, its `role`, the members who
hold it and whether an agent runs as it (`agentRole`), the role's directives (`id` and `title` only; their
text is what `agent execute` loads), and each action with its interpolated text and its binding:

- `wingfoil`: the command, with the step's operands filled — `memory add --type <T> --workflow <instance>
  --step <key>` to link what you add to the step, or the ids a Memory verb acts on;
- `agent`: `wingfoil agent execute --workflow <instance> --step <key>`;
- `manual`: for a state change WingFoil has no command for yet, the commit subject the step expects, e.g.
  `wf(task): start task-130 [backlog → in-progress]`, `wf(bug): sync bug-12 [in-review → in-progress]`;
- `run`: a command bound in `workflows/bindings.yaml`; `unbound`: none.

Checks are listed with their binding and `"evaluated": false`: nothing is run. A step also reports the
evidence still missing (`finalizable: true` when only a record is, which `workflow finalize` writes),
`fallback`, `reentered` and `reentryCommit` after a reject, `mode`, `allowedModes`, `distinctFrom` and a
recurring `cadence` (`lastRun: "not-recorded"`). The console view prints the key, trail, scope, role,
directive ids, actions with their bindings, the missing evidence and a "waiting for" or "human needed"
line; `--format json|yaml` prints the full payload,
`{"baseline": {…}, "instance": {…}, "complete": …, "next": {…}, "more": […], "diagnostics": […]}`.

```console
$ wingfoil workflow next
workflow: decision-log-ingest (decision-log-ingest-rel-v0.3-consumer-feedback-loop-plan)
next step: decision-log-ingest.capture
  trail: decision-log-ingest.capture
  scope: (none)
  role: product-owner — held by Roberto Pompermaier
  directives: claim-evidence, doc-versioning, documentation, git-conventions, security, security-secrets, traceability
  actions:
    - memory.add(type: decision-log) [wingfoil: wingfoil memory add --type decision-log --workflow decision-log-ingest-rel-v0.3-consumer-feedback-loop-plan --step decision-log-ingest.capture]
    - memory.submit [wingfoil: wingfoil memory submit]
  evidence missing: produces
```

- **Exit `0`** for every deduced outcome, with a `message`: `no open workflows`;
  `no next step: workflow '<name>' is complete`; `no next step of workflow '<name>' is assigned to '<who>'`.
- **Errors:** a `<ref>` that names no open instance → `workflow is not open: <ref>`, exit `1`; an error in
  the workflow files → exit `1`, as `workflow list`; more than one `<ref>` → exit `2`.
- **Commit:** none.

### `wingfoil workflow show`

Print one workflow resolved, its included workflows nested under their phases, as committed at `HEAD`.

```
wingfoil workflow show <ref>
```

Unreleased (v0.3). Read-only, and it reads `HEAD` as `workflow list` does. `<ref>` is a workflow name, or
the id of an open workflow instance (its `plan` document), which stands for that instance's workflow.

For each phase it prints its `role` and that role's directives (`id` and `title`, the role's own and the
global ones, as `directives list --role` resolves them), its `actions` and `checks` with the binding each
token resolves to (`wingfoil`, `manual`, `agent`, `run` from `workflows/bindings.yaml`, or `unbound`;
checks are listed, never run: `"evaluated": false`), `produces` with the Memory type that owns each path,
`approval`, `awaits`, `fallback`, `iterate` (an `iterate_over` and its `where`) or `selection` (a `where`
alone), `mode`, `allowedModes` and `distinctFrom`, `cadence`, the kinds of evidence that complete the phase
(`state`, `created`, `produces`, `selection`, `include`, `awaits`, `record`), and, for a phase that includes
another workflow, that workflow resolved the same way under `sub`. The payload is
`{"baseline": {…}, "workflow": {…}, "diagnostics": […]}`, the diagnostics as `workflow list` reports them.

- **Errors:** a name no workflow at `HEAD` has and no open instance holds → `unknown workflow: <name>` —
  `<ref>` itself, or, for an open instance whose workflow is not loaded, that workflow's name — exit `1`; an error in the workflow files → exit `1`, as `workflow list`; no `<ref>`, or more than one → exit `2`.
- **Commit:** none.

## Agent

Unreleased (v0.3). Agent runs are recorded in a run log, one JSON Lines file per element under the
directory `dna.yaml` declares in `paths.runs` (`docs/runs/` in a project `wingfoil init` scaffolds),
each record committed on its own as `agent: record <run-id>`. A run id is
`<element-id>/<phase>/<n>`: the element's id without its type, the workflow phase (or `adhoc` for a
run outside a workflow step), and a count from 1, e.g. `task-042-login-form/red/1`.

### `wingfoil agent execute`

Launch an agent CLI through its adapter on one Memory element, with its context assembled and checked first.

```
wingfoil agent execute --element <type:id> [--role <role>] [--agent <name>]
```

| Option | Description |
|---|---|
| `--element <type:id>` | The element the agent works on, as `<type>:<id>` with the element's full id, e.g. `task:task-042-login-form`. Required in this release (the workflow-step forms `--next`, `--workflow` and `--step` are not available yet, and are refused as unknown options). |
| `--role <role>` | The role the agent runs as: a `team.roles` name in `dna.yaml`. Without it the role is `developer`, and a `warning:` line says so. `approver` is refused: an agent never runs as the role that approves. |
| `--agent <name>` | The `team.agents` entry to launch. Without it, the first entry, in `dna.yaml` order, that declares an `adapter` and lists the role in `executes_as`. |

Unreleased (v0.3), and **not yet able to launch**: this build runs every check that comes before the
launch and stops there. It reads **as committed at `HEAD`** (see [Git side effects](#git-side-effects)):
`dna.yaml`, `memory.yaml`, the element, the agent's adapter under `.wingfoil/agents/built-in/` or
`.wingfoil/agents/custom/`, and the run log. That commit is the run's `state_ref`. In order, it checks:
the element exists; the role is defined and is not `approver`; an agent with an adapter runs the role;
the adapter is valid; its `command` is on `PATH` (or at its path in the project); your git identity is
set; `dna.yaml` declares `paths.runs` and the element's run log has no uncommitted changes; the
execution context (DNA, the role's directives, the relevant Memory) assembles and validates; the
WingFoil MCP server of this same build starts and serves that context (your project's `.mcp.json` is
neither read nor changed); and, for an adapter whose launch needs one, stdin and stdout are a terminal.
The first check that fails ends the command with exit `1` and its message, for example
`error: context pre-load failed: MCP server unreachable` or
`error: invalid execution context: missing 'directives' section`. The context's warnings (a directive
bound to the role with no file, a Memory document that could not be read) and any file under
`.wingfoil/agents/` that is not an adapter (another extension, a nested file, a name outside
`[a-z0-9-.]`) are printed as `warning:` lines first. Temporary files go to the system's temporary
directory and are removed whatever happens.

When every check passes, the command exits `1` with `error: agent execute cannot launch an agent yet:
run <run-id> passed every pre-launch check …`. With `--dry-run` it exits `0` instead and prints the
launch it would make: `{"dryRun": true, "subject": "agent: record <run-id>", "paths": [<run log>],
"run": {id, element, workflow, phase, role, mode, agent, adapter, state_ref}, "bootstrap": "<the
prompt the agent would receive>"}`. Without `--element` it exits `2` with
`error: missing required argument: --next or --element`.

- **Commit:** none in this build (the launch will commit one run record, `agent: record <run-id>`).

### `wingfoil agent show`

Print one recorded agent run and the commit that added it.

```
wingfoil agent show <run-id>
```

Unreleased (v0.3). Read-only. It reads the run log, and `dna.yaml`'s `paths.runs`, **as committed at
`HEAD`**, not the working tree (see [Git side effects](#git-side-effects)): the run ids `agent execute`
counts are counted at `HEAD` too, so the two never disagree about which runs exist.

`console` (the default) prints one `key: value` line per field of the record, in the record's order,
with the token counts on four lines (`tokens.input`, `tokens.output`, `tokens.cache_read`,
`tokens.cache_write`), then the commit that added the record:

```console
$ wingfoil agent show task-042-login-form/red/1
id: task-042-login-form/red/1
element: task:task-042-login-form
workflow: dev-loop
phase: red
role: developer
mode: fresh
agent: claude
adapter: built-in/claude-code
agent_version: not-reported
model: not-reported
session: not-reported
tokens.input: not-reported
tokens.output: not-reported
tokens.cache_read: not-reported
tokens.cache_write: not-reported
wingfoil: 0.3.0 (4f1c2d9b7e3a5c80d61f2a94b7c3e5d08a1f9e9a)
state_ref: 9b1e0c4d2a7f3e5b6c8d0a1f2e3d4c5b6a7f8e9d
duration_ms: 61000
exit_status: 130
result: n/a
notes: task-042-login-form#execution-notes
commit: 3c5d7e9f1a2b4c6d8e0f1a3b5c7d9e1f2a4b6c8d
```

This is the one command whose `console` output is not the indented JSON of
[`--format`](#global-options). `--format json` and `--format yaml` print
`{"baseline": {"rev": "HEAD", "commit": "<sha>"}, "run": {…the record…}, "commit": "<sha>"}`:
`baseline.commit` is the `HEAD` it read, `commit` the commit that added the record. A value the
agent did not report is the string `not-reported`, never `0` or `null`.

- **Commit:** none.
- **Errors:** missing run id → exit `2`; a run id that is not `<element-id>/<phase>/<n>` → exit `2`,
  `error: invalid run id "<value>", expected <element-id>/<phase>/<n>`; a run the log at `HEAD` does
  not hold → exit `1`, `error: run not found: <run-id>`. When the run is in the working tree's log but
  not committed, a `hint:` line says so, and the command still exits `1`: commit the run log, then run
  it again. A run log at `HEAD` that is not valid JSON Lines exits `1`, naming the file and the line;
  a `dna.yaml` with no `paths.runs` exits `1` with `error: dna.yaml declares no run log (paths.runs)`.
