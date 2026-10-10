---
id: "task-228-agent-execute-launches-agent-forwards-right-signals-records"
type: task
title: "`agent execute` launches the agent, forwards the right signals, records the run and reports it on stderr only"
status: in-review
release: "v0.3"
kind: "feature"
priority: "high"
tags: ["v0.3", "agent", "cli", "performance"]
ref: "adr-012"
bug: ["bug-288"]
depends_on: ["task-178-add-git-conventions-directive-id-allocation-hand-rule", "task-206-agent-execute-records-run-json-lines-line-under", "task-218-agent-execute-element-resolves-role-agent-adapter-assembles"]
tmpl_version: 260703
---

## Description

This task adds the launch half: - step 13's banner, the spawn with `launch.interactive.args` (plus `session.assign_args`), and the wait; - signal handling: `SIGINT`/`SIGQUIT` ignored during an interactive run, `SIGTERM`/`SIGHUP` forwarded; - the post-run lookups with their 10 s limit (`not-reported` on failure); - the record appended and committed through task-206, and the post-run summary line; - the exit code (`0` only when the agent exited 0 and the record committed). WingFoil writes nothing to stdout, and `--format json|yaml` only reshapes the stderr lines. The task also carries the document amendments `adr-012` assigns to "the task that implements P5.3.1".

## Acceptance Criteria

- (red-first) With the `terminal: optional` fake, the full adhoc run: the fake receives exactly the argv its manifest renders, with no shell; one record is appended with `mode: "fresh"`, `workflow: "n/a"`, `phase: "adhoc"`, `result: "n/a"` and the fake's declared session, model and tokens; exactly one new commit exists, `agent: record <run-id>`; exit `0`, and stdout of `agent execute` itself is empty. These are REQ-INT-07's (amended) four fit-criterion assertions, with no real agent and no terminal.
- (red-first) Agent exit `3` → record with `exit_status: 3`, exit `1`, `agent exited 3; run <id> recorded`. `SIGTERM` sent to `agent execute` reaches the fake → `exit_status: "signal:SIGTERM"`, recorded. `SIGINT` sent to `agent execute` does not kill it, and the run is still recorded.
- (red-first) `session.id: assign` passes a UUIDv5 over `<abs root>\n<run id>`: stable for the same clone and run, different for another run id. `lookup` failure or timeout → `not-reported` plus a `warning:` line, and the run still succeeds.
- (red-first) `--format json` → each stderr message is one JSON document (`{warning}`, `{error, hint?, details?}`, `{run: <record>}`). Stdout stays empty.
- (characterization) REQ-PERF-01: steps 1–14 (to the spawn instant) finish under 30,000 ms. This is asserted with the repository's existing latency-test pattern (not a single wall-clock sample; see `bug-012`'s class) on a fixture of `spec-012` §6's default limits.
- (characterization) Docs, each with a `doc-versioning` bump: `REQ-INT-07` replaced by `adr-012`'s text, and `04_integrations.md:4`'s derivation line "Agent SDK" → "agent CLI"; `06_features.md`: the P5.3.1 description gains the run record and execution modes, and the P5.3.1 / P5.4.4 dependency cells (`:238`, `:244`) read "Agent CLI adapter" (P5.4.5 untouched); `spec-005` §2 gains Q8's sentence; `spec-008` carries the full `agent execute` grammar of `spec-016` §3.1, plus `agent list` / `agent show` rows (the `X_cli-cmds.md` rows are task-245's); BDD `P5.3.1-agent-execute.feature` gains the run-record scenarios, `--agent`, and sc. 2's full-id fixture note; `docs/cli-reference.md` `agent execute` entry, stating it reads `HEAD` (`dl-084` (A)).
- (red-first) `dl-117` Action 4: `agent execute` applies the attribution rule of the `git-conventions` directive (task-178) in the way the approver rules at design (backlog question Q8: the bootstrap instructs the agent to attribute its own commits, and/or the `agent: record` commit carries the trailers — `spec-016` §4.4 says that commit has no other body); a test pins the chosen form.

## Implementation Notes

- **Size:** M · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** adr-012 points 1, 4 (interactive), 5; spec-016 §2.5, §2.6, §3.3 steps 13–18, §3.4, §3.6, §3.7 (last three rows); REQ-INT-07 (amended); REQ-PERF-01; dl-117 Action 4 (code half).
- **Features:** P5.3.1, P5.4.3.
- **Planning ruling:** Approver ruling 2026-09-30 (plan R20, Q8): the AI-attribution rule of `dl-117` travels in the bootstrap prompt, so the agent applies it to the commits of its work; the `agent: record <run-id>` commit stays as spec-016 §4.4 defines it.
- **Notes:** Proposal key: B10. `X_cli-cmds.md` Agent Execution rows are task-245's (one owner for the file). The run's warnings and errors use task-169's stderr renderer and task-130's error shape.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.
- **Handover from wave 3 B1 (2026-10-07, `task-206`, `task-210`, `task-196`).** `recordRun` writes through `task-210`'s `writeAndCommit` and, on any failure after serialization, returns `IO` / `CONFLICT` / `VALIDATION` with the record as a `details` line and the project root stripped: forward that to stderr unchanged, so a run is never lost. Run `runLogPreflight` before the spawn (step 6) and `recordRun` after it (step 17). If `task-218` has not already done it, add `agent execute` to `REVIEWED_AGENT_WRITERS` (`test/core/builtin-adapter-writers.test.ts`) and to the dry-run table (`test/cli/dry-run.integration.test.ts`).
- **Handover from the W3 B1 triage (2026-10-07, approver).** `paths.runs` (`docs/06_runs/` in this repository, `task-206`) sits inside `paths.docs` (`docs/`), so a run-log file belongs to two categories. Ruling: keep the overlap; state in `spec-016` §4.1, in the same pending amendment as `bug-288`'s tightening, that path categories may nest and that `paths runs` and `paths docs` both list the run log.
- **Handover from wave 3 B2 (2026-10-07, `task-200`).** Drive the signal, exit-code and lookup cases through the fake agent: `WINGFOIL_FAKE_AGENT_EXIT` / `_WAIT` apply to the launch only, `WINGFOIL_FAKE_AGENT_LOOKUP=fail|hang` makes a post-run lookup fail or hang while the launch succeeds, and a declared lookup document gets the asked-for `session_id`. The record holds environment variable names only (REQ-SEC-08).
- **Handover from wave 3 B3 (2026-10-09, `task-218`'s review; W3 B3 follow-ups).**
  - `MCP_PREFLIGHT_TIMEOUT_MS` (30 000, `src/agent/execute.ts`) is passed separately to `client.connect` and to the
    Prompt request, so the pre-flight can take about twice it (≈60 s) against REQ-PERF-01's 30 s: use one deadline.
  - A SIGINT during the pre-flight leaves the `wingfoil-run-*` temporary directory (`mkdtemp`, step 10) behind.
  - A successful `agent execute` prints the same `dna.yaml` unknown-key warning twice (the pipeline and the context
    builder both load `dna.yaml`), and its label carries a full sha; print it once (review F5).
  - Hand the agent its signing entry's `name <email>` in the bootstrap (`dl-158` Rule 1 (a); `task-218` decision 9
    left it to this task; the entry is `PreparedLaunch.agent`).
  - Remove the interim refusal `agent execute cannot launch an agent yet` (`src/core/agent-execute.ts`) before v0.3
    ships: this task's launch replaces it.
  - `dl-165` (`in-discussion`, v0.3) asks whether the pre-flight's `wingfoil mcp` keeps reading the working tree's
    `dna.yaml` (the exception `spec-016` §3.3 step 11 declares), reads `HEAD`, or is handed the run's commit; rule it
    with this task's design, since the agent you launch starts the same server.

## Execution Notes

Branch `task/task-228-agent-execute-launches-agent-forwards-right-signals-records`, cut from `main` at
`b56e8721` (wave 3, batch B4); start `714b02bb`, bug sync `ac6c079a` (bug-288 `planned → in-progress`).

### design (architect)

**`depends_on` (dl-015).** task-178, task-206, task-218 are `done` (`grep -m1 "^status:"` on each). Used:
- task-218 — `agentExecutePipeline(root, request, host, launch)` runs §3.3 steps 2–12 and hands
  `PreparedLaunch` to a launch callback; its decision 9 leaves the signing entry's `name <email>` in the
  bootstrap to this task; its interim refusal is removed here.
- task-206 — `recordRun` (append + `agent: record <run-id>` commit through `writeAndCommit`, the record
  as a `details` line on every refusal after serialization), `deriveNotesField`, `NOT_REPORTED`.
  `REVIEWED_AGENT_WRITERS` and the dry-run row already carry `agentExecute` (task-218).
- task-178 — `git-conventions` §7, the attribution rule the bootstrap now carries.
- task-200's handover — the fake's `WINGFOIL_FAKE_AGENT_EXIT` / `_WAIT` / `_LOOKUP` drive the exit, signal
  and lookup cases.

**Specs.** spec-004, 005, 006, 008, 009, 012, 014, 016 `approved`; adr-012 `accepted`; dl-117, dl-158
`ready`; dl-165 `in-discussion` (`grep -m1 "^status:"` on each).

**Design.**
- `src/agent/launch.ts` (new): the launch half, §3.3 steps 13–18.
  - `assignedSessionId(root, runId)` — UUID version 5 (RFC 4122, SHA-1) over a fixed namespace and
    `<root>\n<run id>` (§2.6). The namespace is itself the v5 UUID of the name
    `wingfoil:spec-016:session` in RFC 4122's URL namespace, written as a constant and re-derived by a test.
  - `renderLaunchArgv` — `launch.interactive.args` (+ `session.assign_args` under `assign`), each
    placeholder filling whole elements, `{mcp_args}` expanding to several (§2.3).
  - the spawn: `command` as a name (resolved on `PATH` by the OS, no shell) or a repository path
    resolved against the root; `cwd` = root; stdio inherited; environment passed through. A `host.spawn`
    override exists for the in-process suites only (no surface builds `host`).
  - signals (§3.3 step 15): from the spawn until the record is committed `SIGINT`/`SIGQUIT` are ignored
    and `SIGTERM`/`SIGHUP` are forwarded to the agent while it runs; all four listeners are removed on
    every exit path.
  - post-run (§3.3 step 16): `version_args`, `session.lookup_args`, `usage.lookup_args` run as
    `command` + argv with a 10 s limit each (`execFile`, no shell); one identical argv runs once.
    Failure or timeout → `not-reported` and a `warning:` line; a value present but of the wrong type →
    `not-reported` and a warning; `session.id: output` under an interactive launch → `not-reported`.
  - the record (§4.2) through `recordRun`; `notes` through `deriveNotesField`; `wingfoil` =
    `readBuildStamp()`.
  - exit (§3.3 step 18): success only for an agent exit `0` with the record committed; agent exit ≠ 0 or
    a signal → `IO` `agent exited <exit_status>; run <id> recorded`, `details: {run_id, exit_status}`
    plus the post-run summary as a `dl-055` detail line; a failed record commit → `recordRun`'s refusal
    unchanged (record in `details`).
- **stderr only (§3.4).** The registrar gains `CoreOperation.renderToStderr(value)`: when it returns a
  report, the registrar writes it to stderr in the active format (console: the summary line; json: one
  `{"run": <record>}` line; yaml: one `---`/`...` document) and nothing to stdout. The dry-run plan
  returns none and stays on stdout (spec-008 §2). The step-13 banner is a **notice**: a third channel
  beside warnings and errors (`reportNotice`, installed by the registrar like the warning sink):
  console `run <id>: launching …`, json `{"notice": …}`, yaml one document.
- **Attribution (AC 7, dl-117 Action 4, ruling R20 Q8).** §2.4's bootstrap gains one fixed line, after
  the handoff line, naming the selected entry (`dl-158` Rule 1 (a)):
  `End every commit of your work, except an approve or reject commit, with the trailer paragraph "Co-Authored-By: {agent_name} <{agent_email}>" and "AI-Model: <the model identifier you run as>" (git-conventions §7).`
  The bootstrap becomes a pure function of `(role, element, run id, state_ref, agent entry)`; the
  `agent: record` commit keeps §4.4's form. spec-016 §2.4 revision (pending amendment).
- **Handovers from the B3 gate.**
  - One deadline for the MCP pre-flight: one timer covers `connect` and the Prompt fetch.
  - SIGINT/SIGTERM/SIGHUP before the spawn remove the `wingfoil-run-*` directory and re-raise the
    signal (`withRunFiles`), so a pre-flight interrupted from the keyboard leaves nothing behind; the
    launch detaches that handler when it takes over the signals.
  - The `dna.yaml` unknown-field warning printed twice with a full-sha label: the pipeline prints each
    distinct warning once, and a label `<state_ref>:` reads `HEAD:` (every read is at the one `HEAD`
    resolved at step 2).
  - dl-165: **kept as declared** (batch notes override the task's "rule it"): step 11's working-tree
    exception is unchanged; nothing in this task resolves it.
  - spec-016 §4.1 states that path categories may nest (`paths.runs` inside `paths.docs`), in the same
    pending amendment as bug-288's tightening.
- **bug-288.** spec-016 §4.2/§4.5: `exit_status` is an integer 0–255 or `signal:<NAME>`; a line must be
  byte for byte the writer's serialization of the record it parses to (no CR, no insignificant
  whitespace), else `line <k> is not a valid run record: not in the serialized form of §4.2`. The run
  log's confinement refusal names the configured target (`/etc/task-001.jsonl`), not a `../` climb:
  the shared `requireConfinedTarget` is given the joined `paths.runs` spelling, its text unchanged for
  every other writer.

**AC classification (T1).**

| AC | Class | Why |
|---|---|---|
| 1 full adhoc run with the `optional` fake | red-first | the command refuses after step 12 (`agent execute cannot launch an agent yet`) |
| 2 exit 3; SIGTERM forwarded; SIGINT ignored | red-first | same |
| 3 UUIDv5 session; lookup failure/timeout | red-first | same; no session id code exists (`grep -rn uuid src` → nothing) |
| 4 `--format json` → stderr documents, stdout empty | red-first | same |
| 5 REQ-PERF-01 steps 1–14 < 30 s p95 | characterization | a budget over code that exists once green lands; written with the latency helper |
| 6 documents | characterization (documentation) | text only |
| 7 attribution in the bootstrap | red-first | the bootstrap has no attribution line (task-218 decision 9) |
| bug-288 | red-first | `serializeRunRecord` accepts `exit_status: -1`; `parseRunLog` accepts CRLF and spaces (bug's steps 2–4) |


### red (developer)

`3db31d6c` — `test/cli/agent-execute-launch.integration.test.ts` (AC 1–4, 7, the B3 duplicate-warning
handover), `test/agent/launch.test.ts` (UUID v5 against an independent RFC 4122 implementation, argv
rendering, JSON paths, the attribution line), bug-288 cases in `test/agent/run-log.test.ts`, the
pre-flight's one deadline and the pre-spawn signal cleanup in `test/agent/execute.test.ts`, the launch
half in `test/core/agent-execute.test.ts`; `test/cli/agent-execute.integration.test.ts` loses the
interim-refusal case and its bootstrap gains the attribution line. `npx jest <the six files>` →
**66 failed, 123 passed, 189 total** (6 suites failed; `devloop-kit/task-228-scratch/red.log`), load ≈380
(`uptime`). The reasons are the intended ones: `error: agent execute cannot launch an agent yet` on
every launch case, missing `src/agent` exports (`assignedSessionId`, `renderLaunchArgv`, …), `exit_status:
-1` written, a CRLF line read, the run log's refusal naming a `../` climb, a second dna.yaml warning line.
`test/core/agent-execute.test.ts` fails as a whole suite at red (it imports `withNoticeSink`, which did
not exist), so its 25 pre-existing cases count among the 66.

### green (developer)

`d7e5a512` — `src/agent/launch.ts` (steps 13–18), `src/agent/execute.ts` (attribution line, element and
template paths in `PreparedLaunch`, `withRunFiles` signal cleanup + `release`, one pre-flight deadline,
`withDistinctWarnings` around the pipeline with the `<sha>:` → `HEAD:` label), `src/core/agent-execute.ts`
(launch instead of the interim refusal; `renderAgentExecuteStderr`), `CoreOperation.renderToStderr` +
`StderrReport` (`src/core/registry.ts`), the notice sink (`src/validation/warning.ts`), `emitNotice` /
`emitStderrDocument` (`src/cli/warning.ts`), the registrar (notice sink; a stderr report and nothing on
stdout), `src/agent/run-log.ts` (bug-288). `npx jest <the six files>` → 188 passed, 1 failed: a test
defect (my `session.id: lookup` manifest edit also stripped `{session_id}` from `session.resume.args`,
which the validator rightly refused); fixed, `npx jest test/core/agent-execute.test.ts -t "launch half"` →
5 passed.
`d8e20faa` — AC 5, `test/agent/agent-execute-latency.test.ts`: `sampleLatency(MIN_RUNS, …)` in process,
the host's `spawn` ending each run at the spawn instant, on a fixture of 60 relevant ~7 KiB documents (both
`spec-012` §6 default caps exceeded). One reading with the budget forced to 1 ms (reverted, `git diff`
empty after): **p95 10,328 ms (n=20, min 5,621, max 11,395)** at load ≈78 (`uptime` 22:54–22:59) — under
30,000 ms on a loaded machine. `test/core/latency-budget-placement.test.ts` passes (no spawn marker in the
file: the pre-flight server is started by the code under test).
`fdca5e0e` — documents (AC 6): `04_integrations.md` REQ-INT-07 replaced by adr-012's text and the derivation
line's "agent CLI" (SARD files declare no `version`, so no bump: `doc-versioning`), `03_sard/00_index.md`'s
REQ-INT-07 row; `06_features.md` 1.11 → 1.12 (P5.3.1 description: run record and execution modes;
P5.3.1/P5.4.4 dependency cells "Agent CLI adapter"; P5.4.5 untouched), `01_vision/00_index.md` row and
"Last indexed"; BDD `P5.3.1-agent-execute.feature` (revision comment, sc. 2 full-id note, three run-record
scenarios, `--agent`); `docs/cli-reference.md`'s `agent execute` entry (reads `HEAD` with the pre-flight's
working-tree exception, the launch, signals, lookups, exit codes, stderr only, the commit).

### refactor (developer)

`03a382dc`, `d39e8676`, `45fa671a`:
- **A real defect found by the new in-process tests.** `launch.ts` held `NO_TOKENS` as a module constant
  built from `run-log.ts`'s `NOT_REPORTED`; under the `src/core` ↔ `src/agent` import cycle the constant
  was built while `run-log.ts` was still loading, so `tokens` read `undefined` and `recordRun` refused the
  record (`run record is not valid: 'tokens.input' …`) for every adapter with `usage.from: none` loaded
  through `src/agent` first. The compiled CLI loads in another order, which is why the CLI suite passed.
  Now a function read at call time (`noTokens()`).
- `test/agent/launch-process.test.ts` + `test/agent/helpers/launch-input.ts`: `launchAgent` driven directly
  for the lookups the fake does not declare (prints nothing, no JSON, killed by SIGKILL, wrong-typed
  session id, one argv shared by session and usage runs once, `version_args` exiting 1) and an agent
  command the OS cannot start. An in-process `SIGTERM` case was dropped: sent to the Jest process it also
  reaches Jest's own handling and hung the run (`timeout 300 npx jest test/agent/launch-process.test.ts` →
  `Terminated`); forwarding is asserted on the compiled CLI.
- `test/cli/registrar.test.ts` (notice then report on stderr in console/json/yaml, stdout untouched; a
  value with no stderr report goes to stdout), `test/validation/warning.test.ts` (`withDistinctWarnings`
  with and without a sink, `reportNotice`).
- Same-class consequences of bug-288's strict reader: `test/core/agent-show.test.ts`'s two R1 cases (a
  `\u` escape, a CRLF ending) now assert the refusal; `src/core/agent-show.ts`'s comment on R1 updated.
  `test/cli/dry-run.integration.test.ts`'s `agentExecute` row now asserts the real run makes the planned
  commit (subject, paths).
- spec-016's §4.1 sentence first named `docs/06_runs/` as a backticked path, which
  `test/docs/name-resolvability.test.ts` flagged (no such directory yet): reworded to name the categories.

Gates (pending amendments on disk):
- `npm run test:coverage` (before `d39e8676`) → **323 suites, 6112 passed, 0 failed**, All files **99.11 |
  96.62 | 97.38 | 99.6** (`devloop-kit/task-228-scratch/cov2.log`, load 24–50). The W3 B3 gate measured
  99.2 | 97.01 | 97.48 | 99.67 (`devloop-kit/gate-w3b3-cov.log`). Final run: see review.
- Final `npm run test:coverage` at `45fa671a` → **323 suites, 6115 passed, 0 failed**; All files **99.14 |
  96.79 | 97.38 | 99.62** (`devloop-kit/task-228-scratch/cov4.log`, load 15–34). The base `b56e8721`,
  measured the same morning in a detached worktree of it → 319 suites, 6050 passed, **99.2 | 97.03 | 97.48 |
  99.67** (`devloop-kit/task-228-scratch/base-cov.log`). The gap (−0.06 | −0.24 | −0.10 | −0.05) is in
  `src/agent` (98.07 → 96.66 functions, 93.08 → 91.52 branches): the signal listeners — the pre-spawn
  cleanup (`execute.ts` 198–200) and the forwarding of `SIGTERM`/`SIGHUP` (`launch.ts` 146) — run only in a
  spawned process (the CLI suite and `test/agent/execute.test.ts`'s signal cases assert them, coverage does
  not measure them), plus the `win32` signal lists and a `code ?? 0` that Node never takes. Listed under
  decisions.
- `npm run lint` 0; `npx tsc --noEmit -p tsconfig.json` 0; `npx tsc -p tsconfig.build.json --noEmit` 0;
  `npm run docs:api` 0; `node scripts/check-governance.cjs --base b56e8721` → 2 `wf()` commits, 0 findings.

### review (reviewer, self)

Per AC, with the case that holds it:
- AC 1 — met: `agent-execute-launch.integration.test.ts` › "task-228 AC 1": exact argv (`--mcp-config <tmp>
  --prompt <bootstrap bytes> --session-id <uuid>`, the quotes of the bootstrap intact, so no shell), one
  record `fresh`/`n/a`/`adhoc`/`n/a` with session, `fake-model` and 120/45/10/5, `rev-list --count` 1,
  subject `agent: record <id>`, only the run log in the commit, exit 0, stdout `''`, temporary directory
  empty.
- AC 2 — met: exit 3 → record 3, exit 1, `agent exited 3; run <id> recorded`; SIGTERM → `signal:SIGTERM`
  recorded, exit 1, `agent execute` not killed by the signal (`close` signal `null`); SIGINT → still alive
  1.5 s later, then recorded after a SIGTERM.
- AC 3 — met: the second run's argv and record carry the v5 UUID of `<toplevel>\n<id>/adhoc/2`, differing
  from run 1's; lookup `fail` → warning, `not-reported`, exit 0 (CLI); `hang` → `timed out after 1500 ms`
  (in process, `lookupTimeoutMs`).
- AC 4 — met: json `[{warning},{notice},{run}]` with `run` equal to the committed record; exit 3 →
  `[{notice},{error}]`; yaml one document per message; stdout `''` in all.
- AC 5 — met (characterization): p95 10,328 ms < 30,000 over 20 runs, loaded (green above).
- AC 6 — met: `fdca5e0e`; spec-005 §2 and spec-008 §12 are pending amendments (below).
- AC 7 — met: the bootstrap's attribution line names the selected entry (`launch.test.ts`, the CLI
  `--agent` dry-run case, and AC 1's exact argv); the record commit keeps §4.4's form (subject and the
  `WingFoil-Version:` trailer only, `rev-list`/`show` in AC 1).
- bug-288 — met: writer and reader refuse `-1`/`256`; reader refuses CRLF, whitespace outside a string and
  any other spelling; the run log's confinement refusal names `/etc/task-001.jsonl`.
- B3 handovers — one pre-flight deadline (`execute.test.ts` › "one deadline"); the temporary directory gone
  after SIGINT/SIGTERM/SIGHUP before the spawn, the process ended by that signal (`execute.test.ts`); the
  dna.yaml warning once, `HEAD:` label (CLI case); the signing entry in the bootstrap; the interim refusal
  removed (`grep -rn "cannot launch an agent yet" src docs/cli-reference.md` → nothing); dl-165 untouched.
- Same-class sweep: every caller of the run-log reader (`grep -rn "parseRunLog\|readRunLogAt" src`) —
  `agent show` (its R1 tests updated) and `nextRunId`/`recordRun` — reads through the one strict rule.
- **Unasserted (T1).** That an interactive agent CLI with a real terminal leaves keyboard signals to the
  foreground group as assumed: no automated test has a terminal (`spec-016` §2.7, `adr-012`); the two
  built-in adapters' `verified_with` pass is by hand (task-246's).

**Pending amendments (approver)** — uncommitted in the worktree, proposed `--reason`s:
- `spec-016-agent-execution`: "task-228: the launch half ships. Section 2.4's bootstrap gains the attribution line naming the signing entry (dl-117 Action 4, ruling R20 Q8, dl-158 Rule 1 (a)); section 2.6 fixes the assign namespace and states how a post-run lookup runs; section 3.3 gives step 11 one deadline, makes step 13's banner a notice, says how step 14 spawns, holds step 15's signal handling until the record is committed and removes the temporary files on a signal before the spawn; section 3.4 adds the notice document and the failed run's summary as a details line; section 3.7 adds the row for a command that cannot be started; section 4.1 states that path categories may nest; sections 4.2 and 4.5 bound exit_status to 0-255 and make each run-log line the writer's exact serialization (bug-288). The step 11 working-tree exception stays as declared while dl-165 is in discussion."
- `spec-008-cli-grammar`: "task-228: section 12 carries agent execute's grammar from spec-016 section 3.1, the step forms marked unregistered before task-235, and the agent list and agent show rows; section 6 pins the launch's lookup warnings, says agent execute prints each distinct unknown-field warning once under a HEAD: label, and describes the notice and the stderr success report of a command whose stdout belongs to a child."
- `spec-005-cli-command-contract`: "task-228: section 2 gains spec-016 Q8's sentence: a command that hands its stdout to a child process writes no payload on stdout and puts its structured messages on stderr; agent execute is that command, and its dry-run plan stays on stdout."

**Decisions for the approver.**
1. **Attribution wording** (§2.4): `End every commit of your work, except an approve or reject commit, with
   the trailer paragraph "Co-Authored-By: <name> <<email>>" and "AI-Model: <the model identifier you run
   as>" (git-conventions §7).` — the bootstrap's last line; a §2.4 literal, so a spec-016 revision.
2. **A notice channel** for the step-13 banner (`reportNotice`, `{"notice": …}` under json): §3.4 listed
   only warning/error/run documents, and the banner had no shape there.
3. **`CoreOperation.renderToStderr`**: the registry field by which a command reports its success on stderr
   and nothing on stdout; the dry-run plan keeps stdout.
4. **A failed run's summary** rides the error as its one `details` line, not a separate line before it.
5. **Signals after the agent exits**: `SIGTERM`/`SIGHUP` stay handled (ignored) until the record is
   committed, so steps 16–17 cannot lose the run; before the spawn they, and `SIGINT`, clean up and
   re-raise.
6. **bug-288's reader is stricter than the bug asked**: a line must equal the writer's serialization, so a
   `\u` escape or `1.0` is refused too, not only CRLF and whitespace (one rule, no tokenizer). This reverses
   two task-220 R1 cases (`agent show` attributed such lines); their tests now assert the refusal.
7. The run log's confinement refusal is fixed by passing the configured spelling to the shared
   `requireConfinedTarget`; its text for the other writers is unchanged.
8. **Coverage**: −0.24 branches against the base, all in signal handlers that only run in spawned processes
   and in platform branches (refactor above). Not chased with in-process signals: one hung Jest.
9. `spec-008` §12 lists `--next`/`--workflow`/`--step` (task-235) and `agent list`'s flags (task-240) as
   not yet registered, per the AC's "full grammar"; no parity gate reads §12.

**Candidate findings (not filed).**
- The `src/core` ↔ `src/agent` import cycle (`src/core/index.ts` → `agent-execute.ts` → `src/agent` →
  `run-log.ts` → `src/core/*`): a module constant built from another module's export can be `undefined`
  depending on load order (found here: `NO_TOKENS`, fixed). Others may exist; a lint or a test that loads
  each module first would find them.
- The AtRev loaders label a file `<rev>:<path>` with whatever string the caller passed, so a caller that
  resolved `HEAD` first gets a 40-hex label; `agent execute` rewrites it, other callers do not. A `label`
  parameter on the loaders would fix it at the source.
- A signal sent to the Jest process during an in-process test that installs a signal listener hangs the
  run (`timeout 300` → `Terminated`): worth a line in the testing directive or the fake's header.

**Merge-order notes.** Merges after task-216 (batch order). Shared with 216: `docs/cli-reference.md`,
spec-005/spec-008 (pending amendments; mine add §2's sentence, §12 rows and §6 text — recorded after 216's),
the `CORE_MODULES` `agent` block, and `src/cli/registrar.ts` if 216 touches the call site (mine wraps the
warning sink in a notice sink and adds the stderr-report branch). No B4 workflow/config file is touched
(`git diff --stat b56e8721 -- .wingfoil` → nothing), so 219/222/221/212/269/270 do not conflict here.
spec-016 is touched by no other B4 task.

### Retrospective

- The in-process tests found a defect the CLI suite could not: an import-cycle constant (`03a382dc`).
- A signal test belongs in a spawned process: the in-process one hung Jest for the whole timeout.
- bug-288 rode along with a feature task; its strict reader changed another task's pinned behaviour (R1),
  which only the full suite showed (`cov.log` › `agent-show.test.ts`).
