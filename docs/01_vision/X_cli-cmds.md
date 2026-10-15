# CLI Commands Reference — WingFoil

**Version:** 1.7
**Date:** 2026-10-15  
**Status:** Approved

---

This document provides a comprehensive reference of all WingFoil CLI commands organized by pillar. Each command includes
its interface, description, actors (personas), user journeys, relevant notes, and parameter specifications. A command's
interface is the grammar the CLI ships (`wingfoil <command> --help`), in the notation of *Command-Line Syntax
Conventions* below; a command or a flag that is specified but not built yet is marked *Not built*, with the feature and
the release that plan it.

---

## Pillar 1: Project Memory Commands

**Philosophy:** Memory documents flow through a state machine that is **specific to their element type**, configured in
`.wingfoil/memory.yaml` (P1.13). Each type declares its path pattern, name, tags and allowed states + transitions; a
`defaults` block (draft → pending → approved, `reject` back to draft, `deprecated` from any state) applies to any type
that does not override it. The verbs below (`submit`/`approve`/`reject`/`deprecate`/`park`) perform the legal
transition for the document's current state and type — so e.g. approving a `task` during planning lands in `backlog`,
while approving it after review lands in `approved`. This mirrors the Workflow pillars but operates at the document
level.

| Command | Description | Actors | Journeys | Notes |
|---------|-------------|--------|----------|-------|
| `wingfoil memory add --type <type> --title <title> [--tags <t1,t2>] [--set <name>=<value> ...] [--workflow <ref> [--step <key>]]` | Create new Memory document (draft state) with specified type | Morgan, Alex, Casey | 0a, 0b, 5 | Creates the document from its type's template at the path the type declares in `.wingfoil/memory.yaml`, inside the project root, with frontmatter state. The id comes from the type's `id_pattern`; `--set` fills an `id_pattern`/`path` token. `--workflow` (and `--step`) links the document to a step of an open workflow instance (`spec-017` §7.10) |
| `wingfoil memory search [<keyword>] [--type <type>] [--status <status>] [--tag <tag>]` | Query Memory by keyword, type, status and tag | Casey, Alex, Jordan | 1, 3, 5 | Keyword search only. Filters by type (adr, task, etc.) and status (states are type-dependent — see `.wingfoil/memory.yaml`; e.g. draft, pending, approved, deprecated) |
| `wingfoil memory import [<path>] [--action copy\|move\|link]` | Scan existing docs and import into Memory | Morgan, Alex | 0b | *Not built* (v0.4). Interactive if `--action` not specified. Prevents duplicates by checking filename hash. Supports: copy (new file), move (original deleted), link (symlink, avoids duplication) |
| `wingfoil memory submit <id>` | Submit Memory document for approval (advances per the type's "submit" edge) | Morgan, Alex | 2, 4, 5 | Performs the type's legal submit transition (e.g. task draft → pending). Recorded in frontmatter + git commit |
| `wingfoil memory approve <id> --reason <text>` | Approve Memory document (advances per the type's "accept" edge) | Morgan, Casey, Sam | 2, 4, 5 | Destination state depends on type + current state (e.g. task: pending → backlog, in-review → approved). Needs the approver role. Records approver, timestamp, reason. Creates git commit |
| `wingfoil memory reject <id> --reason <text>` | Reject Memory document (advances per the type's "reject" edge) | Morgan, Casey, Sam | 2, 4, 5 | Moves the document to its gate's reject target (default machine: pending → draft). Needs the approver role. Reason stored in frontmatter (`rejection_reason`) and in the commit |
| `wingfoil memory deprecate <id> [--reason <text>]` | Mark Memory document as deprecated (any state → deprecated) | Morgan, Casey | 2, 3, 5 | Document remains in repo (not deleted) but marked as obsolete. Reason recorded. Agents ignore deprecated docs in context loading |
| `wingfoil memory park <id> --reason <text>` | Return a started document to an earlier state along its type's declared `returns` edge | Morgan, Alex, Jordan | 2, 4 | For a task, in-progress → backlog (`dl-110`). The reason is recorded in the commit (`task-180`) |
| `wingfoil memory amend <id> --reason <text>` | Record an uncommitted correction to a document as an amendment, leaving its state unchanged | Morgan | 2, 4 | For types `memory.yaml` declares `amendable`. Needs the approver role; the reason is recorded in the commit (`task-127`) |
| `wingfoil memory history <id>` | View audit trail of Memory document (commits, approvals, state changes) | Morgan, Casey | 2, 3, 5 | Shows full git history + state transitions from frontmatter |

### Parameters for Pillar 1 Commands

| Parameter | Type | Description | Where Found | How Managed | Where Saved |
|-----------|------|-------------|-------------|-------------|-------------|
| `<id>` | string (slug) | Unique identifier of a Memory document; required by `submit`, `approve`, `reject`, `deprecate`, `park`, `amend` and `history` | Generated on `memory add` from the type's `id_pattern` (e.g. `adr-001-async-design`) | Ids are globally unique, so the type is not repeated (`spec-008` §7) | Filename and frontmatter `id:` field |
| `--type` | enum | Document type, as `.wingfoil/memory.yaml` declares them (adr, task, release, bug, …) | User input (flag) | Required on `memory add`; a filter on `memory search` | The type's `path` in `.wingfoil/memory.yaml` and frontmatter `type:` |
| `--title` | string | Document title for new Memory document (on `memory add`) | User input (flag) | Captured at creation; also the source of the `{slug}` token | Frontmatter `title:` field |
| `--tags` | string (csv) | Comma-separated tags for new Memory document (on `memory add`) | User input (flag) | Parsed into list of tags | Frontmatter `tags:` field |
| `--set` | `<name>=<value>` | Fills the `id_pattern`/`path` token `{name}` on `memory add`; repeatable | User input (flag) | `spec-008` §10 | The id, the path, and the frontmatter field of that name |
| `--workflow`, `--step` | string | On `memory add`: the open workflow instance (a name or an instance id) and the frontier step the document is linked to | `workflow next` / `workflow status` output | `--step` needs `--workflow` (`spec-008` §12) | The add commit's `WingFoil-Instance:` / `WingFoil-Step:` trailers |
| `[<keyword>]` | string | Positional search term on `memory search` | Provided in command | Case-insensitive substring of title, id, tags and body | N/A (query parameter only) |
| `--status`, `--tag` | string | Filters on `memory search` | User input (flag) | Query parameters | N/A (query parameter only) |
| `[<path>]` | string (path) | Positional source path on `memory import` (*Not built*) | Provided in command | Path to existing doc(s) to scan/import | N/A (input to import; imported doc saved at its type's `path` in `.wingfoil/memory.yaml`) |
| `--action` | enum | Import action on `memory import` (*Not built*): copy, move, link | User input (flag or interactive prompt) | copy (new file), move (original deleted), link (symlink) | N/A (affects how imported file is placed) |
| `--reason` | string | Reason on `memory approve`/`reject`/`deprecate`/`park`/`amend` (required except on `deprecate`) | User input (flag) | Recorded with the transition as the commit's `Reason:` block (`dl-067`) | Git commit message (and `rejection_reason` on reject) |
| `status` | enum | Document state (type-dependent per `.wingfoil/memory.yaml`; default: draft, pending, approved, plus `deprecated` from any state) — type-specific states (e.g., `backlog`, `in-review`) also exist per `.wingfoil/memory.yaml` | Auto-tracked in frontmatter | Per-type state machine transitions (submit, approve, reject, deprecate, park) | Frontmatter `status:` field, tracked via git commits |

---

## Pillar 2: Project DNA Commands

**Philosophy:** DNA is the source of truth for project structure, stacks, and team. Synchronizing Directives and Workflow
built-in templates when DNA changes is intended and *Not built*: no command synchronizes them today, and no feature
schedules it. DNA structure is the top-level keys of `dna.yaml` as `spec-002-dna-yaml-schema` declares them: `version`,
`project`, `modules`, `stacks` (`technologies` + `methodologies`), `team` (`members`, `agents`, `roles`), and `paths`.
There is no `conventions` key, and the fixed-key stack field of earlier drafts is gone — `spec-002` replaced it with
`stacks` and removed `conventions`, its rules having moved to `.wingfoil/directives/custom/`.

**Parameter shape (`dl-082-cli-parameter-shape`, `ready`):** across every pillar, **a positional carries the identity of
the thing the command acts on** — a DNA path, a document id, a category — and **an option carries a named attribute of
the action** (`--value`, `--type`, `--reason`, `--entry-<field>`). The four write verbs below are `P2.1`'s "Basic CRUD
operations" decomposed by `dl-081-dna-mutation-surface-shape`; `P2.1` authorises the CRUD, `dl-081` chose the four-verb
decomposition, and `dl-082` fixed the spelling.

| Command | Description | Actors | Journeys | Notes |
|---------|-------------|--------|----------|-------|
| `wingfoil dna set <path> --value <value> [--force]` | Update an existing **scalar** DNA field | All | 0a, 6 | Modifies `.wingfoil/dna.yaml` and creates a `wf(dna): set <path>` commit. `<path>` is the full dotted path to a scalar leaf — `dna set project.license --value MIT`. A path the schema does not declare is **refused**, never created (`bug-084`). Collections and lists go through `add`/`remove`/`update` |
| `wingfoil dna add <path> --value <value> [--entry-<field> <value> ...] [--force]` | Add an entry to a DNA collection, or a value to a list | All | 0a, 6 | `--value` is the new entry's `name` when `<path>` ends at a collection — `dna add stacks.technologies --value TypeScript --entry-category language`. One `--entry-<field>` per field the entry schema declares; the `entry-` prefix keeps that derived namespace disjoint from the global flags (`spec-008` §9) |
| `wingfoil dna update <path> [--value <value>] [--entry-<field> <value> ...] [--force]` | Update an existing entry or leaf, addressed by name | All | 0a, 6 | Entries are addressed by `name`, never by index (`dl-081`) — `dna update stacks.technologies.TypeScript --entry-version 5.9`. Reaches a nested field of a named entry directly: `dna update modules.core.path --value src/core` |
| `wingfoil dna remove <path> [--value <value>] [--force]` | Remove an entry from a DNA collection, or a value from a list | All | 0a, 6 | `<path>` names the entry (`<collection>.<name>`), or the list `--value`'s values are removed from — `dna remove paths.docs --value README.md`. Refused when `<path>` or the named entry does not resolve |
| `wingfoil dna show [<section>]` | Query and display project DNA | Casey, All | 3, 5 | Show the full DNA, or one **top-level** section as a positional: `project`, `modules`, `stacks`, `team`, `paths`. Not a dotted path — `dna show stacks.technologies` is refused (exit `1`) |
| `wingfoil dna infer [--confirm]` | Auto-scan codebase and propose DNA structure | Morgan, Alex | 0b | *Not built* (`spec-006`: planned). Infers modules from directory structure, languages/frameworks from files. Requires human review/approval before updating DNA |
| `wingfoil paths [<category>] [--list]` | Query project resource paths by category | All | 0a, 0b, 5 | Reads from DNA `paths:` section. Categories: sources, tests, docs, config, governance, runs, health — `runs` is the agent run log's one directory (`spec-016` §4.1, `task-138`). `--list` is accepted for the planned drill-down view and does not change the output yet |

> **On interactivity.** No DNA command prompts. `init` is the only command with a prompt layer — the negatable global
> `--interactive` is read only by it — and every other command fails immediately on a missing required argument, at exit
> `2`: `wingfoil dna set` → `error: missing required argument: <path>` (then `hint: usage: wingfoil dna set <path> --value <value>`),
> `wingfoil dna set project.license` → `error: missing required argument: --value`. The prompt layer is not abandoned
> scope: it stays specified for all commands in `spec-008-cli-grammar` §4 ("Interactive-prompt rules"), which is where a
> reader should look for the intended behaviour. What is written above is what ships; §4 is what is intended.

### Parameters for Pillar 2 Commands

| Parameter | Type | Description | Where Found | How Managed | Where Saved |
|-----------|------|-------------|-------------|-------------|-------------|
| `<path>` | path | **Positional**, and the only positional a write verb reads. The full dotted path to the target — `project.license`, `stacks.technologies`, `modules.core.path`. Never a bare field name: `team.roles` and `team.members.<name>.roles` are different fields | User specifies in the command | Resolved against the `dna.yaml` schema; an undeclared path is refused (exit `1`) | `.wingfoil/dna.yaml` nested keys |
| `--value` | string/array | The new entry's **identity** when `<path>` ends at a collection; the new **value** when it ends at a leaf. Comma-separated where the field is a list of values | User input (flag) | Validated against DNA schema | `.wingfoil/dna.yaml` |
| `--entry-<field>` | string/array | One option per field the entry schema declares — `--entry-description`, `--entry-path`, `--entry-category`, `--entry-version`, `--entry-notes`, `--entry-phase`, `--entry-email`, `--entry-roles`, `--entry-executes_as`, `--entry-approval_authority`, `--entry-adapter`. Accepted by `add` and `update` | User input (flag) | The `entry-` prefix is required; it keeps this derived namespace disjoint from the global flags (`spec-008` §9). `--entry-adapter` names a `team.agents` entry's adapter (`task-138`) | `.wingfoil/dna.yaml` entry fields |
| `--force` | flag | On `set`, `add`, `update`, `remove`: authorizes rewriting the whole `dna.yaml` when the in-place edit cannot express the change | User specifies via flag | Without it that case is refused; with it the success carries a warning (`spec-008` §12) | `.wingfoil/dna.yaml` |
| `[<section>]` | enum | **Positional** on `dna show`: one top-level DNA key — `project`, `modules`, `stacks`, `team`, `paths` | User specifies, or omits to show all | Matches top-level keys in YAML; a dotted path is refused | `.wingfoil/dna.yaml` |
| `category` | enum | Positional `[<category>]`: resource path category on `paths`: sources, tests, docs, config, governance, runs, health | User specifies, or omits for the whole map | Defined in DNA `paths:` section; `runs` holds exactly one directory | `.wingfoil/dna.yaml` under `paths:` |
| `--confirm` | flag | On `dna infer` (*Not built*); skip confirmation and accept proposed DNA | User specifies via flag | If set, auto-confirms inferred values without prompting | N/A (affects execution flow) |
| `--list` | flag | Drill-down on `paths` (e.g., `paths sources --list`) | User specifies via flag | Accepted; the expanded view is planned and does not change the output yet | N/A (affects query output only) |

---

## Pillar 3: Project Directives Commands

**Philosophy:** Directives are of two kinds:

1. **Built-in directives:** Installed during project init (`wingfoil init`, P3.8). Choosing them from the DNA's
   `stacks` and keeping them in sync when DNA changes is intended and *Not built*.
2. **Custom directives:** Created by tech lead/architect. Associated with specific roles or globally scoped. Manually
   managed.

**Sync Process:** *Not built*, and no feature schedules it. The intent: when `wingfoil dna add` or `dna remove` changes
`stacks.technologies` or `stacks.methodologies`, WingFoil would:

- Install new built-in directives for added stack choices
- Remove directives for removed stack choices
- Update role→directive assignments to reflect the new built-in set

| Command | Description | Actors | Journeys | Notes |
|---------|-------------|--------|----------|-------|
| `wingfoil directive create --name <name>` | Create a custom directive from a scaffold | Morgan, Alex | 0a, 4 | Creates `.wingfoil/directives/custom/<name>.md`. Unique within custom directives. Not auto-removed. Flag-based; it does not prompt (see *On interactivity* in Pillar 2) |
| `wingfoil directive assign --directive <name[,name...]> --role <role> [--force]` | Bind custom directive(s) to a role | Morgan | 2, 6 | Maps directives to a role defined in DNA. One directive can bind to multiple roles. Records in `.wingfoil/roles.yaml`, edited in place; `--force` authorizes a whole-file rewrite when it cannot be (`dl-062`, `task-169`). Global bindings are the `global:` list of `roles.yaml` |
| `wingfoil directive remove <name>` | Remove a custom directive | Morgan, Alex | 2, 4, 6 | Only removes custom directives (built-in ones cannot be removed, REQ-SEC-07). The referrer check always runs: a directive `roles.yaml` still assigns is refused |
| `wingfoil directives list [--role <role>]` | List all directives (built-in + custom) and role assignments | All | All | Shows: directive id, name, kind (built-in/custom), roles assigned, scope. `--role` keeps the directives that apply to that role, globals included |

### Parameters for Pillar 3 Commands

| Parameter | Type | Description | Where Found | How Managed | Where Saved |
|-----------|------|-------------|-------------|-------------|-------------|
| `--name` / `<name>` | string | Custom directive name (slug format): the option on `directive create`, the positional on `directive remove` | User input | Must be unique within custom directives | Filename `.wingfoil/directives/custom/<name>.md` |
| `--directive` | string (csv) | The directive id(s) to assign, comma-separated | Listed via `directives list` or in filename | Each must exist | `.wingfoil/roles.yaml` |
| `ROLE` | string | Value of `--role` (`directive assign`, `directives list`): role name defined in DNA (developer, reviewer, qa, architect, etc.) | Listed via `dna show team` | Defined in DNA, referenced in assignments | `.wingfoil/roles.yaml` |
| `--force` | flag | On `directive assign`: authorizes the whole-file rewrite of `roles.yaml` when the in-place edit cannot apply | User specifies via flag | Without it that case is refused; with it the success carries a warning (`spec-008` §12) | `.wingfoil/roles.yaml` |

---

## Pillar 4: Project Workflow Commands

**Philosophy:** Similar to Directives, Workflows are:

1. **Built-in templates:** Installed during init based on the methodology template (Scrum, Kanban). Keeping them in sync
   when DNA changes is intended and *Not built*.
2. **Custom workflows:** Created by tech lead/architect. Can be included in main workflow via `include()` directive.

**File layout:** `.wingfoil/workflows.yaml` is the **main configuration file**. It does not contain every workflow
inline — it references the built-in and custom workflow files via `include()`. Built-in templates live in
`.wingfoil/workflows/built-in/`, custom workflows in `.wingfoil/workflows/custom/`.

**Startable vs includable:** every workflow declares `startable: true` (independently startable — e.g. `release-cycle`,
`report-bug`), `includable: true` (included by a phase — e.g. a TDD `dev-loop`), or both (`dl-109`; `kind: main` and
`kind: sub` are the aliases). A workflow that is only includable is never started directly; it runs when a phase
`include()`s it, optionally per element via `iterate_over: <type>` with `where` filters.

**Active workflow context:** `wingfoil workflow start <name>` opens an instance and makes it **active**; `end`, `next`,
`finalize` and `agent execute --next` take the active instance unless a `<ref>` (a workflow name or an open instance
id; `agent execute --workflow <ref>`) selects another; `status` reports every open instance unless a `<ref>` selects one. Multiple instances may be open at once (e.g. `start
report-bug` during a `release-cycle` phase); the last started is active. `workflow end` closes the active (or selected)
instance and makes the previous one active. The Memory verbs take a document `<id>`, not a workflow.

**Sync Process:** *Not built*, and no feature schedules it. The intent: when `wingfoil dna update` changes
`stacks.methodologies`, WingFoil would:

- Copy/update built-in template files to `.wingfoil/workflows/built-in/`
- Sync methodology-specific configuration
- Preserve custom workflows (not auto-removed)

| Command | Description | Actors | Journeys | Notes |
|---------|-------------|--------|----------|-------|
| `wingfoil workflow status [<ref>]` | Show state of all open workflows and pending approvals | Morgan, Casey, Sam | 2, 3, 4, 5, 6 | Dashboard view; the active instance first and marked, each with its phase progress, frontier and pending approvals and who they are routed to; then the elements waiting at a gate (`spec-017` §7.4) |
| `wingfoil workflow next [<ref>] [--assigned-to <who>]` | Show next step of the active workflow, its element + directives | Alex, Morgan, Jordan | 1, 4 | Reports the **element of the current step** (e.g. REL in planning, TASK in implementation), next action, and auto-loaded directives for the role. `--assigned-to` keeps the steps whose role `me`, a member or a role holds |
| `wingfoil workflow start <name> [--element <type>:<id>] [--title <title>] [--set phase=<v>] [--set scope=<v>]` | Open a startable workflow; set it as the active context; init first step | Morgan, Alex | 0a, 0b | Only startable workflows are startable. Records the instance as a `plan` element (an `add` and a `submit` commit). `--set` overrides a derived plan token (`spec-017` §7.1) |
| `wingfoil workflow end [<ref>]` | Close the active (or selected) workflow; restore previous context | Morgan, Alex | 0a, 0b | Refused while the instance is not complete. Moves its plan `active → done`; the previous open instance becomes active. Creates git commit |
| `wingfoil workflow finalize [<ref>] [--step <key>] [--reason <text>]` | Record that a step with no Memory or file evidence is complete | Morgan, Sam | 2, 4 | One empty commit with the phase-record trailers; on a phase that declares `approval:`, needs the approver role and `--reason` (`spec-017` §7.9) |
| `wingfoil workflow list [--all]` | List workflows **executable now** (`--all` for every defined workflow) | All | 0a, 0b | Context-aware: startable workflows + an includable one when it is the next executable step. `--all` shows every defined workflow. Shows name, startable, includable, description |
| `wingfoil workflow show <ref>` | Display details of a workflow (phases, steps, directives, Memory structure) | All | 0a, 0b | Shows the workflow resolved: phases, roles and their directives, actions, checks, `produces`, approvals, included workflows nested under their phases |
| `wingfoil workflow create <name> (--kind main\|sub \| [--startable] [--includable]) [--element <type>] [--description <text>]` | Create new custom workflow file | Morgan, Alex | 2, 4, 6 | Creates `.wingfoil/workflows/custom/<name>.yaml` with one phase and includes it in `workflows.yaml`. Flag-based; interactive creation is post-v0.3 (P4.8). Not auto-removed on DNA change |
| `wingfoil workflow remove <ref>` | Remove custom workflow after verifying it's not included elsewhere | Morgan, Alex | 2, 4, 6 | Only removes custom workflows (built-in ones cannot be removed). The check always runs: refused while another workflow includes it or an open instance runs it (`spec-017` §7.8) |

### Parameters for Pillar 4 Commands

| Parameter | Type | Description | Where Found | How Managed | Where Saved |
|-----------|------|-------------|-------------|-------------|-------------|
| `<name>` | string | Positional on `start` and `create`: workflow name | Listed via `workflow list` or defined in YAML | Matches `[a-z][a-z0-9-]*` | Filename `.wingfoil/workflows/[built-in or custom]/<name>.yaml` |
| `<ref>` | string | Positional on `end`, `next`, `status`, `finalize`, `show`, `remove`: a workflow name (its most recently started open instance) or an open instance id (`spec-017` §3.3) | `workflow status` output | Required on `show` and `remove`; on `status` the default is every open instance, elsewhere the active instance | N/A (selector) |
| `--assigned-to` | string | On `workflow next`: `me`, a member name or email, or a role name | User specifies via flag | Matched against DNA team members and roles | N/A (query parameter only) |
| `--element` | `<type>:<id>` / `<type>` | On `start`: the element the workflow runs on; on `create`: the Memory type it runs on | User specifies via flag | `spec-008` §7 element-ref | The plan's `element`; the workflow's `element:` |
| `--title`, `--set` | string | On `start`: the plan's title, and `phase=<v>` / `scope=<v>` overriding a derived plan token | User specifies via flag | `spec-017` §7.1 | The plan element |
| `--step`, `--reason` | string | On `finalize`: the frontier step to record, by its key, and the reason (required on an approval phase) | `workflow next` output | `spec-017` §7.9 | The finalize commit |
| `--kind`, `--startable`, `--includable`, `--description` | enum / flag / string | On `create`: the declaration (`--kind main\|sub`, or one or both of the two flags) and the description | User specifies via flag | `spec-008` §12 | `.wingfoil/workflows/custom/<name>.yaml` |
| `--all` | flag | On `workflow list`; shows every defined workflow instead of only executable-now | User specifies via flag | If set, lists all defined workflows; otherwise only executable-now | N/A (affects query scope only) |

---

## Pillar 5: Project Initialization Commands

**Philosophy:** Initialization is the one-time setup of WingFoil on a project. In a terminal `init` asks for what it
needs; `--template` names the methodology without a prompt; the mode inferred from the repository is *Not built*
(P5.1.2, v0.4). Initialization:

- Creates DNA from the template (inference *Not built*)
- Installs built-in Directives (choosing them from the DNA's `stacks` is *Not built*)
- Installs built-in Workflows based on methodology
- Initializes Memory structure with suggested sections

| Command | Description | Actors | Journeys | Notes |
|---------|-------------|--------|----------|-------|
| `wingfoil init [--template <Scrum\|Kanban>]` | Initialize WingFoil on new or existing project | Alex, Morgan | 0a, 0b | Prompts for the template in a terminal; `--template` is required without one or with `--no-interactive`. Generates DNA, installs built-in directives/workflows, creates Memory structure. *Not built*: `--mode infer` (deduce from repo, P5.1.2, v0.4) |
| `wingfoil audit [--output-type full\|summary]` | Scan project and summarize current state (languages, frameworks, structure) | Morgan, Alex | 0b | *Not built* (P5.1.3, v0.4). Pre-requisite to `init --mode infer`. Shows: repo size, languages, frameworks, module structure, team members (from git history). Helps inform DNA inference |
| `wingfoil mcp` | Start the WingFoil MCP server over stdio, for an MCP client to launch | Alex | 1 | Bootstrap command, like `init`: not a core operation and not exposed on MCP itself (REQ-SYS-05's exemption, `dl-046-bootstrap-commands-in-spec-006-section-3`). Contract in `spec-014-mcp-server-entry-point` §1 |

### Parameters for Pillar 5 Commands

| Parameter | Type | Description | Where Found | How Managed | Where Saved |
|-----------|------|-------------|-------------|-------------|-------------|
| `--template` | enum | Methodology template on `init`: Scrum, Kanban | User selects during init | Selects which built-in workflow template to install | `.wingfoil/` scaffold |
| `--mode` | enum | *Not built* (P5.1.2, v0.4): `infer` deduces the DNA from the repository | User specifies | Presents every inferred section for approval | N/A (affects execution flow only) |
| `--output-type` | enum | Audit output detail on `audit` (*Not built*): full or summary | User specifies via flag | Controls verbosity of audit report | N/A (affects output only) |

---

## Agent Execution Commands

| Command | Description | Actors | Journeys | Notes |
|---------|-------------|--------|----------|-------|
| `wingfoil agent execute [--next] [--workflow <ref>] [--step <key>] [--element <type>:<id>] [--role <role>] [--agent <name>]` | Launch agent with auto-loaded context (directives, Memory, target element) | All | 0a, 1, 2, 4, 6 | With `--next` (normal path): **workflow, phase, element and role are resolved from the active instance's next step**; `--workflow <ref>` and `--step <key>` select another instance or step and imply `--next`. Override with `--element type:id` (and optionally `--role`); `--agent` picks a `team.agents` entry. At least one of `--next`, `--workflow`, `--step`, `--element` is required. Records the run in the run log (`spec-016` §4). Pre-loads Memory context in <30 sec. `--resume` / `--ref` are v0.4 |
| `wingfoil agent list [--past] [--waiting] [--element <type>:<id>] [--phase <name>]` | List the recorded agent runs and the workflow steps waiting for an agent | All | 1, 2, 4 | `--past` the run log at `HEAD`, `--waiting` the open instances' ready steps whose role an agent executes; neither (or both) shows both. `--element` and `--phase` filter both (`spec-016` §5) |
| `wingfoil agent show <run-id>` | Print one recorded agent run and the commit that added it | All | 1, 2, 4 | `<run-id>` is `<element-id>/<phase>/<n>` (`spec-016` §6) |

### Parameters for Agent Execution

| Parameter | Type | Description | Where Found | How Managed | Where Saved |
|-----------|------|-------------|-------------|-------------|-------------|
| `--next` | flag | Resolve workflow, phase, element and role from the next step | Active workflow's next step | If set, queries the active instance and loads the step's role + element automatically | N/A (affects behavior, not stored) |
| `--workflow`, `--step` | string | The instance (a workflow name or an instance id) and the frontier step to take; each implies `--next` | `workflow next` / `agent list --waiting` output | `spec-016` §3.1 | N/A (selector) |
| `--role` | string | Agent role (developer, reviewer, qa, architect, etc.) | Step definition, or DNA, or flag | Normally taken from the step; flag overrides. If neither, defaults to `developer` with a warning | N/A (used for context filtering) |
| `--agent` | string | The `team.agents` entry to launch | `dna show team` | Default: the first entry with an adapter that executes the role | The run record |
| `--element` | string | Target element as `type:id` (e.g. `task:task-101`, `release:rel-...`) | `workflow next` output, or user flag | Resolved from the step with `--next`; override for ad-hoc runs. Must exist in Memory. A filter on `agent list` | N/A (query parameter) |
| `--past`, `--waiting`, `--phase` | flag / string | On `agent list`: the sections shown and the phase filter | User specifies via flag | `spec-016` §5 | N/A (query parameter only) |
| `<run-id>` | string | On `agent show`: `<element-id>/<phase>/<n>` | `agent list --past` output | A malformed id is refused (exit `2`) | The run log under DNA `paths.runs` |

---

## Global Options

Every command accepts these, except `--dry-run`, which only the commands that change the project take:

| Option | Format | Description |
|--------|--------|-------------|
| `--format` | `json`, `yaml`, `console` (default) | Output format, stated once here for every command. JSON/YAML for scripting/CI. Console prints the JSON payload indented for now, unless the command defines its own text (`spec-008` §2) |
| `-h`, `--help` | flag | Show command-specific help and examples |
| `-V`, `--version` | flag | Print the build stamp `<semver> (<sha>)` (top level only) |
| `--verbose` | flag | Show detailed execution logs on stderr (useful for debugging) |
| `--no-color` | flag | Disable ANSI colours (accepted; no output is coloured yet) |
| `--no-interactive` | flag | Fail on a missing argument instead of prompting for it (only init prompts) |
| `--dry-run` | flag | Simulate the command without making changes: print the commit it would make (`{dryRun: true, subject, message, paths, diff}`) and write nothing. Taken by the twenty commands whose operation writes — `memory add`, `memory submit`, `memory approve`, `memory reject`, `memory deprecate`, `memory park`, `memory amend`, `dna set`, `dna add`, `dna update`, `dna remove`, `directive create`, `directive assign`, `directive remove`, `workflow start`, `workflow end`, `workflow finalize`, `workflow create`, `workflow remove`, `agent execute` — and placed after the verb, like the command's own options. It is not a root flag: the read commands, init and mcp refuse it as an unknown option, exit `2` (`spec-008` §2, `task-210`). A refused command is refused the same way in a dry run; agent execute prints the launch plan instead of a commit |

---

## Command-Line Syntax Conventions

- **Subcommand structure:** `wingfoil <noun> [<verb>] [<target>] [<options>]`
    - Example: `wingfoil memory add --type adr --title "Async Design"`
    - Example: `wingfoil workflow status --format json`

- **Positional vs. option:** a parameter is **positional** when it identifies the target of the command, and an
  **option** when it names an attribute of the action (`dl-082-cli-parameter-shape`)
    - Notation: a required positional is written `<angle>` and an optional one `[<brackets>]`, with the names
      `--help` uses — `memory approve <id>`, `workflow end [<ref>]`, `dna show [<section>]` — as
      `spec-008-cli-grammar`, `spec-016` and `spec-017` write them. Every command row above follows it, and the
      parameter tables name positionals the same way (two rows keep
      the name a guard pins: Pillar 2's `category`, which `test/docs/x-cli-cmds.test.ts` reads, and Pillar 3's `ROLE`,
      which the `bug-257` guard reads)
    - If a required argument is missing, the command exits `2` with an `error: missing required argument: …`
      message that names what is missing: a missing **option** by its flag (`wingfoil memory add` → `--type`;
      `wingfoil dna set project.license` → `--value`), a missing **positional** by its name, followed by the
      command's usage on a `hint:` line (`wingfoil memory approve` → `<id>`, then
      `hint: usage: wingfoil memory approve <id> --reason <text>`)

- **Interactive mode — specified, and built for `init` only.** `spec-008-cli-grammar` §4 specifies that a command with a
  missing required argument prompts for it in a TTY unless `--no-interactive` is passed. **As shipped, only `wingfoil
  init` has a prompt layer**; every other command fails immediately whether or not it is on a TTY
    - Specified: `wingfoil memory add` prompts for type, title, tags (`spec-008` §4)
    - Shipped: `wingfoil memory add` → `error: missing required argument: --type`, exit `2`
    - Shipped and specified agree here: `wingfoil memory add --type adr --title "title"` runs without prompts

- **Output formats:** All output commands support `--format <console|json|yaml>` (Global Options)
    - Console (default): indented JSON today, or the command's own text where its spec defines one
    - JSON/YAML: machine-parseable for scripting and CI/CD

- **State and commits:** Commands that modify state (`memory add`, `submit`, `approve`, `reject`, `deprecate`, `park`,
  `amend`; `dna set`, `add`, `update`, `remove`; `directive create`, `assign`, `remove`; `workflow start`, `end`,
  `finalize`, `create`, `remove`; `agent execute`, whose commit records the run) automatically:
    - Create git commits with descriptive messages
    - Update relevant state files (Memory frontmatter, DNA YAML, etc.)
    - Include actor name and timestamp in state records

---

## Release Timeline by Command

**v0.1 (Jul 10):**

- Pillar 1: `memory add`, `memory search`
- Pillar 2: `dna set`, `dna show`, `paths`
- Pillar 5: `init` (wizard/params modes)

**v0.2 (Jul 17):**

- Pillar 1: `memory submit`, `memory approve`, `memory reject`, `memory deprecate`, `memory history`
- Pillar 2: `dna add`, `dna remove`, `dna update` — the rest of `P2.1`'s CRUD, decomposed by `dl-081` and spelled by
  `dl-082`. `dna set` loses its second positional in the same release — a **breaking change to a shipped command**,
  landing before `minor-v0.2` is published, to be recorded in the changelog the `user-docs` phase owns (`dl-013`)
- Pillar 3: `directive create`, `directive assign`, `directive remove`, `directives list`

**v0.3 (Jul 24):**

- Pillar 4: `workflow list`, `workflow show`, `workflow start`, `workflow end`, `workflow next`, `workflow status`,
  `workflow finalize`, `workflow create`, `workflow remove`
- Agent: `agent execute`, `agent list`, `agent show`
- Pillar 1: `memory park`, `memory amend`, `memory add --workflow`
- Every writing command: `--dry-run`; `directive assign` and the `dna` write verbs: `--force`
- *(Note: v0.3 integrates the v0.2 Memory lifecycle verbs into workflow steps — fallback, approval routing — but does
  not re-deliver them.)*

**v0.4 (Jul 31):**

- Pillar 1: `memory import`
- Pillar 2: `dna infer`
- Pillar 5: `audit`, `init --mode infer`, `init --template`

**v1.0 (Aug 7):**

- All commands stable and polished

---

## Command Reference by Persona

### Alex (Solo Developer)

**Primary commands:** `workflow next`, `agent execute --next`, `memory search`, `dna show`, `init`

- Starts each session with `workflow next` to see next task
- Launches agent with `agent execute --next` to pre-load context
- Searches Memory to find past decisions
- Queries DNA for project structure

### Morgan (Tech Lead)

**Primary commands:** `directive create`, `directive assign`, `workflow status`, `memory submit`, `memory approve`,
`memory reject`, `dna set`, `init`

- Creates and manages custom directives
- Tracks all workflows and approves/rejects deliverables
- Updates DNA when the stacks or the methodology change
- Documents architectural decisions in Memory

### Casey (Non-Technical Manager)

**Primary commands:** `memory search`, `dna show`, `workflow status`, `memory history`

- Searches Memory for project decisions
- Queries DNA for team structure and stacks
- Checks workflow status to identify bottlenecks
- Views audit trail and decision history

### Jordan (Team Developer)

**Primary commands:** `workflow next`, `directives list`, `agent execute --role developer`, `memory search`

- Gets assigned tasks via `workflow next`
- Views team directives with `directives list`
- Launches agents with developer role
- Finds relevant decisions in Memory

### Sam (Code Reviewer)

**Primary commands:** `workflow status`, `agent execute --role reviewer`, `memory approve`, `memory reject`

- Checks pending reviews via `workflow status`
- Launches review agent with review role
- Submits review decisions via `memory approve` or `memory reject`

---

## Revision history

**Version 1.7 (2026-10-15) — every row states the shipped grammar in one notation, the v0.3 commands get their rows,
and the stale claims go, per `task-245` (`bug-099`, `bug-100`, `bug-274`, `bug-275`).** Each command row was rewritten
from the command's `--help` (`node dist/cli.js <command> --help` on the build of `main` `2de79ef9`) and checked against
`spec-008-cli-grammar` §1, §2 and §12, `spec-016` §3.1, §5 and §6 and `spec-017` §7.

What changed:

- **One notation.** A required positional is `<angle>`, an optional one `[<brackets>]`, with `--help`'s names: the
  Pillar 1 ids, the workflow refs and the directive name are now written as the CLI takes them, and Pillar 2's
  uppercase placeholders are respelled the same way. The note that some pillars still bracketed a required positional
  is gone with the rows it described (`bug-100`).
- **New rows:** `memory park` (`task-180`), `memory amend` (`task-127`), `workflow finalize` (`task-226`), `agent list`
  (`task-240`), `agent show` (`task-220`). `memory add` gains `--set`, `--workflow` and `--step` (`task-227`),
  `agent execute` gains `--workflow`, `--step` and `--agent` (`task-235`, `task-228`), `directive assign` and the `dna`
  write verbs gain `--force` (`task-169`, `task-193`), and the workflow rows take spec-017's positionals: `start
  <name>`, `end`, `next`, `status`, `finalize` with an optional `<ref>`, `show <ref>`, `create <name>`, `remove <ref>`
  (`task-204`, `task-211`, `task-217`).
- **`paths`** lists seven categories, `runs` and `health` added, and the `--entry-<field>` row gains
  `--entry-adapter` (`task-138`).
- **`--dry-run`** is described as it ships: an option of the twenty commands that write, after the verb, refused
  elsewhere (`task-210`), not a flag every command takes. Global Options also gains `--no-color`,
  `--no-interactive` and `--version`, and `--format` is stated there once instead of on ten rows.
- **Dropped, because no feature, story, scenario or spec declares them and no build registers them:** `memory submit
  --notes`; `directive create --file-format` and `--template`; `directive assign --scope`; `directive remove
  --verify-usage` (the referrer check always runs); `directives list --built-in/--custom/--all`; `workflow status
  --filter`; the workflow `--name` option and `workflow remove --verify-includes` (`spec-017` §7 removed both); `init`'s
  stack and team-size flags and its `--confirm`. Kept and marked *Not built*: `memory import`, `dna infer`, `audit` and
  `init --mode infer`.
- **The DNA-sync passages** (Pillars 2–5) no longer name the retired fixed-key stack field and are marked *Not built*:
  no command synchronizes directives or workflows with the DNA, and no feature schedules it. `directive create` and
  `workflow create` no longer claim an interactive form; only `init` prompts.
- **The default state machine** is described as `memory.yaml` and REQ-STATE-08 describe it — draft → pending →
  approved, `reject` back to draft, `deprecated` from any state — in the Pillar 1 philosophy, the `memory search` row
  and the `status` parameter (`bug-275`, which fixed the same line in `06_features.md`, `07_sequencer.md` and
  `08_mvp-canvas.md`; `07_sequencer.md` goes 1.9 → 2.0, by the batch rule of 2026-10-15 that a bump past x.9 is
  (x+1).0 — earlier bumps of `06_features.md` and `08_mvp-canvas.md` went past x.9).
- **Same-class corrections** in the sections rewritten: the missing-argument convention takes `task-179`'s shape;
  `dna show`'s sections are the five `--help` lists; the id comes from the type's `id_pattern`; the active-context
  paragraph selects by `<ref>`; workflows are startable or includable (`dl-109`); the v0.3 release list, the *State and
  commits* list and Sam's `workflow status` line follow the shipped commands. Three Notes cells lost a claim no build
  makes: `memory reject` no longer says it follows a workflow step's fallback, `memory submit` no longer says
  gate-only types just record a pending approval, and `workflow end` no longer says it marks the workflow
  "completed" (it moves the plan to `done`).

No other row changed meaning. Version 1.3's entry below keeps the words it was written with.

**Version 1.6 (2026-10-06) — Memory documents are placed at their declared paths, and the `ROLE` row uses `dna show`'s
positional section, per `task-259` (`bug-256`, `bug-257`).** Since `task-017` a Memory document is written at the path
its type declares in `.wingfoil/memory.yaml`, resolved against the project root, and `.wingfoil/memory/` holds only
the type templates (`.wingfoil/memory/templates/`); `task-172` keeps every writer inside the root. The `memory add`
row, the `TYPE` row's *Where Saved* cell and the `path` row's still named a per-type directory under the
configuration folder, which no build writes to. The `ROLE` row listed roles through a `dna show` option the CLI
refuses at exit `2`: since `dl-082` the section is a positional (`dna show team`), as the `dna show [SECTION]` row in
Pillar 2 already says. No other row changed.

**Version 1.5 (2026-10-05) — the *On interactivity* example takes the missing-operand refusal's new shape, per
`task-179` (`833ec080`).** Since `task-179` a missing required positional is refused as `error: missing required
argument: <path>`, with the command's usage on a `hint:` line, instead of the synopsis after the colon; the Pillar 2
note's `wingfoil dna set` example was respelled to match. The bump wrote no entry at the time; this one was added by
`task-245` (`bug-275`). No row changed.

**Version 1.4 (2026-10-05) — Pillar 5 gains the `wingfoil mcp` row, per `task-165` (`bug-028`,
`dl-046-bootstrap-commands-in-spec-006-section-3`).** `wingfoil mcp` has shipped since `task-030`, and
`spec-008-cli-grammar` §1 says its grammar matches this map, which had no row for it. The row names it a
bootstrap command, outside the MCP surface it starts. No other row changed.

**Version 1.3 (2026-09-24) — Pillar 2 is brought onto `dl-082-cli-parameter-shape`'s grammar, and two claims that were
never true of a shipped command are retired.** Closes `bug-090-dna-set-grammar-differs-across-three-artefacts`.

What changed:

- **`dna set`** is respelled `wingfoil dna set <PATH> --value VALUE`. Version 1.2 specified
  `dna set [--field FIELD] [--value VALUE]`, a grammar no build has ever had.
- **`dna add`, `dna update`, `dna remove`** get rows. They are `P2.1`'s "Basic CRUD operations"
  (`docs/01_vision/06_features.md`), decomposed into four verbs by `dl-081-dna-mutation-surface-shape` and spelled by
  `dl-082`. The authority was always here; only the record was missing — `bug-090`'s 2026-09-24 note sets that out.
- **`dna show`** is respelled `dna show [SECTION]`: the section is a positional, and it is a top-level key, not a dotted
  path.
- **The `tech-stack.backend` example is gone.** `spec-002-dna-yaml-schema` renamed `tech-stack` to `stacks` and made
  `technologies` a list of `{name, category, …}` entries; the old example is refused at exit `1`. Every example now in
  the Pillar 2 tables was executed against a `wingfoil init --template Scrum` repository before being written.
- **"interactive or flag-based" is corrected, not deleted.** Only `init` has a prompt layer today. The prompt layer
  remains specified for every command in `spec-008-cli-grammar` §4; the tables now say which of the two a reader is
  looking at.

**Why an Approved vision document was corrected to match the implementation.** CLAUDE.md §10.1 puts `docs/01_vision/`
above configuration and code, so the ordinary remedy for a mismatch is to change the code. `dl-082`'s Decision section
records why this case is the exception, and confines it to this case: the Version 1.2 row was not describing an unbuilt
intention that the code had failed to honour — it described a *grammar*, one of three in circulation, against a schema
(`tech-stack.backend`) the project had already retired, and the shape it named is not the shape `dl-082` adopts either.
No layer is overruled by the code here; all three layers are moved onto a rule none of them had stated. Do not read this
revision as a precedent for correcting the vision to the implementation generally.

**Not changed in this pass:** the per-row `[--format json/yaml]` annotations — all **ten** of them, `dna show`'s
included, which keeps its annotation across the respelling — the DNA-change *Sync Process* paragraphs in Pillars 2/3/4,
and the `--dry-run` row under Global Options. See `task-098`'s Execution Notes for the measurements behind each.
