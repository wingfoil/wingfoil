---
id: "task-206-agent-execute-records-run-json-lines-line-under"
type: task
title: "`agent execute` records each run as one JSON Lines line under `paths.runs`, commits it as `agent: record <run-id>`, and reads it back strictly"
status: in-review
release: "v0.3"
kind: "feature"
priority: "high"
tags: ["v0.3", "agent", "run-record", "determinism"]
ref: "dl-114"
bug: []
depends_on: ["task-127-add-memory-amend-id-reason-approver-gated-verb", "task-131-make-dirty-target-guard-refuse-path-cannot-inspect", "task-138-dna-yaml-declares-team-agents-adapter-runs-paths", "task-192-stamp-wingfoil-commit-wingfoil-version-semver-sha-pin"]
tmpl_version: 260703
---

## Description

This is the run-log library, used by `agent execute` (task-228), `agent list` (task-240) and `agent show` (task-220). It covers: - the 18-key record of §4.2 in fixed key order, with the literal `not-reported`, never `0` or `null`; - the run id `<element-id>/<phase>/<n>`, with `n` counted at `state_ref` (§4.3; `adhoc` for a run with no step); - the strict reader of §4.5; - the §4.4 commit: only the element's `<runs>/<element-id>.jsonl`, via `commitPaths --only`, subject `agent: record <run-id>`, `dl-111` trailer, no other body; - the collision rule: a record whose id is already at the then-current `HEAD` is refused with `CONFLICT`, and the record goes to stderr as a `details` line.

## Acceptance Criteria

- (red-first) Serialization: one line, keys in §4.2 order, no insignificant whitespace, `\n`-terminated. `tokens` carries four integer-or-`not-reported` fields. `workflow: "n/a"` and `phase: "adhoc"` for a run with no step.
- (red-first) The run id is 1 + the count of matching `(element, phase)` records **at `state_ref`**. It is deterministic across two clones of the same history. A malformed id fails `^<element-id>/[a-z][a-z0-9-]*/[1-9][0-9]*$`.
- (red-first) The reader refuses non-JSON, a missing, extra or out-of-order key, a wrong type, an id whose element segment is not the file basename, and a duplicate id. Each refusal uses the §4.5 message (`VALIDATION`, exit 1).
- (red-first) The commit contains exactly the run-log file. The agent's uncommitted edits elsewhere stay uncommitted and unstaged. The subject is `agent: record <run-id>` and the trailer block holds `WingFoil-Version:`. `memory history` does not report the commit as a Memory operation.
- (red-first) Collision: pre-commit the same id at `HEAD`, then record. The result is `CONFLICT` `run id <run-id> already recorded at HEAD`, nothing is appended, and the full record is on stderr.
- (red-first) A failed commit returns `IO` `run <run-id> not recorded: <cause>` with the record as a `details` line.
- (red-first) The `notes` field is `<element-id>#execution-notes` when the element's `## Execution Notes` differs between `state_ref` and `HEAD`, else `none`. It is always `none` for a type whose template lacks the section.
- (characterization) This repository's `.wingfoil/dna.yaml` gains `paths.runs` (value chosen and recorded in Execution Notes), with a `doc-versioning` bump.
- (characterization) `dl-135` Action 2: `dl-114`'s body gains the session-id field through `memory amend` (`dl-108`'s verb), one `wf(decision-log): amend …` commit. If the verb has not shipped when this task reaches review, the task records that fact and leaves the action open. It does not hand-edit the file.

## Implementation Notes

- **Size:** M · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-114 (Q1 (A), Q2 (b), Q3 (i)); dl-135 point 2, Q2 (c), Q3 (a), Action 2; spec-016 §4.1–§4.5; dl-111 (trailer on the record commit).
- **Features:** P5.3.1.
- **Notes:** Proposal key: B08. `src/agent/run-log.ts` (or similar). `dl-114` Action 3 (cost metrics in `dl-089`'s catalogue) is optional and owned by `dl-089`'s task; not claimed.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.
- **Handover from wave 1 B2 (2026-10-02, `task-138`'s independent review).** `paths.runs` (`task-138`) accepts an empty string, an absolute path and a `../` path, so the run log must be confined when it is written (REQ-SEC-06, `resolveConfinedMemoryPath`). The scaffold value `docs/runs/` has a trailing slash: build `<runs>/<id>.jsonl` with `path.join`, not string concatenation. This repository's `.wingfoil/dna.yaml` does not declare `runs` or an agent `adapter` yet; this task and `task-236` add them.

## Execution Notes

Branch `task/task-206-agent-execute-records-run-json-lines-line-under`, cut from `main` at `ed4607a4`
(wave 3, batch B1); start `5a1a6184`. `bug: []`, so no bug syncs.

### design (architect)

**`depends_on` (dl-015).** `task-127` (`memory amend`), `task-131` (dirty-target guard), `task-138`
(`paths.runs`, `team.agents[].adapter`) and `task-192` (`WingFoil-Version:` trailer) are all `done`
(`grep -m1 "^status:"` over the four files). The one handover addressed to this task is `task-138`'s
independent review: `paths.runs` accepts `''`, absolute and `../` values, so the run log is confined
where it is resolved (REQ-SEC-06) and its file path is built with `path.join`. Both are done in
`resolveRunLogPath` (below).

**Specs.** `spec-016-agent-execution` is `approved`; `dl-111`, `dl-114`, `dl-135` and `dl-108` are
`ready` (`grep -m1 "^status:"`). No spec edit is needed: the library implements §4.1–§4.5 as written
and adds no command, option, exit code, Memory type/state or MCP surface, so no enumeration-parity
amendment applies (the `agent` `CoreModule` still registers no operation, `test/agent/module.test.ts`).

**Placement.** `src/agent/run-log.ts`, exported from `src/agent/index.ts` (spec-016 §1: the `agent`
module owns run-log reading and writing). API, for task-228/240/220: `serializeRunRecord`,
`parseRunLog`, `readRunLogAt(root, rev, path)`, `formatRunId` / `isRunId` / `nextRunId`,
`resolveRunLogPath(root, paths.runs, elementId)`, `recordRun(root, logPath, record)` (returns
`CoreResult<{record, sha}>` with `commit`), `notesField` / `deriveNotesField` /
`executionNotesSection`. `src/storage/commit.ts` gains `unstagePaths` (the undo of `commitPaths`' `git
add`), used only on a failed record commit.

**AC classification (T1).**

| AC | Class | Why |
|---|---|---|
| 1 serialization | red-first | no serializer existed (`ls src/agent` before: discovery, index, manifest, placeholders, schema) |
| 2 run id at `state_ref`, two clones, malformed id | red-first | new |
| 3 strict reader refusals | red-first | new |
| 4 commit contains only the log, subject, trailer, not a Memory op | red-first | new |
| 5 collision → `CONFLICT` | red-first | new |
| 6 failed commit → `IO` | red-first | new |
| 7 `notes` field | red-first | new |
| 8 this repository's `paths.runs` | characterization (config) | a configuration edit; pinned with the edit in `test/agent/module.test.ts`, and the existing live-file case in `test/dna/schema.test.ts` keeps it loading |
| 9 `dl-114` gains the session id via `memory amend` | characterization (documentation) | `memory amend` has shipped (`task-127` `done`), so the action is NOT left open: the edit is in the worktree, uncommitted, as a pending amendment for the coordinator's `memory amend` (below) |

### red (developer)

`0a3c339a` — `test/agent/run-log.test.ts` (64 tests). `npx jest test/agent/run-log.test.ts` → **64
failed, 64 total**, every one with `TypeError: (0 , agent_1.serializeRunRecord) is not a function` (or
the sibling export): the functions did not exist.

### green (developer)

`3f770654` — `src/agent/run-log.ts`, `src/agent/index.ts` exports, `src/storage/commit.ts`
`unstagePaths` (+ `src/storage/index.ts`). Three test defects found on the first green run were fixed
in the same commit, none weakening an assertion: the section expectation carried one newline too many;
the pre-commit hook was enabled before the fixture's own commit (so the fixture commit failed); the
malformed-id line was built with the serializer, which now refuses it, and is built by hand instead.
`npx jest test/agent/run-log.test.ts` → **64 passed**.

`69b601bd` — `.wingfoil/dna.yaml` `paths.runs: [docs/06_runs/]`, `version` 1.6 → 1.7 (one bump,
annotated), pinned in `test/agent/module.test.ts`. `npx jest test/agent test/dna/schema.test.ts
test/lint/version-bump.test.ts` → **192 passed**.

**Value chosen for `paths.runs`: `docs/06_runs/`** — numbered after `docs/05_plans/`, the repository's
`docs/NN_*` convention; `init`'s scaffold default stays `docs/runs/` (spec-016 §4.1). The directory is
created by the first record, so nothing is committed under it now.

Behaviour per AC, as built:
- AC 1: keys written in `RUN_RECORD_KEYS` order whatever order the caller built the object in (tokens
  too), `JSON.stringify` with no spacing, `\n`-terminated. The writer validates with the reader's rules
  (except key order, which it fixes), so a `null`, an absent key or a fractional count is refused, never
  written. `NO_WORKFLOW = 'n/a'`, `ADHOC_PHASE = 'adhoc'`.
- AC 2: `nextRunId` reads the log at `state_ref` strictly and counts records whose `element` AND `phase`
  match, whatever the workflow; later commits and the working tree do not count; equal in a clone.
- AC 3: `run log <path>: line <k> is not a valid run record: <detail>` (`not JSON`, `not a JSON
  object`, `missing key '<k>'`, `unexpected key '<k>'`, `key '<k>' out of order: …`, `'<k>' must be
  …`, `'id' '<id>' is not a run id of element '<basename>' …`) and `run log <path>: run id <id>
  recorded twice`, all `VALIDATION`.
- AC 4: `commitPaths(root, [logPath], 'agent: record <id>')` — `--only`, so the agent's staged and
  unstaged edits elsewhere are untouched (the test checks `git status --porcelain` and the index before
  and after); the stored body is the subject plus the `WingFoil-Version:` paragraph only;
  `parseMemoryOperation` returns `null` for the subject and `getMemoryHistory` on the element does not
  list the commit.
- AC 5: re-read at `HEAD` before appending; a present id → `CONFLICT` `run id <id> already recorded at
  HEAD`, file and `HEAD` unchanged, `details: {run_id, record, issues: [{detail: <the JSON line>}]}`, so
  `errorDetails` renders the record as one details line.
- AC 6: a refusing pre-commit hook → `IO` `run <id> not recorded: <cause>` (the cause is the first
  non-empty stderr line of git or its hook, else `git exited with status <n>` — never `execFileSync`'s
  `Command failed: git -C <absolute path> …`, cf. bug-217), same `details`; the file and its index entry
  are put back as `HEAD` holds them (`git status --porcelain` empty afterwards).
- AC 7: the section is found by its heading LINE (`## Execution Notes`, exactly), after the frontmatter,
  outside code fences, up to the next level-1/2 heading — never by substring (W3 notes); `notes` is
  `<element-id>#execution-notes` when the section text differs between `state_ref` and `HEAD`, `none`
  otherwise and always `none` when the type's template has no such section (`## Triage & Execution
  Notes` does not count, spec-016 §2.4). `deriveNotesField` reads committed states only, so uncommitted
  notes yield `none` (tested).

### refactor (developer)

`bacae992` — lint-clean key removal in the test (`@typescript-eslint/no-unused-vars` on two
destructured placeholders) and two cases covering `readRunLogAt`'s unknown revision and `recordRun`'s
invalid record.

Gates, with the `dl-114` amendment in the working tree:
- `npm run test:coverage` → 274 suites, **5129 passed, 4 failed**: all four are wall-clock latency
  assertions (`test/core/query-latency.test.ts` ×3, `test/mcp/resource-latency.test.ts` ×1) under a load
  average of 64–104 (`uptime`). Re-run alone: `npx jest test/core/query-latency.test.ts
  test/mcp/resource-latency.test.ts` → 7/8 (the `memory history` case again, load 99), then
  `npx jest test/core/query-latency.test.ts -t "memory history"` → passed. This branch changes nothing
  under `src/memory` or `src/core` (`git diff ed4607a4 --stat -- src/memory src/core` → empty).
- Coverage All files **99.21 | 96.52 | 96.61 | 99.68** (stmts | branch | funcs | lines), against the
  last figure recorded in a task's notes on `main`, `task-251`'s `98.99 | 96.13 | 96.1 | 99.59` — not
  regressing. `src/agent/run-log.ts` 98.6 | 91.54 | 100 | 98.86; uncovered 292 and 324 are the
  re-throws of an error that is not a `RevisionError` / `StorageError` (a defect path).
- `npm run lint` → exit 0. `npm run docs:api` → exit 0. `npx tsc --noEmit -p tsconfig.json` → exit 0;
  `npx tsc -p tsconfig.build.json --noEmit` → exit 0.
- `node scripts/check-governance.cjs --base ed4607a4` → exit 0 (0 findings).

### review (reviewer, self)

- AC 1–7: met, each by the cases named above in `test/agent/run-log.test.ts` (66 tests, green).
- AC 8: met — `docs/06_runs/`, `version: 1.7`, `test/agent/module.test.ts` and
  `test/lint/version-bump.test.ts` green.
- AC 9: prepared — `memory amend` exists, so the edit is a pending amendment (below), one
  `wf(decision-log): amend …` commit for the coordinator; the file is not committed by hand.
- Decisions beyond the spec's letter, for the approver: (1) `recordRun` itself refuses a log with
  uncommitted changes (`CONFLICT` `run log <path> has uncommitted changes`, the §3.7 row of pipeline step
  6), since the append would overwrite them; (2) a failed record commit restores the file and its index
  entry; (3) the reader refuses an unterminated last line; (4) the reader does not check that the id's
  phase segment equals the `phase` field, nor that `element`'s id equals the basename — §4.5 does not ask
  it; (5) the confinement refusal is `resolveConfinedMemoryPath`'s REQ-SEC-06 text prefixed with
  `paths.runs: `, which still says "Memory entries" though the run log is not Memory.
- Same-class sweep in touched files: none found.

### Review fixes (A)

Coordinator review, 2026-10-06: **APPROVE WITH FIXES**, in two phases. The task stays `in-review`.
Phase A is done here. Phase B is on hold until `task-210` merges: it swaps the hand-written write +
`commitPaths` + `unstagePaths` for `task-210`'s `writeAndCommit`, which settles F1/F2 and the empty
runs directory left behind.

- Red: `75fd4352`. `npx jest test/agent/run-log.test.ts` → **8 failed, 61 passed** (the F3/F5/F6 and
  decision-6 cases, plus the pins that recorded the omission). Green: `f1f8333a` → **69 passed**.
- **F3.** Every `recordRun` refusal after serialization carries `details: {run_id, record, issues:
  [{detail: <line>}]}`: the basename mismatch, confinement, the symlinked path, the dirty log, the
  invalid log at `HEAD`, the collision and the failed commit. An invalid record has no line to give
  back, so it gets no details.
- **F5.** `requireWritableRunLog(root, logPath)` checks a confined write target, then
  `requireInspectableTarget` (task-131), then unmodified (`CONFLICT` `run log <path> has uncommitted
  changes`, untracked files included). `recordRun` calls it, so a symlinked `docs/runs` inside the
  project is refused (tested) instead of failing open. `runLogPreflight(root, paths.runs, elementId)`
  combines declared + confined + inspectable + unmodified and returns the path. Both are exported for
  `agent execute` (task-228) to run before the spawn.
- **F6.** The writer and the reader both refuse an id that is not `<elementIdOf(element)>/<phase>/<n>`
  of the record's own element and phase, and an `element` that is not `<type>:<id>`. `recordRun` also
  refuses a record whose element is not the log's basename. So `E/design/1` with phase `red` is refused
  and cannot block later runs.
- **Decision 6.** `resolveRunLogPath` confines with `requireConfinedTarget(root, path, 'write')`. The
  message is `cannot write '<path>': it resolves to '<real>', outside the project root …`, with no
  "Memory entries" wording.
- **F4.** The `.wingfoil/dna.yaml` paths header now says `runs` is declared below. It uses the same
  1.7 bump; `test/lint/version-bump.test.ts` is green.
- Gates: `npm run lint` 0; `npx tsc --noEmit -p tsconfig.json` 0; `npx tsc -p tsconfig.build.json
  --noEmit` 0; `npm run docs:api` 0; `npx jest test/agent test/storage test/lint` → 39 suites, **549
  passed**; `node scripts/check-governance.cjs --base ed4607a4` 0.

### Review fixes (B)

The coordinator asked for this before `task-210` reaches `main`. Its reviewed head `06e4cf44` was merged
into this branch (`7b8a642e`, `--no-ff`; it reaches `main` first at the gate). The conflicts in
`src/storage/commit.ts` and `src/storage/index.ts` were resolved by dropping this task's `unstagePaths`,
so both files now equal `06e4cf44`'s (`diff <(git show 06e4cf44:src/storage/commit.ts)
src/storage/commit.ts` → empty).

- **Red, `c63bee5c`.** The merge removed `unstagePaths`, so the branch does not build between the
  merge and the fix. The red run was therefore taken against the pre-merge code instead: a temporary
  detached worktree at `73cbf9b7` with the new test file. `npx jest test/agent/run-log.test.ts` →
  **4 failed, 68 passed**:
  - F1: the stale `index.lock` threw instead of returning a refusal.
  - F2: the cause named the absolute project root.
  - The empty `docs/runs` directory stayed behind.
  - The dry-run case failed because there is no `captureDryRun` before task-210.
  The temporary worktree was removed afterwards.
- **Green, `b4daca43`.** `recordRun` now commits through `writeAndCommit(root, [{path: logPath,
  content: atHead + line}], message)`. A `CommitFailure` (`E_COMMIT_FAILED`) becomes `IO` `run <id>
  not recorded: <cause>`, with the record as a `details` line. The cause is `CommitFailure.gitDetail`,
  task-210's one-line explanation with the root removed, plus the index problem when there is one. Any
  other error (including the dry-run stop) is rethrown. The hand-written write and restore,
  `unstagePaths` and the old `gitCause` are gone. `npx jest test/agent/run-log.test.ts` → **72
  passed**. Each fix has a test:
  - F1: a held `.git/index.lock` gives `IO`. Nothing throws, no absolute path appears, the record is
    in details, `HEAD` is unchanged, and no `docs/runs` is left.
  - F2: a hook that prints `$(pwd)/docs/runs` gives the cause `refused in docs/runs`. The message
    contains neither spelling of the root.
  - Leftover directory: the refusing-hook case also asserts that `docs/runs` is gone.
- **Re-review, filesystem failure.** `writeAndCommit` rethrows a filesystem error unchanged
  (`EACCES`/`ENOSPC` on the write), so `recordRun` used to rethrow it. The record was lost and Node's
  message could carry an absolute path. Now `recordRun` rethrows only while a dry run is active
  (`isDryRunActive()`). Any other error becomes `IO` `run <id> not recorded: <cause>`, with the record
  in details and both spellings of the root removed from the cause. Red `e2f839fb`: an unwritable
  `docs/runs` (mode 555) made the call throw `EACCES: … open '/tmp/…/docs/runs/…'` (1 failed). The fix
  commit follows it. `npx jest test/agent test/storage` → 30 suites, 488 passed; lint, both `tsc` and
  governance exit 0.
- **Dry run.** `recordRun` is a library function, not a registered `mutates: true` operation (`agent
  execute`, task-228, will be one). So task-210's dry-run registry table needs no row for it, and no
  raw writer is reached under a dry run. Inside `captureDryRun` it plans `agent: record <id>` on the one
  log path and writes nothing (tested).
- **Gates:**
  - `npm run test:coverage` → 279 suites, **5209 passed, 1 failed**. The failure is
    `test/docs/dry-run-documented.test.ts` "spec-008 §2 has a --dry-run row". It is task-210's own
    test, and it reads task-210's spec-008 pending amendment, which sits uncommitted in task-210's
    worktree (`git -C ../task-210 status --short` → `M .../spec-008-cli-grammar.md`). It passes once
    the coordinator records that amendment.
  - Coverage All files **99.26 | 96.75 | 96.82 | 99.71**; `src/agent/run-log.ts` 99.1 | 95.33 | 100 |
    99.45.
  - `npm run lint` 0; both `tsc` 0; `npm run docs:api` 0; `node scripts/check-governance.cjs --base
    ed4607a4` 0.

### Pending amendments (approver)

- `dl-114-recording-agent-token-consumption` — proposed `--reason`: "Adds the agent's session id to Q2
  (b), extracted by the adapter or not-reported, as dl-135 point 2 and Action 2 record; the Q2 (b) bullet
  changes, nothing else."
