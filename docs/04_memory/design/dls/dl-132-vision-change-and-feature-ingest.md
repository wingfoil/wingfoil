---
id: dl-132-vision-change-and-feature-ingest
type: decision-log
title: "After inception the vision can only be changed by hand and a new feature has no way in; one vision-change process, with a feature ingest as its special case, records the change as a Memory element, analyses its impact along the traceability chain, downcasts only the delta and ends with the change assigned to a release"
status: ready
context: "planning"
release: "v0.3"
contributor: ""
credit: ""
tmpl_version: 260703
---

## Context

Filed from v0.3 `release-planning` (approver ruling, 2026-09-29, v0.3 release-planning
(`release-planning-rel-v0.3-plan`, step 3, idea 2)). The approver accepted the problem and the shape of
the answer: one process, with a feature ingest as its special case. The options below are open.

**What the workflows allow today.**
- The startable mains are `sw-life-cycle` and four ingest workflows, `bug-ingest`,
  `decision-log-ingest`, `adr-ingest` and `service-ingest`:
  `grep -m1 '^kind:' .wingfoil/workflows/custom/*.yaml` gives `kind: main` for exactly those five and
  `kind: sub` for the other eighteen. `.wingfoil/workflows.yaml:15-20` includes the same five as
  "Startable main workflows".
- The vision and specification workflows are subs that run once, inside `sw-life-cycle`: its
  `inception` phase includes `lean-inception` and its `specification` phase includes
  `specification-downcast` (`.wingfoil/workflows/custom/sw-life-cycle.yaml:19-25`), which in turn
  includes `user-story-mapping`, `specification-by-examples`, `volere-requirements` and
  `backlog-export` (`specification-downcast.yaml:13-37`).
  `grep -rln "lean-inception\|specification-downcast\|user-story-mapping\|specification-by-examples\|volere-requirements" .wingfoil/workflows/custom/`
  finds no other workflow that includes them.
- No phase after inception writes the vision: `grep -rln "docs/01_vision" .wingfoil/workflows/custom/`
  → `lean-inception.yaml` only. `release-planning`'s `define-scope` produces only the release element
  (`release-planning.yaml:38-46`).

**What happens instead.** The vision is changed by hand, with a decision-log as the only support.
- `git log --oneline -- docs/01_vision` lists 15 commits and none is a `wf(...)` commit
  (`git log --format='%h %s' -- docs/01_vision | grep -c '^.\{9\}wf('` → `0`).
- In this very planning, `define-scope` moved P4.18–P4.20 from v0.3 to v0.4 by editing
  `06_features.md`, `07_sequencer.md` and `08_mvp-canvas.md` directly (commit `2a7ee7e7`, approver
  ruling R3). The US, BDD and SARD layers under those features were not checked by any step.
- `dl-112-positioning-as-a-governance-layer` (`ready`, v0.3) and
  `dl-113-personas-revisited` (`ready`, v0.3) each end with vision edits in their Actions, and the
  `dl-131-determinism-index-scope`, lists edits to five
  vision documents and a probable new SARD requirement. No workflow applies them, checks what they
  touch below the vision, or makes sure they reach a release.
- `dl-096-schedule-rebaseline-on-active-days` placed release budgets in the vision documents (Q1 (a),
  approve commit `da6df934`), so a scope change that moves features also moves budgets.

**What contributors are told.** `COLLABORATION.md` (`dl-020-contribution-model`) asks contributors to
file intent as Memory artifacts and offers four: bug, decision-log, ADR, tech-spec
(`COLLABORATION.md`, section *What you can contribute*). None is a feature request.
`.wingfoil/memory.yaml` declares nine types (`release-line`, `release`, `task`, `adr`, `decision-log`,
`tech-spec`, `bug`, `plan`, `service`) and none is a feature or a change to the vision. `dl-020`'s
own Context quotes the README inviting "feature requests" as GitHub issues, which is the channel the
contribution model replaced.

## Decision

**One process, not two.** A new feature is a change to the vision: a new row in
`docs/01_vision/06_features.md`, and possibly a journey, a persona or a sequencer entry. So the
project has one **vision-change** process, and the feature ingest is its most common case. It has
five elements.

1. **A Memory element records the change** (type per Q1), with its own state machine, for example
   `draft → in-analysis → accepted → scheduled`, plus `deprecated` as for every type. `in-analysis`
   is the approval gate (`reject → draft`), `scheduled` is reached when a release carries it.
2. **Impact analysis along the traceability chain.** Before acceptance the element names what it
   touches at each layer: the feature ids (P*), the user stories (US-*), the BDD feature files, the
   SARD requirements (REQ-*) and any tasks or ADRs/specs already delivered against them. The chain is
   the one the `traceability` directive maintains; the analysis is its reverse walk.
3. **Incremental downcast.** The existing sub-workflows (`user-story-mapping`,
   `specification-by-examples`, `volere-requirements`) run **scoped to the delta**: they add or amend
   only what the analysis named, and their stop-checks apply to the delta. Nothing is regenerated
   wholesale.
4. **Mandatory exit: a release.** The process ends only when the change is assigned to a release in
   the sequencer and in that release's element (`features:`), so `release-planning`'s `define-scope`
   finds it like any other scoped item. A change that is accepted but not assigned is not done.
5. **Document versioning.** Every touched vision and requirements document gets its `doc-versioning`
   bump, and `docs/01_vision/00_index.md` is updated in the same commit.

**Q1 — The Memory type:**
- **(a)** a new `change-proposal` type, for every vision change, of which a feature request is a
  case (a `kind: feature | vision` field distinguishes them);
- **(b)** a `feature-request` type for features only; other vision edits keep going through a
  decision-log;
- **(c)** no new type: a decision-log with `kind: vision-change`, and the process keyed on that field.

**Q2 — Scope of the downcast:**
- **(i)** every layer (USM → BDD → SARD) is re-run for the delta, even when the analysis finds nothing
  to change there;
- **(ii)** only the layers the impact analysis names are run; the others record "no impact" in the
  element.

**Q3 — When it lands:**
- **(x)** this decision-log in v0.3, and the type plus the workflow configuration in v0.3 as well:
  a `memory.yaml` type, a template and one `vision-change` main that includes the existing subs. This
  is configuration only, no code;
- **(y)** the decision-log in v0.3, the type and workflow in a later release, applying the pending
  vision edits by hand meanwhile.

**Recommendation: Q1 (a), Q2 (ii), Q3 (x).**
- **Q1 (a)** keeps one process for one kind of change, gives contributors the missing fifth row in
  `COLLABORATION.md`, and gives the change a state machine of its own. (b) splits the process the
  approver asked to keep whole; (c) overloads a type whose machine ends at `ready`
  (`memory.yaml:152`) and has no `scheduled` state, so the mandatory exit could not be expressed.
- **Q2 (ii)** is cheaper and still traceable: "no impact" is itself recorded, so a skipped layer is a
  decision, not an omission.
- **Q3 (x)** because the cost is configuration: `REQ-SYS-04`'s fit criterion says a new type with
  custom states in `memory.yaml` "is honored by `submit`/`approve`/`reject` with no source-code
  change" (`docs/02_requirements/03_sard/01_architecture.md:43-49`), and workflows are YAML. Until
  the workflow engine exists the new main runs, like every other, through a phase plan (`dl-019`).
  The first users are already waiting (Relations).

## Rationale

- **The vision is Approved and still changes.** Since the v0.2 retrospective, three `ready`
  decision-logs (`dl-096`, `dl-112`, `dl-113`) and `dl-131` change it. Without a process, each
  edit relies on the editor remembering the layers below.
- **A feature ingest is the vision change contributors ask for most.** Treating it as a separate
  process would duplicate the impact analysis and the downcast.
- **The exit is what makes it deterministic.** A change that reaches the vision but not a release is
  the gap this process closes; `define-scope` only sees what a release element lists.
- **Reuse over new machinery.** The downcast sub-workflows exist and have stop-checks; scoping them to
  a delta reuses them.

Alternatives considered:
- **Re-run inception and specification in full for each change.** Rejected: it regenerates approved
  documents that did not change and loses their history.
- **Keep editing by hand with a decision-log.** Rejected: that is the current state, and it has no
  impact analysis and no guaranteed exit.

## Actions

1. **Ratify, choosing Q1–Q3.** Owner: approver, at `release-planning`'s `reconcile-governance` gate.
2. **`.wingfoil/memory.yaml`**: the new type (per Q1) with path, `id_pattern`, template and state
   machine; `.wingfoil/memory/templates/`: its scaffold, with sections for the change, the impact
   analysis per layer and the target release.
3. **`.wingfoil/workflows/custom/`**: a `vision-change` main (startable, per `dl-109`), whose phases
   are capture → impact analysis (⛔ accept) → scoped downcast → schedule, including the existing
   subs; `.wingfoil/workflows.yaml` includes it.
4. **`COLLABORATION.md`**: a row for the new type in *What you can contribute*.
5. **Traceability:** a feature id for the process in `06_features.md`, with its US, BDD and REQ, is
   the first thing the process itself produces (proposed, not written here).
6. **Tasks are derived by v0.3 `build-backlog`**, not created here.

## Relations

- **Origin:** approver ruling, 2026-09-29, v0.3 release-planning (`release-planning-rel-v0.3-plan`,
  step 3, idea 2).
- **Extends:** `dl-020-contribution-model`: the contribution model gains the feature request it lacks.
- **First users:** `dl-112-positioning-as-a-governance-layer`, `dl-113-personas-revisited` and the
  `dl-131-determinism-index-scope`, whose vision edits the process applies.
- **Related:** `dl-096-schedule-rebaseline-on-active-days` (budgets live in the vision documents, so
  the schedule step updates them); `dl-109-startable-and-includable-workflows` (a `kind: sub` may already be included by
  any phase, so the new main needs nothing from it; it matters only if a single downcast layer is also
  to be started on its own);
  `dl-105-recurring-and-schedulable-phases` (a periodic review of pending changes could be a
  recurring phase of the new main).
- **Traces to:** P1.13 and `REQ-SYS-04` (a new type by configuration,
  `docs/02_requirements/02_bdd/features/p1-memory/P1.13-memory-element-schema.feature`); P4.1 and
  P4.16 with `REQ-SYS-06` (a new main composed with `include:`,
  `docs/02_requirements/02_bdd/features/p4-workflow/P4.1-workflow-config.feature`,
  `P4.16-include-composition.feature`).

**Note (2026-10-12, approver ruling 2026-10-10 item 5 on `task-212` decision 4, and rulings 2026-10-12 D1 (c), D2;
`task-277`).** Element 4's "in that release's element (`features:`)" is met by `release-planning`'s `define-scope`,
which sweeps the `scheduled` change-proposals whose `release` is the release in planning into its `features:`, as
`dl-016` sweeps decision-logs and bugs into scope. `vision-change`'s `schedule` stamps the change-proposal's
`release` and writes the sequencer entry; it no longer edits the release element. On a release already past `draft`
the sweep is a `memory amend` of the release by the approver, or a hand `wf(release): amend` on the approver's
instruction while `memory amend` refuses a release with no `kind:`. The sweep is declared as the unbound `define-scope` post-check
`change-proposals.swept(…)` (`release-planning.yaml` 2.0), which `dl-166` Q2 may bind. The Decision above is
otherwise unchanged.
