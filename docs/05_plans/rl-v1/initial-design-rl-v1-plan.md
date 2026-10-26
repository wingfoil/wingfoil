---
id: "initial-design-rl-v1-plan"
type: plan
title: "Initial design — rl-v1"
status: active
workflow: "initial-design"
phase: "rl-v1"
element: "rl-v1"
parent: "release-line-cycle.initial-design"
release: ""
tmpl_version: 261010
---

# Initial Design — rl-v1 Execution Plan

**Date:** 2026-07-03
**Roles:** Product Owner · Architect
**Element:** `release-line` `rl-v1` (status: `active` — approved via `wf(release-line): approve rl-v1 [planning → active]`)
**Sub-workflow:** `.wingfoil/workflows/custom/initial-design.yaml`
**Process model:** `docs/self/X_initial-design-plan.md` (generic, reusable per release-line) — this file is
the **concrete, rl-v1-scoped instance** of that process: it enumerates the actual releases, ADRs, Decision
Logs, and Tech-Specs to create, not just the generic phase mechanics.
**Feature refs:** P1.13 (Memory schema — `release`/`adr`/`decision-log`/`tech-spec` types)
**Input:** `docs/01_vision/06_features.md`, `docs/01_vision/07_sequencer.md`, `docs/01_vision/08_mvp-canvas.md`,
`docs/02_requirements/03_sard/`, `docs/02_requirements/01_user_story_map/06_decisions.md`, `docs/03_backlog/`,
`.wingfoil/` (config pillars)

---

## Purpose

Execute `release-line-cycle`'s `initial-design` phase for `rl-v1`: generate the v0.1→v1.0 minor-release
roadmap (Phase 1, required), then record the initial ADRs/DLs/Tech-Specs implied by decisions already made
for this release-line, before its `delivery` phase starts (Phases 2–4, optional but populated here — rl-v1
has enough already-made macro decisions worth formalizing up front).

Per CLAUDE.md §6, `wingfoil` is not implemented yet, so Phases 1–4 below are executed **manually**: files are
authored directly under `docs/04_memory/` following each type's template and state machine
(`memory.yaml`), and each `memory.add`/`memory.submit`/`memory.approve` step produces its own git commit per
the commit-format rules in CLAUDE.md §5.1.

None of the elements below exist yet — every row in Phases 1–4 is a document **to create**, not one already
authored elsewhere.

---

## Phase 1 — seed-releases (required)

One `release` file per minor-release wave in `07_sequencer.md`, all `status: draft`, `release-line: "v1"`.
`features:` transcribed verbatim from `06_features.md`'s "Features by Release" tables (already curated —
no re-derivation needed); `requirements:` resolved against the existing `docs/03_backlog/04_backlog/by-release/*.json`
files (all five already present).

| id           | title                                          | version | pillar | requirements                                        | features                                                                                                                                                                                          |
|--------------|-------------------------------------------------|---------|--------|-------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `minor-v0.1` | WingFoil v0.1 — Project Memory + DNA            | v0.1    | P1     | `docs/03_backlog/04_backlog/by-release/v0.1.json`   | P1.1, P1.2, P1.3, P1.5, P1.11, P1.12, P1.13, P2.1, P2.2, P2.4, P2.5, P5.1.1, P5.2.1                                                                                                                |
| `minor-v0.2` | WingFoil v0.2 — Project Directives              | v0.2    | P3     | `docs/03_backlog/04_backlog/by-release/v0.2.json`   | P1.6, P1.7, P1.8, P1.9, P1.10, P3.1, P3.2, P3.3, P3.4, P3.5, P3.6, P3.7, P3.8, P5.2.2                                                                                                              |
| `minor-v0.3` | WingFoil v0.3 — Project Workflow                | v0.3    | P4     | `docs/03_backlog/04_backlog/by-release/v0.3.json`   | P4.1–P4.9, P4.11, P4.13, P4.14, P4.15, P4.16, P4.18, P4.19, P4.20, P5.3.1, P5.3.2, P5.3.3, P5.4.1, P5.4.2, P5.4.3, P5.4.4, X1.1, X1.2                                                              |
| `minor-v0.4` | WingFoil v0.4 — Interaction Layer + Polish      | v0.4    | P5     | `docs/03_backlog/04_backlog/by-release/v0.4.json`   | P1.4, P2.3, P5.1.1 (`--template`), P5.1.2, P5.1.3, P5.1.4, P5.2.3, P5.4.5                                                                                                                          |
| `minor-v1.0` | WingFoil v1.0 — MVP Complete                    | v1.0    | P4     | `docs/03_backlog/04_backlog/by-release/v1.0.json`   | P4.10, P4.12, P4.17                                                                                                                                                                                 |

**Stop-Check:** 5 files, all `draft`, `release-line: "v1"`; each `features:` list matches its
`06_features.md` table; each `requirements:` path resolves (verified above — all 5 JSON files exist).

---

## Phase 2 — seed-adrs (optional → populated)

**Selection rule applied** (per the four ADR buckets — system/ecosystem architecture, core tech stack,
integration/communication models, security/identity strategy): an ADR is seeded here only for a
**release-line-wide, already-decided** structural choice with a citable SARD/feature ref — not for anything
still open or task-local (those stay reactive, seeded later by `release-planning`/`dev-loop`).

| id                                        | title                                                                                                  | sard_ref                          | Bucket                              |
|--------------------------------------------|---------------------------------------------------------------------------------------------------------|------------------------------------|--------------------------------------|
| `adr-001-git-backed-storage`               | Git-backed storage as the single source of truth (no external database or hosted service)              | REQ-SYS-01                        | System/Ecosystem Architecture + Core Stack (DB) |
| `adr-002-modular-monolith-dual-interface`  | Single shared core behind a dual CLI + MCP interface — modular monolith, no microservices/client-server split | REQ-SYS-05, REQ-SYS-02             | System/Ecosystem Architecture       |
| `adr-003-declarative-workflow-engine`      | Declarative phase/step/action workflow model with `include()` composition (main/sub) as the agent-orchestration approach | REQ-SYS-06                        | System/Ecosystem Architecture (agent orchestration) |
| `adr-004-mcp-over-stdio`                   | Model Context Protocol over stdio (Resources/Prompts/Tools) as the agent-facing integration surface — no REST/GraphQL API | REQ-INT-01, REQ-INT-03, REQ-SYS-05 | Integration & Communication Models  |
| `adr-005-typescript-node-stack`            | TypeScript + Node.js 18+ as the implementation language/runtime; npm as the distribution channel        | REQ-SYS-09 (feature P2.4)          | Core Tech Stack                     |
| `adr-006-git-identity-role-based-authz`    | Git identity + DNA role-binding as the auth model — no external IAM/OAuth2/Cognito/Auth0 provider        | REQ-SEC-01, REQ-SEC-03, REQ-SYS-08 | Security & Identity Strategy        |
| `adr-007-stateless-state-derivation`       | Stateless state derivation — no separate `.wingfoil/state/` index; state is derived from Memory frontmatter | REQ-SYS-03                        | System/Ecosystem Architecture       |
| `adr-008-per-type-state-machines`          | Configurable per-type state machines — states/transitions declared in `memory.yaml`, not hardcoded per type | REQ-SYS-04                        | System/Ecosystem Architecture       |

Note: no separate "database choice" ADR — `adr-001` already covers it (the decision *is* "no database, git
only"); splitting it out would just restate the same Context/Decision.

**Stop-Check:** each ADR references ≥1 `sard_ref`; each has Context/Decision/Consequences; all reach
`status: accepted` (`memory.submit` → `memory.approve`, approver: Roberto).

---

## Phase 3 — seed-dls (optional → populated)

**Selection rule applied** (per the two DL buckets — excluded technology alternatives, team standardization):
a DL is seeded for a choice that is real (traceable to the Product Brief's "Known Constraints & Assumptions",
"Market Position", or an existing workflow action) but does **not** carry its own SARD ref, so it doesn't
qualify as an ADR — the record is the *comparison/rationale*, not a formal architectural constraint.

| id                                    | title                                                                                          | Bucket                          | Grounding |
|----------------------------------------|--------------------------------------------------------------------------------------------------|-----------------------------------|-----------|
| `dl-001-typescript-over-python`        | Why TypeScript/Node.js and not Python for the CLI/MCP tool and workflow engine                  | Excluded tech alternative         | Companion to `adr-005`; rationale: single language across CLI+MCP+workflow engine, native MCP/Anthropic SDK support, npm-only distribution (vs PyPI) |
| `dl-002-git-branching-trunk-based`     | Git branching strategy for rl-v1 delivery: one short-lived branch per task, direct merge to `main` | Team standardization              | Already implied by `dev-loop.yaml` (`git.create_branch("{task.id}")` → `git.merge(to: main)`) — this DL formalizes *why* (trunk-based, no long-lived release branches) |
| `dl-003-no-cloud-backend`              | Why no cloud backend / hosted DB — local git-only storage                                       | Excluded tech alternative         | Product Brief "Known Constraints": "Git-only Storage: No cloud backend"; companion to `adr-001` |
| `dl-004-keyword-search-only`           | Why keyword search and not semantic/NLP search for the rl-v1 MVP                                | Excluded tech alternative         | Product Brief "Known Constraints": "Keyword Search Only: Semantic search deferred to v1.1+" |
| `dl-005-manual-approval-gates`         | Why approval gates are manual — no automated workflow triggers in the MVP                       | Excluded tech alternative (process) | Product Brief "Known Constraints": "Manual Approval Gates: No automated workflow triggers in MVP" |
| `dl-006-no-native-ide-plugin`          | Why no native IDE plugin in the MVP — MCP is the only integration surface                       | Excluded tech alternative         | Product Brief "Known Constraints": "No IDE Plugins in MVP: MCP sufficient; native integration in v1+" |
| `dl-007-single-project-scope`          | Why one `.wingfoil/` per repo — no multi-project support in the MVP                              | Excluded tech alternative (scope) | Product Brief "Known Constraints": "Single Project: One `.wingfoil/` instance per repo (multi-project in v1+)" |
| `dl-008-cli-first-no-gui`              | Why CLI-only — no web dashboard/GUI in the MVP                                                   | Excluded tech alternative (scope) | Product Brief "Market Position"/roadmap: dashboard UI is explicitly Post-MVP (`06_features.md` Post-MVP table); broader than `dl-006` (no UI surface at all, not just no IDE plugin) |
| `dl-009-builtin-workflow-templates`    | Why workflow templates (Scrum/Kanban/Lean/Trunk-Based) are shipped pre-built, not generated on demand | Team standardization              | `06_features.md` P4.18/P4.19 — curated, tested templates vs. unpredictable generated ones |
| `dl-010-minimal-dependencies`          | Why production dependencies are capped at ~10                                                    | Team standardization (engineering guardrail) | Supply-chain/install-weight risk for a tool that runs inside other repos; keeps to the stack already in `dna.yaml` (Commander, chalk, Zod, MCP SDK) |
| `dl-011-git-derived-audit-trail`       | Why the audit trail is derived from git history — no separate audit-log store                    | Excluded tech alternative         | Makes explicit a consequence only implicit in `adr-001`/`adr-007`; grounds `wingfoil memory history` (P1.10) as a thin view over `git log`, not a second data store |
| `dl-012-decision-log-state-machine`    | Whether `decision-log` gets its own state machine (`draft → in-discussion → ready → in-develop → done`) instead of the default (`draft → pending → approved/rejected`) | Team standardization (Memory schema) | The default machine models a simple approval, not "accepted → converted into release tasks → those tasks done" — decide before `spec-001` fixes `memory.yaml`'s state format |

**Explicitly out of scope for this phase:** a "test coverage threshold" DL — already fixed globally in
`dna.yaml` (`tech_stack.testing.coverage_target: ">80%"`, `conventions.engineering.coverage`), not
release-line-specific, so re-deciding it here would just duplicate an existing record.

**Stop-Check:** each DL has Context/Decision/Rationale; all reach `status: approved` (`memory.submit` →
`memory.approve`).

---

## Phase 4 — seed-specs (optional → populated)

**Selection rule applied** (per the three Tech-Spec buckets — core data models/base schemas, bounded-context
API contracts, code/security conventions): only artefacts that span the **whole release-line** (used by
every release/task within rl-v1), not artefacts scoped to one release's tasks (those are `release-planning`'s
`identify-specs` job).

| id                              | title                                                                                    | scope                                                                 | Bucket |
|----------------------------------|--------------------------------------------------------------------------------------------|--------------------------------------------------------------------------|--------|
| `spec-001-memory-yaml-schema`    | Memory Element Schema (`MemoryYaml`) — type catalog, `id_pattern` engine, `template` block, and a `sequence`/`gates`/`waiting` state-machine format (ordered chain + per-state approve/reject + engine-triggered edges) in place of a `transitions` dict, to remove the ambiguity of which target is `approve` vs `reject` when a state has more than one legal transition | `.wingfoil/memory.yaml`                                      | Core Data Models / Base Schemas |
| `spec-002-dna-yaml-schema`       | Project DNA Schema (`DnaYaml`) — `modules`, a generic `stacks` section (technologies/methodologies lists, not fixed keys), `team`/`agents`, `paths` | `.wingfoil/dna.yaml`                                          | Core Data Models / Base Schemas |
| `spec-003-workflows-yaml-schema` | Workflow Definition Schema (`WorkflowsYaml`) — top-level `include:` manifest (the field is `includes:` today and needs renaming to the singular `include:`), per-file DSL (`phases`, `actions`, `produces`, `checks`, `approval`/`fallback`, `iterate_over`/`where`) | `.wingfoil/workflows.yaml`, `.wingfoil/workflows/**/*.yaml` | Core Data Models / Base Schemas |
| `spec-004-mcp-surface-contract`  | MCP Server Surface Contract — Resources (read-only) / Prompts (role-based) / Tools (state-mutating) | `src/mcp` (planned) — REQ-INT-01, REQ-INT-02, REQ-INT-03, REQ-SEC-05    | Bounded-Context API Contracts |
| `spec-005-cli-command-contract`  | CLI Command & Output Contract — command surface, exit-code contract (0/1/2), `--format console\|json\|yaml`, error message format | `src/cli` (planned) — REQ-INT-04, REQ-INT-05, REQ-INT-08                | Bounded-Context API Contracts |
| `spec-006-core-domain-api`       | Core Domain API — the internal contract both CLI and MCP bind to, guaranteeing behavior parity | `src/core` (planned) — REQ-SYS-05                                       | Bounded-Context API Contracts |
| `spec-007-secret-hygiene-patterns` | Secret & Credential Hygiene Patterns — the concrete regex/pattern set and scan procedure backing the `security-secrets` directive | `.wingfoil/directives/custom/security-secrets.md` + future scan tooling — REQ-SEC-08, REQ-SEC-10 | Code & Security Conventions |
| `spec-008-cli-grammar`           | CLI Grammar & Global Options — invocation grammar, global flags, interactive-prompt rules, element-ref syntax | `src/cli` (planned) — REQ-INT-04, REQ-INT-05, REQ-INT-08 | Bounded-Context API Contracts (widens `spec-005` into the full grammar, not just exit-code/output-format) |
| `spec-009-validation-strategy`   | Validation Strategy — shared two-pass (structural Zod / semantic) algorithm, shared regex constants, validation trigger points, unknown-field `.passthrough()` warning policy tying `spec-001`/`002`/`003`/`008` together | `src/validation` (planned) | Code & Security Conventions (cross-cutting, not one bounded context) |
| `spec-010-memory-frontmatter-schema` | Memory Document Frontmatter base schema — the per-document `id`/`type`/`status`/`created`/`version`/`state_history` contract every Memory document instance carries, one layer below `spec-001`'s type registry | `docs/04_memory/**/*.md` frontmatter — REQ-STATE-01 | Core Data Models / Base Schemas |
| `spec-011-storage-layout`        | `.wingfoil/` Storage Layout — directory tree, `built-in/` vs `custom/` split, `.gitignore` marker-append behavior, init-marker detection, git-root-detection algorithm | `.wingfoil/` — REQ-SYS-01 (rounds it out beyond just Memory path patterns) | Core Data Models / Base Schemas |
| `spec-012-context-loader-relevance-filtering` | Agent Context Loader — how DNA + directives + relevant Memory get assembled/filtered per role/task (`<30s` assembly target, bounded payload size) | `src/core` (planned) — REQ-SYS-07 (Determinism North Star), P5.3.3, P5.4.3, P5.4.4 | Bounded-Context API Contracts (core↔agent-execution boundary) |

**Mapping notes (no silent gaps):** the illustrative categories "encryption-at-rest format" and "system log
conventions" don't have a real WingFoil equivalent yet — there's no encrypted data (Memory/DNA are plaintext
git-tracked YAML/Markdown by design, REQ-SEC-08/`is-isnot.md`) and no runtime logging subsystem (no code
exists yet). The closest real artefacts are captured instead: secret-hygiene detection patterns
(`spec-007`) and the CLI error/message format (folded into `spec-005`/`spec-008`, per REQ-INT-08).

**Stop-Check:** each tech-spec has Context/Specification/Consequences; each is not already covered by an
existing approved spec (none exist yet — verified: `docs/04_memory/design/` is currently empty);
all reach `status: approved`.

---

## Launch Checklist

- [x] Input available: `rl-v1` is `active` (`release-line-cycle`'s `approve` phase ran — commit `aab96dd`).
- [x] **Phase 1 — seed-releases:** create 5 `release` files per the table above, `status: draft`.
- [x] **Phase 2 — seed-adrs:** create 8 ADR files per the table above; `memory.submit` → `memory.approve` each.
- [x] **Phase 3 — seed-dls:** create 12 Decision Log files per the table above; `memory.submit` → `memory.approve` each.
- [x] **Phase 4 — seed-specs:** create 12 Tech-Spec files per the table above; `memory.submit` → `memory.approve` each.
- [x] As part of `spec-001`/`spec-003`'s approval: migrate `.wingfoil/memory.yaml` states from
  `transitions` dict to `sequence`/`gates`/`waiting`, and rename `workflows.yaml`'s `includes:` → `include:`.
- [x] Update `rl-v1.md`'s "Execution Notes → Initial Design" section with a summary once all phases commit.
- [x] Update Claude Code auto-memory (MEMORY.md) once `rl-v1`'s initial-design content lands (CLAUDE.md §10 rule 9).

Each `memory.add`/`memory.submit`/`memory.approve` is its own commit per CLAUDE.md §5.1 — **37 elements
total** (5 releases + 8 ADRs + 12 DLs + 12 specs), batched by type/operation as usual (e.g. one `memory.add`
commit can register several ids of the same type at once per the `wf({type}): add {id1}, {id2}` format —
one commit per operation, not necessarily per element).

Next: `release-line-cycle`'s `delivery` phase — one `release-cycle` per minor release seeded in Phase 1,
starting with `minor-v0.1`.