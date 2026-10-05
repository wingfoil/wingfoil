---
id: spec-016-agent-execution
type: tech-spec
title: "Agent execution — adapter manifest, `agent` commands and the run record"
status: approved
scope: "src/agent (planned module) — the agent adapter manifest, `wingfoil agent execute|list|show`, and the run log"
supersedes: ""
release: "v0.3"
contributor: ""
credit: ""
tmpl_version: 260703   # Orignal template version
---

## Context

`adr-012` (drafted in this planning) decides that `wingfoil agent execute` launches **the agent's
own CLI** through a declared per-agent adapter. It does not wrap a model SDK, and context still
reaches the agent over MCP (`adr-004-mcp-over-stdio`). The approver ruled it as R2 of
`release-planning-rel-v0.3-plan`. That ADR fixes the mechanism. The contracts that the mechanism
needs are still unwritten:

- **The adapter manifest.** `dl-135-agent-run-tracking` point 5 lists what "the adapter declares, per
  agent", but no file, schema or placeholder set exists. `.wingfoil/` has no adapter anywhere:
  `ls .wingfoil` → `directives dna.yaml memory memory.yaml README.md roles.yaml WORKFLOW.md workflows
  workflows.yaml`. `dna.yaml`'s only agent declaration is `team.agents` (`.wingfoil/dna.yaml:125-128`):
  a name, `executes_as` and `approval_authority`. `AgentEntry` is `.passthrough()`
  (`src/dna/schema.ts:122-128`), so an extra field would be tolerated and not validated.
- **The `agent` command surface.** The vision plans one command:
  `wingfoil agent execute [--next] [--role ROLE] [--element TYPE:ID]` (`docs/01_vision/X_cli-cmds.md:216`).
  `dl-135` adds `agent list` and `agent show` and splits them across v0.3 and v0.4 (plan R5).
  `spec-006-core-domain-api` §3 has one planned row, `agentExecute` (`spec-006:196`).
- **The run record.** `dl-114-recording-agent-token-consumption` (`ready`, Q1 (A), Q2 (b), Q3 (i),
  `820fd000`), amended by `dl-135` (Q1 (a), Q2 (c), Q3 (a), `7632947b`), fixes what the record holds
  and where it lives in principle: "a run log under a declared path (`dna.yaml` `paths:`), one line
  per run, committed with the Memory operation that closes the step". The line format, the
  field names and the exact run-id rule are left open. The same holds for how the record is committed in
  v0.3, when no WingFoil code closes a step, because P4.10 step execution is v1.0 (plan R3).

Nothing of this exists yet: `grep -cE "name: '(agent|memoryAmend)" src/core/index.ts` → `0`, and
`ls src` has no `agent` directory. Without one definition, each v0.3 task on P5.3.1, P5.3.2 and
P5.4.x would invent its own manifest keys and record fields. `dl-089`'s cost metrics and the
Determinism Index's **P** measure (`dl-131-determinism-index-scope`) would then read a format
that changes from task to task.

## Specification

### 0. Terms

- **Adapter**: the declaration of how to launch one agent CLI (§2).
- **Agent**: a `dna.yaml` `team.agents[]` entry, meaning *who* runs (P2.4, `REQ-SYS-08`). An agent
  names the adapter that says *how* it is launched.
- **Launch kind**: `interactive` (the agent gets the terminal; v0.3) or `headless` (no terminal, a
  structured result; v1.0 with P4.12). `adr-012` point 4.
- **Execution mode**: `fresh`, `resume` or `reference`. It says which earlier session a run builds on
  (`dl-135` point 3). A phase's `mode` in `spec-003` (§ "Execution independence", `dl-135` Action 4)
  declares which modes the phase **allows**; `fresh` is always allowed. The mode that **runs** is
  `fresh` unless the caller asks for the other with `--resume` / `--ref` (v0.4, §7) and the phase
  allows it (`dl-135` point 4). Only `fresh` runs in v0.3.
- **Run**: one launch of an agent process by `agent execute`. A run exists, and has a record, only
  if its agent process was spawned (§3.3 step 14).

### 1. Placement

- A new module `agent`, at `src/agent`, is added to `dna.yaml` `modules` beside the nine that exist
  (`.wingfoil/dna.yaml:33-60`). It owns manifest loading and validation, the launcher, and run-log
  reading and writing.
- Its operations are registered in `CORE_MODULES` (`src/core/index.ts`) under `CoreModule.name`
  `agent`, as every pillar's are (`spec-006` §3–§4). The CLI and MCP surfaces are derived from that
  registration (§8).
- Context assembly is not re-implemented. `agent execute` calls the `spec-012`
  context builder, whose entry today is `assembleExecutionContext` (`src/core/context.ts`).
  Step resolution is not re-implemented either: it is `spec-017`'s (workflow commands and state
  deduction, drafted in the same planning). `agent execute --next` consumes `NextResult.next`
  (`spec-017` §7.3, §8), and `agent list --waiting` consumes `StatusResult.open[].frontier`
  (`spec-017` §7.4, §8).

### 2. Adapter manifest

#### 2.1 Location, kinds, and the link from DNA

```
.wingfoil/agents/
├── built-in/<adapter>.yaml    ← shipped by the npm package; installed by `wingfoil init`
└── custom/<adapter>.yaml      ← written by the project
```

- The file basename is the adapter's `name`. A name present in both `built-in/` and `custom/` is a
  validation error. It is not an override: the same name in both directories would make which one
  launched ambiguous in the run record.
- `built-in/` versus `custom/` is the same structural discriminator that `REQ-SEC-07` keys
  removability on for directives and workflow templates (`05_security-compliance.md:77-85`,
  `spec-011-storage-layout`, `directives/{built-in,custom}/` and `workflows/{built-in,custom}/`),
  applied here **by analogy**: `REQ-SEC-07` names built-in directives and workflow templates only, and
  no `adapter remove` command exists or is planned. Extending the requirement to adapters is an
  amendment listed under Consequences. `wingfoil init` installs the
  built-ins, as it installs the P3.8 directive templates (`task-057`). The installed copy pins the
  launch flags in the project's git history, so two clones launch the same argv (`REQ-SYS-07`).
- `dna.yaml` `team.agents[]` gains one optional field, **`adapter: <adapter-name>`** (`spec-002`
  amendment: the field moves from tolerated by `.passthrough()` to validated). An agent without
  `adapter` can still be named in DNA, but it cannot be launched (§3.7, `NO_ADAPTER`). The DNA stays
  the only place where *who* executes *which roles* is declared. The manifest never lists roles.
- Manifests are read at `HEAD`, because they gate what `agent execute` launches
  (`dl-080` (B), `command-baseline` directive, `spec-006` §6).

#### 2.2 Schema

YAML, validated by a Zod schema in `src/agent`, through the `spec-009` two-pass entry. Unknown keys
are a validation error (`.strict()`), because a misspelt `args` key would otherwise launch the agent
without its MCP registration.

| Field | Type | Req. | Meaning |
|---|---|---|---|
| `name` | string, `spec-009` id class | yes | Equals the file basename. |
| `format` | integer | yes | Manifest format version; `1` in this spec. |
| `command` | string | yes | Executable name or repository-relative path. It is resolved on `PATH` and never run through a shell. |
| `verified_with` | string | built-in: yes | The agent CLI version the built-in was checked against by hand (`adr-012` Consequences). Informational. |
| `version_args` | string[] | no | Argv that prints the agent CLI's version on stdout, recorded as `agent_version`. Absent → `not-reported`. |
| `launch.interactive.args` | string[] | yes | Argv template for the interactive launch (§2.3). |
| `launch.interactive.terminal` | `required` \| `optional` | no (default `required`) | Whether the interactive launch needs a terminal on stdin and stdout (§3.3 step 12, `NO_TERMINAL`). `required` for every agent CLI that owns a terminal session, and for every built-in. `optional` declares an executable that runs to completion on inherited, non-terminal stdio; the fake adapter declares it, which is how the interactive success path runs under Jest and CI with no pseudo-terminal (§2.7). |
| `launch.headless.args` | string[] | no | Argv template for the headless launch. Read from v1.0 (§3.5). |
| `launch.headless.output` | `json` \| `none` | with `headless` | How stdout is read after a headless run. |
| `prompt.via` | `arg` \| `stdin` \| `file` | yes | How the bootstrap (§2.4) reaches the agent: as the `{bootstrap}` argument, on stdin, or as a file whose path is `{bootstrap_file}`. `stdin` is legal only for `headless`, because an interactive agent owns stdin. |
| `mcp.via` | `config-file` \| `args` | yes | How the `wingfoil` MCP server is registered for the launched process (§2.5). There is no `none`: an adapter that cannot register the server is refused (`adr-012` Consequences). |
| `mcp.template` | string | `config-file`: yes | The body of the registration file, with placeholders (§2.3). Rendered to a file outside the repository, and its path passed as `{mcp_config_file}`. |
| `session.id` | `assign` \| `output` \| `lookup` \| `none` | yes | How the session id is obtained (§2.6). |
| `session.assign_args` | string[] | `assign`: yes | Argv fragment carrying `{session_id}`, appended to the launch argv. |
| `session.lookup_args` | string[] | `lookup`: yes | Argv run after the agent exits. Its stdout is one JSON value. |
| `session.field` | JSON path | `output`/`lookup`: yes | Where the id sits in that JSON. |
| `session.resume` | `{ supported: bool, args?: string[] }` | yes | Resume support and argv, with `{session_id}` (`dl-135` point 5). Read from v0.4 (§7). |
| `usage.from` | `output` \| `lookup` \| `none` | yes | Where token usage and model come from (`dl-114` Q3 (i)). |
| `usage.lookup_args` | string[] | `lookup`: yes | As `session.lookup_args`; may be the same argv. |
| `usage.fields` | map | `output`/`lookup`: yes | JSON paths for `model`, `input`, `output`, `cache_read`, `cache_write`. A path not declared, or absent in the JSON, yields `not-reported`, never `0`. |
| `summary.export_args` | string[] | no | Argv exporting a session summary (`dl-135` point 5). Read from v0.4 for `reference` (§7). |

There is deliberately no `env:` field. Credentials stay inside the agent CLI (`adr-012` point 1).
WingFoil passes its own environment through unchanged, and a manifest, which is git-tracked and
secret-scanned (`REQ-SEC-08`, `spec-007`), has nowhere to hold a value that would need scanning.

#### 2.3 Placeholders

A closed set. Each placeholder fills **one or more whole argv elements**: every placeholder fills
exactly one, except `{mcp_args}`, which expands to several. Concatenation inside an element is not
allowed. An unknown placeholder, or one used outside the fields listed, is a manifest validation
error (`dl-090` Q3 (a): "argv, no shell. … Interpolation fills whole arguments only").

| Placeholder | Value | Legal in |
|---|---|---|
| `{bootstrap}` | the bootstrap text (§2.4) | `launch.*.args` when `prompt.via: arg` |
| `{bootstrap_file}` | absolute path of a file holding the bootstrap | `launch.*.args` when `prompt.via: file` |
| `{mcp_config_file}` | absolute path of the rendered `mcp.template` | `launch.*.args` when `mcp.via: config-file` |
| `{mcp_command}` | the MCP server executable (§2.5) | `mcp.template`; `launch.*.args` when `mcp.via: args` |
| `{mcp_args}` | the MCP server's argv; expands to **several** elements in `args`, to a JSON array in `mcp.template` | same as `{mcp_command}` |
| `{session_id}` | the assigned or recorded session id | `session.assign_args`, `session.resume.args`; `session.lookup_args` and `usage.lookup_args` only when `session.id: assign` (under `lookup` or `output` the id is not known before the lookup, and using it there is a manifest validation error) |

Temporary files (`{bootstrap_file}`, `{mcp_config_file}`) are created in the operating system's
temporary directory, never inside the repository, and are removed when `agent execute` exits.

#### 2.4 Bootstrap prompt

The bootstrap is the only text WingFoil puts into the agent's initial prompt. Its bytes are a pure
function of `(role, element, run id, state_ref)`. It has no clock and no host data, and it is LF-terminated
(`REQ-SYS-07`, `REQ-STATE-09`). It is a fixed template owned by this spec:

```
WingFoil run {run_id}: act as role "{role}" on element {type}:{id}.
Your context is assembled at commit {state_ref} and served by the "wingfoil" MCP server
registered for this session. Load it before any other action: {context_instruction}
{handoff_line}
```

`{handoff_line}` is one of two fixed literals, chosen by the element type's template (read at `HEAD`):
`Record your handoff in the element's "## Execution Notes" section.` when the type's
`template.file` contains a `## Execution Notes` heading, else
`Record your handoff in the element's body and in your commit messages.` Today the section exists in
the `task`, `release` and `release-line` templates; the `bug` template's section is `## Triage &
Execution Notes`, so a bug gets the fallback line; and it is absent from `adr`, `decision-log`,
`tech-spec`, `plan` or `service` (`grep -l "^## Execution Notes$" .wingfoil/memory/templates/*`).

`{context_instruction}` names the MCP primitive that carries the assembled context: the
`{role}-session` Prompt (`spec-004` §3.1), which gains the optional arguments `element` and `state`
and with them returns the `spec-012` §7 payload for `(role, element, state)`; without them it is
unchanged (approver ruling R18, 2026-09-30, `release-planning-rel-v0.3-plan`; the `spec-004` §3.1–§3.2 amendment is carried to a task). A Prompt keeps
`adr-004`/`REQ-INT-07`'s "via MCP" and resolves at the
pinned `state`, not the working tree, so the **I** component is exactly `spec-012`'s `(role, element,
stateRef)`. It is a Prompt, not a Resource, so R5's "agent Resources are v0.4" does not apply; it is
served in v0.3 because the production server already serves the role Prompts. Its literal is:

```
Get the MCP prompt "{role}-session" with arguments element="{type}:{id}" and state="{state_ref}".
```

Changing any literal above is a revision of this spec, because the bootstrap is part of the **I**
component (`dl-131`).

#### 2.5 MCP registration

- The server that WingFoil registers is **the build that is running `agent execute`**:
  `{mcp_command}` is the Node executable, and `{mcp_args}` is `[<that build's dist/cli.js>, "mcp"]`
  (`spec-014-mcp-server-entry-point`). The context served then comes from the same code that
  validated it before launch, and the run record's `wingfoil` field names it (§4.2).
- A project's own registration (`.mcp.json`, `dl-026-repo-versioned-mcp-server-config`) is not read
  and not modified. An agent that also reads it may see two `wingfoil` servers. The adapter template
  names its server `wingfoil`, and whether the agent's own precedence rules pick the adapter's is
  checked by hand in the built-in adapter's `verified_with` pass. It is not asserted here.

#### 2.6 Session id, usage, model

- **`assign`**: WingFoil chooses the id before launch and passes it through `session.assign_args`.
  The value is a UUID version 5 over a fixed namespace and the string
  `<absolute repository root>\n<run id>`. It is unique per clone and run and derived, not random. The
  run id stays the identifier WingFoil relies on (`dl-135` Q3 (a)).
- **`output`**: read from the headless JSON output (v1.0 only; for an interactive launch it
  degrades to `not-reported`, because stdout belongs to the agent).
- **`lookup`**: run `session.lookup_args` after the agent exits, with a 10 s time limit; any
  failure yields `not-reported` and a `warning:` line on stderr (§3.4). The lookup never fails the
  run.
- **`none`**: `not-reported`.
- Usage and model follow the same rules through `usage.from`.
- **`not-reported` is the literal string**, never `0`, `null` or an absent key (`dl-114` Decision: "a
  run whose agent reports no usage records that explicitly, never a zero").

#### 2.7 The fake adapter

CI cannot launch a real agent, because it has no credential, no network guarantee and no fixed model
(`adr-012` point 6). The fake is **not** a built-in. It is a custom adapter in the test fixtures, so
that the path tests exercise is the one every project adapter takes:

- `test/fixtures/agents/fake-agent.cjs`, a Node script that:
  - writes its argv, its stdin and its received environment names (not values) to a file named by an
    environment variable the test sets;
  - optionally connects to the `wingfoil` server given in its MCP config, and performs `initialize`
    and the `{role}-session` Prompt fetch with `element` and `state` (§2.4);
  - optionally calls the headless result Tool (v1.0);
  - prints a declared JSON document (session id, model, usage) for `output`/`lookup`;
  - exits with a declared code, or waits to be killed by a signal.
- `test/fixtures/agents/custom/fake.yaml`, declaring that script with every manifest field
  exercised and `launch.interactive.terminal: optional`. Jest and CI give the child no terminal on
  stdin and stdout, so this is what lets the interactive success path (spawn, wait, lookups, record,
  commit) run headless with no pseudo-terminal dependency.
- A second fixture manifest for the same script declaring `terminal: required`, which proves
  `NO_TERMINAL` at §3.3 step 12. Because that check is the last before the spawn, every other refusal
  of §3.7 (including the verbatim BDD refusals of P5.3.1 sc. 3, P5.3.2 sc. 3, P5.4.3 sc. 3 and
  P5.4.4 sc. 3) is reached headless with either fixture.
- The `e2e-smoke` gate (`dl-023`, `dl-099`) uses the same fake from a fresh `init` project, so the
  packaged tarball is exercised without an agent.

The exact script paths are the implementing task's choice. What this section fixes is that the fake
is a **custom** adapter, that it covers every §2.2 field, and that no test needs a terminal. A real
agent's terminal behaviour is covered only by the built-in adapter's `verified_with` pass by hand
(§2.8).

#### 2.8 Built-in adapters in v0.3

v0.3 ships **two** built-in adapters (approver ruling R17, 2026-09-30, `release-planning-rel-v0.3-plan`), so the adapter shape is proven
against two vendors in the release that introduces it, as the North Star's "different AI agents"
needs:

| `name` (file basename) | Agent CLI | `command`, `launch.interactive.args`, `prompt.via`, `mcp.*`, `session.*`, `usage.*` | `verified_with` |
|---|---|---|---|
| `claude-code` | Claude Code | to be verified by hand by the implementing task | filled by the implementing task |
| `codex-cli` | Codex CLI | to be verified by hand by the implementing task | filled by the implementing task |

Each built-in declares `launch.interactive.terminal: required` (§2.2) and carries `verified_with`,
the agent CLI version whose own help output and documentation its declarations were checked against by
hand (`adr-012` Consequences). This spec quotes no vendor command, flag or output format as a fact:
none is established in the repository (`grep -rniI codex --exclude-dir=node_modules --exclude-dir=.git .` finds only
R17's line in the plan). An agent CLI that the verification finds unable to register the `wingfoil` MCP server
for the launched process cannot be a built-in, because `mcp.via` has no `none` (§2.2). Likewise,
the verification checks that the launched agent can act on §2.4's `{context_instruction}`, that is,
that its model can obtain the `{role}-session` Prompt with `element` and `state` without the user's
intervention. An agent CLI that cannot is not a built-in until the context primitive is revisited with
the approver (ruling R18). Nothing in this repository establishes this capability for any agent CLI.
If the verification finds either agent CLI unable to meet §2.2 (MCP registration) or the check above,
the implementing task stops and returns the choice to the approver; R17 is not silently narrowed.

### 3. `wingfoil agent execute`

#### 3.1 Grammar

```
wingfoil agent execute [--next] [--workflow <ref>] [--step <key>] [--element <type>:<id>]
                       [--role <role>] [--agent <name>] [--format console|json|yaml]
```

| Flag / option | Source | Meaning |
|---|---|---|
| `--next` | P5.3.1, BDD sc. 1 | Resolve workflow, phase, element and role from the next step of the active instance (`spec-017` §3.3, §7.3; `REQ-STATE-03`). |
| `--workflow <ref>` | `spec-017` §3.3 (the shared selector), `REQ-STATE-03` | Selects the instance whose next step is taken: `<ref>` is a workflow name (its most recently started open instance) or an open instance id, exactly as `spec-017` §3.3 resolves the positional `<ref>` of `workflow next`. It implies `--next`, so the `agent` binding's argv `wingfoil agent execute --workflow <instance-id> --step <key>` (`spec-017` §6.1) is complete as written; giving `--next` as well changes nothing. `agent execute` has no positional to spare, so the selector is an option here; there is no `--name` spelling (`spec-017` OQ-2). |
| `--step <key>` | approver ruling R16, 2026-09-30, `release-planning-rel-v0.3-plan`; `spec-017` §4.9, §6.1 | Selects the step: a `spec-017` §4.9 step key, which must be on the frontier of the instance `--workflow` selects, else of the active instance. It implies `--next`. Without it the step is `NextResult.next`. It is what lets each frontier step's `agent` binding launch on its own step when the frontier holds several (parallel `dev-loop`s, `dl-014`), mirroring `memory add --workflow <ref> --step <key>` (`spec-017` §7.10) and `workflow finalize --step <key>` (`spec-017` §7.9). |
| `--element <type>:<id>` | P5.3.1, BDD sc. 2; element-ref per `spec-008` §7 | The target element. With `--next`, it overrides the step's element and keeps its phase and role. |
| `--role <role>` | `X_cli-cmds.md:216,223` | Overrides the role. It must be a `dna.yaml` `team.roles` name (P5.4.1). |
| `--agent <name>` | **new**; not in the BDD or in `X_cli-cmds` | Picks a `team.agents` entry. Default: the first entry, in declared order, whose `executes_as` contains the role and that declares an `adapter`. |
| `--format` | `REQ-INT-05`, `spec-005` §2 | See §3.4. |

At least one of `--next`, `--workflow`, `--step` and `--element` is required. None → exit `2`, `error: missing
required argument: --next or --element`.

`--resume <run-id>` and `--ref <run-id>` (`dl-135` point 4) are **v0.4** (§7). In v0.3 they are not
registered, so they are rejected as unknown options, exit `2`, per `spec-005` §1.

**Where this grammar departs from the BDD** (`P5.3.1-agent-execute.feature`,
`P5.3.2-agent-role-selection.feature`):
- `--role` is in `X_cli-cmds.md:216` but in no scenario. `--agent`, `--workflow` and `--step` are in
  neither.
  The BDD gains scenarios for them, and for the run record, under `dl-114` Action 2 and `dl-135`
  Action 3. The BDD's `--name <workflow>` spelling on the workflow commands (P4.2/P4.3/P4.7/P4.8) is
  amended to `spec-017`'s positional `<ref>` in its own task (`spec-017` Consequences); nothing in the
  P5.3 files uses it.
- P5.3.1 scenario 2 runs `--element task:202`. Element ids are full ids (`memory.yaml` `id_pattern`),
  so `task:202` resolves only if such an id exists. The scenario keeps its meaning ("regardless of
  the next step"), and its fixture needs a matching id.
- P5.3.1 scenario 1's "ready within 30 seconds" is read as §3.3's launch point, not as the agent's
  own start-up.
- P5.4.3 scenarios 1–2 (`P5.4.3-context-preloading.feature:9-16`: "When the agent initializes / Then
  DNA, relevant Memory, and role directives are fetched automatically / And pre-loading completes in
  under 30 seconds") are read the same way: WingFoil assembles and validates the context and proves
  the MCP server serves it (§3.3 steps 7 and 11) before the spawn, inside the budget. That an
  interactive agent then fetches it is the agent's behaviour, which WingFoil cannot assert; the
  fake adapter's optional fetch (§2.7) asserts that the context is fetchable.

The three BDD refusal messages are adopted verbatim (§3.7).

#### 3.2 Resolution

In this order, each a gating read at `HEAD` (`spec-006` §6):

1. **Step** (only with `--next`, `--workflow` or `--step`): `spec-017`'s `workflow next` deduction
   for the instance `--workflow <ref>` selects, else the active instance (`spec-017` §3.3). The step
   is the frontier step `--step <key>` names, which must be on that instance's frontier, else
   `spec-017` §10's `step '<key>' is not on the frontier of <instance>` (`CONFLICT`); without
   `--step`, it is `NextResult.next`, the first frontier step in `spec-017` §1.3's order (§7.3); it gives
   `workflow`, `phase`, `scope`, `role`, `allowedModes` and `distinctFrom` (`spec-017` §6.3, §8).
   A `<ref>` that resolves to no open instance is `spec-017` §10's refusal (`unknown workflow:
   <name>` or `workflow is not open: <ref>`). No open instance, or `next: null` → `NO_NEXT_STEP`.
2. **Element**: `--element` if given, else the step's scope element, else the instance's bound
   element (`spec-017` §3.4). A step with none of the three (a collection-entry scope on an unbound
   instance) → `NO_STEP_ELEMENT`. The element must exist at `HEAD` → else `NOT_FOUND`.
3. **Role**: `--role` if given, else the step's `role` (P5.3.2); a step with `role: null` and no
   `--role` → `NO_STEP_ROLE`. Without `--next`, `--workflow` or `--step`, and without `--role`, the
   role is the `developer` default of `X_cli-cmds.md:223`, and a `warning:` line says so
   (approver ruling R18, 2026-09-30, `release-planning-rel-v0.3-plan`; it keeps P5.3.1 scenario 2 passing as written).
   The role must be in `team.roles`.
4. **Agent**: per §3.1 `--agent`. The role `approver` is never executed by an agent, even when an
   agent lists it in `executes_as`: it is the role that holds approval authority (`REQ-SEC-03`;
   `team.agents[].approval_authority: false`, `.wingfoil/dna.yaml:123-128`) → `APPROVER_ROLE`. With
   `--agent`, that agent's `executes_as` must contain the role; without it, the first agent with an
   `adapter` whose `executes_as` contains the role is taken, and if there is none → `NO_AGENT`.
5. **Adapter**: the agent's `adapter`, loaded and validated (§2); only the selected adapter's
   manifest is parsed and validated. With `--agent` naming an agent that
   declares none → `NO_ADAPTER`.
6. **Mode**: `fresh`, unless `--resume` / `--ref` (v0.4, §7) selects a non-fresh mode that the step's
   `allowedModes` contains (`spec-003` § "Execution independence"; `dl-135` point 4). **In v0.3 every
   run is `fresh`**, whatever the phase allows, and no warning is printed: a declared `resume` or
   `reference` only makes the v0.4 flag legal. `distinctFrom` is not checked by `agent execute`: its
   enforcement is a workflow check that lands with P4.12 in v1.0 (`spec-003` § "Execution
   independence", release boundaries) and reads the records' `session` field. The record carries the
   mode that ran.

#### 3.3 Pipeline

A fixed sequence. The first failure stops it. Before step 14, `agent execute` has written only its
temporary files outside the repository (step 10); before step 17, it has written nothing to the
repository.

1. Parse arguments → exit `2` on usage errors.
2. Load `dna.yaml`, `memory.yaml`, `roles.yaml` and the workflow registry at `HEAD`; list
   the adapter directories (a name present in both is refused here).
3. Resolve (§3.2).
4. `command` of the adapter found on `PATH` (or at its repository path) → else `AGENT_NOT_FOUND`.
5. Git identity present (`REQ-SEC-01`), since step 17 commits → else the shared pre-flight error
   (`requireGitIdentity`, `task-014`).
6. Run log declared (§4.1) → else `NO_RUN_LOG`; the element's run-log file unmodified against
   `HEAD` (`requireUnmodifiedTarget`, `spec-006` §6 write half) → else `CONFLICT`.
7. Assemble the execution context at `state_ref` = `HEAD` (`spec-012` §2: `(role, element,
   stateRef)`); validate it (P5.4.4 sc. 3) → else `INVALID_CONTEXT`.
8. Print `ExecutionContext.warnings` on stderr, in `spec-012` §5.1 order (`dl-050` option 4).
9. Compute the run id (§4.3).
10. Render `{bootstrap}` / `{bootstrap_file}` and `{mcp_config_file}`.
11. **MCP pre-flight**: spawn `{mcp_command} {mcp_args}`, complete MCP `initialize`, get the
    `{role}-session` Prompt with `element` and `state` = `state_ref` (§2.4), close. Any failure → `MCP_UNREACHABLE` (P5.4.3 sc. 3).
12. **Terminal check**, the last check before the spawn: when the adapter's
    `launch.interactive.terminal` is `required` (the default), stdin and stdout must both be
    terminals → else `NO_TERMINAL`. With `optional`, the check is skipped (§2.2, §2.7). Placing it
    last keeps every earlier refusal reachable, and testable, without a terminal.
13. Print `run <run-id>: launching <agent> (<adapter>) as <role> on <type>:<id>` on stderr.
14. **Spawn** the agent with `launch.interactive.args` (+ `session.assign_args` when `assign`). This is
    the **"agent ready"** instant of `REQ-PERF-01`. Steps 1–14 must complete in < 30,000 ms p95
    (`02_performance-nfr.md:16-22`). The agent's own start-up is outside WingFoil's control and
    outside the budget (`adr-012` Consequences).
15. Wait for the agent to exit. **Signals.** Interactive launch: the agent runs in `agent execute`'s
    foreground process group, so the terminal delivers keyboard signals to both processes directly.
    While the agent runs, `agent execute` therefore **ignores** `SIGINT` and `SIGQUIT` (it neither
    dies nor forwards them, as a shell does for a foreground job; a forwarded copy would reach the
    agent twice, and how an agent CLI treats a repeated `SIGINT` is its own behaviour, which WingFoil
    does not control) and
    **forwards** only `SIGTERM` and `SIGHUP`, which do not come from the keyboard. Headless launch
    (v1.0, §3.5): the agent has no terminal, and `SIGINT`, `SIGTERM` and `SIGHUP` are all forwarded.
    In both cases `agent execute` then continues at step 16, so a run ended by a signal is still
    recorded (`exit_status: "signal:<NAME>"`).
16. Post-run lookups (§2.6), `agent_version` (§2.2), `notes` (§4.2).
17. Append the record and commit it (§4.4).
18. Exit: `0` if the agent exited `0` and step 17 succeeded; otherwise `1` (§3.7).

#### 3.4 Interactive launch: stdio

- The agent inherits stdin, stdout and stderr. **WingFoil writes nothing to stdout**, before, during
  or after the run. Its own lines (warnings, the step-13 banner, the post-run summary, errors) go to
  stderr, before step 14 and after step 15.
- `warning: <text>` is the warning prefix, beside `spec-005` §3.1's `error: `. The post-run summary
  is one line: `run <run-id>: agent exited <exit_status> after <duration> (recorded in <sha7>)`.
- `--format json|yaml` changes only the shape of those stderr lines: one JSON or YAML document per
  message, `{ "warning": … }`, `{ "error": …, "hint"?, "details"? }` (`spec-005` §3.2 with `dl-055`'s
  additive `details`), and `{ "run": <record> }` for the summary. This departs from `spec-005` §2
  ("stdout carries only the structured payload"). An interactive launch has no stdout of its own to
  put a payload on. `spec-005` §2 is amended accordingly in a v0.3 task (Consequences; Q8, settled).

#### 3.5 Headless launch (v1.0, shape only)

Specified now so that the adapter shape does not change in v1.0 (`adr-012` point 4). It ships with
P4.12:

- It is selected by the workflow engine for a check that binds an agent, or by `--headless` (an
  option registered in v1.0). It uses `launch.headless.args`, has no terminal, and `prompt.via` may be
  `stdin`.
- **The verdict is reported through an MCP Tool** on the registered server. Its name is provisional,
  `gate.report`: `{ run_id, verdict: "PASS" | "FAIL" | "ERROR", summary: string }`. It is accepted
  once per run, and a second call is refused.
- `result` in the record (§4.2): the Tool's verdict. If the Tool is never called, the result is
  **`ERROR`, never `FAIL`**. A non-zero agent exit is `ERROR`, whatever was reported. A verdict
  WingFoil did not receive through the Tool is never inferred from the agent's text.
- stdout carries `{ "run": <record> }` as the `spec-005` §2 payload. The agent's own stdout is
  captured for `output` parsing and not echoed.

#### 3.6 What `agent execute` writes

- **v0.3**: one run-record line in the element's run-log file, and one commit containing only that
  file (§4.4). Nothing else: no Memory transition, no workflow state (step execution is P4.10,
  v1.0). Temporary files are outside the repository and removed at exit.
- **v0.4**: also the git-ignored `.wingfoil/run/` entry for the run's lifetime (§7).
- The Memory transitions a run causes are made **by the agent**, through the Memory verbs or MCP
  Tools, under its own commits. They are not part of `agent execute`'s write set.

#### 3.7 Refusals and exit codes (`spec-005` §1, `REQ-INT-04`)

| Case | `CoreError.code` | Exit | Message (`error: …`) |
|---|---|---|---|
| None of `--next`, `--workflow`, `--step`, `--element`; bad element-ref; unknown option (incl. v0.4 flags) | — (parse) | `2` | `missing required argument: --next or --element` / `spec-008` §7 message / Commander's |
| any `spec-003` load error in the workflow registry (step 2) | `VALIDATION` | `1` | as `spec-017` §10's first row: the first error in `spec-003`'s order, every diagnostic in `details` |
| `--workflow` names no workflow | `NOT_FOUND` | `1` | `unknown workflow: <name>` (`spec-017` §10) |
| `--workflow` names no open instance | `NOT_FOUND` | `1` | `workflow is not open: <ref>` (`spec-017` §10) |
| `--step` names no step on the instance's frontier | `CONFLICT` | `1` | `step '<key>' is not on the frontier of <instance>` (`spec-017` §10) |
| `NO_NEXT_STEP` | `NOT_FOUND` | `1` | `no next step to execute` (P5.3.1 sc. 3, verbatim) |
| `NO_STEP_ELEMENT` | `VALIDATION` | `1` | `step '<key>' has no element: give --element <type>:<id>` |
| element absent at `HEAD` | `NOT_FOUND` | `1` | `element not found: <type>:<id>` |
| `NO_STEP_ROLE` | `VALIDATION` | `1` | `step '<key>' declares no role: give --role <role>` |
| step role not in DNA | `VALIDATION` | `1` | `step role '<r>' not defined in dna.yaml` (P5.3.2 sc. 3, verbatim) |
| `--role` not in DNA | `VALIDATION` | `1` | `unknown role '<r>' (not defined in dna.yaml)` (P5.4.2 sc. 3 text) |
| `APPROVER_ROLE` | `VALIDATION` | `1` | `role 'approver' is never executed by an agent` (`REQ-SEC-03`) |
| `NO_AGENT` (no `--agent`, and no agent with an adapter executes the role) | `VALIDATION` | `1` | `no agent in dna.yaml with an adapter executes as role '<r>'` |
| `--agent` names no agent, or one whose `executes_as` lacks the role | `VALIDATION` | `1` | `unknown agent '<name>'` / `agent '<name>' does not execute as role '<r>'` |
| `NO_ADAPTER` (`--agent` names an agent without `adapter`) | `VALIDATION` | `1` | `agent '<name>' declares no adapter` |
| manifest invalid | `VALIDATION` | `1` | `adapter '<name>': <zod issue>` (`dl-055` detail lines) |
| `AGENT_NOT_FOUND` | `IO` | `1` | `agent command '<command>' not found (adapter '<name>')` |
| git identity missing | as `requireGitIdentity` | `1` | as `requireGitIdentity` |
| `NO_RUN_LOG` | `VALIDATION` | `1` | `dna.yaml declares no run log (paths.runs)` |
| run-log file modified | `CONFLICT` | `1` | `run log <path> has uncommitted changes` |
| `INVALID_CONTEXT` | `VALIDATION` | `1` | `invalid execution context: missing '<section>' section` (P5.4.4 sc. 3) |
| `MCP_UNREACHABLE` | `IO` | `1` | `context pre-load failed: MCP server unreachable` (P5.4.3 sc. 3, verbatim) |
| `NO_TERMINAL` (step 12) | `VALIDATION` | `1` | `interactive launch needs a terminal on stdin and stdout` |
| agent exited non-zero or by signal | `IO` | `1` | `agent exited <exit_status>; run <run-id> recorded` |
| record commit failed | `IO` | `1` | `run <run-id> not recorded: <cause>`, with the record as a `details` line |
| duplicate run id at record time (§4.3) | `CONFLICT` | `1` | `run id <run-id> already recorded at HEAD` |

Rows are in pipeline order (§3.3), which is the order a test meets them in.
The upper-case names in the first column are this spec's identifiers for tests. They are not new
`CoreErrorCode` values: the second column maps each to the existing union
(`src/core/types.ts:12`). No existing code names "the delegated process failed", so that case uses
`IO`, with `details: { run_id, exit_status }`. A spawned run whose agent fails still gets its record
(§4.4): the failure is a fact about the run, not a reason to lose it.

### 4. Run record

#### 4.1 Location

- `dna.yaml` `paths` gains a category **`runs`**, holding exactly one directory
  (`dl-114` Action 2, `dl-135` Action 5). `Paths` is `.passthrough()` (`src/dna/schema.ts:186-194`),
  so no schema change is needed to read it. `spec-002` §Categories and P2.5's category list
  (`X_cli-cmds.md`) gain it as a sixth category (approver ruling R18, 2026-09-30, `release-planning-rel-v0.3-plan`). `governance`, which already
  holds `.wingfoil/` (`.wingfoil/dna.yaml:174-175`), was rejected: it would make the run log
  ambiguous.
- The log is **one file per element**: `<runs>/<element-id>.jsonl`. Runs on one element happen on one
  task branch (`dl-024`), so parallel branches append to different files, and a merge conflicts only
  when two branches ran the same element.
- `wingfoil init` scaffolds `paths.runs: [docs/runs/]`. For this repository the value is chosen
  when the task lands.

#### 4.2 Format

**JSON Lines.** One JSON object per line, UTF-8, `\n`-terminated, append-only, keys in the fixed
order below, and no insignificant whitespace. JSON Lines is chosen because:
- a run is one line (`dl-114` Q1 (A): "one line per run");
- appends merge as appends;
- each line parses with `JSON.parse` and needs no dependency (`dl-010`);
- `git log -S` finds the commit that added a run id.

| # | Key | Type | Value |
|---|---|---|---|
| 1 | `id` | string | Run id (§4.3). |
| 2 | `element` | string | `<type>:<id>` (`spec-008` §7). |
| 3 | `workflow` | string | Workflow name, or `n/a` for a run without a step (`dl-124` Q1 (A)'s reserved value, approve `09cc2ae8`, used here by analogy: the run log is not Memory). |
| 4 | `phase` | string | Phase name, or `adhoc` for a run without a step (§4.3; reserved by `spec-003`, `E_PHASE_NAME_RESERVED`). |
| 5 | `role` | string | The role that ran. |
| 6 | `mode` | string | The mode that ran, not the modes the phase allows: `fresh` in v0.3 (§3.2 step 6). |
| 7 | `agent` | string | `team.agents[].name`. |
| 8 | `adapter` | string | `<built-in\|custom>/<name>`. |
| 9 | `agent_version` | string | Per `version_args`, or `not-reported`. |
| 10 | `model` | string | As the agent reports it, or `not-reported`. |
| 11 | `session` | string | Session id (`dl-135` point 2), or `not-reported`. |
| 12 | `tokens` | object | `{ "input", "output", "cache_read", "cache_write" }`, each an integer or `not-reported` (`dl-114` Q2 (b), Q3 (i)). |
| 13 | `wingfoil` | string | The launching build, `"<semver> (<sha>)"`, as `dl-111`'s `WingFoil-Version:` trailer. |
| 14 | `state_ref` | string | Full commit sha the context was assembled at (§3.3 step 7). |
| 15 | `duration_ms` | integer | Wall-clock, spawn to exit. It is a record of what happened and never enters a context (`dl-114` Q2 rationale). |
| 16 | `exit_status` | integer \| string | The agent's exit code, or `signal:<NAME>`. |
| 17 | `result` | string | `n/a` for an interactive launch; `PASS`/`FAIL`/`ERROR` for a headless one (§3.5). |
| 18 | `notes` | string | `<element-id>#execution-notes` if the element's `## Execution Notes` section at `HEAD` after the run differs from its text at `state_ref`, else `none` (`dl-135` Q2 (c)). Notes the agent wrote but did not commit are not seen, and yield `none`; for a type whose template has no such section (§2.4) the value is always `none`. |

A field is never omitted and never `null`. Adding a field is a revision of this spec. Readers
refuse a line with an unknown key, so a record from a newer build is reported, not silently
truncated (§4.5).

#### 4.3 Run id

`<element-id>/<phase>/<n>` (`dl-135` Q3 (a)).

- `<element-id>` is the element's full id, without its type (ids are globally unique, `spec-008` §7).
- `<phase>` is the phase name, or `adhoc` for a run without a step (no `--next`, `--workflow` or
  `--step`). Phase
  names are not unique across workflows. A release, for instance, goes through `release-planning`
  and `release-cycle` phases. `n` counts every record with that element and phase, whatever the
  workflow, so ids stay unique, and the record's `workflow` field disambiguates. The segment is always
  well formed: the `spec-003` revision constrains phase names to `[a-z][a-z0-9-]*` — `spec-009`'s ID
  characters without the `.`, starting with a letter — (`E_PHASE_NAME_INVALID`) and reserves `adhoc`
  (`E_PHASE_NAME_RESERVED`), both load-time errors (`spec-003` § "Names", § "Diagnostics"). Today's
  `Phase` schema has `name: z.string()` (`src/workflow/schema.ts:75`); the constraint lands with the
  `spec-003` task.
- A run id therefore matches `^<element-id>/[a-z][a-z0-9-]*/[1-9][0-9]*$`, where `<element-id>` is in
  `spec-009`'s ID class. It contains `/`, so it is not one URI segment (§7, MCP Resource).
- `<n>` = 1 + the number of records in `<runs>/<element-id>.jsonl` **at `state_ref`** whose `element`
  and `phase` match. It is decimal with no padding. It is computed from git at the start commit, so
  every clone derives the same id from the same history, and there is no clock or random source
  (`REQ-SYS-07`).
- **Collision.** Two runs launched from the same `HEAD` on the same element and phase get the same
  id. In v0.3, step 17 re-reads the file at the then-current `HEAD`. If the id is already there, it
  refuses (`CONFLICT`) and does not append, and the full record goes to stderr as a `details` line so
  the run is not lost. From v0.4, the active registry refuses the second launch up front (`dl-135`
  Q3). Two branches that each recorded the same id conflict at merge. §4.5 reports the duplicate
  if the conflict is resolved by keeping both lines.

#### 4.4 How the record is committed

`dl-114` Q1 (A) says "committed with the Memory operation that closes the step". In v0.3 that operation happens
**during** the run: the agent, or its user, runs `memory submit` or an MCP Tool before the agent
exits. The record needs `duration_ms`, `exit_status` and the post-run lookups, which exist only
**after** exit. So in v0.3 the record cannot ride on the closing commit.

**Decision for v0.3:** `agent execute` commits the record itself, in **one commit that contains only
the element's run-log file** (`commitPaths` with `--only`, so the agent's uncommitted work is
untouched). The commit:
- is authored by the git identity that launched the run (`dl-094`: one author identity per act; the
  act is the launch);
- carries `dl-111`'s `WingFoil-Version:` trailer;
- has the subject `agent: record <run-id>` and no body beyond the trailer block. The subject is
  outside the `wf({type})` grammar, because the run log is not Memory: `memory history` never reads
  it as a Memory operation, and `dl-079` (A)'s closed verb list needs no amendment (`spec-003` verb
  table, closing paragraph, which lists this subject among the non-Memory commits; Q4, settled).

The commit goes to whichever branch is checked out when the agent exits. If the agent switched
branches, the record lands there, and `state_ref` still names where the run began.

**From v1.0** (P4.10), when the engine closes the step, the record is appended by `agent execute` and
committed **by the engine's closing Memory operation**, as `dl-114` Q1 (A) states. The v0.3 own commit
is the interim form, and records written under it stay valid.

Alternatives weighed:
- **(b) Append in v0.3 and let the next Memory verb commit it.** Rejected. The Memory verbs commit only
  their declared scope (`verifyCommittedScope`, `spec-006` §6). Widening every verb's scope to "plus
  any run log" is a larger change than one commit. Where no verb follows (a failed run), the record
  would stay uncommitted indefinitely.
- **(c) Leave it for the user to commit.** Rejected: a measurement that depends on someone
  remembering it is the failure `dl-114`'s Rationale names ("recorded at the wrapper or not at all").

This depends on `bug-051` (commit body normal form depends on ambient config) and `bug-118` (the
dirty-target guard fails open), both triaged into v0.3 (plan Appendix A). The record commit is one
more caller of both.

#### 4.5 Reading the log

Every reader (`agent execute` for `n`, `agent list`, `agent show`) validates each line it reads: it
must be JSON, have exactly the §4.2 keys in order with valid types, and have an `id` whose element
segment equals the file's basename. Within the files read, ids must be unique. A violation is
`VALIDATION`, exit `1`, `run log <path>: line <k> is not a valid run record: <detail>`, or `run log
<path>: run id <id> recorded twice`.

### 5. `wingfoil agent list`

```
wingfoil agent list [--past] [--waiting] [--element <type>:<id>] [--phase <name>] [--format console|json|yaml]
```

- **Sources** (`dl-135` point 1):
  - **past** = the run log at `HEAD` (§5.1).
  - **waiting** = `spec-017`'s definition, adopted by reference and not restated: every step of
    `StatusResult.open[].frontier` whose `agentRole` is true (`spec-017` §6.3, §8, and its
    Consequences, "`dl-135`'s `agent list --waiting`"), i.e. every frontier step (`spec-017` §4.9) of
    every open instance (§3.2), not only each instance's first. `agentRole` is `spec-017`'s
    predicate: the step's role is listed in some `team.agents[].executes_as`. **v0.3 limit, stated:**
    with no active registry, a step that has an agent running on it right now is still listed as
    waiting (`dl-135` point 1's "with no active run on it" is v0.4, §7).
- **Flags.** `--past` selects the past section and `--waiting` the waiting section. Without either,
  both sections are shown; both flags together are the same as neither. `--active` is v0.4, and in
  v0.3 it is rejected as an unknown option, exit `2`.
- `--element` and `--phase` filter both sources: a past record by its `element` and `phase` fields,
  a waiting step by its element (its scope element, else its instance's bound element, as §3.2
  step 2 resolves it) and its `phase`.
- **Order.** past: element id ascending (byte order), then line order within the file, which is
  append order. waiting: `spec-017` §1.3's frontier order (instance order, then depth-first phase
  order, then iteration order), unchanged by filtering.
- **JSON / YAML** (`REQ-INT-05`): a single object with `baseline` and `diagnostics` always, and only
  the selected source keys: `{ "baseline": { "rev": "HEAD", "commit": <sha> }, "past": [<record>…],
  "waiting": [{ "instance", "key", "workflow", "phase", "element", "role", "allowedModes", "agents"
  }…], "diagnostics": [<Diagnostic>…] }`. `baseline` and `Diagnostic` are `spec-017` §8's shapes
  (`dl-084` (A): every payload carries the baseline it answered from). `key` is the step key
  (`spec-017` §4.9); `element` is `<type>:<id>` or `null`; `agents` lists, in DNA order, the agents
  that execute the role and declare an adapter. `diagnostics` carries `spec-017`'s deduction
  diagnostics unchanged; its `W_UNCOMMITTED_INPUTS` already names run-log paths (`spec-017` §1.2).
  When `--past` alone is selected and no deduction runs, `agent list` emits that code itself under
  the same rule.
- **Console.** One section per selected source, with a heading and one line per item:
  - past: `<id>  <role>  <agent>  <exit_status>  <duration>  <tokens>`, where `<tokens>` is
    `in/out` or `not-reported`;
  - waiting: `<key>  <role>  <agents>`.

  An empty section prints `no past runs` or `no waiting steps`. Diagnostics print on stderr as
  `warning:` lines.
- **Exit codes.** `0` on a result, including an empty one. `1` on a §4.5 violation, or when the
  `spec-017` deduction fails, with its own message. `2` on a usage error only. A missing `paths.runs`
  is not an error for `list`: `past` is empty, with `warning: dna.yaml declares no run log
  (paths.runs)`.

#### 5.1 Baseline of `agent list` and `agent show` — a declared exception

Both commands read the run log, and `list` also the workflow deduction, **at `HEAD`**. This departs
from the ratified default: `dl-084` was ratified (A) (approve `2985b0ee`, "Options: (A) + (D)"), and
the `command-baseline` directive says "A read that gates nothing keeps reporting the working tree"
(the `command-baseline` directive's *Consequences already decided* bullet "A read that gates nothing keeps reporting the working tree", `.wingfoil/directives/custom/command-baseline.md`), as `spec-006` §6 item 4 does for the read-only
verbs. It is the same **declared exception** `spec-017` makes for `workflow status`, `list`, `show`
and its two Resources (`spec-017` §1.1, §11), decided with it (approver ruling R15, 2026-09-30, `release-planning-rel-v0.3-plan`), for the same
reason, determinism:

- the waiting section *is* `spec-017`'s deduction, which answers from `HEAD` (`spec-017` §1.1);
- the past section must answer from the same baseline as `agent show` and as `agent execute`'s run
  id rule (§4.3, `n` counted at `state_ref` = `HEAD`), or two commands would disagree about which
  runs exist;
- §4.4 commits a record before `agent execute` returns, so `HEAD` and the working tree differ only
  when a record commit failed or a run log was edited by hand, and that difference is reported
  (`W_UNCOMMITTED_INPUTS` above; `agent show`'s hint below), never silently ignored.

`agent show` refuses an unknown run id, which under `spec-006` §6 item 4 ("an operation that can
refuse on what it read has gated") would itself justify `HEAD`; it is listed here with `list` because
`memory history`, which also refuses an unknown id, is a working-tree reader in `spec-006` §6.4 and
the approver saw both on one ruling (R15). The rejected alternative was the working tree for both
commands, at the cost of `agent list --waiting` (at `HEAD`) and `--past` (at the working tree)
answering from two baselines in one payload. `spec-006` §6 gains the sentence declaring the
exception in the implementing task (Consequences).

### 6. `wingfoil agent show <run-id>`

- Positional `<run-id>`, required. A malformed id (§4.3) → exit `2`,
  `error: invalid run id "<value>", expected <element-id>/<phase>/<n>`.
- Reads `<runs>/<element-id>.jsonl` at `HEAD` (§5.1). No such run → `NOT_FOUND`, exit `1`, `run not
  found: <run-id>`. If only the working tree holds it, a hint line says so (`command-baseline`: the
  working tree may explain a refusal, never decide it).
- **JSON / YAML**: `{ "baseline": { "rev": "HEAD", "commit": <sha> }, "run": <record>, "commit": "<sha
  of the commit that added the line>" }` (`baseline` per `spec-017` §8, `dl-084` (A)).
  **Console**: `key: value` lines in §4.2 order, `tokens` flattened to `tokens.input` and so on, then
  `commit: <sha>`.

### 7. v0.4, shape only

Fixed here so that v0.3 does not foreclose it (`dl-135` release split, plan R5):

- **Active registry** (`dl-135` Q1 (a)): `.wingfoil/run/<element-id>/<phase>/<n>.json`, written at
  step 14 and deleted at exit. The fields are `{ id, pid, workflow, phase, element, role, agent,
  session, started_ms }`. It is git-ignored through a line that `wingfoil init` adds. Entries whose
  `pid` is gone are pruned on every read. `agent execute` refuses a launch whose run id already has a
  live entry. The task that ships it amends `spec-011`'s `.gitignore` policy, which today states "No
  subpath within `.wingfoil/` is excluded" (`spec-011-storage-layout.md:199-203`); nothing in v0.3
  writes `.wingfoil/run/`.
- `agent list --active`, and `waiting` minus the steps with a live entry.
- `agent execute --resume <run-id>` and `--ref <run-id>`, each refused unless the step's
  `allowedModes` contains the mode (`dl-135` point 4; `spec-003` § "Execution independence").
  `--resume` also needs `session.resume.supported` and the same element and role, and passes
  `session.resume.args`. `--ref` hands the named runs' `notes` (and `summary.export_args` output where
  declared) to the bootstrap, never a transcript.
- **The MCP surface of the `agent` module** (`dl-135` point 4 and release split, plan R5): the
  read-only runs Resource and the `agent.execute` Tool are v0.4, with P5.2.3 and the Resource URI
  unification (`dl-040`, `spec-004` §2.1). `dl-135` names the Resource `wingfoil://agents/runs`;
  whether it becomes that or `spec-004`'s `wingfoil://agent/…` form is `dl-040`'s. A Resource that
  addresses one run must either percent-encode the run id (it contains `/`, §4.3) or take it as the
  three segments `{element-id}/{phase}/{n}`; the v0.4 task chooses. The `agent.execute` Tool refuses
  every call until headless launch exists (v1.0, §3.5), because an MCP caller has no terminal:
  `VALIDATION`, `agent execute over MCP needs a headless launch (v1.0)`.

### 8. Core API rows (`spec-006` §3 style)

| function | module | mutates | CLI | MCP |
|---|---|---|---|---|
| `agentExecute` | `agent` *(planned)* | true | `wingfoil agent execute` | Tool `agent.execute` *(v0.4; refuses until v1.0, §7)* |
| `agentList` | `agent` *(planned)* | false | `wingfoil agent list` | Resource `wingfoil://agent/list` *(v0.4; URI per `dl-040`)* |
| `agentShow` | `agent` *(planned)* | false | `wingfoil agent show` | Resource `wingfoil://agent/show/{run-id}` *(v0.4; URI per `dl-040`, encoding per §7)* |

These rows are the ones `spec-006` §3 carries, cell for cell. The production server does not run
`registerCoreModules` (`src/mcp/server.ts`; `spec-006` §3, "MCP exposure"), so no `agent` operation
reaches MCP in v0.3 and `spec-006` §4's parity rule needs no exception for them.

`agentExecute` stays `mutates: true`, consistent with `spec-006:196`, but for a different reason.
`spec-006:198-201` justifies it by "advance the active workflow's step context". In v0.3
`agent execute` advances no step (P4.10 is v1.0). It **commits the run record** (§4.4), and that is
the mutation. `spec-006` §Consequences' possible split into `agentResolveNext` / `agentAdvanceStep`
(`spec-006:285-289`) is not needed while nothing advances a step, and the `spec-006` revision deletes
that bullet.

### Open questions

**Settled at this revision** (review recommendation or approver ruling):
- *Q1, location:* `.wingfoil/agents/{built-in,custom}/` plus `team.agents[].adapter` (`adr-012`
  point 2). The alternatives, an `agents:` section inside `dna.yaml` (it mixes launch argv into the
  project map and has no built-in/custom split) and a single `.wingfoil/agents.yaml` (the same
  objection), are recorded, not re-opened.
- *Q4, the record commit's subject:* `agent: record <run-id>`, outside the `wf()` grammar (§4.4;
  shared convention of the fix pass, and `spec-003`'s verb table lists it among the non-Memory
  commits). The rejected alternative, `wf(run): record <run-id>`, needed `dl-079` amended.
- *Q5, first half — the phase segment of a run without a step:* `adhoc`, reserved by the `spec-003`
  revision (`E_PHASE_NAME_RESERVED`).
- *Q7, MCP exposure:* every `agent` Tool and Resource is **v0.4** (`dl-135` release split, plan R5),
  the Resource's URI is `dl-040`'s (§7, §8). The earlier recommendation to serve Resources in v0.3
  rested on `spec-006` §4's parity rule registering every operation on the production server, which
  it does not do (`src/mcp/server.ts` never runs `registerCoreModules`).
- *Q8, `--format` under an interactive launch:* as §3.4; `spec-005` §2 gains, in a v0.3 task, the
  sentence "a command that hands its stdout to a child process writes no payload on stdout; its
  structured messages go to stderr" (Consequences).
- *Q2, which MCP primitive carries the assembled context:* Resolved: R18 (approver ruling,
  2026-09-30, `release-planning-rel-v0.3-plan`) — the `{role}-session` Prompt (`spec-004` §3.1) with
  optional `element` and `state` arguments (§2.4); the `spec-004` amendment is carried to a task. The
  rejected alternatives: a new Resource `wingfoil://context/{role}/{type}/{id}@{sha}` (also a
  `spec-004` amendment), and the payload inlined into the bootstrap (bounded by argv and prompt size
  limits that differ per agent).
- *Q3, the `paths` category name:* Resolved: R18 — `runs` (§4.1); `governance` was rejected as
  ambiguous.
- *Q5, second half — the role of a run without a step:* Resolved: R18 — `developer` with a warning
  (§3.2 step 3). The rejected alternative, `--role` required, breaks P5.3.1 scenario 2.
- *Q6, built-in adapters in v0.3:* Resolved: R17 — Claude Code and Codex CLI, each verified by hand
  and carrying `verified_with` (§2.8).
- *Q9, `HEAD` for `agent list` and `agent show`:* Resolved: R15 — a declared exception to `spec-006`
  §6 item 4, the `command-baseline` directive's *Consequences already decided* bullet "A read that gates nothing keeps reporting the working tree" and `dl-084` (A), decided together with `spec-017` OQ-10
  (§5.1).
- *Q10, choosing a step when the frontier holds several:* Resolved: R16 — `agent execute --step
  <key>` (§3.1, §3.2 step 1), carried in `spec-017` §6.1's `agent` binding argv. The rejected
  alternative, first-step-only with parallel steps launched by `--element` and `--role`, records them
  as `adhoc` runs and loses their phase.

**Open:** none.

## Consequences

- **Tasks that depend on this spec** (derived at v0.3 `build-backlog`): the manifest schema and
  loader; `init` installing built-ins; `agent execute` (P5.3.1, P5.3.2, P5.4.3, P5.4.4, with
  `dl-050` option 4 as an AC); the run log and its commit (`dl-114`, `dl-135` v0.3 half);
  `agent list` / `agent show`; the fake adapter and its use in `e2e-smoke`; the two built-in adapters
  of §2.8 (ruling R17), each with its `verified_with` pass by hand.
  Their order is set with `depends_on` (`dl-015`): `spec-017`'s next-step deduction, and the `spec-003`
  revision (`mode`, `distinct_from`, the phase-name class and `adhoc`), come before `agent execute
  --next` and `agent list --waiting`.
- **Documents amended when the tasks land**, each by its owner, carried to a task, and with the usual
  `doc-versioning` bump:
  - `REQ-INT-07` per `adr-012` (with the run record and the execution mode, `dl-135` Action 3);
  - `REQ-SYS-03`'s fit criterion, **v0.4**, for the git-ignored active registry (`dl-135` Action 3,
    Q1 (a)): "No `.wingfoil/state/` artifact exists" gains that `.wingfoil/run/` is a process cache,
    not state;
  - `REQ-SEC-07`, whose description and fit criterion gain built-in adapters beside built-in
    directives and workflow templates (§2.1), or, if the approver prefers, §2.1's analogy stays an
    analogy and `REQ-SEC-07` is untouched;
  - `docs/01_vision/06_features.md`: P5.3.1's description gains the run record (`dl-114` Action 2)
    and the execution modes (`dl-135` Action 3); new P5.3 rows for `agent list` and `agent show`
    (`dl-135` Action 3), whose ids then replace the `dl-135` citation in `spec-006` §3's `feature`
    column and enter `minor-v0.3` `features:` through the plan; the dependency cells of P5.3.1 and
    P5.4.4 per `adr-012`;
  - `docs/01_vision/X_cli-cmds.md`: the Agent Execution section (`:212-224`) gains `--workflow <ref>`,
    `--step <key>`, `--agent <name>`, `agent list` and `agent show` (`spec-006` §5 makes this file the
    source §3 follows), and P2.5's `paths` category list gains `runs` (§4.1, ruling R18);
  - `spec-002` (`team.agents[].adapter`, `paths.runs`);
  - `spec-004` §3.1–§3.2 (the optional `element` and `state` arguments, and the embedding contract
    when they are given: `spec-012` §7's payload for `(role, element, state)`, resolved at `state`, not
    per request against the working tree), ruling R18, in a v0.3 task; and, in v0.4, the `agent` Resource URI with `dl-040`);
  - `spec-005` §2 (Q8's sentence), in a v0.3 task;
  - `spec-006` §3 (the three rows of §8, the `agentExecute` rationale, and the stale Consequences
    bullet on splitting `agentExecute` deleted) — done in the `spec-006` revision reviewed with this
    spec; and `spec-006` §6, the sentence declaring §5.1's `HEAD`-read exception (ruling R15), in the
    implementing task;
  - `spec-008` (the `agent` command map, with `--workflow <ref>` and `--step <key>`, ruling R16);
  - `spec-011` (`.wingfoil/agents/`; and, in **v0.4**, its `.gitignore` policy, §7);
  - BDD, under `docs/02_requirements/02_bdd/features/p5-interaction/`: P5.3.1 / P5.3.2 (§3.1's
    mismatches, the run record, the mode scenarios including `--resume` refused on a `fresh`-only
    phase from v0.4); P5.4.3 sc. 1–2 (§3.1's reading of "the agent initializes"); new feature files
    for `agent list` and `agent show` (`dl-135` Action 3);
  - `docs/cli-reference.md` (three entries, held by `test/docs/cli-reference.test.ts`), each stating
    the baseline it reads (`dl-084` (A)).
- **Determinism.**
  - The bootstrap, the MCP payload and the run id are pure functions of committed state and the run's
    inputs `(role, element, run id, state_ref)`. The argv is too, except for the temporary-file paths
    (`{bootstrap_file}`, `{mcp_config_file}`, in the OS temporary directory) and the Node executable
    path (`{mcp_command}`), which are host values that never reach the context. The `assign` session
    id hashes the absolute repository root (§2.6), so it is per clone by design and is never used as
    an identifier across clones; the run id is.
  - The wall-clock values (`duration_ms`, and `started_ms` in v0.4) sit only in records of what
    happened, never in a context.
  - Two clones that launch the same step from the same `HEAD` produce the same bootstrap bytes and the
    same run id, which is **I** (`dl-131`).
  - The record's `mode`, `session` and `state_ref` are what the v1.0 **P** checks read (`dl-134`
    `distinct_from`).
- **Revision triggers.**
  - A change to §2.4's literal text, §4.2's keys or §4.3's rule is a revision of this spec, with a
    dated note, because stored records and cross-clone ids depend on it.
  - A new manifest field bumps `format`.
- **Known limits, stated rather than hidden.**
  - An interactive launch often yields `not-reported` for model, tokens and session.
  - v0.3's `waiting` includes steps already being worked on.
  - A colleague's runs appear only after they push (`dl-135` Decision 1).
  - No automated test exercises a real agent's terminal handling; the built-ins' `verified_with` pass
    is by hand (§2.7, `adr-012` Consequences).

## Process Notes

Authored proactively during v0.3 `release-planning/identify-specs` (`release-planning-rel-v0.3-plan`
step 5), with `adr-012` from `record-adrs` (step 4), on branch `design/release_planning_v0.3`. Grounded in
`REQ-INT-07`, `REQ-PERF-01`, `REQ-SYS-03`, `REQ-SYS-07`, `REQ-STATE-09`, `REQ-SEC-03`, `REQ-SEC-07`
and `REQ-SEC-08`; in P5.3.1–P5.3.3 and P5.4.1–P5.4.4 (`docs/01_vision/06_features.md:133-145`); and
in the BDD files `p5-interaction/P5.3.1-agent-execute.feature`, `P5.3.2-agent-role-selection.feature`,
`P5.3.3-relevance-filtering.feature`, `P5.4.2-role-directives-binding.feature`,
`P5.4.3-context-preloading.feature` and `P5.4.4-execution-context.feature`. It also rests on the
ratified `dl-050`, `dl-055`, `dl-079`, `dl-080`/`dl-084`, `dl-090`, `dl-094`, `dl-111`, `dl-114`,
`dl-124`, `dl-131`, `dl-134` and `dl-135`. P5.3.3's relevance filtering reaches the agent through Q2's
primitive, whose payload is `spec-012` §6, and adds nothing to this spec.

**Revised after the `dl-022` spec review** (same day, before submit), aligned with the corrected
`spec-017` and `spec-003` drafts, which are authoritative for workflow matters:
- the terminal check moved to the last step before the spawn (§3.3 step 12), and the manifest gained
  `launch.interactive.terminal: required | optional`, so the fake adapter runs the interactive
  success path in Jest and CI without a pseudo-terminal (§2.2, §2.7);
- `mode` follows `spec-003`: the phase declares the modes it allows, the mode that runs is `fresh`
  unless `--resume`/`--ref` (v0.4) asks otherwise; the spurious v0.3 warning is gone (§3.2 step 6);
- the workflow selector is `--workflow <ref>`, `spec-017` §3.3's name-or-instance-id selector, and it
  implies `--next`; no `--name` (§3.1), with `spec-017` §10's two refusals adopted (§3.7);
- `agent list` / `agent show` read `HEAD` as a named exception flagged for the approver (§5.1, Q9),
  and their payloads carry `baseline` (§5, §6);
- run ids rely on `spec-003`'s phase-name class and its `adhoc` reservation (§4.3);
- interactive signal handling no longer double-delivers `SIGINT` (§3.3 step 15);
- `waiting` is `spec-017`'s frontier filtered on `agentRole`, in `spec-017` §1.3's order (§5);
- the record commit's subject is `agent: record <run-id>` (§4.4); every `agent` MCP Tool and Resource
  is v0.4 (§7, §8);
- the documents to amend are complete (Consequences); the minor corrections of the review (the
  placeholder rules, `n/a` per `dl-124`, `dl-114` Q2 (b), the conditional handoff line, the agent
  refusals, the determinism bullet) are applied in place.

**Revised after approver rulings R15–R18** (2026-09-30, `release-planning-rel-v0.3-plan`): Q9 (R15),
Q10 (R16), Q6 (R17), Q2, Q3 and Q5's second half (R18) are closed and stated as decided; `--step
<key>` joins `agent execute` (§3.1, §3.2, §3.7); the bootstrap's `{context_instruction}` is fixed
(§2.4); the two built-in adapters are named, their declarations left to the implementing task's
verification by hand (§2.8).

Confirming dl-022 pass (2026-09-30): N1, N2, N6, N7, N8, N10 applied.

**Revision (2026-10-01) — line-offset citations of the `command-baseline` directive replaced by
section names, per `dl-075-no-bare-line-offsets-in-memory` and `task-161-revise-command-baseline-which-verbs-read-head-filesystem`.**
`task-161` revised the directive to 1.2, which moved every line it had; the `command-baseline.md:<n>`
citations in §5.1 and in Q9 of the open questions named lines that no longer held the quoted text (they had already drifted with
`task-128`'s 1.1). Each now names the section or bullet it meant. No rule changed. Edited in place
without a supersede or a state change (`dl-047`); recorded with `memory amend`.
