---
id: spec-006-core-domain-api
type: tech-spec
title: "core domain API — shared function surface behind CLI and MCP"
status: approved
scope: "src/core"
supersedes: ""
tmpl_version: 260703
---

## Context

REQ-SYS-05 ("Dual interface over a shared core") requires that humans (via the `wingfoil` CLI,
Commander.js) and agents (via the MCP server, stdio transport, `@modelcontextprotocol/sdk`) get a single, non-divergent
behavior: *"Every state-mutating operation available in the CLI is reachable via an MCP Tool and vice
versa; an automated parity test enumerates both surfaces and reports 0 unmatched operations."*

`dna.yaml`'s `modules` section already names `core` as "shared domain logic; single behavior behind
both CLI and MCP surfaces (REQ-SYS-05)" at `src/core`, alongside separate `cli` (`src/cli`) and
`mcp-server` (`src/mcp`) modules. Without a spec pinning what lives in `src/core` and how the two
surface modules must call it, `cli` and `mcp-server` are free to re-implement the same operation
independently (e.g. two divergent `memory approve` code paths, one enforcing the type's state machine
and one not). That re-implementation risk is exactly what turns REQ-SYS-05's fit criterion into
something that must be *tested for* on every change, rather than a structural guarantee. Two
consumers exist for this artefact:

- `src/cli` — parses `wingfoil <noun> <verb>` argv (per `docs/01_vision/X_cli-cmds.md`) into a core
  function call, then renders the `CoreResult` to console/json/yaml.
- `src/mcp` — exposes MCP **Tools** (mutating operations) and MCP **Resources** (read-only queries) that
  each wrap exactly one core function call, then serialize the `CoreResult` as the Tool/Resource response.

This spec defines `src/core`'s public function surface — its module boundary, per-function
signature shape, and the parity rule that makes both consumers thin adapters over it — so that
"reachable via CLI ⇔ reachable via MCP" is true **by construction**: there is structurally no way to
add an operation to one surface without exposing the underlying core function to the other, because
both surfaces are generated from (or directly call) the same `CoreModule` registry.

## Specification

### 1. Module boundary

`src/core` exports one function per state-mutating or query operation. `src/cli` and `src/mcp` MUST NOT
contain business logic (validation, state-machine transition checks, file writes, git commits) — they
only: (a) parse their surface-native input (argv flags / MCP Tool-call JSON) into the function's typed
params, (b) call the core function, (c) render the typed result to their surface-native output (console
text / JSON-RPC response). `src/storage` (git-backed file I/O) and `src/memory`/`src/dna`/`src/directives`/
`src/workflow` (per-pillar rules, e.g. the state machines in `memory.yaml`) sit *underneath* `src/core`
and are never imported directly by `src/cli` or `src/mcp`.

```
 wingfoil (CLI, src/cli)        MCP client (agent, src/mcp)
        |                                |
        |   parse argv -> params         |   parse Tool/Resource call -> params
        v                                v
        +------------  src/core  ------------+
        |   one function per operation        |
        |   (validation, orchestration,       |
        |    calls into memory/dna/           |
        |    directives/workflow/storage)     |
        +--------------------------------------+
```

### 2. Function shape

Every core function has the same TypeScript shape: a single typed params object in, a single typed
`CoreResult<T>` out — synchronous surfaces (CLI, MCP) both `await` it. No function throws for
*expected* domain failures (illegal state transition, missing element, schema violation); those are
returned as `CoreResult.error`, so both the CLI's exit-code/stderr rendering and the MCP Tool's
`isError` response are driven by the same discriminated union, not by ad hoc try/catch per surface.

```ts
// src/core/types.ts
export type CoreResult<T> =
  | { ok: true; value: T; commit?: { sha: string; message: string }; warnings?: readonly string[] }
  | { ok: false; error: CoreError };

export interface CoreError {
  code: "NOT_FOUND" | "INVALID_TRANSITION" | "VALIDATION" | "CONFLICT" | "IO";
  message: string;
  details?: Record<string, unknown>;
}

// src/core/registry.ts
export type CoreFn<P, R> = (params: P) => Promise<CoreResult<R>>;

export interface CoreModule {
  readonly name: string;              // e.g. "memory", "dna", "workflow"
  readonly operations: Record<string, CoreOperation>;
}

export interface CoreOperation {
  readonly name: string;              // e.g. "memoryApprove"
  readonly mutates: boolean;          // true => MCP Tool, false => MCP Resource; CLI exposes both
  readonly fn: CoreFn<unknown, unknown>;
  // CLI declaration, all optional; the CLI's --help and argument registration derive from them:
  readonly flags?: readonly CoreFlag[];        // boolean --{name} flags, each with a description
  readonly options?: readonly CoreOption[];    // value-bearing --{name} <placeholder> options
  readonly description?: string;               // the one-line --help summary (= cli-reference first sentence)
  readonly positional?: CorePositional;        // the operand it reads (e.g. <id>, [section]) and whether required
  readonly example?: string;                   // one complete invocation shown under "Example:" (spec-008 §8)
}
```

`warnings` is the success-warning channel: what a successful operation wants the operator told,
kept out of `value` so it never becomes part of the payload a caller parses. It is absent when there
is nothing to say. The CLI writes each warning to stderr (`spec-008` §6), an MCP Tool result carries
them as `structuredContent` (`spec-004` §4.3 item 5). A failure has no `warnings`: its reason and
details are the whole message.

`mutates: true` operations MUST be exposed by `src/mcp` only as MCP **Tools** (never Resources, which
are read-only per REQ-INT-01: "MCP Resources are read-only — mutations only via
validated MCP Tools"); `mutates: false` operations are exposed as MCP **Resources**. The CLI exposes
every operation regardless of `mutates`, as a `wingfoil <module> <verb>` subcommand. This single
`mutates` flag is the one place surface-routing logic lives — it is read by both `src/cli`'s command
registrar and `src/mcp`'s Tool/Resource registrar, so adding an operation to `CoreModule.operations`
is sufficient to make it reachable from both surfaces; no per-surface wiring is hand-written.

### 3. Core functions (surface per `X_cli-cmds.md` and the ratified DLs; release per row)

Grouped by **pillar** — the bold headings below are a human, editorial grouping and are **not**
`CoreModule.name`. The registering `CoreModule` is named explicitly in the `module` column: its value is
the `CoreModule.name` the operation is registered under in `CORE_MODULES` (`src/core/index.ts`). That
value is wire-visible — it is the `wingfoil <noun>` CLI segment and the `{module}` segment of the MCP
Tool name / Resource URI, and it is the prefix `deriveVerb` (`src/core/registry.ts`) strips from the
function name to obtain the verb — so it is pinned per row rather than inferred from the heading. A
`module` value marked *(planned)* belongs to an operation not yet registered in `CORE_MODULES`, and
names the module its acceptance contract (BDD feature file) or a decision-log mandates; an unmarked
value is the module the operation is registered under today. Each row: function name (camelCase,
matches `{module}{Verb}` — e.g. `memoryApprove` — or, for a **self-named flat operation**, is exactly its
module's name — `paths` — from which `deriveVerb` derives no verb, so the CLI command is the bare
`wingfoil <module>` and the MCP name the bare module), `module`, `mutates`, and the CLI command / MCP
exposure it backs. The two **bootstrap commands** (`init`, `mcp`) are not core functions: their rows
name the CLI entry function instead and are outside the parity of §4 (REQ-SYS-05's bootstrap
exemption).

> **MCP naming — authoritative source is `spec-004-mcp-surface-contract`.** The MCP column below uses
> the wire-visible names defined by `spec-004` (`scope: src/mcp`): **Tool names are dot-form
> `{module}.{verb}`** (`spec-004` §4.1), and **Resource URIs use the `wingfoil://{module}/{query}`
> scheme** (`spec-004` §2.1). An earlier draft of this table used a `{module}_{verb}` snake-case Tool
> form and a `{module}://{query}` URI form; those were **superseded** by `spec-004` and corrected here
> (reconciled as a fast-follow to `task-006`, whose review surfaced the discrepancy — see Process
> Notes). `spec-004` §2.1 owns the fuller sub-resource addressing (`wingfoil://memory/{type}/{id}`,
> `wingfoil://dna/{section}`); the mechanical zero-argument `wingfoil://{module}/{verb}` form shown
> here is what a read-only op with no parameter metadata resolves to today (`src/mcp/registrar.ts`).

**Memory pillar** (P1, `src/memory`):

| function            | module                | mutates | CLI                     | MCP                          |
|----------------------|------------------------|---------|--------------------------|-------------------------------|
| `memoryAdd`          | `memory`               | true    | `wingfoil memory add`    | Tool `memory.add`             |
| `memorySearch`       | `memory`               | false   | `wingfoil memory search` | Resource `wingfoil://memory/search`    |
| `memoryImport`       | `memory` *(planned)*   | true    | `wingfoil memory import` | Tool `memory.import`          |
| `memorySubmit`       | `memory`               | true    | `wingfoil memory submit` | Tool `memory.submit`          |
| `memoryApprove`      | `memory`               | true    | `wingfoil memory approve`| Tool `memory.approve`         |
| `memoryReject`       | `memory`               | true    | `wingfoil memory reject` | Tool `memory.reject`          |
| `memoryDeprecate`    | `memory`               | true    | `wingfoil memory deprecate` | Tool `memory.deprecate`    |
| `memoryAmend`        | `memory`               | true    | `wingfoil memory amend`  | Tool `memory.amend`           |
| `memoryPark`         | `memory`               | true    | `wingfoil memory park`   | Tool `memory.park`            |
| `memoryHistory`      | `memory`               | false   | `wingfoil memory history`| Resource `wingfoil://memory/history/{id}` |

**DNA pillar** (P2, `src/dna`):

| function   | module              | mutates | CLI                | MCP                     |
|------------|----------------------|---------|---------------------|--------------------------|
| `dnaAdd`     | `dna`              | true    | `wingfoil dna add`    | Tool `dna.add`         |
| `dnaRemove`  | `dna`              | true    | `wingfoil dna remove` | Tool `dna.remove`      |
| `dnaSet`   | `dna`                | true    | `wingfoil dna set`  | Tool `dna.set`           |
| `dnaShow`  | `dna`                | false   | `wingfoil dna show` | Resource `wingfoil://dna/show`    |
| `dnaUpdate`  | `dna`              | true    | `wingfoil dna update` | Tool `dna.update`      |
| `dnaInfer` | `dna` *(planned)*    | true    | `wingfoil dna infer`| Tool `dna.infer`         |
| `paths`      | `paths`            | false   | `wingfoil paths`    | Resource `wingfoil://dna/paths` *(URI per `dl-040`; the registrar derives `wingfoil://paths`)* |

**Directives pillar** (P3, `src/directives`) — two nouns by design: singular `directive` for the
per-directive mutations (BDD P3.1–P3.3), plural `directives` for the listing (BDD P3.4)
(`dl-041-spec-006-module-grouping-vs-core-module-name`):

| function            | module                   | mutates | CLI                        | MCP                          |
|----------------------|---------------------------|---------|------------------------------|--------------------------------|
| `directiveCreate`    | `directive`               | true    | `wingfoil directive create`  | Tool `directive.create`       |
| `directiveAssign`    | `directive`               | true    | `wingfoil directive assign`  | Tool `directive.assign`       |
| `directiveRemove`    | `directive`               | true    | `wingfoil directive remove`  | Tool `directive.remove`       |
| `directivesList`     | `directives`              | false   | `wingfoil directives list`   | Resource `wingfoil://directives/list`  |

**Workflow pillar** (P4, `src/workflow`) — the v0.3 surface (`minor-v0.3` `features:` P4.2–P4.9, plus
`workflow finalize` by approver ruling R11; normative command contracts, operands, errors and MCP
exposure in `spec-017` (workflow commands and state deduction) §7–§10, which this table follows cell
for cell):

| function          | module                  | mutates | CLI                          | MCP                                          | feature |
|--------------------|--------------------------|---------|-------------------------------|-----------------------------------------------|---------|
| `workflowStart`    | `workflow` *(planned)*   | true    | `wingfoil workflow start`     | Tool `workflow.start` *(v0.4, P5.2.3)*        | P4.2    |
| `workflowEnd`      | `workflow` *(planned)*   | true    | `wingfoil workflow end`       | Tool `workflow.end` *(v0.4)*                  | P4.3    |
| `workflowNext`     | `workflow` *(planned)*   | false   | `wingfoil workflow next`      | Resource `wingfoil://workflows/-/next` (the active instance) — v0.3, ruling R12 | P4.4    |
| `workflowStatus`   | `workflow` *(planned)*   | false   | `wingfoil workflow status`    | Resource `wingfoil://workflows/-/status` — v0.3, ruling R12 | P4.5    |
| `workflowFinalize` | `workflow` *(planned)*   | true    | `wingfoil workflow finalize`  | Tool `workflow.finalize` *(v0.4)*             | ruling R11 (`dl-104` D1) |
| `workflowList`     | `workflow`               | false   | `wingfoil workflow list`      | the shipped `wingfoil://workflows` keeps its payload in v0.3 | P4.6    |
| `workflowShow`     | `workflow` *(planned)*   | false   | `wingfoil workflow show`      | the shipped `wingfoil://workflows/{name}` keeps its payload in v0.3 | P4.7    |
| `workflowCreate`   | `workflow` *(planned)*   | true    | `wingfoil workflow create`    | Tool `workflow.create` *(v0.4)*               | P4.8    |
| `workflowRemove`   | `workflow` *(planned)*   | true    | `wingfoil workflow remove`    | Tool `workflow.remove` *(v0.4)*               | P4.9    |

- **Why each `mutates` value.** `workflowStart` / `workflowEnd` open and close a startable workflow
  instance and set or clear the active context (P4.2, P4.3, REQ-STATE-03); `workflowFinalize` writes
  the phase-record commit of a phase that has no Memory or file evidence (ruling R11, `dl-104` D1);
  `workflowCreate` writes a workflow file and its manifest entry (P4.8); `workflowRemove` deletes a
  custom workflow after the REQ-SEC-07 referrer check (P4.9). `workflowNext`, `workflowStatus`,
  `workflowList` and `workflowShow` only read: in v0.3 `workflow next` **names** the next step, its
  element, its role and its verb and does not advance it, because step execution (P4.10) is v1.0
  (plan R3); state is deduced from Memory and commit history, never stored (P4.13, REQ-SYS-03).
- **Operands.** Every workflow command that works on one instance takes the positional `<ref>` (a
  workflow name or an open instance id, `spec-017` §3.3, §7); no `--name` option exists. The BDD
  `--name` spelling (P4.2/P4.3/P4.7/P4.8) is amended in its own task (`spec-017` Consequences).

**Project bootstrap & audit** (P5.1, P5.2.1; no dedicated pillar module):

| function     | module                                                                 | mutates | CLI              | MCP                    |
|--------------|-------------------------------------------------------------------------|---------|-------------------|--------------------------|
| `runInit` *(CLI entry, `src/cli/init-command.ts`)* | — *(bootstrap command, not a `CoreModule`: wired directly in `src/cli/program.ts`)* | true    | `wingfoil init`   | — *(bootstrap; not MCP-exposed)* |
| `runMcp` *(CLI entry, `src/cli/mcp-command.ts`)*   | — *(bootstrap command, not a `CoreModule`: wired directly in `src/cli/program.ts`)* | false   | `wingfoil mcp`    | — *(bootstrap; it hosts the MCP surface, `spec-014` §1)* |
| `audit`      | `audit` *(planned — self-named flat operation, BDD P5.1.3)*             | false   | `wingfoil audit`  | Resource `wingfoil://audit` |

- **The bootstrap commands are not on MCP** (`dl-046-bootstrap-commands-in-spec-006-section-3` A(a)).
  `init` must run before a WingFoil project exists, and `mcp` starts the server an agent is connected
  through, so an agent connected over MCP is already inside an initialised project and neither has a
  caller there. REQ-SYS-05's Fit Criterion exempts both by name; they are wired outside `CORE_MODULES`,
  which is why no registrar derives a Tool or Resource for them.
- **`audit` is a flat, self-named operation** (`dl-046` B(a)): module `audit`, op `audit`, so `deriveVerb`
  yields the bare `wingfoil audit` BDD P5.1.3 states and `deriveMcpResourceUri` the Resource
  `wingfoil://audit`, with no registrar change. That is the derivation the registrar applies to `paths`
  today (`wingfoil://paths`); whether the `paths` row's MCP cell follows it is
  `dl-040-spec-006-resource-uri-divergence`'s question.

**Agent execution** (P5.3, `src/agent` *(planned module, `spec-016` §1)*, `CoreModule.name` `agent`)
— the v0.3 surface (`minor-v0.3` `features:` P5.3.1–P5.3.3; run tracking per `dl-135`; normative
contract in `spec-016` (agent execution), whose §8 carries the same three rows):

| function         | module                | mutates | CLI                        | MCP                                         | feature |
|-------------------|------------------------|---------|-----------------------------|----------------------------------------------|---------|
| `agentExecute`    | `agent` *(planned)*    | true    | `wingfoil agent execute`    | Tool `agent.execute` *(v0.4; refuses until v1.0)* | P5.3.1  |
| `agentList`       | `agent` *(planned)*    | false   | `wingfoil agent list`       | Resource `wingfoil://agent/list` *(v0.4; URI per `dl-040`)* | `dl-135` point 4 |
| `agentShow`       | `agent` *(planned)*    | false   | `wingfoil agent show`       | Resource `wingfoil://agent/show/{run-id}` *(v0.4; URI per `dl-040`)* | `dl-135` point 4 |

- **`agentExecute` is `mutates: true`** because it commits the run record of `dl-114` (Q2 (b), with
  the session id `dl-135` point 2 adds), under the subject `agent: record <run-id>`, after launching
  the agent's own CLI through a declared per-agent adapter (plan R2). It does **not** advance the
  workflow step: in v0.3 it launches the agent on the step `workflow next` names, and step execution
  (P4.10) is v1.0. v0.3 runs every agent `fresh`; `--resume` / `--ref` are v0.4 (`dl-135` release
  split). The instance is selected with `--workflow <ref>`, `spec-017` §3.3's selector as an option,
  and the step, when the frontier holds several, with `--step <key>` (approver ruling R16, 2026-09-30,
  `release-planning-rel-v0.3-plan`; `spec-016` §3.1).
- **`agentList` / `agentShow` read** the run log and the workflow deduction: `agent list --past` and
  `--waiting` ship in v0.3, `--active` (the git-ignored `.wingfoil/run/` registry, `dl-135` Q1 (a))
  in v0.4; `agent show` takes a run id `<element-id>/<phase>/<n>` (`dl-135` Q3 (a)). The `feature`
  cells carry `dl-135` until `06_features.md` gains the P5.3 rows `dl-135` Action 3 asks for; the new
  ids then replace it.

**MCP exposure of the v0.3 rows.** v0.3 ships every operation above on the **CLI**. On MCP:

- **Tools** (`mutates: true`) come with P5.2.3, which is in `minor-v0.4` `features:`. No Tool of any
  module is served today: the production server (`src/mcp/server.ts`, `createMcpServer`) registers
  only the read-only Resources and the role Prompts and deliberately does not call
  `registerCoreModules`. Since `task-174` it answers `tools/list` with an empty list (`bug-151`).
  The `memory` and `dna` Tools are in the same position. `agent.execute` is served from v0.4 but
  refuses every call until headless launch exists (v1.0, `spec-016` §3.5, §7), because an MCP
  caller has no terminal.
- **The two workflow Resources of v0.3** (ruling R12): `workflowNext` and `workflowStatus` are
  served on the production server in v0.3, at `wingfoil://workflows/-/next` and
  `wingfoil://workflows/-/status`, registered next to `registerWorkflowResources` through
  `registerReadOnlyResources` (`src/mcp/index.ts:79-83`), with the same read-only refusal. They extend
  the already-shipping `wingfoil://workflows…` family (`src/mcp/workflow-resource.ts`) without
  colliding with `wingfoil://workflows/{name}`: their second segment is `-`, which no workflow name
  can be (`spec-003` § "Names", `[a-z][a-z0-9-]*`), and they have a third segment, which the
  single-segment `{name}` template never matches (`spec-017` §9). Their payloads are `spec-017` §8's
  `NextResult` and `StatusResult`, read at `HEAD` — a declared exception to §6 item 4 below, justified
  by determinism (approver ruling R15, 2026-09-30, `release-planning-rel-v0.3-plan`), with
  `W_UNCOMMITTED_INPUTS` warning when the working tree differs (`spec-017` §1.2); §6 gains the
  sentence naming it in the implementing task.
- **The shipped workflow Resources are unchanged in v0.3**: `wingfoil://workflows` and
  `wingfoil://workflows/{name}` (`spec-004` §2.1, hand-registered) keep their payload and their
  working-tree baseline (§6 item 4), so v0.3 makes no breaking change on the MCP surface. Aligning
  them with `workflowList` / `workflowShow`'s v0.3 CLI payloads belongs with the URI unification of
  `dl-040` (`in-discussion`, `release: "v0.4"`).
- **The agent Resources** are v0.4 (`dl-135` release split, plan R5). `dl-135` point 4 names the
  Resource `wingfoil://agents/runs`; the cells above are the mechanical `wingfoil://{module}/{verb}`
  form `registerCoreModules` would derive (`src/mcp/registrar.ts`). Which form the v0.4 Resource
  takes, and how a run id containing `/` is addressed (percent-encoded, or three segments), is
  `dl-040`'s and `spec-004`'s question, settled with that Resource (`spec-016` §7); the agent cells
  are placeholders for the parity cross-reference, not a URI decision.

### 4. Parity rule (structural, not tested-for)

1. `src/cli`'s command registrar and `src/mcp`'s Tool/Resource registrar both import the **same**
   `CoreModule[]` array from `src/core/index.ts` (no duplicated or hand-copied operation list in
   either surface module).
2. Each registrar iterates that array and registers **every** operation it finds — the CLI registers
   all of them as subcommands; the MCP registrar registers `mutates: true` ones as Tools and
   `mutates: false` ones as Resources. Neither registrar is permitted a hardcoded allow/deny list of
   operation names.
3. Consequently, an operation added to a `CoreModule.operations` map by construction becomes reachable
   from **both** surfaces at the next build — there is no code path that lets `src/cli` or `src/mcp`
   expose an operation `src/core` does not define, nor omit one it does. This is what lets the
   REQ-SYS-05 fit criterion's "automated parity test enumerates both surfaces and reports 0 unmatched
   operations" be a **regression guard** (catching a future registrar bypassing the shared array) rather
   than the primary mechanism securing parity.

### 5. Naming and versioning conventions

- Function names: `{module}{Verb}` camelCase (`memoryApprove`, `dnaSet`), matching the module +
  first-noun-then-verb shape of the CLI command it backs (`wingfoil memory approve`). A **self-named
  flat operation** is named exactly after its module (`paths`, and the planned `audit`): it backs the
  flat command `wingfoil <module>`, and `deriveVerb` derives no verb from it
  (`dl-046-bootstrap-commands-in-spec-006-section-3` C). **This is the one
  naming convention `spec-006` owns** — the core-function surface is `src/core`'s (this spec's) scope.
- **MCP Tool names and Resource URIs are owned by `spec-004-mcp-surface-contract` (`scope: src/mcp`),
  not by this spec.** `spec-004` is authoritative for anything wire-visible on the MCP surface; the
  values in §3's MCP column follow it and are reproduced here only for the parity cross-reference:
  - MCP **Tool** names: dot-form `{module}.{verb}` (`memory.approve`) — `spec-004` §4.1, a mechanical
    transform of the CLI verb (space → `.`), so a code-review can still diff Tool name against the
    CLI command / core function for drift.
  - MCP **Resource** URIs: the `wingfoil://{module}/{query}[/{id}]` scheme — `spec-004` §2.1. Read-only;
    no Resource may accept a body that mutates state (enforced by `mutates: false` on the backing
    `CoreOperation`). The richer sub-resource addressing (`wingfoil://memory/{type}/{id}`,
    `wingfoil://dna/{section}`) is `spec-004` §2.1's; the zero-argument `wingfoil://{module}/{verb}`
    form is what an operation with no parameter metadata resolves to until a feature task adds it.
  - *(A prior version of this section specified snake-case `{module}_{verb}` Tools and a
    `{module}://{query}` URI scheme; both diverged from `spec-004` and were the source of the
    `task-006` reconciliation — see Process Notes.)*
- This table (§3) is the enumeration source for the REQ-SYS-05 parity test; when `X_cli-cmds.md` gains
  or removes a command, this spec is revised in the same change (§ Consequences). The bootstrap rows
  (`init`, `mcp`) are outside that parity, by REQ-SYS-05's own exemption.

### 6. Configuration baseline — which state a core function reads and writes

Because both surfaces call the same core function (§1, §4), the baseline a decision is made against
is `src/core`'s property, not the CLI's or the MCP server's. It is ratified in
`dl-080-which-baseline-each-command-reads` (`ready`, option (B), approve commit `333a3c0f`).
**This section is the normative text** (`dl-085-how-tool-implementation-rules-reach-anyone-outside-this-repo`,
`ready`, option (B)): it binds anyone implementing a `wingfoil` operation, whether or not a role
binding hands them a directive. The `command-baseline` directive
(`.wingfoil/directives/custom/command-baseline.md`, bound to `developer`, `architect` and
`reviewer` in this repository's `roles.yaml`) is its implementer's working form — arguments,
primitives, cases already decided — and points here; where the two disagree, this section wins.
Normatively, for every `CoreOperation`:

1. **A read that gates resolves at `HEAD`.** A read gates when its answer can change whether the
   operation fails or what it writes — authority (`dna.yaml`), the state machine and type registry
   (`memory.yaml`), role bindings (`roles.yaml`), the element's committed `status`, and the id or
   path a verb is about to create. Use `loadDnaYamlAtHead` / `loadMemoryYamlAtHead`
   (`src/core/loaders.ts`), which call `readPathAtRev` (`src/storage/commit.ts`); both return `null`
   when no commit carries the path, and each operation states what that means for it.
2. **A write refuses while its target carries modifications the operation does not own** —
   `requireUnmodifiedTarget` / `requireUnmodifiedTargets` (`src/core/write-guard.ts`) — and the
   commit it produces is proved to have touched only its declared scope (`verifyCommittedScope`,
   `src/core/memory-transition.ts`).
3. **A refusal under either half is a domain failure**: it reaches the caller as a `CoreResult` error
   (§2) and exits `1` per `spec-005-cli-command-contract` §1 — never `2`, which stays for malformed
   invocations, and never a throw.
4. **A read that gates nothing may read the working tree** — that is what `dna show`, `paths`,
   `directives list`, `memory search`, `memory history` and the shipped MCP Resources exist to do
   (`dl-084-which-baseline-a-read-only-verb-reports-from`, `ready`, option (A)), except where item 6
   declares a `HEAD` read. An operation that can refuse on what it read has gated, whatever the read
   was nominally *for*.
5. **A read that predicts the target of an imminent filesystem mutation resolves on the
   filesystem; every other gating read keeps `HEAD`** (`dl-086-a-guard-over-a-filesystem-effect-resolves-on-the-filesystem`,
   `ready`, adopted as proposed). `unlinkSync` and `writeFileSync` follow the symlinks on disk and
   consult no commit, so a confinement or symlink guard in front of them (`requireConfinedTarget`,
   `resolveConfinedMemoryPath`, `requireInspectableTarget`) asks the filesystem. The category is
   decided by the read's purpose, not by its nearness to a mutation: resolving a directive **name**
   before deleting it is a read about what the project declares and is owed to `HEAD`
   (`bug-108-directive-remove-resolves-its-target-on-the-working-tree`, open). The guard leaves a
   time-of-check-to-time-of-use window that no path-based API closes; it turns a self-inflicted loss
   into a refusal and is not an adversarial defence. There is no further category of gating read.
6. **Declared `HEAD` reads.** `workflowStatus`, `workflowList`, `workflowShow`, `agentList`,
   `agentShow` and the two v0.3 workflow Resources `wingfoil://workflows/-/next` and
   `wingfoil://workflows/-/status` resolve at `HEAD`, a declared exception to item 4 and to `dl-084`
   (A), justified by determinism: one deduction answers all of them and must not answer from two
   baselines. `workflowNext` resolves at `HEAD` under item 1 — it refuses an unresolvable `<ref>` and
   its first step is what `agent execute --next` launches (`spec-017` §1.1) — and is named here only
   for completeness (approver ruling R15, 2026-09-30, `release-planning-rel-v0.3-plan`;
   `spec-017` §1.1, `spec-016` §5.1). When the working tree differs under the paths the deduction
   reads, they still answer from `HEAD` and emit `W_UNCOMMITTED_INPUTS` naming those paths
   (`spec-017` §1.2).

Which shipped and v0.3 operation reads which baseline, by the items above (the per-command form for
users is `spec-008-cli-grammar` §11):

| Baseline | Operations |
|----------|------------|
| `HEAD`, gating (item 1) | `memoryAdd` (type registry and scaffold; its `{n}` counter reads the wider baseline `command-baseline` declares, which can only raise the id), `memorySubmit`, `memoryApprove`, `memoryReject`, `memoryDeprecate`, `memoryAmend` (state machine, the document their `<id>` names and its committed `status` — `findMemoryDocumentByIdAtRev` at the one sha `prepareMemoryTransition` resolves — and approver authority on the gated verbs; the working tree supplies the content `memorySubmit` and `memoryAmend` commit and is checked to be the element `HEAD` records); `dnaSet`, `dnaAdd`, `dnaUpdate`, `dnaRemove` (`dna.yaml`, read only after item 2 has refused any difference from `HEAD`); `directiveAssign` (role catalogue, directive inventory, bindings); `directiveRemove`'s referrer check (`roles.yaml`, `loadRolesYamlAtHead`); `workflowNext`, from the task that ships it in v0.3 |
| `HEAD`, declared (item 6) | `workflowStatus`, `workflowList`, `workflowShow`, `agentList`, `agentShow`, the two v0.3 workflow Resources — each from the task that ships it in v0.3 |
| working tree, gating nothing (item 4) | `dnaShow`, `paths`, `directivesList`, `memorySearch`, `memoryHistory` (its log is git's, its `memory.yaml` the working tree's), the shipped MCP Resources and the role Prompts; `workflowList` until its v0.3 reshape moves it to item 6 |
| filesystem, predicting an effect (item 5) | the confinement and symlink guards of every writing or deleting operation, and `directiveCreate`'s check that its target file does not exist |
| working tree, deviating | `directiveRemove`'s name resolution (`bug-108`) — owed to `HEAD` |

Symbols in this section read at `9642ab5f`; items 4–6 and the table at `e942e8e9`.

### 7. Pre-flight of the memory transition verbs, and the one identity they use

`memory submit`, `approve`, `reject`, `deprecate`, `park` and `amend` — every registered `memory`
operation that moves or amends an existing document — run their refusals in one declared order, each before
the single write, so "the state is unchanged" holds on every refusal by construction:

1. **Usage checks** — the `<id>` operand, then `--reason` (required on `approve`, `reject` and
   `amend` by REQ-SEC-04, and on `park` by `dl-110`; optional on `deprecate`, where a given reason
   must still be recordable) →
   `UsageError`, exit `2`. They read nothing, so a malformed invocation exits `2` whether or not git
   has an identity (`task-125`, `bug-172`).
2. **Identity** (REQ-SEC-01) → exit `1` when no name or no email resolves.
3. **Transition legality** — the document located, its type and state resolved against the
   `memory.yaml` committed at `HEAD` (§6), the verb's edge resolved (`dl-032`, `dl-053`) → exit `1`.
   When the target state declares a WIP limit (`spec-001` `limits`) that the documents of the type
   in that commit already reach, the transition is refused here too (`CONFLICT`, exit `1`), whichever
   verb or engine action asked for it (`requireWipSlot`, `task-180`).
4. **Authority** (REQ-SEC-03), on `approve` and `reject` → exit `1`,
   `user not authorized to approve type '<type>'`, read from the `dna.yaml` committed at `HEAD`.
5. **Write** — one commit, scoped to the document. An `approve` that fires the `supersedes:` trigger
   (`spec-001`) also resolves the superseded element at step 3's commit and refuses it before any
   write. It then makes a second commit, scoped to that element (`spec-008` §2, `finalize`).

Steps 2 and 3 are one shared function, `beginMemoryTransition` (`src/core/memory-transition.ts`);
no verb reads the identity or prepares the transition on its own.

**Legality before authority** (`dl-064` A.1). Step 4 follows step 3 because its message names the
document's type, which is known only once step 3 has located the document. The one observable
consequence: a caller who is unauthorized *and* attempts an illegal transition is told about the
transition, not about authority. Both refusals exit `1` (every `CoreErrorCode` maps to `1`,
`src/core/exit-code.ts`) and neither writes anything, which is what makes the order safe; a future
`CoreErrorCode` mapped to another exit code would make it observable and must revisit this clause.
The order is declared for `approve` and `reject`, the two approval gates. `deprecate` and `submit`
have no step 4 (`dl-027`: `deprecate` is not an approval gate), nor does `park` (`dl-110`: a
scheduling decision, not an approval). `amend` runs the same authority
check (`dl-108` A2 (i)), after step 3 and its confinement check (REQ-SEC-06), and before its own
amendability checks.

**One identity, never two** (`dl-064` B.1, `bug-149`). Step 2 resolves the identity once, the way
`git commit` resolves its author — `GIT_AUTHOR_NAME`/`GIT_AUTHOR_EMAIL`, then `author.name`/
`author.email`, then `user.name`/`user.email`, each field independently; a variable that is set but
blank does not fall back — git refuses a blank name and records a blank email as `<>`; the check
refuses both; git's `EMAIL` variable and hostname
guess are not followed, since REQ-SEC-01 exists to refuse an identity nobody configured. That one
value is the principal step 4 authorizes, the `Name <email>` of the `Approver:` line, and the commit's
author, which step 5 pins by setting `GIT_AUTHOR_NAME`/`GIT_AUTHOR_EMAIL` in the commit's
environment (not `--author`, a string git re-parses) so git cannot substitute another. With
`GIT_AUTHOR_EMAIL` naming someone other than `user.email`, the environment's identity is therefore
the one checked, recorded and authored — and refused when it holds no `approver` role.

**Step 2 refuses whatever would stop the commit.** The committer must resolve too, by the same rule
(`GIT_COMMITTER_*`, then `committer.*`, then `user.*`), because `git commit` refuses without one: an
author alone would pass step 2 and fail in step 5, after the document was written. And no name or
email of either identity may contain `<`, `>` or a control character (`git identity not usable: …`,
exit `1`): `<`/`>` delimit the email in git's ident format and a newline ends a line of the commit
body, so either could make the recorded author or the `Approver:` line differ from the principal
authorized. The check is `requireGitIdentity` (`src/core/git-identity.ts`), shared by every mutating
operation, not only the transition verbs. The committer is otherwise git's own and is not pinned: the
audit record (`memory history`, REQ-SEC-02) reads the author.

## Consequences

- `src/cli` and `src/mcp` become thin: no business logic to keep in sync by hand, so a bug fix or a
  new validation rule in a core function (e.g. a stricter `memory.yaml` transition check) is
  automatically identical on both surfaces without a second patch.
- The REQ-SYS-05 parity test (an automated CLI-vs-MCP enumeration diff) becomes a **regression guard**
  against a registrar bypassing the shared `CoreModule[]` array (§4.3), not the mechanism that
  produces parity in the first place — parity is structural.
- Any task implementing a new CLI command or MCP Tool/Resource MUST add its operation to `src/core`
  first (TDD: a failing core-level test before the CLI/MCP wiring), never bypass `src/core` to hand-roll
  logic in `src/cli` or `src/mcp` — a dev-loop code-review finding "logic added directly to src/cli or
  src/mcp" is a REQ-SYS-05 violation, not a style nit.
- When `docs/01_vision/X_cli-cmds.md` adds, renames, or removes a command, this spec's §3 table must be
  revised in the same task/commit that changes the CLI reference, keeping the enumeration source
  authoritative.

## Process Notes

Authored proactively during `initial-design` (no code exists yet to react to a gap). Grounded directly
in `docs/02_requirements/03_sard/01_architecture.md` (REQ-SYS-05, verbatim description/fit
criterion/traceability) and `.wingfoil/dna.yaml` (`modules: core/cli/mcp-server` descriptions
and `path:` values); the §3 function/command enumeration cross-checks every row against
`docs/01_vision/X_cli-cmds.md` (approved v1.2) so the operation table matches the currently-approved CLI
surface rather than an invented one. No prior-art source was available or used.

**Revision (2026-07-05) — MCP naming reconciled to `spec-004`, as a fast-follow to `task-006`.**
`task-006-dual-interface-shared-core`'s independent review found that this spec's §3/§5 MCP naming
(snake-case `{module}_{verb}` Tools, `{module}://{query}` Resource URIs) contradicted
`spec-004-mcp-surface-contract` (dot-form `{module}.{verb}` Tools, `wingfoil://…` URIs). Because
`spec-004` is the spec explicitly scoped to `src/mcp`, it is authoritative for the wire-visible MCP
surface, and `task-006`'s shipped `src/mcp/registrar.ts` correctly followed it. This spec's §3 table
and §5 conventions were the stale side and are now corrected to match — removing a traceability hazard
before the MCP feature tasks (`task-011`, `task-030`, and the `memory`/`dna` CLI+MCP tasks) build on
this table's enumeration. No core-function names (`{module}{Verb}`, §5 bullet 1 — the part `spec-006`
actually owns) changed; only the MCP column, which merely reproduces `spec-004`'s naming for the
parity cross-reference. Recorded per the user's decision to revise `spec-006` (rather than open a
separate decision-log) to close the gap.

**Revision (2026-09-17) — explicit `module` column in §3, per `dl-041-spec-006-module-grouping-vs-core-module-name`.**
§3's preamble claimed its groupings **are** `CoreModule.name`; that was false for `pathsQuery`
(registered on module `paths`, not `dna`) and `directiveCreate` (registered on module `directive`, not
`directives`). `dl-041` (approved, option **(b)**) kept the pillar headings as the human grouping, added
a `module` column naming the registering `CoreModule`, and corrected the preamble. It also recorded
that `directiveAssign`/`directiveRemove` register on the singular `directive` module
(`wingfoil directive assign|remove`, Tools `directive.assign|remove`), now pinned in their rows.
Unmarked `module` values were read off `CORE_MODULES` (`src/core/index.ts`) and cross-checked by
enumerating the registry with `enumerateOperations`/`deriveVerb`/`deriveMcpToolName`/
`deriveMcpResourceUri`; *(planned)* values follow the operations' BDD feature files. No other column
changed — the Resource-URI column is `dl-040-spec-006-resource-uri-divergence`'s scope. Edited in place
without a supersede or a state change, per the `spec-001` precedent `dl-041` cites.

**Revision (2026-09-18) — `directiveRemove`'s *(planned)* marker dropped, per
`task-052-directive-remove`.** The operation is now registered in `CORE_MODULES` on the singular
`directive` module (`src/core/index.ts`), so its `module` value is no longer a claim read off its BDD
feature file but the module it actually registers under, and §3's preamble rule ("an unmarked value is
the module the operation is registered under today") applies to it. Verified by enumerating the real
registry — `deriveVerb('directive', 'directiveRemove') === 'remove'` and
`deriveMcpToolName('directive', 'remove') === 'directive.remove'`, asserted in
`test/core/directive-remove.test.ts`. No other cell changed; edited in place without a supersede or a
state change, per the same precedent the 2026-09-17 revision cites.

**Revision (2026-09-21) — P3.7 registers no operation; `directiveAssign` serves it, per
`task-056-role-based-directive-assignment`.** Feature **P3.7** (US-4-06, "bind multiple directives to
one role", BDD `p3-directives/P3.7-role-based-assignment.feature`) has **no row of its own in §3, and
needs none**: it is `directiveAssign` with a comma-separated `--directive` value
(`wingfoil directive assign --directive testing,code-quality,security --role developer`), not a fourth
directive verb. The evidence is unanimous across the documents that fix the surface —
`spec-008-cli-grammar` §1 enumerates the singular noun's verbs as `create`, `assign`, `remove`;
`docs/01_vision/X_cli-cmds.md:95-98` lists the same three plus `directives list`; and
`docs/01_vision/06_features.md:67,201` describes P3.7 as a *relationship* ("one role → multiple
directives"), not a command. Recorded here because the absence of a row is otherwise indistinguishable
from an omission: a future reader looking for P3.7's operation should find this note instead of adding
one. The `directiveAssign` row is unchanged (its `module`, `mutates`, CLI and MCP cells all still hold);
only the payload behind it widened, and §3 pins no result types. Edited in place without a supersede or
a state change, per the same `spec-001` precedent the 2026-09-17 revision cites.

**Revision (2026-09-23) — §3's DNA table gains `dnaAdd`, `dnaRemove` and `dnaUpdate`, per
`dl-081-dna-mutation-surface-shape` (`ready`, approve commit `5aaa5af`, option (E)) and
`task-093-dna-mutation-surface-add-remove-update`.** The table previously carried `dnaSet` alone for
the mutating half of the DNA pillar, which matched the code and understated the contract: `dna set`
reached 7 of roughly 38 schema fields, because everything array-valued — 11 fields, plus 17 more
inside array entries — was unreachable for create, update and delete. No spec recorded that
restriction, and the three that mention the command (this one, `spec-002`, and P2.1's "Basic CRUD
operations" at Critical priority) implied the opposite.

The shape ratified is the collection travelling in an **option** rather than in the verb name —
`dna add|remove|update <full path> --value <v>` (respelled by the 2026-09-24 revision below; ratified
as `--field <full path>`)
does. §3's one-Tool-per-function rule is what chose it: the verb count stays constant as `spec-002`'s
schema grows, so the whole pillar costs **three** Tools rather than the dozen a per-collection verb set
(`dna add-member`, `dna add-role`, …) would have cost, and rather than the none a `dna edit` could
offer. The MCP column follows `spec-004` §4.1's dot form mechanically, as every other row does; the
three names are asserted against the real registry in `test/core/dna-mutation-surface.test.ts`
(`deriveVerb` → `deriveMcpToolName`) and the REQ-SYS-05 parity diff in `test/core/parity.test.ts` now
enumerates twelve mutating operations on both surfaces.

`dnaSet`'s row is unchanged and the operation is kept: `dl-081` AC9 settled that `update` does not
subsume `set`, which keeps `dna set` as the scalar verb `P2.1-dna-set.feature` and
`spec-005` §4 name. Internally it is now `update` restricted to a single value — one resolver, one
write path, two spellings. Edited in place without a supersede or a state change, per the same
`spec-001` precedent the 2026-09-17 revision cites.

**Revision (2026-09-24) — the DNA grammar quoted in the note above is respelled to
`dl-082-cli-parameter-shape`, in the same task that added the rows.** §3's table is untouched, and
could not be otherwise: its cells carry function names, `mutates`, and a CLI command and MCP Tool
name, none of which `dl-082` moves. The MCP side is addressed by Tool name and has no
positional/option distinction at all, so the decision does not reach that column either. What is
corrected is the **prose**, which quoted `dna add|remove|update --field <full path> --value <v>` and
"the positional `dna set <key> <value>` grammar". The grammar is now
`dna add|remove|update <path> --value <v>` and `dna set <path> --value <v>`: `dl-082` states the rule
the other nine `dna`/`memory` commands already followed — a positional carries the identity of the
target, an option a named attribute — and the DNA surface was the only place that disagreed, in both
directions at once.

`dnaSet` losing its second positional is a breaking change to a shipped command, made before
`minor-v0.2` is published. The parity guarantee this section exists for is untouched: the argument
shaping lives in each surface's `ParamsBuilder` (`spec-006` §2), so moving a value between a
positional and an option changes neither the function set nor the one-Tool-per-function rule, and
`test/core/parity.test.ts` still enumerates the same twelve mutating operations on both surfaces.
Edited in place without a supersede or a state change, per the same `spec-001` precedent the
2026-09-17 revision cites.

**Revision (2026-09-24) — the new §6 records which baseline a core function reads and writes, per
`dl-080-which-baseline-each-command-reads` (`ready`, option (B), approve commit `333a3c0f`) Action 4
and `task-094-write-the-baseline-rule-where-implementers-meet-it`.** Nothing above §6 changes; §3's
table, the parity rule and the naming conventions are untouched, because the baseline is a property
of how an operation decides, not of which operations exist.

Why this spec rather than `spec-005` or `spec-008`, the two `task-094`'s AC1 names: the reads are
made in `src/core`, the primitives that make them live in `src/core`, and REQ-SYS-05 means an MCP
Tool inherits the rule from the same function the CLI calls. `spec-005`'s scope is the exit-code /
output-format / error-message layer and `spec-008`'s is the invocation grammar; a rule placed in
either would have bound one surface and said nothing about the other. §6.3 is the only clause that
belongs to `spec-005`, and it cites it rather than restating it.

The rule's day-to-day form lives in the `command-baseline` directive, which is auto-loaded by role
(P3.6) — the audience this spec does not reach is the implementer who never opens it, which is
precisely the audience that re-derived this rule four times (`task-091`, `task-092`, `task-093`,
`task-096`). Edited in place without a supersede or a state change, per the same `spec-001`
precedent the 2026-09-17 revision cites.

**Revision (2026-09-29) — §Context names the libraries the two surfaces are built on, per
`task-117-remove-the-unused-anthropic-sdk` (`bug-138`).** The parenthetical describing the agent
surface said "Anthropic SDK", following `adr-004`'s framing; `src/mcp` imports
`@modelcontextprotocol/sdk` and nothing imports `@anthropic-ai/sdk` (`grep -rn "@anthropic-ai" src/`
→ nothing). The one describing the human surface said "Commander.js + chalk"; nothing imports `chalk`
(`grep -rn chalk src/` → only a TSDoc line). `task-117` removes both from `package.json`, on the
approver's ruling at its review. Two parentheticals in §Context change; nothing in §Specification
does. Edited in place without a supersede or a state change, per the same `spec-001`
precedent the 2026-09-17 revision cites.

**Revision (2026-09-29) — §2's `CoreOperation` listing names the CLI declaration fields, per
`task-120-subcommand-help-describes-every-command` (`bug-128`), on the approver's ruling at its
review.** The listing showed only `name`, `mutates` and `fn`. It already omitted `flags` (task-028)
and `options` (task-020), and `task-120` added `description`, `positional` and `example`, from which
every command's `--help` is now derived. The five optional fields are listed with one-line comments,
and `src/core/registry.ts` holds their full TSDoc. `mutates` stays the only surface-routing field,
and nothing in the parity rule (§4) changes. Edited in place without a supersede or a state change,
per the same `spec-001` precedent the 2026-09-17 revision cites. Signed off with `task-120`'s
approval.

**Revision (2026-09-30) — §3's workflow and agent tables become the v0.3 surface, at
`release-planning-rel-v0.3-plan` step 5 (identify-specs), aligned with `spec-017` and `spec-016` and
with approver rulings R11 and R12.** §3's heading, its workflow and agent tables with the paragraphs
that follow them, and one Consequences bullet change; §1, §2, §4–§6 and every other §3 row are
untouched.

- **§3 heading** — "(v0.1 surface, per `X_cli-cmds.md` Pillars 1–5 + Agent Execution)" becomes
  "(surface per `X_cli-cmds.md` and the ratified DLs; release per row)": the workflow and agent
  tables now carry the v0.3 surface, and the agent table has rows (`agentList`, `agentShow`) that
  `X_cli-cmds.md` does not list yet. `X_cli-cmds.md` gains them, with `workflow finalize`, in the
  tasks `spec-016` and `spec-017` list under Consequences, which restores §5's "this table follows
  `X_cli-cmds.md`".
- **Workflow table** — follows `spec-017` §9 cell for cell. The eight existing rows keep their
  function, `module`, `mutates` and CLI cells and are ordered by feature (P4.2–P4.9, all in
  `minor-v0.3` `features:`); a `feature` column is added; **`workflowFinalize`** is added
  (`mutates: true`, ruling R11, `dl-104` D1), the ninth command. The MCP column changes: the Tools are
  *(v0.4)* with P5.2.3; `workflowNext` and `workflowStatus` are Resources **served in v0.3** at
  `wingfoil://workflows/-/next` and `wingfoil://workflows/-/status` (ruling R12, `spec-017` §9);
  `workflowList` and `workflowShow` name the shipped `wingfoil://workflows` and
  `wingfoil://workflows/{name}`, unchanged in v0.3, replacing the mechanical `wingfoil://workflow/list`
  and `wingfoil://workflow/show/{name}` cells the production server never served. A paragraph states
  why each `mutates` value holds, and one states the positional `<ref>` operand (no `--name`).
- **Agent table** — the heading names `src/agent` *(planned module)*, as `spec-016` §1 and `adr-012`
  place it, instead of "`src/core` top-level". `agentList` and `agentShow` are added (`dl-135`
  point 4, approve `7632947b`), both `mutates: false`. `agentExecute` keeps `mutates: true`, but the
  reason changes: it commits the run record (`dl-114` Q2 (b) as amended by `dl-135` point 2, subject
  `agent: record <run-id>`) and launches the agent's own CLI through a declared adapter (plan R2);
  the old reason — advancing the active step as a side effect of `--next` — no longer holds, because
  step execution is v1.0. Every agent Tool and Resource is *(v0.4)* (`dl-135` release split, plan R5),
  and `agent.execute` refuses until headless launch (v1.0). The normative contract is `spec-016`.
- **MCP paragraph** — rewritten: Tools v0.4 (the production server serves none and does not run
  `registerCoreModules`, `bug-151`); the two v0.3 workflow Resources and why their URIs cannot collide
  with `wingfoil://workflows/{name}`; the shipped workflow Resources unchanged; the agent Resources
  v0.4 with their URI and run-id encoding left to `dl-040` / `spec-004`.
- **Consequences** — the bullet proposing to split `agentExecute` into `agentResolveNext` /
  `agentAdvanceStep` is deleted: its premise, that `agentExecute` advances the step, is retired by
  this revision, and keeping it would contradict the agent paragraph of §3.
- ***(planned)* markers stay**: none of the new operations other than `workflowList` is registered in
  `CORE_MODULES` yet (`src/core/index.ts:1840-1851` registers the `workflow` module with
  `workflowList` alone; `grep -cE "name: '(agent|memoryAmend)" src/core/index.ts` → `0`). Each marker
  drops when its task registers the operation, as `directiveRemove`'s did (2026-09-18 note above).
- **Not folded in:** `dl-046` (bootstrap rows, REQ-SYS-05 exemption, relaxed naming rule — approve
  `2ac5a551`), `dl-064` (the approve/reject pre-flight order — approve `b1bc00e5`) and `dl-085` (§6
  normative, audience stated in the directives — approve `ae6f5a28`) each amend this spec, and each is
  carried by its own v0.3 task, not by this revision.

Settled at the `dl-022` review of this revision:
- *Operand spelling:* the positional `<ref>` of `spec-017` §7 on every workflow command; `agent
  execute` uses `--workflow <ref>` (`spec-016` §3.1). The BDD `--name` spelling (P4.2, P4.3, P4.7,
  P4.8, e.g. `P4.2-workflow-start.feature:10`) is amended in its own task.
- *The stale Consequences bullet:* deleted (above).
- *Release of the workflow Resources:* v0.3 for `next`/`status` (ruling R12); URI unification stays
  with `dl-040` (v0.4).
- *Baseline of the new read-only operations* (formerly open question 2): Resolved: R15 (approver
  ruling, 2026-09-30, `release-planning-rel-v0.3-plan`). `workflowNext`, `workflowStatus`,
  `workflowList`, `workflowShow`, the two v0.3 workflow Resources, `agentList` and `agentShow` read
  `HEAD` as a declared exception to §6 item 4, `dl-084` (A) (approve `2985b0ee`) and
  `command-baseline.md:94`, justified by determinism — one deduction, one baseline (`spec-017` §1.1,
  `spec-016` §5.1); `W_UNCOMMITTED_INPUTS` warns when the working tree differs, run-log paths
  included (`spec-017` §1.2). §6 gains, in the task that implements them, one sentence naming these
  operations as the exception; §6 is not edited before that task.

Open questions for the approver at sign-off:

1. **`spec-004` §4.1 lists `workflow next → workflow.next` as a Tool** ("advances/reads active
   step"); this table keeps `workflowNext` read-only and a Resource, per P4.4 ("Show next step"),
   plan R3 and ruling R12. *Recommendation:* amend `spec-004` §4.1 in a v0.3 task (drop the row, or
   move it to v1.0's step advancement), as `spec-017` Consequences also asks; tying it to `dl-040`
   would delay a one-line correction for no gain.
2. **A run id contains `/`** (`<element-id>/<phase>/<n>`), so `wingfoil://agent/show/{run-id}` is not a
   single URI segment. *Recommendation:* leave to v0.4 with the Resource; `spec-016` §7 records that
   it must percent-encode the id or take it as three segments.

Tech-specs carry no `version:` field, so there is nothing to bump (`dl-047-tech-specs-carry-no-version-field`,
option 1, approve `8e7e1e44`). Edited in place without a supersede or a state change, per the same
`spec-001` precedent the 2026-09-17 revision cites; `status` stays `approved`, pending the approver's
sign-off at identify-specs (`dl-022` spec-review gate).

**Revision (2026-10-01) — §6 is named the normative text, gains the filesystem-effect read and the
declared `HEAD` reads, and lists which operation reads which baseline, per
`dl-084-which-baseline-a-read-only-verb-reports-from` (A), `dl-085-how-tool-implementation-rules-reach-anyone-outside-this-repo`
(B), `dl-086-a-guard-over-a-filesystem-effect-resolves-on-the-filesystem` (adopted), all `ready`,
approver ruling R15 and `task-161-revise-command-baseline-which-verbs-read-head-filesystem`.** The
preamble names §6 as normative and the `command-baseline` directive as its working form (`dl-085`
(B)). Item 4 ("There is no third category of read") contradicted the ratified `dl-086`: it becomes
the working-tree rule for reads that gate nothing (`dl-084` (A)), item 5 states the filesystem-effect
read with `bug-108` still owed to `HEAD` and the time-of-check-to-time-of-use residual named as a
limit, and item 6 is the sentence declaring the R15 exception for `workflow status|list|show`,
`agent list|show` and the two v0.3 workflow Resources, naming `workflow next` for completeness only
since it gates (`spec-017` §1.1). The 2026-09-30 revision deferred that
sentence to "the task that implements them"; `release-planning-rel-v0.3-plan` build-backlog gave it
one owner instead, this task, on which `task-204` and `task-240` depend. A table lists which operation
reads which baseline, as `dl-084` Action 2 asks, including the gating reads the shipped code still
makes on the working tree (`directiveRemove`'s name, the transition verbs' id lookup and
`memorySubmit`'s status read), found at the task's independent review and owed to `HEAD`. Items 1–3, §1–§5 and every other section are
unchanged. Edited in place without a supersede or a state change (`dl-047`); recorded with
`memory amend`.

**Revision (2026-10-01) — the new §7 declares the pre-flight order of the memory transition verbs and
the one identity they use, per `dl-064-approver-gated-verb-preflight-order` (`ready`) A.1 and B.1 and
`task-132-read-approver-identity-once-use-authority-check-approver` (`bug-142`, `bug-149`,
`bug-153`).** Nothing above §7 changes. A.1 asked for the approver-gated pre-flight order to be
written here; its Review addendum asked that the order be scoped to `approve` and `reject` by name,
so that `memory deprecate`, which has no authority check, is not described as non-conformant; its
Code addendum (2026-09-29) records that `task-125` moved the usage checks ahead of the identity
check, and §7 states that order rather than the one in `dl-064`'s Context (i). B.1 asked for one
identity read per operation; `task-132` makes it one shared function and pins the commit author to
it, and §7 states which identity that is, because before `task-132` the authority check read
`user.*` while git authored the commit from `GIT_AUTHOR_*` first (`bug-149`). §7 also states what
the identity check must refuse so that it never passes a commit git would then refuse (a missing
committer) or record differently (`<`, `>`, control characters), both found in `task-132`'s
independent review. §7 is in this spec,
rather than in `spec-008`, because the order is `src/core`'s and binds the MCP Tools as much as the
CLI, the same reasoning the 2026-09-24 revision gives for §6. Tech-specs carry no `version:` field
(`dl-047`). Edited in place without a supersede or a state change, per the same `spec-001` precedent
the 2026-09-17 revision cites.

**Revision (2026-10-02, `task-169-make-directive-assign-refuse-whole-file-rewrite-unless`) — §2's
`CoreResult` success arm gains `warnings`, per `dl-062-roles-yaml-unwritable-fallback` (`ready`, Q1
option 3; scheduling addendum §2).** The `--force` rewrite must warn on stderr, and no success result
could carry a warning: the arm held `value` and `commit` only. §2 now declares the optional
`warnings` list and the paragraph after the code block says where each surface renders it. No other
section changed. Tech-specs carry no `version:` field (`dl-047`); edited in place without a supersede
or a state change.

**Revision (2026-10-02, `task-247-decide-every-memory-transition-from-the-element-s-committed-status-and-resolve-its-document-at-head`)
— §6's table moves the transition verbs' id lookup and status read from "working tree, deviating" to
`HEAD`, per item 1 and `bug-187`.** `prepareMemoryTransition` (`src/core/memory-transition.ts`) now
resolves `HEAD` once and reads `memory.yaml`, the document the `<id>` names and its `status` at that
sha (`loadMemoryYamlAtRev`, `findMemoryDocumentByIdAtRev`, `task-137`'s readers). The working tree
supplies the content `memorySubmit` and `memoryAmend` commit, is checked to be the same element `HEAD`
records (present, same `id` and `type`), and is otherwise read only to word a refusal (a document no
commit holds names `memory add`). The "working tree, deviating" row keeps
`directiveRemove`'s name resolution alone (`bug-108`). Items 1–7 and every other section are
unchanged. Tech-specs carry no `version:` field (`dl-047`); edited in place without a supersede or a
state change.

**Revision (2026-10-02, `task-162-fire-supersedes-trigger-superseding-element-approval`) — §7 step 5
and the `supersedes:` trigger.** `dl-065` Q1.1 has an approve move a second element. Step 5 now says
where that element is decided (at step 3's commit, before any write) and that it gets a commit of its
own. The order of steps 1–4 is unchanged. Edited in place without a supersede or a state change
(`dl-047`); pending the approver's sign-off at `task-162`'s review.

**Revision (2026-10-05, `task-165-put-bootstrap-commands-command-surface-mcp-specs-bootstrap`) — §3's
bootstrap table, the self-named flat operations, and `mcp`'s row, per
`dl-046-bootstrap-commands-in-spec-006-section-3` (`ready`; approver ruling 2026-09-29: A(a), B(a), C)
and `bug-028`.** The table's MCP cells named a Tool and a Resource under a `project` module that no
registrar can derive, since no such module exists or is planned, and the function cells used the same
`project` prefix. It had no row for `wingfoil mcp`, which has shipped since `task-030`. A(a): `init` and
`mcp` are bootstrap commands, exempt from REQ-SYS-05 (whose Fit Criterion now says so), and their MCP
cells say they are not MCP-exposed. Their function cells name the CLI entry functions `runInit` and
`runMcp`, because neither is a core function. B(a): `audit` is planned as a flat, self-named operation
on module `audit`, so its Resource is the derived `wingfoil://audit`. C: §3's preamble and §5 admit a
self-named flat operation, named exactly after its module, so the `paths` rows (in §3's DNA table and
§6's baseline table) now carry the registered name `paths` instead of a `{module}{Verb}` name the
registry never had. The `paths` row's MCP cell keeps its URI, which is `dl-040`'s (`in-discussion`, v0.4), and is now marked like the agent rows: the registrar derives `wingfoil://paths`, not the cell's URI. §5's parity bullet states the exemption.
`test/docs/command-surface-specs.test.ts` fails when a flat command the program registers has no §3
row. No other row or section changed. Tech-specs carry no `version:` field (`dl-047`); edited in place
without a supersede or a state change.

**Revision (2026-10-05, `task-174-settle-mcp-prompts-contract-server-preflight-answer-tools`) — §3's
MCP exposure note no longer says the production server answers `tools/list` with a protocol error.**
`task-174` (`bug-151`) gives the server an empty Tools channel: `initialize` advertises `tools: {}` and
`tools/list` answers `{tools: []}` (`spec-014` §3). No Tool is served, so the note's point stands; only
its description of the refusal changed. Tech-specs carry no `version:` field (`dl-047`); edited in
place without a supersede or a state change.

**Revision (2026-10-05, `task-180-add-memory-park-declared-returns-edge-optional-per`) — `memory park`
and the WIP-limit check, per `dl-110` (`ready`; P1 (a), P3 (a)).** §3's Memory table gains
`memoryPark`, and `memoryAmend`, which `task-127` registered without a row. §7 names `park` among the
verbs it orders: its `--reason` is required, it has no authority step, and step 3 also refuses a
transition into a state at its WIP limit. Tech-specs carry no `version:` field (`dl-047`); edited in
place without a supersede or a state change, pending the approver's `memory amend` at `task-180`'s
review.
