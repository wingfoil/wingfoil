---
id: "task-174-settle-mcp-prompts-contract-server-preflight-answer-tools"
type: task
title: "Settle the MCP Prompts contract and the server's pre-flight, and answer `tools/list` with an empty list"
status: in-progress
release: "v0.3"
kind: "fix"
priority: "high"
tags: ["v0.3", "core", "mcp", "first-use"]
ref: "dl-039"
bug: ["bug-035", "bug-151", "bug-184"]
depends_on: ["task-130-show-coreerror-details-surface-give-refusal-shape-under", "task-143-make-directive-loader-robust-dangling-symlinks-project"]
tmpl_version: 260703
---

## Description

`spec-004` §3.2's example uses `role: "system"` (impossible on MCP), "resolution order" overreaches, and embedded directive bodies invert heading levels (`src/mcp/prompt.ts:120`; `dl-039`); §3 lacks the undefined-role refusal the code already implements (`dl-048`); the role set is read per request while the spec says server start (`dl-049` (b): read in `runMcp`'s pre-flight). `wingfoil mcp` starts in a git root with no `.wingfoil/` and every read leaks a raw ENOENT with an absolute path (`bug-035`, `src/cli/mcp-command.ts:43-50`). `tools/list` answers -32601 (`bug-151`): the `registerCapabilities({tools:{}})` at `src/mcp/registrar.ts:74` never runs in production, and would not install a handler if it did.

## Acceptance Criteria

- (red-first) `wingfoil mcp` in a git root without `.wingfoil/` exits 1 before serving, with the "not initialized" message and no absolute path; the role set is read there and passed to `createMcpServer` (`dl-049` (b)); `listChanged` stays off.
- (red-first) `tools/list` returns `{tools: []}` and `initialize` advertises `tools`; the tests at `test/mcp/read-only-agent-channel.test.ts:185` and `test/mcp/role-prompts.test.ts:262` that pin -32601 are rewritten; the registrar comment is corrected.
- (red-first) a directive body's headings are demoted two levels inside the Prompt.
- (characterization) the undefined-role refusal (-32602, both messages) is pinned and written into `spec-004` §3.4; §3.2's example uses `role: "user"` and "resolution set" (id-ascending, spec-012 §5); `spec-014` §2/§3 drop "v0.1 channel"; one Revision note.

## Implementation Notes

- **Size:** M · **wave:** 2 · **kind:** fix (`dl-133` Q1 (b)).
- **Implements:** dl-039 (role 1, ordering 1, headings 1); dl-048 option 1 (§3.4 refusals); dl-049 (b) + editorial spec-014 §2/§3; spec-004 §3.
- **Features:** P5.2.2, P5.2.1.
- **Notes:** Proposal key: C32. B's `spec-004` §3.1–§3.2 Prompt-argument amendment (`element`, `state`; R18) edits the same section — whichever lands second rebases.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.
- **Handover from wave 1 B3 (2026-10-02, `task-143`).** Reuse `requireInitializedProject` and `WINGFOIL_NOT_INITIALIZED` (exported from `src/core`, `src/core/init.ts`) for the MCP server's pre-flight; do not word a second refusal. Known limit: when `.wingfoil` is a file, the message's "run 'wingfoil init' first" loops, because `init` refuses that case. `bug-198` covers the CLI read commands that should adopt the same refusal.

## Execution Notes

Branch `task/task-174-settle-mcp-prompts-contract-server-preflight-answer-tools`, worktree
`../.wf2-wt/task-174`, cut from `main` at `0b297169`. Start `915f306e`; bug syncs `[planned →
in-progress]`: `bug-035` `9decf442`, `bug-151` `c00ab9a9`, `bug-184` `3ed2b76d`.

### design (architect)

**`depends_on` (dl-015).** Both are `done` (`grep -m1 "^status" docs/04_memory/v0.3/task-1{30,43}-*.md`).
`task-130` built the refusal details (`errorDetails`, `src/core/error-details.ts`) and recorded that
the production server never applies them to its Resources: that is `bug-184`, which the approver
moved into this task on 2026-10-01 (`6ae0e6e4`). `task-143` handed over `requireInitializedProject` /
`WINGFOIL_NOT_INITIALIZED` (`src/core/init.ts`) for the pre-flight, with the known limit that the
advice loops when `.wingfoil` is a file. Its review also noted that an empty `.wingfoil/` passes the
guard; this task inherits both limits rather than re-wording the refusal.

**Rulings.** `dl-039`, `dl-048` and `dl-049` are `ready` (`grep -m1 "^status"` on each). `dl-039`'s
approval (`ffd93d82`) records the options: role 1, ordering 1, headings 1 (demote body headings two
levels). `dl-048` option 1 (a §3.4 "Refusals" subsection) and `dl-049` (b) (role set read in
`runMcp`'s pre-flight, passed to `createMcpServer`; `listChanged` stays off) are the task's
Implementation Notes.

**Specs.** `spec-004`, `spec-012` and `spec-014` are `approved` (`grep -m1 "^status"`). Both specs
this task edits are approved Memory, so their edits are **pending amendments, left uncommitted**
(brief, Wave 1 additions). The SDK constraint behind `dl-039` role 1 holds on the installed 1.32.0:
`grep -n "RoleSchema = " node_modules/@modelcontextprotocol/sdk/dist/cjs/types.js` →
`z.enum(['user', 'assistant'])`.

**Design.**
- *Pre-flight (AC 1, `bug-035`, `dl-049` (b)).* New core read `loadDnaRoleSet(root)` (`src/core`):
  `requireInitializedProject(root)`, then the DNA's `team.roles[].name` in declaration order, through
  the same `loadOrError` mapping every read-only query uses, as a `CoreResult`. `runMcp` calls it right
  after resolving the root; a refusal is written with `emitError(message, {format, details})`, exit 1,
  and the server is never built. The set is passed to `createMcpServer({roles})` and on to
  `registerRolePrompts`, so `prompts/list` and `prompts/get`'s role check read nothing: the set is
  fixed for the server's life (spec-004 §3.1 "derived from DNA at server start"). Directive bodies and
  bindings stay per request (§3.2). `prompts: {}` keeps `listChanged` off. `roles` is a **required**
  option, so no caller can fall back to a per-request read.
- *Empty Tools channel (AC 2, `bug-151`).* `createMcpServer` declares `tools: {}` and owns
  `tools/list` → `{tools: []}` on the low-level server. A `tools/call` names a tool that does not exist,
  so it answers like a Tool refusal (spec-004 §4.3 item 4): an `isError: true` result with text `Tool
  <name> not found`, the SDK's own wording for an unknown tool. The registrar comment at
  `src/mcp/registrar.ts` is corrected: `registerCapabilities` declares a capability and installs no
  handler; the SDK installs `tools/list` on the first `registerTool`.
- *Headings (AC 3, `dl-039` headings 1).* `demoteHeadings(body)` in `src/mcp/prompt.ts`: each ATX
  heading line (`#`…`######`, up to three leading spaces) gains two levels, capped at H6. Lines inside
  a fenced code block (``` or ~~~) are code and stay as written. Setext headings are not rewritten;
  no directive body in this repository uses one (`grep -n "^=\+\s*$\|^-\{3,\}\s*$"
  .wingfoil/directives/custom/*.md` → only frontmatter delimiters).
- *Resource refusal details (`bug-184`).* The thrown-error → `CoreError` mapping inside `loadOrError`
  is factored out as `coreErrorOf(error)` (`src/core`). `src/mcp/read-only.ts` gains
  `withRefusalDetails(read)`: a loader refusal that has details is re-thrown carrying
  `data: {details}` (spec-004 §4.3 item 4, already approved text), anything else is re-thrown
  unchanged. Every bespoke Resource handler and `prompts/get` run their reads through it, and the
  registrar's own throw uses the same error builder.
- *Specs (AC 4, pending amendments).* spec-004: §3.2 example `role: "user"`; "resolution order" →
  "resolution set", id-ascending per spec-012 §5; the heading demotion stated; new §3.4 "Refusals"
  (undefined role and non-`{role}-session` name, both `-32602` with their exact messages; the BDD
  step realised as `prompts/get`; "defined in DNA" = `team.roles[].name` read at server start; a
  configuration-read failure carries `error.data.details`); one Revision note. spec-014: §1 pre-flight
  names the not-initialized refusal and the role-set read; §2 drops "v0.1 channel set", allows the one
  start-time role-set read (in `runMcp`, not in `createMcpServer`), and corrects the version sentence
  (since `task-192` only the semver half of `wingfoil --version` is shared); §3 retitled, lists the
  three channels including the empty Tools channel; one Revision note.

**AC classification (T1).**

| AC | Class | Why |
|---|---|---|
| 1 — no `.wingfoil/` → exit 1, not-initialized message, no absolute path; role set read in the pre-flight and passed to `createMcpServer`; `listChanged` off | **red-first** | today `runMcp` starts the server in a bare git root (`test/cli/mcp-command.test.ts` pins that) and the role set is read per request |
| 2 — `tools/list` → `{tools: []}`, `initialize` advertises `tools`; -32601 pins rewritten; registrar comment | **red-first** | today `tools/list` answers -32601 and `tools` is not advertised |
| 3 — directive body headings demoted two levels | **red-first** | today the body is embedded verbatim (`composeRolePromptText`) |
| 4 — undefined-role refusal pinned and written into §3.4; §3.2 / spec-014 editorial; one Revision note | **characterization** | the refusal already ships and is pinned (`test/mcp/mcp-prompts.feature.test.ts`); the rest is spec text |
| `bug-184` (absorbed, no AC line) — production Resource refusals carry `error.data.details` | **red-first** | today a bespoke Resource re-throws the loader error, which has no `data` |


### red

`cac01f05`: tests in `test/cli/mcp-command.test.ts` (rewritten), `test/core/dna-role-set.test.ts`
(new), `test/mcp/server.test.ts`, `test/mcp/role-prompts.test.ts`, `test/mcp/mcp-prompts.feature.test.ts`,
`test/mcp/read-only-agent-channel.test.ts` and `test/cli/program.integration.test.ts` (the compiled
CLI). `npx jest` on those seven files → 7 suites failed, **21 failed**, 104 passed. Every failure is
behavioural, not a compile error: `loadDnaRoleSet` / `coreErrorOf` "is not a function"; `runMcp`
starting the server in a bare git root (no exit, no stderr); `caps.tools` `undefined` and `tools/list`
-32601; the role added to `dna.yaml` still listed; the body H1 embedded verbatim; `error.data`
`undefined` on the workflows read; `wingfoil mcp` on the compiled CLI not exiting 1.

Rewritten pins (AC 2): `read-only-agent-channel.test.ts` (production surface: `tools: {}` and
`tools/list` → `{tools: []}`) and `role-prompts.test.ts` (a Prompts-only server declares no `tools`
capability — it no longer leans on -32601). `mcp-command.test.ts`'s "a git root without
`.wingfoil/dna.yaml` builds the real server" and `mcp-prompts.feature.test.ts`'s "a role added to
dna.yaml after the server started is listed and served" / "each Prompts request surfaces the missing
DNA" encoded task-058's per-request reading; `dl-049` (b) flips them, and they are replaced by the
pre-flight refusal and the fixed-set tests.

### green

`50a088e4`. As designed: `coreErrorOf` + `loadDnaRoleSet` (`src/core/index.ts`, `loadOrError` now
delegates to `coreErrorOf`); `runMcp`'s pre-flight (`src/cli/mcp-command.ts`); `roles` required on
`McpServerOptions` / `RegisterRolePromptsOptions`; `registerEmptyToolsChannel` (`src/mcp/server.ts`);
`demoteHeadings` (`src/mcp/prompt.ts`); `readRefusalError` + `withRefusalDetails`
(`src/mcp/read-only.ts`) around the six bespoke Resource handlers and `prompts/get`; the registrar's
throw and its corrected comment. One test was wrong, not the code: the heading test asserted the only
`# ` line left was `# Role:`, forgetting the `# a shell comment` the same test keeps inside a fence;
the assertion now lists both (fixed in `50a088e4`, `npx jest test/mcp/role-prompts.test.ts` → 12/12).

A real stdio run of the built CLI (`npm run build`, a scratch repo after `wingfoil init --template
Scrum`, `initialize` + `tools/list` + `tools/call` + `prompts/list` piped to `node dist/cli.js mcp`):
capabilities `{"resources":{"listChanged":true},"prompts":{},"tools":{}}`, `tools/list` →
`{"tools":[]}`, `tools/call x` → `{"content":[{"type":"text","text":"Tool x not found"}],"isError":true}`,
`prompts/list` → the Scrum roles.

### refactor

`11270e50`: user docs — `docs/cli-reference.md` (`wingfoil mcp`) and `docs/user-guide.md` §9.1 state the
pre-flight refusal, the role set fixed at start and the empty `tools/list`, marked "Unreleased (v0.3)"
as the files do; `scripts/check-mcp-registration.cjs`'s `EXPECTED_CHANNELS` note says the `tools`
channel appears from the first build carrying this task (the constant itself is for the pinned 0.2.x
build and does not change). No code refactor was needed after green.

Gates, with the two pending amendments in the working tree:

| command | result |
|---|---|
| `npm test` | exit 0; 234 suites / 4307 tests |
| `npm run test:coverage` | exit 0; 99 / 96.19 / 96.14 / 99.63 (stmts / branches / funcs / lines); `main` `a5ef0b75` per the plan: 98.99 / 96.16 / 96.08 / 99.61 — no regression |
| `npm run lint` | exit 0 |
| `npm run docs:api` | exit 0 |
| `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| `npx tsc -p tsconfig.build.json --noEmit` | exit 0 |
| `node scripts/check-governance.cjs --base 0b297169` | exit 0 (4 `wf()` commits, 0 findings) |

`src/mcp/server.ts` lines 108-111 are `startMcpServer`'s stdio seam, untested by design (module doc).
BDD: `P5.2.2-mcp-prompts.feature`'s three scenarios stay green in `test/mcp/mcp-prompts.feature.test.ts`;
the feature needs no new scenario (the undefined-role string is unchanged).

### review (self, reviewer)

- **AC 1, met.** `test/cli/mcp-command.test.ts`: bare git root → exit 1, stderr exactly `error:
  WingFoil not initialized (no .wingfoil/ directory at the project root): run 'wingfoil init' first\n`
  (console) / `{"error": …}` (json), not containing the root, `start` never called; an invalid
  `dna.yaml` → exit 1, no start; `start` receives `roles: ['reviewer', 'developer']` (declaration
  order). The compiled CLI: `test/cli/program.integration.test.ts` › "`mcp` exits 1 with the
  not-initialized message and writes nothing on stdout (bug-035)". `listChanged` off:
  `prompts` capability `toEqual({})` in `role-prompts.test.ts` and `mcp-prompts.feature.test.ts`.
- **AC 2, met.** `server.test.ts` › scope: `caps.tools` `{}`, `listTools()` → `{tools: []}`; the two
  -32601 pins rewritten (red section). `registerCoreModules`' comment now says what the SDK does.
- **AC 3, met.** `role-prompts.test.ts` › "nests each body heading…": H1→H3, H2→H4, 3-space-indented
  H3→H5, H4/H5/H6→H6, `#no-space` and fenced lines (``` and ~~~~) untouched.
- **AC 4, met (characterization).** The refusals were already pinned exactly, code and message:
  `mcp-prompts.feature.test.ts` › "Error - requesting a prompt for an undefined role" (`MCP error -32602:
  no prompt for undefined role 'wizard'`) and › "a name outside the {role}-session convention…" (`MCP
  error -32602: Prompt wizard not found`). Written into spec-004 §3.4; §3.2 / spec-014 per the design;
  one Revision note in each spec (pending amendments below).
- **bug-184, met.** `server.test.ts` › "a failed read carries the details in JSON-RPC
  error.data.details": the second missing-include diagnostic is `error.data.details[0].detail`; a
  refusal with no details still carries no `data` (characterization).
- Same-class sweep in touched files: every bespoke Resource handler and `prompts/get` go through
  `withRefusalDetails` (`grep -n withRefusalDetails src/mcp/*.ts` → 6 handlers + `prompt.ts`); no
  remaining reference to a per-request role read (`grep -n "loadRoleNames\|at request time"
  src/mcp/prompt.ts` → nothing).

**Decisions for the approver to confirm.**
1. `tools/call` on the empty Tools channel answers an `isError: true` result `Tool <name> not found`
   (spec-004 §4.3's Tool-refusal shape, the SDK's own wording), not a JSON-RPC -32602 error. The AC
   names only `tools/list`; leaving `tools/call` at -32601 would advertise a capability with half a
   handler.
2. `roles` is a **required** option of `createMcpServer` / `registerRolePrompts`: no caller can fall
   back to reading the role set per request.
3. Only ATX headings are demoted; setext headings (`Title` + `===`) are not. No directive body in this
   repository or in `init`'s scaffold uses one (design section).
4. A `.wingfoil/` whose `dna.yaml` is missing or invalid also refuses the start (`dl-049` (b)), with the
   loader's reason — which, like `dna show`'s, names the absolute path (see findings).

**Candidate findings (not filed).**
- The DNA loader labels its issues and its `ENOENT` with the **absolute** path
  (`loadDnaYaml` → `join(root, '.wingfoil', 'dna.yaml')`). In a `.wingfoil/` with no or an invalid
  `dna.yaml`, `wingfoil mcp` (and `dna show`) print `error: ENOENT: … open '<abs>/.wingfoil/dna.yaml'` or
  `E_VALIDATION modules (<abs>/.wingfoil/dna.yaml): …` — reproduced on the built CLI in a scratch repo.
  `bug-035`'s Expected Behavior asks for no absolute path on any uninitialised-project request; this
  task covers the `absent` state only (its AC). Same class as `bug-198`.
- The same incomplete `.wingfoil/` makes each Resource (`wingfoil://memory/*` without `memory.yaml`)
  answer `-32603` with a raw `ENOENT` and absolute path.
- The CHANGELOG has no entry for this task's user-visible changes; that is `user-docs`' to write.

**Pending amendments (approver).** Left uncommitted in the worktree; the gates above ran with them.
- `spec-004-mcp-surface-contract`: `--reason "§3 per dl-039 (role 1, ordering 1, headings 1), dl-048
  option 1 and dl-049 (b): the §3.2 example uses role user and lists its blocks id-ascending as a
  resolution set, embedded directive headings are demoted two levels, the new §3.4 states the two
  prompts/get refusals and the details of a failed read, and §3.1 says the role set is read once in
  the wingfoil mcp pre-flight. Applied by task-174."`
- `spec-014-mcp-server-entry-point`: `--reason "§1-§3 per dl-049 (b) and its editorial item, bug-035 and
  bug-151: the pre-flight refuses a root with no .wingfoil and reads the DNA role set, §2 drops the v0.1
  channel set and shares only the semver of wingfoil --version since task-192, and §3 lists the
  Resources, the Prompts and the empty Tools channel. Applied by task-174."`

**Merge order.** Within B2 no other task touches `src/mcp/`, `src/cli/mcp-command.ts` or spec-004 /
spec-014 (`w2-b2-notes.md`). This task adds a function next to `loadOrError` in `src/core/index.ts`;
`task-172` and `task-251` edit `src/core/init.ts`, not `index.ts`'s read helpers. The task's
Implementation Notes flag `B`'s spec-004 §3.1–§3.2 Prompt-argument amendment (R18) as touching the
same section: whichever lands second rebases.
