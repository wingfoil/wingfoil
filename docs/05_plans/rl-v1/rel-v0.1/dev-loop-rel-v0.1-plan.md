---
id: "dev-loop-rel-v0.1-plan"
type: plan
title: "Dev-loop — v0.1 (generic per-task plan)"
status: done
workflow: "dev-loop"
phase: "rel-v0.1"
element: "minor-v0.1"
parent: "release-cycle.implementation"
release: "v0.1"
tmpl_version: 261010
---

# Dev-Loop — v0.1 (Generic, Per-Task Plan)

## Context

`minor-v0.1` is `in-development`; its `planning` phase is done — 33 backlog tasks (`task-001..033`,
`docs/04_memory/v0.1/`), all `status: backlog`
(`docs/05_plans/rl-v1/rel-v0.1/release-planning-rel-v0.1-plan.md`). Per `release-cycle`, the next
phase is `implementation`: one `dev-loop` sub-workflow run
(`.wingfoil/workflows/custom/dev-loop.yaml`, `element: task`) per backlog task tagged
`v0.1`. Per CLAUDE.md §6/§10.7 (no workflow engine yet), starting a sub-workflow requires a coherent
plan first.

Unlike `release-planning` (one phase, run once for the whole release), `dev-loop` runs **33 times** —
once per task. Rather than writing 33 near-identical plans up front, this single document is the
**generic, reusable plan** every dev-loop run follows; it is adapted, not rewritten, per task (see
next section). This mirrors how `X_wingfoil-init-plan.md` models `wingfoil-init` for any project.

> **Dogfooding note:** the `wingfoil` CLI/MCP is not implemented. Every state transition below is
> performed manually (edit frontmatter + git commit); commit subjects simulate the `wingfoil`
> commands that will issue them once the tool exists.

---

## 1. How this plan is used per task

An agent picking up a task does **not** copy this file. Instead:

1. Read this plan for the phase-by-phase contract (§3) and the git/commit conventions (§2).
2. Open the task's own Memory file (`docs/04_memory/v0.1/task-{n}-{slug}.md`) — its
   **Description / Acceptance Criteria / Implementation Notes** sections already carry the
   task-specific content, and its **Execution Notes** section is where the running log of what
   actually happened (specs found missing, deviations, rejection reasons) is filled in
   incrementally, phase by phase.
3. Execute the phases against that task, committing per §2's conventions.

**Difference from a per-task-plan-copy model:** an earlier approach (recorded only as an
abandoned-branch artifact, not part of the current config) had agents copy this file to a separate
`docs/05_plans/dev-loop-{task.id}.md` per task and fill it in there. That is unnecessary today: the
current `task` Memory template (`memory.yaml` → `task.template.file`) already has its own
**Execution Notes** section for exactly that purpose. Adding a second, parallel per-task plan file
would duplicate the same content in two places with no single source of truth — so this generic
plan stays singular, and the task's own Memory file is the per-task adaptation surface.

---

## 2. Conventions

### Branch, worktree & merge — branch naming, worktree creation, and merge strategy are **forced** ahead of approval

> **⚠ Forcing note — deliberate override, not yet formally approved.** `dev-loop.yaml`'s actual
> `start`/`done` actions today are `git.create_branch("{task.id}")` (bare, no prefix) and
> `git.merge(to: main)` (plain, fast-forwardable), with **no worktree action at all** — that is
> exactly what `dl-002-git-branching-trunk-based` (already `ready`) prescribes. **This plan
> force-adopts the `task/`-prefixed branch name, per-task git worktree creation, and `--no-ff` merge
> ahead of `dev-loop.yaml` and `dl-002` being formally updated**, per the user's explicit instruction,
> on the authority of `dl-014-dev-loop-plan-deltas` (`in-discussion`) — whose G1–G3 propose exactly
> these three changes as an explicit **supersession** of `dl-002`, to support running the 33
> `minor-v0.1` tasks' dev-loops in parallel and keep each one's history a distinct, revertible unit
> even when a branch could fast-forward. `dl-002` remains the formally `ready` decision-log until
> `dl-014` is itself approved and `dl-002` is deprecated per `dl-014`'s own Actions — so there is now
> a deliberate, temporary divergence between **this plan** (forces the `dl-014` G1–G3 shape) and
> **`dev-loop.yaml`/`dl-002`** (still the bare/no-worktree/plain-merge shape) until that config
> catches up. Do not read this forcing as `dl-014` having been approved — it hasn't.

- **Branch — forced `task/{task.id}`** (prefixed — e.g. `task/task-002-validation-id-engine`),
  created at `start` via `git.create_branch("task/{task.id}")`. *(Per `dl-002`/`dev-loop.yaml` as
  currently configured this would be the bare `{task.id}`; forced to the `task/`-prefixed form per
  `dl-014` G1.)*
- **Worktree — forced, per-task.** `start` also creates a dedicated git worktree for the task via
  `git.create_worktree("task/{task.id}")`; `done` removes it via `git.remove_worktree`, after the
  merge and before the branch delete. *(`dev-loop.yaml` has no worktree action today; forced per
  `dl-014` G2, which exercises `REQ-INT-06`'s already-specified `create worktree` action.)*
- **Merge — forced `--no-ff`, and it happens last.** `done` first commits `approve` (`in-review →
  approved`) and the `done` transition (`approved → done`) **on `task/{task.id}` itself**, then runs
  `git.merge(to: main, ff: false)` — always produces a merge commit, even when the task branch could
  fast-forward, and carries both state-transition commits into `main` in that single merge. *(See
  §3.7 for the full ordering and why it changed. `dev-loop.yaml`/`dl-002` as currently configured is a
  plain `git.merge(to: main)`; forced to `--no-ff` per `dl-014` G3, on the user's explicit instruction,
  on top of the G1/G2 forcing already in place.)*
- **On merge conflict:** unchanged — no bespoke procedure declared; `REQ-INT-06`'s fit criterion
  governs (conflict aborts the merge, working tree stays clean, `done` step marked `failed`).
  `dev-loop.yaml`'s `done` phase still has no `fallback:` (see §6 — flagged, not fixed/forced here);
  `dl-014` G4 proposes one but it is not part of this forcing.

> **Open proposals, not yet in effect (and not forced by this plan):** `dl-013-documentation-process-gate`
> (API-docs rule text + release-level `user-docs` phase) and the remainder of `dl-014` — G4 (a
> merge-conflict fallback) and G5 (an API-docs check in `refactor`) — remain `in-discussion`,
> unapproved, and **not** anticipated here. Only G1–G3 (branch naming, worktree creation, and
> `--no-ff` merge) are forced, per the note above.

### Commits

- **Memory state-transition commits** (`memory.add`/`submit`/`approve`) — format exactly per
  CLAUDE.md §5.1; not re-derived here to avoid a second copy drifting from that source.
- **Code & plan commits** (conventional commits; `{module}` = a `dna.yaml` module — `core, storage,
  memory, dna, directives, workflow, cli, mcp-server`):

  | Phase | Subject format |
  |---|---|
  | red | `test({module}): {task.id} — failing test for <criteria>` |
  | green | `feat({module}): {task.id} — <minimum implementation>` |
  | refactor | `refactor({module}): {task.id} — <what changed>` |

  Per the `code-quality` directive: conventional commits, one state change per commit, author +
  timestamp captured by git itself (`REQ-SEC-02`).

### Roles & directives (per `roles.yaml`)

| Phase | Role | Directives auto-loaded |
|---|---|---|
| start, red, green, refactor | developer | code-quality, testing, determinism |
| design | architect | architecture, determinism, traceability |
| review | reviewer | code-review, traceability |
| design / review approval gates | approver | — (approval authority only, no content directive) |
| done | developer | code-quality, testing, determinism |

Global (every phase): doc-versioning, documentation, security-secrets.

---

## 3. Phase-by-phase plan (mirrors `dev-loop.yaml` exactly)

### 3.1 `start` — role: developer

- `git.create_branch("task/{task.id}")` — from `main`. **Forced `task/`-prefixed naming** — the
  actual `dev-loop.yaml` action today is `git.create_branch("{task.id}")` (bare); see §2's forcing
  note (per `dl-014-dev-loop-plan-deltas`, `in-discussion`).
- `git.create_worktree("task/{task.id}")` — **forced**, not present in `dev-loop.yaml` today; see §2.
- `element.set_state(in-progress)` — task: `backlog → in-progress`.
- `bug.sync_state(where: { id: task.bug })` — no-op unless the task carries a `bug:` field (fix task
  derived from a triaged bug); if present, advances the bug `planned → in-progress`. None of the 33
  v0.1 tasks currently have `bug:` set (no bugs exist yet).

### 3.2 `design` — role: architect — safety net, not a rubber stamp

- `agent.verify_specs` — check the task's scope against existing `tech-spec` elements (schemas, file
  formats, constants, module APIs it will touch).
- For each artefact still missing a spec: `memory.add(type: tech-spec)` then `memory.submit`
  (`draft → pending`), producing `docs/04_memory/design/specs/{id}.md`.
- **Checks (post):** `frontmatter.required: [title, scope]`; **all** relevant tech-spec elements —
  pre-existing and newly scaffolded — must be `approved`.
- **Approval:** `by_role: approver`. **Fallback:** reject → back to `design` (revise the spec, re-verify).
- Most of the 33 v0.1 tasks already cite an approved spec/ADR/REQ in their `ref:` field (e.g.
  `spec-009-validation-strategy`, `adr-005-typescript-node-stack`) — for those, this phase is
  expected to find no gap and pass straight through, exactly as `release-planning`'s own
  `identify-specs` step did for the release as a whole.

### 3.3 `red` — role: developer

- `agent.execute` — write a failing test capturing the task's acceptance criteria (from the task's
  own **Acceptance Criteria** section, which should reference the relevant BDD `.feature` file under
  `docs/02_requirements/02_bdd/features/`).
- **Checks (post):** `tests.exist`, `tests.failing`.

### 3.4 `green` — role: developer

- `agent.execute` — minimum implementation to pass.
- **Checks (post):** `tests.passing`.

### 3.5 `refactor` — role: developer

- `agent.execute` — refactor with tests green.
- **Checks (post):** `tests.passing`, `tests.coverage(min: 80)` — per the `testing` directive; no
  additional check is declared today (see §2's note on the open, unapproved API-docs proposal).

### 3.6 `review` — role: reviewer

- `tests.bdd.run` — the BDD acceptance suite for the task's feature(s) must also pass.
- `memory.submit` — task: `in-progress → in-review`.
- `bug.sync_state(where: { id: task.bug })` — keeps a source bug in sync (no-op for v0.1's 33 tasks).
- **Checks (pre):** `tests.bdd.passing`.
- **Approval:** `by_role: approver`. **Fallback:** reject → `red`, task reset to `in-progress`.

### 3.7 `done` — role: developer

Both state-transition commits below (`approve` and the `done` transition) land **on the task's own
`task/{task.id}` branch, before it is merged** — not on `main` after the fact. That way a single
`--no-ff` merge carries both commits into `main` as part of the branch's own history, and the branch
being merged is the one that actually reaches `done`, not a still-`approved` snapshot completed
elsewhere. **This reorders the sequence from an earlier version of this plan**, which merged right
after `approve` and then committed the `approved → done` transition separately on `main` once the
branch was already gone — that put the `done` commit's authorship/history outside the task's own
branch, which defeats the point of giving every task a dedicated branch in the first place.

1. `memory.approve` — task: `in-review → approved`, **committed on `task/{task.id}`** (per CLAUDE.md
   §5.1: commit body needs `Approver:`/`Reason:`).
2. `element.set_state(done)` — task: `approved → done`, **also committed on `task/{task.id}`**,
   immediately after the `approve` commit and still before any merge.
3. `git.merge(to: main, ff: false)` — **forced `--no-ff`** (see §2, `dl-014` G3); carries both of the
   above commits into `main` in one merge commit. The conflict/fallback behavior is still currently
   undeclared (`dl-014` G4, not forced).
4. `git.remove_worktree` — **forced**, removes the task's worktree after the merge; see §2.
5. `git.branch.delete("task/{task.id}")` — the now-merged, `task/`-prefixed branch, already carrying
   both the `approve` and `done` commits.
6. `bug.sync_state(where: { id: task.bug })` — no-op for v0.1's 33 tasks.

---

## 4. Task Registry (snapshot — source of truth is `docs/04_memory/v0.1/task-*.md`)

33 tasks, all `status: backlog`, tag `v0.1`. `task-001` and `task-002` are prerequisites (scaffold +
shared validation/ID engine) that the other 31 build on:

| Task | Title | `ref` |
|---|---|---|
| task-001 | Node.js/TypeScript project scaffold | adr-005-typescript-node-stack |
| task-002 | Zod validation pipeline + ID generation engine | spec-009-validation-strategy |
| task-003..017 | Infrastructure tasks (`REQ-SYS-*`, `REQ-PERF-*`, `REQ-STATE-08`, `REQ-INT-*`, `REQ-SEC-*`) | one `REQ-*` each |
| task-018..030 | Feature implementation tasks (`P1.1, P1.2, P1.3, P1.5, P1.11, P1.12, P1.13, P2.1, P2.2, P2.4, P2.5, P5.1.1, P5.2.1`) | one `P*` feature id each |
| task-031 | Post-v0.1 `dna.yaml` config sync | spec-002-dna-yaml-schema |
| task-032 | README.md + CLI quick-start docs | spec-005-cli-command-contract |
| task-033 | Manual E2E validation of Journey 0a + Journey 1 | `minor-v0.1.md` (Success Criteria) |

This table is a derived snapshot for readability — do not edit it in place of the task files
themselves.

---

## 5. Preconditions / launch checklist for the first dev-loop run

- [x] `minor-v0.1` — `status: in-development`.
- [x] All 33 tasks — `status: backlog`, required frontmatter (`title, release`) present.
- [x] ADRs `adr-001..008` `accepted`, Decision Logs `dl-001..012` `ready`, tech-specs `spec-001..012`
  `approved` — the `design` phase safety net should find no gaps for tasks whose `ref` already cites
  one of these.
- [x] No bugs exist yet — `bug.sync_state` is a no-op for every task in this release.
- [ ] **Not yet run:** no task has moved past `backlog`; this plan has not been executed.

Next: start with **`task-001-nodejs-typescript-scaffold`**, then **`task-002-validation-id-engine`**
(both prerequisites for the remaining 31), then the rest in registry order.

---

## 6. Open items — one forced ahead of approval, others still just documented (not fixed here)

- **Forced, not yet reconciled with config:** this plan force-adopts `dl-014-dev-loop-plan-deltas`'s
  (`in-discussion`) G1–G3 — `task/`-prefixed branch naming, per-task worktree creation, and `--no-ff`
  merge (§2, §3.1, §3.7) — on the user's explicit instruction — but `dev-loop.yaml` itself still
  declares bare `{task.id}` branches, no worktree action, and a plain merge (per
  `dl-002-git-branching-trunk-based`, still `ready`), and `dl-014` is not approved. This is a
  **deliberate, temporary divergence between this plan and the actual workflow config**, not an
  error: it should be closed by (a) approving `dl-014`, (b) deprecating `dl-002` per `dl-014`'s own
  Actions, and (c) updating `dev-loop.yaml` to match — until then, running this plan produces
  branches/worktrees/merge-commits that `dev-loop.yaml` as written doesn't itself create.
- **Not forced, still just proposed:** the rest of `dl-014` — G4, the `done`-phase merge-conflict
  fallback (`fallback: { step: red, set_state: in-progress }`, mirroring `review`'s shape;
  `REQ-INT-06` already defines the underlying abort-on-conflict behavior) — and G5, all of `dl-013`'s
  API-docs check wiring in `refactor`. Neither is forced here; this plan still follows `dev-loop.yaml`
  as configured for those two points (no fallback, no doc check).
