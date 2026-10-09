---
id: "task-202-deduce-iterate-over-over-memory-types-collections-live"
type: task
title: "Deduce `iterate_over` over Memory types and collections, live queries, optional and archived phases"
status: in-review
release: "v0.3"
kind: "feature"
priority: "high"
tags: ["v0.3", "workflow", "deduction"]
ref: "spec-017"
bug: []
depends_on: ["task-198-deduce-workflow-instances-phase-evidence-frontier-memory-head"]
tmpl_version: 260703
---

## Description

`release-cycle` and `release-line-cycle` iterate over tasks and releases; `where` splits into an entry filter (`status`) and a scope filter so an element the sub moved on stays counted; collection entries iterate in declared order; a live query stops reopening once a later phase is complete (`late` candidates); optional phases are skipped; archived elements (`deprecated`, `superseded` on adr/tech-spec, `dl-065`) are never eligible and an archived bound element abandons its instance.

## Acceptance Criteria

- (red-first) BDD P4.16 sc. 1–3: 3 backlog + 1 done task → 3 iterations; a plain include runs once; zero matches → vacuously complete with note `no elements matched the iterate_over filter`.
- (red-first) Eligible / entered / complete classification of §4.6, including a task moved from `backlog` to `in-progress` by `dev-loop.start` staying entered; list-valued `where` fields match on shared elements (`tags: ["{release.version}"]`).
- (red-first) `iterate_over: dna:modules` and `bindings:<name>` iterate entries in declared order, keyed per spec-003 § Collections, with `{item}` / `{item.<field>}` interpolation.
- (red-first) §4.7: after a later phase completes non-vacuously, a newly matching candidate is reported `late`, not put back on the frontier; a vacuous completion never makes an earlier phase complete or skipped.
- (red-first) §4.10 optional skip; §4.11 `abandoned: true` with an empty frontier when the bound element is `deprecated`.
- (characterization) REQ-STATE-07's fit criterion in `docs/02_requirements/03_sard/03_state-context.md` reads N as the eligible plus entered candidates and counts collection entries (`dl-104` Action 1; spec-017 §4.6), with a `doc-versioning` bump.

## Implementation Notes

- **Size:** M · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** spec-017 §4.6, §4.7, §4.10, §4.11; dl-104 D2 (b), Action 1 (SARD half); REQ-STATE-07.
- **Features:** P4.16, P4.13.
- **Notes:** Proposal key: A06.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.
- **Handover from wave 3 B2 (2026-10-07, `task-198`).** `task-198` removed the `iterate_over` `item` scope, dead until this task: put it back in `elementKey` (it now casts the scope to `{element}`) and in `hasRecord` (it now requires `record.item === null`) in `src/workflow/deduce.ts`. An `iterate_over` phase is reported as one unexpanded leaf until this task expands it.

## Execution Notes

### design (architect)

**`depends_on` read (dl-015).** `task-198` is `done` (`grep -m1 "^status"`). Taken from its notes and the B2
handover: the pure `deduceWorkflowState(snapshot)` in `src/workflow/deduce.ts`, the `HEAD` reader in
`src/core/workflow-deduction.ts`, `workflowExitStates` / `iterationStartState` (task-194), the item scope removed
from `elementKey` / `hasRecord` (restored here), and its reading 9 (an `iterate_over` phase was one unexpanded leaf).

**Specs.** `spec-017` and `spec-003` are `approved`, `dl-104` `ready` (`grep -m1 "^status"`).

**Design.**
- `src/workflow/deduce.ts`: frames become a union — an element frame, or an item frame (collection, key,
  entry). `{item}` / `{item.<field>}` resolve against the innermost item frame; `{id}`, `{<field>}`,
  `{element.<field>}` and `{<type>.<field>}` against element frames only. `scopeKey` replaces `elementKey`
  (`<type>:<id>` or `<collection>#<key>`) and `hasRecord` matches `WingFoil-Element` or `WingFoil-Item`.
- `run` evaluates each phase on its own (lazily, at most once) and then applies the sequence rules: complete;
  a live query (selection or `iterate_over`) closed by a later non-vacuous completion (§4.7); an optional phase
  skipped by the same test (§4.10); otherwise current. `iterate` expands the candidates (§4.6) and runs the sub
  per candidate with a new frame.
- `PhaseProgress` gains `skipped`, `vacuous`, `iterations` (§8's shape); `InstanceDeduction` gains `late`
  (ascending `(type, id)`); `abandoned` is set (§4.11); `NO_ITERATION_NOTE` is exported.
- `src/core/workflow-deduction.ts`: the snapshot gains `collections` — every `dna:` / `bindings:` reference a
  loaded workflow iterates over, resolved at `HEAD` (`resolveDnaPath`, `bindings.collections`). The Memory scan
  already returns archived documents (`loadMemoryDocumentsAtRev` filters nothing; only the type-scoped
  primitives do); the deduction keeps them out of selections and iterations itself (`isArchivedStatus`, the
  dl-028 predicate).

**Readings taken (approver to confirm; written into spec-017 as a pending amendment, below):**
1. Vacuous `iterate_over` = no candidate **eligible, entered or complete**. §4.6's "zero candidates" is
   unreachable for P4.16 sc. 3: its `where` has only `status`, so the scope filter is empty and every task is a
   candidate.
2. "Entered" needs a phase of the sub **before the sub's current phase** complete **other than vacuously**
   (corrected at review, F1: the code always read it this way, the first amendment text did not); otherwise a sub
   that starts with an empty selection would put every ignored candidate on the frontier, and a later phase's
   state evidence would re-open released work.
3. Vacuous leaf = complete, declares `selection`, the step created nothing, and every other kind is `created`; a plain `include`
   is vacuous when its sub completed only vacuously.
4. Late (§4.7): an `iterate_over` closed by a later phase counts its eligible + entered candidates in
   `iterations.late`; element candidates are listed in the instance's `late` (collection entries are not
   `ElementRef`s, so they are counted only); a closed selection lists the elements it matches. `late` bubbles
   up from subs (a released release's late task shows on the release-line instance).
5. Optional (§4.10): an optional current phase's frontier also carries the following not-complete phases up to
   and including the next non-optional one ("together with the next non-optional phase").
6. Abandoned (§4.11): `abandoned: true`, `complete: false`, no phase progress, empty frontier. A selection never
   matches an archived element either — a rule added to spec-017 §4.3 and spec-003 § "Selections" (review F2).
   On this repository it changes nothing today: every selection filters `status` to non-archived states
   (`grep -n "where:" .wingfoil/workflows/custom/*.yaml`); the `HEAD` scan (`loadMemoryDocumentsAtRev`) does
   return archived documents, so a selection without a `status` key would have matched them.
7. Iteration order (§1.3): an id the type's `{n}` pattern does not match iterates after every id it does; ties
   on `{n}` by byte-wise id.
8. A `where` token with no value leaves the `iterate_over` phase one unexpanded step (missing `include`) and
   reports `W_UNRESOLVED_TOKEN` at `phases[<i>].where.<key>`.
9. REQ-STATE-07 (AC 6): `docs/02_requirements/03_sard/03_state-context.md` declares no version (no frontmatter
   `version:`, no `**Version:**` line, `grep -n -i version` empty), so the `doc-versioning` bump the AC names
   does not apply (directive: "A document that declares no version is not given one"); `00_index.md`'s summary
   row ("N matches → N sub runs") stays true and is unchanged.

**AC classification (T1, `testing` directive).**

| AC | Class | Why |
|---|---|---|
| 1 BDD P4.16 sc. 1–3 | red-first (sc. 1, 3); sc. 2 characterization | sc. 2 (plain include once) already held since task-198: it passed on the red run |
| 2 eligible / entered / complete, list `where` | red-first | no iteration existed |
| 3 collections, keys, `{item}` | red-first | `{item}` was always unresolved |
| 4 §4.7 late, vacuous | red-first | new |
| 5 §4.10, §4.11 | red-first | `abandoned` was always `false`; `optional` was not read |
| 6 REQ-STATE-07 wording | characterization (doc) | no code; text aligned with spec-017 §4.6 |

### red

`test/workflow/deduce-iterate.test.ts` (synthetic snapshots, AC 1–5) and `test/core/workflow-deduction-iterate.test.ts`
(fixture repositories through the `HEAD` reader: P4.16 sc. 1 and 3, `dna:modules` and `bindings:templates` read at
`HEAD`, an archived bound element). `npx jest test/workflow/deduce-iterate.test.ts test/core/workflow-deduction-iterate.test.ts`
→ **20 failed, 1 passed, 21 total** (the passing one is AC 1 sc. 2, characterization). Commit `7839e9d8`.

### green

Implementation as designed. Commit `329a7a54`; REQ-STATE-07 commit `0e966a30`. Two task-198 assertions changed
because the behaviour they pinned is the one this task replaces, both in `test/workflow/deduce.test.ts`: the
unexpanded `iterate_over` leaf now expands to `typed-sub.fix@bug:b1`, and a `deprecated` bound element now
abandons the instance (empty frontier) instead of leaving `rel.plan` current. Added with green: an unresolved
`where` token (reading 8) and an id outside the `{n}` pattern (reading 7).
`npx jest test/workflow test/core/workflow-deduction` → 96 passed.

Measured on this repository (`npm run build`, then `node -e` over `readDeductionSnapshotAtHead('.')` with two
synthetic plans added to the snapshot, a main including `release-cycle` on `minor-v0.3` and `sw-life-cycle`):
the first eager version (every phase evaluated) took 458 ms of pure deduction; evaluation was made lazy (a later
phase is evaluated only when §4.7/§4.10 need it) before commit: 92 ms; the base deduction (8 ingest instances)
32 ms. No open instance of an iterating workflow exists on this repository today, so the real history exercises
no iteration.

### refactor

- Coverage of the touched files to 100 %: `readCollections` keeps only reachable branches (a `bindings:` name or a
  `dna:` path naming no list is `E_WORKFLOW_COLLECTION_UNRESOLVED`, an **error** in `spec-003`'s table, so the
  registry refuses the load before the reader runs; only a `dna:` reference without `dna.yaml` is undecided and
  tested). Tests added for consecutive optional phases, a selection with other satisfied evidence (non-vacuous),
  an `{n}` tie, and a reject state outside the sequence (the `atOrAfter` fallback, previously reached only by the
  `deprecated` test that now abandons). Commit `6257dfa9`.
  `npx jest test/workflow test/core/workflow-deduction --coverage --collectCoverageFrom=src/workflow/deduce.ts
  --collectCoverageFrom=src/core/workflow-deduction.ts` → both 100 / 100 / 100 / 100, 103 tests passed.
- `src/core` barrel exports `NO_ITERATION_NOTE` and `IterationCounts` (commit `59e0e34c`; after it `npx tsc` ×2, `npm run docs:api`, `npm run lint` exit 0 and `npx jest test/workflow test/core/workflow-deduction test/docs` → 175 passed).
- The spec-017 pending amendment first wrote `` `iterations.late` ``, which `test/docs/name-resolvability.test.ts`
  read as an unresolved config name (`npx jest test/docs/name-resolvability.test.ts` → 1 failed); reworded,
  11 passed.

Gates at `6257dfa9`, with the spec-017 pending amendment in the working tree (load average 60–79 from the
parallel batch, `uptime`):
- `npm run test:coverage` → 302 suites, **5742 passed, 2 failed of 5744**; the two failures were
  `test/core/query-latency.test.ts` p95s of 1083 ms and 1066 ms against 1000 ms (REQ-PERF-02, `memory search` /
  `memory history`, code this task does not touch). Re-run alone: `npx jest test/core/query-latency.test.ts` →
  4 passed (load average 70–76). All files **99.29 % stmts / 97.25 % branches / 97.38 % funcs / 99.71 % lines**,
  against the W3 B2 gate's main figures 99.28 / 97.18 / 97.33 / 99.71 (`devloop-kit/gate-w3b2-cov.log`, same
  command): nothing regresses. `src/workflow/deduce.ts` and `src/core/workflow-deduction.ts` 100 / 100 / 100 / 100.
- `npm run lint`, `npm run docs:api`, `npx tsc --noEmit -p tsconfig.json`, `npx tsc -p tsconfig.build.json
  --noEmit`: each exit 0.
- `node scripts/check-governance.cjs --base 1ce84a54` → exit 0; "1 wf() commits", 0 findings.
- BDD: P4.16 sc. 1–3 are pinned by `test/workflow/deduce-iterate.test.ts` (AC 1 describe, scenario titles quoted)
  and sc. 1 and 3 again at `HEAD` by `test/core/workflow-deduction-iterate.test.ts`. The feature file needs no
  change: its wording already matches. P4.13's scenarios stay pinned by task-198's suite (green).
- No CLI command, option, exit code, Memory type/state or MCP surface added: no parity, `cli-reference.md` or
  dry-run row applies. No `.wingfoil/*.yaml` changed.

### review (self, reviewer)

Each AC against its evidence:
1. AC 1 — sc. 1: frontier `dev.start@task:task-2-two`, `task-3-three`, `task-10-ten` ({n} order, not byte order),
   `iterations {eligible: 3, entered: 0, complete: 1, late: 0}`; sc. 2: one step `setup.only@release:r1`; sc. 3:
   `complete`, `vacuous: true`, note `no elements matched the iterate_over filter`, the next phase current.
2. AC 2 — `task-4-moved` (`in-progress`, tags `[v1, workflow]`) entered and on the frontier at `dev.finish`;
   `task-5-waiting` eligible; other release, `pending` (ignored) and untagged tasks out; `tags: ["{release.version}"]`
   matches the shared `v1`.
3. AC 3 — `dna:modules` with `where: { kind: [lib] }` gives `core` then `agent` (declared order, `cli` filtered);
   keys `@dna:modules#core`; `{item}` and `{item.path}` resolved; `WingFoil-Item` records complete a step;
   scalar `bindings:templates` entries key themselves; at `HEAD` the reader returns both collections.
4. AC 4 — release at `releasing`: `triage` and `loop` closed, `late` = `bug-1`, `task-2-midway`, `task-3-late`
   (ascending `(type, id)`), `iterations.late: 2`, empty frontier; vacuous later phases close nothing.
5. AC 5 — optional `extra` current with `plan` on the frontier, `skipped` once `plan` is complete, not skipped by a
   vacuous selection; `deprecated` bound release → `abandoned: true`, empty frontier, at `HEAD` too; superseded
   adr / deprecated task / deprecated bug never candidates or selection matches.
6. AC 6 — REQ-STATE-07 Description, Fit Criterion and Traceability (commit `0e966a30`); no version to bump
   (reading 9).

Same-class sweep in touched files: `elementKey` (one caller each in the step key and `hasRecord`) is gone, both use
`scopeKey`; the two `where` evaluations (selection, iteration) share `wanted()`; the two `W_UNRESOLVED_TOKEN`
builders share `reporter()`. No other reader of the old `PhaseProgress` states exists (`grep -rn "PhaseProgress"
src` → `src/workflow/deduce.ts` and the barrel only).

### Review fixes (independent review: approve with fixes, F1–F6)

- **F1** — "entered" counts only phases before the sub's current phase: the code's reading, kept; spec-017 §4.6
  reworded (pending amendment) and the reviewer's probe P2 pinned (sub `kickoff` checkpoint, then `start` complete
  for an `in-progress` task → the task is ignored, the loop vacuous). Red-first does not apply: the behaviour
  already held (characterization).
- **F2** — the revision note claimed "no rule changed"; two rules were added and are now stated as such:
  a selection never matches an archived element (spec-017 §4.3 row, §4.11; spec-003 § "Selections", new pending
  amendment), and an abandoned instance is `complete: false` (§4.9's exception list, §4.11). Reading 6's claim
  about a deprecated bug keeping a selection open was overstated and is corrected above.
- **F3** — `evaluate()` treats a selection as vacuous only when `leaf.step.created` is empty too. Today `created`
  is always `[]` (linkage is task-203's), so the test pins the empty half (a selection with a `memory.add`,
  matching nothing, does not skip an earlier optional phase); the non-empty half becomes testable when task-203
  is merged into this branch.
- **F4** (approver decision) — spec-017 §12 records the late `ready` decision-logs of `build-backlog`'s
  never-empty selection (reviewer's probe on this repository: 124 late, 87 of them `ready` decision-logs) as the
  known consequence until `dl-160`'s actions (post-v0.3).
- **F5** — `readDirty` (`src/core/workflow-deduction.ts`) leaves `.wingfoil/dna.yaml` out of
  `W_UNCOMMITTED_INPUTS`, although `dna:` collections are now read from it. Not fixed here: deferred as a W3 B3
  follow-up (coordinator's list).
- **F6** — spec-017 §12 records that an instance started mid-release reports done tasks' record checkpoints
  again, since records older than the start commit do not count (§4.8, §4.9).
- Commit `791d31cc`. After it: `npx jest test/workflow test/core/workflow-deduction test/docs` → 177 passed;
  `npm run lint`, `npx tsc --noEmit -p tsconfig.json`, `npx tsc -p tsconfig.build.json --noEmit`,
  `npm run docs:api` exit 0 (spec amendments in the working tree).

### Merge of task-203 (2026-10-09)

- `git merge --no-ff task/task-203-read-instance-history-walk-step-linkage-created-elements` (task-203 final at
  `c4a5350d`) → merge commit `bc314ffa`. The pending spec-017/spec-003 edits were saved in the batch scratch folder
  first (`git diff` patch), then re-applied with `git apply --3way` after the merge.
- **Conflicts:** 12 hunks, all in `src/workflow/deduce.ts`. The resolution keeps task-202's structure (element/item
  frame union, lazy per-phase evaluation, `iterate`, §4.7/§4.10/§4.11) and carries task-203's history walk into it
  unchanged: the snapshot's `history` / `transitions` / `lastChanges` / `parents` (replacing `records`),
  `createdBy`, `stateCommit`, the descendant-based `newerThan` (its review F1), `cutoffs`, the `created` evidence,
  `{ type, path }` resolution against created elements, and self-binding. `hasRecord` matches the
  `WingFoil-Element` or `WingFoil-Item` scope together with 203's self-bound unscoped record and the re-entry
  cutoff. Cutoffs are computed from the innermost frame when it is an element (a collection entry has no
  re-entries), are passed to a plain `include`'s sub, and are **not** handed to an `iterate_over`'s iterations
  (**approver ruling 2026-10-09**: each element has its own re-entries; stated in spec-017 §4.8 as part of the
  pending amendment). A self-bound archived element abandons the instance (`bind` now returns the element).
  `src/core/workflow-deduction.ts` merged without conflict (task-203's walk reader plus this task's
  `readCollections`). `test/workflow/deduce-iterate.test.ts` follows the snapshot's new fields in the merge commit.
- **F3, non-empty half** (commit `bdb142c4`): "review F3: a selection matching nothing whose step created an element
  (linkage, task-203) is not vacuous" — a self-creating flow whose `sweep` adds a task linked by
  `WingFoil-Step`, so `sweep` completes non-vacuously and the optional `extra` is skipped; the same test pins that
  the self-bound element, once `deprecated`, abandons the instance. Characterization: the clause landed in
  `791d31cc`; it became reachable only with 203's linkage. Mutation check: with
  `leaf.step.created.length === 0` removed, `npx jest test/workflow/deduce-iterate.test.ts -t "review F3"` → 1
  failed, 1 passed; restored → 2 passed.
- **Spec-017 re-applied on task-203's amend text** (`56974f80` on main; `cb12ce6a` was that commit before its trailers were added): §4.8 and Cost keep task-203's wording; this task's §1.3, §4.3,
  §4.6, §4.7, §4.8 (iterate_over/include and re-entries, the ruling), §4.9, §4.10, §4.11 and §12 edits sit on top;
  the two Revision notes are kept in date order (task-203's, then this task's, both 2026-10-09).
- **Gates at `bdb142c4`** with both pending amendments in the working tree (load average 10–29, `uptime`):
  `npm run test:coverage` → **304 suites, 5779 passed, 0 failed**; All files **99.31 % stmts / 97.30 % branches /
  97.46 % funcs / 99.72 % lines** (W3 B2 gate's main: 99.28 / 97.18 / 97.33 / 99.71); `src/workflow/deduce.ts`
  and `src/core/workflow-deduction.ts` 100 / 100 / 100 / 100. `npm run lint`, `npm run docs:api`,
  `npx tsc --noEmit -p tsconfig.json`, `npx tsc -p tsconfig.build.json --noEmit` exit 0.
  `node scripts/check-governance.cjs --base 1ce84a54` exit 0 ("7 wf() commits", 0 findings).

### Re-review fixes (focused re-review: approve with fixes, items 1–6, 2026-10-09)

- **Item 1, cutoff ruling pinned** (commit `492eb8e3`, characterization: the code already behaved this way since the
  merge): `test/workflow/deduce-iterate.test.ts`, describe "re-entry cutoffs across include and iterate_over
  (spec-017 §4.8; approver ruling 2026-10-09)", modelled on the reviewer's case B (`relb`: prep → inc (plain
  include) → loop (iterate_over task) → submit → approve, approve's fallback to prep, the release re-entry `J`
  committed after the old records). "(a) a plain include honours the cutoff: inc is current again, its sub step
  reports the re-entry" (`subrel.check@release:r1`, `reentered: true`, `reentryCommit: J`); "(b) an iterate_over
  iteration ignores it: loop is complete on the task's pre-reject record". The suite's `release` type gained the
  `releasing` gate the cutoff needs. Mutation checks, `npx jest test/workflow/deduce-iterate.test.ts -t "re-entry
  cutoffs"`: passing `reentries` to the iteration's `run` → (b) fails (1 failed, 1 passed); dropping them from the
  plain include's `run` → (a) fails (1 failed, 1 passed); restored → 2 passed.
- **Item 2** — spec-017 §4.6's "eligible" bullet now matches the code ("no phase of the sub before its current
  phase is complete other than vacuously"), listed among the readings (same class as review F1).
- **Item 3** — spec-017 §4.11 says "(declared or self-bound, §3.4)" and that a later linked element does not
  rebind an archived self-bound element; listed among the rules added.
- **Item 4** — task-203's spec-017 amend is cited as `56974f80`; F5 has a disposition (above).
- **Item 5** — `git merge --no-edit main` (main `ae1f1a03`, task-203 and task-268) merged cleanly; trailers added
  with `--amend --no-edit --trailer` → merge commit `e7260ba3`. The spec-017/spec-003 amendments were saved as a
  patch and re-applied with `git apply --3way` (clean; spec-017 on top of `56974f80`).
- **Item 6, gates at `492eb8e3`** with both amendments in the working tree (load average 12–24, `uptime`):
  `npm run test:coverage` → **309 suites, 5817 passed, 0 failed**; All files **99.31 / 97.30 / 97.47 / 99.72**;
  `src/workflow/deduce.ts` 100 / 100 / 100 / 100; `src/core/workflow-deduction.ts` 100 / 98.94 / 100 / 100 (line
  241, `readLastChange`'s `entry === undefined` arm, task-203's code as merged from main). `npm run lint` (with
  task-268's git-log-readers lint), `npm run docs:api`, both `tsc` exit 0; `node scripts/check-governance.cjs
  --base 1ce84a54` exit 0, "20 wf() commits", 0 findings.

### Pending amendments (approver)

- `spec-017-workflow-commands-and-state-deduction` (uncommitted; record after task-203's spec-017 amendment
  `56974f80`, rebased on its text) — proposed `--reason`: "task-202: readings the iterate_over, live-query, optional and
  archived rules needed, and rules added. Readings: §4.6, a candidate is eligible when it matches the entry filter
  and no phase of the sub before its current phase is complete other than vacuously, and entered once such a phase
  is complete; the note and vacuous completion apply when no candidate is
  eligible, entered or complete; an unresolved where token leaves one unexpanded step. §1.3, an id the {n}
  pattern does not match iterates last. §4.7, which candidates are late, how they are counted and listed, and
  which completions are vacuous. §4.10, an optional current phase's frontier carries the phases up to the next
  non-optional one. Rules added: §4.3 and §4.11, a selection never matches an archived element; §4.9 and §4.11,
  an abandoned instance has no phase progress and is reported complete: false; §4.11, an instance whose self-bound
  element is archived is abandoned, and a later linked element does not rebind it; §4.8, an iterate_over phase does
  not hand its re-entry cutoff to its iterations, each element having its own re-entries (approver ruling
  2026-10-09), while a plain include passes it to its sub. §12 records the late ready
  decision-logs of build-backlog's selection until dl-160, and the record checkpoints an instance started
  mid-release reports again."
- `spec-003-workflows-yaml-schema` (uncommitted; record after task-264's, task-199's and task-198's
  amendments) — proposed `--reason`: "task-202 (review F2): § Selections states the rule spec-017 §4.3 and §4.11
  add, that a deprecated or superseded document never matches a selection, as it is never an iterate_over
  candidate. No diagnostic changed."
