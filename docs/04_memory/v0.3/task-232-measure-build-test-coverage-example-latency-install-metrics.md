---
id: "task-232-measure-build-test-coverage-example-latency-install-metrics"
type: task
title: "Measure the build, test, coverage, example, latency and install metrics"
status: in-review
release: "v0.3"
kind: "feature"
priority: "medium"
tags: ["v0.3", "process", "release-health", "scripts"]
ref: "dl-089"
bug: ["bug-329"]
depends_on: ["task-134-report-source-file-coverage-so-untested-file-counts", "task-222-declare-release-health-catalogue-v2-report-schema-release"]
tmpl_version: 260703
---

## Description

The quality half that runs the toolchain: build/typecheck/lint, tests, coverage (index files included), critical-module branch floor, `docs/examples` pass rate, CLI p95 on a 40-element fixture, the documented install command.

## Acceptance Criteria

- (red-first) each metric computed from the pipeline's pinned Node and `npm ci` in the throw-away worktree; unit cases with stubbed tool outputs pin the parsing (pass/fail/skip counts, coverage totals, p95).
- (characterization) Q04 reads per-file branch coverage of `memory/audit`, `memory/commit-message`, `memory/state-machine`; floor 90 %.
- (characterization) a metric whose tool fails records `not-measurable` with the reason, never a zero.

## Implementation Notes

- **Size:** M · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-089 §2 (Q01–Q04, Q11, Q12, Q17).
- **Features:** P4.1.
- **Notes:** Proposal key: D16.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

### design (architect, 2026-10-11)

- **depends_on read (dl-015).** `task-134` (`done`): `jest.config.js` `roots` includes `src/`, so the coverage summary
  lists every `collectCoverageFrom` file, unloaded ones at 0 %; `collectCoverageFrom` excludes only the literal
  re-export barrels (task-122, `bug-021`), so Q03's "`index.ts` too" is the configuration as it stands and the measure
  runs `npm run test:coverage` unchanged. `task-222` (`done`): catalogue v2 (`docs/08_health/metrics.yaml`), the
  report schema, `catalogue.cjs`, the binding `release-health.measure`; catalogue v2's `changes` note already states
  that "a loaded run (task-263's load flag) is recorded as not-measurable" for Q12. `task-231` (`done`, wrote
  `measure.cjs`, read per dl-015): the history half, the `QUALITY_OWNERS` placeholders this task replaces, the
  throw-away worktree removed only in `finally` (its retrospective: two stale worktrees removed by hand; that is
  `bug-329`, in scope by approver ruling R5), and the hazard that a full `npm test` beside a measure rebuilds `dist/`.
- **Decisions cited are ratified:** `grep -m1 '^status' docs/04_memory/design/dls/dl-{089,146}-*.md` → `ready`.
  `dl-173` is `in-discussion`: its five definitions (G08, G09, G15, P02/P05, P03) are untouched here
  (`git diff` of those functions stays empty). No tech-spec governs `scripts/release-health/`
  (`grep -rn "scripts/release-health\|measure.cjs" docs/04_memory/design/specs/` → nothing): the contract is
  dl-089 §2/§5/§6, the catalogue and the schema. No spec edit is required.
- **Design — the toolchain half** (its own block in `measure.cjs`, `measureToolchain`; task-233 keeps the
  `QUALITY_OWNERS` entry for its own ids, the `task-232` entry is removed):
  - **Where:** in the same throw-away worktree as the history half, after it: `npm ci`, then each metric's command.
    Child processes get `PATH` with the running Node's directory first (so `npm` runs the same Node), and lose
    `WINGFOIL_LATENCY*` and `GIT_DIR`/`GIT_WORK_TREE`/`GIT_INDEX_FILE`; nothing writes git configuration.
  - **The pinned Node** (dl-089 §6): `NODE_VERSION` in `.github/workflows/publish.yml` at the point. A running Node
    that is not exactly it makes the seven metrics `not-measurable` with both versions named; `--any-node` measures
    anyway and records `node` and `node_pinned` in each entry's `raw` (decision for the approver: this machine runs
    v22.21.0, the pin is 22.12.0, and the measure cannot switch Node itself).
  - **Q01** `npm run build`, `npm run typecheck`, `npm run lint`, each run: value `true` iff all three exit 0, raw the
    three exit codes, `failing` the commands that did not.
  - **Q02** `npm test -- --json --outputFile=<tmp>` (jest's own JSON): value `{ total, failing, disabled }`
    (disabled = skipped + todo), raw passed/failed/skipped/todo/total/failed_suites, `failing` each failing test
    (`<file> › <full name>`) and each suite that failed to run.
  - **Q03/Q04** `npm run test:coverage -- --coverageReporters=json-summary --coverageDirectory=<tmp>`: Q03 the
    `total` percentages with covered/total counts; Q04 the branch coverage of the three files, floor 90 %, `failing`
    each file under it; a file missing from the summary makes Q04 `not-measurable`.
  - **Q11** every `docs/examples/*/run.sh` at the point, `bash <script>` with `WINGFOIL="<node> <tree>/dist/cli.js"`
    (the examples' README form): share passing, raw executed/passed, `failing` the examples; needs Q01's build.
  - **Q12** `npm run test:latency` with `WINGFOIL_LATENCY_REPORT=1`, read from the suite's own report
    (`latencyReport`, task-263): value the highest total p95 in ms, raw the floor p95, each command's total and
    marginal p95 and the 1-minute load before/after; `failing` each quantity at or over 1,000 ms (dl-146 (C)).
    **A loaded run is `not-measurable`** (approver ruling R4, and the catalogue's v2 note): the deciding signal is the
    suite's own idle verdict (`machine: loaded: …`, floor p95 ≥ 500 ms), the reason quotes it, and `raw` still records
    the load. Nothing loosens a budget; a report missing from the output is `not-measurable`.
  - **Q17** the first `npm install -g <spec>` of `docs/user-guide.md` (else `README.md`) at the point, the documented
    version = the guide's first bold `**X.Y.Z**`, `npm view <spec> version --json`; value `true` iff they match.
    `--offline` skips it. It reads the registry's live dist-tags, so like G15/E it is not reproducible at a fixed
    point (`raw.resolved_from`; decision for the approver / catalogue follow-up).
  - **A tool that fails is not a zero** (AC 3): a missing `package.json` script, a spawn error, a signal, or an
    output the parser cannot read makes that metric `not-measurable` with the reason (the last stderr line);
    `npm ci` failing makes all seven so. A check that runs and fails (lint exit 1) is a measured `false`.
  - **Injectable** like the E reader: `options.tools(call)` runs one command (`{ step, command, args, cwd, env }` →
    `{ status, signal, stdout, stderr, error? }`); unit tests stub every output (R4). `--no-toolchain`
    (`toolchain: false`) skips the half with that reason; `--max-workers <n>` is passed to the two jest runs only.
  - **`measureRelease` and `main` become async** (the toolchain children are awaited, which is what lets a signal
    handler run during them); `processConformance` stays synchronous.
- **Design — `bug-329`** (approver ruling R5): `measureRelease`'s worktree is guarded: `SIGINT`, `SIGTERM` and
  `SIGHUP` stop the running tool (SIGTERM, SIGKILL after 10 s), remove the worktree (`git worktree remove --force`)
  and its temporary directory, remove the handlers and re-raise the signal, as `publish-staging.cjs`
  (`installTeardownHandlers`) does; injectable `target`/`die` for the unit test, plus a real child process killed with
  SIGTERM. Limit, stated in the header: a signal that lands during the synchronous history half is handled when it
  returns (Node runs no handler during synchronous code); `SIGKILL` stays the one case left to the user; the
  synchronous `processConformance` keeps the plain `withWorktree`.
- **AC classification (testing directive), corrected:**

| AC | Class | Why |
|---|---|---|
| 1 — each metric from the pinned Node and `npm ci` in the worktree; stubbed outputs pin the parsing | red-first | no code measures any Q metric (`grep -n "QUALITY_OWNERS" -A3 scripts/release-health/measure.cjs` → all seven left to task-232) |
| 2 — Q04 per-file branch coverage of the three modules, floor 90 % | **red-first** (was characterization) | same: nothing reads it today; a characterization test would fail on first run |
| 3 — a tool that fails → `not-measurable` with the reason, never a zero | **red-first** (was characterization) | same reason |
| bug-329 — a signal removes the worktree and re-raises | red-first | `grep -nE "SIGINT\|SIGTERM\|process\.on" scripts/release-health/measure.cjs` → the header comment only |

- **Real measurement (R4):** at most one, under the dl-170 slot, recorded in refactor with whether it ran.

### red (qa, 2026-10-11)

- `a581f107` — `npx jest test/release-health` → `Test Suites: 2 failed, 1 passed, 3 total`, `Tests: 23 failed, 70
  passed, 93 total`. Failing: the three `parseLatencyReport` cases (`test/release-health/latency-report.test.ts`, not
  exported yet), every toolchain case (`measureToolchain` is not a function), the `measureRelease` integration case,
  the two bug-329 cases that need a handler (injected `SIGTERM`, real process), the `--no-toolchain` reason, and the
  command-line case (`--no-toolchain` is an unknown argument → exit 2). Passing at red, vacuously: "a normal return
  removes the handlers too" (no handler exists yet to leave behind); meaningful only beside the SIGTERM case, which is
  the red.
- The same commit declares the new API in `measure.d.cts` (`measureToolchain`, `parseLatencyReport`, `ToolCall`,
  `ToolResult`, `ToolRunner`, `Interrupts`; `measureRelease` and `main` return promises), so the suites compile and
  fail on behaviour rather than on types, and turns the history tests' calls into awaited ones with
  `toolchain: false` (they measure git alone). `npx tsc --noEmit -p tsconfig.json` → 0; `npx eslint test/release-health`
  → 0.
- `parseLatencyReport` is pinned to its producer in a file of its own: `test/release-health/latency-report.test.ts`
  imports `latencyReport` from `test/core/helpers/latency.ts`, which `measure.test.ts` cannot do, because that file
  spawns and `test/core/latency-budget-placement.test.ts` (rule 2) fails a file that both spawns and imports the clock
  helper.

### green (developer, 2026-10-11)

- `67bfbbf5` `feat(release-health)`: `measureToolchain` and its per-metric readers (`q01` … `q17`), the spawning
  runner `spawnTools` with a stopper per child, `withGuardedWorktree` (bug-329), `--no-toolchain`, `--any-node`,
  `--max-workers`, `measureRelease`/`main` async, `QUALITY_OWNERS` loses the `task-232` entry.
  `npx jest test/release-health` → `Test Suites: 3 passed`, `Tests: 93 passed, 93 total` on the first run.
- No leftover after the real-process SIGTERM case: `ps -eo pid,etime,args | grep -F "setInterval(() => {}, 1000)"` →
  nothing; `ls -d /tmp/wf-release-health-*` → nothing; `git worktree list | grep -c release-health` → `0`.
- Main-sync (dev-loop v1.5): `git log --oneline HEAD..main` → empty; `main` (`3e692099`) is this branch's base.

### refactor (developer, 2026-10-11)

- `9eb2c5cf` `refactor`: `measure.cjs`'s header states what each toolchain metric runs and reads, the pinned-Node
  rule, the `not-measurable` cases and the signal handling that replaces the manual-cleanup note; `.wingfoil/WORKFLOW.md`
  (release-health section) says which quality metrics `measure.cjs` now measures.
- **The one real measurement (R4) — it ran**, once, under the dl-170 slot (`waitslot.sh`, load 4.5–9.6 during the
  run): `node scripts/release-health/measure.cjs --release v0.3 --at HEAD --previous HEAD~3 --any-node --max-workers 2
  --out ../devloop-kit/task-232-scratch/real-report.json` at `9eb2c5cf`, 19 min 46 s, exit 0, online (Q17's
  `npm view` and E01–E05 read). Node v22.21.0 against the pinned v22.12.0, hence `--any-node` (each entry records both).
  Results: Q01 `true` (build/typecheck/lint 0/0/0); Q02 7089 tests, **1 failing**, 0 disabled; Q03 99.3 / 97.2 / 97.93 /
  99.7 (stmts / branches / funcs / lines; branches 6023/6196, 119 files); Q04 audit 86.3 % (63/73, **under the 90 %
  floor**), commit-message 100 % (93/93), state-machine 96.2 % (76/79); Q11 100 % (5/5); **Q12 not-measurable: the
  suite judged the run loaded** (floor p95 534 ms ≥ 500 ms at a 1-minute load of about 7), raw p95s recorded;
  Q17 `true` (`npm install -g wingfoil` → 0.2.2, the guide states 0.2.2). Afterwards `ls -d /tmp/wf-release-health-*` →
  nothing, `git worktree list | grep -c release-health` → `0`.
- **The run found two defects of this task, fixed in `fd03acfa`** (each with its test):
  - Q02's one failure was this branch's own: `test/lint/no-fabricated-stderr.test.ts` (bug-070) flagged the stub
    runner's `stderr: ''` default in `measure.test.ts`; the stub no longer sets output it does not have (the runner reads
    a missing one as empty).
  - Q12's `raw.load_1m_before`/`after` (7.04 / 9.62) disagreed with the verdict line (6.57 / 7.04): the in-process
    `workflow next` latency suite prints its own `load average` line first, and the parser took it. It now reads the
    report's header line (`… (one window: …`); new case in `latency-report.test.ts`, red before the fix
    (`npx jest test/release-health/latency-report` → `1 failed`).
  - Both changes touch red's test files after `red`, so `tests.unchanged(since: red)` will list `fd03acfa`: a lint
    compliance fix and one added case, no assertion of red weakened (`git show fd03acfa -- test/`).
- **Gates at `fd03acfa`** (under the slot, load 2.9–4.4, `../devloop-kit/task-232-scratch/gates.log`):
  `npm test -- --maxWorkers=2` → `Test Suites: 383 passed`, `Tests: 7090 passed, 7090 total`;
  `npm run test:coverage -- --maxWorkers=2` → 7090 passed, All files 99.3 / 97.2 / 97.93 / 99.7. Not regressing: the
  branch changes no file under `src/` or `jest.config.js` (`git diff --stat 3e692099 HEAD -- src jest.config.js` →
  empty; `scripts/` is outside `collectCoverageFrom`), and the real run at `9eb2c5cf` measured the same 6023/6196
  branches on main's `src/` (the B5 gate's 97.22 predates the B5 follow-up merges). `npm run lint` → 0;
  `npm run docs:api` → 0; `npx tsc --noEmit -p tsconfig.json` → 0; `npx tsc -p tsconfig.build.json --noEmit` → 0;
  `node scripts/check-governance.cjs --base 0671d035` → `6 wf() commits`, `gated: 0 findings`;
  `node scripts/lint-claims.cjs --base 0671d035` → `0 warnings in 0 files, 4 files read`.
- BDD: `grep -rln "release-health\|measure.cjs" docs/02_requirements/02_bdd/features/` → nothing for the Q metrics (the
  REQ-STATE-10 scenarios are task-231's P checks); no scenario added. No CLI command or help text touched
  (`measure.cjs` is a script, not a `wingfoil` command), so `docs/cli-reference.md` is not concerned.

### review (reviewer, self, 2026-10-11)

- AC 1 met: `measure.test.ts` "runs npm ci and then each metric's command in the tree, with the running Node first on
  PATH" (the command list, `cwd`, `PATH`, dropped variables, `--maxWorkers`), one case per metric pinning the parsing
  (Q01 exit codes, Q02 jest JSON counts and named failures, Q03 totals, Q11 share, Q12 p95s and load, Q17 `npm view`),
  the pinned-Node refusal and `--any-node`; the real run above.
- AC 2 met: "Q03 … Q04 — branch coverage of the three critical modules, floor 90 %" (85 % → failing, named with counts)
  and "a critical module missing from the coverage summary is not-measurable"; the real run reports audit.ts at 86.3 %.
- AC 3 met: the three "a tool that fails" cases — `npm ci` failing, a missing script, a spawn error, a signal, missing
  JSON / summary / latency report, `npm view` failing: each `not-measurable` with the reason and no `value`.
- bug-329 met: "SIGTERM during a tool" (handler removes worktree and directory, dies on SIGTERM, no listener left),
  "a normal return removes the handlers too", and a real child process killed with SIGTERM while `npm run build` hangs
  (exit by SIGTERM, no worktree, no directory, no leftover process).
- `dl-173`'s five definitions untouched: `git diff 3e692099 HEAD -- scripts/release-health/measure.cjs | grep -nE
  "^[-+].*(G08|G09|G15|P02|P03|P05|uncheckedCommits|producesPresent)"` → one line, the header sentence on Q17 that
  cites G15 as the same not-reproducible class; no function of theirs changed.
- Same class in files touched: no other stub in `measure.test.ts` returns a fixed `stderr`
  (`npx jest test/lint/no-fabricated-stderr` → passed); the header's manual-cleanup note now names only SIGKILL.
- Handover to task-233 (same two files): `QUALITY_OWNERS` holds only its entry; the toolchain half is one block
  (`// --- the toolchain half …`) with its own constants; `measureRelease` and `main` are async, so its tests `await`
  them and pass `toolchain: false` (the `OFFLINE` constant does) unless they exercise the toolchain.

### Pending amendments (approver)

- None. No tech-spec, ratified decision-log or other task needed an edit.

### Retrospective

- A real measurement run doubles as the refactor gate set (build, typecheck, lint, `npm test`, coverage, in a clean
  checkout after `npm ci`) and found what the stubbed tests could not: a lint gate tripped by the stub itself, and a
  second suite's output line read as the report's. One heavy run thus replaced a gate cycle under dl-170.
- `npm run test:latency` cannot pass on this machine with other worktrees active (floor p95 534 ms at load about 7), so
  Q12 is `not-measurable` until a release-health run is taken on an idle machine.
