---
id: "task-243-e2e-smoke-gate-drives-agent-execute-through-fake"
type: task
title: "The `e2e-smoke` gate drives `agent execute` through the fake adapter in a fresh `init` project from the packed tarball"
status: in-progress
release: "v0.3"
kind: "feature"
priority: "medium"
tags: ["v0.3", "agent", "e2e-smoke", "testing"]
ref: "spec-016"
bug: []
depends_on: ["task-196-wingfoil-init-installs-builtin-adapters-protected-builtin-assets", "task-207-drive-e2e-smoke-through-fresh-project-use-scenario", "task-220-wingfoil-agent-show-run-id-prints-recorded-run", "task-228-agent-execute-launches-agent-forwards-right-signals-records", "task-240-wingfoil-agent-list-past-waiting-lists-recorded-runs"]
tmpl_version: 260703
---

## Description

The smoke gate exercises the packaged tarball. With `agent execute` shipped it also runs one adhoc run from a fresh `init` project, with the fake as a custom adapter and an agent entry pointing at it. It then re-validates what the command wrote: the run log line passes task-206's reader, and `agent show` returns it (`bug-133`'s rule, re-load what was written).

## Acceptance Criteria

- (red-first) `test/cli/e2e-smoke.test.ts` (or the smoke script) installs the tarball in a temp project, runs `init`, adds the fake adapter under `agents/custom/` and the agent entry, and runs `agent execute --element … --role developer`. Exit 0; exactly one `agent: record` commit; `agent show <id>` exit 0.
- (red-first) Outcomes are asserted beyond exit 0: the record's `adapter` is `custom/fake`, and `agent list --past --format json` contains the id.
- (characterization) The smoke plan / report template names the new step.

## Implementation Notes

- **Size:** S · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** spec-016 §2.7 (last bullet); dl-023; dl-099 (per-candidate gate).
- **Features:** P5.3.1.
- **Notes:** Proposal key: B16. Reuses task-207's reworked smoke script (exact exits, re-load of what was written, report under `produces:`).
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

### design (developer, 2026-10-14)

- **Start.** Branch `task/task-243-e2e-smoke-gate-drives-agent-execute-through-fake`, start commit `c0868cb6` (cut from
  `32d8871b`); the approved task-237 branch (with approved task-236) merged in at `f4bec66c` (`git log --oneline -3`).
  No bug in `bug:`.
- **depends_on / handovers read (dl-015).** task-207 (the scenario as data in `smokeSteps`, one check per step with the
  clean-tree check folded in, `smokeTemplate(template, invoke, env, steps)`, the fault proxy
  `test/fixtures/smoke/wingfoil-proxy.cjs`, `scripts/e2e-smoke.d.cts` written in red so failures are assertions, the
  report of `formatReport`, the `ci.yml` `e2e-smoke` job on the packed tarball); task-196 (`init` installs
  `agents/built-in/` and an empty `agents/custom/.gitkeep`); task-228 (the launch half: interactive launch with no
  terminal through `fake.yaml`'s `terminal: optional`, one `agent: record <run-id>` commit holding only the run log,
  empty stdout); task-220 (`agent show <run-id>`); task-240 (`agent list --past`); task-236 (bootstrap names ONLY the
  session Resource `wingfoil://session/{role}/{element}/{state}`, D-E/D-F); task-237 (the fake gains
  `--mcp-config-json`; its handover: "task-243's smoke uses the fake", existing behaviour unchanged).
- **Cited elements.** spec-016 `approved`; dl-023 and dl-099 `ready` (`grep -m1 '^status'`). spec-016 §2.7's last
  bullet already says the smoke uses the same fake from a fresh `init` project; spec-015 §3 says a change to the smoke
  "propagates here" (`grep -n "propagates here" spec-015-*.md` → line 273). **No spec amendment expected.** No
  contradiction between the ACs and the ratified elements found.

**Evidence: the run works today on the code this task merges (scratch, task-237's `dist/` = `aae189bc`'s code).**
In a throwaway repo with the smoke's identity: `init --template Scrum` → `paths.runs: [docs/runs/]`, no `team.agents`;
`memory add --type task --title "Agent task"`; `fake.yaml` copied to `.wingfoil/agents/custom/` and `fake-agent.cjs` to
`test/fixtures/agents/` (the manifest's argv names that repository-relative path), committed; `dna add team.agents
--value "Fake Agent" --entry-email fake-agent@example.com --entry-executes_as developer --entry-adapter fake` → exit 0
(with `smoke@wingfoil.invalid` → exit 1, `an agent email may not be on a reserved top-level domain … bug-261`);
`WINGFOIL_FAKE_AGENT_CONNECT=1 WINGFOIL_FAKE_AGENT_RECORD=<outside> agent execute --element task:<id> --role developer`
from `spawnSync` with pipes (no TTY) → exit 0, stdout `""`, stderr `run <id>/adhoc/1: launching Fake Agent (custom/fake)
…`, one commit `agent: record <id>/adhoc/1` touching only `docs/runs/<id>.jsonl`, tree clean; the fake's record line:
`mcp.server.name` `wingfoil`, `mcp.resource.uri` `wingfoil://session/developer/task:<id>/<HEAD before the record>`,
`mcp.text` starting `# WingFoil Agent Context` / `<!-- format: 1 | role: developer | element: task:<id> | state: <sha>
-->`; `agent show <id>/adhoc/1 --format json` → exit 0, `run.adapter` `custom/fake`; `agent list --past --format json` →
`{"baseline":…,"past":[{…"id":"<id>/adhoc/1"…}],"diagnostics":[]}`. With `WINGFOIL_FAKE_AGENT_EXIT=3` → exit 1, still
recorded. A run log overwritten with non-JSON and committed → `agent show` and `agent list --past` exit 1 (`line 1 is not
a valid run record: not JSON`).
- **TTY.** None needed: `fake.yaml` declares `launch.interactive.terminal: optional` (spec-016 §2.7), which is how
  task-228/240's integration tests run it under Jest's pipes; `fake-terminal.yaml` is not used.
- **How the fake reaches the MCP server in the packed install.** `{mcp_command}`/`{mcp_args}` are the running build
  (`runningBuildMcpServer()`: `process.execPath` + `<that build>/dist/cli.js mcp`, `src/agent/execute.ts:165-166`), so
  from the installed bin the fake starts the INSTALLED package's server, never the checkout's or `.mcp.json`'s. With
  `WINGFOIL_FAKE_AGENT_CONNECT=1` the fake reads the Resource the bootstrap names. **Exit 0 alone does not prove the
  read:** `fetchResource` resolves a JSON-RPC error as an answer and the launch still exits 0
  (`test/fixtures/agents/fake-agent.cjs` `if (answer.error) return finish(null, …)`), so the smoke reads the fake's
  record file (outside the repository) — the `fake-read` probe below.

**Design.** A new, separate scenario — its own functions, so task-282 (B8, `--candidate`/pack inputs) never edits
them — run in its OWN fresh throwaway `init` project per template, right after that template's `smokeTemplate`:

- `scripts/e2e-smoke.cjs` exports, beside the existing ones:
  - `AGENT_FIXTURES` = `join(__dirname, '..', 'test', 'fixtures', 'agents')` (the checkout's fixtures: the tarball does
    not ship `test/`, and the smoke always runs from a checkout — CI job, `--candidate`, publish-staging);
  - `agentRunSteps(template)` → the scenario as data (below);
  - `smokeAgentRun(template, invoke, env, steps = agentRunSteps(template), fixtures = AGENT_FIXTURES)` → `SmokeCheck[]`:
    a fresh throwaway git repo with the smoke identity (same set-up as `smokeTemplate`, shared helper), every check
    labelled `[<template>/agent] …`, the clean-tree check after every step, stop at the first failure; the env given
    to every step is `env` minus every `WINGFOIL_FAKE_AGENT_*` variable; a step with `fakeAgent: true` adds
    `WINGFOIL_FAKE_AGENT_CONNECT=1` and `WINGFOIL_FAKE_AGENT_RECORD=<a file in a throwaway dir outside the repo>`;
    both dirs removed in `finally`.
  - `runSmoke` calls it after each template's `smokeTemplate` checks (Scrum, Scrum/agent, Kanban, Kanban/agent);
  - `formatReport` gains, after `- Templates: …`, exactly:
    ``- Agent run: `agent execute` through the fake adapter `custom/fake` in a fresh project per template (spec-016 §2.7)``.
- Two new step kinds and one flag (declared by qa in `scripts/e2e-smoke.d.cts`, as task-207's red did):
  - `SmokeCopyStep { copy: ReadonlyArray<readonly [from, to]>; commit: string }` — `from` relative to `fixtures`, `to`
    relative to the project; copied byte for byte, `git add` of the `to` paths, `git commit -m <commit>`. Label
    `[<T>/agent] commit <to1>, <to2>`.
  - `SmokeProbeStep { probe: 'record-commit' | 'fake-read'; run: string; role?: string }` — `run` may hold a
    `{agent.id}` placeholder. `record-commit`: in `git log --format=%s`, exactly ONE subject starts with `agent: record `
    (detail on failure: `expected exactly one "agent: record" commit, found <n>`), it equals `agent: record <run>`, and
    that commit changes only `docs/runs/<element-id>.jsonl` (`<element-id>` = `run` up to the first `/`). Label
    `[<T>/agent] one agent: record commit for <run>`. `fake-read`: the record file holds exactly one LAUNCH line (argv
    has none of `--version`, `--lookup`, `--summary`; on none: `the fake agent recorded no launch`), with no `failure`,
    `mcp.server.name` `wingfoil`, no `mcp.error`, `mcp.resource.uri` =
    `wingfoil://session/<role>/task:<element-id>/<parent of the record commit>`, and `mcp.text` containing
    `<!-- format: 1 | role: <role> | element: task:<element-id> | state: <that parent> -->`. Label `[<T>/agent] the fake
    agent read the session Resource for <run>`.
  - `SmokeStep.fakeAgent?: boolean` (above).
- `agentRunSteps(template)`, in order (`AGENT_TASK` = title `Agent run` → id `task-001-agent-run` in a fresh project):
  1. `['init', '--template', T]` exit 0;
  2. `['memory', 'add', '--type', 'task', '--title', 'Agent run', '--format', 'json']` exit 0, json, capture `agent`,
     expect `{ path: 'docs/memory/task/{agent.id}.md' }`;
  3. copy step `[['custom/fake.yaml', '.wingfoil/agents/custom/fake.yaml'], ['fake-agent.cjs', 'test/fixtures/agents/fake-agent.cjs']]`,
     commit `smoke: the fake adapter custom/fake (spec-016 §2.7)`;
  4. `['dna', 'add', 'team.agents', '--value', 'Fake Agent', '--entry-email', 'fake-agent@example.com', '--entry-executes_as', 'developer', '--entry-adapter', 'fake']` exit 0;
  5. `['agent', 'execute', '--element', 'task:{agent.id}', '--role', 'developer']` exit 0, `fakeAgent: true` — the last writer;
  6. `{ probe: 'record-commit', run: '{agent.id}/adhoc/1' }` (run id derived by spec-016 §4.3: `adhoc`, n = 1 in a fresh
     project — not parsed from stderr);
  7. `['agent', 'show', '{agent.id}/adhoc/1', '--format', 'json']` exit 0, json, expect `{ 'run.id': '{agent.id}/adhoc/1',
     'run.element': 'task:{agent.id}', 'run.role': 'developer', 'run.agent': 'Fake Agent', 'run.adapter': 'custom/fake',
     'run.exit_status': 0 }`;
  8. `['agent', 'list', '--past', '--format', 'json']` exit 0, json, expect `{ 'past.length': 1, 'past.0.id':
     '{agent.id}/adhoc/1', 'past.0.adapter': 'custom/fake', 'diagnostics.length': 0 }`;
  9. `{ probe: 'fake-read', run: '{agent.id}/adhoc/1', role: 'developer' }`.
  Readers (6–9) follow the last writer (5): bug-133's rule, as in `smokeSteps`.
- **Config/docs.** `.wingfoil/workflows/custom/e2e-smoke.yaml` 1.5 → 1.6 (history in the `version:` comment, `1.6
  task-243 …`): `drive-cli` gains the actions `'cli.run(command: "agent execute --element <type:id> --role developer")'`,
  `'cli.run(command: "agent show <run-id>")'`, `'cli.run(command: "agent list --past")'` and a description sentence
  (the agent run, fake adapter `custom/fake`, fresh project per template); its three `checks.post` unchanged (the
  conformance rows of `test/core/workflow-repository-conformance.test.ts` stay as they are). `.wingfoil/WORKFLOW.md`:
  the E2E Smoke paragraph and the `drive-cli` box name the agent run (its own paragraph; no other B7 writer of it).
  The e2e-smoke **plan** of a release is written from this YAML (CLAUDE.md §6), so the YAML is "the smoke plan"; the
  report is `formatReport`'s.

**AC classification and what the qa agent pins** (all in `test/cli/e2e-smoke.test.ts`, a new `describe('task-243 …')`
block, plus the declarations in `scripts/e2e-smoke.d.cts`; the run drives `node <REPO>/dist/cli.js`, already built by
`globalSetup`; `invoke` for direct calls = `(args, cwd) => spawnSync(process.execPath, [DIST_CLI, ...args], { cwd, env,
encoding: 'utf-8' })` mapped to `{ status, stdout, stderr }`):

| AC | Class | Evidence of absence |
|---|---|---|
| 1 install/init/fake adapter/agent entry/`agent execute` → exit 0, one `agent: record`, `agent show` exit 0 | red-first | `grep -c agent scripts/e2e-smoke.cjs` → 0 |
| 2 record adapter `custom/fake`, `agent list --past --format json` contains the id | red-first | same |
| 3 smoke plan / report template names the new step | **red-first (corrected from characterization)** | `grep -c agent .wingfoil/workflows/custom/e2e-smoke.yaml` → 0, `formatReport` has no such line; precedent: task-279 AC 4, task-207 AC 5 |

- **AC 1 pins.** (a) For each of `SMOKE_TEMPLATES`: `agentRunSteps(T)` step 0 is `init --template T`; it contains the copy
  step exactly as item 3 above; the `dna add team.agents` args exactly as item 4; the `agent execute` step exactly as item
  5 (`exit: 0`, `fakeAgent: true`); a `record-commit` probe with `run: '{agent.id}/adhoc/1'` after it; the `agent show`
  step after the probe. `AGENT_FIXTURES` equals `join(REPO_ROOT, 'test', 'fixtures', 'agents')`. (b) `smokeAgentRun('Scrum',
  invoke, process.env)` → every check ok; labels contain `[Scrum/agent] wingfoil agent execute --element
  task:task-001-agent-run --role developer`, `[Scrum/agent] one agent: record commit for task-001-agent-run/adhoc/1`,
  `[Scrum/agent] wingfoil agent show task-001-agent-run/adhoc/1 --format json`; every CLI/copy check's detail ends with
  `tree clean`. (c) The existing "passes against the compiled CLI" test (one full run, not a second one) also asserts,
  per template, the `[T/agent] wingfoil agent execute …` label and that the `[T/agent]` block sits after the last
  `[T] ` label and before the next template's first; its `[T] `-prefixed count (= `smokeSteps(T).length`) stays as is.
  (d) "Exactly one": `smokeAgentRun('Scrum', invoke, env, steps)` with step 5 duplicated → last check is the
  `record-commit` probe, not ok, detail contains `found 2`; with step 5 removed → detail contains `found 0`.
  (e) Exit asserted: `runSmoke` through the proxy with `SMOKE_FAULT='exit=1@agent execute'` → not ok, last check label
  `[Scrum/agent] wingfoil agent execute --element task:task-001-agent-run --role developer`, detail `expected exit 0, got
  exit 1`.
- **AC 2 pins.** (a) Step 7's and step 8's `expect` exactly as items 7–8 (structural, from `agentRunSteps`). (b) Re-load:
  `SMOKE_FAULT='corrupt@agent execute'` → the `agent execute` check and the `record-commit` probe are ok, the last check is
  `[Scrum/agent] wingfoil agent show task-001-agent-run/adhoc/1 --format json`, detail `expected exit 0, got exit 1`.
  (c) The Resource read: in (1b)'s run the label `[Scrum/agent] the fake agent read the session Resource for
  task-001-agent-run/adhoc/1` is ok; with step 5's `fakeAgent` removed → that probe fails with `the fake agent recorded
  no launch` (the probe is the last check: steps 6–8 pass without it).
- **AC 3 pins.** (a) `e2e-smoke.yaml`: `version` ≥ 1.6 and the raw text has a history entry matching `/1\.6 [^;]*task-243/`
  (bug-314 "≥ plus history line"); `drive-cli.actions` contains the three strings above exactly; `drive-cli.description`
  contains `agent execute` and `custom/fake`; `drive-cli.checks.post` still has 3 entries. (b) `formatReport(…)` contains
  the exact `- Agent run: …` line above. (c) `.wingfoil/WORKFLOW.md`, the text from `### E2E Smoke` to the next `### `,
  contains `agent execute`.

**Files (session 3).** `scripts/e2e-smoke.cjs` (new functions, a shared throwaway-repo helper, the step runner taking
the two new kinds and `fakeAgent`, `runSmoke`'s call, `formatReport`'s line, header comment); `.wingfoil/workflows/
custom/e2e-smoke.yaml` (1.5 → 1.6); `.wingfoil/WORKFLOW.md` (E2E Smoke paragraph and box). qa (red): `test/cli/
e2e-smoke.test.ts`, `scripts/e2e-smoke.d.cts`. NOT touched: `prepareCandidate`/`realCandidateEffects`/`parseSmokeArgs`
(task-282's ground), `ci.yml` (its job already runs the script from the checkout against the installed tarball),
`test/fixtures/agents/*` (copied verbatim, never edited), `bindings.yaml`, `src/`.

**The tarball run (heavy gate, session 3, under the slot, once):** `bash …/devloop-kit/waitslot.sh && node
scripts/e2e-smoke.cjs --candidate --report <scratchpad>/e2e-smoke-243.md` on the clean committed branch (packs HEAD,
installs into a throwaway prefix, smokes the installed bin with its stamp bound — the gate's own binding), plus the
dev-build run `node scripts/e2e-smoke.cjs -- node "$PWD/dist/cli.js"`; both recorded with the `[T/agent]` lines.

**Decisions for the approver (recommendation first).** D1 placement: (a) its own fresh `init` project per template,
after that template's scenario — vs (b) once (Scrum only), or (c) appended to the template's repository (moves its "last
writer"). D2 the `fake-read` probe (CONNECT on, the fake's record read) is in scope under AC 2 — the only proof the
packed install's server served the session Resource. D3 the agent entry `Fake Agent <fake-agent@example.com>` (the
smoke's `.invalid` identity is refused for agents, bug-261), as `test/agent/helpers/agent-execute-fixture.ts`. D4 AC 3
reclassified red-first. D5 no Jest test packs a tarball (needs registry access for the dependencies; heavy): Jest drives
`dist/cli.js`, the tarball is exercised by `ci.yml`'s `e2e-smoke` job and by the session-3 `--candidate` run above.
D6 the run id is derived (`{agent.id}/adhoc/1`, spec-016 §4.3), not parsed from stderr.

### red (qa, 2026-10-14)

- **Red commit `38465ffe`** (T4 is measured from it). Files: `test/cli/e2e-smoke.test.ts` (the full-run test gains
  the `[T/agent]` checks; a new `describe('task-243 …')` block) and `scripts/e2e-smoke.d.cts` (declarations only:
  `SmokeStep.fakeAgent`, `SmokeCopyStep`, `SmokeProbeStep`, the union `SmokeAgentStep`, `AGENT_FIXTURES`,
  `agentRunSteps`, `smokeAgentRun`). Nothing else under `scripts/`, no config, no `src/`.
- **Per AC** (classification as the design's table; all red-first):
  - AC 1: (a) `the fixtures are the checkout's test/fixtures/agents`, `[%s] the scenario as data: …` (init first, the
    memory add step with `capture: 'agent'` and its `path` expect, the copy step and the `dna add team.agents` args
    exactly, `agent execute` with `exit: 0, fakeAgent: true`, the `record-commit` probe after it, `agent show` after
    the probe, `agent execute` the last writer); (b) `[Scrum] passes on the compiled CLI, every check labelled
    [Scrum/agent], …` (labels incl. the copy label `[Scrum/agent] commit .wingfoil/agents/custom/fake.yaml,
    test/fixtures/agents/fake-agent.cjs`, every CLI/copy detail ends `tree clean`); (c) the existing `passes against the
    compiled CLI` test: per template the `[T/agent] wingfoil agent execute …` label, a contiguous `[T/agent]` block
    after the last `[T] ` label and before the next template's first (its `[T] ` count unchanged); (d) `[Scrum] fails
    the record-commit probe when agent execute runs twice / not at all` (`found 2` / `found 0`); (e) `[Scrum] fails
    agent execute on a wrong exit …` (`SMOKE_FAULT='exit=1@agent execute'`).
  - AC 2: (a) `[%s] agent show and agent list --past assert what was recorded` (both `expect` maps exactly, the
    `fake-read` probe step); (b) `[Scrum] the run log is re-loaded: …` (`corrupt@agent execute` → execute and probe
    ok, last check `agent show`, `expected exit 0, got exit 1`); (c) `[Scrum] the fake agent read the session
    Resource, and agent list --past passed, …` and `[Scrum] fails the fake-read probe when agent execute runs without
    the fake switched on` (`the fake agent recorded no launch`).
  - AC 3: `e2e-smoke.yaml is at least 1.6, with a history entry for task-243 (bug-314)` (`/1\.6 [^;]*task-243/`),
    `drive-cli declares the three agent actions …` (+ `agent execute`, `custom/fake` in the description, 3
    `checks.post`), `the report names the agent run` (the exact `- Agent run: …` line), `WORKFLOW.md's E2E Smoke section
    names agent execute`.
- **Run.** `npx jest test/cli/e2e-smoke.test.ts --maxWorkers=2` → 17 failed, 34 passed, 51 total (200.966 s). Each
  failure is an assertion: `typeof agentRunSteps` / `typeof smokeAgentRun` → `"undefined"` (expected `"function"`);
  `AGENT_FIXTURES` → `undefined`; the full run → `Expected value: "[Scrum/agent] wingfoil agent execute --element
  task:task-001-agent-run --role developer"` not in the labels; both proxy faults → `expect(report.ok).toBe(false)`
  received `true` (no agent step runs yet); `version` received `1.5`; `drive-cli.actions` lack the three strings; the
  report lacks the `- Agent run:` line; the E2E Smoke section lacks `agent execute`. The 34 passing are the existing
  tests. `npx tsc --noEmit -p tsconfig.test.json` and `npx eslint` on both files → exit 0.
- **For green.** The probe steps are told apart from CLI steps by the `probe` key, copy steps by `copy` (the tests
  use `'args' in step`). The positive pins share one `smokeAgentRun('Scrum', …)` run in a `beforeAll`; with the
  proxy faults and the (d)/(c) variants the file runs the agent scenario six times plus the full run's two.
