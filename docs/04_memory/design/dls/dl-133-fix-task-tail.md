---
id: dl-133-fix-task-tail
type: decision-log
title: "v0.2 ended with 37 of its 43 post-planning tasks being fixes and no rule that saw the tail forming; the release-health catalogue measures the fix share, the smoke and user-doc checks run at every wave, and open fixes above a threshold stop new feature work"
status: ready
context: "planning"
release: "v0.3"
contributor: ""
credit: ""
tmpl_version: 260703
---

## Context

Filed at v0.3 `release-planning` from the approver ruling, 2026-09-29, v0.3 release-planning
(`release-planning-rel-v0.3-plan` R9). Three `ready` decision-logs from the v0.2 retrospective
each cover part of what went wrong at the end of v0.2, and none of them names the fix-task tail
itself. This decision-log amends all three.

**The measurement.** For every v0.2 task file, the creation date is the date of the commit that
added it, and a task is counted as **fix** when its file name contains `fix` or its frontmatter
`bug:` is non-empty. v0.2's backlog was committed on 2026-07-08
(`21754959 wf(release): approve minor-v0.2 [planning → in-development]`).

```sh
for f in docs/04_memory/v0.2/task-*.md; do
  b=$(basename "$f")
  d=$(git log --diff-filter=A --format=%ad --date=short -- "docs/self/docs/04_memory/v0.2/$b" | tail -1)
  bug=$(awk '/^---$/{n++} n==1&&/^bug:/{sub(/^bug:[ ]*/,"");print;exit}' "$f")
  k=feature; case "$b" in *fix*) k=fix;; esac
  case "$bug" in ""|'""'|"[]") ;; *) k=fix;; esac
  echo "$b $d $k"
done
```

The creation date is read at the file's pre-move path. `task-111` moved the Memory from
`docs/self/docs/04_memory/` to `docs/04_memory/` (`16fd0f02`, a pure rename). `git log --follow` on
the new path does not work here: for the tasks added after planning it walks back to `3431dbe9`
(2026-07-03, "Memory schema, state machines & templates"), because rename detection pairs each file
with the task template it was copied from. For example, `git log --follow --diff-filter=A -- docs/04_memory/v0.2/task-090-fix-approval-authority-baseline.md`
ends at `3431dbe9`, while the pre-move path gives `17bc0503 2026-09-22 wf(task): add task-090-…`.

Result, on branch `design/release_planning_v0.3` at `c06b883b`:

| Group | Tasks | Feature | Fix |
|---|---|---|---|
| Planned on 2026-07-08 (`task-034`…`task-065`) | 32 | 23 | 9 |
| Added after planning (`task-066`…`task-108`) | 43 | 6 | 37 |
| of which added 2026-09-21…2026-09-28 (`task-071`…`task-108`) | 38 | 5 | 33 |
| **Total v0.2** | **75** | **29** | **46** |

The six post-planning feature tasks are `task-070`, `task-077`, `task-078`, `task-079`, `task-085`
and `task-094`.

**It is an estimate, not a classification.** The rule has no declared field behind it:
- Six of the nine planned "fix" tasks are feature tasks that absorbed a bug under
  `dl-045-absorbed-bug-back-reference` (`task-045`, `task-046`, `task-047`, `task-054`, `task-060`,
  `task-061`). By file name alone, 3 of the 32 planned tasks are fixes.
- Several post-planning fixes do not say `fix` in their name (`task-091-reads-resolve-at-head`,
  `task-092-writes-refuse-a-dirty-target`) and are caught only by `bug:`.
- `task-077-first-real-staging-run` counts as a feature, yet it is where six bugs were found
  (`dl-099` Context).

The direction does not depend on the rule. Before 2026-07-08, 28% of tasks were fixes by the widest
definition. After planning, 86% were (37 of 43).

**What the three ratified decisions already cover.**
- **`dl-089-release-health-analyses-before-retrospective`** fixes a metric catalogue and requires a
  decision-log for any addition (`dl-089` §2, "Adding, removing or redefining a metric bumps the
  catalogue version and requires a decision-log"). Q13 counts bugs opened and closed. No metric
  counts **tasks** by kind, so the tail above is invisible to it.
- **`dl-099-release-gates-run-on-every-candidate-on-a-fresh-project`** runs the smoke and the staging
  rehearsal on every release candidate. Its §4 offered "(b) also at every `dev-loop` wave boundary".
  The approver took "(a) now, with the smoke part of (c) as soon as dl-103's CI lands"
  (`1bab7629`, `Reason:`). The `user-docs` probe found 7 bugs and the `e2e-smoke` audit 3
  (`dl-099` Context), and both ran once, after the last task.
- **`dl-100-governance-debt-resweep-and-capacity`** adds a growth threshold (+25% over
  `backlog_committed` forces a re-plan checkpoint) and a reserved 20% share for fixes at planning
  (`edd953ed`, `Reason:` "growth threshold (a); capacity (a) as the measure and (b) as the planning
  rule"). Both act at planning or at a checkpoint. Neither stops feature work while fixes pile up.

## Decision

The fix-task tail becomes a measured quantity with a limit. It is measured per release, checked
earlier, and it stops new feature work when it crosses a threshold. The three parts amend three
ratified decisions, and each keeps that decision's structure.

### 1. Amends `dl-089`: the catalogue measures the fix share

Catalogue v2 adds two metrics, next to Q13 (bug flow):

| id | Metric | Scope | Kind | Measures a decision from |
|---|---|---|---|---|
| Q18 | Share of fix tasks among the release's tasks | window | trend ↓ | this decision-log |
| Q19 | Tasks added after `commit-backlog`, split fix / feature, with the fix share | window | trend ↓ (fix share) | this decision-log, `dl-100` §2 |

Both follow `dl-089`'s rules: raw counts next to every percentage, `small-sample` below 30 items, and
like-for-like recomputation of the previous release. v0.2's values above are Q18 = 61% (46 of 75)
and Q19 = 43 added, 86% fix. They are recorded as the provisional baseline.

**Q1 — how a task is classified.**
- **(a) The heuristic above**, name or `bug:`. Needs no change, and misclassifies absorbed bugs.
- **(b) A declared field.** The task template gains `kind: feature | fix`, `[AUTHORING]` in
  `memory.yaml`, set at `build-backlog` or when the task is added. The heuristic is used only to
  backfill v0.1 and v0.2.

**Recommendation: (b).** `dl-089` requires "a definition precise enough to reimplement". A feature
task that absorbs a bug stays a feature, so the metric counts what the rule in §3 must act on.

### 2. Amends `dl-099`: e2e-smoke and the user-doc checks also run at each wave end

The release-candidate rule stays as ratified. In addition, the `e2e-smoke` workflow and the
mechanical checks of `user-docs` run at the end of each `dev-loop` wave. Those checks are the
`docs/examples` scripts and the document-parity tests; the approval of `align-user-docs` stays
once per release. The staging rehearsal stays at the candidate, as `dl-099` §4 recommended, because
it starts a local registry. A failure opens a bug through `bug-ingest` in the same wave.

**Q2 — when.**
- **(a) At every wave end.**
- **(b) Only at a wave that changed a command or a user-facing document.**

**Recommendation: (a).** (b) needs someone to judge whether a wave changed a command, and that
judgement is the unenforced step this decision exists to remove. The smoke is a script.

A wave is declared by `dl-100` §1 (a), which is ratified. This part has no trigger without it.

### 3. Amends `dl-100`: stop the line above a threshold of open fixes

`dl-100` §3 gates the **growth** of the release. This adds a gate on its **mix**. When open fix
tasks in the release exceed a threshold share of open tasks, no new feature task may proceed until
the share falls back under it. Fix tasks are never blocked. An *open* task is any task of the
release that is not `done`. The two rules are independent, and either can fire.

**Q3 — the threshold.**
- **(a) 30% of open tasks.**
- **(b) 50% of open tasks.**
- **(c) A count**, e.g. 10 open fix tasks.

**Q4 — what is blocked.**
- **(i) Pick-up.** `dev-loop` `start` gains a `checks.pre` that refuses a feature task.
- **(ii) Admission.** A new feature task's approval `[pending → backlog]` is refused.
- **(iii) Both.**

**Recommendation: Q3 (a), under Q1 (b); Q4 (i).**
- **Q3 (a).** Under Q1 (b), v0.2's planned mix was 3 fixes in 32 (9%), so 30% leaves room for
  ordinary work and fires on a tail like v0.2's. Under the heuristic (a), the planned mix was
  already 28%, and 30% would fire on ordinary work. That is one more reason for Q1 (b).
- **Q4 (i).** Pick-up is where effort is spent. Admission growth is already gated by `dl-100` §3.
  Blocking admission as well would stop the planning of work that could wait behind the fixes.

## Rationale

- **The tail was visible only afterwards.** The figures above come from `git log` after the release.
  No rule in force during v0.2 counted tasks by kind, so nothing could react while 33 fixes landed
  in the last week.
- **One measure, one earlier check, one limit.** §1 makes the tail a trend the retrospective reads.
  §2 moves discovery to the wave, where the task that caused a defect is still fresh. §3 turns the
  measure into a constraint during the release. Any one of them alone leaves a gap: a measure with
  no limit, or a limit on a quantity nobody records.
- **Amend rather than add a fourth mechanism.** Each part belongs to a decision that already owns
  the file it changes: the catalogue (`dl-089`), the gate cadence (`dl-099`) and the capacity rules
  (`dl-100`). A new decision-log amending ratified ones follows `dl-014` (partially supersedes
  `dl-002`) and `dl-017` (partially supersedes `dl-012`).
- **Trade-offs.** §2 costs one smoke run per wave. §3 can stall feature work when fixes are slow,
  and that stall is the intended effect. A declared `kind` adds a field to maintain.

Alternatives considered:
- **Raise `dl-100` §4 (b)'s reserved share.** Rejected. A bigger reservation at planning does not
  react to what happens during the release.
- **Only report the tail at the retrospective.** Rejected. That is what v0.2 did by hand.

## Actions

1. **File** through `decision-log-ingest` before `build-backlog`, `release: "v0.3"`. Owner: agent
   (product-owner).
2. **Ratify at `reconcile-governance`.** Owner: approver. The approve commit's `Reason:` records the
   options chosen for Q1–Q4.
3. **At `build-backlog`**, the derived tasks declare `depends_on` (`dl-015`) towards the tasks that
   implement `dl-089`, `dl-099` and `dl-100`. They touch the same files: the release-health
   catalogue, `dev-loop.yaml`, `release-planning.yaml` and `release-cycle.yaml`. Expected derived
   work:
   - Q18/Q19 in the catalogue (v2);
   - the `kind` field in the task template and `memory.yaml` under Q1 (b), with backfill;
   - the wave-end smoke and user-doc checks in the wave boundary phase from `dl-100` §1;
   - the stop-the-line `checks.pre` on `dev-loop` `start` under Q4 (i), as a declared check that P4.12
     enforces once workflow checks run (v1.0).
4. **Mark the three originals.** After ratification, add to the Relations of `dl-089`, `dl-099` and
   `dl-100` a dated line "Amended by dl-NNN (v0.3 planning), 2026-MM-DD", in one `docs(…)` commit
   (the form used for decision-log addenda, e.g. `docs(self): dl-064 — code addendum`), status
   unchanged. If `dl-108`'s amend verb has shipped by then, the line is written with
   it instead.
5. **Note for the v0.3 retrospective plan (not decided here).** Measure the active days spent on fix
   tasks against feature tasks, using `dl-096`'s active-day unit. A task count says how many fixes
   there were, and active days would say what they cost. `dl-114`'s run records would make this
   exact once they exist.

## Relations

- **Amends:** `dl-089-release-health-analyses-before-retrospective` (§2 catalogue),
  `dl-099-release-gates-run-on-every-candidate-on-a-fresh-project` (§4 cadence),
  `dl-100-governance-debt-resweep-and-capacity` (§3–§4 capacity).
- **Source:** approver ruling, 2026-09-29, v0.3 release-planning (`release-planning-rel-v0.3-plan`
  R9).
- **Precedents for amending ratified decisions:** `dl-014` (partially supersedes `dl-002`),
  `dl-017` (partially supersedes `dl-012`). `dl-108-amending-an-approved-element` (`ready`, v0.3)
  adds a verb for this, not implemented yet.
- **Related:** `dl-045` (absorbed bugs, the heuristic's main error), `dl-015` (`depends_on`),
  `dl-096` (active days), `dl-103` (CI on push), `dl-114` (per-run cost), `retro-v0.2`.
- **Traceability:** P4.12 (workflow checks), P1.13 (`task` type fields), P4.17 (release workflow
  templates); REQ-STATE-01.

**Note (2026-10-10, approver ruling on `task-221` design decision 3; W3 B4 follow-ups, `bug-ingest-rel-v0.3-w3b4-review-findings-plan`, item A1).**
For the §3 share, a `deprecated` task is not open: it never reaches `done`, so counting it would keep it in the
denominator for the life of the release. An open task is any task of the release that is neither `done` nor
`deprecated`; `draft` and `pending` tasks stay open, as §3 counts them. `task-275` carried the ruling into the one
statement of the rule, `memory.yaml` `task.stop_the_line.open` (`"status not in [done, deprecated]"`, 2.9), which
the `dev-loop` `start` check names (`task-221`). The Decision above is otherwise unchanged.
