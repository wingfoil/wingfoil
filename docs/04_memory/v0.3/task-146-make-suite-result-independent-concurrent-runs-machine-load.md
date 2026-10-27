---
id: "task-146-make-suite-result-independent-concurrent-runs-machine-load"
type: task
title: "Make the suite's result independent of concurrent runs and machine load"
status: done
release: "v0.3"
kind: "fix"
priority: "medium"
tags: ["v0.3", "core", "tests", "reliability"]
ref: "dl-121"
bug: ["bug-095", "bug-167", "bug-181"]
depends_on: []
tmpl_version: 260703
wave: "w1"
---

## Description

Two `npx jest` runs in one worktree delete and rebuild each other's `dist/` (`test/global-setup.cjs:22`, unguarded `rmSync`; `bug-095`), a false red that matters once agents run in parallel worktrees. `test/cli/publish-secrets.test.ts:303` (`npm publish --dry-run`) fails under `npx jest --coverage` and passes alone (`bug-167`).

## Acceptance Criteria

- (red-first) a second concurrent global setup waits on, or refuses with a clear message against, a lock held by the first; it never deletes a `dist/` another run is using.
- (red-first) the publish dry-run case declares its resource needs (timeout and serial execution, or its own isolated npm cache) and passes in three consecutive `npx jest --coverage` runs, recorded.

## Implementation Notes

- **Size:** S · **wave:** 1 · **kind:** fix (`dl-133` Q1 (b)).
- **Implements:** dl-121 T2.
- **Notes:** Proposal key: C21. `bug-066` (same file, v0.4) is not in scope.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

Branch `task/task-146-make-suite-result-independent-concurrent-runs-machine-load`, worktree
`../.wf2-wt/task-146`, cut from `main` at `903b87a6`. Start `a61386f5`; `bug-095`, `bug-167`,
`bug-181` `[planned → in-progress]` (`4ee4e42d`, `29310dce`, `838746fc`).

### design (architect)

**`depends_on`:** none (`depends_on: []`). **Specs:** the task cites none. `ref: dl-121` is `ready`
(`awk '/^status:/{print $2;exit}' docs/04_memory/design/dls/dl-121-*.md` → `ready`). Its T2
(`.wingfoil/directives/custom/testing.md`) applies to `bug-181`: an environment-dependent defect ships
with a check that asserts the invariant and injects the condition itself, so it fails wherever the
suite runs.

**Root causes, measured on `838746fc`:**
- `bug-095`: `test/global-setup.cjs` did an unguarded `rmSync(dist)` + `tsc`. No lock between runs.
- `bug-181`: `npm_config_loglevel=silent npx jest test/cli/publish-secrets.test.ts -t "dry run"` →
  1 failed, `Received string: ""`. Without the variable it passes. `npm run -s env | grep npm_config_`
  shows `npm run -s` exports `npm_config_loglevel=silent` (and `npm_config_globalconfig`,
  `npm_config_local_prefix`, …). `npmEnv()` spread `process.env`, so the inner npm inherited all of it.
- `bug-167`: did **not** reproduce. The baseline `npx jest --coverage` on `838746fc` passed:
  200 suites / 3363 tests, exit 0, 275 s, load average ~9–13. It is **not** `bug-181`'s mechanism.
  The recorded commands are `npm run test:coverage` without `-s` (`task-120`'s Execution Notes) and
  `npx jest --coverage` (`bug-167`), and neither exports the loglevel: `npm run env | grep -i loglevel`
  and `npx -c env | grep -i loglevel` print nothing. Only `npm run -s` exports it. (The first version
  of this note called the link "unproven". The review showed the record contradicts it.) The cause
  is unknown. Reading the code found one load-dependent hazard: the case's `beforeEach` spawns a real
  `npm pack` under jest's default **5 s hook timeout**, while the case itself declares 60 s. The
  remaining guard is that 60 s hook timeout plus the green coverage runs under load recorded below.
  `bug-167` is closed as "not reproduced; hypothesis guarded", recorded in its own notes.

**Design decisions (approver to confirm):**
- **Wait, then refuse.** A second run waits for the lock and prints one stderr line naming the
  holder's pid. If the lock is still held after **15 minutes** (longer than a loaded coverage run,
  ~7 min measured here), it refuses with an error naming the pid and the lock path. Either way it
  deletes nothing. Waiting was chosen over an immediate refusal because a reviewer re-running gates
  in an implementer's worktree then gets a true result instead of a refusal to retry.
- **Lock** `<worktree>/.jest-dist.lock` (git-ignored) holds the pid of the jest main process. It is
  created atomically (a private file hard-linked onto the lock path). It is taken in `globalSetup`
  and released in the new `globalTeardown`. A lock whose pid is dead (a run killed before teardown)
  is taken over. A release removes only the releaser's own lock, so the nested jest in
  `test/lint/coverage-parity.test.ts`, which spreads `jest.config.js` and therefore runs the
  teardown, cannot free the outer run's lock. That file needed no edit.
- **npm environment:** new `test/cli/helpers/npm-env.ts` `withoutCallerNpmConfig()` drops every
  `npm_config_*` key, in either letter case. `publish-secrets`' `npmEnv()` uses it and also points
  `npm_config_globalconfig` at an empty file. The same-class instance is
  `publish-pipeline.test.ts`'s stage-1 `npm publish --dry-run`. Under
  `npm_config_loglevel=silent` it prints nothing (`… 2>&1 | wc -c` → `0`), so its two
  `not.toContain` checks passed **vacuously**. It now uses the helper and asserts the
  `+ wingfoil@<version>` line (dl-121 T1).
- **Perf budgets are not touched.** REQ-PERF-02/04 under load belong to `task-154`.

**AC classification (T1):**

| AC | Class | Why |
|---|---|---|
| 1 — a concurrent global setup waits on / refuses against the first run's lock, never deletes its `dist/` | **red-first** | no lock exists |
| 2 — the publish dry-run declares its resource needs and passes 3 consecutive `npx jest --coverage` runs | **red-first** for the env leak (`bug-181`), which reproduces. The resource declaration (hook timeout) and the 3-run record are verification, because the coverage failure did not reproduce |

### red (developer)

`e54e27a8`. `npx jest test/lint/dist-lock.test.ts test/cli/publish-secrets.test.ts
test/cli/publish-pipeline.test.ts` → 2 suites failed, 2 tests failed, 46 passed:
- `dist-lock.test.ts`: `Cannot find module '../dist-lock.cjs'`. The lock does not exist yet.
- publish-secrets "hands the inner npm none of the caller's npm configuration": 10 inherited
  `npm_config_*` keys received.
- publish-secrets "publishes (dry run) the same way when … npm_config_loglevel=silent":
  `Received string: ""`.
- publish-pipeline's new `+ wingfoil@0.2.2` assertion passes normally. It fails under
  `npm_config_loglevel=silent npx jest test/cli/publish-pipeline.test.ts -t stage-1` (1 failed).

### green (developer)

`e107e4e0`: `test/dist-lock.cjs` (+ `.d.cts`), `test/global-setup.cjs` (builds through
`prepareDist`), new `test/global-teardown.cjs`, `jest.config.js` (`globalTeardown` and a 2-line
comment; `roots` unchanged, still including `<rootDir>/src`), `.gitignore`, `npm-env.ts`, and the two
publish suites. Two corrections went in this commit:
- The red's wiring assertion `not.toMatch(/rmSync/)` matched the setup's own doc comment, so it now
  strips comments first. This is a test bug, not a behaviour change.
- An empty user config reused as the global config made npm refuse with `double-loading config`, so
  the global config now has its own empty file.

The 3 files → 59/59. With `npm_config_loglevel=silent`, publish-secrets + publish-pipeline → 48/48.

**Real concurrency, AC 1:** run A `npx jest test/cli/program.integration.test.ts` in the background,
then the same command as run B, started 4 s later in this worktree. B printed
`jest globalSetup: dist/ is in use by another jest run in this worktree (pid 3837495, lock …/.jest-dist.lock); waiting for it to finish.`
It then ran after A. A: 75/75, exit 0. B: 75/75, exit 0. `.jest-dist.lock` was absent afterwards.

### refactor (developer)

Gates on `e107e4e0`:

| Command | Result |
|---|---|
| `npx jest --coverage` run 1 | exit 0; 201 suites / 3380 tests; 98.85 / 95.39 / 95.18 / 99.56; 423 s; load avg ~31–46 |
| `npx jest --coverage` run 2 | exit 0; 201 / 3380; same figures; 147 s; load avg ~67–73 |
| `npx jest --coverage` run 3 | exit 0; 201 / 3380; same figures; 165 s; load avg ~39–57 |
| `npm run -s test:coverage` (`bug-181`'s condition) | exit 0; 201 / 3380; same figures; 177 s; load avg ~45–50. Before the fix this condition failed the dry-run case |
| baseline `npx jest --coverage` on `838746fc` | exit 0; 200 / 3363; 98.85 / 95.39 / 95.18 / 99.56. Same figures as after the change: no regression |
| `npm run -s lint` | exit 0 |
| `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| `npx tsc -p tsconfig.build.json --noEmit` | exit 0 |
| `npm run -s docs:api` | exit 0 |

Coverage is unchanged because everything changed lives under `test/`, outside `collectCoverageFrom`.
No CLI command, help text or user doc changed: `grep -rn "jest-dist\|global-setup\|bug-095"
docs/user-guide.md docs/cli-reference.md README.md CLAUDE.md .wingfoil/README.md` → nothing.

### review (reviewer)

- AC 1: `test/lint/dist-lock.test.ts`, 11 cases on temporary directories. They cover waiting on a
  live holder (this worker's parent pid), refusing with the holder's pid and the lock path, never
  removing or rebuilding a held `dist/`, stale takeover, own-only release and the config wiring. The
  real two-run demonstration is recorded above.
- AC 2: the declarations (60 s hook and case timeouts, own cache, empty user and global configs, no
  caller `npm_config_*`) and the 3 consecutive coverage runs, all green under heavy parallel load.
  The `npm run -s` run is the `bug-181` condition.
- **Unasserted (T1):** "serial execution" is not declared. Jest has no per-case serial switch, and
  the AC allows the isolated cache as the alternative. The suite never asserts the 5 s hook timeout
  as a *cause* of `bug-167`, which stays a hypothesis.
- ~~Residual window: two runs breaking the same stale lock at once can both take it.~~ Closed at
  review (fix 2 below).

**Pending amendments (approver):** none.

### Review fixes (2026-10-02, verdict "approve with fixes"; not re-submitted)

1. **`bug-167` record.** The link to `bug-181` is contradicted by the record, not merely unproven.
   The design note above is corrected, and `bug-167`'s own notes now say "not reproduced; hypothesis
   guarded", with the commands that show neither recorded runner exports the loglevel.
2. **Stale-lock takeover race.** The reviewer's script
   (`scratchpad/task-146/race.cjs`: 4 simultaneous takers on a lock left by a dead pid, wait 200 ms)
   showed 2 holders in **4 / 80** trials on `c1f8a58a`. It was reproduced here before the fix: 4 / 80.
   - **Fix (`559c8132`):** `breakStale` deletes a stale lock only while holding `<lock>.break`
     (created atomically like the lock). Under it, the lock can change only through its owner's
     release, and a stale lock's owner is dead.
   - **If a run is killed while holding the break lock**, the others wait and then refuse, naming
     it. Two holders cannot result.
   - **After the fix:** **0 / 200** trials with more than one holder (exactly one each time), at load
     ~21–28.
   - **The interleaving itself has no deterministic test.** It needs a pause between a read and a
     delete inside one synchronous step, so the script's trial counts are the evidence for it.
   - **What the tests pin**, as a red-first test (`e7a54cbe`, failing before `559c8132`): a run
     does not break a stale lock while another holds the break lock, and refuses naming it.
     Characterization: no break lock or `.tmp` is left after a takeover.
3. **`.gitignore`** now has `.jest-dist.lock*`, which covers `.break` and `.<pid>.tmp`. The wiring
   test checks all three with `git check-ignore`.

`test/global-teardown.cjs` stays a single exported function, so `task-152` can chain its fixture
sweep onto it.

Gates on `559c8132` + these notes:
- `npx jest --coverage`: exit 0, 201 suites / 3382 tests, 98.85 / 95.39 / 95.18 / 99.56 (unchanged),
  load ~28;
- `npm run -s lint`, `npx tsc --noEmit -p tsconfig.json`, `npx tsc -p tsconfig.build.json --noEmit`
  and `npm run -s docs:api`: all exit 0;
- no `.jest-dist.lock*` was left behind.
