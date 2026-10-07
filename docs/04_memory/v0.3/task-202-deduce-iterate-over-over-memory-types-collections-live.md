---
id: "task-202-deduce-iterate-over-over-memory-types-collections-live"
type: task
title: "Deduce `iterate_over` over Memory types and collections, live queries, optional and archived phases"
status: in-progress
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
2. "Entered" needs a phase of the sub complete **other than vacuously**; otherwise a sub that starts with an
   empty selection would put every ignored candidate on the frontier.
3. Vacuous leaf = complete, declares `selection`, and every other kind is an empty `created`; a plain `include`
   is vacuous when its sub completed only vacuously.
4. Late (§4.7): an `iterate_over` closed by a later phase counts its eligible + entered candidates in
   `iterations.late`; element candidates are listed in the instance's `late` (collection entries are not
   `ElementRef`s, so they are counted only); a closed selection lists the elements it matches. `late` bubbles
   up from subs (a released release's late task shows on the release-line instance).
5. Optional (§4.10): an optional current phase's frontier also carries the following not-complete phases up to
   and including the next non-optional one ("together with the next non-optional phase").
6. Abandoned (§4.11): `abandoned: true`, `complete: false`, no phase progress, empty frontier. A selection never
   matches an archived element either. This changes task-198's selection on real repositories: the `HEAD` scan
   (`loadMemoryDocumentsAtRev`) never filtered archived documents, so a `deprecated` bug used to keep a selection
   open.
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

### Pending amendments (approver)

- `spec-017-workflow-commands-and-state-deduction` (uncommitted in this worktree; record after task-203's
  spec-017 amendment, merge order 203 → 202) — proposed `--reason`: "task-202: readings the iterate_over,
  live-query, optional and archived rules needed. §4.6: a candidate is entered once a sub phase is complete other
  than vacuously; the note and vacuous completion apply when no candidate is eligible, entered or complete, since
  an empty scope filter makes every element a candidate; an unresolved where token leaves one unexpanded step.
  §1.3: an id the {n} pattern does not match iterates last. §4.7: which candidates are late, how they are counted
  and listed, which completions are vacuous. §4.10: an optional current phase's frontier carries the phases up to
  the next non-optional one. §4.11: an abandoned instance has no phase progress and is not complete. No rule the
  spec states changed."
