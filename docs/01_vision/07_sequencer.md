# Sequencer — WingFoil MVP (v0.1 → v1.0)

**Version:** 2.0
**Date:** 2026-10-15
**Status:** Approved

---

## Re-baseline on active days (v1.4, 2026-09-29)

The calendar below this section is the **original plan** (v1.3, 2026-06-24). It is kept as written, for
comparison, and is **no longer the schedule**: it assumed one release per calendar week, with no pause and
no scope growth, and neither held. Per `dl-096-schedule-rebaseline-on-active-days` (ratified as Q1 (a),
Q2 (i)), release budgets are now stated in **active days**, and the calendar is a **forecast that states
its cadence assumption**. The forecast is refreshed at every release's retrospective.

**Definitions.**

- An **active day** is a calendar date on which at least one commit has its committer date.
- A **gap** is the number of days between two consecutive active dates.
- **Tasks** are the `task` elements of a release (the files under `docs/04_memory/{release}/`).
- **Features** are the entries of the `release` element's `features` list
  (`docs/04_memory/planning/rl-v1/{id}.md`).

### Actuals — v0.1 and v0.2

Measured at `a20b346c` (the merge of v0.2's `release-publishing`), from the commands in
`retrospective-rel-v0.2-plan` §6.9, re-run for this revision:

| Phase / release           | Planned (original) | Actual                                       | Active days                                      | Tasks planned → shipped | Features |
|---------------------------|--------------------|----------------------------------------------|--------------------------------------------------|-------------------------|----------|
| Inception + specification | —                  | 2026-06-14 → 07-03                           | 9                                                | —                       | —        |
| v0.1                      | Jul 10             | released 2026-07-08 (`5b16ab61`)             | 5 (07-04 → 07-08)                                | 33 → 33                 | 13       |
| v0.2                      | Jul 17             | released 2026-09-28 (`d2ad1f3f`)             | ≈ 12 (07-08 after v0.1's release, 07-09, then 11 dates 09-14 → 09-28) | 32 → 75                 | 14       |
| Pause                     | —                  | 2026-07-09 → 09-14                           | **0 (a 67-day gap)**                             | —                       | —        |

Source commands (all at `a20b346c`):

- Active dates: `git log a20b346c --format=%cd --date=short | sort -u` → 26 dates; 06-14 … 07-03 are 9,
  07-04 … 07-08 are 5, 09-14 … 09-28 are 11.
- Gaps longer than two days: the same list, differenced → 06-14 → 06-21 (7), 06-26 → 06-29 (3),
  06-29 → 07-02 (3), **07-09 → 09-14 (67)**, 09-18 → 09-21 (3), 09-25 → 09-28 (3).
- Release dates: `git log a20b346c --format='%h %cd %s' --date=iso --grep=minor-v0.1 --grep=minor-v0.2 | grep released`
  → `5b16ab61 2026-07-08 11:42` (v0.1 `releasing → released`) and `d2ad1f3f 2026-09-28 11:24` (v0.2).
  2026-07-08 is shared: v0.1 was released that morning and v0.2 work followed, which is why v0.2's count
  is approximate.
- Tasks shipped: `git ls-tree --name-only a20b346c docs/self/docs/04_memory/v0.1/ | wc -l` → 33, and the
  same for `v0.2/` → 75 (the Memory lived under `docs/self/` at that commit).
- v0.2 tasks planned: `task-034` … `task-065` at the end of v0.2's `release-planning`
  (`release-planning-rel-v0.2-plan`); counted with the same `ls-tree`, filtered to ids 34–65 → 32.
- Features: the `features:` list of `minor-v0.1.md` and `minor-v0.2.md` → 13 and 14.

**What the actuals say.**

- **Velocity held**: v0.1 shipped 33 tasks in 5 active days (6.6 a day), v0.2 75 in ≈ 12 (≈ 6.25 a day);
  pooled, 108 ÷ 17 ≈ 6.35. The planning figure used below is **6.5 tasks per active day**, the one
  v0.2.2's `build-backlog` used, ratified by the approver on 2026-09-29 as the rate that stands; at
  6.35 the v0.2.2 budgets below would change by at most 0.1 day.
- **v0.2's calendar slip is the pause**, and its active-day overrun (≈ 12 against the plan's 5) is scope:
  32 tasks planned, 75 shipped (2.3×).
- **Cadence when working**: 11 of the 15 calendar days from 09-14 to 09-28 were active, **about 5 active
  days a week**.

### Active-day budgets per release

A budget is set by each release's own `release-planning`. Until a release has one, it carries
`dl-096`'s proxy: v0.2's ≈ 12 active days for 14 features, scaled by the release's feature count.

| Release | Features | Budget (active days)                                             | Source                                                                         |
|---------|----------|------------------------------------------------------------------|--------------------------------------------------------------------------------|
| v0.2.2  | —        | **≈ 2.2** by task count; ≈ 4 by `dl-096`'s proxy; expect nearer 4 | v0.2.2 `build-backlog`: 14 tasks ÷ 6.5 per active day; see the note below       |
| v0.3    | 23       | **≈ 18.6** by task count; ≈ 66 by task size                     | v0.3 `build-backlog` (2026-09-30): 121 tasks ÷ 6.5 per active day; see the note below |
| v0.4    | 11       | ≈ 9                                                              | proxy, 11 ÷ 14 × 12                                                             |
| v1.0    | 3        | ≈ 5                                                              | the plan's own estimate; the proportional figure is ≈ 3                        |

- **v0.2.2 is a patch with no feature scope of its own**, so the feature proxy does not apply to it. Its
  `build-backlog` (2026-09-29, merged at `4770a52c`) measured **14 tasks**
  (`git ls-tree --name-only 4770a52c docs/self/docs/04_memory/v0.2.2/ | wc -l` → 14), hence
  14 ÷ 6.5 ≈ **2.2 active days**. `dl-096`'s proxy of ≈ 4 weighs the configuration move to the root
  (`task-111`), one task but the largest change of the patch; the task count underweights it.
- **Recalculated after build-backlog**: `task-123` was added on 2026-09-29 from a review finding
  (`50c64846`, `wf(task): add task-123-…`), so the backlog is now **15 tasks**
  (`ls docs/04_memory/v0.2.2/ | wc -l` → 15 at `c3df9df3`): 15 ÷ 6.5 ≈ **2.3 active days**. The
  budget recorded by `build-backlog` stays 14 tasks / 2.2 days; this is the update, not a rewrite.
- **v0.3's budget (2026-09-30).** Its `build-backlog` created **121 tasks** (`task-126` … `task-246`), so
  the count gives 121 ÷ 6.5 ≈ **18.6 active days**, near the ≈ 20 proxy it replaces. Weighted by task size
  (S 0.25, M 0.75, L 2 active days) the same backlog is ≈ 66 active days. The approver kept the
  whole scope; the gap is recorded so v0.3's retrospective can tell which figure the actuals follow.
- Features per release: the `features:` list of `minor-v0.3.md`, `minor-v0.4.md`, `minor-v1.0.md`
  → 23, 11, 3 (after the scope change below; 26, 8, 3 before it).

### Calendar forecast

**Cadence assumption: about 5 active days a week (the rate observed 09-14 → 09-28), with work running
continuously from October 2026 and no pause.**

- The budgets sum to ≈ 38 active days (4 + 20 + 9 + 5, taking v0.2.2 at the proxy), **≈ 40 with a
  retrospective per release**. The v0.3 → v0.4 move below shifts two days between releases and leaves
  the sum unchanged.
- At 5 active days a week that is **about 8 weeks**: **v1.0 (the MVP) around late November 2026**,
  against the original plan's 2026-08-07.
- This is a **projection, not a commitment**. If the cadence changes, recompute: weeks = 40 ÷ active
  days per week. If a release's own `release-planning` sets a different budget, it replaces the proxy
  above.
- **Refresh rule** (`dl-096` Q2 (i)): each release's retrospective records the release's actual active
  days in the table above and refreshes this forecast.

### Scope changes since the original plan (v1.5, 2026-09-29)

Recorded here because the week tables below stay as first approved. Each change was ruled by the
approver during v0.3's `release-planning` (`release-planning-rel-v0.3-plan`, rulings R2 and R3):

- **Reference workflow templates (P4.18–P4.20) move from v0.3 to v0.4.** The Week 3 rows *Reference
  workflow templates* and *Template expansion + customization* are now v0.4 work. v0.4's Definition of
  Done already lists the reference templates. `minor-v0.3` and `minor-v0.4` carry the same move in
  their `features:`.
- **v0.3's Definition of Done, "Memory lifecycle verbs … integrated into workflow steps",** needed
  atomic step execution (P4.10), which stays in v1.0 with workflow checks (P4.12). For v0.3 it reads:
  `workflow next` names the current step's verb, role and element, and `agent execute --next`
  launches the agent on it. The step itself is executed from v1.0.
- **The agent wrapper launches the agent's own CLI through a declared adapter**, not an SDK. The
  row `` `wingfoil agent execute [--next]` wrapper `` keeps its place in v0.3; the change of
  mechanism is recorded by an ADR during v0.3's planning.
- **Git-hook notifications move from v0.3 to v0.4** (v1.6, 2026-09-30, ruling R13). v0.3 notifies
  through the CLI output of `workflow status` and `workflow next`; the row *Notification system (basic:
  CLI output + git hooks)* keeps its CLI half in v0.3.

---

> **Original plan (v1.3, 2026-06-24), kept for comparison.** The *Timeline Overview*, the
> *Week-by-Week Breakdown* and the *Critical Path* below are the weekly schedule as first approved,
> unchanged; their dates are superseded by the re-baseline above.

## Timeline Overview

| Week  | Target Release | Focus                         | Deliverables                                                          | Go/No-Go  |
|-------|----------------|-------------------------------|-----------------------------------------------------------------------|-----------|
| **1** | v0.1 (Jul 10)  | Core Infrastructure           | Memory, DNA, git integration, workflow schema, core CLI               | Must have |
| **2** | v0.2 (Jul 17)  | CLI + Directives              | Directives, memory state transitions, directive assignment            | Must have |
| **3** | v0.3 (Jul 24)  | Agent Execution + Workflow    | Agent wrapper, workflow commands, reference templates                 | Must have |
| **4** | v0.4 (Jul 31)  | MCP + Migration               | init --mode infer, audit, dna infer, import, MCP Resources            | Must have |
| **5** | v1.0 (Aug 7)   | Workflow Completion + Release | Workflow checks, workflow validation, templates, testing, npm publish | Must have |

---

## Week-by-Week Breakdown

### Week 1 — v0.1: Project Memory + Project DNA (Jul 10)

**Goal:** Deliver Pillar 1 (Memory) + Pillar 2 (DNA). Build the storage, versioning, and structural foundation layers.

| Feature                                                    | Effort               | Owner | Status |
|------------------------------------------------------------|----------------------|-------|--------|
| `.wingfoil/` directory structure                           | S                    | Dev   |        |
| Project Memory (file storage + git versioning)             | M                    | Dev   |        |
| `.wingfoil/memory.yaml` (element schema + per-type states) | M                    | Dev   |        |
| Project DNA (YAML schema + validation)                     | S                    | Dev   |        |
| Git integration (commit, blame, history)                   | M                    | Dev   |        |
| `.gitignore` patterns for WingFoil                         | S                    | Dev   |        |
| `wingfoil init` (basic wizard)                             | M                    | Dev   |        |
| `wingfoil dna set/show`                                    | S                    | Dev   |        |
| `wingfoil memory add`                                      | M                    | Dev   |        |
| `wingfoil memory search` (keyword search)                  | M                    | Dev   |        |
| `wingfoil paths [category]` (resource path query)          | M                    | Dev   |        |
| MCP Resources skeleton (DNA + Memory endpoints)            | M                    | Dev   |        |
| `.wingfoil/workflows.yaml` schema (foundation only)        | M                    | Dev   |        |
| **Week 1 Total**                                           | **~13 story points** |       |        |

**Outputs:**

- v0.1 released: Project Memory + DNA fully functional
- Solo developers (Alex) can initialize projects and store decisions
- MCP Resources available for agents to query DNA and Memory
- Journey 0a (new project) and Journey 1 (Alex) can begin
- All state versioned in git with audit trail

**Blockers:** None (greenfield infrastructure)
**Risk:** Scope creep on MCP resources — keep read-only, defer writes to v0.2

---

### Week 2 — v0.2: Project Directives (Jul 17)

**Goal:** Deliver Pillar 3 (Directives). Build directive management and role-based binding.

| Feature                                                     | Effort               | Owner | Status |
|-------------------------------------------------------------|----------------------|-------|--------|
| `wingfoil memory history` (audit trail)                     | S                    | Dev   |        |
| `wingfoil memory submit/approve/reject` (state transitions) | M                    | Dev   |        |
| `wingfoil directive create` (custom directive)              | S                    | Dev   |        |
| `wingfoil directive assign` (bind to role)                  | M                    | Dev   |        |
| `wingfoil directive remove` (remove directive)              | S                    | Dev   |        |
| `wingfoil directives list` (query directives)               | S                    | Dev   |        |
| Built-in directive templates (6 types)                      | M                    | Dev   |        |
| Auto-Load Directives by Role (feature)                      | M                    | Dev   |        |
| Role-Based Directive Assignment (feature)                   | M                    | Dev   |        |
| MCP Prompts (role-based directive templates)                | M                    | Dev   |        |
| CLI testing + documentation                                 | M                    | Dev   |        |
| **Week 2 Total**                                            | **~11 story points** |       |        |

**Outputs:**

- v0.2 released: Project Directives fully functional
- Tech leads (Morgan) can define and assign team rules
- Agents auto-load directives by role
- Journey 2 (Sam - reviewer) can use directives in review
- Journey 3 (Jordan - team dev) auto-receives directives

**Blockers:** None (depends only on Week 1)

**Risk:** Directive complexity may overwhelm users — deliver all 6 built-in templates but keep directive UX simple.

---

### Week 3 — v0.3: Project Workflow (Jul 24)

**Goal:** Deliver Pillar 4 (Project Workflow) plus agent execution (Pillar 5.3). Build workflow commands and approval
cycle.

| Feature                                                         | Effort               | Owner | Status |
|-----------------------------------------------------------------|----------------------|-------|--------|
| `wingfoil workflow next` (show next step + directives)          | M                    | Dev   |        |
| `wingfoil workflow status` (show all workflows)                 | S                    | Dev   |        |
| `wingfoil workflow start {workflow}`                            | S                    | Dev   |        |
| `wingfoil workflow end {workflow}`                              | S                    | Dev   |        |
| `wingfoil workflow list` (list available workflows)             | S                    | Dev   |        |
| `wingfoil workflow show` (show workflow details)                | S                    | Dev   |        |
| `wingfoil workflow create` / `remove` (custom workflows)        | M                    | Dev   |        |
| Deliverable state transitions (frontmatter + tracking)          | M                    | Dev   |        |
| Workflow state deduction from Memory (feature)                  | M                    | Dev   |        |
| Approval routing (role-based from DNA)                          | M                    | Dev   |        |
| Fallback on rejection (jump to previous step)                   | M                    | Dev   |        |
| `wingfoil agent execute [--next]` wrapper                       | M                    | Dev   |        |
| Agent role selection per workflow step                          | M                    | Dev   |        |
| Notification system (basic: CLI output + git hooks)             | M                    | Dev   |        |
| Reference workflow templates (Scrum, Kanban, Lean, Trunk-Based) | M                    | Dev   |        |
| Template expansion + customization                              | M                    | Dev   |        |
| **Week 3 Total**                                                | **~16 story points** |       |        |

> **Note:** the Memory lifecycle verbs (`memory add/submit/approve/reject`) are delivered in v0.1–v0.2;
> Week 3 covers only their **integration** into workflow steps (state transitions, approval routing,
> fallback), already accounted for by the deduction/routing/fallback rows above.

**Outputs:**

- v0.3 released: Project Workflow fully functional
- Agents can be launched with full workflow context
- Workflow approval cycle complete (per-type state machines; default draft → pending → approved; reject → draft and
  the fallback step)
- Journey 1 (Alex) fully functional with workflow integration
- Journey 2 (Sam - reviewer) approval workflow functional
- Journey 3 (Jordan) task execution with auto-loaded directives functional
- Journey 4 (Morgan - enforce) governance through directives functional
- Built-in workflow templates available for onboarding

**Blockers:**

- Agent wrapper must integrate cleanly with MCP (dependency: Weeks 1–2)
- Fallback logic is complex; start simple

**Risk:** Workflow state machine and fallback logic complexity. Fallback: simpler state machine (no fallback in MVP)

---

### Week 4 — v0.4: Interaction Layer + Polish (Jul 31)

**Goal:** Complete Pillar 5 (Interaction Layer): MCP server, migration tooling, and polish. (Agent execution shipped in
v0.3.)

| Feature                                         | Effort               | Owner | Status |
|-------------------------------------------------|----------------------|-------|--------|
| `wingfoil audit` (scan project state)           | M                    | Dev   |        |
| `wingfoil init --mode infer`                    | M                    | Dev   |        |
| `wingfoil dna infer` (propose DNA from code)    | L                    | Dev   |        |
| `wingfoil dna show` enhancements                | S                    | Dev   |        |
| `wingfoil memory import` (import existing docs) | M                    | Dev   |        |
| MCP server (Node.js, stable)                    | M                    | Dev   |        |
| MCP Resources (DNA + Memory endpoints)          | M                    | Dev   |        |
| MCP Tools (workflow state management)           | M                    | Dev   |        |
| CLI UX improvements (help, formatting, errors)  | M                    | Dev   |        |
| **Week 4 Total**                                | **~10 story points** |       |        |

**Outputs:**

- v0.4 released: Full Interaction Layer + Polish
- Existing projects can adopt WingFoil via `init --mode infer` (Journey 0b)
- Agents can query and update state via full MCP integration
- Journey 5 (Casey - PM visibility) fully functional
- Journey 6 (Morgan - workflow evolution) fully functional
- All CLI commands documented and user-friendly

**Blockers:**

- `dna infer` is highest complexity — if it slips, fallback to manual guidance
- MCP requires stable v0.1–v0.3 features

**Risk:** Scope creep on `dna infer`. Fallback: simpler heuristics or defer to v1.0

---

### Week 5 — v1.0: MVP Complete (Aug 7)

**Goal:** Complete workflow features, integration testing, and release as MVP.

| Feature                                                     | Effort               | Owner | Status |
|-------------------------------------------------------------|----------------------|-------|--------|
| Workflow checks (pre/post execution validation)             | M                    | Dev   |        |
| Checks: file.exists, frontmatter.required, git rules, tests | M                    | Dev   |        |
| Workflow steps with atomic actions (feature)                | M                    | Dev   |        |
| Element types + custom states configuration                 | M                    | Dev   |        |
| Workflow YAML validation + error handling                   | M                    | Dev   |        |
| Built-in workflow templates refinement & completion         | M                    | Dev   |        |
| Integration testing (all 8 journeys)                        | L                    | Dev   |        |
| Documentation (README, API guide, workflow examples)        | L                    | Dev   |        |
| Release testing + edge cases                                | M                    | Dev   |        |
| npm package setup + publish                                 | S                    | Dev   |        |
| Release notes + announcement                                | S                    | PM    |        |
| **Week 5 Total**                                            | **~13 story points** |       |        |

**Outputs:**

- v1.0 released: WingFoil MVP complete with all 5 pillars integrated
- All 8 journeys (0a, 0b, 1–6) fully functional end-to-end
- All features from v0.1–v0.4 stable and polished
- Comprehensive documentation and examples provided
- Published to npm with semantic versioning
- Ready for early adopter validation and feedback

**Blockers:** None (depends on Weeks 1–4)

**Risk:** Integration testing complexity. Mitigate with automated end-to-end tests and async AI code review

---

## Critical Path

```
Week 1 (v0.1: Memory + DNA) → Release July 10
    ↓
Week 2 (v0.2: Directives) ← depends on Week 1 → Release July 17
    ↓
Week 3 (v0.3: Project Workflow) ← depends on Weeks 1-2 → Release July 24
    ↓
Week 4 (v0.4: Interaction Layer) ← depends on Weeks 1-3 → Release July 31
    ↓
Week 5 (v1.0: MVP Complete) ← depends on Weeks 1-4 → Release Aug 7
```

**No parallelization possible** — each pillar release depends on the previous. All features (Memory, DNA, Directives,
Workflow, Interaction) are integrated progressively across 5 weeks, with weekly releases on target dates.

---

## Risk Mitigation

| Risk                                                | Likelihood | Impact       | Mitigation                                                                          |
|-----------------------------------------------------|------------|--------------|-------------------------------------------------------------------------------------|
| Workflow state machine logic too complex            | High       | **Critical** | Start simple: draft → pending → approved only; no advanced fallback in MVP          |
| `dna infer` complexity balloons                     | Medium     | High         | Simplify heuristics; fallback to manual guidance                                    |
| Workflow checks validation (git, tests, etc.) slips | Medium     | High         | Defer advanced checks to v1.1 (post-MVP); MVP: basic file + frontmatter checks only |
| Agent wrapper integration with MCP fails            | Medium     | High         | Prototype agent wrapper early in Week 2; test with MCP skeleton                     |
| MCP spec changes or integration issues              | Low        | Medium       | Start MCP early in Week 1 (Resources skeleton); test aggressively                   |
| Documentation lag                                   | Medium     | Low          | Keep docs minimal; focus on API examples + workflow-config.md                       |
| Scope creep on directives validation                | High       | High         | Push automated CI/CD validation to post-MVP                                         |
| Team velocity lower than estimated                  | Medium     | Medium       | Cut Week 5 if needed; push workflow checks + polish to v1.1 (post-MVP)              |

---

## Definition of Done (per Release)

### v0.1 Definition of Done (Project Memory + DNA)

- ✓ Git storage layer functional (`.wingfoil/` structure, commit tracking)
- ✓ Memory commands work (add, search)
- ✓ DNA YAML schema defined and validated
- ✓ CLI commands tested locally (`init`, `dna set/show`, `memory add/search`, `paths`)
- ✓ MCP Resources endpoint (DNA + Memory) functional
- ✓ >80% test coverage on core modules (storage, validation) (no published summary: before dl-136)
- ✓ README + quickstart guide documented
- ✓ npm package published with v0.1.0 tag
- ✓ Journey 0a (new project) and Journey 1 (Alex) manually tested end-to-end

### v0.2 Definition of Done (Project Directives)

- ✓ All v0.1 features stable (no regressions)
- ✓ `wingfoil memory history` (audit trail) functional
- ✓ Directive commands work (`create`, `assign`, `remove`, `list`)
- ✓ Built-in directive templates (6 types: Code Quality, Testing, Code Review, Architecture, Security, Documentation)
- ✓ Role-based directive auto-loading functional
- ✓ MCP Prompts endpoint functional
- ✓ >80% test coverage on directive module (no published summary: before dl-136)
- ✓ Directive documentation + examples included
- ✓ npm package v0.2.0 published
- ✓ Journey 2 (Sam - review) and Journey 3 (Jordan - team dev) manually tested

### v0.3 Definition of Done (Project Workflow)

- ✓ All v0.2 features stable (no regressions)
- ✓ Workflow commands functional (start, end, list, show, create, remove, next, status); Memory lifecycle verbs (
  submit/approve/reject) integrated into workflow steps
- ✓ State transitions working (per-type state machines; default draft → pending → approved; reject → draft and the
  fallback step)
- ✓ Approval routing by role functional
- ✓ Notification system (basic CLI output + git hooks) functional
- ✓ Agent execute wrapper (<30 sec context load) working
- ✓ >80% test coverage on workflow module (tag run's summary: `docs/07_gates/rl-v1/rel-v0.3-test-results.md`, `dl-136`)
- ✓ npm package v0.3.0 published
- ✓ Journey 4 (Morgan - enforce) manually tested end-to-end

### v0.4 Definition of Done (Interaction Layer + Polish)

- ✓ All v0.3 features stable (no regressions)
- ✓ `wingfoil init --mode infer` functional
- ✓ `wingfoil audit` functional
- ✓ `wingfoil dna infer` functional (or simplified fallback)
- ✓ `wingfoil memory import` functional
- ✓ MCP server stable (Resources + Tools + Prompts all working)
- ✓ Reference workflow templates (Scrum, Kanban, Lean, Trunk-Based) functional
- ✓ CLI help + error messages polished
- ✓ >80% test coverage on all modules (tag run's summary: `docs/07_gates/rl-v1/rel-v0.4-test-results.md`, `dl-136`)
- ✓ npm package v0.4.0 published
- ✓ Journey 5 (Casey - PM) and Journey 6 (Morgan - evolution) manually tested

### v1.0 Definition of Done (MVP Complete)

- ✓ All v0.4 features stable (no regressions)
- ✓ All 8 user journeys (0a, 0b, 1–6) executable and tested
- ✓ Comprehensive documentation (API guide, workflow examples, troubleshooting)
- ✓ Integration testing (end-to-end for all journeys) passing
- ✓ Determinism Index reported (I, P, O): Input at its 100% target; Process conformance and Outcome equivalence
  published with their trend; Outcome informs the retrospective and does not gate the release (`dl-131`)
- ✓ Audit trail verified (all changes tracked to author + timestamp)
- ✓ npm package v1.0.0 published with release notes
- ✓ Security review completed (no secrets in repo, audit trail works)
- ✓ Ready for early adopter onboarding

---

## Success Criteria (v1.0 MVP)

- ✓ All 8 user journeys executable and tested (0a, 0b, 1–6)
    - ✓ Journey 0a: New project setup with template
    - ✓ Journey 0b: Existing project migration
    - ✓ Journey 1: Alex (solo dev) with auto-loaded context
    - ✓ Journey 2: Sam (reviewer) with review workflow
    - ✓ Journey 3: Jordan (team dev) with directives
    - ✓ Journey 4: Morgan (tech lead) with governance
    - ✓ Journey 5: Casey (PM) with decision visibility
    - ✓ Journey 6: Morgan (tech lead) with workflow evolution
- ✓ Workflow state transitions work correctly (per-type state machines; default draft → pending → approved;
  reject → draft and the fallback step)
- ✓ Agent wrapper loads directives + context correctly in <30 seconds
- ✓ No data loss or corruption from git integration
- ✓ CLI is intuitive and self-documenting (`--help` works)
- ✓ MCP server is stable and responds under 1 second
- ✓ All 5 pillars integrated: Memory, DNA, Directives, Workflow, Interaction Layer
- ✓ Full integration testing (end-to-end) for all journeys
- ✓ Workflow YAML validation catches syntax errors
- ✓ Released to npm with correct metadata and documentation

---

## Capacity & Assignments

| Role          | Capacity       | MVP Assignments                   |
|---------------|----------------|-----------------------------------|
| Dev (Roberto) | 100%           | All feature development + testing |
| PM            | 20% (advisory) | Release notes, stakeholder comms  |
| UX            | Advisory       | CLI ergonomics review (async)     |

**Note:** Single developer — must be pragmatic about scope. Async code reviews with AI agents to unblock.
