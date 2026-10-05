---
id: "spec-014-mcp-server-entry-point"
type: tech-spec
title: "MCP server entry point — the `wingfoil mcp` command & stdio transport"
status: approved
scope: "src/mcp/server.ts, src/cli (the `wingfoil mcp` command)"
supersedes: ""
tmpl_version: 260703
---

## Context

`spec-004-mcp-surface-contract` fixes **what** the MCP server exposes (the Resources / Prompts / Tools
channels, their URI scheme, and the read-only refusal contract) but deliberately says nothing about
**how a running server is started**: it opens with "Nothing under `src/mcp` exists yet" and describes
the channel surface an already-connected client sees. `dna.yaml`'s stack entry ("MCP over stdio +
Anthropic SDK") establishes the transport is stdio, but no spec names the concrete process entry point
or the CLI verb that launches it.

`spec-008-cli-grammar` §1 enumerates the CLI nouns (`memory, dna, directive, workflow, agent`) and flat
commands (`init, paths, audit`); `docs/01_vision/X_cli-cmds.md` lists commands per pillar. Neither
documents a command that starts the agent-facing MCP server. task-030-implement-mcp-resources (P5.2.1),
which productionizes task-011's test-only Resources channel into a real `McpServer` connected over a
`StdioServerTransport`, therefore hits a genuine spec gap at its design gate: it must introduce both a
production entry-point module and a CLI verb, and there is no approved contract for either. Without a
single shared definition, a later task adding Prompts (P5.2.2) or Tools (P5.2.3) could reinvent the
entry point (a different command name, a different transport wiring, a different channel-registration
set), producing a divergent, non-deterministic server bootstrap. This spec closes that gap.

## Specification

### 1. The `wingfoil mcp` command

A new **flat** command (`spec-008-cli-grammar` §1's `wingfoil <noun> [args] [flags]` form) starts the
MCP server:

```
wingfoil mcp
```

- Takes **no positional arguments and no command-specific flags**; it inherits only the global flags
  (`spec-008` §2). It is a long-running foreground process: it connects the server to stdio and serves
  until the transport closes (the client disconnects / stdin reaches EOF), rather than performing one
  action and exiting.
- Like `wingfoil init` (task-029, `spec-008` §4), `mcp` is a **special command wired directly onto the
  Commander program** (`src/cli/program.ts`), **not** a `CORE_MODULES` noun-verb operation: it does not
  wrap a single `src/core` `CoreOperation`, it owns a process lifecycle. This keeps it off the
  operation-derived Tool/Resource registrar (`registerCoreModules`), which is correct — starting the
  server is not itself an MCP-exposed operation.
- **Pre-flight.** Before connecting, `wingfoil mcp`:
  1. resolves the project root (`resolveProjectRoot`, `spec-011-storage-layout`);
  2. refuses a root with no `.wingfoil/` directory (`spec-011`'s `absent` state) with the shared
     not-initialized reason `WingFoil not initialized (no .wingfoil/ directory at the project root):
     run 'wingfoil init' first`, which names no path (`requireInitializedProject`, `bug-035`);
  3. reads the DNA role set — `dna.yaml` `team.roles[].name`, in declaration order — that the Prompts
     channel serves for the server's life (`spec-004` §3.1, `dl-049` (b)); a `dna.yaml` that cannot be
     loaded refuses the start with the loader's reason and details.

  On any failure it emits the standard `error: <reason>` line (`spec-008` §6) and exits `1` (a
  user/logic error per `spec-008` §5's exit-code table), by symmetry with `wingfoil init`'s own
  pre-flight root handling. It never starts a partially-wired server, and stdout carries nothing but
  the protocol.

### 2. The stdio entry point (`src/mcp/server.ts`)

`src/mcp` gains one production module that constructs and starts the server, split into a testable
constructor and a thin un-testable transport seam (the same seam pattern `src/cli/program.ts`'s
`commander` wiring and `init-command.ts`'s `createReadlinePrompt` already use):

```ts
// Constructs a real McpServer and registers its channel set (§3) on it. Pure and synchronous —
// no transport, no stdio, no process side effects — so it is exercised end-to-end in tests over
// the SDK's in-memory transport + a real Client, exactly like task-011's registrar tests.
createMcpServer(options: {
  resolveRoot: () => string;
  roles: readonly string[];   // the DNA role set the pre-flight read (§1)
  name?: string;
  version?: string;
}): McpServer

// Constructs the server via createMcpServer, then connects it over a real StdioServerTransport.
// The only un-unit-tested line is the `.connect(new StdioServerTransport())` seam.
startMcpServer(options): Promise<McpServer>
```

- The server identifies itself as `{ name: "wingfoil", version: <package.json version> }` — the bare
  semver read deterministically from the packaged `package.json` (`spec-008`/REQ-SYS-07), never a
  wall-clock or inferred value. It is the `<semver>` half of what `wingfoil --version` prints: since
  `task-192` (`dl-111`) the CLI prints the build stamp `<semver> (<sha>)`, and the server's identity
  does not carry the `(<sha>)`.
- `resolveRoot` is invoked **per request** by the registered Resource and Prompt handlers (task-011);
  the server module itself performs no I/O at construction time beyond wiring handlers. The one
  start-time read the server depends on, the DNA role set, happens before construction, in the
  pre-flight of `wingfoil mcp` (§1, `dl-049` (b)), and arrives as `roles`.

### 3. Channel scope — read-only Resources and Prompts, an empty Tools channel

`createMcpServer` registers exactly these channels (`spec-004` §1), and nothing that writes:

```ts
registerReadOnlyResources(server, { resolveRoot });          // spec-004 §2 — Memory, DNA, Workflow Resources + write refusal (P5.2.1, v0.1)
registerRolePrompts(server, { resolveRoot, roles });         // spec-004 §3 — one {role}-session Prompt per role (P5.2.2, v0.2)
// the Tools channel, empty until P5.2.3 (v0.4):
//   initialize advertises `tools: {}`; tools/list → { tools: [] };
//   tools/call → an isError result "Tool <name> not found" (a Tool refusal, spec-004 §4.3 item 4)
```

Neither the Prompts nor the Tools capability declares `listChanged`: the role set is fixed at start
(§1), and the Tools list is empty. A client probing `tools/list` gets an empty list rather than a
JSON-RPC `-32601` (`bug-151`).

It does **not** call `registerCoreModules(server, CORE_MODULES, …)`. That registrar would advertise a
mutating **Tool** for every `mutates: true` `CoreOperation` (as of task-025, `dnaSet` → the `dna.set`
Tool) — and Tools are P5.2.3 (v0.4) scope, explicitly out of scope for the P5.2.1 read-only skeleton.
Registering it would put a mutating write path onto a surface this milestone requires to be strictly
read-only. The operation-derived read-only Resources it would also add (`wingfoil://dna/show`,
`wingfoil://paths`) are already subsumed by `spec-004` §2.1's richer, hand-registered scheme
(`wingfoil://dna`, `wingfoil://dna/{section}`), so nothing read-only is lost by the omission.

When Tools ship (P5.2.3, v0.4), the production server adds `registerCoreModules` alongside
`registerReadOnlyResources`, in place of the empty Tools channel. The entry
point (`wingfoil mcp` + `startMcpServer`) is unchanged by those additions — only the channel-set inside
`createMcpServer` grows. This spec governs the entry point; `spec-004` governs each channel's contract.

## Consequences

- task-030-implement-mcp-resources implements §1–§3: `src/mcp/server.ts`
  (`createMcpServer`/`startMcpServer`), the `wingfoil mcp` command in `src/cli/program.ts`, and the
  thin `runMcp` handler seam (`src/cli/mcp-command.ts`, mirroring `init-command.ts`'s injectable
  `runInit`) so the resolve-root / error / exit-1 path is unit-testable without starting a real stdio
  server.
- `spec-008-cli-grammar` §1's command inventory is extended by the flat `mcp` command; a future
  revision of `spec-008` should list `mcp` among the flat commands for completeness (it is added here
  rather than by editing `spec-008` because the command's *behaviour* — a long-running stdio server — is
  materially different from the one-shot flat commands `spec-008` §1 enumerates, and warrants its own
  contract).
- Later MCP surface tasks (P5.2.2 Prompts, P5.2.3 Tools) extend the channel set registered inside
  `createMcpServer` (§3) without changing the `wingfoil mcp` entry point or the stdio transport wiring —
  those remain stable per this spec.
- If the transport ever changes (e.g. an HTTP/SSE transport is added alongside stdio), or the command
  name/grammar changes, this spec must be revised first.

## Process Notes

Discovered **reactively** at task-030's dev-loop/design gate, not proactively by
release-planning/identify-specs: the v0.1 release-planning scoped P5.2.1 to task-011's channel
(REQ-INT-01) plus this productionization task, but the entry-point/transport contract was left implicit
under `spec-004`'s "how a client sees the surface" framing and `dna.yaml`'s one-line "MCP over stdio"
stack note. Feeding back into planning: when a feature productionizes a previously test-only surface,
identify-specs should check that the *process entry point* (not just the wire contract) has an approved
spec. Authored by the task-030 DEV agent under the approver's standing authorization to author/adjust
specs at the design gate; submitted `draft → pending` for the orchestrator to bless `pending → approved`
(the DEV agent does not self-approve).

**Revision (2026-10-05, `task-174-settle-mcp-prompts-contract-server-preflight-answer-tools`) — the
pre-flight, the channel scope and the version sentence, per `dl-049` (b) and its editorial item,
`bug-035` and `bug-151`.** §1's pre-flight checked only for a git root, so a root that never ran `init`
started a server whose every read leaked a raw `ENOENT` with an absolute path; it now refuses that root
with the shared not-initialized reason and reads the DNA role set the Prompts channel serves
(`spec-004` §3.1 "derived from DNA at server start"). §2 drops "the v0.1 channel set", gains the
`roles` option and names that start-time read as the one the server depends on, made before
construction so `createMcpServer` still reads nothing. Its version sentence said "same source as
`wingfoil --version`"; since `task-192` that command prints `<semver> (<sha>)`, and the server shares
only the semver. §3 was titled "v0.1 channel scope — read-only Resources only" although Prompts ship
since v0.2; it now lists the Resources, the Prompts and the empty Tools channel. No channel contract
of `spec-004` changed here. Edited in place without a supersede or a state change, per `dl-047` (no
`version:` field).
