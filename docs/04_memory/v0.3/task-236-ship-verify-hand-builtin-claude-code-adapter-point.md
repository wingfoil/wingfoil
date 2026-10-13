---
id: "task-236-ship-verify-hand-builtin-claude-code-adapter-point"
type: task
title: "Ship and verify by hand the built-in `claude-code` adapter, and point this repository's agent at it"
status: in-progress
release: "v0.3"
kind: "feature"
priority: "high"
tags: ["v0.3", "agent", "adapter", "manual-verification"]
ref: "adr-012"
bug: []
depends_on: ["task-196-wingfoil-init-installs-builtin-adapters-protected-builtin-assets", "task-228-agent-execute-launches-agent-forwards-right-signals-records"]
tmpl_version: 260703
---

## Description

This task writes `claude-code.yaml` from the Claude Code CLI's own help output and documentation, at a pinned version recorded in `verified_with`. It fills `command`, `launch.interactive.args`, `terminal: required`, `prompt.via`, `mcp.*`, `session.*`, `usage.*` and `version_args`, and ships the file as a built-in (installed by task-196). It then verifies by hand, in a real terminal, that: - the `wingfoil` MCP server registers for the launched process (and which server wins when `.mcp.json` also declares one); - the agent obtains the `{role}-session` Prompt with `element`/`state` from the bootstrap alone, with no user help; - session, model and usage lookups give values or `not-reported`; - the run record is committed. This repository's `team.agents` entry gains `adapter: claude-code`.

## Acceptance Criteria

- (red-first) The shipped manifest validates under task-177 as a built-in and is installed by `init`. A unit test pins its `name`, `format`, `terminal: required` and a non-empty `verified_with`.
- (characterization) The by-hand verification transcript goes into Execution Notes: the commands run, the agent CLI version, the observed record line, and the `agent: record` commit sha. It names no flag as a fact without the help output that shows it (`claim-evidence`).
- (characterization) The Prompt-fetch check passes. **If it or the MCP registration fails, the task stops and returns the choice to the approver** (`spec-016` §2.8; R17 is not narrowed silently).
- (characterization) `.wingfoil/dna.yaml` `team.agents[0]` gains `adapter: claude-code` through `dna update … --entry-adapter` (task-138), with a `doc-versioning` bump. `agent execute --element <real task> --role developer` on this repository is part of the by-hand pass.

## Implementation Notes

- **Size:** M · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** R17; adr-012 point 2; spec-016 §2.2, §2.5, §2.8 (N1: the `{role}-session` Prompt fetch check).
- **Features:** P5.3.1, P5.4.3.
- **Notes:** Proposal key: B14. CI cannot run it (`adr-012` Consequences). `verified_with` is the only version pin.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.
- **Handover from the W3 B1 triage (2026-10-07, `task-196`'s review).** No BDD scenario pins the refusal `init` prints when a built-in adapter manifest fails its integrity check or its secret scan (`built-in adapter template integrity check failed: <name>`, `… secret scan failed: <name> (<rule>, line <n>)`; `grep -rli adapter docs/02_requirements/02_bdd/` finds nothing). With the first real built-in adapter, add that scenario under P5.1.1 or P5.3.1.

## Execution Notes

### design (developer, 2026-10-13)

- **Start.** Branch `task/task-236-ship-verify-hand-builtin-claude-code-adapter-point` cut from `db0e2752`; start
  commit `4add8531` (`git log --oneline -2`). No bug in `bug:`.
- **depends_on read (dl-015).** `task-196` (`done`): `BUILTIN_ADAPTERS` in `src/storage/builtin-adapters.ts`
  (empty), `templateScaffold(def, adapters = BUILTIN_ADAPTERS)` writes `agents/built-in/<name>.yaml` verbatim, or a
  `.gitkeep` while the list is empty (`src/storage/templates.ts:603-608`); `verifyBuiltinTemplates` runs the
  task-177 schema as a built-in and then the secret scan before any write; the 4th parameter of
  `initWingfoilProject` is the test-only seam. `task-228` (`done`): the launch argv is `launch.interactive.args`
  rendered, then `session.assign_args` APPENDED (`renderLaunchArgv`, `src/agent/launch.ts:104-109`); its
  "Unasserted (T1)" note hands the real terminal's signal behaviour to the by-hand pass of the built-ins (it names
  "task-246", which is the comparison page: `grep -m1 '^title' docs/04_memory/v0.3/task-246-*.md` — a wrong
  reference, candidate finding in the report). `task-138` (`done`): `team.agents[].adapter` is schema-validated
  (`src/dna/schema.ts:211`) and needs `email` (Claude has one, `.wingfoil/dna.yaml:142-143`); nothing checks the
  named adapter exists (`grep -n adapter src/dna/*.ts` → schema only), so `agent execute` would answer `NOT_FOUND`
  unless the manifest is committed in THIS repository.
- **Cited elements are ratified.** `grep -m1 '^status'`: spec-016 `approved`, adr-012 `accepted`, dl-015/090/114/135/158
  `ready`; task-177 `done`. The `{role}-session` Prompt takes `element` and `state` in the dev build
  (`src/mcp/prompt.ts:102-110`, task-195); the pinned build that `.mcp.json` registers under the SAME name `wingfoil`
  (`cat .mcp.json`) is 0.2.2 (`grep '"version"' node_modules/wingfoil-released/package.json`) and has no such argument
  (`grep -n element node_modules/wingfoil-released/dist/mcp/prompt.js` → nothing; positive case: the same grep on
  `src/mcp/prompt.ts` hits line 104). So on this repository "which `wingfoil` wins" decides whether the Prompt fetch
  can pass at all.
- **No AC contradicts a ratified spec/DL (dl-102 §4).** spec-016 §2.8 says the spec "quotes no vendor command, flag
  or output format as a fact"; filling the §2.8 row is this task's (the table says "filled by the implementing
  task"), as a pending amendment in session 3 (brief), not before green.

**Evidence: the Claude Code CLI at `verified_with`** (non-interactive, print-and-exit, run 2026-10-13; quoted lines
are verbatim and re-obtainable by re-running each command):
- `claude --version` → `2.1.296 (Claude Code)`; `readlink -f $(which claude)` → `~/.local/share/claude/versions/2.1.296`.
- `claude --help` → `Usage: claude [options] [command] [prompt]`; `Claude Code - starts an interactive session by
  default, use -p/--print for non-interactive output`; `prompt  Your prompt`; `--mcp-config <configs...>  Load MCP
  servers from JSON files or strings (space-separated)`; `--strict-mcp-config  Only use MCP servers from
  --mcp-config, ignoring all other MCP configurations`; `--session-id <uuid>  Use a specific session ID for the
  conversation (must be a valid UUID)`; `-r, --resume [value]  Resume a conversation by session ID, or open
  interactive picker with optional search term`; `-v, --version  Output the version number`; under `-p, --print`:
  `… when Claude is run in non-interactive mode (via -p, or when stdout is not a TTY, e.g. piped or redirected
  output)`. Commands: `agents`, `attach`, `logs`, `mcp`, … — none prints a past session's model or token counts.
- `claude mcp --help` / `claude mcp list --help`: `Unapproved .mcp.json servers are shown as ⏸ Pending approval and
  not connected to`.
- Documentation (code.claude.com/docs/en/mcp, read 2026-10-13): the scope precedence lists local, project
  (`.mcp.json`), user, plugin, connectors — it does NOT place `--mcp-config` in that order; `--strict-mcp-config`
  uses only the servers passed with `--mcp-config`. How an MCP Prompt reaches the MODEL (Claude Code exposes MCP
  prompts as `/mcp__<server>__<prompt>` commands; whether the model can invoke one itself) is not established by
  anything I could read: it is exactly the §2.8 / R18 check, settled only by the by-hand pass.

**Draft manifest** (`claude-code`, every flag backed by a line above):

```yaml
name: claude-code
format: 1
command: claude                                   # Usage: claude [options] [command] [prompt]
verified_with: "2.1.296 (Claude Code)"            # claude --version
version_args: [ --version ]                       # -v, --version  Output the version number
launch:
  interactive:
    # prompt FIRST: --mcp-config <configs...> is variadic and would swallow a following positional as a
    # second config; the appended session.assign_args (an option) then closes the variadic.
    args: [ "{bootstrap}", --mcp-config, "{mcp_config_file}" ]
    terminal: required                            # interactive by default; non-interactive when stdout is not a TTY
prompt:
  via: arg                                        # prompt  Your prompt
mcp:
  via: config-file                                # --mcp-config <configs...>  Load MCP servers from JSON files
  template: |
    {"mcpServers": {"wingfoil": {"command": "{mcp_command}", "args": {mcp_args}}}}
session:
  id: assign                                      # --session-id <uuid> (must be a valid UUID); spec-016 §2.6 v5
  assign_args: [ --session-id, "{session_id}" ]
  resume:
    supported: true                               # -r, --resume [value]  Resume a conversation by session ID
    args: [ --resume, "{session_id}" ]
usage:
  from: none                                      # no command prints a past session's model/usage → not-reported
```

  No `launch.headless` (read from v1.0, §3.5; `-p` + `--output-format json` exist but are not verified here) and no
  `summary` (v0.4). The template's JSON shape is the one this repository's own `.mcp.json` uses with the same CLI.
  Constraint for green: the YAML is a TS string in code, so it must not spell `.wingfoil/agents` or
  `agents/built-in|custom` (`test/core/builtin-adapter-writers.test.ts` reads code lines, `#` lines included).

**AC classification and what the qa agent pins (T1).**

| AC | Class | qa pins |
|---|---|---|
| 1 shipped manifest valid as built-in, installed by `init`; name/format/terminal/verified_with | red-first | (a)–(f) below |
| BDD handover (B1): integrity / secret-scan refusal scenario | red-first | (g) below |
| 4 (static half) `dna.yaml` Claude `adapter: claude-code` + the installed copy in this repo | red-first (reclassified, see decision D-B) | (h) below |
| 2 by-hand transcript in the notes | manual (session 3 runbook; approver/coordinator runs it, ruling D2) | nothing |
| 3 Prompt fetch passes, else stop | manual (same) | nothing |
| 4 (by-hand half) `agent execute --element <task> --role developer` | manual (same) | nothing |

Test files: NEW `test/storage/builtin-adapter-claude-code.test.ts` (one file per adapter, so task-237 adds its own
beside it without touching this one), and `test/core/init-builtin-adapters.test.ts` (existing). Interfaces, all
existing exports: `BUILTIN_ADAPTERS`, `templateScaffold`, `TEMPLATES`, `builtinTemplateSources`, `BUILTIN_ADAPTERS_DIR`
(`src/storage`), `parseAdapterManifest` and `loadAdapter` (`src/agent`), `verifyBuiltinTemplates`
(`src/core/builtin-integrity`), `initWingfoilProject` (`src/core/init`); helpers `makeTempGitRepo`/`removeTempDir`/`git`
(`test/storage/helpers/git-fixture`), `snapshotPersistence`/`assertPersistenceUnchanged`, `FAKE_PEM_RSA_HEADER`
(`test/validation/helpers/secret-fixtures`).

- (a) `BUILTIN_ADAPTERS` has exactly one entry named `claude-code` (`.find(a => a.name === 'claude-code')` defined;
  `.map(a => a.name)` sorted and duplicate-free — so 237's append stays checkable).
- (b) `parseAdapterManifest(entry.content, { name: 'claude-code', kind: 'built-in', file: '<label>' })` does not throw
  and returns `name === 'claude-code'`, `format === 1`, `launch.interactive.terminal === 'required'` — asserted on the
  RAW YAML too (`load(entry.content).launch.interactive.terminal === 'required'`, so it is declared, not defaulted:
  spec-016 §2.8 "Each built-in declares"), and `verified_with` a non-empty string (`/\S/`). Do NOT pin flags, the
  version string or argv: they are by-hand facts that may change in session 3.
- (c) `verifyBuiltinTemplates(builtinTemplateSources(templateScaffold(TEMPLATES[0]!)))` → `null` (schema + secret scan
  pass on the shipped list).
- (d) `templateScaffold(TEMPLATES[0]!)` (default list) contains `${BUILTIN_ADAPTERS_DIR}/claude-code.yaml` with content
  `=== entry.content`, and NO `${BUILTIN_ADAPTERS_DIR}/.gitkeep`. In `init-builtin-adapters.test.ts`, replace the
  ternary test ("by default installs exactly the shipped list …") by two plain ones: default → exactly the shipped
  names, no `.gitkeep`; `templateScaffold(SCRUM, [])` → exactly `[${BUILTIN_ADAPTERS_DIR}/.gitkeep]` (keeps the
  empty-list branch of `adapterScaffold` covered once the list is non-empty). Also update its header comment
  ("No real built-in adapter ships yet").
- (e) `initWingfoilProject(repo, 'Scrum')` with NO seam → ok; `.wingfoil/agents/built-in/claude-code.yaml` on disk
  equals `entry.content` and is in the init commit (`git show --name-only --format= HEAD`); `loadAdapter(repo,
  'claude-code')` → `{ ok: true, value: { name: 'claude-code', kind: 'built-in' } }`.
- (f) none other: no test launches `claude` or reads `PATH`.
- (g) BDD: `docs/02_requirements/02_bdd/features/p5-interaction/P5.1.1-init.feature` gains (written in green by me;
  qa's test reads the file, so it is red now) exactly this scenario:

```gherkin
  Scenario Outline: Error - a built-in adapter manifest fails the pre-write check
    Given the built-in adapter manifest "claude-code" that WingFoil ships <defect>
    When I run "wingfoil init --template Scrum"
    Then nothing is written and no commit is made
    And the command exits with code 1 and a message starting "<message>"

    Examples:
      | defect                                         | message                                                                   |
      | has a key the manifest schema does not declare | built-in adapter template integrity check failed: claude-code             |
      | carries a private-key header                   | built-in adapter template secret scan failed: claude-code (private-key-pem, line |
```

  qa test (in `init-builtin-adapters.test.ts`): read the feature, take the two `message` cells of that Examples table
  (fail if the scenario title is absent), then drive `initWingfoilProject(repo, 'Scrum', undefined, [broken])` with
  `broken` = the shipped `claude-code` content plus `env: { TOKEN: x }\n` (row 1) and plus `# ${FAKE_PEM_RSA_HEADER}\n`
  (row 2): `error.message` starts with the row's cell, `exitCodeForResult` → 1, `.wingfoil` absent, persistence
  unchanged.
- (h) live-repository test (in the new file): `.wingfoil/dna.yaml` parsed with `DnaYaml` → the `Claude` entry's
  `adapter === 'claude-code'`; every `*.yaml` under this repository's `.wingfoil/agents/built-in/` equals the
  `BUILTIN_ADAPTERS` entry of the same name, and `claude-code.yaml` is among them (parity: this repository launches
  what the package ships; 237 installs nothing here, so the "every file" form holds for it unchanged). The dna.yaml
  version is NOT pinned (bug-314).

**Files I expect to touch (session 3).** `src/storage/builtin-adapters.ts` (a `CLAUDE_CODE` const, `BUILTIN_ADAPTERS =
[CLAUDE_CODE]` in name order, header "Empty today" → one paragraph per shipped adapter, so 237 appends a const, a list
element and a line); `src/storage/templates.ts:173,600` and `src/core/init.ts:277` comments ("none yet", same class);
`.wingfoil/agents/built-in/claude-code.yaml` (byte copy) + `.wingfoil/agents/custom/.gitkeep` (init's layout);
`.wingfoil/dna.yaml` by `npm run build && node dist/cli.js dna update team.agents.Claude --entry-adapter claude-code`
(commit `wf(dna): update team.agents.Claude`; 0.2.x has no `adapter`, so the dev build), then a hand commit `version:
1.9 → 2.0` with the history line and the `[SPEC: spec-016 §2.1]` annotation on `adapter`; the P5.1.1 feature;
`docs/cli-reference.md:212` and `docs/user-guide.md:111` ("none ships yet" / "none yet"); the run log under
`paths.runs` and its `agent: record` commit (from the by-hand pass, on this branch). Pending amendment: spec-016 §2.8
(the row, `verified_with`), §2.5 (which server won), Revision note. No other config version bump.

**By-hand runbook (session 3 writes it out in full; ruling D2: the approver, or the coordinator on the approver's
explicit OK, runs it in a real terminal from this worktree with the green commits at HEAD and `npm run build` done).**
- R0 record: `claude --version`, `node dist/cli.js --version`, `git rev-parse HEAD`.
- R1 `node dist/cli.js agent execute --element task:task-236-ship-verify-hand-builtin-claude-code-adapter-point --role
  developer --dry-run` → pre-flight passes, bootstrap printed (launches nothing).
- R2 the run: the same without `--dry-run`. Record every dialog before the session (workspace trust, `.mcp.json`
  approval) and the answer given. Then type NOTHING and observe: does the agent, from the bootstrap alone, get
  `developer-session` with `element=task:task-236-…` and `state=<HEAD sha>`, and does the result carry the element's
  execution context (the dev build) rather than the bare role header (what 0.2.2 returns)? Record the call as shown
  and any permission prompt.
- R3 in the session: `/mcp` → which `wingfoil` server is connected and its command (`…/task-236/dist/cli.js mcp` =
  the adapter's; `node_modules/wingfoil-released/dist/cli.js` = `.mcp.json`'s); `/status` → session id and model.
  Then: "Stop: make no edits and no commits", `/exit`.
- R4 after exit: the `run …: agent exited …` line; `git log -1 --format='%H%n%s%n%b'` (`agent: record <run-id>`, only
  the run log); `tail -1 <paths.runs>/task-236-….jsonl` (agent_version `2.1.296 (Claude Code)`, session id = R3's,
  model/usage `not-reported`); `ls ~/.claude/projects/*/<session_id>.jsonl` (the assigned id is the session's);
  `git status --short` (the agent changed nothing).
- **Stop-and-return (AC 3, §2.8):** if R2 needs the user to type the prompt or its arguments, or R3 shows the
  adapter's server not connected, the run stops there, the transcript goes in the notes, and the choice returns to
  the approver; R17 is not narrowed. The one in-task remedy, only on the approver's OK: `--strict-mcp-config` when
  `.mcp.json`'s server wins (D-A).

**Decisions for the approver.**
- D-A `--strict-mcp-config`: not in the draft (it drops every other MCP server of the user's; spec-016 §2.5 leaves the
  project's registration alone). Recommendation: run R2/R3 without it; add it only if `.mcp.json`'s `wingfoil` wins.
- D-B AC 4's static half reclassified red-first, with this repository getting the installed copy (needed: `agent
  execute` reads the adapter at HEAD) and a parity test (h). Recommendation: accept.
- D-C `usage.from: none`: model and usage are always `not-reported` for claude-code in v0.3 (no lookup command
  exists, evidence above). Recommendation: accept (§2.6 allows it; AC says "values or `not-reported`").
- D-D the dna.yaml bump in a second hand commit after `wf(dna): update` (the verb does not bump `version`).

### red (qa, 2026-10-13)

- **Red commit `ad0d8c8d`** (T4 is measured from it). Files: NEW `test/storage/builtin-adapter-claude-code.test.ts`;
  `test/core/init-builtin-adapters.test.ts` (header comment updated; the ternary default-list test replaced by two plain
  ones; the P5.1.1 Scenario Outline block appended). Test files only; no `src/`, `.wingfoil/` or feature-file change.
- **The P5.1.1 Scenario Outline is NOT in the red commit**: the design writes it in green (point (g)); the qa test reads
  the feature file and fails on the absent title. `P5.1.1-init.feature` carries no `version`, so no bump applies.
- **Per AC (all red-first; the by-hand ACs 2, 3 and AC 4's by-hand half are not red's):**
  - AC 1 (a) `AC 1 (a): has exactly one entry named claude-code, …` — fails `Expected length: 1 / Received length: 0`.
  - AC 1 (b) `AC 1 (b): validates under the task-177 schema …` and `AC 1 (b): declares terminal: required in the raw
    YAML …` — both fail at `expect(entry).toBeDefined()` (`Received: undefined`), not on an import. Flags, argv and the
    `verified_with` string are not pinned (design (b)).
  - AC 1 (c) `AC 1 (c): the shipped list passes the pre-write integrity pass` — `Received: undefined` (no entry).
  - AC 1 (d) `AC 1 (d): the default scaffold installs claude-code verbatim and no agents/built-in/.gitkeep` —
    `Received: undefined`; in `init-builtin-adapters.test.ts`, `by default installs exactly the shipped list, … no
    .gitkeep` fails `Expected: > 0 / Received: 0`; `with an empty adapter list keeps agents/built-in/ with a .gitkeep`
    passes (characterization of the empty-list branch through the seam, as the design asks).
  - AC 1 (e) `writes the shipped manifest, commits it, and the task-177 loader loads it as a built-in` (init, no seam) —
    `Received: undefined`.
  - BDD handover (g) `declares exactly the two rows …` and `row 1: …` / `row 2: … → init exits 1 with the row's
    message` — fail on `{ scenario, found: false }` vs `found: true` (the outline title is absent from the feature).
  - AC 4 static half (h) `AC 4: .wingfoil/dna.yaml team.agents entry 'Claude' names adapter: claude-code` — `Expected:
    "claude-code" / Received: undefined`; `AC 4: every manifest under this repository's .wingfoil/agents/built-in/
    equals the shipped entry …` — `Expected value: "claude-code.yaml" / Received array: []`. The dna.yaml version is not
    pinned (bug-314).
- **Run:** `npx jest test/storage/builtin-adapter-claude-code.test.ts test/core/init-builtin-adapters.test.ts
  --maxWorkers=2` → 2 suites failed; 12 failed, 14 passed, 26 total (claude-code file: 8 failed, 0 passed;
  init-builtin-adapters: 4 failed, 14 passed — the 13 pre-existing tests plus the new empty-list one).
  `npx eslint` and `npx tsc --noEmit -p tsconfig.json` on the two files: no output.
