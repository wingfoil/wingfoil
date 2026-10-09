---
id: "task-221-declare-v0-3-dev-loop-gates-revision-dev"
type: task
title: "Declare the v0.3 dev-loop gates in one revision of dev-loop.yaml"
status: in-progress
release: "v0.3"
kind: "feature"
priority: "medium"
tags: ["v0.3", "process", "workflow-config", "dev-loop"]
ref: "dl-097"
bug: []
depends_on: ["task-150-declare-task-kind-stop-line-threshold", "task-173-add-whole-project-typecheck-clean-gate-control-character", "task-201-add-claim-rerun-rereview-items-code-review-task", "task-205-rewrite-dev-loop-yaml-v1-5-red", "task-213-write-retrospective-notes-during-release-templates-retrospective-workflow"]
tmpl_version: 260703
---

## Description

Seven ratified decisions each add a check to `dev-loop.yaml`. One revision (v1.6) declares them all, so the file changes once after `dl-134`'s rewrite and the v0.3 dev-loop plan is updated in the same change (the `dl-034` lesson: agents execute the plan, not the YAML).

## Acceptance Criteria

- (characterization) `design` declares the criterion-vs-directives/specs check (dl-102 §4); `refactor.checks.post` gains `typecheck.clean` (dl-044), bound in `bindings.yaml` to task-173's `npm run typecheck`; `review.checks.pre` gains the claim re-run check (dl-097 (a)), the re-review check (dl-098) and names the document-parity suites (dl-116); `done.checks.post` gains the `### Retrospective` existence check (dl-115 Q2 (a)); `start.checks.pre` gains the stop-the-line check: no feature task is picked up while open fix tasks exceed 30 % of the release's open tasks (dl-133 Q3 (a), Q4 (i)).
- (characterization) `workflow show dev-loop` (v0.3 build) shows each new check with its binding or as an unbound warning, zero errors; the warnings are listed in Execution Notes.
- (characterization) the active v0.3 dev-loop phase plan states the same gates in the same change.

## Implementation Notes

- **Size:** S · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-097 (a) `review` checks.pre; dl-098 Action 2; dl-102 §4; dl-044 (`refactor.checks.post` declaration; the gate is task-173); dl-115 Q2 (a); dl-116 Action 4; dl-133 §3 Q4 (i).
- **Features:** P4.1, P4.12 (declared only).
- **Notes:** Proposal key: D08. Single owner of the dev-loop `start` stop-the-line check (`dl-133` Q4 (i)); task-205 (v1.5) lands first.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.
- **Handover from wave 1 B3 (2026-10-02, `task-150`).** Read the threshold from `.wingfoil/memory.yaml` `task.stop_the_line` (`max_share: 30`, `open: "status != done"`, `blocks: feature`, `at: "dev-loop start"`) rather than restating 30 percent. The approver ruled `dl-133` option (a) on 2026-10-02: the threshold applies as ratified, counting every open task of the release, so fixes are taken first until the share falls under it. Decide in design whether `deprecated` (and `draft`/`pending`) tasks count as open: as written they do.

## Execution Notes

Branch `task/task-221-declare-v0-3-dev-loop-gates-revision-dev`, worktree `../.wf2-wt/task-221`, cut from
`main` at `b56e8721` (start commit `b1a3592a`).

### design (architect)

**Governance read** (`grep -m1 '^status' docs/04_memory/design/dls/dl-{044,097,098,102,115,116,133}-*.md`
→ all seven `status: ready`; the options each ratification chose, from its approve commit,
`git log --format='%h %b' --grep='^wf(decision-log): approve dl-NNN' main`):
- `dl-044` (`16436983`): `typecheck.clean` in `refactor.checks.post`; the binding already exists
  (`.wingfoil/workflows/bindings.yaml`, `typecheck.clean: { run: [npm, run, typecheck] }`, written by
  `task-173` for `release-submit`), so this task declares the token and re-labels the binding's comment.
- `dl-097` (`ae393dc0`): (a) a review-gate `checks.pre` now; (b) the CI lint is `dl-103`'s, not this task's.
- `dl-098` (`b956ad6d`): (a) + (b): the re-review reads the previous reject through `memory history`, and
  the implementer answers each item in the Execution Notes (template line written by `task-201`).
- `dl-102` (`a13dfc94`): §4 — `design` reads each criterion against the bound directives and the ratified
  specs, and raises a contradiction to the approver.
- `dl-115` (`d7abc553`): Q2 (a) — an existence check on `done`; its Action 3 names "`done` phase
  `checks.post`, and the step that keeps a fix task's source bug in sync", so the check also covers each
  linked bug the `done` sync moves to `closed`. The plan half ("when a plan reaches `done`") has no
  workflow step in `dev-loop`: reported, not written here.
- `dl-116` (`a6276d34`): Q2 (a) the parity suites run in Jest; Action 4 — `review` names them.
- `dl-133` (`9568ca66`): Q4 (i) a `start.checks.pre` refusing a feature task; the threshold is read from
  `memory.yaml` `task.stop_the_line` (task-150 handover), not restated.

**Specs.** No tech-spec is cited by the ACs. `spec-003` (`status: approved`) governs the check-token
grammar: its "Observed forms" list is not exhaustive (`typecheck.clean`, `secret-scan.clean`,
`proposals.disposed` are declared in workflows and not listed there:
`grep -c "typecheck.clean\|proposals.disposed" docs/04_memory/design/specs/spec-003-workflows-yaml-schema.md`
→ `0`), and the new tokens are plain `name(prose)` checks of the same shape, so no spec edit is needed.

**depends_on (dl-015), each `status: done`** (`grep -m1 '^status' docs/04_memory/v0.3/task-{150,173,201,205,213}-*.md`):
- `task-150` — `memory.yaml` 2.6 `task.stop_the_line` (`max_share: 30`, `open: "status != done"`,
  `blocks: feature`, `scope: release`, `at: "dev-loop start"`), "the ONE statement of the threshold"; its
  notes leave the `start` check to this task and observe the literal rule firing at `cac8a447`.
- `task-173` — `npm run typecheck`, `typecheck.clean` bound; "the `dev-loop.yaml` declaration is left to
  `task-221`"; `testing.md` must not claim `refactor` declares it before this task.
- `task-201` — `code-review.md` claim re-run and re-review items, task template's dl-098 (b) line; "The
  dev-loop `checks.pre` entries are task-221".
- `task-205` — `dev-loop.yaml` 1.5 (structure kept: `red`'s two leading actions, `refactor`'s last
  `git.merge(from: main)`, `tests.unchanged(since: red)` on `green`/`refactor`); `test/core/dev-loop-v1-5.test.ts`
  pins `version: 1.5` and `testing.md` `"1.1"`, which this task's bumps update.
- `task-213` — `### Retrospective` in the task/bug/plan templates; "The `done` existence check is task-221".

**Design decisions.**
1. *Token names and arguments* (all `checks`, so none may be `manual`; spec-003 Layer 3):
   - `start.checks.pre`: `stop-the-line.clear(rule: memory.yaml task.stop_the_line; a fix task is never blocked)` — unbound.
   - `design.checks.post` + `acceptance-criteria.consistent(…)` — unbound (a reading, no command).
   - `refactor.checks.post` + `typecheck.clean` — bound (`npm run typecheck`). Appended after
     `tests.unchanged(since: red)`, so task-205's paths (`phases[4].checks.post[5]`) do not move.
   - `review.checks.pre` + `claims.rerun(…)`, `rereview.previous-reject(…)` — unbound; + `docs.parity` —
     bound to `npm test -- <the eight suites>` (below).
   - `done.checks.post`: `retrospective.present(…)` — unbound: the file it reads is the task's path, which
     no binding placeholder can carry today (a `{task.path}` interpolation does not exist).
2. *`docs.parity` names the suites, not `test/docs/`.* dl-116 Action 4 says "names the new checks". The
   binding lists the eight suites whose header cites `dl-116` or that are its model
   (`grep -l "dl-116" test/docs/*.test.ts` → commands-parity, exit-codes-parity, mcp-surface-parity,
   memory-types-parity, name-resolvability, workflow-md; plus `enumeration-parity.allowlist.test.ts`, the
   allowlist's own gate, and `cli-reference.test.ts`, the model dl-116 names). A test pins that every
   `test/docs/*.test.ts` citing `dl-116` is in the binding, so a later parity suite cannot be left out.
3. *What counts as open (task-150 handover).* Kept as written in `memory.yaml`: every task of the release
   that is not `done` — `draft`, `pending` and `deprecated` included — because that is `dl-133` §3's
   ratified text and `memory.yaml` is not this task's file in B4 (task-212/269 write it). Today both
   readings give the same verdict: on this branch's tree, v0.3 tasks
   (`for f in docs/04_memory/v0.3/task-*.md; do …status… …kind…; done | sort | uniq -c`) are 39 backlog
   feature, 2 backlog fix, 1 deprecated feature, 1 in-progress feature, 106 done → 2 open fixes of 43 open
   (4.7 %), or of 42 without the deprecated one (4.8 %): the rule does not fire. Excluding `deprecated`
   (a task that will never be `done` counts as open forever) is a decision for the approver.
4. *Bumps* (one each, baseline `main` `b56e8721`): `dev-loop.yaml` 1.5 → 1.6; `bindings.yaml` 1.2 → 1.3
   (comment on `typecheck.clean`, new `docs.parity`); `testing.md` "1.1" → "1.2" (the `typecheck.clean`
   bullet names `refactor` now, task-173's handover); `WORKFLOW.md` (no version field) dev-loop prose and
   diagram. The v0.3 dev-loop plan (`plan`, `active`) is past its first state: its edit is a pending
   amendment, left uncommitted (AC 3).

**AC classification (testing T1).**

| AC | Class | Why |
|---|---|---|
| 1 — the seven checks declared | red-first (corrected from characterization) | none is declared at `b56e8721` (`grep -c "typecheck.clean\|stop-the-line\|claims.rerun\|retrospective.present" .wingfoil/workflows/custom/dev-loop.yaml` → `0`, while `grep -c "lint.clean"` → `4`): a test asserting them fails until the YAML changes — a genuine red, no fabricated one |
| 2 — `workflow show dev-loop` shows them, zero errors | characterization | `workflow show` (task-204) already reports each check's binding or `unbound`; no code changes. The conformance suite's pinned warning set changes with the YAML (updated in the red commit, failing until green) and the command's output is recorded below |
| 3 — the plan states the same gates | characterization (document) | a pending amendment of the active plan, checked by reading it; no test |

### Retrospective

- None yet.
