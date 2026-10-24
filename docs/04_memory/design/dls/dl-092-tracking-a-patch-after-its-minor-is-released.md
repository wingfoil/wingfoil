---
id: "dl-092-tracking-a-patch-after-its-minor-is-released"
type: decision-log
title: "A patch release after its minor is `released` has no tracking element, and two releases in flight need a rule for what reaches `main`"
status: ready
context: "retrospective"
release: "v0.2.2"
contributor: ""
credit: ""
tmpl_version: 260703
---

## Context

Filed by the v0.2 retrospective (`retro-v0.2`). The approver ruled on 2026-09-28 that a v0.2.2 patch is
published before v0.3.0, and that one of its gates is a decision on how a patch is tracked once its
minor is `released` (`retrospective-rel-v0.2-plan` §6.7). The approver also ruled that v0.2.2 and v0.3
run in parallel, and fixed how their work reaches `main` (§6.8 and the retrospective's parallel-release
disposition). This decision-log records that rule and lays out the tracking options.

### Nothing tracks a patch today

- **The `release` type has no place for one.** `memory.yaml` `types.release` has
  `id_pattern: "minor-{version}"` and the machine `draft → planning → in-development → releasing →
  released`, with `released` terminal and no `gates` (so no `reject` back). `minor-v0.2` reached
  `released` at `d2ad1f3f` (`wf(release): mark-released minor-v0.2 [releasing → released]`).
- **The only patch so far was absorbed into its minor.** `wingfoil@0.2.1` was published inside
  `minor-v0.2`'s own `release-publishing` phase, as a re-run after `v0.2.0` was tagged and never
  published (`release-publishing-rel-v0.2-plan`, *Step 3 again — 0.2.1*). That worked because the
  minor was still `releasing`. v0.2.2 starts after `released`, so it has no element whose state it can
  move, and no `release-cycle` iteration it belongs to (`release-cycle.yaml` iterates `release`
  elements).
- **v0.2.2 is not a hotfix.** Its approved scope is metadata, repository preparation (the
  configuration moves to the root, closing `bug-075`) and first-use fixes, with no change to how any
  command behaves (§6.8, steps 1–6). It has its own planning, several tasks, a staging run and a
  publish: the work of a release, not of a single fix.

### The parallel-release rule, as the approver confirmed it (option (a), 2026-09-28)

- **Trunk-based stays** (`dl-002-git-branching-trunk-based`, point 3: no long-lived release branches).
  Both v0.2.2 and v0.3 land on `main`, and the `v0.2.2` tag is placed on the pushed `main`.
- **v0.3 starts after v0.2.2 step 2**, the move of the configuration to the root.
- **From then until the `v0.2.2` tag, v0.3 merges into `main` only Memory and process documents.**
  Code, `package.json`, `.github/workflows/publish.yml` and user documentation wait for the tag.
- **v0.3 branches pick up v0.2.2 through `git merge main`** (`dl-035-task-branch-sync-with-main`),
  never by rebase.

The approver weighed three options at the retrospective gate and confirmed (a):

- **(a) Partial freeze.** This is the rule above. v0.3 proceeds in parallel on planning. Its code,
  package manifest, publish workflow and user documentation wait for the `v0.2.2` tag.
- **(b) Total freeze.** No v0.3 merge reaches `main` until v0.2.2 is tagged. It is the simplest
  option, but in practice it is not parallel work.
- **(c) A patch branch cut from the `v0.2.1` tag** (`hotfix/v0.2.2`). That is git-flow: it
  contradicts `dl-002` point 3 and would need a decision-log that supersedes it. It was declined.

## Decision

**The parallel-release rule above is adopted as stated** for every patch that runs while the next
minor is in flight; for v0.2.2 it is already the approver's ruling. What stays open is how the patch
itself is tracked.

**Q1 — the tracking element:**
- **(A) a `release` element per patch.** `types.release.id_pattern` gains a patch form (for example
  `patch-{version}` → `patch-v0.2.2`), and the element carries an optional `patch-of: minor-v0.2`.
  The patch runs the ordinary `release-cycle` phases and has its own plans under
  `docs/05_plans/rl-v1/rel-v0.2.2/`. The released minor stays untouched.
- **(B) a record against the released minor.** The patch is written into `minor-v0.2`'s body and
  plans, and no new element exists. `minor-v0.2` is terminal, so every patch becomes a body edit of a
  `released` element that `memory history` cannot see (the gap `dl-108` describes).
- **(C) a dedicated patch workflow.** A reduced `patch-cycle` sub-workflow (for example scope →
  dev-loop → e2e-smoke → release-submit → release-publishing, with no user-docs or retrospective
  phase), driven by the element (A) provides.

**Q2 — which release-cycle phases a patch runs** (only under (A) or (C)):
- **(i) all of them**, as a minor does;
- **(ii) all but `retrospective`**, whose findings fold into the next minor's retrospective
  (`dl-089` already reports D01 as `not-comparable` for patches);
- **(iii) a declared subset per patch**, fixed in its `release-planning` plan.

**Recommendation:** Q1 (A), Q2 (ii).
- **Q1 (A):** v0.2.2 is a release in size and shape, so it gets the element releases already have: a
  state `release-planning` can stamp tasks against (`release: "v0.2.2"`, `dl-016`), phases that can be
  deduced from it, and an approval history `memory history` reads. (C) is worth its cost only if
  small hotfixes become frequent; it can be added later on top of (A)'s element.
- **Q2 (ii):** the patch's lessons are few and belong to the release whose work it interleaves with.

## Rationale

- **A terminal state should stay terminal.** (B) would make `released` mean "released, then changed",
  and every patch would be invisible to the verbs.
- **The parallel rule protects the patch, not the minor.** While v0.2.2 is open, `main` is what gets
  tagged and published. Letting v0.3 code or manifest changes in would publish them in a patch that
  promises no behaviour change; letting Memory and process documents in costs nothing, because the
  package ships only `dist` and `README.md` (`node -p "require('./package.json').files"` →
  `[ 'dist', 'README.md' ]` at `a20b346c`).
- **Starting v0.3 after step 2** means both releases write Memory at the new configuration root, so
  nothing v0.2.2 creates has to be migrated.

## Actions

- [ ] Ratify, choosing Q1 and Q2 (owner: approver). This is step 1 of the v0.2.2 implementation
      order, before the configuration moves to the root. The choice goes in the approve commit's
      `Reason:`.
- [ ] On `ready`, under (A): amend `memory.yaml` `types.release` (`id_pattern`, optional `patch-of`,
      `[AUTHORING]` annotations citing this decision-log) and the `release` template; register
      `patch-v0.2.2` (`memory.add` → `submit`) and hand it to `release-cycle`. Under (C): add
      `workflows/custom/patch-cycle.yaml` and register it in `workflows.yaml`.
- [ ] Add the parallel-release rule to `dl-002`'s successor text or to the `git-conventions`
      directive proposed by `dl-119`, so it binds every later patch, not only v0.2.2.
- [ ] Tasks are derived by v0.2.2 `release-planning` (`build-backlog`), not created here.

## Relations

- **Origin:** `retro-v0.2`; `retrospective-rel-v0.2-plan` §6.7 (the v0.2.2 gates) and §6.8
  (implementation order).
- **Builds on:** `dl-002` (trunk-based, point 3), `dl-035` (merge `main`, never rebase),
  `dl-016` (the `release` field `build-backlog` stamps).
- **Related:** `dl-089` (D01 `not-comparable` for patches), `dl-108` (amending a terminal element),
  `dl-119` (git conventions), `dl-091` and `dl-093` (the other v0.2.2 gates).
- **Traceability:** P1.13 (the `release` type and its machine); REQ-STATE-01 (legal transitions).

**Note (2026-10-24, dl-167 Action 3; task-300).** Q2 (ii) folds a patch's findings into the next minor's
retrospective; `dl-167` (option (a), approve `94a5a2c3`) rules that this includes the improvement proposals of the
patch's own `release-health` run (`dl-089`). The next minor's retrospective `explore` reads the report
`docs/08_health/release-health-<patch version>.md` of every patch released since the previous retrospective, and its
`additional-points` gate disposes of each `RH-<patch version>-NN` proposal with one of the four outcomes of
`proposals.disposed` (`retrospective.yaml` 1.7, `task-300`). The Decision above is unchanged.
