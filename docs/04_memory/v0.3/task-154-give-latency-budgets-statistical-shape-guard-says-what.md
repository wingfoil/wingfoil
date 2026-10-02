---
id: "task-154-give-latency-budgets-statistical-shape-guard-says-what"
type: task
title: "Give the latency budgets one statistical shape and a guard that says what it enforces"
status: in-review
release: "v0.3"
kind: "fix"
priority: "low"
tags: ["v0.3", "core", "tests", "performance"]
ref: ""
bug: ["bug-012", "bug-013", "bug-014"]
depends_on: []
tmpl_version: 260703
---

## Description

REQ-PERF-04's MCP budget is one `performance.now()` sample (`test/mcp/server.test.ts:104-108`; `bug-012`); REQ-PERF-02's fit criterion names the commands but nothing times `memory search` end to end since `task-067` (`bug-013`); the latency-placement guard claims more than its same-file textual scan enforces (`bug-014`).

## Acceptance Criteria

- (red-first) the MCP budget is p95 over N runs (the `RUNS`/`p95()` convention of `test/core/query-latency.test.ts`).
- (red-first) `memory search`, `dna show`, `memory history` each have a command-level p95 measured as marginal cost over a measured process-start floor, under a documented exemption in the placement guard; or, if the approver prefers rewording REQ-PERF-02, the task stops and a decision-log is filed (the bug's option 2 needs one).
- (characterization) the guard's module doc states the same-file textual invariant it enforces, and its failure message names the remedy.

## Implementation Notes

- **Size:** S · **wave:** 1 · **kind:** fix (`dl-133` Q1 (b)).
- **Implements:** REQ-PERF-02; REQ-PERF-04.
- **Features:** P1.5, P5.2.1.
- **Notes:** Proposal key: C41.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

Branch `task/task-154-give-latency-budgets-statistical-shape-guard-says-what`, worktree
`../.wf2-wt/task-154`, cut from `main` at `243f8f05`. Start `7880fded`; `bug-012`, `bug-013`, `bug-014`
`[planned → in-progress]` `84027b71`, `d04df723`, `2b18f57c`. Six other task worktrees ran jest on
this machine throughout (12 cores; `uptime` load average 5–45, quoted with each measurement below).

### design (architect)

**`depends_on`:** none (`depends_on: []`).

**Requirements.** REQ-PERF-02 and REQ-PERF-04 (`docs/02_requirements/03_sard/02_performance-nfr.md`)
state each budget as `< 1,000 ms (p95)` with the measurement conditions "p95 over >= 20 runs" on
1,000 Memory documents. No REQ-PERF entry budgets a Memory transition (`grep -n "^### REQ-PERF"` →
01–05: agent context load, query latency, workflow next, MCP fetch, relevance filtering), so the
`task-247` transition cost has no budget to report against; I measured none.

**Budgets found** (`grep -rln "perf_hooks\|Date\.now\|performance\.now\|hrtime" test/` on `243f8f05`):
`test/core/query-latency.test.ts` (REQ-PERF-02, p95/25), `test/mcp/resource-latency.test.ts`
(REQ-PERF-04, p95/25, plus the 200-fetch sustained session), `test/mcp/server.test.ts` (P5.2.1 AC (a),
**one sample**, `bug-012`). Each of the first two carried its own copy of `RUNS`, `P95_BUDGET_MS`
and `p95()`. Nothing timed the commands (`bug-013`; confirmed: `test/cli/program.integration.test.ts`
reads no clock).

**AC 2 path.** The AC offers covering the criterion or stopping for a decision-log that rewords
REQ-PERF-02. I took coverage, the option the AC states first and the bug's "if possible" asks for.
The approver can still prefer the rewording; see *Decisions for the approver*.

**Design.**
1. `test/core/helpers/latency.ts`: the one statistical shape. `MIN_RUNS = 20` (the SARD), `RUNS = 25`,
   `P95_BUDGET_MS = 1000`, nearest-rank `p95`, `sampleLatency(runs, fn)` and
   `sampleMarginalLatency(runs, floor, calls)`; both samplers throw below `MIN_RUNS`. It is the only
   test source allowed to read the clock.
2. `test/cli/command-latency.test.ts`: REQ-PERF-02's three commands spawned through the compiled
   harness on the reference repository. Each run spawns the floor (`--version`: same harness, same
   compiled modules, answered by commander before any command runs) and then the three commands; the
   budget is the p95 of each command's per-run difference from that run's floor.
3. The guard (`test/core/latency-budget-placement.test.ts`) states the same-file textual check it does
   (`bug-014`) and asserts: rule 1, no clock marker outside the helper; rule 2, no file that both
   spawns (marker, or `from '…helpers/spawn-cli'`) and times (marker, or `from '…helpers/latency'`)
   unless `EXEMPTIONS` lists it with a reason. Each failure names the remedy.
4. The reference repository moves out of `query-latency.test.ts` into
   `test/core/helpers/reference-repo.ts`, unchanged, so both levels measure the same 1,000 documents.

**AC classification (T1).**

| AC | Class | Why |
|---|---|---|
| 1 — MCP budget is p95 over N runs | **red-first** | `server.test.ts` takes one sample today; rule 1 fails on it |
| 2 — command-level p95 as marginal cost over a measured floor, under a documented exemption | **red-first** | rule 2 fails on the new suite until the exemption is declared. The budget assertions themselves pass on first run: the commands are already fast, and nothing was fabricated to make them fail |
| 3 — guard's module doc states the same-file invariant; failure names the remedy | characterization | documentation; the remedy text is visible in the red output |

### red (developer)

`bc6a8d49`: the guard rewrite, the two helpers and `command-latency.test.ts`, no `EXEMPTIONS`.
`npx jest test/core/latency-budget-placement.test.ts` → **4 failed, 439 passed**: rule 1 on
`core/query-latency.test.ts` (`Date.now` — in its prose — `performance.now`, `perf_hooks`),
`mcp/resource-latency.test.ts` and `mcp/server.test.ts` (`performance.now`, `perf_hooks`); rule 2 on
`cli/command-latency.test.ts` ("both spawns (imports helpers/spawn-cli) and times (imports
helpers/latency)"), each message ending in the remedy.

### green (developer)

`812c98f0`: `server.test.ts` AC (a) is `sampleLatency(RUNS, …)` + `p95 < P95_BUDGET_MS`, content
assertions on the last result; `query-latency` and `resource-latency` time through the helper and drop
their local copies (the 200-fetch session uses `sampleLatency(200, i => …)`); `query-latency` takes its
fixture from `reference-repo.ts` and its prose no longer says it covers the commands ("stronger … on
three axes … but not on the fourth"); `EXEMPTIONS` lists `cli/command-latency.test.ts` with its reason.
The four suites → 456 passed. Thresholds: 1,000 ms everywhere, unchanged.

**What the full suite showed next.** In a full `npm run test:coverage` (load 26 → 35) the command
budget failed: floor 664–2,180 ms, marginal p95 `memory search` 1,133 ms, `memory history` 1,225 ms,
`dna show` 827 ms. Alone, under load 24–45 from the other worktrees, the same file gave 193 / 179 /
223 ms (`WINGFOIL_LATENCY_REPORT=1 npx jest test/cli/command-latency.test.ts`). Pairing with a floor
cannot cancel the load of the suite doing the measuring. Loosening the threshold was not an option,
so the fix was to run the suite under the conditions the number presupposes. `4840be55`:
- `test/latency-suites.cjs` lists the suites that time spawned processes; `jest.config.js` ignores
  them; the new `jest.latency.config.js` selects them with `maxWorkers: 1`.
- `npm test` is `node scripts/run-tests.cjs`: the parallel run, then the latency pass if the first
  passed. With arguments it runs only the parallel run, with them, as `jest <args>` did.
  `prepublishOnly` is unchanged and still runs every suite.
- The guard requires `EXEMPTIONS` to equal that list.
- `test/cli/run-tests.test.ts` pins the argument rule; `publish-pipeline.test.ts` follows the new
  `test` script. That script is named in spec-015 §2, so an amendment is pending (below).
- A failing command budget now prints all three distributions (`toMatchObject` hid them).

### refactor (developer)

`ca759a61`: `test/core/latency-helper.test.ts` (nearest-rank p95, the refusal below 20 runs, the
run-aligned marginal shape; it asserts no elapsed value) and two comments in
`program.integration.test.ts` that now point at the command-level suite.

Gates, with the spec-015 amendment uncommitted in the tree:

| Command | Result |
|---|---|
| `WINGFOIL_LATENCY_REPORT=1 npm test` (load 8.6 → 12.8) | pass 1: **210 suites, 3763 tests, all passed**; pass 2: 1 suite, 5 tests passed — floor p95 190 ms; marginal p95 `memory search` 96 ms, `dna show` 48 ms, `memory history` 95 ms |
| `npm run test:coverage` (load 11.9 → 16.2) | 210 suites, 3763 passed; **98.86 / 95.45 / 95.29 / 99.57**, equal to `main`'s (`ea637c43` gates in the dev-loop plan). `git diff --stat 243f8f05 -- src` is empty |
| `npm run lint` | clean |
| `npm run docs:api` | clean |
| `npx tsc --noEmit -p tsconfig.json` | clean |
| `npx tsc -p tsconfig.build.json --noEmit` | clean |

`test:coverage` (`jest --coverage`) uses `jest.config.js` and so leaves out the latency pass. That
suite covers no `src/` line (it spawns `dist/`), so the figures are unaffected.

BDD: the `under 1 second` clauses of P1.5, P1.10, P2.2 and P5.2.1 are unchanged in the feature files.
They stay owned by `query-latency` (P1.5, P1.10, P2.2 as `dna show`) and `server.test.ts` (P5.2.1, now p95).

### review (reviewer)

| AC | Status | Evidence |
|---|---|---|
| 1 | **met** | `server.test.ts` AC (a): `sampleLatency(RUNS, …)` and `p95(samples) < P95_BUDGET_MS`; rule 1 keeps a single-sample clock out of every other file, and the helper throws below 20 runs (`latency-helper.test.ts`) |
| 2 | **met** | `command-latency.test.ts`: three `it.each` rows, p95 over 25 runs of each command's cost over that run's `--version` floor; `EXEMPTIONS` gives the reason; the suite runs alone (`npx jest -c jest.latency.config.js --listTests` lists it, `npx jest --listTests` does not) |
| 3 | **met** | the guard's module doc has *What it enforces — a same-file, textual check* and *What it does not see*; every failure ends in `REMEDY_CLOCK` or `REMEDY_SPAWN` (red output above) |

**Unasserted, stated (T1).** The guard does not see a spawn reached through any module other than
`helpers/spawn-cli`: the git calls in `git-fixture.ts`, and the git processes `memory history` itself
starts inside the timed region (which belong to the cost). It does not recognise `new Date(` or
timer-derived timing. Both limits are written in its module doc, as `bug-014`'s cheaper fix proposed;
the import-graph alternative was not built. The floor's own p95 is reported but not asserted.

**Same-class sweep.** Prose that claimed the old rule or the old coverage: `query-latency.test.ts`
(three passages) and `program.integration.test.ts` (two) were updated. `git-fixture-teardown.test.ts`,
`entrypoint.test.ts`, `program.test.ts` and `memory-history.test.ts` describe the guard in ways that
are still true, and were left unchanged.

**Tried and reverted.** I tried moving `query-latency` and `resource-latency` into the latency pass,
since they are the in-process budgets that have flaked under load (`task-141`'s notes: `memory history`
1,148 ms). Branch coverage fell from 95.45 to 95.41 (`npx jest --coverage` with them excluded),
because `test:coverage` runs only the parallel config. Reverted; see candidate finding 1.

### Pending amendments (approver)

- `spec-015-packaging-publishing` §2 — the `test` bullet and a dated Revision note. Proposed `--reason`:
  "task-154 (bug-013) makes npm test run scripts/run-tests.cjs, the parallel jest run followed by the
  suites that time spawned processes run alone, so the test script is no longer jest; prepublishOnly
  is unchanged and still runs every suite."

### Decisions for the approver

- **AC 2 covered rather than reworded.** REQ-PERF-02 stays as written and is now asserted at command
  level. If you prefer the rewording, this suite and the latency pass can be dropped and a
  decision-log filed instead.
- **`npm test` became two passes** (`scripts/run-tests.cjs`). Without that, the command budget fails
  under the suite's own parallel load. `npm test -- <args>` runs only the parallel pass.
- **The floor is `--version` through the harness**: Node start, module load, commander, a print.
  The budget therefore excludes Node and CLI start-up. On a quiet machine that start-up is about 160–190 ms
  (`floor (--version): p95 190 ms`).
