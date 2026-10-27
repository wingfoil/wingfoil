---
id: "task-134-report-source-file-coverage-so-untested-file-counts"
type: task
title: "Report every source file in coverage, so an untested file counts at 0%"
status: done
release: "v0.3"
kind: "fix"
priority: "high"
tags: ["v0.3", "core", "tests", "coverage"]
ref: "dl-136"
bug: ["bug-141"]
depends_on: []
tmpl_version: 260703
wave: "w1"
---

## Description

`jest.config.js` `roots: ['<rootDir>/test']` limits coverage discovery to files the tests load, so a file no test requires is absent from the report rather than at 0% (`bug-141`; three barrels are kept out this way today). `dl-136` (test-results publication, domain D) depends on this fix.

## Acceptance Criteria

- (red-first) running a single suite with `--coverage` lists every file matched by `collectCoverageFrom`, unloaded ones at 0% (the bug's reproduction, inverted).
- (red-first) a `test/lint/` check compares `find src -name '*.ts'` (minus the declared barrels) with the coverage summary's keys after a full run and fails on any difference.
- (characterization) the global threshold still passes, or the task records the new figure and the files responsible (claim-evidence).

## Implementation Notes

- **Size:** M · **wave:** 1 · **kind:** fix (`dl-133` Q1 (b)).
- **Implements:** dev-loop `refactor` coverage gate (>80 %); dl-136 prerequisite.
- **Notes:** Proposal key: C18.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

### design (architect, 2026-10-01)

- `depends_on: []`; no tech-spec is cited, so there is no `approved` spec to confirm or amend. `ref: dl-136` is the consumer of this fix (test-results publication), not a constraint on it.
- Root cause confirmed in Jest's behaviour: the files reported as uncovered are found by walking `roots`; `jest.config.js` had `roots: ['<rootDir>/test']`, so only the `src/` files a run imported reached the report (`bug-141`). The fix is the bug's first candidate: add `<rootDir>/src` to `roots`. `testMatch` stays `**/*.test.ts` and `src/` holds no such file (`find src -name '*.test.ts' | wc -l` → `0`), so no test moves.
- AC classification (confirmed as written):

| AC | Class | Why |
|----|-------|-----|
| AC1 — single suite with `--coverage` lists every `collectCoverageFrom` file, unloaded at 0% | red-first | new behaviour; the bug's reproduction fails today |
| AC2 — `test/lint/` check comparing `find src -name '*.ts'` minus barrels with the summary keys | red-first | new gate; fails on main because the report omits unloaded files |
| AC3 — global threshold still passes, or new figure recorded | characterization | measured before and after, below |

- AC2 design decision (approver to confirm): the check does not read a previous full run's `coverage/` (that would depend on whatever ran last, not deterministic). It runs a child jest with the repository's own `jest.config.js` on one probe suite, `test/lint/fixtures/coverage-probe.ts`, that imports no source file, and compares the child's `coverage-summary.json` keys with `find src -name '*.ts'` minus the `collectCoverageFrom` exclusions, both directions. After the fix the key set does not depend on which suites ran, so it equals a full run's: verified in refactor (full-run keys == single-suite keys). The child drops `globalSetup` (no `dist/` rebuild racing the parent's, `bug-095`), clears the threshold (a run that covers nothing sits at 0% by design) and writes into a fresh `mkdtemp` directory. The probe file ends in `.ts`, not `.test.ts`, so the normal `testMatch` never collects it.

### red (2026-10-01) — `37e534ff`

- `npx jest test/lint/coverage-parity.test.ts` → 1 failed, 5 passed, 6 total; the failure is `lists exactly find src -name "*.ts" minus the declared barrels` with `missing` = 81 files (`… | grep -c '^    +     "src/'` → `81`), `unexpected` = `[]`. Every expected file is missing because the probe loads none.
- Note: the `every file at 0%` case passed at red vacuously (the summary had no file entries); it is meaningful only alongside the parity case, which is the red.
- `npx eslint test/lint/coverage-parity.test.ts test/lint/fixtures/coverage-probe.ts` → exit 0.

### green (2026-10-01) — `bfcbab2e`

- `jest.config.js`: `roots: ['<rootDir>/test', '<rootDir>/src']`, with a comment citing this task and `bug-141`. Nothing else in the file changed (`git diff 5b885fd5 -- jest.config.js` → one line replaced, five comment lines added), to keep the later `jest.config.js` edits of `task-146`/`task-152` conflict-light.
- `npx jest test/lint/coverage-parity.test.ts test/lint/coverage-scope.test.ts` → 2 suites, 20 tests passed.
- AC1 reproduction inverted (the bug's own steps): `npx jest test/memory/schema.test.ts --coverage --coverageReporters=json-summary --coverageDirectory=<tmp> --coverageThreshold='{}'`, then the bug's `node -e` key count → `81 true`, and `src/cli/program.ts` reports `lines.pct` `0` (was `1 false` on main).

### refactor (2026-10-01)

Coverage baseline, measured with `npx jest --coverage --coverageReporters=json-summary --coverageReporters=text-summary --coverageDirectory=<tmp>`, each run alone in this worktree:

| | suites / tests | statements | branches | functions | lines | files in summary |
|---|---|---|---|---|---|---|
| before — `main` at `5b885fd5` | 177 / 2969 | 98.82% (4366/4418) | 95.06% (2329/2450) | 94.44% (731/774) | 99.52% (3795/3813) | 81 |
| after — `bfcbab2e` | 178 / 2977 | 98.82% (4366/4418) | 95.06% (2329/2450) | 94.44% (731/774) | 99.52% (3795/3813) | 81 |

- **New baseline = unchanged: 98.82 / 95.06 / 94.44 / 99.52.** The bug is latent, as `bug-141` said: on a full run every one of the 81 measured files was already loaded by some test, so making unloaded files count changes no denominator today. The key sets are identical: comparing the sorted keys of the before, after and single-suite summaries → `82 true true` (81 files + `total`). The three barrels `bug-141` names as unloaded (`src/cli/index.ts`, `src/directives/index.ts`, `src/workflow/index.ts`) stay out because `collectCoverageFrom` excludes them, not because of `roots`. No file is responsible for a change, because there is none (AC3).
- The +8 tests are this suite's 6 plus 2 cases of `test/core/latency-budget-placement.test.ts`, whose `it.each` runs once per `.ts` file under `test/` (the two new files).
- `npm test` → 178 suites, 2977 tests passed. `npm run test:coverage` → exit 0, `All files` 98.82 / 95.06 / 94.44 / 99.52, 178 / 2977.
- `npm run lint` → exit 0. `npm run docs:api` → exit 0. `npx tsc --noEmit -p tsconfig.json` → exit 0. `npx tsc -p tsconfig.build.json --noEmit` → exit 0.
- BDD: `grep -rli coverage docs/02_requirements/02_bdd/features/` names only `p4-workflow/P4.12-workflow-checks.feature`, whose scenarios are the workflow engine's `tests.coverage` post-check (engine not built), not Jest's coverage discovery; no scenario added or changed.
- Cost: the new suite takes about 4 s alone and 25 s under load (`npx jest test/lint/coverage-parity.test.ts`); its `beforeAll` allows 180 s.

### review (self, reviewer, 2026-10-01)

- AC1 met: the bug's reproduction now lists all 81 files, `src/cli/program.ts` at 0%; held by `coverage-parity.test.ts` (`reports every file at 0%`).
- AC2 met: `test/lint/coverage-parity.test.ts` fails on a missing or an unexpected file (unit cases on `coverageDifference`; red run above on the real config). Deterministic: sorted walk in byte order, fixed probe, fresh temp directory, no clock.
- AC3 met: threshold passes; baseline unchanged (table above).
- No CLI command or help text touched, so `docs/cli-reference.md` is not concerned.
- Pending amendments (approver): none.

### review (independent, 2026-10-01)

- Verdict: **approve with fixes**. The reviewer re-ran the gate against the pre-fix `jest.config.js` (1 failed: 81 files missing) and a positive control (an extra unloaded `src/` file → the gate still passes, the file listed at 0%). The approver is asked to accept AC2's probe-run reading of "after a full run" (design, above).
- Fix 1 — the child could hang the suite: `execFileSync` blocks the event loop, so the `beforeAll` 180 s timeout could never fire on a hung child jest. The call now passes `timeout: 170_000` and `killSignal: 'SIGKILL'`, so a hung child is killed inside the hook's budget and the hook fails.
- Fix 2 — the child inherited the default `maxWorkers` (cores − 1), and its coverage reporter transforms the 81 untested files in that many workers, on top of the parent's full run. The child now runs with `--maxWorkers=1`.
- Measured alone in this worktree, with the machine under load from parallel sessions (`uptime` load average 39 then 26, 12 cores), so the figures are noisy. `npx jest test/lint/coverage-parity.test.ts` before the fix ran in 16.2 s and 10.8 s; after, in 37.4 s and 41.4 s. The child alone, timed back to back by a scratch script (`execFileSync` around the same child command, `process.hrtime`): default workers 14.8 s and 10.5 s, `--maxWorkers=1` 18.5 s and 13.9 s, `--maxWorkers=2` 11.3 s. One worker therefore makes the gate a few seconds slower when it runs alone; the gain is that it no longer adds a worker per core during a full run.
- After the fixes: `npm run test:coverage` → 178 suites, 2977 tests passed in 111.9 s, `All files` 98.82 / 95.06 / 94.44 / 99.52 (baseline unchanged). `npx eslint test/lint/coverage-parity.test.ts` → exit 0; `npx tsc --noEmit -p tsconfig.json` → exit 0.
