---
id: "release-planning-rel-v0.1-plan"
type: plan
title: "Release-planning — v0.1 (Project Memory + Project DNA)"
status: active
workflow: "release-planning"
phase: "rel-v0.1"
element: "minor-v0.1"
parent: "release-cycle.planning"
release: "v0.1"
tmpl_version: 261010
---

# Release Planning — v0.1 (Project Memory + Project DNA)

## Context

`rl-v1` (release-line v1) is `active`; its `initial-design` phase is done — 5 releases seeded
(`minor-v0.1` … `minor-v1.0`, all already moved `draft → planning`), 8 ADRs `accepted`, 12
Decision Logs `ready`, 12 tech-specs `approved` (see `docs/04_memory/planning/rl-v1.md`
Execution Notes). Per `release-line-cycle`, the next step is `delivery` → one `release-cycle` per
release, starting with `minor-v0.1`. Per CLAUDE.md §6/§10.7 (no workflow engine yet), starting a
(sub-)workflow phase requires writing a coherent plan first — this document is that plan for
`release-cycle`'s `planning` phase, i.e. the `release-planning` sub-workflow
(`.wingfoil/workflows/custom/release-planning.yaml`), scoped to `minor-v0.1` only.

A prior, **abandoned** branch (`design/rel_v0.1_planning`, not an ancestor of `main`) already
attempted this exact phase on 2026-06-29 against an *older* config (flat `rel-v0.1`, no
release-line split, no `identify-specs` step, no `spec-001..012`). Its plan file
(`docs/05_plans/release-cycle-v0.1.md`, commit `9d1752b` + 3 follow-ups) is useful prior art —
same underlying `v0.1.json` backlog (28 tasks, identical IDs/titles) — but it also *mid-course
discovered* a real gap (§5 below) that today's fresher config already partly resolves and partly
still needs the same fix. This plan reuses what's still valid, corrects what the newer config
changed, and folds in that gap fix proactively per the user's decision (see §5).

---

## 1. Preconditions (verified against current repo state)

- `rl-v1` — `status: active`.
- `minor-v0.1` (`docs/04_memory/planning/rl-v1/minor-v0.1.md`) — `status: planning`
  **already** (moved there by `initial-design`'s `seed-releases`, not by this phase — see §2.1).
  All required frontmatter (`title, version, pillar, features, requirements, release-line`) and
  body (Scope / Pillar Focus / Success Criteria) already filled.
- ADRs `adr-001..008` — `accepted`. Decision Logs `dl-001..012` — `ready`. Tech-specs
  `spec-001..012` — `approved`.
- `docs/03_backlog/04_backlog/by-release/v0.1.json` — 28 tasks (`TASK-001..028`), unchanged from
  the abandoned branch's copy.
- No bugs exist yet (`docs/04_memory/bugs/` not created) — the bug-driven part of
  `build-backlog` is a no-op for v0.1.
- No task files exist yet under `docs/04_memory/` (only `planning/` and `design/`).

---

## 2. Phase-by-phase plan (`release-planning.yaml`)

### 2.1 `define-scope` — role: product-owner — **already satisfied, no action**

The phase's action is `memory.submit` (`release: draft → planning`) with post-check
`frontmatter.required: [title, version, pillar, features, requirements, release-line]`. Both the
transition and the frontmatter are already in place (done by `initial-design`'s `seed-releases`,
which — per the executed plan `docs/05_plans/rl-v1/initial-design-rl-v1-plan.md` — filled the same
fields and moved status forward, one step ahead of the model doc's generic instruction to "leave
at draft"). **No commit needed here**; this plan just records the check as passed.

### 2.2 `record-adrs` (optional) — role: architect — **skipped**

All architectural decisions relevant to v0.1's scope (storage layer, memory schema, DNA schema,
CLI/MCP contracts, TypeScript/Node stack) are already covered by `adr-001..008`
(release-line-wide, `accepted`). No v0.1-specific architectural decision was identified beyond
those. Skipped — nothing to add.

### 2.3 `identify-specs` — role: architect — **survey done, no new specs needed**

Surveyed v0.1's scope (git storage, Memory `add`/`search`, DNA schema, CLI basics, MCP Resources,
plus the scaffold/validation-engine gap from §5) against the 12 approved specs:

| Artefact implied by v0.1 scope | Covered by |
|---|---|
| Storage layout (`.wingfoil/` dir) | `spec-011-storage-layout` |
| `memory.yaml` schema | `spec-001-memory-yaml-schema` |
| `dna.yaml` schema | `spec-002-dna-yaml-schema` |
| CLI command contract / grammar | `spec-005-cli-command-contract`, `spec-008-cli-grammar` |
| MCP Resources surface | `spec-004-mcp-surface-contract` |
| Core domain API (add/search) | `spec-006-core-domain-api` |
| Validation pipeline + ID generation | `spec-009-validation-strategy` |
| Memory frontmatter schema | `spec-010-memory-frontmatter-schema` |
| Secret hygiene | `spec-007-secret-hygiene-patterns` |

No artefact in v0.1's scope is uncovered — **no new tech-spec scaffolded**. This is the concrete
payoff of `rl-v1`'s proactive `seed-specs`/`identify-specs` design (see §5): the abandoned branch
had to invent ad hoc `REQ-SYS-10`/`REQ-SYS-11` mid-planning to justify its extra tasks; today
`adr-005` and `spec-009` already justify the equivalent tasks, so no new requirement or spec is
needed — only the tasks themselves (§2.4).

### 2.4 `build-backlog` — role: product-owner

Create Memory task files under `docs/04_memory/v0.1/` (assumption: the `{release}`
placeholder in `task.path` resolves to `release.version`, i.e. `"v0.1"`, matching the abandoned
branch's convention and the current directory layout, which has no release-*id*-named folders).

> **Correction (per user, 2026-07-04):** `docs/03_backlog/04_backlog/by-release/v0.1.json` is a
> **suggestion**, not an authoritative 1:1 source — its content/count can vary per release, and its
> `TASK-NNN` numbering must **not** be carried over into Memory task IDs (`memory.yaml`'s
> `id_pattern` only fixes the `task-{n}-{slug}` shape; the sequence number is an ID-generation
> detail, assigned by execution order, independent of the backlog JSON). See
> `feedback_backlog_json_not_authoritative` (auto-memory). All 33 tasks below are renumbered
> `task-001..033` in the order they're intended to enter `dev-loop`, not in backlog-row order.

**33 tasks total** — the 28 rows of `v0.1.json` (content unchanged, only renumbered/reordered) plus
5 additional tasks identified as necessary but not yet defined anywhere (backlog JSON or Memory):
2 prerequisites that must run *before* everything else, 2 follow-ups from the abandoned branch's
mid-planning discovery (§5), and 1 new one found in this pass — a manual end-to-end validation task
covering `minor-v0.1`'s own Success Criteria bullets ("Journey 0a and Journey 1 manually tested
end-to-end"), which none of the other 32 tasks exercise.

| # | Memory ID | Title | Priority | `ref` | Origin |
|---|---|---|---|---|---|
| 1 | `task-001-nodejs-typescript-scaffold` | Node.js/TypeScript project scaffold | Blocker | `adr-005-typescript-node-stack` | New (prerequisite) |
| 2 | `task-002-validation-id-engine` | Zod validation pipeline + ID generation engine | Blocker | `spec-009-validation-strategy` | New (prerequisite) |
| 3 | `task-003-git-backed-sot` | Infrastructure: REQ-SYS-01 — Git-backed single source of truth | Blocker | REQ-SYS-01 | `v0.1.json` |
| 4 | `task-004-decoupled-pillars` | Infrastructure: REQ-SYS-02 — Decoupled pillars | Blocker | REQ-SYS-02 | `v0.1.json` |
| 5 | `task-005-per-type-state-machines` | Infrastructure: REQ-SYS-04 — Configurable per-type state machines | Blocker | REQ-SYS-04 | `v0.1.json` |
| 6 | `task-006-dual-interface-shared-core` | Infrastructure: REQ-SYS-05 — Dual interface over shared core | Blocker | REQ-SYS-05 | `v0.1.json` |
| 7 | `task-007-npm-distribution` | Infrastructure: REQ-SYS-09 — npm distribution | Medium | REQ-SYS-09 | `v0.1.json` |
| 8 | `task-008-dna-memory-query-latency` | Infrastructure: REQ-PERF-02 — DNA/Memory query latency | Blocker | REQ-PERF-02 | `v0.1.json` |
| 9 | `task-009-mcp-resource-fetch-latency` | Infrastructure: REQ-PERF-04 — MCP resource fetch latency | Blocker | REQ-PERF-04 | `v0.1.json` |
| 10 | `task-010-default-state-machine-fallback` | Infrastructure: REQ-STATE-08 — Default state-machine fallback | Blocker | REQ-STATE-08 | `v0.1.json` |
| 11 | `task-011-mcp-resources-read-only` | Infrastructure: REQ-INT-01 — MCP Resources read-only | Blocker | REQ-INT-01 | `v0.1.json` |
| 12 | `task-012-cli-exit-code-contract` | Infrastructure: REQ-INT-04 — CLI exit-code contract | Medium | REQ-INT-04 | `v0.1.json` |
| 13 | `task-013-machine-readable-formats` | Infrastructure: REQ-INT-05 — Machine-readable output formats | Blocker | REQ-INT-05 | `v0.1.json` |
| 14 | `task-014-git-identity-required` | Infrastructure: REQ-SEC-01 — Git identity required | Blocker | REQ-SEC-01 | `v0.1.json` |
| 15 | `task-015-complete-audit-trail` | Infrastructure: REQ-SEC-02 — Complete audit trail | Blocker | REQ-SEC-02 | `v0.1.json` |
| 16 | `task-016-read-only-agent-channel` | Infrastructure: REQ-SEC-05 — Read-only agent read channel | Blocker | REQ-SEC-05 | `v0.1.json` |
| 17 | `task-017-storage-confinement` | Infrastructure: REQ-SEC-06 — Storage confinement | Blocker | REQ-SEC-06 | `v0.1.json` |
| 18 | `task-018-implement-git-backed-storage` | Implement Git-Backed Storage | Critical | P1.1 | `v0.1.json` |
| 19 | `task-019-implement-versioning-audit-trail` | Implement Versioning & Audit Trail | Critical | P1.2 | `v0.1.json` |
| 20 | `task-020-implement-memory-add` | Implement `wingfoil memory add` | Critical | P1.3 | `v0.1.json` |
| 21 | `task-021-implement-memory-search` | Implement `wingfoil memory search` | Critical | P1.5 | `v0.1.json` |
| 22 | `task-022-implement-memory-entries` | Implement Memory Entries (git-backed) | Critical | P1.11 | `v0.1.json` |
| 23 | `task-023-implement-keyword-search` | Implement Keyword Memory Search | Critical | P1.12 | `v0.1.json` |
| 24 | `task-024-implement-memory-element-schema` | Implement Memory Element Schema (`memory.yaml`) | Critical | P1.13 | `v0.1.json` |
| 25 | `task-025-implement-dna-set` | Implement `wingfoil dna set` | Critical | P2.1 | `v0.1.json` |
| 26 | `task-026-implement-dna-show` | Implement `wingfoil dna show` | Critical | P2.2 | `v0.1.json` |
| 27 | `task-027-implement-project-dna` | Implement Project DNA (structured config) | Critical | P2.4 | `v0.1.json` |
| 28 | `task-028-implement-paths-category` | Implement `wingfoil paths` [category] | High | P2.5 | `v0.1.json` |
| 29 | `task-029-implement-wingfoil-init` | Implement `wingfoil init` | Critical | P5.1.1 | `v0.1.json` |
| 30 | `task-030-implement-mcp-resources` | Implement MCP Resources (DNA + Memory) | Critical | P5.2.1 | `v0.1.json` |
| 31 | `task-031-post-v01-dna-config-sync` | Post-v0.1 `dna.yaml` config sync | High | `spec-002-dna-yaml-schema` | New (from abandoned branch) |
| 32 | `task-032-readme-cli-quickstart` | README.md and CLI quick-start docs | High | `spec-005-cli-command-contract` | New (from abandoned branch) |
| 33 | `task-033-manual-e2e-journey-validation` | Manual E2E validation of Journey 0a + Journey 1 against `minor-v0.1` Success Criteria | Critical | `docs/04_memory/planning/rl-v1/minor-v0.1.md` (Success Criteria) | New (this pass) |

None of the 5 new tasks are added to `v0.1.json` (per user decision, §5) — their `ref` points
directly at the ADR/spec/Memory doc that justifies them.

**Simulated commands / commits** (33 tasks total):
```
memory.add(self): task-001..task-033 [status: draft]
```
```
memory.submit(self): task-001..task-033 [draft → pending]
```

**Checks:** 33 files at `docs/04_memory/v0.1/`, all `status: pending`,
`frontmatter.required: [title, release]` satisfied on each.

### 2.5 `commit-backlog` — role: tech-lead — approval: approver

Approve all 33 pending tasks into `backlog`, then move `minor-v0.1` `planning → in-development`.

**Commits:**
```
memory.approve(self): task-001..task-033 [pending → backlog]

Reason: v0.1 backlog committed
```
```
memory.approve(self): minor-v0.1 [planning → in-development]

Reason: v0.1 planning complete
```

**Stop-check:** `minor-v0.1` at `in-development`; all 33 task files at `backlog` with
`release: v0.1`.

> The Memory IDs above are already listed in intended `dev-loop` execution order (informational,
> out of scope for this plan): `task-001`/`task-002` (scaffold, validation/ID engine) first, then
> the 15 infra blockers, then the 13 feature tasks, then `task-031` (dna.yaml sync, after
> `task-025`/`task-029`), `task-032` (README/docs), and `task-033` (manual E2E validation) last,
> as the final gate before `release-submit`.

---

## 3. Open assumptions to confirm before executing

- `{release}` in `task.path: "docs/04_memory/{release}/{id}.md"` resolves to `release.version`
  (`"v0.1"`), not the release's Memory `id` (`"minor-v0.1"`) — `memory.yaml` doesn't disambiguate
  this explicitly; flagged here rather than guessed silently.
- The 5 supplementary tasks' `ref` field points to an ADR/tech-spec/Memory-doc id instead of a
  `TASK-0NN` backlog id — acceptable per the task template (`ref` is described generically as
  "backlog item ID", not constrained to `v0.1.json` rows), per the user's explicit choice not to
  touch `v0.1.json`.
- Memory task IDs are renumbered `task-001..033` in intended execution order and deliberately do
  **not** mirror `v0.1.json`'s `TASK-NNN` numbering — per the user's explicit correction that the
  backlog JSON is a suggestion, not an authoritative numbering source (see §5 and the
  `feedback_backlog_json_not_authoritative` auto-memory).

---

## 4. Launch checklist

- [x] **2.1 define-scope** — verified already satisfied (no commit)
- [x] **2.2 record-adrs** — skipped (no gap found)
- [x] **2.3 identify-specs** — surveyed, no new spec needed (no commit)
- [x] **2.4 build-backlog**
  - [x] `wf(task): add task-001..task-033` (commit `b470456`)
  - [x] `wf(task): submit task-001..task-033` (commit `ba3d76a`)
  - [x] 33 files present, all `pending`, required frontmatter satisfied
- [x] **2.5 commit-backlog**
  - [x] `wf(task): approve task-001..task-033 [pending → backlog]` (commit `b77a32e`)
  - [x] `wf(release): approve minor-v0.1 [planning → in-development]` (commit `05f9ff3`)
  - [x] Stop-check: `minor-v0.1` at `in-development`; all 33 tasks at `backlog`

All of the above executed on branch `design/release_planning_v0.1` (2026-07-04). **Not merged into
`main`** — an earlier merge was reverted by the user, who chose to keep this work on the branch;
merging into `main` was never part of this plan or of any workflow definition (no workflow yaml
declares a git-branch/merge action for `release-planning`, and `dl-002-git-branching-trunk-based`
scopes its rule to `dev-loop` per-task branches only) and is deferred to an explicit future decision.

Next: `release-cycle`'s `implementation` phase — one `dev-loop` per backlog task, starting with
`task-001`/`task-002` as prerequisites (out of scope here, not yet started).

---

## 5. Comparison vs. prior art (commit `9d1752b…` and branch `design/rel_v0.1_planning`)

**Not an ancestor of `main`** — an earlier, abandoned attempt at the same phase, against a config
version that predates the `rl-v1` restructuring (no release-line split, `transitions` dict-of-arrays
instead of `sequence`/`gates`/`waiting`, no `identify-specs` step, no `spec-001..012`).

| Aspect | Old branch (9d1752b + 3 follow-ups) | This plan | Why it changed |
|---|---|---|---|
| Release element | Flat `rel-v0.1` | `minor-v0.1` under `docs/04_memory/planning/{release-line}/` | `release-line`/`release` split (`spec-001`) |
| `define-scope` | Explicit `memory.submit(rel-v0.1) [draft→planning]` step | Already done by `initial-design` | `seed-releases` now submits releases one step ahead |
| `record-adrs` | "adr-001..006 already accepted, no action" | Same conclusion, now `adr-001..008` | rl-v1 seeded 2 more ADRs |
| `identify-specs` | **Did not exist as a step** | Explicit phase, 0 new specs needed | Added to `release-planning.yaml` in the `f94bf60` config migration — this is exactly the fix the (separate, uncommitted) gap note `docs/05_plans/gaps/workflow/X_add-missing-design-steps.md` proposed; that note is now **stale**, the fix is already live |
| Task count | Grew from 28 → 32 **reactively**, discovered only after the 28 were already committed to backlog, forcing two new ad hoc SARD requirements (`REQ-SYS-10`, `REQ-SYS-11`) invented mid-planning | 33 planned **proactively** in this same document, before any commit, with **no new SARD requirements** — `adr-005-typescript-node-stack` and `spec-009-validation-strategy` (both already `accepted`/`approved`) directly justify 2 of them, plus 1 more (manual E2E journey validation) found by checking `minor-v0.1`'s own Success Criteria against the other 32 tasks | This is the one substantive gap that *still exists* in the current backlog (`v0.1.json` still has only 28 rows, `REQ-SYS-10/11` still don't exist in `03_sard`) — carried forward and fixed here per the user's decision, rather than left to resurface reactively in `dev-loop`'s `design` safety net as it did before |
| Task numbering | `task-001..028` copied verbatim from `TASK-001..028`'s row order; late additions bolted on as `task-107..110` (numbering jump, no clear rationale) | `task-001..033`, renumbered by intended `dev-loop` execution order — backlog-derived tasks shifted down to make room for the 2 prerequisite tasks at the front; `v0.1.json`'s numbering is **not** preserved anywhere | User's explicit correction (2026-07-04): `v0.1.json` is a suggestion, not an authoritative numbering source — see `feedback_backlog_json_not_authoritative` (auto-memory) |
| Extra tasks' traceability | `ref: REQ-SYS-10` / `REQ-SYS-11` (new, invented requirements) + added to `v0.1.json` | `ref:` points directly to `adr-005` / `spec-009` / `spec-002` / the release's own Success Criteria, **not** added to `v0.1.json` | User's explicit choice this round — avoids re-inventing requirements text and keeps `v0.1.json` as a pure feature/backlog artifact |
| Commit-backlog | `rel-v0.1 [planning → in-development]` only after *all* 32 tasks (incl. late additions) were approved | Same shape, `minor-v0.1 [planning → in-development]`, 33 tasks from the start | No functional difference, just earlier certainty |
| Scope of prior doc | Covered all 5 `release-cycle` phases (planning → implementation → submit → publishing → retrospective) | Scoped to `planning` only, per this request | Later phases will get their own plan when reached |