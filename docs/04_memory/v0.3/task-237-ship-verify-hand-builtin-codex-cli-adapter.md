---
id: "task-237-ship-verify-hand-builtin-codex-cli-adapter"
type: task
title: "Ship and verify by hand the built-in `codex-cli` adapter"
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

The same procedure as task-236 for Codex CLI. This proves the adapter shape against a second vendor in the release that introduces it (North Star "different AI agents"). `grep -rniI codex --exclude-dir=node_modules --exclude-dir=.git .` finds nothing about its flags in the repository today, so every declaration comes from its own help output and documentation at the `verified_with` version.

## Acceptance Criteria

- (red-first) The manifest validates as a built-in and is installed by `init`, pinned as in task-236.
- (characterization) By-hand verification of MCP registration, the read of the session Resource `wingfoil://session/{role}/{element}/{state}` the bootstrap names (approver ruling (a), 2026-10-13, task-236: it replaced the `{role}-session` Prompt fetch), the lookups, and the record commit, recorded in Execution Notes with evidence. The same stop-and-return-to-approver rule applies.
- (characterization) An agent entry naming `adapter: codex-cli` in a scratch project runs one `agent execute` end to end. The run is recorded with `adapter: "built-in/codex-cli"`.

## Implementation Notes

- **Size:** M · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** R17; adr-012 point 2; spec-016 §2.8 (N1).
- **Features:** P5.3.1, P5.4.3.
- **Notes:** Proposal key: B15.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

### design (developer, 2026-10-14)

- **Start.** Branch `task/task-237-ship-verify-hand-builtin-codex-cli-adapter`, start commit `c9c22b10` (cut from
  `32d8871b`), task-236's approved branch merged in at `b337c5b1` (`git log --oneline -3`). No bug in `bug:`.
- **depends_on / handovers read (dl-015).** task-196 and task-228 as task-236's design summarises them (unchanged since:
  `renderLaunchArgv` appends `session.assign_args` after `launch.interactive.args`, `src/agent/launch.ts:104-109`).
  task-236's notes in full: both by-hand passes, AC 3's failure and ruling (a) (the bootstrap names ONLY the session
  Resource `wingfoil://session/{role}/{element}/{state}`, D-E/D-F), the precedence finding (adapter's server used,
  same-named project server shadowed, D-H), the mid-session auto-update (2.1.296 → 2.1.299; `agent_version` is read
  after the run, spec-016 §3.3 step 16), and the lesson "a runbook step that asks for a dialog answer asks for it in
  words". AC 2's text still names the `{role}-session` fetch: green amends it to the session Resource, as task-236
  amended its AC 3 under ruling (a).
- **Cited elements.** spec-016 `approved`, adr-012 `accepted` (`grep -m1 '^status'`). adr-012 point 2 says only
  "how the `wingfoil` MCP server is registered for that process" (`adr-012:105`), so a new registration mechanism is a
  spec-016 amendment, not a new ADR.

**Evidence: the Codex CLI at `verified_with`** (print-and-exit only, run 2026-10-14; no session started, nothing sent):
- `which codex` → `~/.npm-global/bin/codex` (→ `@openai/codex/bin/codex.js`, package `0.145.0`); `codex --version` →
  `codex-cli 0.145.0`. Two OTHER installs exist off `PATH`: `/usr/lib/node_modules/@openai/codex` (`0.46.0`) and
  `/usr/local/lib/node_modules/@openai/codex` (`0.130.0`) (`grep '"version"' <dir>/package.json`). `command: codex`
  resolves on `PATH`, so R0 records `which codex`.
- `codex --help`: `Usage: codex [OPTIONS] [PROMPT]`; `If no subcommand is specified, options will be forwarded to the
  interactive CLI.`; `[PROMPT]  Optional user prompt to start the session`; `-c, --config <key=value>  Override a
  configuration value that would otherwise be loaded from ~/.codex/config.toml. Use a dotted path (foo.bar.baz) to
  override nested values. The value portion is parsed as TOML. If it fails to parse as TOML, the raw string is used as
  a literal.`; `-V, --version  Print version`; `-p, --profile <CONFIG_PROFILE_V2>  Layer $CODEX_HOME/<name>.config.toml
  on top of the base user config`. The only variadic option is `-i, --image <FILE>...` (not used). There is **no
  `--mcp-config`, no option taking a config-file path, and no `--session-id`.**
- `codex mcp --help` / `codex mcp add --help`: `add` writes `~/.codex/config.toml` (`Usage: codex mcp add [OPTIONS]
  <NAME> (--url <URL> | -- <COMMAND>...)`) — a persistent user-level edit, not a per-run registration.
- `codex resume --help`: `Usage: codex resume [OPTIONS] [SESSION_ID] [PROMPT]`, `Session id (UUID) or session name`;
  `codex exec --help`: non-interactive, `--json  Print events to stdout as JSONL` (headless, v1.0, not used). No
  subcommand prints a past session's id, model or token counts as JSON (`codex --help` command list; `codex debug
  --help`: `models`, `app-server`, `prompt-input` only).
- Documentation (learn.chatgpt.com, redirected from developers.openai.com/codex/…, read 2026-10-14):
  `docs/extend/mcp`: servers are `[mcp_servers.<server-name>]` tables, STDIO fields `command` (required), `args`, `env`,
  `env_vars` ("Environment variables to allow and forward"), `cwd`, `enabled` ("Set false to disable a server without
  deleting it"), `required` ("Set true to make startup fail if this enabled server can't initialize"),
  `startup_timeout_sec` (default 10), `tools.<tool>.output_token_limit`; "you can also scope MCP servers to a project
  with `.codex/config.toml` (trusted projects only)". `docs/config-file/config-basic` precedence: 1 "CLI flags and
  `--config` overrides", 2 project `.codex/config.toml` ("closest wins; trusted projects only"), 3 `--profile`, 4 user
  `~/.codex/config.toml`, … `docs/config-file/config-advanced`: "Keys can use dot notation … (for example,
  `mcp_servers.context7.enabled=false`)"; "--config values are parsed as TOML". Silent on whether an override
  REPLACES or MERGES a same-named table, on a stdio server's default environment and working directory, and on whether
  the model can read MCP resources.
- **Model access to MCP Resources (question 3): yes, by evidence in the shipped binary.** The help and docs are
  silent, so I read the tool definitions compiled into the `0.145.0` binary (static, nothing run:
  `strings -n 8 …/@openai/codex-linux-x64/vendor/x86_64-unknown-linux-musl/bin/codex`, sha256 `a2a05daf…`). It defines
  three model tools, `list_mcp_resources` ("Lists resources provided by MCP servers. Resources allow servers to share
  data that provides context to language models"), `list_mcp_resource_templates` and `read_mcp_resource` ("Read a
  specific resource from an MCP server given the server name and resource URI."; its `uri` parameter: "Resource URI to
  read. Must be one of the URIs returned by list_mcp_resources."), with handlers
  `core/src/tools/handlers/mcp_resource/{read_mcp_resource,list_mcp_resources,list_mcp_resource_templates}.rs` and the
  wire calls `resources/read`, `resources/templates/list`. No prompt-fetching model tool appears (`prompts/get` occurs
  only as a client/server method name). So AC 3 does **not** fail by design: ruling (a)'s Resource is reachable. Two
  open points only the by-hand pass settles: (i) the `uri` description tells the model the URI must be a LISTED one,
  and the session template is never listed (spec-004 §2.1) — unlike Claude Code, Codex can list templates, so the
  model can see `wingfoil://session/{role}/{element}/{state}`; whether the handler or the model refuses an unlisted
  concrete URI is R2's stop-and-return; (ii) `tools.<tool>.output_token_limit` exists: a large context could be
  truncated (task-236's read on this repository was 436204 bytes), hence a small scratch project.
- TUI facts used only by the runbook (binary strings, not flags): `/mcp` "list configured MCP tools; use /mcp verbose
  for details", `/status` "show current session configuration and token usage", and an exit line "To continue this
  session, run codex resume …". Config keys `check_for_update_on_startup` and `projects."<path>".trust_level` exist:
  an update notice and a directory-trust dialog can appear before the first turn.

**The blocking finding (question 2): Codex cannot register the running build under format 1 as written.** spec-016
§2.2 offers `mcp.via: config-file` (a file whose path is `{mcp_config_file}`) or `args` (`{mcp_command}` and
`{mcp_args}` as whole argv elements), and §2.3 / `dl-090` Q3 (a) forbid a placeholder inside an element. Codex reads
MCP servers only from TOML config layers and `-c key=value`, and has no option that takes a config-file path; every
`-c` naming the build needs the placeholder INSIDE one element (`mcp_servers.wingfoil.command="{mcp_command}"`), which
the validator refuses (`fieldIssues`, `src/agent/placeholders.ts`, "a placeholder fills a whole argv element"). The
alternatives without a spec change break §2.5 ("the server WingFoil registers is the build that is running `agent
execute`"; the project's registration "is not read and not modified"): `codex mcp add` edits the user's config for
good, a committed `.codex/config.toml` names a fixed build and loads only in trusted projects, `--profile` takes a name
under `$CODEX_HOME`, and `CODEX_HOME` would need an `env:` the manifest deliberately lacks. §2.8 says the task stops
and returns the choice to the approver: **decision D-1, needed before red.**

**Recommended (D-1 (a)): a third `mcp.via` value, `config-arg`, and a placeholder `{mcp_config}`** = the rendered
`mcp.template` as ONE whole argv element. It keeps `dl-090` Q3 (a) (a whole argument, no shell), reuses
`renderMcpTemplate` unchanged (`src/agent/execute.ts:177`: `{mcp_command}` as JSON string content, `{mcp_args}` as a
JSON array — both valid TOML: JSON's escapes `\" \\ \b \f \n \r \t \uXXXX` are TOML basic-string escapes, and an array
of JSON strings is a TOML array), and needs no `format` bump: no published build reads adapter manifests (the pinned
`0.2.2`, `node_modules/wingfoil-released/dist/`, has no `agent/` directory). Rules: `mcp.template` required with
`config-arg`; every declared `launch.*.args` carries `{mcp_config}` when `mcp.via: config-arg`; `{mcp_config}` legal
only there; the element is the rendered text verbatim (no trailing-newline stripping: the built-in writes a one-line
YAML scalar).

**Draft manifest** (`codex-cli`, under D-1 (a); every flag backed by a line above):

```yaml
name: codex-cli
format: 1
command: codex                                    # Usage: codex [OPTIONS] [PROMPT]
verified_with: "codex-cli 0.145.0"                # codex --version
version_args: [ --version ]                       # -V, --version  Print version
launch:
  interactive:
    # -c takes exactly one key=value; the prompt is last and nothing is appended after it (session.id: none).
    args: [ -c, "{mcp_config}", "{bootstrap}" ]
    terminal: required                            # the interactive CLI is the default; exec is the non-interactive one
prompt:
  via: arg                                        # [PROMPT]  Optional user prompt to start the session
mcp:
  via: config-arg                                 # -c, --config <key=value> … parsed as TOML (D-1)
  template: 'mcp_servers.wingfoil={command = "{mcp_command}", args = {mcp_args}, enabled = true, required = true}'
session:
  id: none                                        # no --session-id; no command prints a past session's id
  resume:
    supported: false                              # codex resume [SESSION_ID] exists, but WingFoil never learns the id (D-3)
usage:
  from: none                                      # no command prints a past session's model/usage → not-reported
```

  Rendered element, for illustration: `mcp_servers.wingfoil={command = "/usr/local/bin/node", args =
  ["/…/dist/cli.js","mcp"], enabled = true, required = true}`. `-c` is split at its first `=` (binary string
  `Invalid override (missing '=')`), so the `=` inside the inline table are value text. `enabled = true` makes a
  user/project `enabled = false` on a same-named table irrelevant if overrides merge; `required = true` makes a failed
  registration stop the session instead of leaving the model without its context (D-2). No `-s`/`-a`/`-m`: sandbox,
  approvals and model stay the user's (adr-012 point 1). Green constraint as in task-236: the YAML must not spell
  `.wingfoil/agents` or `agents/built-in|custom` (`test/core/builtin-adapter-writers.test.ts`).

**AC classification and what the qa agent pins (T1)** — rows N1–N4 exist only under D-1 (a); under another ruling
they change and design is redone.

| AC | Class | qa pins |
|---|---|---|
| 1 manifest valid as built-in, installed by `init` (pinned as task-236) | red-first | (a)–(e) |
| N1–N4 `mcp.via: config-arg` + `{mcp_config}` (new behaviour, D-1 (a)) | red-first | (f)–(i) |
| 2 by-hand: MCP registration, session-Resource read, lookups, record commit | manual (session 3 runbook; approver runs it, ruling D2) | nothing |
| 3 scratch project, `adapter: codex-cli`, one `agent execute` recorded `built-in/codex-cli` | manual (same) | nothing |

Test files: NEW `test/storage/builtin-adapter-codex-cli.test.ts` (task-236's file left as is); `test/agent/manifest.test.ts`,
`test/agent/launch.test.ts` (existing); the fake fixture for (i). Interfaces: as task-236's design (a)–(e) (`BUILTIN_ADAPTERS`,
`templateScaffold`, `TEMPLATES`, `builtinTemplateSources`, `BUILTIN_ADAPTERS_DIR`, `parseAdapterManifest`, `loadAdapter`,
`verifyBuiltinTemplates`, `initWingfoilProject`; helpers `makeTempGitRepo`/`removeTempDir`/`git`), plus
`renderLaunchArgv`/`LaunchValues` (`src/agent/launch.ts`) and `ADAPTER_PLACEHOLDERS`/`placeholderIssues`
(`src/agent/placeholders.ts`).

- (a) `BUILTIN_ADAPTERS` has exactly one entry `codex-cli`; the names are sorted and duplicate-free (task-236's (a) on
  `claude-code` must keep passing: `'claude-code' < 'codex-cli'`).
- (b) `parseAdapterManifest(entry.content, { name: 'codex-cli', kind: 'built-in', file })` → `name` `codex-cli`, `format`
  1, `launch.interactive.terminal` `required` asserted on the RAW YAML too, `verified_with` matching `/\S/`. Not pinned:
  flags, argv, the template text, the version string (by-hand facts).
- (c) `verifyBuiltinTemplates(builtinTemplateSources(templateScaffold(TEMPLATES[0]!)))` → `null`.
- (d) the default scaffold holds `${BUILTIN_ADAPTERS_DIR}/codex-cli.yaml` with content `=== entry.content`.
- (e) `initWingfoilProject(repo, 'Scrum')` with no seam: both `claude-code.yaml` and `codex-cli.yaml` on disk, byte-equal
  to their entries, both in the single init commit, and `git show --name-only --format= HEAD` lists them in that order
  (sorted); `loadAdapter(repo, 'codex-cli')` → `{ ok: true, value: { name: 'codex-cli', kind: 'built-in' } }`.
- (f) schema (`manifest.test.ts`): `mcp.via: config-arg` with a `template` and `{mcp_config}` in `launch.interactive.args`
  parses; without `template` → the Pass-2 issue naming `mcp.template` with the reason `mcp.via: config-arg` (same shape as
  the existing `config-file` case, `src/agent/manifest.ts:60`).
- (g) placeholders (`manifest.test.ts`): `ADAPTER_PLACEHOLDERS` contains `mcp_config`; under `config-arg`, args without
  `{mcp_config}` → the "required" issue naming `launch.interactive.args` (same text shape as `mcp_config_file`'s);
  `{mcp_config}` under `config-file` or `args` → "not legal here: it is legal in launch.*.args, when mcp.via is
  config-arg"; `x{mcp_config}` → the whole-element issue; `{mcp_config_file}` under `config-arg` → not legal.
- (h) render (`launch.test.ts`): `renderLaunchArgv` with `LaunchValues.mcpConfig` (new OPTIONAL field, the rendered
  template; optional so existing `LaunchValues` literals still compile) replaces `{mcp_config}` by exactly one element
  equal to it, for a value holding spaces, `"`, `=` and `{}`; `renderMcpTemplate` on a fixture TOML template
  (`x={command = "{mcp_command}", args = {mcp_args}}`) with command `/a b/node` and args `["/c\"d/cli.js","mcp"]` →
  `x={command = "/a b/node", args = ["/c\"d/cli.js","mcp"]}` (characterization: the renderer exists; pinned because
  config-arg relies on it).
- (i) end to end, headless (fake): a fixture manifest with `mcp.via: config-arg`, its template a JSON body, and
  `fake-agent.cjs` taught one new option `--mcp-config-json <text>` (same handling as `--mcp-config <file>`, the text
  instead of a file; fixture = qa's, as task-236's S5): `agent execute` with that adapter → the fake's record shows the
  rendered JSON as one argv element and its MCP connection reads the session Resource. Place the fixture where the
  tests that enumerate `test/fixtures/agents/custom/` do not see it (or update their expected listing): qa checks
  `grep -rn "fixtures/agents/custom" test`.
- No test launches `codex` or reads `PATH`.

**Files I expect to touch (session 3).** `src/agent/schema.ts` (enum), `src/agent/manifest.ts` (template required with
`config-arg`), `src/agent/placeholders.ts` (`mcp_config`: list, `LEGAL_IN`, legality, requirement), `src/agent/launch.ts`
(`LaunchValues.mcpConfig?`, `renderArgv`), `src/agent/execute.ts` (render the template for `config-arg`, `:622`);
`src/storage/builtin-adapters.ts` (a `CODEX_CLI` const after `CLAUDE_CODE`, `BUILTIN_ADAPTERS = [CLAUDE_CODE, CODEX_CLI]`,
a header line `- codex-cli — Codex CLI (task-237).`); this task's AC 2 text; the run log under the SCRATCH project's
`paths.runs` (not this repository). No `.wingfoil/` file of this repository (no `dna.yaml` edit, no installed copy: task-236's
parity test reads only what is installed here, so it holds unchanged — D-6). No config `version:` bump. Pending amendment:
spec-016 §2.2 (`mcp.via` row, `mcp.template` row), §2.3 (the `{mcp_config}` row and its requirement), §2.5 (Codex's
precedence outcome), §2.8 (`codex-cli` row, `verified_with`), Revision note.

**By-hand runbook outline (session 3 writes it in full; ruling D2: the APPROVER runs it — Codex sends data to OpenAI).**
Every dialog answer is recorded IN WORDS (task-236 lesson).
- **R0 setup.** In the worktree: `npm run -s build`; `which codex`; `readlink -f $(which codex)`; `codex --version`
  (must be `codex-cli 0.145.0`, else stop: the manifest is pinned to it); `node dist/cli.js --version`;
  `git rev-parse HEAD`. Scratch project `/home/robypomper/Workspaces/.wf2-wt/task-237-scratch` (not under `/tmp`, which
  `~/.codex/config.toml` already trusts): `git init`; `node <worktree>/dist/cli.js init --template Scrum` (installs both
  built-ins); `dna add team.agents --value Codex --entry-email <D-5> --entry-executes_as developer
  --entry-approval_authority false --entry-adapter codex-cli`; `memory add --type task --title "codex smoke"`.
  Precedence fixture (D-4): `.codex/config.toml` in the scratch with `[mcp_servers.wingfoil]` naming the pinned
  `0.2.2` (`node …/WingFoil2/node_modules/wingfoil-released/dist/cli.js mcp`), which has no `wingfoil://session/`
  template, committed. Record the scratch HEAD.
- **R1 dry run** (launches nothing): `agent execute --element task:<id> --role developer --dry-run` → exit 0, `adapter`
  `built-in/codex-cli`, bootstrap naming `wingfoil://session/developer/task:<id>/<HEAD>`.
- **R2 the run** (approver starts it): same without `--dry-run`. Record in words every dialog before the first turn
  (directory trust — answer "trust", needed for D-4; an update notice — answer "skip"; any MCP approval) and the
  answer. Type nothing. Observe: does the bootstrap arrive as the first user message and get submitted; does the
  model call `read_mcp_resource` (server `wingfoil`, exactly the bootstrap's URI) with no help, possibly after
  `list_mcp_resource_templates`; is the result the element's context (task with ACs, DNA, developer directives) and
  not truncated. As soon as it shows, Esc and type `Stop here: make no edits and no commits.`
- **R3 in the session:** `/mcp verbose` (every `wingfoil` server, its command/args, status), `/status` (session id,
  model, token usage); then `/exit`, and record the exit's "To continue this session, run codex resume …" id.
- **R4 after exit:** the `run …: agent exited …` line; `git log -1 --format='%H%n%s%n%b'` (`agent: record <run-id>`, only
  the run log); `tail -1 <paths.runs>/<task>.jsonl` (`adapter` `built-in/codex-cli`, `agent_version` = what
  `codex --version` prints NOW — compare with R0 for drift, `session`/`model`/`tokens` `not-reported`); `git status
  --short`; `ls ~/.codex/sessions/` for the rollout of R3's id (evidence of the id we cannot record); `codex --version`
  again (auto-update check); `readlink -f $(which codex)`. Cleanup: remove the scratch's `projects."…task-237-scratch"`
  trust entry from `~/.codex/config.toml` if wanted (approver's choice, recorded).
- **Stop-and-return** (spec-016 §2.8; R17 not narrowed silently): Codex rejects the argv or the `-c` value (a config
  error naming `mcp_servers`); the session fails to start because `required` server `wingfoil` cannot initialize; the
  model does not read the bootstrap's URI without help, or the read is refused as unlisted; the read answers "not
  found" (= the scratch `.codex/config.toml` server, `0.2.2`, won over the `-c` override); the result is truncated or
  is not the element's context; `codex --version` at R0 is not `0.145.0`.

**Decisions for the approver.**
- **D-1 (blocking, before red)** — how Codex gets the running build's `wingfoil` server. (a) new `mcp.via: config-arg`
  + `{mcp_config}` (one whole element; spec-016 §2.2/§2.3 amendment; no format bump; code in `src/agent`; the task likely
  M → L as task-236 grew). (b) a committed project `.codex/config.toml` — breaks §2.5 (fixed build, trusted projects
  only). (c) a user-level `codex mcp add` — breaks §2.5, persistent. (d) Codex is not a built-in in v0.3 — narrows R17.
  **Recommendation: (a).**
- **D-2** `enabled = true, required = true` in the template (docs-backed). Recommendation: accept.
- **D-3** `session.id: none`, `resume.supported: false`, `usage.from: none`: model, usage and session always
  `not-reported` for codex-cli in v0.3 (no option or command provides them, evidence above). Recommendation: accept;
  a follow-up for v0.4 resume (the id is printed at exit and lives in `~/.codex/sessions/`, which no `command` + argv
  lookup reads).
- **D-4** precedence fixture: the scratch project's `.codex/config.toml` declares a same-named `wingfoil` server
  (pinned `0.2.2`), so R2 observes the docs' order (`--config` overrides above project config) with both present, as
  D-H did; it needs the scratch directory trusted. Recommendation: accept.
- **D-5** the scratch `team.agents` email (required with `adapter`): `noreply@openai.com` is my guess, NOT a verified
  vendor address; any non-reserved address works for a throwaway scratch. Approver's choice.
- **D-6** this repository gets neither a `codex-cli` agent entry nor an installed `codex-cli.yaml` (notes: "Scratch
  project only, no `dna.yaml` edit"); a project initialized before this task does not get the new built-in (no
  upgrade path exists). Recommendation: accept as stated.

**Risks.** The `read_mcp_resource` `uri` description ("Must be one of the URIs returned by list_mcp_resources") may
steer the model away from an unlisted template URI (AC 3 stop-and-return; remedy would be a listed alias, a ruling).
Output truncation (`output_token_limit`) for large contexts: fine in a scratch, likely on this repository (436 KB) —
candidate finding for v0.4. The docs suggest a stdio server gets only allowed variables (`env_vars`: "allow and forward"), and its working directory is
undocumented: if the server starts outside the project root it resolves the wrong repository (R3 records the server's
command; `ls -l /proc/<pid>/cwd` if needed). Auto-update: three installs on this host and an update notice at startup;
`verified_with` pins what was checked, R0/R4 record what ran. task-243 (smoke, merges after this) uses the fake: the new
`--mcp-config-json` option and fixture (i) must not change the fake's existing behaviour.

### red (qa, 2026-10-14)

- **Red commit `db1e32ab`** (T4 is measured from it). Test files and fixtures only, nothing under `src/` or `.wingfoil/`:
  NEW `test/storage/builtin-adapter-codex-cli.test.ts`, NEW `test/cli/agent-execute-config-arg.integration.test.ts`,
  NEW `test/fixtures/agents/config-arg/fake-config-arg.yaml`; EDITED `test/agent/manifest.test.ts`,
  `test/agent/launch.test.ts`, `test/fixtures/agents/fake-agent.cjs`. `test/core/init-builtin-adapters.test.ts` and
  task-236's `builtin-adapter-claude-code.test.ts` need no edit (both read `BUILTIN_ADAPTERS` generically; they pass).
- **Per AC** (all red-first; AC 2/3 are manual, nothing pinned):
  - (a)–(e) `builtin-adapter-codex-cli.test.ts`: `AC 1 (a)` one `codex-cli` entry, names sorted and unique; `AC 1 (b)`
    ×2 built-in parse (name, format 1, `terminal` required, `verified_with` `/\S/`) and `terminal: required` in the raw
    YAML; `AC 1 (c)` `verifyBuiltinTemplates(…)` → `null`; `AC 1 (d)` scaffold holds `codex-cli.yaml` byte-equal;
    `AC 1 (e)` `initWingfoilProject(repo, 'Scrum')` with no seam: both manifests byte-equal on disk, one commit, the
    init commit lists `claude-code.yaml` then `codex-cli.yaml`, `loadAdapter(repo, 'codex-cli')` built-in. Flags,
    argv, template text and the version string are NOT pinned.
  - (f) `manifest.test.ts` `task-237 (f)`: the `configArg()` manifest (fake moved to `mcp.via: config-arg`, TOML-shaped
    template, `-c {mcp_config}` in both launches) parses with no issue and `mcp.via` reads `config-arg`; without
    `mcp.template` → one issue on `mcp.template` matching `/required with mcp\.via: config-arg/`.
  - (g) `manifest.test.ts` `task-237 (g)`: `ADAPTER_PLACEHOLDERS` contains `mcp_config`; config-arg without
    `{mcp_config}` → issue on `launch.interactive.args` / `launch.headless.args` matching
    `/\{mcp_config\} is required with mcp\.via: config-arg/`; `{mcp_config}` under `config-file` and under `args` →
    `/placeholder \{mcp_config\} is not legal here: it is legal in launch\.\*\.args, when mcp\.via is config-arg/` on
    the element; `x{mcp_config}`, `mcp_servers.wingfoil={mcp_config}`, `{mcp_config} ` → `/whole argv element/`;
    `{mcp_config_file}` under config-arg → not legal (`…mcp.via is config-file`); `{mcp_command}`/`{mcp_args}` as
    launch elements under config-arg → not legal (they belong to its template). The existing closed-set test now
    compares SORTED (the new name's place in §2.3's table is the spec amendment's, not pinned here).
  - (h) `launch.test.ts` `task-237 (h)`: `renderLaunchArgv` of `['-c', '{mcp_config}', '{bootstrap}']` with
    `mcpConfig` = a TOML override holding spaces, `"`, `\`, `=` and `{}` → exactly 3 elements, the 2nd equal to it.
    `LaunchValues.mcpConfig` does not exist yet: the values object is cast `as LaunchValues` so the file compiles and
    the test fails on its assertion. `renderMcpTemplate` on a TOML template → `x={command = "/a b/node", args =
    ["/c\"d/cli.js","mcp"]}`: characterization, passes on first run.
  - (i) `agent-execute-config-arg.integration.test.ts`: the compiled CLI, `agent execute --element task:… --role
    developer`, `Fake Agent` pointed at `fake-config-arg` (copied into the project's `agents/custom/`),
    `WINGFOIL_FAKE_AGENT_CONNECT=1`: exit 0, empty stdout, nothing left in `TMPDIR`; the launch argv is
    `['--mcp-config-json', <one element>, '--prompt', <bootstrap>]`, the element equal to the template rendered with
    `process.execPath` and `[dist/cli.js, 'mcp']`; the fake reads `wingfoil://session/developer/<ref>/<HEAD>` from server
    `wingfoil` with no error and non-empty text; one `agent: record` commit, record `adapter: custom/fake-config-arg`.
    The fixture sits in `test/fixtures/agents/config-arg/`, outside `custom/` (`grep -rn "fixtures/agents/custom"
    test` finds no listing of that directory, only the two names `seed()` copies). `fake-agent.cjs` gains
    `--mcp-config-json <text>` (same handling as `--mcp-config <file>`, the text instead of the file); the file path is
    read and parsed as before, and `fake-agent.test.ts` passes unchanged (task-243's smoke uses the fake).
- **Run** `npx jest test/storage/builtin-adapter-codex-cli.test.ts test/agent/manifest.test.ts test/agent/launch.test.ts
  test/cli/agent-execute-config-arg.integration.test.ts test/agent/fake-agent.test.ts
  test/storage/builtin-adapter-claude-code.test.ts test/core/init-builtin-adapters.test.ts --maxWorkers=2` → 7 suites,
  4 failed / 3 passed; 195 tests, 24 failed / 171 passed. Failed per file: codex-cli 6/6; manifest 13 (the 12 new +
  the edited closed-set test); launch 1 ((h) render; the characterization passes); config-arg integration 4/4.
  fake-agent, claude-code and init-builtin-adapters all pass. First failing assertion, by reason:
  - codex-cli: `names.filter(…=== 'codex-cli')` length 0 (a), the `shipped()` guard `{ shipped: false }` (b)–(e);
  - manifest (f)/(g): the config-arg manifest is refused in Pass 1, `mcp.via: Invalid option: expected one of
    "config-file"|"args"`, so the expected Pass-2 issue is absent (`Expected length: 1, Received length: 0`);
    `{mcp_config}` under config-file/args is `unknown placeholder`, not "not legal here"; the set lacks `mcp_config`;
  - launch (h): the 2nd element is the literal `"{mcp_config}"`;
  - integration (i): exit 1, `error: adapter 'fake-config-arg': mcp.via: Invalid option: expected one of
    "config-file"|"args"`; hence no launch record, no `agent: record` commit (`rev-list --count` 0).
  `npx eslint` on the six files and `npx tsc --noEmit -p tsconfig.json`: clean.

### green (developer, 2026-10-14)

- Read `### red (qa)`: red commit `db1e32ab`, notes `81b15694`. Approver rulings 2026-10-14: D-1 (a) `mcp.via:
  config-arg` + `{mcp_config}`, task M → L; D-2 `enabled`/`required` true; D-3 session/model/usage `not-reported`,
  resume unsupported; D-4 scratch precedence fixture; D-5 scratch email `codex@example.invalid` (see the
  decision below: the schema refuses it); D-6 nothing installed in this repository.
- `d80d3976` `feat(agent): …`: `src/agent/schema.ts` (`mcp.via` enum gains `config-arg`), `src/agent/manifest.ts`
  (`mcp.template` "required with mcp.via: config-arg (spec-016 §2.2)"), `src/agent/placeholders.ts` (`mcp_config` in
  the closed set; `LEGAL_IN` "launch.*.args, when mcp.via is config-arg"; legal in launches only under `config-arg`,
  so `{mcp_config_file}`, `{mcp_command}`, `{mcp_args}` there are refused by the existing legality rule; required
  "{mcp_config} is required with mcp.via: config-arg"), `src/agent/launch.ts` (`LaunchValues.mcpConfig`, rendered by
  `renderArgv` as one element), `src/agent/execute.ts` (under `config-arg` the template is rendered with
  `renderMcpTemplate` and handed to the launch, no temporary file), and `src/storage/builtin-adapters.ts`
  (`CODEX_CLI`, the design's manifest unchanged, after `CLAUDE_CODE`; header line `codex-cli — Codex CLI (task-237)`).
- `e4104276` `docs: …`: `docs/cli-reference.md` (`init` entry) and `docs/user-guide.md` (§3 tree) name `codex-cli`
  beside `claude-code`. `docs/agents.md` names no built-in and no `mcp.via` value (`grep -n "claude-code\|config-file"
  docs/agents.md` → nothing; positive case: the same grep on `docs/cli-reference.md` hits line 213).
- AC 2's text is amended in this file (approver ruling (a), as task-236 did for its AC 3): "the read of the session
  Resource `wingfoil://session/{role}/{element}/{state}` the bootstrap names … it replaced the `{role}-session` Prompt
  fetch".
- **red → green:** `npx jest test/storage/builtin-adapter-codex-cli.test.ts test/agent/manifest.test.ts
  test/agent/launch.test.ts test/cli/agent-execute-config-arg.integration.test.ts test/agent/fake-agent.test.ts
  test/storage/builtin-adapter-claude-code.test.ts test/core/init-builtin-adapters.test.ts
  test/core/builtin-adapter-writers.test.ts test/storage/builtin-template-sources.test.ts
  test/core/format-init-scaffold.test.ts --maxWorkers=2` → 10 suites, 278 passed, 278 total (red: 24 failed / 171
  passed of red's seven).

### refactor (developer, 2026-10-14)

- The first full run (`npm run test:coverage -- --maxWorkers=2`, at `e4104276`) gave 99.32 / **97.18** / 97.99 /
  99.71: branches −0.05 against the baseline 97.23, beyond the run-dependent −0.01. The new branches the in-process
  suites did not take (`coverage/coverage-final.json`, branches with 0 hits; line numbers at `e4104276`): `launch.ts:395` and `execute.ts:662`
  (the conditional spreads of `mcpConfig`) and `execute.ts:625` (the `config-arg` rendering), reached only by red's CLI
  integration test, which runs the compiled build in a child process.
- `a639975b` `refactor(agent): …`: `mcpConfig` becomes a declared `string | undefined` field of `PreparedLaunch` and
  `LaunchInput` (no conditional spread); NEW `test/agent/execute-config-arg.test.ts` (mine; red touched no such file)
  runs `agentExecutePipeline` in process: under `config-arg` the launch gets `mcpConfig` =
  `renderMcpTemplate(template, server)` and no temporary file; under `config-file` no `mcpConfig` and exactly
  `mcp_config_file`.
- Gates at `a639975b`, under `waitslot.sh`, `--maxWorkers=2`, the spec-016 pending amendment in the working tree:
  `npm run test:coverage -- --maxWorkers=2` → 416 suites, **7485 passed, 7485 total**; coverage **99.32 / 97.24 /
  97.99 / 99.71** against the B6 baseline 99.32 / 97.23 / 97.98 / 99.71 — no column below (branches 6322/6501 =
  97.247 %, from `coverage-final.json`); `memory-transition.ts` uncovered `468` only in this run.
  `builtin-adapters.ts`, `manifest.ts`, `placeholders.ts`, `schema.ts` 100 / 100 / 100 / 100. `npm run typecheck` →
  exit 0; `npm run lint` → exit 0; `npm run docs:api` → exit 0. `test/docs/cli-reference.test.ts` passed in the full
  run.
- `node scripts/check-governance.cjs --base db0e2752` → `gated: 0 findings`, `history: 0 findings`.
  `node scripts/lint-claims.cjs --base db0e2752` → warn-only; on this file, three "unchanged" in my design (each
  names the function or test it is about) and one "does not exist" in red's section (qa's, left as written).
- **T4:** `git log --first-parent --no-merges --format=%h db1e32ab..HEAD -- test/storage/builtin-adapter-codex-cli.test.ts
  test/cli/agent-execute-config-arg.integration.test.ts test/fixtures/agents/config-arg/fake-config-arg.yaml
  test/agent/manifest.test.ts test/agent/launch.test.ts test/fixtures/agents/fake-agent.cjs` → empty (positive case:
  the same command on `src/storage/builtin-adapters.ts` prints `d80d3976`).
- **Runbook rehearsal (no agent launched).** R0's scratch steps and R1 were run in a throwaway directory under my
  scratchpad (deleted afterwards), with the dev build: `init --template Scrum` → exit 0, `agents/built-in/` holds
  `claude-code.yaml` and `codex-cli.yaml`; `memory add --type task --title "codex smoke"` → `task-001-codex-smoke`;
  `dna add team.agents … --entry-email codex@example.invalid …` → **exit 1**, `an agent email may not be on a reserved
  top-level domain (.test, .example, .invalid, .localhost …, bug-261)`; with `noreply@openai.com` → exit 0; the
  `.codex/config.toml` fixture committed; `script -qec "… agent execute --element task:task-001-codex-smoke --role
  developer --dry-run" /dev/null` → exit 0, `adapter` `built-in/codex-cli`, `agent` `Codex`, path
  `docs/runs/task-001-codex-smoke.jsonl`, bootstrap naming `wingfoil://session/developer/task:task-001-codex-smoke/<HEAD>`.
  The context the Resource serves there, `assembleExecutionContext(…).value.payload` from `dist/core/context.js`, is
  6189 bytes (no truncation expected).

### self-review (developer, 2026-10-14)

- AC 1 — met: red's six codex-cli tests pass; `init` with no seam installs both built-ins, `claude-code` then
  `codex-cli`, in the init commit, and `loadAdapter` loads `codex-cli` as built-in.
- New behaviour (f)–(i) under D-1 (a) — met: red's manifest, launch and CLI integration tests pass; the in-process
  test covers the same hand-over.
- AC 2, AC 3 — **open**: they need the approver's real-terminal pass below (ruling D2). The task is not submitted.
- Every flag of the manifest has its help line in the design notes. Same-class sweep for the shipped-adapter
  lists: `grep -rn "claude-code" docs/cli-reference.md docs/user-guide.md docs/agents.md README.md` → the two lines
  updated in `e4104276` and `cli-reference.md:1669` (an `agent show` example output naming one run's adapter, not a
  list). `grep -rn "config-file" src/agent` → each site that branches on `mcp.via` now handles `config-arg`
  (`manifest.ts:60`, `placeholders.ts` legal/required, `execute.ts:624-627`).

### Pending amendments (approver)

- `spec-016-agent-execution` (uncommitted in the worktree): §2.2 `mcp.via` row (`config-arg`) and `mcp.template` row;
  §2.3 the `{mcp_config}` row and its requirement; §2.8 the `codex-cli` row and `verified_with`; a dated Revision
  note. To be completed after the by-hand pass with §2.5's outcome (which `wingfoil` server Codex used beside the
  scratch's `.codex/config.toml` one) and §2.8's (whether the model read the session Resource). Proposed `--reason`:
  "task-237: approver ruling D-1 (a) of 2026-10-14. Codex CLI 0.145.0 registers MCP servers only through TOML
  configuration layers and -c key=value overrides, so a third mcp.via value, config-arg, passes the rendered
  mcp.template as the one whole argument {mcp_config}, which keeps placeholders filling whole arguments; the manifest
  format stays 1 because no released build reads adapter manifests. Section 2.8 fills the codex-cli row from codex
  --help of codex-cli 0.145.0, with session, model and usage not reported and resume not supported."

### by-hand runbook (for the approver)

Run in a real terminal (a TTY on stdin and stdout) by the approver (ruling D2): Codex sends the session to
OpenAI, so only the approver starts it. Paste the whole terminal transcript back, and **write every dialog
answer in words** (a pasted menu does not show which line was chosen; task-236's lesson). Codex uses its own
login; nothing below asks for a credential. The scratch project is a throwaway git repository outside this
worktree; nothing in this repository changes.

**R0 — versions, build, scratch project** (copy-paste):

```bash
WT=/home/robypomper/Workspaces/.wf2-wt/task-237
S=/home/robypomper/Workspaces/.wf2-wt/task-237-scratch
cd "$WT"
git branch --show-current          # task/task-237-ship-verify-hand-builtin-codex-cli-adapter
git status --short                 # only docs/04_memory/design/specs/spec-016-agent-execution.md (pending amendment)
git rev-parse HEAD
npm run -s build
WF="node $WT/dist/cli.js"
$WF --version
which codex                        # expect ~/.npm-global/bin/codex
readlink -f "$(which codex)"
codex --version                    # expect: codex-cli 0.145.0 — the manifest's verified_with

rm -rf "$S" && mkdir -p "$S" && cd "$S" && git init -q
$WF init --template Scrum
ls .wingfoil/agents/built-in/      # claude-code.yaml  codex-cli.yaml
$WF memory add --type task --title "codex smoke"      # prints "id": "task-001-codex-smoke"
CODEX_EMAIL="<the address you choose, see the note>"
$WF dna add team.agents --value Codex --entry-email "$CODEX_EMAIL" --entry-executes_as developer --entry-approval_authority false --entry-adapter codex-cli
# D-4: a same-named wingfoil server in the project config, pointing at the pinned 0.2.2,
# which has no wingfoil://session/ template (so a "not found" read means this one won).
mkdir -p .codex
cat > .codex/config.toml <<'TOML'
[mcp_servers.wingfoil]
command = "node"
args = ["/home/robypomper/Workspaces/WingFoil2/node_modules/wingfoil-released/dist/cli.js", "mcp"]
TOML
git add .codex/config.toml && git commit -q -m "chore: task-237 precedence fixture (D-4)"
git log --oneline
git rev-parse HEAD                 # the state_ref the run will pin
export EL=task:task-001-codex-smoke
```

**Email note.** Ruling D-5's `codex@example.invalid` is refused by `dna add` (the schema rejects RFC 2606
reserved top-level domains for agent emails, bug-261; rehearsed 2026-10-14, exit 1). Use any address on a real
domain; the rehearsal used `noreply@openai.com`, which is accepted but is not a verified vendor address. The
address only appears in the bootstrap's attribution line and in the scratch's own commits.

Record: the wingfoil version, `which codex`, the `readlink` target, `codex --version`, the worktree HEAD and the
scratch HEAD. **If `codex --version` is not `codex-cli 0.145.0`, stop and report** (the manifest is pinned to it).
If any `$WF` command above exits non-zero, stop and report (no Codex has run yet). If the task id `memory add`
printed is not `task-001-codex-smoke`, set `EL=task:<that id>`.

**R1 — dry run** (launches nothing):

```bash
$WF agent execute --element "$EL" --role developer --dry-run
```

Record: exit `0`; `run.id` `task-001-codex-smoke/adhoc/1`; `run.adapter` `built-in/codex-cli`; `run.agent` `Codex`;
`run.state_ref` = R0's scratch HEAD; `paths` `docs/runs/task-001-codex-smoke.jsonl`; the bootstrap ends its third line with
`Read the MCP resource "wingfoil://session/developer/task:task-001-codex-smoke/<scratch HEAD>".` Any `error:` line →
stop and report.

**R2 — the real run** (the approver starts it; Codex owns the terminal):

```bash
$WF agent execute --element "$EL" --role developer
```

1. Record the `run task-001-codex-smoke/adhoc/1: launching Codex (built-in/codex-cli) as developer on task:…` line.
2. Before the first turn, record **in words** every dialog and your answer:
   - directory trust ("Do you trust …task-237-scratch?"): answer **trust / yes** (D-4 needs the project config
     loaded);
   - an update notice: answer **skip / not now** (the manifest is pinned to 0.145.0);
   - any MCP server approval or other prompt: record it and your answer.
   If Codex exits here with a configuration error (anything naming `mcp_servers` or `-c`/`--config`), or with
   `wingfoil` failing to start as a required server, **stop**: go to R4 for the record, then return.
3. Then **type nothing**. Watch the first actions (up to ~2 minutes):
   - Is the bootstrap shown as the first user message and submitted on its own?
   - Does the model call **`read_mcp_resource`** on server `wingfoil` with **exactly** the URI the bootstrap names,
     with no help from you (a `list_mcp_resources` or `list_mcp_resource_templates` call before it is fine)? Record
     each call as shown.
   - Is the result the element's context (a `<!-- format: 1 | role: developer | element: task:task-001-codex-smoke |
     state: … -->` header, `## 1. Task` with the task, `## 2. Project DNA`, `## 3. Directives`), complete, not cut
     off or marked truncated? (In the rehearsal the context was 6189 bytes, so a truncated result is a finding.)
   - **As soon as the read's result is on screen, press Esc** to interrupt, then type
     `Stop here: make no edits and no commits.` and Enter.
   - A permission/approval prompt for the read: record it and your answer (approving is not help; typing the URI
     or the instruction is).

**R3 — inside the session** (type these yourself, after R2):

```
/mcp verbose
/status
```

Record from `/mcp verbose`: every server named `wingfoil`, its command and args, and its status. The adapter's is
`<node> /home/robypomper/Workspaces/.wf2-wt/task-237/dist/cli.js mcp`; the project config's is
`node …/WingFoil2/node_modules/wingfoil-released/dist/cli.js mcp`. Record from `/status`: the session id, the
model and the token usage. Then `/exit`, and record Codex's exit line (`To continue this session, run codex resume
<id>`), and the wingfoil line that follows.

**R4 — after Codex exits** (copy-paste, still in the scratch):

```bash
cd /home/robypomper/Workspaces/.wf2-wt/task-237-scratch
git log -1 --format='%H%n%s%n%b'      # agent: record task-001-codex-smoke/adhoc/1, WingFoil-Version: trailer only
git show --stat --format= HEAD         # only docs/runs/task-001-codex-smoke.jsonl
tail -1 docs/runs/task-001-codex-smoke.jsonl
git status --short                     # empty: the agent changed nothing
$WF agent list --past
codex --version                        # compare with R0: auto-update?
readlink -f "$(which codex)"
ls -t ~/.codex/sessions/*/*/*/ | head -3   # the rollout of R3's session id (the id the record cannot hold)
```

Record: the `run …: agent exited <status> after <s> s (recorded in <sha7>)` line; the record commit sha; the record
line — expect `adapter` `built-in/codex-cli`, `agent` `Codex`, `agent_version` = the `codex --version` above,
`session`, `model` and every `tokens` count `not-reported` (D-3), `exit_status` 0; whether a rollout file named
with R3's session id is listed; whether `codex --version` changed since R0. Optional cleanup (your choice, say
which): remove the `[projects."/home/robypomper/Workspaces/.wf2-wt/task-237-scratch"]` entry R2's trust answer
added to `~/.codex/config.toml`; delete the scratch directory only after the transcript is pasted.

**Stop-and-return** (spec-016 §2.8; R17 is not narrowed silently). Stop where it shows, paste the transcript, and
the choice returns to the approver if:
- R0: `codex --version` is not `codex-cli 0.145.0`;
- R2: Codex rejects the argv or the `-c` value (a configuration error), or the session does not start because the
  required `wingfoil` server cannot initialize;
- R2: the model does not read the session Resource the bootstrap names without you typing the URI or the
  instruction;
- R2: the read is refused because the URI is not among the listed ones (the template is never listed as a
  resource; `read_mcp_resource`'s description says the URI must be a listed one);
- R2: the read answers "not found" / "Resource … not found": that is the pinned 0.2.2 server's answer, i.e. the
  project `.codex/config.toml` server won over the `-c` override (§2.5);
- R2: the result is truncated or is not the element's context;
- R3: the adapter's `wingfoil` server is not the one connected.

### by-hand pass — approver's transcript (2026-10-14)

Run by the approver in a real terminal from this worktree at `f7bddb03` (transcript and the coordinator's reading:
`devloop-kit/task-237-runbook-transcript.md`). Ruling D-5 revised by the approver: the scratch agent email is
`codex@openai.com` (the schema refuses `codex@example.invalid`, bug-261, as the rehearsal found).
- **Dialog answers (in words, the approver's):** Codex asked to log in inside `agent execute`: signed in with ChatGPT
  (Plus, activated for this pass). Directory trust for `task-237-scratch`: accepted. The update notice
  (0.145.0 → 0.162.1): not applied. During the session Codex asked to run `wingfoil memory submit`, `find`, `git log`,
  `nl`, `git apply`, `git diff`: all approved (command approvals, not help with the context fetch).
- **R0:** worktree HEAD `f7bddb03`, only spec-016 dirty; `wingfoil 0.2.2 (f7bddb03)`; `codex` →
  `~/.npm-global/lib/node_modules/@openai/codex/bin/codex.js`, `codex-cli 0.145.0`. Scratch: `init --template Scrum`
  installed `claude-code.yaml` and `codex-cli.yaml`; `task-001-codex-smoke`; agent `Codex` (`codex@openai.com`,
  `adapter: codex-cli`); `.codex/config.toml` with a same-named `wingfoil` server naming the pinned 0.2.2; scratch
  HEAD `49113c6`.
- **R1:** exit 0; `task-001-codex-smoke/adhoc/1`, `built-in/codex-cli`, `Codex`, `state_ref` `49113c6`; the bootstrap
  names `wingfoil://session/developer/task:task-001-codex-smoke/49113c6…`.
- **Run `…/adhoc/1`** (93.9 s): a first attempt that stopped for lack of credits before the session could run; its
  record is `d73292c`, which moved the scratch HEAD. The checked run is `…/adhoc/2`, `state_ref` `d73292c6…`.
- **R2 (`…/adhoc/2`) — AC 3 (as amended) passes.** Argv accepted: the `-c` value and the bootstrap were taken, the
  bootstrap shown as the first message and submitted on its own. With nothing typed, the model called
  `wingfoil.list_mcp_resources` (dna, workflows, `workflows/-/next`, `-/status`), then `wingfoil.read_mcp_resource`
  on **exactly** `wingfoil://session/developer/task:task-001-codex-smoke/d73292c6…`; the unlisted template URI was
  accepted, and the answer was the element's context (`# WingFoil Agent Context`, `<!-- format: 1 | role: developer
  | element: task:task-001-codex-smoke | state: d73292c6… -->`, `## 1. Task` …), not truncated.
- **§2.5 — the `-c` override wins.** The read returned the session Resource, which only the build under test serves
  (the project `.codex/config.toml` server, the pinned 0.2.2, has no `wingfoil://session/` template: `grep -rln
  "wingfoil://session/" /home/robypomper/Workspaces/WingFoil2/node_modules/wingfoil-released/dist` → nothing;
  positive case: `grep -rl "wingfoil://session/" dist/mcp/*.js` in this worktree lists `index.js` and `session-resource.js`). So the adapter's
  `-c mcp_servers.wingfoil=…` override won over the same-named project server.
- **Not stopped in time (recorded as it happened).** Esc did not reach the agent before it acted. It explored, edited
  the scratch task's body (`git apply`), ran `wingfoil memory submit task-001-codex-smoke` with the GLOBAL `wingfoil`
  on `PATH` (the published 0.2.2, which warned `HEAD:.wingfoil/memory.yaml: unknown field(s) ignored: format`), and
  amended that commit (`13605ed`, no `WingFoil-Version:` trailer, the global build's submit) with `Co-Authored-By:
  Codex <codex@openai.com>` and `AI-Model: GPT-5`, while the model it ran as was `gpt-5.6-terra`. The scratch
  worktree was clean at the end. Only the scratch project changed; nothing in this repository.
- **R3:** `/mcp` shows `wingfoil` with `Auth: Unsupported, Tools: (none), Resources: (none), Resource templates:
  (none)` although `list_mcp_resources` returned four resources and the template read succeeded (Codex's display),
  beside the account's `codex_apps` connector. `/status`: Codex v0.145.0, model `gpt-5.6-terra` (reasoning xhigh),
  Permissions Workspace (Ask for approval), Session `01a13aef-8d19-72d3-a7b3-6b7f53a61e6d`, context 43.6K/258K. Codex
  printed a bubblewrap warning ("Codex's Linux sandbox uses bubblewrap and needs access to create user namespaces").
  `/exit`: `Token usage: total=64,110 input=56,406 (+ 756,480 cached) output=7,704 (reasoning 2,982)` and `codex resume
  01a13aef-…`.
- **R4:** record commit `1a035118` `agent: record task-001-codex-smoke/adhoc/2`, `WingFoil-Version: 0.2.2 (f7bddb03)`,
  only `docs/runs/task-001-codex-smoke.jsonl`. Record: `adapter` `built-in/codex-cli`, `agent` `Codex`,
  `agent_version` `codex-cli 0.145.0`, `model`/`session`/every `tokens` count `not-reported` (D-3), `state_ref`
  `d73292c6…`, `exit_status` 0, `notes` `none` (the Scrum task template has no `## Execution Notes`). `git status`
  clean; `agent list --past` → `adhoc/1` 93.9 s, `adhoc/2` 6258.5 s; `codex --version` still `codex-cli 0.145.0` (no
  auto-update); the rollout `~/.codex/sessions/2026/10/14/rollout-…-01a13aef-….jsonl` exists.
- **Findings for the coordinator to file (not fixed here):** (a) the launched agent ran the global `wingfoil` for its
  CLI work, not the build under test: nothing in the bootstrap names which CLI to run; (b) `/mcp` displays
  `Resources: (none)` for a server whose resources are read; (c) the agent's `AI-Model:` trailer named a model other
  than the one it ran as; (d) Codex's session id is visible (`/status`, exit line, rollout file) but recorded
  `not-reported`, by ruling D-3 (resume is v0.4); (e) the bubblewrap warning on this host. **None contradicts the
  manifest:** (a) and (c) are the agent's behaviour under §2.4's bootstrap; (b) and (e) are Codex's display and host
  sandbox; (d) is what D-3 declares (no option or command gives the id to a `command` + argv lookup).
- **ACs:** AC 1 met (tests, above). AC 2 met: MCP registration (the adapter's server answered and won, §2.5), the
  session-Resource read, the lookups (`agent_version` read, the rest `not-reported` as declared) and the record commit
  `1a035118`, with the commands, the CLI version and the record line in this entry. AC 3 met: the scratch agent entry
  `adapter: codex-cli` ran `agent execute` end to end, recorded `adapter: "built-in/codex-cli"` (`1a035118`).

### Pending amendments (approver) — final, uncommitted in the worktree

- `spec-016-agent-execution`: §2.2, §2.3, §2.5 (the `codex-cli` outcome), §2.8 (`codex-cli` row, checked by hand on
  2026-10-14 with codex-cli 0.145.0 (ChatGPT sign-in)), Revision note. Proposed `--reason` (replaces the one above):
  "task-237: approver ruling D-1 (a) of 2026-10-14. Codex CLI 0.145.0 registers MCP servers only through TOML
  configuration layers and -c key=value overrides, so a third mcp.via value, config-arg, passes the rendered
  mcp.template as the one whole argument {mcp_config}, which keeps placeholders filling whole arguments; the manifest
  format stays 1 because no released build reads adapter manifests. Section 2.8 fills the codex-cli row from codex
  --help of codex-cli 0.145.0, with session, model and usage not reported and resume not supported, checked by hand
  on 2026-10-14 with codex-cli 0.145.0 (ChatGPT sign-in): the model read the unlisted session Resource the bootstrap
  names with no help. Section 2.5 records that the adapter's -c override won over a same-named server in the
  project's .codex/config.toml."

### Retrospective

- **What the design caught before the build.** The help output alone showed Codex could not take the running build's
  server under the format-1 rules (no config-file option, only one-argument `-c` overrides); raising it as D-1 before
  red, rather than after a failed by-hand pass as in task-236, kept the change to one red/green cycle. Reading the
  binary's tool definitions settled question 3 (resources readable by the model) before the run; the run confirmed it.
- **Rehearse the runbook's setup without the agent.** The dry rehearsal in a throwaway directory found that ruling
  D-5's address is refused by the schema before the approver spent a Codex session on it.
- **The stop line still does not stop the agent in time** (as in both task-236 runs): the launched agent worked on
  the scratch task, with the global `wingfoil`. A harmless scratch element made that cost nothing; finding (a) is the
  real lesson (the bootstrap does not say which `wingfoil` to run).
- **Coverage of child-process paths.** Red's end-to-end test ran the compiled CLI, so its branches did not count; one
  in-process test of the same hand-over restored the column. Worth a qa-brief note for future integration-only reds.
