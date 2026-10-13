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

### green (developer, 2026-10-13)

- Read `### red (qa)`: red commit `ad0d8c8d`, test files `test/storage/builtin-adapter-claude-code.test.ts` (new) and
  `test/core/init-builtin-adapters.test.ts`; neither is edited here (T4, below).
- `614b1a94` `feat(agent): …`: `src/storage/builtin-adapters.ts` gains `CLAUDE_CODE` (the design's manifest, unchanged
  but for two comment lines) and `BUILTIN_ADAPTERS = [CLAUDE_CODE]`; its header now lists the shipped adapters one
  line each (task-237 appends a const, a list element and a line). Same-class comments: `src/storage/templates.ts`
  (`builtinTemplateSources` doc, `adapterScaffold` doc) and `src/core/init.ts` (`builtinAdapters` param), which said
  none ships. This repository gets init's layout: `.wingfoil/agents/built-in/claude-code.yaml`, written from the
  built `BUILTIN_ADAPTERS` (`node -e "…require('./dist/storage/builtin-adapters.js')…"`, so byte-equal), and
  `.wingfoil/agents/custom/.gitkeep`. `P5.1.1-init.feature` gains the design's Scenario Outline (g), title and
  Examples header verbatim.
- `498a33ba` `wf(dna): update team.agents.Claude`: `node dist/cli.js dna update team.agents.Claude --entry-adapter
  claude-code` → exit 0, `{"key": "team.agents.Claude"}`, one commit with the single line `adapter: claude-code`
  (`git show --stat HEAD` → `.wingfoil/dna.yaml | 1 +`); trailers added with `git commit --amend --no-edit
  --trailer` (git-conventions §8). Its `WingFoil-Version:` reads `0.2.2 (586a293a…-dirty)`: dist was built before
  the feat commit, from the then-dirty tree — the build that ran, recorded as is.
- `11569e02` `chore(dna): …`: `version: 1.9 → 2.0` with its history entry, and the `[SPEC: spec-016 §2.1]` annotation
  on `adapter` (ruling D-D: a second hand commit, the verb does not bump `version`).
- `8b75d2a7` `docs: …`: `docs/cli-reference.md` (`init` entry) and `docs/user-guide.md` §3 tree, which said no
  built-in adapter ships.
- **red → green:** `npx jest test/storage/builtin-adapter-claude-code.test.ts test/core/init-builtin-adapters.test.ts
  test/core/builtin-adapter-writers.test.ts --maxWorkers=2` → 3 suites, 29 passed, 29 total (red: 12 failed / 14
  passed of the first two; `builtin-adapter-writers` 3/3: the YAML spells no adapter directory).
- **R1 (dry run), run by me (coordinator's OK, it launches nothing).** Without a terminal it refuses at the last
  pre-flight check: `node dist/cli.js agent execute --element task:task-236-… --role developer --dry-run` → exit 1,
  `error: interactive launch needs a terminal on stdin and stdout` — `terminal: required` is enforced, and every
  earlier check passed (NO_TERMINAL is §3.3 step 12, the last). Under a pseudo-terminal (`script -qec "<same>"
  /dev/null`) → exit 0, `run.id` `task-236-…/adhoc/1`, `adapter` `built-in/claude-code`, `agent` `Claude`,
  `state_ref` `915baaa0…` (HEAD then), path `docs/06_runs/task-236-….jsonl`, and the bootstrap with
  `Get the MCP prompt "developer-session" with arguments element="task:task-236-…" and state="915baaa0…"`.
- `915baaa0` `test(storage): …` — two suites red did not touch failed in the first full run (5 tests:
  `test/storage/builtin-template-sources.test.ts` › "total coverage of the real scaffold", whose `builtinPathsOf`
  looked only under the directives' and workflows' built-in directories, so it was vacuous for adapters while none
  shipped; `test/core/format-init-scaffold.test.ts` › "every scaffolded file is a known kind", which had no adapter
  kind). Both now count `agents/built-in/` (`ADAPTER_MANIFEST_FORMAT` for the second). `npx jest
  test/storage/builtin-template-sources.test.ts test/core/format-init-scaffold.test.ts --maxWorkers=2` → 78 passed.

### refactor (developer, 2026-10-13)

Nothing to restructure beyond green (one const, one list). Gates, heavy ones under `waitslot.sh` with
`--maxWorkers=2`, with the spec-016 pending amendment in the working tree:
- `npm run test:coverage -- --maxWorkers=2` (the parallel run `npm test` makes; `WINGFOIL_LATENCY` unset) → 410
  suites, **7424 passed, 7424 total**; coverage **99.32 / 97.23 / 97.98 / 99.71** = the B6 baseline in every
  column. `memory-transition.ts` uncovered `468` only (run-dependent, per the batch notes); `templates.ts:666` (the
  sort comparator's equal-path `0`) uncovered, a line this task did not change (`git diff db0e2752 HEAD --
  src/storage/templates.ts` → two comment lines). `builtin-adapters.ts` 100 / 100 / 100 / 100.
- `npm run lint` → exit 0; `npm run docs:api` → exit 0; `npm run typecheck` (both tsc configs) → exit 0.
- `test/docs/cli-reference.test.ts` ran in the full run (passed); no command or option changed.
- `node scripts/check-governance.cjs --base db0e2752` → `gated: 0 findings`, `history: 0 findings`.
- `node scripts/lint-claims.cjs --base db0e2752` → 2 warnings, both on the word "unchanged" in my design's
  description of what a test asserts (`persistence unchanged`, `holds for it unchanged`) — test vocabulary, not a
  claim about the code.
- **T4:** `git log --first-parent --no-merges --format=%h ad0d8c8d..HEAD -- test/storage/builtin-adapter-claude-code.test.ts
  test/core/init-builtin-adapters.test.ts` → empty (positive case: the same command on
  `test/storage/builtin-template-sources.test.ts` prints `915baaa0`).

### review (reviewer, self, 2026-10-13)

- AC 1 — met: the eight claude-code tests and the four of `init-builtin-adapters` red failed pass (red → green
  above); `init` with no seam installs and commits the manifest, which loads as `built-in`.
- BDD handover — met: the Scenario Outline is in `P5.1.1-init.feature`, and its two rows are driven against the
  shipped manifest by red's test.
- AC 4 static half — met: `adapter: claude-code` through `dna update --entry-adapter` (`498a33ba`), bump 1.9 → 2.0
  (`11569e02`), installed copy byte-equal (red's parity test passes).
- AC 2, AC 3, AC 4 by-hand half — **open**: they need the real-terminal pass below (ruling D2). The task is not
  submitted until its transcript is in these notes.
- Every flag of the manifest has its help line in the design notes (claim-evidence). Same-class sweep:
  `grep -rniE "none (ships|yet)|empty today" src test docs/cli-reference.md docs/user-guide.md | grep -iE
  "adapter|agent"` → two lines, neither about the shipped list: red's own conditional doc
  (`builtin-adapter-claude-code.test.ts:43`, "while none ships") and `builtin-adapter-writers.test.ts:9`, which
  calls `REVIEWED_AGENT_WRITERS` "empty today" though it holds `agentExecute` since task-218 — a stale comment in a
  file this task does not touch (candidate finding). Before green the same grep also hit
  `src/storage/builtin-adapters.ts:15`, `src/core/init.ts:277`, `src/storage/templates.ts:173` and the two docs.

### Pending amendments (approver)

- `spec-016-agent-execution` (uncommitted in the worktree): §2.8's `claude-code` row filled (declarations and
  `verified_with` `2.1.296 (Claude Code)`), and a dated Revision note. To be completed after the by-hand pass with
  §2.5's outcome (which `wingfoil` server the agent used beside `.mcp.json`'s). Proposed `--reason`: "task-236: the
  claude-code row of section 2.8 is filled from claude --help of 2.1.296 (Claude Code) and checked by hand in a real
  terminal; the prompt comes first in the launch argv because --mcp-config takes several values, and usage.from is
  none because no command of that CLI reports a past session's model or tokens. Section 2.5 records which wingfoil
  server the agent used beside the project's .mcp.json one."

### by-hand runbook (for the approver)

Run in a real terminal (a TTY on stdin and stdout), from the worktree root, by the approver, or by the
coordinator through the app's Terminal panel on the approver's explicit OK (ruling D2). Paste the whole
terminal transcript back. Nothing below needs a credential typed: Claude Code uses its own login.

**R0 — setup and versions** (copy-paste):

```bash
cd /home/robypomper/Workspaces/.wf2-wt/task-236
git branch --show-current          # task/task-236-ship-verify-hand-builtin-claude-code-adapter-point
git status --short                 # only docs/04_memory/design/specs/spec-016-agent-execution.md (pending amendment)
npm run -s build
claude --version                   # expect: 2.1.296 (Claude Code) — the manifest's verified_with
node dist/cli.js --version
git rev-parse HEAD                 # the state_ref the run will pin
export EL=task:task-236-ship-verify-hand-builtin-claude-code-adapter-point
```

Record: the three versions and the HEAD sha. If `claude --version` is not `2.1.296 (Claude Code)`, stop and
report it (the manifest is pinned to that version).

**R1 — dry run** (launches nothing):

```bash
node dist/cli.js agent execute --element "$EL" --role developer --dry-run
```

Record: exit `0` (I ran it under a pseudo-terminal: it passed); the `run.id` (`task-236-…/adhoc/1`), `run.adapter` (`built-in/claude-code`), `run.state_ref` (= R0's HEAD) and the
`bootstrap` text. Any `error:` line → stop and report.

**R2 — the real run** (Claude starts and owns the terminal):

```bash
node dist/cli.js agent execute --element "$EL" --role developer
```

1. Record the `run <run-id>: launching Claude (…claude-code) as developer on task:…` line.
2. Record every dialog Claude shows BEFORE the session (workspace trust; `.mcp.json` server approval), and the
   answer you give. Answer trust "yes"; answer the `.mcp.json` approval as you normally would, and say which.
3. Then **type nothing** in the prompt box. Watch the agent's first actions for up to ~2 minutes:
   - Does it obtain the MCP prompt `developer-session` from the `wingfoil` server with
     `element=task:task-236-…` and `state=<R0 HEAD sha>`, on its own? Record exactly how it appears on screen
     (tool call, `/mcp__wingfoil__developer-session …` command, or anything else) and its arguments.
   - Does the result carry the element's execution context (the task's title, ACs, directives for developer)
     rather than only a short role header? Only the build under test (`dist/cli.js`) serves the context for
     `element`/`state`; the pinned 0.2.2 build that `.mcp.json` registers does not.
   - Did a permission prompt appear for the MCP call? Record it and your answer (approving a tool permission
     is not "user help" with the prompt; typing the prompt name or its arguments IS).

**R3 — inside the session** (type these yourself, after R2's observation):

```
/mcp
/status
```

Record from `/mcp`: every server named `wingfoil` and its command/args, and which one is connected.
`…/task-236/dist/cli.js mcp` (absolute path, the adapter's) = the adapter's server;
`node_modules/wingfoil-released/dist/cli.js mcp` = `.mcp.json`'s. Record from `/status`: the session id and
the model. Then type: `Stop here: make no edits and no commits.` and then `/exit`.

**R4 — after Claude exits** (copy-paste):

```bash
git log -1 --format='%H%n%s%n%b'                       # agent: record <run-id>, WingFoil-Version: trailer only
git show --stat --format= HEAD                          # only docs/06_runs/task-236-ship-verify-hand-builtin-claude-code-adapter-point.jsonl
tail -1 docs/06_runs/task-236-ship-verify-hand-builtin-claude-code-adapter-point.jsonl
SID=$(tail -1 docs/06_runs/task-236-ship-verify-hand-builtin-claude-code-adapter-point.jsonl | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).session')
echo "$SID"
ls ~/.claude/projects/*/"$SID".jsonl                   # the assigned id is Claude's own session id
git status --short                                      # the agent changed nothing (spec-016 amendment only)
node dist/cli.js agent list --past
```

Record: the `run <run-id>: agent exited <status> after <s> s (recorded in <sha7>)` line; the record commit
sha; the record line (expect `agent_version` `2.1.296 (Claude Code)`, `session` = R3's `/status` id,
`model` and every `tokens` count `not-reported`, `adapter` `built-in/claude-code`); whether the `ls` finds the session file.

**Stop-and-return (AC 3, spec-016 §2.8; R17 is not narrowed silently).** Stop after the step where it shows,
paste the transcript, and the choice returns to the approver, if:
- R2: the agent does not get `developer-session` with `element` and `state` without you typing the prompt or its
  arguments, or the result is only the role header;
- R3: the adapter's `wingfoil` server is not connected (not listed, failed, or `.mcp.json`'s one is used
  instead). For that one case the in-task remedy is `--strict-mcp-config` in the manifest (ruling D-A), only on
  the approver's OK, then R1–R4 again;
- R2: Claude rejects the argv (e.g. reads the bootstrap as an MCP configuration) — a manifest fix in this task,
  then R1–R4 again.

### by-hand R2 — observed from inside the launched agent (developer, run `task-236-…/adhoc/1`, 2026-10-13)

This entry was written by the agent that `agent execute --element task:task-236-… --role developer` launched
at `state` `20b0794d3ddfad786621d17d598a8b8a69b27991`, as R2 observed it from the inside. It covers R2 and
the server half of R3. R0, R1, R4 and the dialogs before the session are the approver's terminal transcript,
not this entry's.

- **Launch argv accepted.** `ps -o pid,ppid,lstart,args -p 426290` → `claude WingFoil run task-236-…/adhoc/1: act
  as role "developer" …`, started `mar ott 13 22:42:44 2026`, its parent is `426097`, which is
  `node dist/cli.js agent execute --element task:task-236-… --role developer`. The bootstrap arrived as the
  first user message, verbatim, so Claude did not read it as an `--mcp-config` value. `claude --version` →
  `2.1.296 (Claude Code)` = `verified_with`.
- **§2.5 / R3: the adapter's server is the one connected (MCP registration passes).** The only `wingfoil` MCP
  child of the session is the adapter's: `ps -o pid,ppid,lstart,args -p 431632` →
  `/usr/local/bin/node /home/robypomper/Workspaces/.wf2-wt/task-236/dist/cli.js mcp`, ppid `426290`.
  No `node_modules/wingfoil-released/dist/cli.js mcp` process has `426290` as its parent (`ps -ef | grep "cli.js mcp"`).
  The `wingfoil` resources the session sees include `wingfoil://workflows/-/next`, which
  `grep -rln "workflows/-/next" node_modules/wingfoil-released/dist src dist` finds only in this repository's
  `src/` and `dist/`, not in the pinned `0.2.2`. So the adapter's server is the one in use, beside `.mcp.json`'s.
  Whether `.mcp.json`'s server was shadowed or left unapproved depends on the dialog answers, which are the approver's.
- **Prompt-fetch check (AC 3, spec-016 §2.8 N1): FAILS.** The bootstrap asks the agent to "Get the MCP prompt
  `developer-session` with arguments element=… and state=…". The model of Claude Code `2.1.296` has no tool
  that fetches an MCP *Prompt*. Its MCP tools for this server are `ListMcpResourcesTool` and
  `ReadMcpResourceTool`. The listing gave four resources (`wingfoil://dna`, `wingfoil://workflows`,
  `…/-/next`, `…/-/status`), with no prompt among them. A tool search (`ToolSearch` "wingfoil prompt
  developer-session") turned up no prompt-fetching tool either. Claude Code exposes an MCP Prompt only as a
  slash command the *user* types (`/mcp__wingfoil__developer-session …`), and the model cannot invoke that
  command. So the agent cannot get the `{role}-session` Prompt from the bootstrap without the user typing the
  prompt name and its arguments, which the runbook's stop-and-return condition counts as "user help". **The
  task stops here and the choice returns to the approver** (AC 3; R17 is not narrowed silently). This agent
  did not do the developer work, because it has no element context: no edits, no commits beyond this note.
  It also did not load the context by other means, such as reading the task file directly, which would hide
  the failure.
- **Options for the approver** (spec-016 §2.8: "revisited with the approver", ruling R18):
  (a) serve the same context as a **Resource** too (e.g. `wingfoil://session/{role}?element=…&state=…`),
  because the model *can* read Resources. The bootstrap literal of §2.4 would then name the Resource. This
  touches R5 ("agent Resources are v0.4"); (b) serve it as an MCP **Tool**, read-only, returning the
  Prompt's text; (c) inline the context into the bootstrap. §2.4 rejected this for argv/prompt-size bounds;
  (d) accept that the user types `/mcp__wingfoil__developer-session` once. That narrows R17/N1 and needs an
  explicit ruling. Not tried: whether the user-typed slash command actually renders the context for
  `element`/`state` with the built server. If (d) is considered, test that first.
- **Not done by this agent:** the `spec-016` Revision note (uncommitted in the worktree) still says the row is
  "checked by hand in a real terminal". Do not commit it as is: the check failed on N1. It is left untouched
  for the approver's choice. `/status` session id and model, the record line and the `agent: record` commit
  are R3/R4's, after `/exit`.
