---
id: "task-218-agent-execute-element-resolves-role-agent-adapter-assembles"
type: task
title: "`agent execute --element` resolves role, agent and adapter, assembles and checks the context, and refuses every bad case before anything is spawned"
status: approved
release: "v0.3"
kind: "feature"
priority: "high"
tags: ["v0.3", "agent", "cli", "refusals"]
ref: "spec-016"
bug: ["bug-202", "bug-290"]
depends_on: ["task-130-show-coreerror-details-surface-give-refusal-shape-under", "task-169-make-directive-assign-refuse-whole-file-rewrite-unless", "task-176-complete-spec-012-context-builder-dna-selection-relevance", "task-177-adapter-manifests-load-validate-wingfoil-agents-builtin-custom", "task-195-role-session-mcp-prompt-accepts-element-state-returns", "task-200-fake-agent-custom-adapter-let-agent-execute-path", "task-206-agent-execute-records-run-json-lines-line-under"]
tmpl_version: 260703
---

## Description

This task builds the pre-launch half of `agent execute`, for the stepless (`adhoc`) form: - element from `--element`; - role from `--role`, else the `developer` default with a `warning:` line (R18); - agent from `--agent`, else the first agent with an adapter whose `executes_as` has the role; - the adapter, then pipeline steps 1–12: PATH lookup, git identity, run log declared and unmodified, the context assembled and validated at `HEAD`, its warnings printed on stderr (dl-050 option 4), the run id, temporary bootstrap and MCP config files outside the repository, the MCP pre-flight fetching `{role}-session` with `element`/`state`, and the terminal check last. It stops just before the spawn. task-228 adds the launch.

## Acceptance Criteria

- (red-first) Each §3.7 row up to `NO_TERMINAL` is reached with the fake adapter and no terminal, exit `1`, nothing written to the repository (`git status --porcelain` unchanged). Rows: element absent, `--role` not in DNA (P5.4.2 sc. 3 text), `APPROVER_ROLE`, `NO_AGENT`, unknown agent / agent without the role, `NO_ADAPTER`, manifest invalid, `AGENT_NOT_FOUND`, git identity missing, `NO_RUN_LOG`, run log modified, `INVALID_CONTEXT` (P5.4.4 sc. 3), `MCP_UNREACHABLE` (`context pre-load failed: MCP server unreachable`, P5.4.3 sc. 3 verbatim), and `NO_TERMINAL` with the `terminal: required` fixture.
- (red-first) No flag at all → exit `2` `error: missing required argument: --next or --element`. `--resume`/`--ref` → exit 2 as unknown options (v0.4, §3.1).
- (red-first) The role defaults to `developer` with a `warning:` line when neither a step nor `--role` gives one. P5.3.1 sc. 2's fixture holds a matching full id.
- (red-first) dl-050 option 4: a role with a dangling binding prints `spec-012` §5.1's warnings on stderr, in order, before the MCP pre-flight, and nothing on stdout.
- (red-first) The bootstrap bytes equal §2.4's template for `(role, element, run id, state_ref)`. Two runs from the same `HEAD` render identical bootstrap bytes. The handoff line depends on the type template's `## Execution Notes` heading.
- (red-first) Temporary files are created under the OS temp dir, never inside the repository, and are removed on every exit path, refusals included.
- (characterization) The MCP pre-flight spawns the running build (`node <dist/cli.js> mcp`, §2.5). A project's `.mcp.json` is neither read nor modified.
- (characterization) BDD `P5.4.3-context-preloading.feature` sc. 1–2 are amended (`doc-versioning` note) to §3.1's reading: WingFoil assembles, validates and proves the context fetchable before the spawn. The sc. 3 message is kept.

## Implementation Notes

- **Size:** M · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** spec-016 §3.1 (without step flags), §3.2 steps 2–6, §3.3 steps 1–12, §3.7 rows up to NO_TERMINAL; dl-050 option 4; dl-033 (b) (role checks via `src/dna/roles.ts`, approver refusal via `src/core/approval-authority.ts`); REQ-SEC-03.
- **Features:** P5.3.1, P5.4.2, P5.4.3, P5.4.4.
- **Notes:** Proposal key: B09. `src/agent/execute.ts`, `src/core/index.ts` (operation `agentExecute`, `mutates: true`, CLI only; no MCP exposure in v0.3, spec-016 §8). The stderr warnings (dl-050 option 4) go through task-169's success-warning renderer, so directive-assign warnings and context warnings share one convention.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.
- **Handover from wave 1 B3 (2026-10-02, `task-169`).** Reuse the success-warning channel: `coreOk(value, commit?, warnings?)` in `src/core/types.ts` and the single CLI renderer `src/cli/warning.ts` (`emitWarning`, `emitWarnings`; console `warning: …`, json one object per line, yaml documents closed by `...` so a following error is its own document). `spec-008` §6 records where this departs from `spec-005` §3.2 (stderr may be non-empty on exit 0) until this task amends `spec-005`.
- **Handover from wave 2 B1 (2026-10-05, `task-171` and `task-176`).** `assembleExecutionContext`
  (`src/core/context.ts`) reads Memory tolerantly: an unreadable document is left out and reported as
  `W_MEMORY_UNREADABLE` in the result's `warnings` (`CoreResult`, third argument of `coreOk`), and a malformed subject
  element comes back as `NOT_FOUND` with `details.unreadable`. Neither is in the payload. Forward both to the
  surface this task builds (stderr / `--format json` warnings, or the MCP response), so they are never dropped.
- **Handover from wave 2 B4a (2026-10-06, `task-255`).** The context payload's bytes are pinned as format 1
  (`spec-012` §7, `dl-150` (B)): consume them only as `task-255` left them, through `assembleExecutionContext`, and
  never re-serialize the context yourself. `CONTEXT_PAYLOAD_FORMAT` and `WrittenTimestamp` are re-exported from
  `src/core`: a YAML date in the carried frontmatter is a `WrittenTimestamp` holding the text as written, not a `Date`,
  and its `toJSON()` returns that text, so a `--format json` rendering keeps the document's own spelling.
- **Handover from the W2 B4a triage (2026-10-06).** `bug-265` (v0.4): the context payload's body markers are not
  unique, so do not index its bodies by marker key alone. `dl-158` (in discussion, release v0.3) decides which
  `team.agents` entry signs and what an entry without an email writes under git-conventions §7: apply its ruling to
  the agents this task launches.
- **Handover from the approver's ruling on `dl-158` (2026-10-06, Rule 1 (a)).** The `team.agents` entry that signs
  an agent's commits under `git-conventions` §7 is the one `agent execute` launches, resolved by its adapter: state
  that selection in `spec-016` where this task resolves the entry, and pass that entry's `name <email>` to the
  launched agent. A hand session uses the entry whose `name` is the agent's own and, with no such entry, the first
  entry, saying so in the commit body. The directive text and the email rule (Rule 2 (ii)) are `task-260`'s.
- **Handover from wave 3 B1 (2026-10-07, `task-195`, `task-196`, `task-206`, `task-210`).** Parse `--element` with `parseElementRef` / `malformedElementRefMessage` from `src/core` (`spec-008` §7's grammar, `task-195`): the {role}-session Prompt already uses it, so the two surfaces cannot drift. Call `runLogPreflight(root, paths.runs, elementId)` (`src/agent`, `task-206`) at `spec-016` step 6, before anything is spawned. `agent execute` is `mutates: true`: add it to `REVIEWED_AGENT_WRITERS` in `test/core/builtin-adapter-writers.test.ts` (`task-196`, REQ-SEC-07; the test fails otherwise) and a row to the dry-run table in `test/cli/dry-run.integration.test.ts` (`task-210`; its completeness test fails otherwise). Every write goes through `writeAndCommit` (`src/storage`); a raw writer throws during a dry run.
- **Handover from wave 3 B2 (2026-10-07, `task-260`, `task-200`).** Since `task-260`, a `team.agents` entry that declares an `adapter` must declare an `email` (dl-158 Rule 2 (ii)): `spec-016` §2.1 still calls `adapter` a plain optional field — correct it with your `spec-016` amendment, and give every adapter entry in your fixtures an `email`. The fake agent and its manifests (`test/fixtures/agents/fake-agent.cjs`, `custom/fake.yaml`, `custom/fake-terminal.yaml`, `task-200`) are documented in the script's header: launch-only `WINGFOIL_FAKE_AGENT_EXIT` / `_WAIT`, `_LOOKUP=fail|hang` for lookups, and five more variables.

## Execution Notes

Branch `task/task-218-agent-execute-element-resolves-role-agent-adapter-assembles`, cut from `main` at
`1ce84a54` (wave 3, batch B3); start `b3dba4e3`, bug syncs `93b6cd2d` (bug-202) and `d4fc2058` (bug-290).

### design (architect)

**`depends_on` (dl-015).** task-130, 169, 176, 177, 195, 200, 206 are all `done` (`grep -m1 "^status:"`
on each file). What their notes hand over, and where it is used:
- task-169 — `coreOk(…, warnings)` and the one renderer `src/cli/warning.ts`; spec-005 §3.2's amendment
  is this task's (task-169 decision 5). Used: the live warning sink renders through `emitWarning`.
- task-171/176 — `assembleExecutionContext`, `W_MEMORY_UNREADABLE` in `result.warnings`,
  `details.unreadable` on `NOT_FOUND`: both forwarded (stderr / the refusal's details).
- task-255 — payload format 1: consumed only through the builder and the Prompt; never re-serialized,
  never indexed by marker (`bug-265`).
- task-195 — `parseElementRef` / `malformedElementRefMessage` for `--element`; the Prompt's
  `element`/`state` is what the pre-flight fetches.
- task-206 — `runLogPreflight` at step 6, `nextRunId` at step 9 (`recordSubject` added beside
  `recordRun`, one spelling of `agent: record <run-id>`).
- task-196 / task-210 — `REVIEWED_AGENT_WRITERS` and the dry-run table both gain `agentExecute`.
- task-200 / task-260 — the fake and its two manifests; every fixture agent entry with an `adapter`
  carries an `email`.

**Specs.** spec-004, 005, 006, 008, 009, 012, 016 `approved`; dl-050, dl-158, dl-033 `ready`
(`grep -m1 "^status:"`).

**Design.**
- `src/agent/execute.ts`: `agentExecutePipeline(root, request, host, launch)` runs §3.3 steps 2–12 in
  order at one `HEAD` and then calls `launch(prepared)` while the temporary files exist — task-228
  supplies the real launch callback. Pure helpers exported for tests and for task-228:
  `renderBootstrap`, `handoffLine`, `renderMcpTemplate`, `withRunFiles`, `agentCommandFound`,
  `selectAgent`, `mcpPreflight` (SDK `Client` + `StdioClientTransport`, cwd = root, environment passed
  through, server stderr captured for the cause), `runningBuildMcpServer`, `launchPlan`.
- `src/core/agent-execute.ts`: `agentExecuteFn` (parse → `UsageError`, `requireInitializedProject`,
  pipeline). Registered `agent.agentExecute`, `mutates: true`, options `--element`, `--role`,
  `--agent`.
- **Warnings mid-run (dl-050 option 4) + bug-202**: a warning sink in `src/validation/warning.ts`
  (`withWarningSink` / `reportWarning`, `AsyncLocalStorage`); the CLI registrar installs one around
  every operation that renders each warning at once through `emitWarning` in the active format. The
  loaders' unknown-field warning now goes through it; outside a sink (MCP server, library callers)
  the old `Warning: <text>` stderr line is kept.
- **bug-290**: `listAdaptersAtRev` lists only id-class basenames; `adapterTreeDiagnosticsAtRev`
  returns a `W_ADAPTER_IGNORED` warning per other entry (`.gitkeep` excepted); `agent execute` prints
  them at step 2.

**AC classification (T1).**

| AC | Class | Why |
|---|---|---|
| 1 §3.7 rows to NO_TERMINAL, nothing written | red-first | no `agent execute` existed (`unknown command 'execute'`) |
| 2 no flag / `--resume` / `--ref` → exit 2 | red-first | same |
| 3 developer default + warning; full-id fixture | red-first | same |
| 4 dl-050 warnings before the pre-flight | red-first | same |
| 5 bootstrap bytes, stable, handoff line | red-first | same; observed through the `--dry-run` plan's `bootstrap` |
| 6 temporary files in OS tmp, removed on every path | red-first | same |
| 7 pre-flight spawns the running build; `.mcp.json` untouched | **red-first** (reclassified from characterization) | the pre-flight did not exist, so its test failed first for a real reason; nothing pre-existed to characterize |
| 8 BDD P5.4.3 sc. 1–2 amended | characterization (documentation) | text only |
| bug-202 | red-first | `Warning: …` raw line broke `--format json` stderr (red run below) |
| bug-290 | red-first | `.yml`/nested silently skipped, `Bad Name` listed |

### red (developer)

`7c94941e` — `test/cli/agent-execute.integration.test.ts`, `test/agent/execute.test.ts`, bug-290 cases
in `test/agent/discovery.test.ts`, `test/cli/unknown-field-warning.integration.test.ts`, the
`REVIEWED_AGENT_WRITERS` entry and the dry-run row. `npx jest <the six files>` → **60 failed, 46
passed, 106 total** (6 suites failed): `error: unknown command 'execute'`, missing exports in
`src/agent`, `SyntaxError: Unexpected token 'W', "Warning: a"... is not valid JSON` (bug-202),
`listAdaptersAtRev` → `["Bad Name","ok"]` (bug-290). Load average ≈72 (`uptime`).

### green (developer)

`088026c7` — the implementation above, `docs/cli-reference.md`'s `wingfoil agent execute` entry (and the
`--dry-run` row and *Git side effects* bullet), and the rosters a new operation moves
(`production-registry`, `parity`, `agent/module`, `journey-0a`: `--next` is now `unknown option`, not
`unknown command`). Two test defects fixed on the way: `withRunFiles`' test set `process.env.TMPDIR`
in-process, which `os.tmpdir()` under Jest does not see (now asserts against `realpathSync(tmpdir())`;
the CLI test still drives `TMPDIR` in a real child); a fixture `dna.yaml` lacked `team.members`.
Behaviour decision made at green: the builder's `notes` (`no relevant Memory found for task`) are not
printed as warnings (§3.3 step 8 names `ExecutionContext.warnings`; the notes reach the agent with the
Prompt) — the integration fixture tags its elements so no context carries the note.
`b34b7e0b` — BDD `P5.4.3-context-preloading.feature` sc. 1–2 reworded, with a dated revision comment
(feature files carry no `version`; prior edits added none either, `git show fdf2b981`).

`npx jest test/docs test/cli/dry-run.integration.test.ts test/core/parity.test.ts
test/core/production-registry.test.ts test/agent test/cli/help-describes-every-command.test.ts
test/cli/journey-0a.integration.test.ts test/core/builtin-adapter-writers.test.ts test/validation
test/cli/registrar.test.ts test/cli/unknown-field-warning.integration.test.ts` → **626 passed, 626
total** (with the pending spec amendments on disk). `npx jest test/cli/agent-execute.integration.test.ts`
→ 32 passed.

Behaviour per AC, as built (each held by the named suite):
- AC 1 — 16 rows of `ROWS` in `agent-execute.integration.test.ts`: exit 1, `error: <message>` verbatim,
  stdout empty, `assertPersistenceUnchanged`, `TMPDIR` empty after. `MCP_UNREACHABLE` is provoked for
  real: the committed config is whole, the working tree's `dna.yaml` is deleted, and `wingfoil mcp`'s
  own pre-flight refuses; git identity via `GIT_CONFIG_GLOBAL`/`GIT_CONFIG_NOSYSTEM` and no local
  identity; INVALID_CONTEXT by committing without `roles.yaml` (`missing 'directives' section`).
- AC 2 — `error: missing required argument: --next or --element` exit 2; `unknown option '--resume'` /
  `'--ref'` exit 2; malformed element-ref exit 2 with spec-008 §7's message.
- AC 3 — `warning: no --role given and no workflow step to take one from: running as the default role
  'developer'` (console) / `{"warning": …}` (json); element `task:task-202-explicit-override` (full id).
- AC 4 — three dangling-binding warnings in §5.1 order, then `error: context pre-load failed: MCP server
  unreachable`; json: three `{warning}` documents then `{error}`; stdout empty.
- AC 5 — the plan's `bootstrap` equals the hand-written §2.4 template; equal on two runs; a `bug`
  element gets the fallback handoff line (its template has `## Triage & Execution Notes` only).
- AC 6 — `withRunFiles` unit tests (paths under `realpath(tmpdir())`, outside the repo, directory gone
  after resolve and after throw) + every CLI case asserts its `TMPDIR` is empty afterwards.
- AC 7 — `runningBuildMcpServer()` from `dist/agent` = `{command: process.execPath, args:
  [<repo>/dist/cli.js, 'mcp']}`; a `.mcp.json` registering an unstartable `wingfoil` does not stop the
  dry run, and its bytes are unchanged.
- AC 8 — `b34b7e0b`.
- bug-202 — `unknown-field-warning.integration.test.ts` (json refusal: every stderr line JSON, warning
  first; yaml stream parses; console `warning:` and no `Warning:`; json success).
- bug-290 — discovery unit tests + the integration case (three `W_ADAPTER_IGNORED` lines in path order).

### refactor (developer)

`d6d8c704` — `test/core/agent-execute.test.ts` (22 cases, `npx jest test/core/agent-execute.test.ts` → 22 passed) drives `agentExecuteFn` in process with a
`host` the test controls (`AgentExecuteParams.host`, read by no surface: `src/cli.ts`'s `buildParams`
sets no such key), because the CLI suite runs the pipeline in a child process that coverage does not
measure (first full run: `src/agent/execute.ts` at 55.2 % statements). It also reaches what the CLI
suite cannot set up: no commit, an uncommitted `dna.yaml` / `memory.yaml`, an invalid `dna.yaml`, an
unreadable sibling of an absent element, an empty `PATH`, a terminal present, `prompt.via: file` and
`mcp.via: args` manifests, an uncommitted template file. The fixture moved to
`test/agent/helpers/agent-execute-fixture.ts`. Two behaviour fixes found doing it: the MCP pre-flight's
cause and an absent element's unreadable documents were in `details` keys `errorDetails` does not
render (`cause`, `unreadable`); both now also ride `details.issues` as `dl-055` detail lines, so the
operator sees them (task-171's handover: never dropped). `test/mcp/read-only-agent-channel.test.ts`'s
roster gains `agentExecute`. The spec-016 amendment's `claude.yml` example was a backticked path the
name-resolvability gate flagged; reworded.

Gates (pending amendments on disk; load average 38–61, `uptime` around the run):
- `npm run test:coverage` → **304 suites, 5805 passed, 0 failed**; All files **99.14 | 96.86 | 97.21 |
  99.61** vs the W3 B2 gate's 99.28 | 97.18 | 97.33 | 99.71 (`devloop-kit/gate-w3b2-cov.log`; main has
  moved since). `src/agent/execute.ts` 93.81 | 83.33 | 93.75 | 96.22, `src/core/agent-execute.ts` 100 |
  91.66 | 100 | 100, `src/agent/discovery.ts` 97.53 | 96.15 | 100 | 98.48. The first full run (before
  `d6d8c704`) had 4 failures: the roster, the name-resolvability finding, and `query-latency` /
  `resource-latency` at load ≈96; both latency suites passed in the second run.
- `npm run lint` 0; `npx tsc --noEmit -p tsconfig.json` 0; `npx tsc -p tsconfig.build.json --noEmit` 0;
  `npm run docs:api` 0; `node scripts/check-governance.cjs --base 1ce84a54` → 3 `wf()` commits at that point (6 after submit
  and the bug syncs), 0 findings.

### review (reviewer, self)

- AC 1–7: met, by the cases named under green (32 CLI + 22 in-process + 18 unit tests).
- AC 8: `b34b7e0b`.
- bug-202, bug-290: met (named suites). bug-202's fix is a channel, not suppression: `spec-009` §2 said
  "suppressed under json/yaml" — amended (below).
- Same-class sweep in touched files: `grep -rn "process.stderr.write" src --include=*.ts | grep -v
  "^src/cli/"` → only `src/validation/warning.ts:48`, the no-sink fallback (positive case: `git show
  1ce84a54:src/validation/warning.ts | grep -n process.stderr.write` → line 109, the loader write this
  task removed). Every `details` key this task adds is also an
  `issues` detail line. `docs/cli-reference.md`'s `--dry-run` row and *Git side effects* bullet list
  `agent execute`, as spec-008 §2/§11 now do.
- **Unasserted (T1):** §3.7's "git identity missing" row is asserted on the CLI only (the in-process
  suite could set `GIT_CONFIG_GLOBAL` in `process.env`, which reaches the spawned git, but does not);
  REQ-PERF-01's budget is task-228's AC.

**Pending amendments (approver)** — uncommitted in the worktree, proposed `--reason`s:
- `spec-016-agent-execution`: "task-218: §2.1 requires email on an agents entry that declares adapter (dl-158 Rule 2 (ii), task-260) and reports every entry under .wingfoil/agents/ that is not an adapter as W_ADAPTER_IGNORED where the tree is listed (bug-290); §3.2 gives the default-role warning text and states the selected entry signs the agent's commits (dl-158 Rule 1 (a)); §3.3 step 2 reads the workflow registry only when a step is resolved, refuses a duplicate adapter name before any resolution and leaves roles.yaml to the context builder at step 7, step 8 names what is printed, step 11 declares that the pre-flight server reads the working tree's dna.yaml at start-up (spec-014 §1), and a paragraph gives the --dry-run launch plan; §8's agentExecute row is registered."
- `spec-008-cli-grammar`: "task-218: section 2's --dry-run row lists agent execute and states its plan, the launch without message or diff because the commit records the agent's exit; section 11's committed-HEAD row names agent execute with its one declared exception, the MCP pre-flight server's start-up read of the working tree's dna.yaml (spec-014 §1); section 6 drops its interim sentence, says a warning raised during a command is written when raised (bug-202), and pins the default-role, W_ADAPTER_IGNORED and unknown-field warning texts."
- `spec-005-cli-command-contract`: "task-218: section 3.2 says warnings, each its own document, may precede the error object on stderr and accompany exit 0, as task-169 left to the task implementing spec-016 section 3.4 (bug-202)."
- `spec-009-validation-strategy`: "task-218: section 2's unknown-field warning is raised through a warning sink the CLI renders in the active format instead of being suppressed under json and yaml, which the code never did, and its code listing calls reportWarning (bug-202)."
- `spec-006-core-domain-api`: "task-218: section 3's agentExecute row is registered, so its module cell loses planned, cell for cell with spec-016 section 8."
- `spec-004-mcp-surface-contract`: "task-218: section 4.1 lists agent.execute, the Tool spec-016 section 7 schedules for v0.4 that refuses every call until v1.0, so section 4.2's parity rule has its pair."

**Decisions for the approver.**
1. **Interim behaviour until task-228**: a real `agent execute` refuses (`IO`, exit 1) once every check
   passed, naming the run id, with `hint: run it with --dry-run …`; `--dry-run` exits 0 with the launch
   plan `{dryRun, subject, paths, run, bootstrap}` (no `message`/`diff`). The plan is also how AC 5's
   bootstrap is observed. `agentExecuteFn` reads `isDryRunActive()`, the one operation that learns of
   the mode (its commit follows a process it starts).
2. **Stepless form reads no workflow file** (spec-016 §3.3 step 2 amended): `--next`/`--workflow`/`--step`
   are task-235's and unregistered (unknown options, exit 2); the error text still names `--next`.
3. **The builder's notes are not printed** (only `ExecutionContext.warnings` + `W_MEMORY_UNREADABLE`):
   the agent gets them with the Prompt.
4. **bug-202 as a channel, not suppression**: every warning a loader raises is rendered live in the
   active format (`warning:` / `{"warning"}` / YAML doc); outside a sink the old `Warning: <text>` line
   stays (MCP server, library callers). Console wording changes `Warning:` → `warning:`.
5. **bug-290**: `.gitkeep` is the only exemption; a `README.md` under `agents/` is reported too.
6. **AC 7 reclassified red-first** (nothing pre-existed).
7. `spec-004` §4.1 gains `agent.execute` and the allowlist one `TOOLS_V04` entry (`spec-004 §4.1 tools |
   surplus | agent.execute`): the class the other unregistered Tools use, not `UNTRIAGED`.
8. Temporary files: `bootstrap.txt` / `mcp-config.json` in `mkdtemp(<os tmp>/wingfoil-run-)`, mode 0600;
   `{mcp_command}` is inserted JSON-string-escaped in `mcp.template`.
9. `dl-158` Rule 1 (a): the selection is stated in spec-016 §3.2 step 4 and carried in
   `PreparedLaunch.agent`; handing `name <email>` to the agent (bootstrap attribution line) is task-228's.

**Candidate findings (not filed).**
- `errorDetails` renders only `details.issues`/`diagnostics`; `assembleExecutionContext`'s
  `details.unreadable` / `details.cause` (and any other key) are dropped by the CLI and MCP surfaces
  for every caller (task-195's Prompt maps them itself). A shared rule would avoid each caller
  re-mapping.
- The MCP pre-flight uses the SDK client; the fake agent (task-200) has its own hand-written client —
  two clients of one protocol in the repo.

**Merge-order notes.** task-213 also amends spec-016 (§2.4's template list: `plan` gains `## Execution
Notes`) and merges after 218: its amendment is recorded after this one. 218 merges after 204 (both amend spec-005/008 and `docs/cli-reference.md`, and
both touch `CORE_MODULES` rosters: `production-registry`, `parity`, `read-only-agent-channel`, the
dry-run table count 15). `src/cli/registrar.ts` gains the warning sink around every operation — any B3
task editing the registrar's call site conflicts there. spec-016 is touched by no other B3 task.

### Review fixes (independent review: approve with fixes, 2026-10-08)

Status stays `in-review`; no re-submit.
- **F1 (a)** — spec-016 §3.3 step 2 no longer says `roles.yaml` is loaded there: the context builder
  reads it at step 7, which is why a missing `roles.yaml` is `INVALID_CONTEXT` (pending amendment).
- **F1 (b)** — a name in both `built-in/` and `custom/` is now refused at step 2, before the element,
  role and agent: `duplicateAdapterRefusal` (`src/agent/discovery.ts`, `loadAdapter`'s refusal shape),
  called right after the adapter-tree listing. Test: `test/core/agent-execute.test.ts` › "a name in both
  built-in/ and custom/ is refused at step 2, before a missing element" (element `task-999-absent`).
- **F2** — the pre-flight's server is `wingfoil mcp`, whose start-up check reads the working tree's
  `dna.yaml` (`spec-014` §1); that is how the MCP_UNREACHABLE CLI case is provoked. Declared, behaviour
  unchanged: spec-016 §3.3 step 11 and the spec-008 §11 row name the exception (pending amendments).
- **F3** — new tests: the registrar renders a warning raised mid-operation before the refusal
  (console and json, `test/cli/registrar.test.ts` › "the warning sink"); step 8's loop with a dangling
  binding (`test/core/agent-execute.test.ts`); a stub stdio server answering `prompts/get` with no
  messages → MCP_UNREACHABLE with cause `the developer-session prompt returned no context text`
  (`test/agent/execute.test.ts`); no surface names `host` (`src/cli.ts`, `src/cli/registrar.ts`,
  `src/mcp/registrar.ts`).
  Coverage against the real base `1ce84a54` (reviewer's figures for All files; `src/agent` from the
  W3 B2 gate run, `devloop-kit/gate-w3b2-cov.log`, written 13:57 after the last `src/agent` change
  before the base, `e629c709` 13:51 — `git log -3 1ce84a54 -- src/agent`):

  | | base `1ce84a54` | before fixes (`d6d8c704`) | after fixes |
  |---|---|---|---|
  | All files | 99.29 \| 97.25 \| 97.4 \| 99.71 | 99.14 \| 96.86 \| 97.21 \| 99.61 | 99.16 \| 96.87 \| 97.28 \| 99.66 |
  | `src/agent` | 99.04 \| 96.36 \| 100 \| 99.42 | 97.47 \| 92.94 \| 98.01 \| 98.47 | 97.68 \| 93.08 \| 98.07 \| 98.87 |

  Lines left uncovered in `src/agent/execute.ts`: 144 (a template token other than the two names —
  the manifest validator admits none, defensive), 325 (`processHasTerminal`, the process's own stdio:
  every test injects the answer), 343 and 401 (rethrow of an error that is not a `ValidationError` /
  `RevisionError`, a defect path). `src/agent/discovery.ts:201` is the same kind of rethrow.
- **F4** — spec-009 §2's listing calls `reportWarning`; spec-008 §6 drops the "until task-218"
  sentence and pins the default-role, `W_ADAPTER_IGNORED` and unknown-field warning texts. The
  proposed reasons above are updated. The new §6 row first named the adapter directory as a backticked
  path, which `test/docs/name-resolvability.test.ts` flagged (no such directory in this repository):
  reworded to "the adapter tree".
- Gates after the fixes (pending amendments on disk): `npm run test:coverage` → 304 suites, 5810 passed
  and 1 failed (the name-resolvability finding above, fixed after the run: `npx jest
  test/docs/name-resolvability.test.ts` → 11 passed; `npx jest test/docs` → 72 passed). `npm run lint`,
  both `tsc`, `npm run docs:api` exit 0; `node scripts/check-governance.cjs --base 1ce84a54` → 6 `wf()`
  commits, 0 findings. Code and tests: `28f8df41`.
