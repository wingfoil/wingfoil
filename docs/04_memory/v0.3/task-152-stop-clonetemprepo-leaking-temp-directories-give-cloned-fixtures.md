---
id: "task-152-stop-clonetemprepo-leaking-temp-directories-give-cloned-fixtures"
type: task
title: "Stop `cloneTempRepo` leaking temp directories and give cloned fixtures `gc.auto=0`"
status: done
release: "v0.3"
kind: "fix"
priority: "low"
tags: ["v0.3", "core", "tests"]
ref: "dl-121"
bug: ["bug-064", "bug-065", "bug-197"]
depends_on: []
tmpl_version: 260703
wave: "w1"
---

## Description

`cloneTempRepo` (`test/storage/helpers/git-fixture.ts:72-74`) makes two `mkdtemp` directories per call and never removes them, and configures nothing, so `gc.auto=0` (set only in `makeTempGitRepo`, `:31`) never reaches a clone while a test is titled "every fixture repo".

## Acceptance Criteria

- (red-first) after a suite using `cloneTempRepo`, no directory it created remains (count via a registered cleanup; optional `globalTeardown` sweep reports leftovers by count).
- (red-first) a cloned fixture reports `git config gc.auto` → `0`.
- (characterization) the overclaiming test title/TSDoc matches the assertion.

## Implementation Notes

- **Size:** S · **wave:** 1 · **kind:** fix (`dl-133` Q1 (b)).
- **Implements:** dl-121 T1.
- **Notes:** Proposal key: C20.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

### design (architect, 2026-10-02)

- `depends_on: []`; no tech-spec cited. Scope: `bug-064`, `bug-065`, and `bug-197` (absorbed by the approver's triage on 2026-10-02, merged from `main` at `ce315e70`).
- AC classification:

| AC | Class | Why |
|----|-------|-----|
| AC1 no directory `cloneTempRepo` created remains | red-first | `cloneTempRepo` made two `mkdtemp` dirs and returned a child of one |
| AC2 cloned fixture `gc.auto` = `0` | red-first | `git clone` does not copy local config |
| AC3 test title/TSDoc match assertions | characterization | prose fix (dl-121 T1) |
| AC-197 (added) CLI suites spawn through `test/cli/helpers/spawn-cli.ts`, none coalesces `status ?? 1` | red-first | textual guard, 12 offenders on the branch |

- Design: the clone *is* its `mkdtemp` directory (`git clone <src> .` from inside it), so the caller's existing `removeTempDir(clone)` removes everything; no registry is needed. Aggregate visibility (bug-064 second half): `test/global-setup.cjs` sets `WF_FIXTURE_RUN_TAG=r<pid>` before workers fork; the fixture prefix becomes `wf-storage-<tag>-`; the new `test/global-teardown.cjs` counts, reports in one line and removes only this run's tagged leftovers. Runs in parallel worktrees use different tags, so they never count or delete each other's fixtures. Leftovers are reported, never fatal (open sub-question in bug-064: approver to decide).

### red

- `8651bbb5`: `npx jest test/storage/git-fixture-teardown.test.ts` → 2 failed, 8 passed (AC1 lists `/tmp/wf-storage-clone-*` and `/tmp/wf-storage-cwd-*` still present; AC2 `git config --get gc.auto` exits 1 in the clone).
- `test/storage/fixture-run-sweep.test.ts` (count, report, tag) was written with the implementation. Against the pre-fix tree it fails to load (`Cannot find module '../global-teardown.cjs'`), checked by restoring the `HEAD` copies of the helper, setup and config.
- AC-197 `23515785`: `npx jest test/lint/no-signal-as-exit.test.ts` → 1 failed, 1 passed. 12 offenders: the 10 `test/cli` suites with `status: run.status ?? 1` (the 9 named in bug-197 other than `check-governance`, plus `directive-assign-force`), and 2 in `test/memory/history-rename-path.test.ts`.
- Teardown ownership, red commit `52c736dc` (see refactor). That commit's test set `process.env.TMPDIR`, which jest sandboxes, so `os.tmpdir()` never saw it: that test was unsound and was replaced in `922f05f2` by one calling the pure `teardownRun`. Shown red by removing the pid check: 1 failed, 7 passed ("leaves the fixtures alone when the tag names another process").

### green

- `227111d5` (bug-064, bug-065): `cloneTempRepo` makes one directory and sets `gc.auto=0`; `disableAutoGc` is shared with `makeTempGitRepo`; run tag plus `globalTeardown` (one line added to `jest.config.js`; `roots` unchanged).
- `902bb67a` (bug-197): the 10 local `wingfoil()` helpers delegate to `runCliEntry`; `check-governance` uses `spawnCapture`; the 2 `history-rename-path` helpers use `spawnCapture`; unused `CLI`/`REPO_ROOT`/`spawnSync` removed. Every assertion is unchanged (the diff touches only helper definitions, imports and comments).
- `922f05f2`: the teardown sweeps only when `WF_FIXTURE_RUN_TAG === r<process.pid>`.

### refactor (gates)

- **Defect found here, in this task's own change:** the first full runs failed 4–18 tests, a different set each run, with `spawnSync git ENOENT` (fixture `cwd` gone mid-test), even with a private `TMPDIR`. Cause: `test/lint/coverage-parity.test.ts` runs a child jest from this `jest.config.js`. The child drops `globalSetup` but kept the new `globalTeardown` and inherited the parent's tag, so it swept the parent's live fixtures. Fixed in `922f05f2` (ownership check). The earlier "load" reading of these failures was wrong.
- After the fix: `TMPDIR=<private> npm test` → 202/202 suites, 3379/3379 tests (load average ~17–20), leaving 0 fixture dirs. `npm run test:coverage` in `/tmp` → 202/202, 3379/3379, All files 98.85 stmts / 95.39 branches / 95.18 funcs / 99.56 lines; `ls -d /tmp/wf-storage-r*` → 0. The task changes no `src/` file (`git diff --stat <merge-base> HEAD -- src` is empty), so coverage cannot regress; the ±0.03 against an earlier run is run-to-run variation.
- Leak measurement (private `TMPDIR`): before the fix, a full `npx jest` left 2 fixture dirs, and `test/storage/snapshot.test.ts` alone left 2. After, 0 for both.
- `npm run lint` clean; `npm run docs:api` clean; `npx tsc --noEmit -p tsconfig.json` and `npx tsc -p tsconfig.build.json --noEmit` clean.

### review (self)

- AC1 is met (tests plus leak measurement). AC2 is met. AC3: the auto-gc test title now names `makeTempGitRepo` only, the clone has its own test, and the bug-065 extras are done (retry budget asserted, the concurrent-writer `finally` uses `removeTempDir`, the retry TSDoc says the 300ms bounds sleep, not elapsed time). AC-197 is met (guard green).
- For the approver: leftovers are reported, never fatal (bug-064's open sub-question). `test/global-teardown.cjs` exports one self-contained async function; task-146 adds its own teardown, so the two need chaining at merge.

### review fixes (2026-10-02, approver review: APPROVE with two in-task fixes and a nit)

- **Guard misses `||`** (reviewer: a file with `{ status: run.status || 1 }` left the guard green). Red `b5915954`: `npx jest test/lint/no-signal-as-exit.test.ts` → 2 failed, 2 passed (the `||` detector case, and the walk not reaching `cli/fixtures/cli-harness.cjs` / `global-setup.cjs`). Green `2b152e7d`: the regex is now `/\bstatus\s*(\?\?|\|\|)/`, and the walk covers `.ts`, `.js`, `.cjs` and `.mjs` → 4/4. Why the JavaScript files are scanned: `test/` holds JavaScript that spawns children (the CLI harness, the jest setup and teardown hooks), and the coalescing hazard does not depend on the language. `grep -rnE "status\s*(\?\?|\|\|)" test` finds no offender outside the guard itself.
- **bug-197 wording vs. scope:** dated closing note added to bug-197 (`68252424`). It narrows the resolution to the 10 named suites, the 2 same-class files and the guard; the remaining direct-`spawnSync` suites (`status: number | null`, not hazardous) are left to the coordinator's follow-up.
- **Nit:** double blank line in `test/cli/memory-add-set.integration.test.ts` removed. A check over every test file this branch touches finds no other occurrence.
- Re-run: `npm run lint` clean; `npx tsc --noEmit -p tsconfig.json` clean; `npx jest test/lint test/cli/memory-add-set test/storage` → 28/28 suites, 292/292 tests.
