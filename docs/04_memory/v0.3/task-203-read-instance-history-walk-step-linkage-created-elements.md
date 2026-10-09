---
id: "task-203-read-instance-history-walk-step-linkage-created-elements"
type: task
title: "Read the instance history walk: step linkage, created elements, self-creating workflows and re-entry after reject or park"
status: approved
release: "v0.3"
kind: "feature"
priority: "high"
tags: ["v0.3", "workflow", "deduction", "git"]
ref: "spec-017"
bug: []
depends_on: ["task-142-run-memory-git-read-through-helper-captures-stderr", "task-198-deduce-workflow-instances-phase-evidence-frontier-memory-head"]
tmpl_version: 260703
---

## Description

The bounded walk (commits reachable from `HEAD` and not from the start commit's parents) finds the `WingFoil-Instance` / `WingFoil-Step` linkage on add commits, which makes an element "created by" a step, binds a self-creating workflow's element (the four ingest mains, `sw-life-cycle`), and finds re-entries (`wf(<type>): reject|park <ids> [<from> → <to>]`) after which evidence from the `fallback.step` onward must be newer. One `git log` over the union of walks keeps REQ-PERF-03.

## Acceptance Criteria

- (red-first) A `bug-ingest` instance with no linked add reports `element: null` and frontier `bug-ingest.capture`; after an add commit carrying its trailers the bug is bound and `capture` completes from `created` evidence; a second linked bug is listed in `Instance.created` and does not rebind (§3.4).
- (red-first) After `wf(task): reject task-X [in-review → in-progress]` in a `dev-loop` pass, `start` and `design` stay complete, `red` needs a new record and `review` a new `submit` (§4.8 example); the same for a `park` subject.
- (red-first) A record, linkage or reject older than the start commit does not count.
- (red-first) REQ-SYS-03 / REQ-STATE-02 descriptions in the SARD read "from Memory files and the commit history reachable from the commit" (spec-017 Consequences), with a `doc-versioning` bump; a test recomputes the deduction at a fixed commit twice and gets the same answer.
- (characterization) The walk calls `git` once per invocation for the union of walks plus one lookup per re-entered element (a spy-based test counts spawns), and uses the shared git helper that captures stderr (`bug-093`'s task, if merged; otherwise `stdio` is set explicitly).

## Implementation Notes

- **Size:** M · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** spec-017 §3.4 "Self-creating", §4.3 `created`, §4.8 (linkage, re-entries, cost), §5.2 re-entry; dl-104 D1 (b).
- **Features:** P4.13, P4.15.
- **Notes:** Proposal key: A07. pairs with `bug-072` (maxBuffer on `walkGitLogFields`) if the walk reuses that function — depend on that task if so, decided at design.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.
- **Handover from wave 3 B2 (2026-10-07, `task-198`).** `readRecords` (`src/core/workflow-deduction.ts`) runs one `rev-list` per distinct start once any record exists; §4.8 asks for one walk over the union of instances — replace it here. No linkage is read yet, so every step has created nothing: a `created` phase completes by its other evidence or a record.

## Execution Notes

Branch `task/task-203-read-instance-history-walk-step-linkage-created-elements`, worktree `../.wf2-wt/task-203`,
cut from `main` at `1ce84a54`; start `d77cebdb`. `bug: []`, so there is no bug sync.

### design (architect)

**`depends_on` read (dl-015).** `task-142` and `task-198` are `done` (`grep -m1 "^status"` over each file). From
`task-142`: run git through `runGitRead` (stderr captured, 256 MiB buffer, `bug-072`/`bug-093`) and `walkGitLogFields`
(NUL-framed), which throws on a genuine failure. From `task-198` (handover F5 and the note in this task): `readRecords`
ran one `rev-list <sha> --not <start>^@` per distinct start; §4.8 asks for one walk over the union, which this task
replaces. No linkage was read, so every step had created nothing. `bug-072` is `closed` (fixed by task-142), so reusing
`walkGitLogFields` needs no extra dependency.

**Specs.** `spec-017` is `approved` (`grep -m1 "^status"`). Its §3.4, §4.3 `created`, §4.8 and §5.2 are implemented as
written; §8's `Step` already declares `created`, `reentered` and `reentryCommit`, so no spec field is added. No spec edit,
no pending amendment.

**Design.**
- `src/core/workflow-deduction.ts` (the impure reader): `readWalk` runs **one** `git log --no-show-signature
  --topo-order <HEAD> --not <oldest start>^@` with `%H %P %s %(trailers:only,unfold)` through `walkGitLogFields`. Each
  instance's walk is cut from it in memory, by following parent links from its start commit's parents (`instanceWalk`).
  A commit on such a path lies in the union walk, so the cut is exact inside it. `readFacts` reads each commit once:
  a record (as before), linkages (`wf(<t>): add <ids>` + `WingFoil-Instance` + `WingFoil-Step`), re-entries
  (`reject`/`park` whose bracket ends earlier in the type's `sequence` than it starts; a forward reject such as bug
  `open → closed` is not one, §5.2), and transitions (any bracketed `wf()` subject). Subjects are parsed by the
  existing `parseMemoryOperation` / `parseBracketHops` (`src/memory/audit.ts`). Then there is one `git log -1` per
  re-entered element: the latest change of its file in the walk.
- `src/workflow/deduce.ts` (pure): the snapshot's `records` becomes `history` (records, links and re-entries per start
  commit, each with its walk position), plus `transitions` and `lastChanges`. The deducer:
  - binds a self-creating instance to the creating step's oldest linked element of its type (ties by id). The frame is
    marked `selfBound`, so the unscoped step key and unscoped records written before binding still match.
  - lists `Instance.created` (every linked element) and `Step.created`.
  - evaluates `created` (§4.3): for each added type, at least one element, each at or after the target of
    `workflowExitStates`, and each `{ type, path }` entry resolved per element and committed.
  - computes one re-entry cutoff per phase (`cutoffs`), inherited down a plain `include`. The `record` and `state`
    evidence count only if newer. `state` is newer when the newest transition naming the element with `<to>` equal to
    its status is, or else the file's last change.
  - reports `reentered` / `reentryCommit`.
- SARD: REQ-SYS-03 and REQ-STATE-02 descriptions (`spec-017` Consequences).

**Readings taken (approver to confirm).**
1. **"The phase whose gate state was `<from>`"** is the first phase whose `held` gates (`workflowExitStates`, §5.1)
   include `(type, from)` and which declares `fallback`. A re-entry from a state that no such phase holds reaches no
   phase. This repository's `park` (`task` `in-progress → backlog`, `memory.yaml` `returns`) is one, because
   `in-progress` is no gate. After a park and a restart, the pass therefore resumes at its first incomplete phase, and
   the records made before the park still count; only the element's state moved it back. The AC's "the same for a park
   subject" is tested with a fixture machine that declares `returns: { in-review: in-progress }`, where a park is
   literally the same. If parking should also invalidate the earlier records, the rule needs a spec-017 §4.8 ruling.
2. **"Newer"** means a smaller position in the `--topo-order` of the union walk.
3. Every phase from `fallback.step` onward is reached, including `done` after `review`. Such steps report
   `reentered: true` until they complete.
4. **Union bound.** As §4.8 says, the walk is bounded by the oldest open start's parents. In a branching history, a
   commit that is in a younger instance's true walk but reachable from the oldest start's parents is not read. Such a
   commit predates the oldest instance and was made on another branch. It is accepted as the spec's cost bound.
5. **Lookup bounded by the walk.** The "latest commit that changed the element's file" is looked up inside the walk;
   one older than the walk is older than any re-entry in it, so it would not count anyway.
6. `Instance.created` includes the bound element. Linked elements that `HEAD` does not hold are left out.
7. **SARD version.** The AC asks for a `doc-versioning` bump, but neither SARD file declares a version, and the
   directive says a document that declares none "is not given one". No bump.

**AC classification (T1, `testing` directive).**

| AC | Class | Why |
|---|---|---|
| 1 self-creating binding, `created`, second linked element | red-first | no linkage was read (`grep -rn "WingFoil-Step" src` → nothing before this task) |
| 2 re-entry after reject / park | red-first | no re-entry was read |
| 3 older than the start does not count | red-first for linkage and re-entry (records were already bounded, task-198) | |
| 4 SARD wording; recompute at a fixed commit | red-first (SARD text); characterization (recomputation, already true of task-198's deduction) | |
| 5 one walk + one lookup per re-entered element; shared helper | **red-first** for the spawn count (corrected from "characterization": `readRecords` spawned one `rev-list` per start); characterization for the helper | |

### red (developer)

Commit `a6ede66a`: `test/core/workflow-deduction-history.test.ts` (AC 1–5, fixture repositories, a `git` shim on
`PATH` for AC 5) and `test/docs/sard-state-from-history.test.ts` (AC 4 text). `npx jest
test/core/workflow-deduction-history.test.ts test/docs/sard-state-from-history.test.ts` gave **14 failed, 3 passed**.
The 3 that passed are characterizations: no linkage gives `element: null`, an old record does not count, and the
helper source check. **Defect in the red test, found at green:** each shimmed argv line starts with `-C <root>`, so the
AC 5 filters `startsWith('rev-list')` and `startsWith('log')` matched nothing, and the `rev-list` assertion was vacuous.
The filters were corrected in the green commit. The corrected test was run against the red commit in a temporary
worktree and fails there with the three per-start `rev-list` spawns (`npx jest … -t "AC 5"` → 1 failed). The worktree
was removed afterwards.

### green (developer)

Commit `dc0402c9`, implemented as designed. Two test fixes went in with it:
- the AC 5 filters above;
- the AC 2 expectation for `done` after the resubmit: `done` lies after `fallback.step`, so it is reached and reports
  `reentered: true` (reading 3).

`test/workflow/deduce.test.ts` and `test/core/workflow-deduction.test.ts` were adapted to the snapshot's new
`history` / `transitions` / `lastChanges` fields. `npx jest test/core/workflow test/workflow
test/docs/sard-state-from-history.test.ts test/agent/fake-agent.test.ts` → 15 suites, 338 tests passed.

### refactor (developer)

Commit `e0dec2c4`. Edge-case tests were added:
- a merged history: a record on a side branch older than the second start is outside that instance's walk;
- hand re-entries with no file change: no last change;
- a re-entry naming no document;
- ties on the oldest add commit, broken by id;
- a linked element that `HEAD` lacks;
- an unresolved `{ type, path }` token;
- a type added twice;
- an undetermined created target;
- a self-bound step completed by an unscoped record;
- two re-entries, where the newest cuts;
- `state` by transition versus by last change;
- a re-entry that reaches no phase.

Two unreachable guards were removed, each with its reason in a comment:
- `newer`'s null second argument;
- `instanceWalk`'s `?? []`: every start lies in the union walk, because the oldest start is no ancestor of its own
  parents and every other start has a smaller topological position.

Targeted coverage (`npx jest test/workflow test/core/workflow-deduction.test.ts
test/core/workflow-deduction-history.test.ts --coverage --collectCoverageFrom=src/workflow/deduce.ts
--collectCoverageFrom=src/core/workflow-deduction.ts`): both files **100 / 100 / 100 / 100**, 96 tests.

Gates at `e0dec2c4`, each run alone in this worktree (load average 49–81 from the batch, `uptime`):
- `npm test` → 302 suites, 5739 tests passed.
- `npm run test:coverage` → 302 suites, 5739 tests passed; All files **99.29 / 97.25 / 97.41 / 99.71**
  (statements / branches / functions / lines), against the W3 B2 gate's 99.28 / 97.18 / 97.33 / 99.71
  (`../devloop-kit/gate-w3b2-cov.log`): no figure regresses.
- `npm run lint`, `npm run docs:api`, `npx tsc --noEmit -p tsconfig.json`, `npx tsc -p tsconfig.build.json --noEmit`:
  each exit 0.
- No CLI command, option, exit code, Memory type or MCP surface changed: no parity, `cli-reference.md` or dry-run
  row applies. No workflow file changed, so `test/core/workflow-repository-conformance.test.ts` is untouched (green).
- BDD: P4.13's scenarios stay pinned by `test/core/workflow-deduction.test.ts` (unchanged). No feature file covers
  linkage or re-entry; P4.15 is task-202/225-adjacent and was not edited.

**Measured on this repository** (`npm run build`, then `readDeductionSnapshotAtHead('.')` from `dist/core`, two runs):
8 open instances (7 `decision-log-ingest`, 1 `service-ingest`), each still `element: null` at frontier `<w>.capture`
— this history holds no linkage trailer, record or re-entry within their walks (0 / 0 / 0, 0 lookups). The union walk
is 3,183 of 5,879 commits (`git rev-list --count HEAD --not <oldest start>^@`), and the walk `git log` alone takes
0.12 s (`/usr/bin/time`). The snapshot took 3.3–4.8 s under that load, dominated as before by the registry load and
the Memory scan (task-198's figures); the pure deduction 9–24 ms. REQ-PERF-03 itself is measured by the coordinator on
an idle machine.
*After the review fixes (independent re-review figures):* the walk is **3,179** commits (snapshot
`parents.size`), not the 3,183 counted above, which is the figure for the old bound. On this repository the
octopus merge base of the open starts is the oldest start, `bf05de0d`, so the new bound walks exactly the
commits the old one did. HEAD snapshot 2.6 / 2.2 s on this branch against main's 3.0 / 2.5 s: no
regression.

### review (self, reviewer)

- **AC 1 met.** The "AC 1" describe in `workflow-deduction-history.test.ts`:
  - before linkage: `element: null` and frontier `capture-flow.capture`; an unlinked add, or one linked to another
    instance, binds nothing;
  - after the linked add: bound, `created` missing while the bug is `draft`, and complete after the submit (frontier
    `triage`);
  - a second linked bug is listed in `Instance.created`, and `element` stays `bug-1`;
  - a bound step lists its created spec and resolves `{spec.id}`.
- **AC 2 met.** In `describe.each(['reject', 'park'])`:
  - `start` and `design` are complete, and `red` is current with `reentered: true` and the re-entry sha;
  - a new red record moves the frontier to `review`, missing `state`;
  - a new `submit` moves it to `done`.
- **AC 3 met.** An add linked before the plan existed binds nothing. A reject before the start leaves
  `reentered: false`. A record before the start does not complete `design`.
- **AC 4 met.** `sard-state-from-history.test.ts` checks the REQ-SYS-03 and REQ-STATE-02 descriptions. The fixed-commit
  test recomputes twice, adds history, checks out the fixed commit detached, and gets byte-identical JSON. No version
  bump: reading 7.
- **AC 5 met.** With three open instances and one re-entered element, the shim log holds 0 `rev-list` spawns, 1 walk
  `log` (`%P`) and 1 `log -1` lookup naming `docs/tasks/task-2.md`. `workflow-deduction.ts` imports no `child_process`
  and calls `runGitRead`.
- **Determinism.** No clock or randomness was added: `test/workflow/deduce-determinism.test.ts` is green. Every
  collection is ordered: walk by topo position, starts sorted, re-entered keys sorted, created by `(type, id)`.
- **Same-class sweep in touched files.**
  - The two new `git log` calls pass `--no-show-signature`.
  - `readStarts`' `git log`, untouched here, does not; it belongs to task-268 (merge-order note).
  - The P4.13 feature narrative and `06_features.md` P4.13 row still say "from Memory file existence and frontmatter".
    They are not SARD and not touched here, so they are reported as a candidate finding.

### review fixes (approver rulings on the independent review, 2026-10-09)

- **F1, ruling (a): ancestry.** Evidence is "newer than the re-entry" when its commit is a strict
  descendant of the re-entry commit. This replaces design reading 2, which used the `--topo-order`
  position. Ancestry is decided through the `%P` parent links the walk already reads
  (`DeductionSnapshot.parents`), with no extra git spawn. When several re-entries reach a phase, its
  evidence must descend from each; `reentryCommit` reports the one listed first.
- **F3, ruling (a): octopus bound.** The single union walk, and the per-element lookups, are bounded by
  `^@` of `git merge-base --octopus <every start>`, not by the oldest start's parents. This replaces
  design reading 4. Starts with no common ancestor (`merge-base` exits 1) leave the walk unbounded.
  `merge-base` refuses `--no-show-signature` (`git merge-base --octopus --no-show-signature …` →
  `error: unknown option`, exit 129), so its output is checked as a full sha instead. task-268's
  `requireCommitName` takes that role at the gate merge.
- **Red** `c2e6cade` (`npx jest test/core/workflow-deduction-history.test.ts -t "review F" --json`):
  - "review F1 … (main-first)" failed: `red:complete`, as the topo position placed the side record after
    the reject;
  - "review F1 … (side-first)" passed. It is a **characterization**, because the topo order happened to
    place the record before the reject; "main-first" is the genuine red;
  - "review F3 … a younger instance's walk keeps a reject made on another branch before the oldest start"
    failed: `reentered: false`.
  - The ruling's requirement is that both orders agree, and the pair did not.
- **Green** `ff433358`. All three pass, plus coverage tests for:
  - unrelated histories (unbounded walk);
  - a non-sha merge base, refused as `E_GIT_READ_FAILED` (git shim);
  - a diamond below a re-entry.
- **Gates** after the fix:
  - targeted coverage of both files: 100 / 100 / 100 / 100 (101 tests);
  - `npx jest test/core/workflow test/workflow test/docs test/agent/fake-agent.test.ts`: 30 suites, 421 tests passed;
  - `npm run lint`, `npm run docs:api` and both `tsc` runs: exit 0.

**Pending amendments (approver):**
- `spec-017` is left uncommitted in the worktree. §4.8 now defines "newer" as ancestry, the Cost paragraph
  states the octopus bound, and a dated Revision note is added. Proposed `--reason`: "task-203 (review
  F1, F3, approver rulings (a)): §4.8 defines 'newer than the re-entry commit' as descends from it, read
  through the walk's parent links, so a record made on a branch that never saw the reject does not count
  whichever parent order the merge has; the Cost paragraph bounds the single union walk by the octopus
  merge base of the open instances' start commits instead of the oldest start, so a younger instance's
  commits on another branch are kept, at one extra git merge-base spawn. No other deduction rule
  changed."
