---
id: "task-200-fake-agent-custom-adapter-let-agent-execute-path"
type: task
title: "A fake agent and its custom adapter let every `agent execute` path run under Jest and CI with no real agent and no terminal"
status: in-review
release: "v0.3"
kind: "feature"
priority: "high"
tags: ["v0.3", "agent", "testing", "fixtures"]
ref: "adr-012"
bug: ["bug-234", "bug-242"]
depends_on: ["task-177-adapter-manifests-load-validate-wingfoil-agents-builtin-custom", "task-195-role-session-mcp-prompt-accepts-element-state-returns"]
tmpl_version: 260703
---

## Description

`spec-016` §2.7 fixes that the fake is a **custom** adapter covering every §2.2 field. The fake is a Node script, `test/fixtures/agents/fake-agent.cjs`. It: - records its argv, stdin and environment **names**; - can connect to the registered `wingfoil` server and fetch `{role}-session` with `element`/`state`; - prints a declared JSON document (session, model, usage); - exits with a declared code or waits for a signal. Two manifests declare it: `terminal: optional` (the success path) and `terminal: required` (the `NO_TERMINAL` refusal).

## Acceptance Criteria

- (red-first) `custom/fake.yaml` passes task-177's validation and exercises every §2.2 field (assert by walking the schema's keys against the fixture).
- (red-first) Driven directly (without `agent execute`) through a rendered MCP config pointing at `node dist/cli.js mcp`, the fake completes `initialize` and the Prompt fetch and writes the Prompt text to its record file. That text equals task-176's payload.
- (characterization) The fixture writes environment variable names only, never values (`REQ-SEC-08`). The `security-secrets` / `dl-122` rules hold: no secret-shaped literal in the fixture.
- (characterization) No test in the suite needs a pseudo-terminal (`grep -rn "node-pty\|script -q" test` → nothing).

## Implementation Notes

- **Size:** S · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** adr-012 point 6; spec-016 §2.7.
- **Features:** P5.3.1, P5.4.3.
- **Notes:** Proposal key: B07. the exact paths are the task's choice (§2.7). Headless-result Tool calls are v1.0 and stay out.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

Branch `task/task-200-fake-agent-custom-adapter-let-agent-execute-path`, worktree `../.wf2-wt/task-200`, cut
from `main` at `4fd77678` (W3 batch B2). Start `38fc616f`; bug syncs `[planned → in-progress]`: `bug-234`
`b7d8c02d`, `bug-242` `9f4d4778`.

### design (architect)

**`depends_on` (dl-015).** `task-177`, `task-195` and the `task-176` they build on are `done`
(`grep -m1 "^status" docs/04_memory/v0.3/task-17{6,7}-*.md docs/04_memory/v0.3/task-195-*.md`). From their
notes: `task-177` left `test/fixtures/agents/custom/fake.yaml` (every §2.2 field but `verified_with`) and said
the script is this task's; `task-195`'s return shape is `{messages: [{role: "user", content: {type: "text",
text: <spec-012 §7 payload>}}], warnings?: string[]}`, the payload being `assembleExecutionContext(...).payload`
verbatim. `spec-016` is `approved`, `adr-012` `accepted` (same `grep`). `tech-spec` is `amendable: true`
(`grep -n amendable .wingfoil/memory.yaml`), so the `spec-016` edit is a **pending amendment, left
uncommitted**; spec-016 has no `version:` field, so it gets a dated Revision note as its earlier edits did.

**Scope.** The task's ACs, plus the two bugs absorbed at triage (`bug-ingest-rel-v0.3-w2b1-review-findings-plan`
→ `bug-234`; `…-w2b2-…` → `bug-242`): the manifest validator must refuse manifests that cannot launch, and a
newer `format:` with the `dl-149` message.

**Design.**
- *The script*, `test/fixtures/agents/fake-agent.cjs`: Node built-ins only, so it runs wherever it is copied
  (a fixture repository, a fresh `init` project) with no `node_modules` beside it; its MCP client is the stdio
  transport written by hand (newline-delimited JSON-RPC: `initialize`, `notifications/initialized`,
  `prompts/get`). It reads the Prompt name and the `element`/`state` arguments **out of the bootstrap's §2.4
  context instruction**, as a real agent must. Behaviour is declared by environment variables:
  `WINGFOIL_FAKE_AGENT_RECORD` (one JSON line per invocation: argv, stdin or `null`, sorted env NAMES, the MCP
  answer), `…_CONNECT=1`, `…_STDIN=1` (off by default: an interactive agent owns stdin and an inherited open
  pipe never ends), `…_DOCUMENT`, `…_EXIT`, `…_WAIT=signal`. Argv: `--version`, `--lookup <id>`, `--summary`,
  otherwise a launch (`[--headless] --mcp-config <f> --prompt <t> | --prompt-file <f> [--session-id <id>]
  [--resume <id>]`); a headless launch prints the document (`output: json`). The headless result Tool is v1.0
  and stays out (Implementation Notes).
- *Manifests.* `fake.yaml` gains `verified_with: fake-agent 1.0.0` (the string `--version` prints), the only
  §2.2 field it lacked; `custom/fake-terminal.yaml` is the same adapter named `fake-terminal`, with
  `launch.interactive.terminal: required` declared explicitly. Both launch the script by its
  repository-relative path, resolved against the agent's working directory (the project root).
- *`bug-234`* (`src/agent/placeholders.ts` `requiredPlaceholderIssues`, `E_ADAPTER_PLACEHOLDER`): every declared
  `launch.*.args` must carry `{bootstrap}` / `{bootstrap_file}` per `prompt.via` and `{mcp_config_file}` /
  `{mcp_command}`+`{mcp_args}` per `mcp.via`; `session.assign_args` must carry `{session_id}` under `assign`;
  `session.resume.args` is required with `supported: true` (`crossFieldIssues`, `E_ADAPTER_MANIFEST`) and
  must carry `{session_id}`. No format bump: no adapter is loaded on a shipped command path yet
  (`grep -rn "loadAdapter\|parseAdapterManifest" src --include=*.ts | grep -v "^src/agent"` → only
  `src/core/builtin-integrity.ts`, and `BUILTIN_ADAPTERS` is `[]` in `src/storage/builtin-adapters.ts`), and
  the manifests refused could not launch. The inline built-in manifest of `test/core/init-builtin-adapters.test.ts`
  already carries both placeholders. The bug's other two spec gaps are spec text: a §3.7 row for an adapter in
  neither directory (the code's `NOT_FOUND` message), and why `stdin` stays in the enum (kept for a v1.0
  headless-only adapter). Its third gap — discovery passing over `.yml`/nested files silently and listing
  `Bad Name` — is **not** fixed here: the bug's own text puts the warning on the first surface that enumerates
  adapters, and none does (`agent` has no operation in `CORE_MODULES`). Decision for the approver (below).
- *`bug-242`*: `parseAdapterManifest` calls `refuseNewerFormat(raw, ADAPTER_MANIFEST_FORMAT, file)` before the
  structural pass; `format` stays the required literal, so `0`, `"1"`, `1.5` and an absent key stay structural.

**AC classification (T1).**

| AC | Class | Why |
|---|---|---|
| 1 — `fake.yaml` validates and declares every §2.2 field (schema walk) | **red-first** | the walk finds `verified_with` absent; `fake-terminal.yaml` does not exist |
| 2 — driven directly, the fake fetches the Prompt; text = task-176's payload | **red-first** | the script does not exist |
| 3 — env names only; no secret-shaped literal | **red-first** (names only), **characterization** (scan) | the task file says characterization, but the behaviour is new: no script exists to record anything, so its test fails first for a real reason. The scan of the two manifests passes on first run |
| 4 — no test needs a pseudo-terminal | **characterization** | `grep -rn "node-pty\|script -q" test` → nothing before the change; pinned by a test |
| `bug-234` — required placeholders | **red-first** | the bug's four manifests are accepted today |
| `bug-242` — newer format refused first | **red-first** | today `E_VALIDATION … expected 1` beside other issues |

### red

`1287ea10` — `test/agent/fake-agent.test.ts` (new), `test/agent/manifest.test.ts` (bug-234, bug-242 blocks),
`test/agent/discovery.test.ts` (the newer-format case; the existing two-issue case moves to `format: 0`, which
still reaches the structural pass). The script was held out of the tree for this run. `npx jest test/agent` →
**3 suites failed, 30 failed, 196 passed**. Every failure is behavioural: the script is missing (ENOENT on
the record file), `verified_with` / `fake-terminal.yaml` absent, the bug-234 manifests accepted, `format: 2`
reported as `expected 1`. AC 4 and the manifest scan pass on first run (characterization).

### green

`f596ad23` — the script, `verified_with` on `fake.yaml`, `custom/fake-terminal.yaml`, `requiredPlaceholderIssues`
(exported from `src/agent`), the `resume.args` rule, the `refuseNewerFormat` pre-check, and the
`ADAPTER_MANIFEST_FORMAT` doc in `src/validation/format.ts`. Three test edits the fixture change forced:
`manifest.test.ts`'s `verified_with` case deletes the field before asserting the built-in refusal;
`discovery.test.ts`'s `builtIn()` no longer appends a second `verified_with` (a duplicate YAML key); my AC 2 test
compares the record's argv with the launch argv after the script path (`process.argv.slice(2)`).
`npx jest test/agent test/core/init-builtin-adapters.test.ts` → **6 suites, 240 passed**.

### refactor

`65c549f7` — `carries()` takes a declared argv only (the `?? []` arm was unreachable: `need()` returns on an
absent field; it was the one uncovered branch of `placeholders.ts`).

Gates (worktree, the uncommitted spec-016 amendment on disk; load average ~60 from the batch, `uptime`):

| Gate | Result |
|---|---|
| `npm test` | 292 suites, **5492 passed** |
| `npm run test:coverage` | 292 suites, 5492 passed; **99.29 / 97.09 / 97.11 / 99.72** (stmts / branches / funcs / lines), vs the B1 gate's 99.29 / 97.05 / 97.11 / 99.72 (`grep "^All files" ../devloop-kit/gate-w3b1-cov.log`); `src/agent/manifest.ts`, `placeholders.ts` 100 in all four |
| `npm run lint` | exit 0 |
| `npm run docs:api` | exit 0 |
| `npx tsc --noEmit -p tsconfig.json`, `npx tsc -p tsconfig.build.json --noEmit`, `npm run typecheck` | exit 0 |
| `node scripts/check-governance.cjs --base 4fd77678` | 3 `wf()` commits checked, 0 findings |

The coverage run printed jest's "A worker process has failed to exit gracefully"; it also appears in earlier
batches' logs (`grep -l "failed to exit gracefully" ../devloop-kit/task-195-review/cov.log
../devloop-kit/task-209-review/jest.out`), and `npx jest test/agent/fake-agent.test.ts --detectOpenHandles`
reports no open handle from this suite. No BDD scenario names the fake or the manifest rules
(`grep -rln "fake\|terminal" docs/02_requirements/02_bdd/features/p5-interaction/` → nothing); no CLI command
or help changed.

### review (self, reviewer)

- **AC 1** — met: `fake-agent.test.ts` walks `AdapterManifest`'s 26 leaf paths and asserts each in
  `fake.yaml`; both manifests parse (custom and built-in) and load through `loadAdapter` at `HEAD`;
  `fake-terminal.yaml` equals `fake.yaml` but for `name` and `terminal`.
- **AC 2** — met: a temp project with the adapter and the script committed; argv rendered from the loaded
  manifest's `launch.interactive.args` + `session.assign_args`, the MCP config from its `mcp.template` with
  `{mcp_command}` = the Node executable and `{mcp_args}` = `[dist/cli.js, "mcp"]` (§2.5); the record shows
  server `wingfoil`, Prompt `developer-session` with `{element, state: <HEAD sha>}`, and `text` byte-equal to
  `assembleExecutionContext(root, {role, element, stateRef}).payload`. A missing element is recorded as the
  server's `-32602` refusal; an unparseable bootstrap or an unstartable server exits 1.
- **AC 3** — met: a variable whose value is built at runtime appears by name, its value nowhere in the record;
  `scanText` finds no blocking or warning match in the script and both manifests.
- **AC 4** — met: `grep -rn "node-pty\|script -q" test` → nothing (exit 1); the test builds both needles from
  fragments so it does not match itself, and checks `package.json` has no `*pty*` dependency.
- **`bug-234`**, **`bug-242`** — met as designed, except `bug-234`'s discovery gap (decision below).
- Determinism: the script reads no clock or randomness for any output; its only timer is the 30 s MCP give-up.
  Security: no `env:` field, names never values, no secret-shaped literal (scan test).

**Pending amendments (approver).**
- `spec-016-agent-execution` — proposed `--reason`: "task-200: §2.3 states the placeholders a declared choice
  makes required (each via its placeholder in every declared launch argv, {session_id} in session.assign_args
  under assign and in session.resume.args under supported: true) and §2.2 makes session.resume.args required
  with supported: true, so a manifest that validates can launch (bug-234); §2.2's format row states the dl-149
  refusal of a newer format (bug-242) and its prompt.via row why stdin stays in the enum; §3.7 gains the row
  for an adapter found in neither directory; §2.7 records the fixture paths task-200 chose."

**Decisions for the approver.**
1. `bug-234`'s discovery gap (silent skip of `.yml`/nested entries; `Bad Name` listed, then refused by
   `loadAdapter`) is left to the first surface that enumerates adapters, as the bug's own Summary says; the
   spec-016 Revision note records it. Either accept that `bug-234` resolves without it, or file it as its own
   element with a handover to that surface.
2. AC 3 reclassified from characterization to red-first for its "names only" half (the script did not exist).
3. No format bump for the tightened rules (`dl-149`): the refused manifests could not launch and no shipped
   command loads an adapter.
4. The fake's interface (argv, the six `WINGFOIL_FAKE_AGENT_*` variables, the bootstrap parsing) is this task's
   choice under §2.7; `task-218`/`task-228` and the `e2e-smoke` gate consume it as documented in the script's
   header.
