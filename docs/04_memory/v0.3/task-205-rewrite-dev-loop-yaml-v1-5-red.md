---
id: "task-205-rewrite-dev-loop-yaml-v1-5-red"
type: task
title: "Rewrite `dev-loop.yaml` as v1.5: `red` by `qa`, executor independence, the reject bug-sync, parking and the main-sync on resume"
status: in-review
release: "v0.3"
kind: "feature"
priority: "high"
tags: ["v0.3", "workflow", "dev-loop", "governance"]
ref: "dl-134"
bug: []
depends_on: ["task-133-bind-builtin-security-directive-role-stop-tests-pinning", "task-180-add-memory-park-declared-returns-edge-optional-per", "task-199-align-wingfoil-workflows-custom-v0-3-schema-commands"]
tmpl_version: 260703
---

## Description

The rulings that reshape `dev-loop`: `red` moves to role `qa` (black-box, and it also writes characterization tests, `dl-134` Q1 (a)); `green` `distinct_from: [red]`, `refactor` `mode: resume`, `review` `distinct_from: [red, green, refactor]`; `tests.unchanged(since: red)` declared on `green`/`refactor` (evaluated from v1.0); a fourth `bug.sync_state` so a review reject moves the absorbed bug back with the task (`dl-061` A.1); `park` keeps the branch, removes the worktree and syncs bugs `in-progress → planned` (`dl-110` P2); a resumed task merges `main` into its branch before re-submitting (`dl-035`). The rules that are not configuration go to the `testing` directive and `roles.yaml`.

## Acceptance Criteria

- (red-first) A test loads `dev-loop.yaml` v1.5 and asserts: `red.role == qa`, the three `distinct_from`/`mode` declarations above, `tests.unchanged(since: red)` in `green` and `refactor` `checks.post`, and zero load errors (task-199's test stays green).
- (red-first) `dl-061` A.1: after a `review` reject, `workflow next` reports the fallback step and a `bug.sync_state` manual action whose expected subject is `wf(bug): sync <bug> [in-review → in-progress]`; the sync's placement needs no schema change (spec-003 `fallback` has no `actions`), and where it lands (e.g. first action of `red`, idempotent on a first pass) is recorded in the header comment.
- (characterization) `dl-061` B.1/C.1: the header comment states that a sync crossing a `gates` reject edge cites the approver's reject sha, and that the reject procedure emits both commits; the same text is handed to v0.3's `user-docs` `align-agent-docs` for `CLAUDE.md` §5.1 (recorded in Execution Notes).
- (characterization) `testing` directive: the §2 freeze (files `red` touched, Q2 (a)), the §1 black-box rule for `qa` and Q1 (a); `roles.yaml` binds `code-quality`, `testing`, `determinism` to `reviewer` in addition to its own; both with `version:` bumps; `bug-112`'s de-pinned tests stay green.
- (characterization) `dev-loop.yaml` `version: 1.5` with the header history line; `WORKFLOW.md`'s dev-loop diagram shows `red` under `qa`.
- (characterization) `dl-035` (E sweep): after a reject, the resume path declares the action that merges `main` into the task branch before re-submit, citing `dl-035` (the rule text is task-178's).

## Implementation Notes

- **Size:** M · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-134 §1–§5, Actions 2, 4, 5 (config half); dl-061 A.1, B.1, C.1; dl-110 P2; dl-035 (config half, E sweep); spec-003 § Execution independence worked example.
- **Features:** P4.1, P4.15.
- **Notes:** Proposal key: A19. The stop-the-line `start.checks.pre` (`dl-133` Q4 (i)) and the other v0.3 gates (`dl-044`, `dl-097`, `dl-098`, `dl-102` §4, `dl-115`, `dl-116`) are task-221's single v1.6 revision, after this task. Coordinate with task-139 (`testing.md` T1/T2) on the same file. `dl-133`'s `kind` field is task-150.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.
- **Handover from wave 2 B2 (2026-10-05, `bug-248`).** As the next writer of `.wingfoil/directives/custom/testing.md`, add one line pointing to `security-secrets` S1 (fixtures that look like secrets are built at runtime, `task-182`), as `dl-073` Action 3 asks.
- **Handover from wave 2 B3 (2026-10-06, `dl-156` ratified Q1 (a), Q2 (i); `bug-250`).** WIP limits must count holders across every ref, and `reject` and `returns` edges are exempt from the limit: implement both where this task touches the dev-loop rules, or name the task that will. Add BDD scenarios under `p1-memory/` for `memory park` and WIP limits, including the `supersedes:` trigger path (bug-250).

## Execution Notes

Branch `task/task-205-rewrite-dev-loop-yaml-v1-5-red`, worktree `../.wf2-wt/task-205`, cut from `main` at
`1ce84a54` (start `27246f15`). Batch W3 B3, merge order 268 → 203 → 202 → 204 → 207 → 218 → 213 → **205** → 214.

### design (architect)

**`depends_on` read (dl-015).** All three are `done` (`awk '/^status:/{print $2;exit}'` on each file):
- `task-133` — `security` bound globally in `roles.yaml` (1.2); its AC 2 rewrote the two live-config
  suites to membership assertions (`toContain`), which is `bug-112`'s fix: a new reviewer binding
  fails nothing (`grep -n "reviewer" test/directives/schema.test.ts test/core/loaders.test.ts` →
  `toContain('command-baseline')` only).
- `task-180` — `memory park` along `returns: { in-progress: backlog }` and `limits:`; its Description
  hands `dl-110` P2 (worktree/branch/bug sync on park) to this task. The WIP check is one shared
  `requireWipSlot`, reached by the `supersedes:` trigger with op `supersede`, untested there
  (its review notes; `bug-250`).
- `task-199` — `dev-loop.yaml` 1.41 (1.5 reserved here, 1.6 `task-221`); `workflows/bindings.yaml` 1.0
  binds `git.merge` `manual`; `test/core/workflow-repository-conformance.test.ts` pins zero errors,
  the exact unbound-check warning set, and that no action token is unbound.

**Specs and rulings.** `spec-003` (`approved`) already carries `mode`, `distinct_from` and
`tests.unchanged(since: <phase>)` (task-185, § "Execution independence", § "Check expressions") and
the v1.5 worked example; the loader checks exist (`E_PHASE_MODE_NOT_INDEPENDENT` etc.,
`src/core/workflow-diagnostics.ts`). `spec-017` (`approved`) §5.2 reports the fallback, §6.1 a
`manual` binding with its commit subject. Rulings read from the approve commits
(`git log --grep="approve dl-…"`): `dl-134` Q1 (a), Q2 (a), §4 (c) (`e6a27440`); `dl-061` A.1 (`done`
fallback deferred to `dl-053`), B.1, C.1, landing as v1.5 (`eb710f01`); `dl-110` P2 as stated
(`6d12740d`); `dl-035` merge main at the two points (`82149a2a`); `dl-156` Q1 (a), Q2 (i), "no limit
is declared in this repository until it is implemented" (`f3354102`). No spec is missing; one spec
sentence becomes stale (pending amendment below).

**Design decisions.**
1. *Where the reject-side sync lands (AC 2).* A `fallback` has no `actions` (spec-003), so the fourth
   `bug.sync_state(for_each: task.bug)` is the FIRST action of `red`, the fallback step: a no-op on a
   first pass (`start` already moved the bugs to `in-progress`), `in-review → in-progress` after a
   reject. The header states it, and B.1/C.1.
2. *`dl-035` (AC 6).* `git.merge(from: main)` in `red` after the sync and before `agent.execute` (point
   (a), resume after a reject or a park), and in `review` before `tests.bdd.run` / `memory.submit`
   (point (b)) — point (b) later moved to `refactor`'s last action (review F3, approver ruling
   2026-10-09, option 2). It reuses the `git.merge` token, already bound `manual`, so no action token becomes
   unbound; `bindings.yaml`'s comment names the second form (version 1.0 → 1.1).
3. *Parking (`dl-110` P2).* `park` is a CLI verb that no workflow token emits (spec-003 verb table),
   and a phase sequence has no event hook, so P2 is declared as the park procedure in the header
   (branch kept, worktree removed, reason in the Execution Notes, bugs `in-progress → planned`), and
   `start` says it reuses a parked task's branch. **Decision for the approver.**
4. *`dl-156` (handover).* Its two rulings are code in `requireWipSlot` / the transition preamble and
   `spec-001`/`spec-008`, not dev-loop configuration; no task implements them
   (`grep -ln "dl-156" docs/04_memory/v0.3/task-*.md` → this task only). This repository declares no `limits:` (approver), so no dev-loop
   phase meets a limit; the header records the ruling. Named for the coordinator as a candidate task.
5. *`bug-250` (handover).* Scenarios 5–9 in `P1.13-memory-element-schema.feature` (park, its two
   refusals, a limit naming holders, the `supersedes:` trigger into a full state) and their suite
   `test/memory/element-schema-park-limits.test.ts`. A reject into a full state and holders on other
   branches are left to the `dl-156` task (their outcome changes with it).
6. *`bug-248` (handover).* One line in `testing` pointing to `security-secrets` S1.
7. *`tests.unchanged(since: red)` stays unbound*: no command evaluates it before P4.12 (v1.0). Two
   more `W_WORKFLOW_UNBOUND_TOKEN` warnings in task-199's pinned set (green `post[1]`, refactor
   `post[5]`), each with this reason.
8. *`testing.md` had no `version:`*; it gets `version: "1.1"` because AC 4 asks for a `version:` bump.
   `roles.yaml` 1.4 → 1.5.

**AC classification (T1).** The task labels AC 3–6 characterization; none of the declarations exists
yet (`grep -n "role: qa\|distinct_from\|tests.unchanged\|from: main" .wingfoil/workflows/custom/dev-loop.yaml`
→ nothing; `grep -n "T3\|T4\|S1" .wingfoil/directives/custom/testing.md` → nothing), so each test is
an observed red, as `task-133` recorded for its AC 3. Corrected:

| AC | Class | Why |
|---|---|---|
| 1 — v1.5 phase declarations, zero load errors | red-first | `red.role` is `developer`; no `distinct_from`/`mode`/`tests.unchanged` |
| 2 — reject → `red`, sync as its first action, legal `[in-review → in-progress]` subject | red-first | `red`'s first action is `agent.execute` |
| 3 — header states B.1 / C.1 | red-first (document) | no such text |
| 4 — `testing` T3/T4 (+ S1 line), `roles.yaml` reviewer bindings, version bumps | red-first | reviewer resolves 3 + 6 global directives |
| 5 — `version: 1.5` + history; `WORKFLOW.md` `red` under `qa` | red-first (document) | 1.41; `*(developer)*` |
| 6 — `dl-035` merge before re-submit | red-first | no merge action in `red`/`review` |
| bug-250 handover — P1.13 sc. 5–9 | characterization | task-180's code already behaves so; sc. 9 is the first test of the `supersede` entry path |

**Unasserted (T1).** AC 2's "`workflow next` reports the fallback step and a `bug.sync_state` manual
action" — `workflow next` does not exist (`task-216`, `backlog`; `grep -n "workflowNext" src/core/index.ts`
→ nothing), nor does re-entry deduction (`task-203`, this batch). The test pins what `next` will read:
the fallback step, the token's `manual`/`sync` binding on type `bug`, and that the subject crosses a
declared `gates` edge and reads back as a `sync`. Handed to `task-216`.

**Handed to `user-docs` `align-agent-docs` (`CLAUDE.md` §5.1, AC 3, `dl-061` C.1/B.1):** "Rejecting a
task whose `bug:` list is not empty is two commits, emitted together: the approver's
`wf(task): reject <task> [in-review → in-progress]`, then `wf(bug): sync <bug> [in-review →
in-progress]` for each linked bug, whose body cites the reject commit's sha and carries no
`Approver:` line (the decision is recorded once, on the reject)." Also for `CLAUDE.md` §7: `reviewer`
now loads `code-quality`, `testing`, `determinism` (and `roles.yaml` is at 1.5); §6: `dev-loop`'s `red`
is `qa`'s.

### red (qa, as one agent session — see review)

`c4e76e78` adds `test/core/dev-loop-v1-5.test.ts` (20 tests; AC 1–6 and the `dl-110` P2 header). It
reads the workflow at `HEAD` through `loadWorkflowRegistryAtHead` and the header with
`git show HEAD:<path>`, so it is red until the configuration is committed.
`npx jest test/core/dev-loop-v1-5.test.ts test/memory/element-schema-park-limits.test.ts --verbose`
→ **16 failed, 9 passed**: the 16 are every new declaration (red's role, the three executor
attributes, the two `tests.unchanged`, the sync as red's first action, the header's A.1/B.1/C.1/P2
text, `testing` T3/T4/S1, the reviewer bindings and their resolution, version 1.5, the diagram, the
two merges). The 4 passing in that file are what already held: zero load errors, `review`'s
fallback unchanged, the `[in-review → in-progress]` bug subject legal and read back as `sync`, and
`git.merge` bound `manual`. `f1b018c4` adds P1.13 scenarios 5–9 and
`test/memory/element-schema-park-limits.test.ts`: **5 of 5 pass on first run** (characterization,
`bug-250`), sc. 9 being the first test that reaches `requireWipSlot` through the `supersedes:` trigger
(refused at exit 1 with `held by adr-0`, `HEAD` unchanged, both elements unchanged).

### green (developer)

`52f61bd2`: `dev-loop.yaml` 1.41 → 1.5, `testing.md` (`version: "1.1"`, T3, T4, S1 line),
`roles.yaml` 1.4 → 1.5 (reviewer + `code-quality`, `testing`, `determinism`), `bindings.yaml` 1.0 → 1.1
(comment only), `WORKFLOW.md` (dev-loop prose and diagram, task `in_progress --> backlog : memory
park`, bug sync edges for a reject and a park, Roles Summary). Same-class fixes in `WORKFLOW.md`: the
task and bug state diagrams had no park edge and no reject-side sync. Test files changed outside
`red`'s commit (testing T4: listed for the reviewer, none of them a file `red` touched):
- `test/core/workflow-repository-conformance.test.ts` (task-199): the pinned warning set gains the two
  unbound `tests.unchanged` checks (dev-loop `phases[3].checks.post[1]`, `phases[4].checks.post[5]`);
- `test/core/workflow-executor-cadence.test.ts` (task-185, `37b2c36c`): "this repository's workflows
  … declare no mode" was true until v1.5; it now pins exactly the three declarations, and cadence
  `once` everywhere (found by the first full `npm test`, 1 failed / 5740).
Targeted run after green: 11 suites, 257 tests passed (dev-loop-v1-5, element-schema-park-limits,
conformance, workflow-md, version-bump, test/directives, loaders, context).

### refactor (developer)

Run with the spec-003 pending amendment in the working tree. Load average 57–90 throughout (`uptime`).
- `npm test` → **302 suites, 5741 tests, all passed** (exit 0).
- `npm run test:coverage` → **99.28 % statements / 97.18 % branches / 97.4 % functions / 99.71 % lines**, all ≥ 80 % and not below the baseline; the run exits 1 only on `test/core/query-latency.test.ts`'s two latency budgets (the same two as the baseline, load average 82–90), which pass when re-run alone (`npx jest test/core/query-latency.test.ts` → 4 passed) and pass inside `npm test` above.
  Baseline on the pre-change tree (`1ce84a54` + start): 99.28 / 97.18 / 97.33 / 99.71, with
  `test/core/query-latency.test.ts` failing 2 latency budgets under load (1038 ms, 1064 ms; not a
  regression, the coordinator's idle run decides). No `src/` file changed (`git diff --stat 1ce84a54
  HEAD -- src` → empty), so any difference is test-load noise.
- `npm run lint` → exit 0; `npm run docs:api` → exit 0; `npx tsc --noEmit -p tsconfig.json` → exit 0;
  `npx tsc -p tsconfig.build.json --noEmit` → exit 0.
- `node scripts/check-governance.cjs --base 1ce84a54` → "1 wf() commits …", 0 findings, exit 0.

### review (reviewer, self-review)

- AC 1 met — `dev-loop-v1-5` AC 1 block; zero errors also in task-199's conformance test.
- AC 2 met for the configuration; **unasserted**: `workflow next`'s report (task-216, see design).
- AC 3 met (header) — the `CLAUDE.md` §5.1 text is handed above.
- AC 4 met — T3/T4 + S1, reviewer bindings, `version` bumps; `bug-112`'s membership tests green
  (`test/directives`, `test/core/loaders.test.ts` in the targeted run).
- AC 5 met; AC 6 met (`red` and, since review F3, `refactor` merges, each line citing `dl-035`).
- Separation of duties was not practised by this run: one agent session wrote `red`, `green`,
  `refactor` and this self-review, as the brief's dev-loop still prescribes (v1.5 takes effect for the
  next task). The handoff is checkable in git: `git log --format='%h %s' main..HEAD` puts the red
  commits `c4e76e78`, `f1b018c4` before `52f61bd2`, and `git diff c4e76e78 HEAD --
  test/core/dev-loop-v1-5.test.ts` and `git diff f1b018c4 HEAD -- test/memory/element-schema-park-limits.test.ts`
  are empty.

### Review fixes (2026-10-07, coordinator review: APPROVE WITH FIXES)

- **F1** — the park sync `[in-progress → planned]` was no edge of the bug machine. Red `fa0fc407`
  (the bug machine at `HEAD` has `returns: { in-progress: planned }`, `isMachineEdge` accepts the hop,
  the subject reads back as `sync`: failed, 2 of 22 in `npx jest test/core/dev-loop-v1-5.test.ts`
  with F2's test). Fix ``628d27d5``: `.wingfoil/memory.yaml` 2.5 → 2.6, bug
  `returns: { in-progress: planned }` (`dl-110` P1 (a)); `memory park` takes the same edge on a bug.
  `test/core/bug-decline-edges.test.ts`'s pinned bug edge table gains `in-progress` park → `planned`
  (`e42e9521`, found by the full `npm test`: 1 failed / 5743). `spec-001`'s example `bug` block gains
  the key (pending amendment below);
  `test/docs/memory-types-parity.test.ts` passes with it.
- **F2** — the header said `done`'s fallback gets no sync, but it re-enters at `red`, whose first
  action is the sync. Header and `done`'s fallback comment now say the sync also runs after `done`'s
  fallback, and that the legality of that task edge is `dl-053`'s question.
- **F3** — first stopped and reported: moving the only main-sync to `refactor`'s last action would
  remove `dl-035` (a)'s "before any `red` work" on a resume after a reject, which `dl-035`'s ratified
  Decision 2 (a) and `git-conventions` §2 both require. **Approver ruling 2026-10-09, option 2**: keep
  (a) in `red`, run by the developer before `qa` writes a test (`qa` never resolves a conflict in
  implementation files), and move (b) from `review` to `refactor`'s last action, so `refactor`'s
  coverage, API-docs and `lint.clean` checks measure the merged tree and `review` stays read-only; no
  `dl-035` amendment. Red `914be4be` (3 of 24 failed: `refactor`'s last action, `review` without a
  merge, the header's conflict wording). Fix `01fad996`: `dev-loop.yaml` (the action moves; the
  header drops the circular "the task returns to `red`" for `red`'s own merge), `git-conventions` 1.2
  → 1.3 (§2 names who runs each merge and who resolves its conflicts; date 2026-10-09), `WORKFLOW.md`
  (diagram and prose). `297dde71`: task-260's `test/directives/git-conventions.test.ts` pinned the
  exact version `"1.2"`; it now asserts 1.2 or later. The conformance test's counts do not change
  (no check moved). The spec-003 pending amendment no longer shows a merge in `review` and says why. Gates after F3 (both
  pending amendments in the working tree): `npm run test:coverage` → 302 suites, 5745 tests, all
  passed, 99.28 / 97.16 / 97.4 / 99.71 (no `src/` change); `npm run lint`, `npm run docs:api`, both
  `tsc` runs exit 0; `check-governance --base 1ce84a54` → 2 `wf()` commits, 0 findings.
- **F9** — design decision 8 no longer claims an implicit 1.0 from spec-013.
- Touched suites after the fixes: `npx jest` over `dev-loop-v1-5`, `element-schema-park-limits`,
  `workflow-repository-conformance`, `workflow-md`, `test/directives`, `version-bump`,
  `memory-types-parity`, `enumeration-parity.allowlist`, `workflow-executor-cadence`, `test/memory`,
  `loaders` → 39 suites, 869 tests passed. Full `npm test` before
  `e42e9521`: 302 suites, 5742 passed, 1 failed (the edge table above), which then passes (13/13);
  `npm run lint`, both `tsc` runs exit 0; `check-governance --base 1ce84a54` → 2 `wf()` commits,
  0 findings.

- **Re-review of F3 (approve with fixes), text only.** `bindings.yaml`'s `git.merge` comment says
  `red/refactor` (still 1.1). `tests.unchanged(since: red)` would read a main-sync merge that brings a
  change to one of `red`'s test files as a breach: `testing` T4, the `dev-loop.yaml` header and
  spec-003's check entry now say it compares only the branch's own non-merge commits since `red`
  (an inward `Merge branch 'main' into task/…` is excluded), and the reviewer's command is
  `git log --no-merges --format=%h <red-commit>..HEAD -- <red's test files>` (empty). The header says
  why a conflict at `refactor`'s merge returns to `red` (it may touch `red`'s frozen tests);
  `review`'s description says the branch was brought current at `refactor`'s last action, `main`
  moving after that being `done`'s fallback; `git-conventions` §2 (still 1.3) names the resume
  triggers as the yaml does (after a reject or a park, and after `done`'s fallback) and restores
  `dl-035` point 3 (only a conflict that is not trivially resolvable is aborted, then the developer
  resolves it). spec-003's Revision note is dated 2026-10-09.
- **Bisect note:** `01fad996` alone leaves `test/directives/git-conventions.test.ts` red (it pinned
  `"1.2"`); `297dde71` fixes it. History is not rewritten.
- **Merge note:** `workflows/bindings.yaml` conflicts with `task-207`: both bump 1.0 → 1.1; the
  coordinator re-bumps to 1.2 at the gate.

### Pending amendments (approver)

- `spec-003-workflows-yaml-schema` — `--reason "dev-loop.yaml is at v1.5 (task-205): the Execution
  independence worked example no longer says the separation is not yet on disk, the review-gate worked
  example gains distinct_from and the bug sync, one sentence says that a step the reject path needs is
  the first action of the fallback step, since a fallback takes no actions (dl-061 A.1), and one that
  the review gate does not merge main, dl-035's pre-submit sync being refactor's last action (approver
  ruling 2026-10-09, option 2); the tests.unchanged(since: <phase>) entry says it compares only the
  branch's own non-merge commits since the phase, so a main-sync merge is not an edit of the frozen
  tests. No field or diagnostic changes."`
- `spec-001-memory-yaml-schema` — `--reason "The example bug block gains returns: { in-progress: planned },
  as memory.yaml 2.6 declares (task-205 review F1): dev-loop's park sync moves a linked bug back
  [in-progress → planned] when its fix task is parked (dl-110 P2), and the hop must be a machine edge.
  No key, rule or diagnostic changes."`

### For the coordinator

- `dev-loop-rel-v0.3-plan` lines 98–99 ("Until then the v1.4 roles apply") are stale once this merges.
- Candidate task: implement `dl-156` Q1 (a) (count holders across refs) and Q2 (i) (exempt `reject`
  and `returns` edges) in `requireWipSlot` / the transition preamble, `spec-001`/`spec-008`, with the
  P1.13 scenarios for a reject into a full state and for parallel holders — no task carries it.
- `bug-250` and `bug-248` (both `triaged`, in no task's `bug:` list) are fixed by `f1b018c4` and
  `52f61bd2`; their state is the coordinator's to move.
