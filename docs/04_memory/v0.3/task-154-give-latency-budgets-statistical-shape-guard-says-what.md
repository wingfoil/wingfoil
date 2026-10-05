---
id: "task-154-give-latency-budgets-statistical-shape-guard-says-what"
type: task
title: "Give the latency budgets one statistical shape and a guard that says what it enforces"
status: done
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
*(Corrected at review, 2026-10-03.)* What the suite asserts is each command's marginal cost over a
measured process-start floor, not the total the Fit Criterion words, so this is a partial coverage
whose deviation is pending a decision-log; see *Review fixes*.
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
`dna show` 827 ms. One run of the file alone, under load 24–45 from the other worktrees, gave 193 /
179 / 223 ms (`WINGFOIL_LATENCY_REPORT=1 npx jest test/cli/command-latency.test.ts`). *(Corrected at
review, 2026-10-03: that was one run, not a property. The reviewer's `npm test` at load 5→42 failed
the same pass at 2,050 ms; running alone does not protect the number from other jobs on the machine.)*
Pairing with a floor cannot cancel the load of the suite doing the measuring. Loosening the threshold was not an option,
so the fix was to run the suite under the conditions the number presupposes. `4840be55`:
- `test/latency-suites.cjs` lists the suites that time spawned processes; `jest.config.js` ignores
  them; the new `jest.latency.config.js` selects them with `maxWorkers: 1`.
- `npm test` is `node scripts/run-tests.cjs`: the parallel run, then the latency pass if the first
  passed. With arguments it runs only the parallel run, with them, as `jest <args>` did.
  `prepublishOnly` is unchanged. *(Superseded at review: the latency pass is now opt-in; see
  Review fixes.)*
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
| 2 | **met as worded by the AC; REQ-PERF-02's total unasserted** (corrected at review) | `command-latency.test.ts`: three `it.each` rows, p95 over 25 runs of each command's marginal cost over the (median, since review) `--version` floor; `EXEMPTIONS` gives the reason; the suite is outside the parallel run (`npx jest -c jest.latency.config.js --listTests` lists it, `npx jest --listTests` does not). The total is reported, not asserted: decision-log pending |
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

### Review fixes (2026-10-03)

The coordinator's review returned **approve with fixes**, with approver rulings. All are applied
in-task; no re-submit. Red `b2683073`: `npx jest test/cli/run-tests.test.ts test/core/latency-helper.test.ts`
→ **6 failed, 8 passed**. Green `a9e49bca`. bug-013 note `e73d8f15`.

1. **Ruling: the latency pass runs only when asked for.**
   - `npm test` (`scripts/run-tests.cjs`) runs the latency pass only with `WINGFOIL_LATENCY=1`. The
     name follows `WINGFOIL_LATENCY_REPORT`.
   - The new script `npm run test:latency` (`jest -c jest.latency.config.js`) is the dev-loop gate,
     run on an idle machine.
   - CI (`ci.yml` → `npm run prepublishOnly`), `prepublishOnly` and `publish.yml` neither set the
     variable nor name the pass.
   - `test/cli/run-tests.test.ts` pins this: the opt-in rule, the `test:latency` script, and the
     absence of `WINGFOIL_LATENCY|test:latency|jest.latency` from `prepublishOnly` and both workflows.
2. **Fix: load-robust estimator.** `sampleMarginalLatency` subtracts the **median** of all floor
   samples from every total. It no longer subtracts the floor of the same run: the reviewer's run
   (load 5→42) showed pairing does not cancel jitter (marginal p95 2,050 ms, minimum −1,067 ms). The
   threshold is unchanged at 1,000 ms. The helper doc, the suite's doc and the spec-015 Revision now
   say the budget **presupposes an otherwise idle machine**. That is true of the new estimator as
   well: one alone-run at load 15–17 (another worktree's jest starting) failed `memory search` at a
   marginal p95 of 1,062 ms (floor p95 617 ms, max 1,009 ms). The idle-machine run is in the gates
   below. The design-phase claim of 193 / 179 / 223 ms is corrected above.
3. **Fix: arguments.** The Revision used to say "passes any arguments to the first one only". It now
   says what the code does. With an argument naming a latency suite (`test/cli/command-latency.test.ts`,
   with or without `./`), that invocation goes to the latency config with the arguments unchanged.
   Any other argument runs only the parallel pass (`plannedRuns(['--silent'], {})` → `[['--silent']]`).
4. **Ruling: what is asserted.** The asserted quantity is the **marginal** cost over the median
   `--version` floor. The **total**, start-up included and the thing REQ-PERF-02's "return in < 1,000 ms"
   words, is **reported, not asserted** (`WINGFOIL_LATENCY_REPORT=1`, and in every failure message).
   This deviation is pending a decision-log, which the coordinator files. It is stated in the suite's
   doc, `query-latency.test.ts`, the exemption reason, the spec-015 Revision and a dated note in
   `bug-013` (`e73d8f15`). The suite's test titles now say "marginal cost over the median
   process-start floor".
5. **The percentile method.** The helper's doc now says nearest-rank is this module's choice; the REQ
   does not specify one.

Same-class prose that described the old two-pass `npm test` was updated:
- `jest.config.js` and `jest.latency.config.js`;
- `test/latency-suites.cjs`, with its `.d.cts`;
- the guard's module doc and its `it` title;
- `program.integration.test.ts` and `publish-pipeline.test.ts`.

Gates after the fixes, with the spec-015 amendment uncommitted:

| Command | Result |
|---|---|
| `npm test` (load 16 → 19) | parallel pass only: **210 suites, 3767 tests, all passed**; no latency pass ran |
| `npm run test:coverage` | 210 suites, 3767 passed; **98.86 / 95.45 / 95.29 / 99.57**, unchanged |
| `npm run lint`, `npm run docs:api`, `npx tsc --noEmit -p tsconfig.json`, `npx tsc -p tsconfig.build.json --noEmit` | all clean |
| `WINGFOIL_LATENCY_REPORT=1 npm run -s test:latency` | 1-min load 3.75 → 3.54: **5 passed**. Floor p95 203 ms. Marginal p95 (asserted): `memory search` 68 ms, `dna show` 23 ms, `memory history` 106 ms. Total p95 (reported only): 250 / 204 / 287 ms |

### Pending amendments (approver)

- `spec-015-packaging-publishing` §2 — the `test` bullet and a dated Revision note. Proposed `--reason`:
  "task-154 (bug-013) makes npm test run scripts/run-tests.cjs, which leaves the suites that time
  spawned processes out of the parallel jest run and runs them alone only when asked for (npm run
  test:latency, or WINGFOIL_LATENCY=1 npm test), so the test script is no longer jest and no publish
  waits on a wall-clock measurement that presupposes an idle machine."

### Decisions for the approver

- **AC 2 is covered in part.** The suite asserts each command's marginal cost, not REQ-PERF-02's
  total; the deviation is pending the approver's decision-log (ruling 2026-10-03).
- **The latency pass is opt-in** (ruling 2026-10-03): `npm run test:latency` or
  `WINGFOIL_LATENCY=1 npm test`, never CI or `prepublishOnly`.
- **The floor is `--version` through the harness**: Node start, module load, commander, a print.
  The budget therefore excludes Node and CLI start-up. On a quiet machine that start-up is about 160–190 ms
  (`floor (--version): p95 190 ms`).
