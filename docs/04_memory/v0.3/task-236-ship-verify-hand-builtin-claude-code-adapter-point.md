---
id: "task-236-ship-verify-hand-builtin-claude-code-adapter-point"
type: task
title: "Ship and verify by hand the built-in `claude-code` adapter, and point this repository's agent at it"
status: in-review
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
- (characterization) The session-context fetch check passes: the launched agent reads, with no user help, the session Resource `wingfoil://session/{role}/{element}/{state}` the bootstrap names (approver ruling (a), 2026-10-13: it replaced the `{role}-session` Prompt fetch, which Claude Code's model cannot do). **If it or the MCP registration fails, the task stops and returns the choice to the approver** (`spec-016` §2.8; R17 is not narrowed silently).
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

### self-review (developer, 2026-10-13)

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

### design addendum (developer, 2026-10-13) — session context as a Resource

> **Correction (developer, 2026-10-14), approver's statement:** in run `…/adhoc/1` the approver answered the `.mcp.json`
> dialog "Use this MCP server" (the pasted transcript showed only the menu). So in both runs the two same-named `wingfoil`
> servers were enabled, and the adapter's `--mcp-config` server (`…/task-236/dist/cli.js mcp`) was the only `wingfoil`
> MCP child and served the session: `.mcp.json`'s pinned server was shadowed, not spawned. `/mcp`'s `Config location:
> …/.mcp.json` is Claude Code's display only. R4's `claude mcp reset-project-choices` (run 2) cleared that pass-1 choice.
> The agent-written sections (`55cf766a`, `5b7af1be`), which leave the dialog answer open, are left as written.

**What the by-hand pass established** (approver transcript `devloop-kit/task-236-runbook.md`, the launched agent's
note `55cf766a`, record commit `a19338c5`):
- argv accepted; the bootstrap arrived as the first user message (`55cf766a`, `ps` of the `claude` process);
- the connected `wingfoil` server is the adapter's: its only MCP child is `node …/task-236/dist/cli.js mcp`, and it
  served `wingfoil://workflows/-/next`, which the pinned 0.2.2 does not have (`55cf766a`). [Corrected 2026-10-14,
  see the note above: the approver had answered the dialog "Use this MCP server", so both servers were enabled and
  the adapter's won; this line first said "Continue without" and "untested".] `/mcp` showed `Config location: …/task-236/.mcp.json` for the server it called `wingfoil`
  (`⚠ connected · no tools`, `Capabilities: resources · prompts`) although the process was the adapter's — Claude
  Code's display, not evidence of precedence;
- R4: `agent: record …/adhoc/1` at `a19338c5`, only the run log; `session` `f4458e8b-b6a3-5453-8221-90a33bb558bb`
  = `/status`'s Session ID, and `~/.claude/projects/…task-236/f4458e8b-….jsonl` exists (the assigned UUID v5 is
  Claude's own id); `agent_version` `2.1.296 (Claude Code)`; `model` and every `tokens` count `not-reported`;
  `exit_status` 0; `notes` `…#execution-notes` (the agent's `55cf766a` changed the section);
- environment, not the adapter: the login had expired, `/login` was needed before the first turn;
- **AC 3 fails**: Claude Code 2.1.296 gives the model `ListMcpResourcesTool` and `ReadMcpResourceTool` and no tool
  that gets an MCP Prompt; Prompts are user-typed slash commands. Ruling (a), 2026-10-13 (w3-b7-notes, task resized
  M → L): serve the same context ALSO as a read-only Resource and make the bootstrap name it; R5 / spec-016 Q7 are
  revised for this one session Resource only.

**Discovery: why the bootstrap must carry the full URI.** `ListMcpResourcesTool` gave four entries
(`wingfoil://dna`, `wingfoil://workflows`, `…/-/next`, `…/-/status`; `55cf766a`), i.e. only `resources/list`. The
server also registers four resource TEMPLATES (`wingfoil://dna/{section}`, `wingfoil://memory/{type}`,
`wingfoil://memory/{type}/{id}`, `wingfoil://workflows/{name}`: `grep -n "new ResourceTemplate" src/mcp/*.ts`), each
`{ list: undefined }`, and none was shown: in SDK 1.32.0 (`grep '"version"'
node_modules/@modelcontextprotocol/sdk/package.json`) `resources/list` returns the fixed resources plus only what a
template's `listCallback` yields, templates go to `resources/templates/list`
(`node_modules/@modelcontextprotocol/sdk/dist/cjs/server/mcp.js:391-422`), and Claude Code's tool does not ask for
the latter. A read, though, is matched against every template (`mcp.js:423-441`: exact resource first, then
`uriTemplate.match`), so a concrete URI the model is GIVEN is readable without being listed. The session template
cannot be listed (its `state` is any commit), so the bootstrap gives the concrete URI. Unverified until the re-run:
that `ReadMcpResourceTool` accepts a URI its listing did not show (stop-and-return if not).

**The Resource.**
- **URI template** `wingfoil://session/{role}/{element}/{state}`; concrete form
  `wingfoil://session/developer/task:task-236-…/<40-hex sha>`. `{element}` is the Prompt's `element` argument and the
  run record's `element`, `<type>:<id>` (`spec-008` §7), one segment: `:` is a legal path character (RFC 3986
  `pchar`), the SDK's simple-variable pattern is `([^/,]+)` (`node_modules/@modelcontextprotocol/sdk/dist/cjs/shared/uriTemplate.js:187`)
  and no `spec-009` id holds `/` or `,`. Each variable is percent-decoded before it is validated (a client may send
  `task%3Atask-…`). Authority `session`: the sibling of the `{role}-session` Prompt, not an agent-run Resource, so
  not `dl-040`'s `wingfoil://agent/…` question (`dl-040` is `in-discussion`; decision D-F).
- **Content**: one entry `{ uri: <the requested URI>, mimeType: 'text/markdown', text }` whose `text` is BYTE-EQUAL to
  the `{role}-session` Prompt's message text for the same `(role, element, state)`, i.e. `assembleExecutionContext`'s
  §7 payload; the same diagnostics ride as top-level `warnings` (spec-004 §2.2, as every Resource). One builder for
  both: `buildContextPrompt` (`src/mcp/prompt.ts:143`) is split into a shared `sessionContext(root, role, element,
  state) → { text, warnings }` that the Prompt wraps in `messages` and the Resource in `contents`.
- **Refusals**: spec-004 §3.4's, same messages and order, `-32602` for the request ones (malformed element-ref,
  malformed revision, revision naming no commit, element not at the sha with `W_MEMORY_UNREADABLE` details) and a
  failed read for the repository ones (archived subject, newer `format:`, missing pillar file). The role is a URI
  variable, not a registered name: a role outside the start-time set (§3.1) is `-32602` `no session context for
  undefined role '<R>'` (decision D-G), checked first.
- **Read-only (REQ-SEC-05)**: a Resource; the handler calls `refuseIfWriteIntent(extra._meta)` first, as every bespoke
  Resource does (`grep -n refuseIfWriteIntent src/mcp/*.ts`); `tools/list` stays empty; nothing is written.
- **Determinism (REQ-SYS-07)**: `state` is resolved once and everything is read at that sha, as the Prompt does; a
  later commit or an uncommitted edit does not change the bytes.
- **Code**: new `src/mcp/session-resource.ts` (`SESSION_CONTEXT_URI_TEMPLATE`, `registerSessionContextResource(server,
  { resolveRoot, roles })`), registered in `createMcpServer` (`src/mcp/server.ts:90-98`) beside the Prompts, exported
  from `src/mcp/index.ts`; the shared builder in `src/mcp/prompt.ts`.

**The bootstrap** (`src/agent/execute.ts:133`, spec-016 §2.4's `{context_instruction}` literal): names the Resource
only — `Read the MCP resource "wingfoil://session/{role}/{type}:{id}/{state_ref}".` — the Prompt stays served,
unchanged, for clients that let the model get Prompts, but is not offered as an alternative: two instructions would
let the model choose, and the bootstrap is part of the I component (`dl-131`) (decision D-E). The rest of §2.4 is
unchanged.

**AC 3's text** is amended in the task in green (recorded here, as task-277/280 did): "The session-context fetch check
passes: the launched agent reads the session Resource the bootstrap names (ruling (a), 2026-10-13)…", the rest as is.

**Per new behaviour — what the qa agent pins** (all red-first; the production server `createMcpServer` over the SDK's
`InMemoryTransport` with a real `Client`, fixtures as in `test/mcp/role-prompt-context.test.ts`: its `MEMORY_YAML` /
DNA / roles fixtures, `makeTempGitRepo`, `commitAll`, `writeFixtureFile`, `git`):
- **S1 surface** (new `test/mcp/session-context-resource.test.ts`): `listResourceTemplates()` contains
  `wingfoil://session/{role}/{element}/{state}`; `listResources()` does NOT contain any `wingfoil://session/` URI (so
  `check:mcp`'s "every listed static Resource answers a read" is unaffected); `listTools()` → `[]`.
- **S2 content** (same file): `readResource({ uri })` for `(developer, task:task-001-a, <sha>)` → exactly one
  `contents` entry, `uri` = the requested URI, `mimeType` `text/markdown`, `text` byte-equal to (i)
  `assembleExecutionContext(root, { role, element, stateRef: sha }).value.payload` and (ii) `getPrompt({ name:
  'developer-session', arguments: { element, state } })`'s message text; the same after a later commit and with an
  uncommitted edit of the element; a percent-encoded element (`task%3Atask-001-a`) gives the same text; `warnings`
  equal the Prompt's for a fixture with a bound-but-missing directive.
- **S3 refusals** (same file): `McpError` with `code === ErrorCode.InvalidParams` and the exact spec-004 §3.4 messages
  for a malformed element-ref (`notaref`), a malformed revision (`..x`), a revision naming no commit, an element absent
  at the sha; `no session context for undefined role 'ghost'`; a write intent in `_meta` (`wingfoil/write-intent`) is
  refused with the write-refusal message, before any read.
- **S4 bootstrap** (`test/agent/execute.test.ts`, `test/agent/fake-agent.test.ts`,
  `test/cli/agent-execute.integration.test.ts`, `test/cli/agent-execute-launch.integration.test.ts`): the
  `{context_instruction}` line becomes `Read the MCP resource "wingfoil://session/<role>/<type>:<id>/<sha>".`
  everywhere the old literal is pinned (`grep -rln "Get the MCP prompt" test` → those four files and the fixture).
- **S5 fake agent** (fixture `test/fixtures/agents/fake-agent.cjs`, test code, qa's): its `CONTEXT_INSTRUCTION_RE`
  and `fetchPrompt` become a match of the new literal and a `resources/read` of that URI (the record keeps the text
  verbatim; "names no MCP prompt" → "names no MCP resource"), so every launch test that fetches context (`execute`,
  the two CLI integrations, `fake-agent.test.ts`) asserts the Resource's text. task-243's smoke uses this fake and
  merges after this task.
- **S6 spec parity** (no new test): `test/docs/mcp-surface-parity.test.ts` compares spec-004 §2.1's URI block with
  the registered templates; once green registers the template it passes only with the spec-004 amendment below in
  the working tree (pending amendments are gated with them in the tree).

**Files I expect to touch in green**: `src/mcp/session-resource.ts` (new), `src/mcp/prompt.ts` (the shared builder),
`src/mcp/server.ts`, `src/mcp/index.ts`, `src/agent/execute.ts` (the literal); this task's AC 3 text; docs:
`docs/user-guide.md` (the MCP table and the `<role>-session` paragraph), `docs/agents.md` §5 (the MCP ↔ CLI table:
the Resource's CLI equivalent is `agent execute --dry-run`'s context… none exact: "*(no CLI equivalent)*" row
naming the Prompt), `docs/cli-reference.md` (`agent execute`: "tells it where to load its context (the
`<role>-session` prompt …)" → the session Resource). Not `command-baseline.md`: its HEAD table lists Resources read at
`HEAD`; this one reads at `state`, like the Prompt, which that table does not list either.

**Pending amendments** (uncommitted; revised in green):
- `spec-016-agent-execution` — §2.4 `{context_instruction}` literal and its paragraph (a Resource, R5's exception);
  §2.8 (the check is that the model reads the session Resource; the `claude-code` row); Q7 and §7's MCP-surface bullet
  (the session Resource is v0.3, every other agent Tool/Resource stays v0.4); the Revision note no longer says the row
  was "checked by hand" until the re-run passes. Proposed `--reason`: "task-236: approver ruling (a) of 2026-10-13
  after the by-hand pass found that Claude Code 2.1.296 gives the model no way to get an MCP Prompt: the execution
  context is also served as the read-only Resource wingfoil://session/{role}/{element}/{state}, byte-equal to the
  Prompt, and section 2.4's context instruction names that Resource; Q7 and section 7 keep every other agent Tool and
  Resource at v0.4. Section 2.8 records the claude-code row from claude --help of 2.1.296 and what the by-hand pass
  established."
- `spec-004-mcp-surface-contract` — §2.1 gains the template line and its paragraph (content = the Prompt's for the
  same arguments, the full URI given by the bootstrap since templates are not listed); §2.2/§3.4 the refusals and the
  undefined-role message; a Revision note. Proposed `--reason`: "task-236: section 2.1 gains the session Resource
  wingfoil://session/{role}/{element}/{state} (ruling (a), 2026-10-13), which serves the role-session Prompt's
  execution context byte for byte to clients whose model can read Resources but not get Prompts; its refusals are
  section 3.4's, plus one for a role outside the start-time set."

**Re-run plan (after green, by the approver; ruling D2).** The runbook above is updated in green: run id
`…/adhoc/2`; R2's observation becomes "does the agent call `ReadMcpResourceTool` on the URI the bootstrap names, with
no user help, and get the element's context"; the discriminator for which server answered is that read itself
(0.2.2 has no `wingfoil://session/` template: a "Resource … not found" error means `.mcp.json`'s server won). Answer the
`.mcp.json` dialog "Use this MCP server" this time, so precedence with both enabled is observed (decision D-H; undo
afterwards with `claude mcp reset-project-choices` from the worktree). As soon as the read's result shows, press Esc
and type the stop line (the session ran in auto mode last time and acted unasked). Same stop-and-return rules, plus:
`ReadMcpResourceTool` refusing an unlisted URI → stop and return.

**Decisions for the approver.**
- D-E bootstrap names the Resource only (recommended), or Resource first with the Prompt as an alternative.
- D-F URI `wingfoil://session/{role}/{element}/{state}` (recommended) — or under `dl-040`'s pending `wingfoil://agent/…`.
- D-G undefined-role message `no session context for undefined role '<R>'` (new spec-004 §3.4 row).
- D-H the re-run answers the `.mcp.json` dialog "Use this MCP server", to test precedence with both servers enabled.

### red 2 (qa, 2026-10-14) — session Resource

- **Red commit `508f26ea`** (T4 for these files is measured from it; the first red `ad0d8c8d` is unchanged, the
  addendum touches none of its files). Files: NEW `test/mcp/session-context-resource.test.ts`;
  `test/agent/execute.test.ts`, `test/agent/fake-agent.test.ts`, `test/cli/agent-execute.integration.test.ts`,
  `test/cli/agent-execute-launch.integration.test.ts` (S4 literal); the fixture `test/fixtures/agents/fake-agent.cjs`
  (S5, red's: the developer does not edit it). The uncommitted spec-016 amendment in the worktree was left unstaged.
- **S1 surface** (new file): `resources/templates/list declares wingfoil://session/{role}/{element}/{state}` fails
  `Expected value: "wingfoil://session/{role}/{element}/{state}"` / `Received array: ["wingfoil://memory/{type}", …]`.
  `resources/list names no wingfoil://session/ URI` and `tools/list stays empty` pass on first run (guards, as
  characterization: green must keep them).
- **S2 content** (new file, 6 tests: byte-equal to the builder payload and the Prompt text; the reviewer URI; pinned at
  state after a later commit + uncommitted edit; `task%3A…` reads the same; no `warnings` when none; `warnings` equal to
  the Prompt's for a bound directive with no file): all fail on the server's answer `MCP error -32602: Resource
  wingfoil://session/developer/task:task-001-active/<sha> not found` (the SDK's no-match refusal: nothing registers the
  template).
- **S3 refusals** (new file, 6 tests): malformed element-ref `notaref`, malformed revision `..x`, a revision naming no
  commit, an element absent at the sha, role `ghost` (D-G), each `toBe` the exact `MCP error -32602: <spec-004 §3.4
  message>`; received `… Resource wingfoil://session/… not found`. Write intent in `_meta` on a URI naming an absent
  element: `Expected substring: "resources are read-only"`, received the not-found message (so "before any read" is
  pinned by the absent element). Note for green: the client sees one `MCP error -32602:` prefix only when the handler
  throws a plain `Error` with a `code`, as `src/mcp/prompt.ts:79-87` does; an `McpError` would arrive with two.
- **S4 bootstrap**: `renderBootstrap (§2.4) … is the fixed template` (execute.test.ts), `task-218 AC 5 — the bootstrap
  bytes` ×2 (agent-execute.integration), `the fake receives exactly the argv its manifest renders` and `--agent selects
  another entry` (agent-execute-launch) fail on the diff line `- … Read the MCP resource
  "wingfoil://session/developer/task:…/<sha>".` / `+ … Get the MCP prompt "developer-session" with arguments …`.
- **S5 fake agent**: the fixture now matches `Read the MCP resource "(wingfoil://session/[^"]+)".` and sends
  `resources/read { uri }`, recording `{ server, resource: { uri }, text, warnings? }` (was `prompt: { name, arguments }`);
  failure text "the bootstrap names no MCP resource to read (spec-016 §2.4)". In fake-agent.test.ts: `AC 2 … completes
  initialize and the resources/read …` fails `Received: {"code": -32602, "message": "MCP error -32602: Resource
  wingfoil://session/… not found"}` at `mcp?.error toBeUndefined`; `records the server's refusal …` now pins the exact
  `element 'task:task-999-absent' not found at <sha>` and fails on the SDK's not-found message. The "names no MCP
  resource" tests and F2 (the split-chunk stub now answers `resources/read`) pass on first run: they exercise only the
  fixture.
- **S6**: no test, as designed.
- **Run:** `npx jest test/mcp/session-context-resource.test.ts test/agent/fake-agent.test.ts test/agent/execute.test.ts
  test/cli/agent-execute.integration.test.ts test/cli/agent-execute-launch.integration.test.ts --maxWorkers=2` → 20
  failed, 122 passed, 142 total (session-context-resource 13 failed / 2 passed; fake-agent 2 / 52; execute 1 / 26;
  agent-execute.integration 2 / 29; agent-execute-launch 2 / 13). `npx eslint` on the six files and `npx tsc --noEmit -p
  tsconfig.json` filtered to them: no output.
- **Not pinned:** the repository refusals as failed reads (archived subject, newer `format:`), which the addendum's
  Resource section lists but its qa row S3 does not; the `mcpPreflight` stubs in `execute.test.ts` still answer
  `prompts/get` (the addendum does not change the pre-flight). Contrary to the design's S5 sentence, no CLI
  integration test sets `WINGFOIL_FAKE_AGENT_CONNECT` (`grep -rn FAKE_AGENT_CONNECT test --include=*.ts` → only
  fake-agent.test.ts), so they pin the literal (S4) but not the Resource's text.
- **Send-back (2026-10-14, developer, green at `3807dc7c`):** red 2 pinned the fake's recorded refusal with the client
  prefix (`MCP error -32602: element … not found at <sha>`), but the fake records the raw JSON-RPC wire message, which
  no SDK Client prefixes; it contradicted S3's one-prefix pin. Fixed by the qa agent in `f2e3318f`: `records the
  server's refusal …` expects `element 'task:task-999-absent' not found at <sha>` exactly, code still -32602; nothing
  else changed. `npx jest test/agent/fake-agent.test.ts --maxWorkers=2` → 54 passed, 54 total.

### green 2 (developer, 2026-10-14) — the session Resource

- Read `### red 2 (qa)` (`508f26ea`) and its send-back (`f2e3318f`, notes `9ce38be6`). Approver rulings D-E…D-H
  (2026-10-14, w3-b7-notes) as in the addendum.
- `3807dc7c` `feat(mcp): …`:
  - `src/mcp/prompt.ts`: `buildContextPrompt` split into the exported `buildSessionContext(root, role, element,
    state) → { text, warnings }`, which the Prompt wraps in `messages`; `promptRequestError` exported (a plain
    `Error` with `code` -32602, so a client sees one `MCP error -32602:` prefix).
  - `src/mcp/session-resource.ts` (new): `SESSION_CONTEXT_URI_TEMPLATE`, `registerSessionContextResource`:
    a template with `{ list: undefined }`; refusal order write intent → undefined role (D-G) → element-ref →
    the builder's; variables percent-decoded (left as sent when undecodable). Registered in `createMcpServer`,
    exported from `src/mcp/index.ts`.
  - `src/agent/execute.ts`: the bootstrap's context instruction is `Read the MCP resource
    "wingfoil://session/<role>/<type>:<id>/<sha>".` (D-E); `mcpPreflight` gets the Prompt, then reads that
    Resource, under the one deadline. **Why both, Prompt first** (coordinator accepted, w3-b7-notes): red's stubs
    in `execute.test.ts` answer only `prompts/get` and pin the Prompt's cause text, so a Resource-only pre-flight
    would need a red edit (T4); reading the Resource as well checks what the agent will use. Cost: a second context
    assembly inside REQ-PERF-01's 30 s — `test/agent/agent-execute-latency.test.ts` (p95 over its runs, to the
    spawn) passed in both full runs below, at load ≈ 20.
- First targeted run: 175 / 176; the one failure was red 2's wire-message assertion (`fake-agent.test.ts:320`, the
  fake records the raw JSON-RPC message, which carries no client prefix), sent back and fixed by the qa agent in
  `f2e3318f`.
- `fabdd63e` `docs: …`: `docs/user-guide.md` (MCP table row and the `<role>-session` paragraph),
  `docs/agents.md` §5 (MCP ↔ CLI row), `docs/cli-reference.md` (`agent execute`: the first prompt names the
  Resource). AC 3's text is amended in this file (approver ruling (a)): "The session-context fetch check passes:
  the launched agent reads, with no user help, the session Resource … the bootstrap names".
- `fc1a585b` `test(mcp): …` (my tests, red touched neither file): `test/mcp/session-context-resource-encoding.test.ts`
  (the barrel exports; an undecodable `task%E0%A4` element refused as a malformed element-ref) and
  `test/agent/mcp-preflight-resource.test.ts` (a server answering the Prompt but not the Resource — no contents, a
  blob, empty text — is MCP_UNREACHABLE naming the Resource; with text, the pre-flight passes). `decoded()` lost its
  unreachable array branch (no exploded variable).
- **red 2 → green:** `npx jest test/mcp/session-context-resource.test.ts test/agent/fake-agent.test.ts
  test/agent/execute.test.ts test/cli/agent-execute.integration.test.ts test/cli/agent-execute-launch.integration.test.ts
  --maxWorkers=2` in the full runs below: all pass (red 2 had 20 failed / 122 passed).

### refactor 2 (developer, 2026-10-14)

Heavy gates under `waitslot.sh`, `--maxWorkers=2`, with both spec amendments in the working tree:
- `npm run test:coverage -- --maxWorkers=2` at `fc1a585b` → 413 suites, **7451 passed, 7451 total**; coverage
  **99.32 / 97.22 / 97.99 / 99.71** against the B6 baseline 99.32 / 97.23 / 97.98 / 99.71: branches −0.01, the
  run-dependent rule — `memory-transition.ts` uncovered `468,560` in this run (only `468` in the previous one, at
  `915baaa0`), a file this task does not touch. `session-resource.ts` 100 / 100 / 100 / 100. The run before
  `fc1a585b` gave 99.31 / 97.19 / 97.94 / 99.70 (the barrel's two new re-exports uncovered, the array branch): fixed
  by `fc1a585b`.
- `npm run typecheck` → exit 0; `npm run lint` → exit 0; `npm run docs:api` → exit 0.
- `node scripts/check-governance.cjs --base db0e2752` → `gated: 0 findings`, `history: 0 findings`.
- `test/docs/mcp-surface-parity.test.ts` passes with the spec-004 §2.1 amendment in the tree (S6).
- **T4, red 1:** `git log --first-parent --no-merges --format=%h ad0d8c8d..HEAD --
  test/storage/builtin-adapter-claude-code.test.ts test/core/init-builtin-adapters.test.ts` → empty.
  **T4, red 2:** `git log --first-parent --no-merges --format=%h 508f26ea..HEAD -- test/mcp/session-context-resource.test.ts
  test/agent/execute.test.ts test/agent/fake-agent.test.ts test/cli/agent-execute.integration.test.ts
  test/cli/agent-execute-launch.integration.test.ts test/fixtures/agents/fake-agent.cjs` → `f2e3318f`, the qa
  agent's send-back.

### self-review 2 (developer, 2026-10-14)

- S1–S5 met (the red 2 tests pass, above); S6 met with the spec-004 amendment.
- AC 1, the BDD handover and AC 4's static half: still met (the full run).
- AC 2, AC 3 (amended), AC 4's by-hand half: **open** until runbook 2 is run; the task is not submitted.
- Same-class sweep for the old literal: `grep -rn "Get the MCP prompt" src docs/cli-reference.md docs/user-guide.md
  docs/agents.md` → nothing (positive case: before `3807dc7c` it hit `src/agent/execute.ts:133`); the same grep on the amended
  spec-016 → nothing (Q2 records the Prompt as the earlier choice in prose).

### Pending amendments 2 (approver) — uncommitted in the worktree; they replace the first draft above

- `spec-016-agent-execution`: §2.4 (the instruction names the session Resource; the literal), §2.7 (the fake reads
  it), §2.8 (the check is that the model reads it), §3.3 step 11 (the pre-flight reads it after the Prompt), Q2 (the
  revisit), Q7 (the one exception to R5), the `claude-code` row, and a dated Revision note that does not say the
  row was checked by hand (added after the re-run passes). Proposed `--reason`: "task-236: approver ruling (a) of
  2026-10-13 after the by-hand pass found that Claude Code 2.1.296 gives the model no way to get an MCP Prompt: the
  execution context is also served as the read-only Resource wingfoil://session/{role}/{element}/{state}, byte-equal
  to the Prompt, and section 2.4's context instruction names that Resource alone; the pre-flight of section 3.3 reads
  it, Q2 records the revisit and Q7 the one exception to R5. Section 2.8 fills the claude-code row from claude --help
  of 2.1.296 (Claude Code)."
- `spec-004-mcp-surface-contract`: §2.1 gains the template line and its paragraph; §3.4 gains the undefined-role row;
  a dated Revision note. Proposed `--reason`: "task-236: section 2.1 gains the session Resource
  wingfoil://session/{role}/{element}/{state} (ruling (a), 2026-10-13), which serves the role-session Prompt's
  execution context byte for byte to clients whose model can read Resources but not get Prompts; section 3.4 gains
  its refusal for a role outside the start-time set."

### by-hand runbook 2 (for the approver)

The re-run after ruling (a): the bootstrap now names the session Resource. Run in a real terminal from the worktree
root, by the approver (ruling D2). Paste the whole transcript back. The previous run is `…/adhoc/1`; this one is
`…/adhoc/2`.

**R0 — setup and versions** (copy-paste):

```bash
cd /home/robypomper/Workspaces/.wf2-wt/task-236
git branch --show-current          # task/task-236-ship-verify-hand-builtin-claude-code-adapter-point
git status --short                 # only the two pending spec amendments (spec-004, spec-016)
npm run -s build
claude --version                   # expect: 2.1.296 (Claude Code)
node dist/cli.js --version
git rev-parse HEAD                 # the state_ref the run will pin
export EL=task:task-236-ship-verify-hand-builtin-claude-code-adapter-point
```

Record the three versions and the HEAD sha. If `claude --version` is not `2.1.296 (Claude Code)`, stop and report.
If Claude Code's login has expired, run `claude` once on its own, `/login`, `/exit`, before R2, so the session in R2
needs no help before its first turn.

**R1 — dry run** (launches nothing):

```bash
node dist/cli.js agent execute --element "$EL" --role developer --dry-run
```

Record: exit `0`; `run.id` `task-236-…/adhoc/2`; `run.state_ref` = R0's HEAD; the bootstrap's third line ends
`Load it before any other action: Read the MCP resource "wingfoil://session/developer/task:task-236-…/<R0 HEAD>".`
Any `error:` line → stop and report.

**R2 — the real run**:

```bash
node dist/cli.js agent execute --element "$EL" --role developer
```

1. Record the `run …/adhoc/2: launching Claude (built-in/claude-code) as developer on task:…` line.
2. The `.mcp.json` dialog ("New MCP server found in this project: wingfoil"): answer **"Use this MCP server"**
   (ruling D-H), so both `wingfoil` servers are enabled and precedence is observed. Record any other dialog and
   its answer.
3. Type nothing. Watch the agent's first action:
   - Does it call `ReadMcpResourceTool` (shown as a read of an MCP resource from server `wingfoil`) on exactly the
     URI the bootstrap names, without you typing anything? Record the call as shown.
   - Does the result carry the element's execution context (the task's title and ACs, the developer directives)?
   - **As soon as the read's result is on screen, press Esc** to interrupt, then type
     `Stop here: make no edits and no commits.` (last time the session ran in auto mode and acted unasked).
   - If a permission prompt appears for the read, record it and your answer (approving a permission is not
     user help; typing the URI or the instruction is).

**R3 — inside the session**:

```
/mcp
/status
```

Record from `/mcp` every server named `wingfoil`, its command/args and status; from `/status` the Session ID and the
model. Then `/exit`.

**R4 — after Claude exits** (copy-paste):

```bash
git log -1 --format='%H%n%s%n%b'                       # agent: record task-236-…/adhoc/2, WingFoil-Version: trailer only
git show --stat --format= HEAD                          # only docs/06_runs/task-236-ship-verify-hand-builtin-claude-code-adapter-point.jsonl
tail -1 docs/06_runs/task-236-ship-verify-hand-builtin-claude-code-adapter-point.jsonl
SID=$(tail -1 docs/06_runs/task-236-ship-verify-hand-builtin-claude-code-adapter-point.jsonl | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).session')
echo "$SID"
ls ~/.claude/projects/*/"$SID".jsonl                   # the assigned id is Claude's own session id
git status --short                                      # still only the two spec amendments
node dist/cli.js agent list --past
claude mcp reset-project-choices                        # undo R2's "Use this MCP server" (ruling D-H)
```

Record: the `run …: agent exited <status> after <s> s (recorded in <sha7>)` line, the record commit sha, the record
line (`agent_version` `2.1.296 (Claude Code)`, `session` = R3's Session ID, `model` and every `tokens` count
`not-reported`, `adapter` `built-in/claude-code`), whether `ls` finds the session file, and the reset's output.

**Stop-and-return (AC 3, spec-016 §2.8; R17 is not narrowed silently).** Stop where it shows, paste the
transcript; the choice returns to the approver if:
- R2: the agent does not read the session Resource the bootstrap names without you typing the URI or the
  instruction, or the read's result is not the element's context;
- R2: `ReadMcpResourceTool` refuses the URI because the listing does not show it (the template is never listed);
- R2: the read fails with a "Resource … not found" error: that is the pinned 0.2.2 server's answer (it has no
  `wingfoil://session/` template), i.e. `.mcp.json`'s server won over the adapter's. The in-task remedy is
  `--strict-mcp-config` in the manifest (ruling D-A), only on the approver's OK, then R0–R4 again;
- R3: the adapter's `wingfoil` server is not connected;
- R2: Claude rejects the argv — a manifest fix in this task, then R0–R4 again.

### by-hand R2 (runbook 2) — observed from inside the launched agent (developer, run `task-236-…/adhoc/2`, 2026-10-14)

Written by the agent that `agent execute --element task:task-236-… --role developer` launched at `state`
`7a04ad3303987aeb63a92bfaa1d07fa3b2f0383c` (`git rev-parse HEAD` in the session = the bootstrap's state). It covers
R2 and the server half of R3, seen from inside. R0, R1, R4 and the dialogs before the session belong to the approver's
transcript, not to this entry.

- **Launch argv accepted.** `ps -eo pid,ppid,lstart,args` → pid `2902530`, started `mer ott 14 09:08:13 2026`,
  args `claude WingFoil run task-236-…/adhoc/2: act as role "developer" … --mcp-config
  /tmp/wingfoil-run-LxznSx/mcp-config.json --session-id b0fc53be-b276-5117-95e6-2e983cf4e5e9`. Its parent is
  `2900838` = `node dist/cli.js agent execute --element task:task-236-… --role developer`. The bootstrap arrived as
  the first user message verbatim. `claude --version` → `2.1.296 (Claude Code)` = `verified_with`.
- **Session-context fetch check (AC 3 as amended, spec-016 §2.8): PASSES.** My first action, with nothing typed by
  the user, was `ReadMcpResourceTool` with server `wingfoil` and exactly the URI the bootstrap names
  (`wingfoil://session/developer/task:task-236-…/7a04ad33…`). Before it I made one `ToolSearch` call to load that
  tool's schema, because Claude Code 2.1.296 defers MCP tools. The URI was not refused for being absent from the
  listing. The result is the element's context, not a role header: 436204 bytes (`wc -c` on the saved tool result).
  Its header is `<!-- format: 1 | role: developer | element: task:task-236-… | state: 7a04ad33… -->`. The sections
  are `## 1. Task` (the frontmatter and the body, Acceptance Criteria included), `## 2. Project DNA`,
  `## 3. Directives (developer + global)` and `## 4. Relevant Memory`. No permission prompt was raised for the read
  as far as the agent can see. The approver's screen settles that.
- **§2.5 / R3: the adapter's server is the one that answered.** `ps -eo pid,ppid,args | awk '$2==2902530'` lists
  exactly one `wingfoil` MCP child of the session: pid `2903704`, `/usr/local/bin/node
  /home/robypomper/Workspaces/.wf2-wt/task-236/dist/cli.js mcp`. No `node_modules/wingfoil-released/dist/cli.js mcp`
  process has `2902530` as its parent. The older `wingfoil-released` processes have other parents (`8512`,
  `565439`, `2476545`), which are other sessions. The served URI scheme is exclusive to the build under test:
  `grep -rln "wingfoil://session/" node_modules/wingfoil-released/dist` → nothing, and
  `grep -ln "wingfoil://session/" dist/mcp/*.js` → `dist/mcp/index.js`, `dist/mcp/session-resource.js`. A
  "Resource … not found" answer (the pinned server's) did not occur. Why `.mcp.json`'s server has no child process
  here, whether it was not approved or was shadowed by the same name, depends on the dialog answer, which is the
  approver's to record from R2 step 2 and `/mcp`.
- **Session id.** `--session-id b0fc53be-b276-5117-95e6-2e983cf4e5e9` in the argv. `ls
  ~/.claude/projects/*/b0fc53be-b276-5117-95e6-2e983cf4e5e9.jsonl` finds the file under
  `-home-robypomper-Workspaces--wf2-wt-task-236/`, so the assigned id is Claude's own session id (R4 compares it
  with the record line and `/status`).
- **Not done by this agent.** Per runbook 2, I did no developer work beyond this note: no edits to code, specs or
  config, and no other commits. The two pending spec amendments in the worktree are left untouched for the
  approver. Their Revision notes may now say the row was checked by hand only after R3/R4 also pass. Still open,
  and the approver's: `/mcp` and `/status` (R3), the `agent: record` commit and record line (R4), and
  `claude mcp reset-project-choices`.

### by-hand runbook 2 — approver's transcript (2026-10-14)

> **Correction (developer, 2026-10-14, after the independent review), approver's statement:** in run `…/adhoc/1` the approver answered the `.mcp.json`
> dialog "Use this MCP server" (the pasted transcript showed only the menu). So in both runs the two same-named `wingfoil`
> servers were enabled, and the adapter's `--mcp-config` server (`…/task-236/dist/cli.js mcp`) was the only `wingfoil`
> MCP child and served the session: `.mcp.json`'s pinned server was shadowed, not spawned. `/mcp`'s `Config location:
> …/.mcp.json` is Claude Code's display only. R4's `claude mcp reset-project-choices` (run 2) cleared that pass-1 choice.
> The agent-written sections (`55cf766a`, `5b7af1be`), which leave the dialog answer open, are left as written.

Run by the approver in a real terminal from this worktree (transcript `devloop-kit/task-236-runbook-2-transcript.md`,
with the coordinator's observations); the launched agent's own note is `5b7af1be`, the record `94377e43`.
- **R0:** `claude --version` → `2.1.296 (Claude Code)`; `node dist/cli.js --version` → `0.2.2 (7a04ad33…)`; HEAD
  `7a04ad3303987aeb63a92bfaa1d07fa3b2f0383c`; `git status --short` → only the spec-004 and spec-016 amendments.
- **R1:** dry run exit 0; run `task-236-…/adhoc/2`, `adapter` `built-in/claude-code`, `state_ref` = R0's HEAD; the
  bootstrap names `wingfoil://session/developer/task:task-236-…/7a04ad33…`.
- **R2 — AC 3 (amended) passes.** With nothing typed, the agent's first action, after one `ToolSearch` that loads the
  deferred MCP tool's schema, was `readMcpResource(Read resource "wingfoil://session/developer/task:task-236-…/7a04ad33…"
  from server "wingfoil")`: exactly the bootstrap's URI, not refused for being unlisted, no permission prompt, and the
  answer was the element's context (the task with its ACs, DNA, the developer and global directives, the relevant
  Memory). The only `wingfoil` MCP child of the session was `…/task-236/dist/cli.js mcp` (`5b7af1be`). The agent then
  ran shell commands and committed its observation note (`5b7af1be`) before the stop line reached it: the Esc step
  of the runbook did not stop it in time, as in run `…/adhoc/1`.
- **D-H observed (corrected 2026-10-14).** No `.mcp.json` dialog appeared because the approver's run-1 answer, "Use
  this MCP server", was stored: both same-named `wingfoil` servers were enabled. The adapter's `--mcp-config` server was
  the only `wingfoil` child and served the session Resource; `.mcp.json`'s pinned server was shadowed, not spawned.
  That is §2.5's outcome. (This item first read "D-H not observed … untested", from a transcript that showed only the
  dialog's menu.) R4's `claude mcp reset-project-choices` cleared the run-1 choice.
- **R3:** `/mcp` → `Wingfoil MCP Server`, `⚠ connected · no tools`, `Capabilities: resources · prompts`, `Config
  location: …/task-236/.mcp.json` (Claude Code's display, as in `…/adhoc/1`); `/status` → `Version: 2.1.296`, Session
  ID `b0fc53be-b276-5117-95e6-2e983cf4e5e9`, model `opus[1m] (claude-opus-5-5[1m])`. `/exit` → `run …/adhoc/2: agent
  exited 0 after 254.9 s (recorded in 94377e4)`.
- **R4:** `94377e43` `agent: record task-236-…/adhoc/2`, `WingFoil-Version:` trailer only, the run log alone. Record:
  `session` `b0fc53be-…` = `/status`; `model` and every `tokens` count `not-reported`; `adapter`
  `built-in/claude-code`; `exit_status` 0. The session file `~/.claude/projects/-home-robypomper-Workspaces--wf2-wt-task-236/b0fc53be-….jsonl`
  exists. `git status --short` → only the two amendments. `agent list --past` → 2 runs. `claude mcp
  reset-project-choices` → reset.
- **Version drift.** Claude Code updated itself during the session: `readlink -f $(which claude)` →
  `~/.local/share/claude/versions/2.1.299` afterwards. R0, `/status` and the agent's own `claude --version` said
  `2.1.296`; the record's `agent_version`, read after the run (spec-016 §3.3 step 16), says `2.1.299 (Claude Code)`.
  `verified_with` stays `2.1.296`, the version the check was made with; the drift is stated in spec-016's Revision
  note (the coordinator filed the follow-up: read the version before the launch).
- **Spec-016 amendment completed** (uncommitted): the Revision note now says the row was checked by hand on 2026-10-14
  with 2.1.296, states §2.5's outcome as above and the drift.
- **ACs:** AC 1 met (tests); AC 2 met (this transcript and the first pass's above: the commands, the CLI version, the
  record lines, the record commits `a19338c5`, `94377e43`; every flag backed by the help lines in the design); AC 3
  (amended) met (R2 above); AC 4 met (`498a33ba`, `11569e02`; `agent execute --element task:task-236-… --role
  developer` run twice on this repository).

### Pending amendments (approver) — final, uncommitted in the worktree

- `spec-016-agent-execution` — proposed `--reason`: "task-236: approver ruling (a) of 2026-10-13 after the by-hand
  pass found that Claude Code 2.1.296 gives the model no way to get an MCP Prompt: the execution context is also
  served as the read-only Resource wingfoil://session/{role}/{element}/{state}, byte-equal to the Prompt, and section
  2.4's context instruction names that Resource alone; the pre-flight of section 3.3 reads it, Q2 records the revisit
  and Q7 the one exception to R5. Section 2.8 fills the claude-code row from claude --help of 2.1.296 (Claude Code),
  its launch, MCP and session-id declarations checked by hand on 2026-10-14 with 2.1.296 and resume from --help only;
  the revision note records section 2.5's outcome, both same-named servers enabled and the adapter's --mcp-config
  server used with the project's .mcp.json one shadowed, and that Claude Code updated itself to 2.1.299 during the
  checked session."
- `spec-004-mcp-surface-contract` — proposed `--reason` as in "Pending amendments 2" above, unchanged.

### Retrospective

- **What the task was sized for and what it became.** M: a manifest from `--help` and a by-hand pass. The pass found
  that the context primitive R18 chose (a Prompt) cannot be reached by Claude Code's model; ruling (a) made the task
  L (a new MCP Resource, two spec amendments). spec-016 §2.8 had named this exact risk ("Nothing in this repository
  establishes this capability for any agent CLI"); a cheap probe of how a real client exposes Prompts to its model,
  at planning time, would have moved the decision before the build.
- **A transcript must carry the answers, not only the menus.** Run 1's pasted transcript showed the `.mcp.json`
  dialog's menu but not the choice, and I read the menu's highlighted line as the answer; the outcome of D-H was then
  stated backwards in these notes and the spec draft until the approver corrected it. A runbook step that asks for a
  dialog answer should ask for it in words. Separately, the agent ran in auto mode and acted before Esc could stop
  it, twice: a by-hand launch should use an element where acting unasked is harmless.
- **The agent CLI is not pinned by the manifest.** Claude Code updated itself mid-session; `verified_with` records
  what was checked, not what runs. Reading `agent_version` before the launch (follow-up filed) would make the
  record name what actually started.
- **The red split worked.** The one wrong red assertion (red 2's wire message, which could not hold together with
  its own S3 tests) was found by the first green run and fixed by the qa agent in one commit (`f2e3318f`), T4 intact.

### independent review (2026-10-14) and fixes (developer)

Verdict APPROVE WITH FIXES (code, manifest and tests hold; full run 7451/7451 reconfirmed by the reviewer). Text-only
fixes, task stays `in-review`:
- **F1** (D-H stated backwards; approver's correction): run 1's dialog answer was "Use this MCP server", so both runs had
  both same-named servers enabled and the adapter's `--mcp-config` server won, `.mcp.json`'s shadowed. Corrected by
  dated notes in my own sections (design addendum, runbook 2 transcript), the transcript summary's D-H item, the final
  spec-016 `--reason`, and the Retrospective's lesson; the agent-written sections (`55cf766a`, `5b7af1be`) are left as
  written. spec-016 (uncommitted): the Revision note states the outcome, and §2.5 gains one sentence recording it.
- **F2**: spec-016 §2.7, "performs `initialize` and reads the session Resource".
- **F3**: `docs/cli-reference.md` `wingfoil mcp` entry gains the "Also unreleased (v0.3)" paragraph for the session
  Resource template (same context and `warnings` as the Prompt, never listed, the undefined-role refusal).
  `npx jest test/docs/cli-reference.test.ts test/docs/mcp-surface-parity.test.ts --maxWorkers=2` → 7 passed;
  `npm run lint` → exit 0. **Handover to `align-user-docs`:** `README.md:112` lists the MCP surface and does not name
  the session Resource; README is that phase's (dl-013), so it is not edited here.
- **F4**: the Revision note and the §2.8 `claude-code` row now say the launch, MCP and session-id declarations were
  checked by hand on 2026-10-14 with 2.1.296 and resume is from `--help` only (`session.resume` is read from v0.4).
- **F6**: the "no output" claim at red 2's run line is the qa agent's section; left as written.
- Headings `### review (reviewer, self, …)` renamed `### self-review (developer, …)` (brief corrected 2026-10-14).
- Final spec-016 `--reason` (replaces the one in "Pending amendments (approver) — final"): "task-236: approver ruling
  (a) of 2026-10-13 after the by-hand pass found that Claude Code 2.1.296 gives the model no way to get an MCP Prompt:
  the execution context is also served as the read-only Resource wingfoil://session/{role}/{element}/{state},
  byte-equal to the Prompt, and section 2.4's context instruction names that Resource alone; the pre-flight of section
  3.3 reads it, Q2 records the revisit and Q7 the one exception to R5. Section 2.8 fills the claude-code row from
  claude --help of 2.1.296 (Claude Code), its launch, MCP and session-id declarations checked by hand on 2026-10-14
  and resume from --help only; section 2.5 and the revision note record that with both same-named servers enabled the
  adapter's --mcp-config server was used and the project's .mcp.json one shadowed, and that Claude Code updated itself
  to 2.1.299 during the checked session." spec-004's `--reason` is unchanged.
