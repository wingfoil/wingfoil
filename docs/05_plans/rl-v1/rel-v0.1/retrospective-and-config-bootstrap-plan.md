---
id: "retrospective-and-config-bootstrap-plan"
type: plan
title: "Retrospective — v0.1, with the config bootstrap for v0.2"
status: done
workflow: "retrospective"
phase: "rel-v0.1"
element: "minor-v0.1"
parent: "release-cycle.retrospective"
release: "v0.1"
tmpl_version: 261010
---

# Plan — v0.1 Retrospective + exceptional config-bootstrap → resume at v0.2 release-planning

**Audience:** the agent that will run the v0.1 `retrospective` and every step up to (and enabling) the
**v0.2 `release-planning`**. This plan is the §6-interim substitute for the workflow engine: execute
against it, coherently with `retrospective.yaml`, `release-cycle.yaml`, `release-line-cycle.yaml`, and
the governance DLs it approves and implements.

---

## 0. Position & preconditions (verified on `main`)

- `rl-v1` `active`; `minor-v0.1` **`released`** (paper release — `release-publishing` was **skipped**
  per `dl-018`; no npm publish, no `v0.1` git tag). `release-submit` complete (`5b16ab6`, `2764f7f`).
- All 33 tasks (`task-001..033`) `done`. Suite green, `tsc` 0.
- **Not yet done:** the `retrospective` phase (last phase of `minor-v0.1`'s `release-cycle`). No
  `retro-v0.1` DL exists yet.
- Governance DLs all **`in-discussion`**: `dl-013`, `dl-014`, `dl-015`, `dl-016`, `dl-017`, `dl-018`.
- Deferred, still `open`: `bug-004` (dna set strips YAML comments), `bug-006` (init directive scaffold
  schema-invalid). `bug-005` fixed in code but its file may still read `open` — verify + close.
- Git tree note: phase branches follow `design/<phase>_<version>`, task branches `task/task-NNN-slug`,
  all merged to `main` via `git merge --ff=false`. A stray malformed tag `1` exists (accidental) and
  is cleaned up in B10.

**Goal of this plan:** close v0.1 with a retrospective; in the same window, *exceptionally* approve and
implement the five workflow-shaping DLs (`dl-013..017`) **plus the spin-off DLs surfaced by the
retrospective** (`dl-019`, `dl-020`, `dl-022`, `dl-023`, `dl-024`) out-of-flow, so that when normal
delivery resumes, v0.2's `release-planning` already carries `triage-bugs` + `reconcile-governance` and
the improved `dev-loop`. Everything **not** implemented here (`dl-018`, `bug-004`, `bug-006`, `bug-007`)
is then reconciled *normally* by that updated v0.2 `release-planning`.

**This revision adds** (beyond the original `dl-013..017` bootstrap):
1. An explicit **explore** step (A1) mining the *Execution Notes* of every v0.1 Memory doc for friction.
2. An **approver gate** (A2) where Roberto injects further retrospective analysis points.
3. **`dl-019-plans-as-memory-element`** — phase plans (`docs/05_plans/`) as a Memory type (step B6).
4. **`dl-020-contribution-model`** + root **`COLLABORATION.md`** — contribute via Bug/DL/ADR/TechSpec
   instead of code; AI-generated output credited to the contributor (step B7).
5. **`dl-022-spec-review-gate`** — a spec must pass a consistency review before `approved`/`accepted`
   (A1 finding T2) (step B8).
6. **`dl-023-init-cli-e2e-smoke-gate`** — a standing fresh-init + CLI end-to-end smoke gate before
   submit (A1 findings T5+T7) (step B9).
7. **`dl-024-git-branch-tag-conventions`** — one branch per phase; the version tag is created on
   `main`, never on a phase branch (Roberto's git rules N1/N2) (step B10).
8. **T1 (test strategy)** folded into `dl-014` + the `testing` directive — classify each AC as
   red-first vs characterization (step B4).
9. **`bug-007`** filed for the commander-ESM-under-Jest test-harness limitation (A1 finding T7b); v0.2.
10. **T11 path normalization** — rename `planning/rl-v1/` → `planning/rl-v1/` (step B12).
11. **Codifying (1)+(2) into `retrospective.yaml`** so every future retrospective carries them (B11).

> **Per-DL approval for THIS retrospective (not a new global rule).** For the DL batch this plan
> generates, the agent **explains each DL to Roberto and waits for his explicit approval** before A5.
> This is a measure for this exceptional bootstrap only — it does **not** become a standing rule; the
> normal no-self-approval discipline (§8) already governs every future approval.

---

## 1. Global rules the agent MUST honor

1. **No self-approval.** Every `memory.approve` / `memory.reject` / `memory.deprecate` (approve-gated)
   runs **only when the `approver` (Roberto) explicitly instructs it**, with `Approver:` + `Reason:`
   in the commit body (CLAUDE.md §5.1/§8). The agent *drafts* and *stages*; Roberto authorizes the
   transition commit. Do not batch-approve autonomously.
2. **One commit per memory operation, scoped to one element type** (§5.1). Multiple ids of the *same*
   type + *same* transition may share one commit (`wf(decision-log): approve dl-a, dl-b [X → Y]`).
3. **DLs terminate at `ready`.** Once `dl-017` is applied, `decision-log` has **no `in-develop`/`done`**
   — `ready` is terminal. **Ignore** the `ready → in-develop → done` bullets at the bottom of
   `dl-013`/`dl-014`/`dl-015`'s Actions (they predate `dl-017`); these DLs stay at `ready`.
4. **One branch per phase** (`dl-024`, following the existing git tree). Phase A (retrospective) runs on
   `design/retrospective_v0.1`; Phase B (config-bootstrap) on `design/config_bootstrap_v0.2`. Each is
   merged into `main` with `git merge --ff=false`. Config-bootstrap is out-of-flow but real work — it is
   NOT scheduled through `build-backlog` (it is the meta-change that makes `build-backlog` able to
   schedule such things).
5. **Determinism + traceability + no-CLAUDE.md-as-source** in every edit. Each config change traces to
   its DL / REQ, never to CLAUDE.md.
6. **The DLs are the source of truth** for their own change lists — implement each DL per its `##
   Decision` + `## Actions (On ready)`. The summaries below are for scope/sanity-check, not a
   replacement.
7. **Delegate independent, read-only, or mechanical work to parallel subagents on the cheapest model
   that preserves precision** (see the strategy below); schema-critical or approval-gated work stays
   on a capable model and is **never** parallelized across a shared git commit — one commit per memory
   op (§5.1), so parallel agents must never co-author a single commit.

---

## Execution — subagents & model selection

Fan work out to parallel subagents to cut wall-clock and cost without losing correctness. Rule of
thumb: **mining/search → cheap model; authoring/schema edits → capable model; approvals → never
delegated.**

- **A1 explore = the prime parallel target.** Fan out **read-only Explore subagents** (model
  **Haiku 4.5** — mechanical extraction of `## Execution Notes`), each mining a **disjoint batch** of
  sources so they never touch the same files: e.g. `task-001..011` / `task-012..022` / `task-023..033`,
  one agent for `bugs/bug-*.md`, one for the six governance DLs + the `minor-v0.1` release doc +
  the `rel-v0.1` plan outcomes. Each returns a **structured friction list** (theme + citing doc id).
  Then **one synthesis agent** (model **Sonnet 5**, Opus for the final pass) dedups + groups the merged
  inventory into the A3 capture. *(This step is already complete — see
  `scratchpad/friction-inventory-v0.1.md`, the 12-theme inventory.)*
- **Phase B parallelization.** Steps that edit `.wingfoil/memory/templates/` (**B2**, **B6**, **B7**)
  must **serialize their template writes** (or run each in `isolation: worktree`). The directive/
  workflow-only steps (**B8** spec-review, **B9** e2e-smoke, **B10** git conventions, **B11**
  retrospective.yaml) are mutually independent → parallel. **B1**–**B5** keep their couplings
  (`dl-017 → dl-016`, `dl-013 → dl-014`, `dl-015` last) → **ordered**. Model per task: schema/spec-
  critical edits (`memory.yaml`, `spec-001`, workflow coherence) → **Opus/Sonnet**; prose
  (`COLLABORATION.md`, directives) → **Sonnet**; mechanical migrations/renames → **Haiku**. Each
  subagent commits its own scoped op.
- **Never delegated:** every `memory.approve` / `reject` / `deprecate` remains Roberto's, single-threaded
  (§5.1/§8). Subagents only *draft*, *mine*, and *stage*.

---

## Phase A — Retrospective (`retrospective.yaml`) — branch `design/retrospective_v0.1`

### A1 · explore — role: facilitator + qa  *(the exploring step — DONE)*
Systematically mine the `## Execution Notes` of **every v0.1 Memory document** to surface process
friction — the raw evidence base for the retrospective. **Read-only, no state change**; feeds A3.

- **Sources swept (exhaustive):** all 33 `docs/04_memory/v0.1/task-*.md` (Execution Notes);
  the bug files `docs/04_memory/bugs/bug-*.md`; the six governance DLs (`dl-013..018`); the
  `minor-v0.1` release doc `docs/04_memory/planning/rl-v1/minor-v0.1.md` *(dir normalized to
  `rl-v1/` in B12 — T11)*; the outcome sections of `docs/05_plans/rl-v1/rel-v0.1/*`.
- **Extracted:** plan deviations, blockers, scope surprises, review rejection reasons, honest-TDD notes,
  tooling immaturity/verification-only work, forward-reference / inter-task dependency friction,
  path/naming inconsistencies.
- **Output:** a **12-theme friction inventory** (each learning cites its source doc) in
  `scratchpad/friction-inventory-v0.1.md`. Executed via 5 parallel Haiku Explore agents + Opus synthesis.

### A2 · additional-points gate — role: approver (Roberto)  *(the "add more points" gate — DONE)*
A checkpoint after A1 so Roberto can widen the retrospective before it is written. **Review checkpoint,
not an approval-gated transition** (no commit). Resolved this run:
- Promote to new DLs: **T2 → `dl-022`** (spec-review gate); **T5+T7 → `dl-023`** (init+CLI e2e smoke gate).
- **T1 → fold into `dl-014`** + the `testing` directive (not a new DL).
- Roberto's git rules **N1/N2 → `dl-024`** (branch per phase; tag on main).
- **T7b → `bug-007`** (commander-ESM-under-Jest); **T11 → rename** `planning/rl-v1/`→`rl-v1/`.
- **Dropped for this retrospective:** the "submit adds content" point (former `dl-021`) — deferred.

### A3 · capture — role: facilitator
- `memory.add(type: decision-log, title: "Retrospective v0.1")` → `retro-v0.1.md`
  (`docs/04_memory/design/dls/retro-v0.1.md`), then `memory.submit` (`draft → in-discussion`).
  Two commits: `wf(decision-log): add retro-v0.1` then `wf(decision-log): submit retro-v0.1`.
- Frontmatter: `context: retrospective`, `release: v0.1`.
- **Body — synthesize the A1 inventory + A2 decisions** into went-well / what-didn't / **action items**,
  each learning citing its source doc. Cover at least: paper release (`dl-018`); tool immaturity /
  verification-only (much of v0.1 was characterization, not red-first — T1); specs reaching `approved`
  with contradictions (T2); `init` scaffolds schema-invalid config caught only at the last task
  (T5/`bug-005`/`bug-006`); CLI under-tested / ESM-Jest gap (T7/`bug-007`); process debt accumulated as
  `dl-013..017` never reconciled; what went well (autonomous waves under standing authorization,
  opus-review-as-gate). Action items MUST reference `dl-019/020/022/023/024`, the `retrospective.yaml`
  codification, and the T11 rename.
- **Draft the spin-off governance DLs** via `decision-log-ingest` (inherits the active `minor-v0.1`),
  each `memory.add` + `memory.submit` (`draft → in-discussion`), one commit pair per DL:
  - **`dl-019-plans-as-memory-element`** — phase plans as a Memory type (drives B6). Rec. machine
    `draft → active → done`; path under `docs/05_plans/`.
  - **`dl-020-contribution-model`** — AI-mediated contribution model + `COLLABORATION.md` +
    `contributor`/`credit` frontmatter (extends ADR-006) (drives B7).
  - **`dl-022-spec-review-gate`** — a `tech-spec`/`adr` must pass an internal + cross-spec + BDD-
    alignment + traceability review before `approved`/`accepted` (drives B8; cites T2 evidence:
    spec-009 self-contradiction, spec-006↔spec-004 conflict, spec-008↔BDD drift).
  - **`dl-023-init-cli-e2e-smoke-gate`** — a standing fresh-init + CLI-surface end-to-end smoke test as
    a release gate before submit (drives B9; cites T5/T7; does not duplicate `bug-004/005/006`).
  - **`dl-024-git-branch-tag-conventions`** — one branch per phase (`design/<phase>_<version>`,
    `task/<id>` for dev-loop) merged `--ff=false`; the `vX.Y` tag is created on `main` after the release
    branch merges, never on a `design/release_*` branch (drives B10; cites N1/N2).
- **File `bug-007`** via `bug-ingest` (`draft → open`): "commander v15 is ESM-only → CLI wiring
  (`program.ts`/`cli.ts`) is untestable under the CommonJS Jest runtime." Deferred to v0.2 triage
  (Phase C). Not fixed here.

### A4 · approve retro — role: approver (Roberto)
- On Roberto's instruction: `memory.approve retro-v0.1 [in-discussion → ready]`. One commit,
  `Approver:`/`Reason:` body.

### A5 · EXCEPTIONAL governance approval (the bootstrap gate) — role: approver (Roberto)
Out-of-flow substitute for the not-yet-existing `reconcile-governance` phase. Approves the **five
workflow-shaping DLs** plus the **five spin-off DLs** drafted in A3; `dl-018` is deliberately excluded
(see Phase C). **Prerequisite:** per the A3 measure, Roberto has explicitly approved **each** DL
individually — this A5 commit only records transitions already signed off.

- **Resolve the open questions first** (settle *before* `ready`; embed in the `Reason:`):
  - `dl-017`: ratify **Option B** (remove `in-develop`/`done`). *Required* — `dl-016` depends on it.
  - `dl-016` (a) sweep accumulated `pending` ADRs in `reconcile-governance`? **Rec: yes** (idempotent;
    no `pending` ADRs today). (b) ingest-time `release` stamping: **defer**.
  - `dl-015` (a) design-phase read = **hard gate** (blocks `red`), rec. (b) `depends_on` authored at
    **planning time**, discovery-during-design may append. Rec.
  - `dl-019`: adopt `plan` as an **[AUTHORING]** Memory type; machine `draft → active → done`; existing
    plans **grandfathered**.
  - `dl-020`: adopt the contribution model + `COLLABORATION.md`; credit via `contributor`/`credit`
    **layered on** ADR-006 (no git-history rewriting).
  - `dl-022`: adopt the spec-review gate at the `tech-spec`/`adr` approval transition.
  - `dl-023`: adopt the fresh-init + CLI e2e smoke gate before `release-submit`; **staged** — start as
    warn, flip to hard-reject once green (mirrors the B-DECISION posture).
  - `dl-024`: adopt branch-per-phase + tag-on-`main`; delete the stray tag `1`.
- On Roberto's instruction, one commit:
  `wf(decision-log): approve dl-013, dl-014, dl-015, dl-016, dl-017, dl-019, dl-020, dl-022, dl-023, dl-024 [in-discussion → ready]`
  with `Approver:` + a `Reason:` citing: exceptional bootstrap to update the workflow config before
  v0.2 resumes; the open-question resolutions above.

> After A5 the **ten** DLs are `ready`. Retrospective phase is complete; `minor-v0.1`'s `release-cycle`
> is closed. Merge `design/retrospective_v0.1` → `main` (`--ff=false`), then start Phase B.

---

## Phase B — Extra config-bootstrap dev phase (out-of-flow) — branch `design/config_bootstrap_v0.2`

Scoped commits per DL; `git merge --ff=false` into `main` at the end.
**Order matters** (couplings): `dl-017 → dl-016`, and `dl-013 → dl-014`; `dl-015` last.

### B1 · Implement `dl-017` (DL machine reduction) — FIRST
- `memory.yaml` `decision-log.states` → `sequence: [draft, in-discussion, ready]`,
  `gates: { in-discussion: { reject: draft } }`, `waiting: [ ]`. `deprecated` stays a
  `memory.deprecate` target.
- Update `spec-001` (memory.yaml schema) to document the reduced DL machine.
- Amend `dl-012` body: strike the `in-develop`/`done` rows + the "back-reference" sentence; mark
  **partially superseded by `dl-017`**. *(Body edit to an existing `ready` DL, not a state change.)*
- Update the `decision-log` row in **CLAUDE.md §5** to the reduced machine.

### B2 · Implement `dl-016` (release-planning governance-reconcile) — after B1
- **`release` field scheme:** add `release` to `adr` + `tech-spec` templates/schemas; on `bug`, rename
  the existing `release` ("found in") → **`release-origin`** and add a new `release` ("fix/impl
  release"); `decision-log.release` keeps the clarified meaning. Migrate existing `bug-001..007`.
  Edit templates under `.wingfoil/memory/templates/` + `memory.yaml` + the relevant spec schemas.
- **`release-planning.yaml`** new sequence:
  `define-scope → triage-bugs → reconcile-governance → record-adrs → identify-specs → build-backlog → commit-backlog`
  - `triage-bugs` (tech-lead, gate approver, reject→closed): in-scope `open` bugs → `open → triaged`.
  - `reconcile-governance` (product-owner/approver, gate approver, reject→draft, **idempotent** on
    pre-gate elements): sweep in-scope not-ready governance → DL `in-discussion → ready` (+ optional
    ADR `pending → accepted`).
- **`record-adrs`**: add `memory.approve` (`pending → accepted`) so tasks never cite an unaccepted ADR.
- **`build-backlog`**: convert each in-scope `ready` DL into task(s) (**DL stays `ready`**); per
  `triaged` bug create fix-task + `bug.set_state(planned)`; **stamp `release = {planning}`** on every
  included DL, bug, tech-spec, adr, task.
- **Selection filter** (`release` empty OR `== {release in planning}`) wired into `triage-bugs`,
  `reconcile-governance`, `build-backlog`.
- Update the `traceability` directive if the `release`/`release-origin` fields need a cross-ref rule.

### B3 · Implement `dl-013` (documentation-process gate) — before B4
- `.wingfoil/directives/custom/documentation.md`: add the two rules — (i) every public/exported symbol
  carries TSDoc, TypeDoc builds clean, `dev-loop` review rejects undocumented public elements; (ii)
  user-facing docs (README, user guide, CLI ref, examples, CHANGELOG) aligned before `release-submit`.
- New `user-docs.yaml` sub-workflow (`kind: sub`, `element: release`): pre-check
  `all tasks where tags=[{release.version}] are status: done`; `produces:` the user-facing docs. Include
  it in `release-cycle.yaml` **between `implementation` and `submit`**.
- (Low priority) note in the rel-v0.1 plans that v0.1's user-docs were satisfied retroactively by
  `task-032`; the phase applies from v0.2 on.

### B4 · Implement `dl-014` (dev-loop deltas; supersedes `dl-002`) + T1 test-strategy — after B3
- `dev-loop.yaml`: `start` → `git.create_branch("task/{task.id}")` +
  `git.create_worktree("task/{task.id}")`; `done` → `git.merge(to: main, ff: false)` +
  `git.remove_worktree` + `fallback: { step: red, set_state: in-progress }`; `refactor.checks.post`
  += `docs.api.public-complete`, `docs.api.build` (**G5 — depends on B3's directive text**).
- `dna.yaml` `stacks.technologies` += **TypeDoc**.
- `task-001` scope note: TypeDoc + doc-coverage tooling.
- **T1 (test-strategy classification, folds A1 finding T1):** `dev-loop` `design` classifies each AC as
  **red-first** (behavior is new) vs **characterization** (behavior pre-exists); amend the `testing`
  directive to legitimize characterization for verification tasks (no fabricated red, no dead code) and
  require the classification be recorded in the task's Execution Notes.
- **Deprecate `dl-002`** — on Roberto's instruction:
  `wf(decision-log): deprecate dl-002 [ready → deprecated]` (Reason: superseded by dl-014).

### B5 · Implement `dl-015` (inter-task dependency notes) — last
- `task.template` (`memory.yaml`): add `depends_on:` (and/or `related_tasks:`) frontmatter list.
- `dev-loop.yaml` `design`: add `agent.read_related` loading the Execution Notes of every `depends_on`
  task; hard-gate `red` on it.
- `traceability` directive: make the cross-ref check explicit about `depends_on`.
- Backfill `depends_on` for the known v0.1 forward-refs: task-016→task-011; task-021→task-008;
  task-026→task-008; task-030→task-009,task-011; task-032→task-007.

### ⚠️ B-DECISION — the `dl-013`/`dl-014` code/tooling tail (needs Roberto's call)
Turning the review gate to **hard-reject on undocumented public symbols** requires TypeDoc wired +
doc-coverage tooling + **TSDoc backfilled across all existing v0.1 public exports** — real code work
that would otherwise block *every* v0.2 dev-loop from day one.
- **Option 1 (full):** TSDoc backfill + TypeDoc/coverage wiring here, then flip the gate immediately.
- **Option 2 (staged, RECOMMENDED):** land the directive text, `user-docs` phase, dev-loop wiring, and
  the TypeDoc *dependency* here, but keep the `docs.api.*` checks as **warn / scoped-to-new-code** until
  a dedicated **v0.2 task** completes the backfill; flip to hard-reject when green.

Record whichever Roberto picks in `retro-v0.1` (or as an Action on `dl-013`). *(The same staged posture
applies to `dl-023`'s smoke gate.)*

> **B6–B11 are the retrospective-surfaced bootstrap steps.** Template-touching steps (**B2/B6/B7**)
> serialize their writes; the rest parallelize. Each commits its own scoped op.

### B6 · Implement `dl-019` (plans as a Memory element) — traces to `dl-019`
- **`memory.yaml`**: add a `plan` type — `path: "docs/05_plans/{...}/{id}.md"` (keep the `rl/rel`
  nesting for lifecycle plans; `X_*` ad-hoc plans **grandfathered**), `id_pattern`, `name`/`description`/
  `tags`, `template.file: .wingfoil/memory/templates/plan.md`, a `states` machine
  `sequence: [draft, active, done]` + `waiting: [active]` (`active → done` when the phase's
  `produces:`/`checks` are satisfied) + `deprecated`/`superseded` retire targets. Annotate
  `[SPEC]`/`[AUTHORING]` per §9 — **[AUTHORING]** type (cite `dl-019`).
- New **`.wingfoil/memory/templates/plan.md`**: frontmatter (`id`, `type: plan`, `title`, `status`,
  `version`, `workflow`, `phase`, `element`, `release`) + the Context/phases/handoff body skeleton.
- **Workflow wiring**: make the §6-interim "write a plan file" step explicit as `memory.add(type: plan)`
  bound to the producing phase (in `workflows.yaml` / the relevant sub-workflows).
- **Docs**: update CLAUDE.md §2 doc-map + §5 element-table + §6-interim note to include `plan` /
  `docs/05_plans/`; update `spec-001`. Existing plans grandfathered.

### B7 · Author `COLLABORATION.md` + implement `dl-020` (contribution model) — traces to `dl-020`, ADR-006
- New repo-root **`COLLABORATION.md`**: contribute *through Memory artifacts instead of code* — file a
  Bug / Decision-Log / ADR / Tech-Spec via the ingest mains (the dogfooding demonstration). **Credit
  model**: when an agent turns a contribution into delivered work, the **contributor is credited** for
  the AI-generated output derived from their artifact. Comply with `doc-versioning` (`Version:`/`Date:`)
  + `documentation`/`traceability`; cross-link README.
- **Credit mechanism**: add a `contributor:` (+ optional `credit:`) frontmatter field to the ingested
  element templates (`bug`/`decision-log`/`adr`/`tech-spec`), **layered on** ADR-006 (no history rewrite).
- **`README.md`**: replace the "CONTRIBUTING.md (coming soon)" pointer (`:382`) with a `COLLABORATION.md` link.

### B8 · Implement `dl-022` (spec-review gate) — traces to `dl-022` (A1 T2)
- `.wingfoil/directives/custom/architecture.md` (and/or `code-review.md`): add a **spec-review** clause
  — a `tech-spec`/`adr` must pass, before `approved`/`accepted`: (1) **internal** consistency (prose ↔
  its own code listings), (2) **cross-spec** consistency (no naming/scheme conflict with sibling
  approved specs), (3) **spec ↔ BDD/vision** alignment (grammar, field names), (4) **traceability** cite.
- Wire the check into the approval transitions: `initial-design/seed-specs` + `release-planning/
  identify-specs` (tech-spec `pending → approved`) and `record-adrs` (adr `pending → accepted`) — add a
  `checks.pre`/`approval` requiring the spec-review sign-off.

### B9 · Implement `dl-023` (init+CLI e2e smoke gate) — traces to `dl-023` (A1 T5+T7)
- New standing **end-to-end smoke check**: run a real `wingfoil init`, then drive the scaffolded project
  through the CLI surface (`dna show`/`set`, `memory add`/`submit`, `paths`, …), asserting exit codes +
  schema-valid scaffolded artifacts. Would have caught `bug-005` at release time, not at the last task.
- Wire as a `release-cycle` gate **before `release-submit`** (new `e2e-smoke.yaml` sub-workflow or a
  `release-submit` pre-check). **Staged** per A5: warn first, flip to hard-reject when green.

### B10 · Implement `dl-024` (git branch/tag conventions) — traces to `dl-024` (N1/N2)
- Codify in the workflow defs: **one branch per phase** (`design/<phase>_<version>`, `task/<id>` for
  dev-loop) merged `--ff=false`; state it in `sw-life-cycle.yaml`/`release-cycle.yaml` (a `git:`
  conventions note).
- Add the tag step to **`release-publishing.yaml`**: the `vX.Y` tag is created on **`main`** after the
  release branch merges — never on a `design/release_*` branch.
- Cleanup: delete the stray accidental tag `1` (`git tag -d 1`).

### B11 · Codify the explore-phase + extra-points gate into `retrospective.yaml` — owned by `retro-v0.1`
- **`retrospective.yaml`**: insert an **`explore`** phase (role facilitator/qa; mine Execution Notes;
  `produces:` the friction inventory) **before** `capture`, and an **`additional-points`** approver gate
  **before/within** `capture`. Coherent with this plan's Phase A. No separate DL — a retrospective
  self-improvement recorded as an action of `retro-v0.1`.

### B12 · Close-out of the bootstrap
- The **ten** DLs are `ready` **and implemented** (`dl-013..017` + `dl-019`, `dl-020`, `dl-022`,
  `dl-023`, `dl-024`). To stop v0.2 `build-backlog` re-deriving tasks for them, **stamp `release: v0.2`**
  on all ten + a one-line Action note ("implemented out-of-flow in the config-bootstrap; no further task
  derivation").
- **T11 rename:** `git mv docs/self/docs/04_memory/planning/rl-v1/ → planning/rl-v1/` so the memory tree
  matches `{release-line}`=id (`rl-v1`) and the `docs/05_plans/rl-v1/` tree; update any references.
- Include on the branch: `COLLABORATION.md`, the `plan` template, the spec-review directive, the
  e2e-smoke workflow, the git-convention edits, `retrospective.yaml`, the T11 rename.
- `git merge --ff=false design/config_bootstrap_v0.2` → `main`. Verify: `tsc` 0, suite green
  (schema/loader tests for the new `release`/`release-origin` fields, reduced DL machine, `plan` type,
  `contributor`/`credit` fields), no `node_modules` tracked (scoped `git add` only).
- Update Claude Code auto-memory (CLAUDE.md §9): DL states + `plan` type + `COLLABORATION.md` + the
  machine/workflow changes + `bug-007`.

---

## Phase C — Resume normal flow → v0.2 `release-planning`

- Let `release-line-cycle/delivery` iterate: `minor-v0.2` (`planning`) is picked up → its `release-cycle`
  starts at the **now-updated** `release-planning`.
- First real exercise of `dl-016`'s machinery. Reconcile inputs (untouched by the bootstrap):
  - `dl-018` (`in-discussion`) → `reconcile-governance` promotes it to `ready`; `build-backlog` derives
    the v0.2 publishing tasks (package metadata, publishing tech-spec, local-vs-CI/CD + secrets, dry-run
    gate) and stamps `release: v0.2`.
  - `bug-004`, `bug-006`, `bug-007` (`open`) → `triage-bugs` (`open → triaged`) → `build-backlog`
    creates fix-tasks + `bug.set_state(planned)`.
  - `bug-005` → verify code fix already on `main`; if its file still reads `open`, sync to
    `resolved`/`closed` (fix landed under task-032).
- From here delivery is fully normal: `implementation` (dev-loop under `dl-013/014/015`, per-task
  branches per `dl-024`) → `user-docs` (new) → `release-submit` (now behind the `dl-023` smoke gate) →
  **`release-publishing`** (v0.2 pipeline — the first *real* publish; tag `v0.2` on `main` per `dl-024`)
  → `retrospective` (now with the `explore` + `additional-points` phases).

---

## Handoff checklist — what requires Roberto (approver) vs. the agent

| Step | Agent does | Roberto (approver) does |
|---|---|---|
| A1 explore | mine Execution Notes (Haiku Explore agents → Opus synthesis) → friction inventory | — |
| A2 additional-points gate | present inventory + known themes | **add points; decide DL-vs-fold** *(done)* |
| A3 capture | on `design/retrospective_v0.1`: draft + submit `retro-v0.1`; draft + submit `dl-019, dl-020, dl-022, dl-023, dl-024`; file `bug-007`; **explain each DL** | review each DL summary |
| A4 approve retro | stage | authorize `approve retro-v0.1` |
| A5 exceptional approve | stage the 10-DL approve + embed open-question resolutions | **decide open questions; explicitly approve each DL**; authorize `approve dl-013..017, dl-019, dl-020, dl-022, dl-023, dl-024`; then merge branch → `main` |
| B1–B5 implement | on `design/config_bootstrap_v0.2`: all config/code edits, scoped commits; B4 folds T1 | pick **B-DECISION** Option 1 vs 2 |
| B4 deprecate dl-002 | stage | authorize `deprecate dl-002` |
| B6 plan type | `memory.yaml` + `plan` template + wiring + docs | — |
| B7 COLLABORATION.md | author doc + `contributor/credit` frontmatter + README link | — |
| B8 spec-review gate | `architecture`/`code-review` directive + approval-gate checks | — |
| B9 e2e smoke gate | `e2e-smoke` workflow + release-submit pre-check (staged warn→reject) | — |
| B10 git conventions | branch-per-phase note + tag-on-main in `release-publishing.yaml` + delete tag `1` | — |
| B11 retrospective.yaml | add `explore` phase + `additional-points` gate | — |
| B12 close-out | stamp `release` on 10 DLs, T11 rename, merge `--ff=false`, verify green, update auto-memory | — |
| C resume | run v0.2 `release-planning`; stage its gate transitions | authorize each planning gate (triage-bugs, reconcile-governance, record-adrs, identify-specs, commit-backlog) |

**Do not** proceed past any approve-gate without Roberto's explicit instruction + Reason. For this
retrospective's DL batch specifically, the agent explains each DL and awaits Roberto's explicit approval
before A5 (a one-off measure for this bootstrap, not a standing rule).
