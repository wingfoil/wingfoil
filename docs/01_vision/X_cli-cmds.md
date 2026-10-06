# CLI Commands Reference — WingFoil

**Version:** 1.5
**Date:** 2026-10-05  
**Status:** Approved

---

This document provides a comprehensive reference of all WingFoil CLI commands organized by pillar. Each command includes
its interface, description, actors (personas), user journeys, relevant notes, and parameter specifications.

---

## Pillar 1: Project Memory Commands

**Philosophy:** Memory documents flow through a state machine that is **specific to their element type**, configured in
`.wingfoil/memory.yaml` (P1.13). Each type declares its path pattern, name, tags and allowed states + transitions; a
`defaults` block (draft → pending → approved/rejected → deprecated) applies to any type that does not override it. The
verbs below (`submit`/`approve`/`reject`/`deprecate`) perform the legal transition for the document's current state and
type — so e.g. approving a `task` during planning lands in `backlog`, while approving it after review lands in
`approved`. This mirrors the Workflow pillars but operates at the document level.

| Command                                                                                 | Description                                                                 | Actors              | Journeys  | Notes                                                                                                                                                                                                   |
|-----------------------------------------------------------------------------------------|-----------------------------------------------------------------------------|---------------------|-----------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `wingfoil memory add [--type TYPE] [--title "title"] [--tags "tag1,tag2"]`              | Create new Memory document (draft state) with specified type                | Morgan, Alex, Casey | 0a, 0b, 5 | Creates document in `.wingfoil/memory/[TYPE]/[document-id].md` with frontmatter state. Assigns unique document-id (UUID or slug)                                                                        |
| `wingfoil memory search [keyword] [--type TYPE] [--status STATUS] [--format json/yaml]` | Query Memory by keyword, type, and status                                   | Casey, Alex, Jordan | 1, 3, 5   | Keyword search only in v0.1. Filters by type (adr, rfc, decision, task, etc.) and status (states are type-dependent — see `.wingfoil/memory.yaml`; e.g. draft, pending, approved, rejected, deprecated) |
| `wingfoil memory import [path] [--action copy/move/link]`                               | Scan existing docs and import into Memory                                   | Morgan, Alex        | 0b        | Interactive if `--action` not specified. Prevents duplicates by checking filename hash. Supports: copy (new file), move (original deleted), link (symlink, avoids duplication)                          |
| `wingfoil memory submit [document-id] [--notes "text"]`                                 | Submit Memory document for approval (advances per the type's "submit" edge) | Morgan, Alex        | 2, 4, 5   | Performs the type's legal submit transition (e.g. task draft → pending); gate-only types just record `pending_approval`. Recorded in frontmatter + git commit                                           |
| `wingfoil memory approve [document-id] [--reason "reason"]`                             | Approve Memory document (advances per the type's "accept" edge)             | Morgan, Casey, Sam  | 2, 4, 5   | Destination state depends on type + current state (e.g. task: pending → backlog, in-review → approved). Records approver, timestamp, reason. Creates git commit                                         |
| `wingfoil memory reject [document-id] [--reason "reason"]`                              | Reject Memory document (advances per the type's "reject" edge)              | Morgan, Casey, Sam  | 2, 4, 5   | When invoked inside a workflow step, follows the step's `fallback` (target step + optional `set_state`). Reason stored in frontmatter. Creates git commit                                               |
| `wingfoil memory deprecate [document-id] [--reason "reason"]`                           | Mark Memory document as deprecated (any state → deprecated)                 | Morgan, Casey       | 2, 3, 5   | Document remains in repo (not deleted) but marked as obsolete. Reason recorded. Agents ignore deprecated docs in context loading                                                                        |
| `wingfoil memory history [document-id] [--format json/yaml]`                            | View audit trail of Memory document (commits, approvals, state changes)     | Morgan, Casey       | 2, 3, 5   | Shows full git history + state transitions from frontmatter                                                                                                                                             |

### Parameters for Pillar 1 Commands

| Parameter               | Type               | Description                                                                                                                                                                                                       | Where Found                                            | How Managed                                                                       | Where Saved                                                            |
|-------------------------|--------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------|-----------------------------------------------------------------------------------|------------------------------------------------------------------------|
| `document-id`           | string (slug/UUID) | Unique identifier for Memory document                                                                                                                                                                             | Auto-generated on `memory add`, or provided in command | System generates if not specified (e.g., `adr-001-async-design`) or user provides | Filename and frontmatter `id:` field                                   |
| `TYPE`                  | enum               | Document type: adr, rfc, decision, task, release, risk, etc.                                                                                                                                                      | User selects during `memory add` (interactive or flag) | Dropdown menu or `--type` flag                                                    | Directory structure `.wingfoil/memory/[TYPE]/` and frontmatter `type:` |
| `document-id` (history) | string             | ID of document to view history for                                                                                                                                                                                | Provided in command                                    | Must exist in Memory                                                              | Retrieved from filename                                                |
| `--title`               | string             | Document title for new Memory document (on `memory add`)                                                                                                                                                          | User input (flag or interactive prompt)                | Captured at creation                                                              | Frontmatter `title:` field                                             |
| `--tags`                | string (csv)       | Comma-separated tags for new Memory document (on `memory add`)                                                                                                                                                    | User input (flag or interactive prompt)                | Parsed into list of tags                                                          | Frontmatter `tags:` field                                              |
| `keyword`               | string             | Positional search term on `memory search`                                                                                                                                                                         | Provided in command                                    | Keyword search only in v0.1                                                       | N/A (query parameter only)                                             |
| `path`                  | string (path)      | Positional source path on `memory import`                                                                                                                                                                         | Provided in command                                    | Path to existing doc(s) to scan/import                                            | N/A (input to import; imported doc saved under `.wingfoil/memory/`)    |
| `--action`              | enum               | Import action on `memory import`: copy, move, link                                                                                                                                                                | User input (flag or interactive prompt)                | copy (new file), move (original deleted), link (symlink)                          | N/A (affects how imported file is placed)                              |
| `--notes`               | string             | Notes attached on `memory submit`                                                                                                                                                                                 | User input (flag)                                      | Recorded with the submit transition                                               | Frontmatter + git commit message                                       |
| `--reason`              | string             | Reason on `memory approve`/`reject`/`deprecate`                                                                                                                                                                   | User input (flag)                                      | Recorded with the transition                                                      | Frontmatter, tracked via git commit                                    |
| `status`                | enum               | Document state (type-dependent per `.wingfoil/memory.yaml`; default: draft, pending, approved, rejected, deprecated) — type-specific states (e.g., `backlog`, `in-review`) also exist per `.wingfoil/memory.yaml` | Auto-tracked in frontmatter                            | Per-type state machine transitions (submit, approve, reject, deprecate)           | Frontmatter `status:` field, tracked via git commits                   |

---

## Pillar 2: Project DNA Commands

**Philosophy:** DNA is the source of truth for project structure, tech stack, and team. Changes to DNA trigger automatic
synchronization of Directives and Workflow built-in templates. DNA structure is the top-level keys of `dna.yaml` as
`spec-002-dna-yaml-schema` declares them: `version`, `project`, `modules`, `stacks` (`technologies` + `methodologies`),
`team` (`members`, `agents`, `roles`), and `paths`. There is no `tech-stack` key and no `conventions` key — `spec-002`
renamed the first to `stacks` and removed the second, its rules having moved to `.wingfoil/directives/custom/`.

**Parameter shape (`dl-082-cli-parameter-shape`, `ready`):** across every pillar, **a positional carries the identity of
the thing the command acts on** — a DNA path, a document id, a category — and **an option carries a named attribute of
the action** (`--value`, `--type`, `--reason`, `--entry-<field>`). The four write verbs below are `P2.1`'s "Basic CRUD
operations" decomposed by `dl-081-dna-mutation-surface-shape`; `P2.1` authorises the CRUD, `dl-081` chose the four-verb
decomposition, and `dl-082` fixed the spelling.

| Command                                                                     | Description                                                                         | Actors       | Journeys  | Notes                                                                                                                                                                                                                                                    |
|-----------------------------------------------------------------------------|-------------------------------------------------------------------------------------|--------------|-----------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `wingfoil dna set <PATH> --value VALUE`                                     | Update an existing **scalar** DNA field                                             | All          | 0a, 6     | Modifies `.wingfoil/dna.yaml` and creates a `wf(dna): set <PATH>` commit. `<PATH>` is the full dotted path to a scalar leaf — `dna set project.license --value MIT`. A path the schema does not declare is **refused**, never created (`bug-084`). Collections and lists go through `add`/`remove`/`update` |
| `wingfoil dna add <PATH> --value VALUE [--entry-FIELD VALUE ...]`           | Add an entry to a DNA collection, or a value to a list                              | All          | 0a, 6     | `--value` is the new entry's `name` when `<PATH>` ends at a collection — `dna add stacks.technologies --value TypeScript --entry-category language`. One `--entry-<field>` per field the entry schema declares; the `entry-` prefix keeps that derived namespace disjoint from the global flags (`spec-008` §9) |
| `wingfoil dna update <PATH> --value VALUE [--entry-FIELD VALUE ...]`        | Update an existing entry or leaf, addressed by name                                 | All          | 0a, 6     | Entries are addressed by `name`, never by index (`dl-081`) — `dna update stacks.technologies --value TypeScript --entry-version 5.9`. Reaches a nested field of a named entry directly: `dna update modules.core.path --value src/core`                  |
| `wingfoil dna remove <PATH> --value VALUE`                                  | Remove an entry from a DNA collection, or a value from a list                       | All          | 0a, 6     | `--value` names the entry to remove — `dna remove stacks.technologies --value TypeScript`. Refused when `<PATH>` or the named entry does not resolve                                                                                                    |
| `wingfoil dna show [SECTION] [--format json/yaml]`                          | Query and display project DNA                                                       | Casey, All   | 3, 5      | Show the full DNA, or one **top-level** section as a positional: `version`, `project`, `modules`, `stacks`, `team`, `paths`. Not a dotted path — `dna show stacks.technologies` is refused (exit `1`)                                                              |
| `wingfoil dna infer [--confirm]`                                            | Auto-scan codebase and propose DNA structure                                        | Morgan, Alex | 0b        | *Not built* (`spec-006`: planned). Infers modules from directory structure, languages/frameworks from files. Requires human review/approval before updating DNA                                                                                          |
| `wingfoil paths [category] [--format json/yaml]`                            | Query project resource paths by category (sources, tests, docs, config, governance) | All          | 0a, 0b, 5 | Reads from DNA `paths:` section. Drill-down support (e.g., `paths sources --list`). Console/JSON/YAML output                                                                                                                                            |

> **On interactivity.** No DNA command prompts. `init` is the only command with a prompt layer — the negatable global
> `--interactive` is read only by it — and every other command fails immediately on a missing required argument, at exit
> `2`: `wingfoil dna set` → `error: missing required argument: <path>` (then `hint: usage: wingfoil dna set <path> --value <value>`),
> `wingfoil dna set project.license` → `error: missing required argument: --value`. The prompt layer is not abandoned
> scope: it stays specified for all commands in `spec-008-cli-grammar` §4 ("Interactive-prompt rules"), which is where a
> reader should look for the intended behaviour. What is written above is what ships; §4 is what is intended.

### Parameters for Pillar 2 Commands

| Parameter        | Type         | Description                                                                                                                                                                                                        | Where Found                            | How Managed                                                                            | Where Saved                         |
|------------------|--------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------------------------------------|----------------------------------------------------------------------------------------|-------------------------------------|
| `PATH`           | path         | **Positional**, and the only positional a write verb reads. The full dotted path to the target — `project.license`, `stacks.technologies`, `modules.core.path`. Never a bare field name: `team.roles` and `team.members.<name>.roles` are different fields | User specifies in the command          | Resolved against the `dna.yaml` schema; an undeclared path is refused (exit `1`)        | `.wingfoil/dna.yaml` nested keys    |
| `--value`        | string/array | The new entry's **identity** when `PATH` ends at a collection; the new **value** when it ends at a leaf. Comma-separated where the field is a list of values                                                     | User input (flag)                      | Validated against DNA schema                                                            | `.wingfoil/dna.yaml`                |
| `--entry-<field>` | string/array | One option per field the entry schema declares — `--entry-description`, `--entry-path`, `--entry-email`, `--entry-roles`, `--entry-category`, `--entry-version`, `--entry-notes`, `--entry-phase`, `--entry-executes_as`, `--entry-approval_authority`. Accepted by `add` and `update` | User input (flag)                      | The `entry-` prefix is required; it keeps this derived namespace disjoint from the global flags (`spec-008` §9) | `.wingfoil/dna.yaml` entry fields   |
| `SECTION`        | enum         | **Positional** on `dna show`: one top-level DNA key — `version`, `project`, `modules`, `stacks`, `team`, `paths`                                                                                                 | User specifies, or omits to show all   | Matches top-level keys in YAML; a dotted path is refused                                | `.wingfoil/dna.yaml`                |
| `category`       | enum         | Resource path category: sources, tests, docs, config, governance                                                                                                                                                 | User specifies                         | Defined in DNA `paths:` section                                                         | `.wingfoil/dna.yaml` under `paths:` |
| `--confirm`      | flag         | On `dna infer`; skip confirmation and accept proposed DNA                                                                                                                                                        | User specifies via flag                | If set, auto-confirms inferred values without prompting                                 | N/A (affects execution flow)        |
| `--list`         | flag         | Drill-down on `paths` (e.g., `paths sources --list`)                                                                                                                                                             | User specifies via flag                | If set, expands the category into its full list of paths                                | N/A (affects query output only)     |

---

## Pillar 3: Project Directives Commands

**Philosophy:** Directives are of two kinds:

1. **Built-in directives:** Auto-installed during project init based on tech-stack and methodology chosen in DNA.
   Automatically synced when DNA changes (removed/added based on updated stack).
2. **Custom directives:** Created by tech lead/architect. Associated with specific roles or globally scoped. Manually
   managed.

**Sync Process:** When `wingfoil dna set` updates `tech-stack` or `methodology`, WingFoil automatically:

- Installs new built-in directives for added stack choices
- Removes directives for removed stack choices
- Updates role→directive assignments to reflect new built-in set

| Command                                                                                             | Description                                                  | Actors       | Journeys | Notes                                                                                                                                                                  |
|-----------------------------------------------------------------------------------------------------|--------------------------------------------------------------|--------------|----------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `wingfoil directive create [--name NAME] [--file-format md/yaml] [--template TEMPLATE]`             | Create new custom directive file (interactive or flag-based) | Morgan, Alex | 0a, 4    | Creates `.wingfoil/directives/custom/[name].md`. Unique within custom directives. Not auto-removed                                                                     |
| `wingfoil directive assign [--directive DIRECTIVE_ID] [--role ROLE] [--scope global/role-specific]` | Bind custom directive to role(s) or make global              | Morgan       | 2, 6     | Maps custom directive to roles defined in DNA. One directive can bind to multiple roles. Records in `.wingfoil/roles.yaml`                           |
| `wingfoil directive remove [--directive DIRECTIVE_ID] [--verify-usage]`                             | Disassociate custom directive from roles and remove it       | Morgan, Alex | 2, 4, 6  | Only removes custom directives (built-in removed via DNA change). `--verify-usage` checks if directive is referenced anywhere before removal. Removes from assignments |
| `wingfoil directives list [--role ROLE] [--built-in/--custom/--all] [--format json/yaml]`           | List all directives (built-in + custom) and role assignments | All          | All      | Shows: directive id, name, type (built-in/custom), roles assigned, scope. Can filter by role or type                                                                   |

### Parameters for Pillar 3 Commands

| Parameter                   | Type   | Description                                                                         | Where Found                                 | How Managed                                                        | Where Saved                                                              |
|-----------------------------|--------|-------------------------------------------------------------------------------------|---------------------------------------------|--------------------------------------------------------------------|--------------------------------------------------------------------------|
| `NAME`                      | string | Custom directive name (slug format)                                                 | User input or auto-generated from template  | Must be unique within custom directives. Auto-slug if not provided | Filename `.wingfoil/directives/custom/[name].md`                         |
| `DIRECTIVE_ID`              | string | Unique ID of directive (built-in or custom)                                         | Listed via `directives list` or in filename | System-managed (UUID or slug)                                      | Directive filename or registry                                           |
| `ROLE`                      | string | Role name defined in DNA (developer, reviewer, qa, architect, etc.)                 | Listed via `dna show --section team`        | Defined in DNA, referenced in assignments                          | `.wingfoil/roles.yaml`                                 |
| `SCOPE`                     | enum   | Scope type: global (all roles) or role-specific                                     | User specifies via flag                     | Controls whether directive applies to all roles or specific ones   | `.wingfoil/roles.yaml` mapping                         |
| `--built-in/--custom/--all` | flag   | Filter directive type                                                               | User selects                                | Separates installed built-in from user-created custom              | Inferred from directory: `.wingfoil/directives/built-in/` vs `custom/`   |
| `TEMPLATE`                  | string | Value of `--template` on `directive create`: starter template for the new directive | User input or selected during create        | Determines initial content/scaffolding of the directive file       | N/A (input only; result saved in directive file)                         |
| `--file-format`             | enum   | Directive file content format on `directive create`: md or yaml                     | User specifies via flag                     | Controls the on-disk format of the created directive file          | File extension/content of `.wingfoil/directives/custom/[name].[md/yaml]` |
| `--verify-usage`            | flag   | On `directive remove`; checks if directive is referenced anywhere before removal    | User specifies via flag                     | If set, scans references before removing the custom directive      | N/A (affects behavior, not stored)                                       |

---

## Pillar 4: Project Workflow Commands

**Philosophy:** Similar to Directives, Workflows are:

1. **Built-in templates:** Auto-installed during init based on methodology in DNA (Scrum, Kanban, Lean, Trunk-Based).
   Auto-synced when DNA changes.
2. **Custom workflows:** Created by tech lead/architect. Can be included in main workflow via `include()` directive.

**File layout:** `.wingfoil/workflows.yaml` is the **main configuration file**. It does not contain every workflow
inline — it references the built-in and custom workflow files via `include()`. Built-in templates live in
`.wingfoil/workflows/built-in/`, custom workflows in `.wingfoil/workflows/custom/`.

**Kinds (main vs sub):** every workflow declares `kind: main` (independently startable — e.g. `release-cycle`,
`report-bug`, `create-rfc`) or `kind: sub` (include-only — e.g. a TDD `dev-loop`). A sub is never started directly; it
runs when a phase `include()`s it, optionally per element via `iterate_over: <type>` with `where` filters.

**Active workflow context:** `wingfoil workflow start <name>` sets the **active** workflow; subsequent commands
(`next`, `status`, `agent execute --next`, `memory submit/approve`) target it unless `--name` is given. Multiple main
workflows may be open at once (e.g. `start report-bug` during a `release-cycle` phase); commands always reference the
**last** started. `workflow end` closes the active (or named) workflow and restores the previous context.

**Sync Process:** When `wingfoil dna set methodology` updates, WingFoil:

- Copies/updates built-in template files to `.wingfoil/workflows/built-in/`
- Syncs methodology-specific configuration
- Preserves custom workflows (not auto-removed)

| Command                                                            | Description                                                                 | Actors               | Journeys      | Notes                                                                                                                                                          |
|--------------------------------------------------------------------|-----------------------------------------------------------------------------|----------------------|---------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `wingfoil workflow status [--filter STATUS] [--format json/yaml]`  | Show state of all open (active) main workflows and pending approvals        | Morgan, Casey, Sam   | 2, 3, 4, 5, 6 | Dashboard view; highlights the active workflow. Useful for identifying bottlenecks. Filterable by approval status                                              |
| `wingfoil workflow next [--assigned-to USER] [--format json/yaml]` | Show next step of the active workflow, its element + directives             | Alex, Morgan, Jordan | 1, 4          | Reports the **element of the current step** (e.g. REL in planning, TASK in implementation), next action, and auto-loaded directives for the role               |
| `wingfoil workflow start [--name NAME]`                            | Open a **main** workflow; set it as the active context; init first step     | Morgan, Alex         | 0a, 0b        | Only main workflows are startable. Sets active context (last-start-wins). Creates git commit. Subs run via `include()`, never via start                        |
| `wingfoil workflow end [--name NAME]`                              | Close the active (or named) main workflow; restore previous context         | Morgan, Alex         | 0a, 0b        | Marks workflow "completed"; clears/restores active context. Creates git commit                                                                                 |
| `wingfoil workflow list [--all] [--format json/yaml]`              | List workflows **executable now** (`--all` for every defined workflow)      | All                  | 0a, 0b        | Context-aware: startable mains + a sub when it is the next executable step. `--all` shows every defined workflow (incl. subs). Shows name, kind, description   |
| `wingfoil workflow show [--name NAME] [--format json/yaml]`        | Display details of a workflow (phases, steps, directives, Memory structure) | All                  | 0a, 0b        | Shows full workflow spec: phases, steps, default directives bound, initial Memory docs to create                                                               |
| `wingfoil workflow create [--name NAME]`                           | Create new custom workflow file (interactive or flag-based)                 | Morgan, Alex         | 2, 4, 6       | Creates `.wingfoil/workflows/custom/[name].yaml`. Custom workflows can be included in main via `include()`. Not auto-removed on DNA change                     |
| `wingfoil workflow remove [--name NAME] [--verify-includes]`       | Remove custom workflow after verifying it's not included elsewhere          | Morgan, Alex         | 2, 4, 6       | Only removes custom workflows (built-in removed via DNA change). `--verify-includes` checks if workflow is referenced in `include()` statements before removal |

### Parameters for Pillar 4 Commands

| Parameter           | Type   | Description                                                                                  | Where Found                                   | How Managed                                                          | Where Saved                                                     |
|---------------------|--------|----------------------------------------------------------------------------------------------|-----------------------------------------------|----------------------------------------------------------------------|-----------------------------------------------------------------|
| `NAME`              | string | Value of `--name` (start/end/show/create/remove): workflow name (built-in or custom)         | Listed via `workflow list` or defined in YAML | Built-in: auto-generated from methodology. Custom: user-defined slug | Filename `.wingfoil/workflows/[built-in or custom]/[name].yaml` |
| `STATUS`            | enum   | Value of `--filter` on `workflow status`: filter by approval/workflow status                 | User specifies via flag                       | Query parameter; not persisted                                       | N/A (query parameter only)                                      |
| `USER`              | string | Value of `--assigned-to` on `workflow next`: person/role (e.g., `me`)                        | User specifies via flag                       | Matched against DNA team members                                     | N/A (query parameter only)                                      |
| `--all`             | flag   | On `workflow list`; shows every defined workflow (incl. subs) instead of only executable-now | User specifies via flag                       | If set, lists all defined workflows; otherwise only executable-now   | N/A (affects query scope only)                                  |
| `--verify-includes` | flag   | On `workflow remove`; checks `include()` references before removing a custom workflow        | User specifies via flag                       | If set, scans `include()` statements before removal                  | N/A (affects behavior, not stored)                              |

---

## Pillar 5: Project Initialization Commands

**Philosophy:** Initialization is the one-time setup of WingFoil on a project. Only two commands, three execution modes:
interactive wizard, flag-based, or inferred from repo. Initialization automatically:

- Creates DNA from user input (or inference)
- Installs built-in Directives based on tech-stack + methodology
- Installs built-in Workflows based on methodology
- Initializes Memory structure with suggested sections

| Command                                                                                                                | Description                                                                 | Actors       | Journeys | Notes                                                                                                                                                            |
|------------------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------|--------------|----------|------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `wingfoil init [--mode wizard/params/infer] [--template METHODOLOGY] [--tech-stack STACK] [--team-size N] [--confirm]` | Initialize WingFoil on new or existing project                              | Alex, Morgan | 0a, 0b   | Three modes: wizard (interactive Q&A), params (flags), infer (deduce from repo). Generates DNA, installs built-in directives/workflows, creates Memory structure |
| `wingfoil audit [--output-type full/summary] [--format json/yaml]`                                                     | Scan project and summarize current state (languages, frameworks, structure) | Morgan, Alex | 0b       | Pre-requisite to `init --mode infer`. Shows: repo size, languages, frameworks, module structure, team members (from git history). Helps inform DNA inference     |
| `wingfoil mcp`                                                                                                         | Start the WingFoil MCP server over stdio, for an MCP client to launch       | Alex         | 1        | Bootstrap command, like `init`: not a core operation and not exposed on MCP itself (REQ-SYS-05's exemption, `dl-046-bootstrap-commands-in-spec-006-section-3`). Contract in `spec-014-mcp-server-entry-point` §1 |

### Parameters for Pillar 5 Commands

| Parameter       | Type        | Description                                                                  | Where Found                          | How Managed                                             | Where Saved                       |
|-----------------|-------------|------------------------------------------------------------------------------|--------------------------------------|---------------------------------------------------------|-----------------------------------|
| `--mode`        | enum        | Init execution mode: wizard (interactive), params (flags), infer (from repo) | User specifies or defaults to wizard | If not specified, prompts user to choose                | N/A (affects execution flow only) |
| `METHODOLOGY`   | enum        | Project methodology: scrum, kanban, lean-inception, trunk-based, custom      | User selects during init             | Selects which built-in workflow template to install     | DNA `.yaml` `methodology:` field  |
| `STACK`         | string      | Tech stack shorthand: nodejs-react, python-django, go-postgres, etc.         | User input or inferred from codebase | Determines which built-in Directives to install         | DNA `.yaml` `tech-stack:` section |
| `--confirm`     | flag        | Skip confirmation prompts and proceed with generated DNA                     | User specifies                       | If set, auto-confirms inferred values without prompting | N/A (affects execution flow)      |
| `--team-size`   | integer (N) | Number of team members on `init`                                             | User input (flag or wizard prompt)   | Informs DNA team setup and suggested structure          | DNA `.yaml` `team:` section       |
| `--output-type` | enum        | Audit output detail on `audit`: full or summary                              | User specifies via flag              | Controls verbosity of audit report                      | N/A (affects output only)         |

---

## Agent Execution Commands

| Command                                                             | Description                                                                | Actors | Journeys       | Notes                                                                                                                                                                                                                                                                  |
|---------------------------------------------------------------------|----------------------------------------------------------------------------|--------|----------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `wingfoil agent execute [--next] [--role ROLE] [--element TYPE:ID]` | Launch agent with auto-loaded context (directives, Memory, target element) | All    | 0a, 1, 2, 4, 6 | With `--next` (normal path): **role and target element are resolved from the active workflow's current step** (e.g. role=reviewer, element=task:task-101). Override explicitly with `--element type:id` (and optionally `--role`). Pre-loads Memory context in <30 sec |

### Parameters for Agent Execution

| Parameter   | Type   | Description                                                           | Where Found                          | How Managed                                                                           | Where Saved                        |
|-------------|--------|-----------------------------------------------------------------------|--------------------------------------|---------------------------------------------------------------------------------------|------------------------------------|
| `--next`    | flag   | Resolve role + target element from the current step                   | Active workflow's current step       | If set, queries the active workflow and loads the step's role + element automatically | N/A (affects behavior, not stored) |
| `ROLE`      | string | Agent role (developer, reviewer, qa, architect, etc.)                 | Step definition, or DNA, or flag     | Normally taken from the step; flag overrides. If neither, defaults to `developer`     | N/A (used for context filtering)   |
| `--element` | string | Target element as `type:id` (e.g. `task:task-101`, `release:rel-...`) | `workflow next` output, or user flag | Resolved from the step with `--next`; override for ad-hoc runs. Must exist in Memory  | N/A (query parameter)              |

---

## Global Options

All commands support:

| Option      | Format                              | Description                                                                  |
|-------------|-------------------------------------|------------------------------------------------------------------------------|
| `--format`  | `json`, `yaml`, `console` (default) | Output format. JSON/YAML for scripting/CI. Console for humans                |
| `--help`    | flag                                | Show command-specific help and examples                                      |
| `--dry-run` | flag                                | Simulate command without making changes (creates no commits, no file writes) |
| `--verbose` | flag                                | Show detailed execution logs (useful for debugging)                          |

---

## Command-Line Syntax Conventions

- **Subcommand structure:** `wingfoil [pillar] [verb] [object] [options]`
    - Example: `wingfoil memory add --type adr --title "Async Design"`
    - Example: `wingfoil workflow status --format json`

- **Positional vs. option:** a parameter is **positional** when it identifies the target of the command, and an
  **option** when it names an attribute of the action (`dl-082-cli-parameter-shape`)
    - Notation: a required positional is written `<ANGLE>` and an optional one `[BRACKETS]` — the Pillar 2 write verbs
      above follow this, as `spec-008-cli-grammar` §9 does. The Pillar 1, 3, 4 and 5 rows predate the convention and
      still bracket a required positional (e.g. `memory approve [document-id]`, where the id is required)
    - If a required argument is missing, the command exits `2` with an `error: missing required argument: …`
      message that names what is missing. The text after the colon is per case, not one template: a missing **option**
      is named by its flag (`wingfoil memory add` → `--type`; `wingfoil dna set project.license` → `--value`), while a
      missing **positional** is named by reprinting the command's synopsis (`wingfoil dna set` →
      `wingfoil dna set <path> --value <value>`; `wingfoil memory approve` → `memory approve <id>`)

- **Interactive mode — specified, and built for `init` only.** `spec-008-cli-grammar` §4 specifies that a command with a
  missing required argument prompts for it in a TTY unless `--no-interactive` is passed. **As shipped, only `wingfoil
  init` has a prompt layer**; every other command fails immediately whether or not it is on a TTY
    - Specified: `wingfoil memory add` prompts for type, title, tags (`spec-008` §4)
    - Shipped: `wingfoil memory add` → `error: missing required argument: --type`, exit `2`
    - Shipped and specified agree here: `wingfoil memory add --type adr --title "title"` runs without prompts

- **Output formats:** All output commands support `--format json/yaml/console`
    - Console (default): human-readable, colored output
    - JSON/YAML: machine-parseable for scripting and CI/CD

- **State and commits:** Commands that modify state (memory add, submit, approve, reject, deprecate, `dna set`,
  `dna add`, `dna update`, `dna remove`, directive create) automatically:
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
  `workflow create`, `workflow remove`
- Agent: `agent execute`
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
- Updates DNA when tech stack/methodology changes (triggers auto-sync of directives/workflows)
- Documents architectural decisions in Memory

### Casey (Non-Technical Manager)

**Primary commands:** `memory search`, `dna show`, `workflow status`, `memory history`

- Searches Memory for project decisions
- Queries DNA for team structure and tech stack
- Checks workflow status to identify bottlenecks
- Views audit trail and decision history

### Jordan (Team Developer)

**Primary commands:** `workflow next`, `directives list`, `agent execute --role developer`, `memory search`

- Gets assigned tasks via `workflow next`
- Views team directives with `directives list`
- Launches agents with developer role
- Finds relevant decisions in Memory

### Sam (Code Reviewer)

**Primary commands:** `workflow status --filter pending`, `agent execute --role reviewer`, `memory approve/reject`

- Checks pending reviews via `workflow status`
- Launches review agent with review role
- Submits review decisions via `memory approve/reject`

---

## Revision history

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
