---
id: "task-228-agent-execute-launches-agent-forwards-right-signals-records"
type: task
title: "`agent execute` launches the agent, forwards the right signals, records the run and reports it on stderr only"
status: in-progress
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

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
