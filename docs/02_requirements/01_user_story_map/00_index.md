# User Story Map — Index

**Module:** 1 — User Story Map Document
**Source:** Product Vision Package (`docs/01_vision/`) — Lean Inception
**Input:** `04_personas.md`, `05_journeys.md`, `06_features.md`, `07_sequencer.md`, `08_mvp-canvas.md`
**Generated:** 2026-06-26

---

## Purpose

Breaks down features and 8 user journeys into atomic value-oriented stories.
The **backbone** (horizontal axis) is provided by journeys; each journey file contains
sequential **steps** and, under each step, prioritized **vertical stories**.

## Legend of prioritization tags

| Tag             | Meaning                                                                                                                                                                              |
|-----------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **[MVP]**       | Feature included in MVP (release v0.1 → v1.0). Annotated with wave: `[MVP · v0.x]`. The final wave **v1.0** is not pure stabilization: per `07_sequencer.md` it delivers real feature work (the highest-risk Workflow machinery — P4.10, P4.12, P4.17) alongside hardening. |
| **[Release-2]** | **Not planned.** The current sequencer does not define a separate "Release-2" wave: MVP covers the entire arc v0.1→v1.0. Section maintained for format consistency, currently empty. |
| **[Future]**    | Post-MVP item (v1.1+): deferred beyond MVP (see `06_features.md` → "Post-MVP").                                                                                                       |

> **Note on release → tag mapping.** In `07_sequencer.md` the 5 weekly releases
> (v0.1 → v1.0) constitute *all* the MVP. Consequently, 100% of features in
> `08_mvp-canvas.md` is mapped under **[MVP]**. Post-MVP items in the table
> of `06_features.md` are mapped under **[Future]**.
>
> The **Release** column in the traceability matrix below follows
> `07_sequencer.md` (the source-of-truth for release assignment, which sequences
> by risk). Notably, the riskiest Workflow features — **P4.10** (atomic step
> execution), **P4.12** (pre/post checks) and **P4.17** (built-in templates) —
> land in **v1.0** (Week 5, "Workflow Completion"), not v0.3: v0.3 exposes the
> workflow *command surface* while the execution/validation machine is hardened
> in v1.0. All of these remain **[MVP]**. **P5.2.3** (MCP Tools) sits in **v0.4**
> (Week 4, "MCP + Migration"). As a result, the v1.0 wave carries genuine feature
> work, not only stabilization.
>
> **P5.1.1** (`init`) shows the release `v0.1/v0.4` **by design**: it is delivered
> as a *split* feature — the interactive `init` wizard ships in **v0.1**, while the
> `init --template` capability ships in **v0.4**. The dual tag is intentional, not
> an unresolved conflict.

## Story ID convention

`US-<JOURNEY>-<NN>` — e.g. `US-0A-01`, `US-1-03`, `US-4-02`.
Each story includes in parentheses the source feature(s), e.g. `_(feat: P4.4)_`.

---

## Complete backbone (horizontal axis)

| # | File                                           | Journey | Backbone (macro-flow)                           | Primary Persona    |
|---|------------------------------------------------|---------|-------------------------------------------------|--------------------|
| 1 | [01_init-migrate.md](01_init-migrate.md)       | 0a + 0b | Project Initialization / Migration              | Alex / Morgan      |
| 2 | [02_session-context.md](02_session-context.md) | 1       | AI Session Launch with Full Context             | Alex (solo dev)    |
| 3 | [03_review-workflow.md](03_review-workflow.md) | 2       | Review Workflow Management + Review Agent       | Sam (reviewer)     |
| 4 | [04_team-task.md](04_team-task.md)             | 3       | Team Task Execution with Auto-Loaded Directives | Jordan (team dev)  |
| 5 | [05_conventions.md](05_conventions.md)         | 4       | Governance: Conventions and Violation Detection | Morgan (tech lead) |
| 6 | [06_decisions.md](06_decisions.md)             | 5       | Decision Visibility + Alignment Notifications   | Casey (PM)         |
| 7 | [07_workflow-config.md](07_workflow-config.md) | 6       | Workflow Configuration Definition and Evolution | Morgan (tech lead) |

## Personas (`04_personas.md`)

| Persona | Role                       | Status     |
|---------|----------------------------|------------|
| Alex    | Solo Developer             | MVP        |
| Sam     | Code Reviewer              | MVP        |
| Jordan  | Team Developer             | MVP        |
| Morgan  | Tech Lead                  | MVP        |
| Casey   | Non-Technical Manager (PM) | MVP        |
| Taylor  | Architect                  | **Future** |

### Non-human actors

Some stories are written from the viewpoint of a non-human actor instead of a
persona. These are first-class subjects of the story map and are declared here so
the `As <subject>` form stays consistent across the journeys:

| Actor      | Meaning                                                                                                          | Status |
|------------|------------------------------------------------------------------------------------------------------------------|--------|
| **System** | The WingFoil CLI/engine acting autonomously — e.g. workflow-state inference, atomic step execution, role routing. | MVP    |
| **Agent**  | The AI agent launched via `wingfoil agent execute` — e.g. context pre-loading, MCP retrieval, deliverable submission. | MVP    |

> **Decision (M-02).** The ~10 stories whose subject is `As the system` / `As the
> agent` are **kept as-is** and declared here as non-human actors (the
> least-invasive option) rather than rewritten into persona form: they describe
> automated behaviour that no human persona performs, so a non-human subject is
> the accurate framing.

---

## Feature → Story Traceability Matrix (Stop-Check)

Each MVP feature in `08_mvp-canvas.md` / `06_features.md` has a **home journey** where
it is expanded into a complete story (also referenced as shared capability in other
journeys). Table ordered by pillar.

### Pillar 1 — Project Memory

| Feature | Description                           | Release | Tag | Home journey |
|---------|---------------------------------------|---------|-----|--------------|
| P1.1    | Git-Backed Storage                    | v0.1    | MVP | 0a           |
| P1.2    | Versioning & Audit Trail              | v0.1    | MVP | 0a           |
| P1.3    | `memory add`                          | v0.1    | MVP | 4            |
| P1.4    | `memory import`                       | v0.4    | MVP | 0b           |
| P1.5    | `memory search`                       | v0.1    | MVP | 1            |
| P1.6    | `memory submit`                       | v0.2    | MVP | 3            |
| P1.7    | `memory approve`                      | v0.2    | MVP | 2            |
| P1.8    | `memory reject`                       | v0.2    | MVP | 4            |
| P1.9    | `memory deprecate`                    | v0.2    | MVP | 5            |
| P1.10   | `memory history`                      | v0.2    | MVP | 5            |
| P1.11   | Memory Entries (git-backed)           | v0.1    | MVP | 0a           |
| P1.12   | Keyword Memory Search                 | v0.1    | MVP | 1            |
| P1.13   | Memory Element Schema (`memory.yaml`) | v0.1    | MVP | 0a           |

### Pillar 2 — Project DNA

| Feature | Description                     | Release | Tag | Home journey |
|---------|---------------------------------|---------|-----|--------------|
| P2.1    | `dna set`                       | v0.1    | MVP | 0a           |
| P2.2    | `dna show`                      | v0.1    | MVP | 3            |
| P2.3    | `dna infer`                     | v0.4    | MVP | 0b           |
| P2.4    | Project DNA (structured config) | v0.1    | MVP | 0a           |
| P2.5    | `paths [category]`              | v0.1    | MVP | 0a           |

### Pillar 3 — Project Directives

| Feature | Description                          | Release | Tag | Home journey |
|---------|--------------------------------------|---------|-----|--------------|
| P3.1    | `directive create`                   | v0.2    | MVP | 4            |
| P3.2    | `directive assign`                   | v0.2    | MVP | 4            |
| P3.3    | `directive remove`                   | v0.2    | MVP | 6            |
| P3.4    | `directives list`                    | v0.2    | MVP | 4            |
| P3.5    | Project Directives (custom+built-in) | v0.2    | MVP | 4            |
| P3.6    | Auto-Load Directives by Role         | v0.2    | MVP | 3            |
| P3.7    | Role-Based Directive Assignment      | v0.2    | MVP | 4            |
| P3.8    | Built-in Directive Templates         | v0.2    | MVP | 0a           |

### Pillar 4 — Project Workflow

| Feature | Description                      | Release | Tag | Home journey |
|---------|----------------------------------|---------|-----|--------------|
| P4.1    | Project Workflow (configuration) | v0.3    | MVP | 0a           |
| P4.2    | `workflow start`                 | v0.3    | MVP | 0a           |
| P4.3    | `workflow end`                   | v0.3    | MVP | 0a           |
| P4.4    | `workflow next`                  | v0.3    | MVP | 1            |
| P4.5    | `workflow status`                | v0.3    | MVP | 2            |
| P4.6    | `workflow list`                  | v0.3    | MVP | 0a           |
| P4.7    | `workflow show`                  | v0.3    | MVP | 0a           |
| P4.8    | `workflow create`                | v0.3    | MVP | 6            |
| P4.9    | `workflow remove`                | v0.3    | MVP | 6            |
| P4.10   | Workflow Steps (atomic actions)  | v1.0    | MVP | 0a           |
| P4.11   | Deliverables (Memory + State)    | v0.3    | MVP | 4            |
| P4.12   | Workflow Checks (pre/post)       | v1.0    | MVP | 6            |
| P4.13   | Workflow State Deduction         | v0.3    | MVP | 1            |
| P4.14   | Approval Routing (role-based)    | v0.3    | MVP | 4            |
| P4.15   | Fallback on Rejection            | v0.3    | MVP | 4            |
| P4.16   | Workflow include() Composition   | v0.3    | MVP | 6            |
| P4.17   | Built-in Workflow Templates      | v1.0    | MVP | 0a           |
| P4.18   | Reference Workflow Templates     | v0.4    | MVP | 0a           |
| P4.19   | Template Expansion               | v0.4    | MVP | 0a           |
| P4.20   | Template Customization           | v0.4    | MVP | 0a           |
| P4.21   | Element Provenance               | v0.3.1  | MVP | 0b           |

### Pillar 5 — Interaction Layer

| Feature | Description                         | Release   | Tag | Home journey |
|---------|-------------------------------------|-----------|-----|--------------|
| P5.1.1  | `init` (wizard/template)            | v0.1/v0.4 | MVP | 0a           |
| P5.1.2  | `init --mode infer`                 | v0.4      | MVP | 0b           |
| P5.1.3  | `audit`                             | v0.4      | MVP | 0b           |
| P5.1.4  | CLI UX Improvements (cross-cutting) | v0.4      | MVP | 0a           |
| P5.2.1  | MCP Resources (DNA + Memory)        | v0.1      | MVP | 1            |
| P5.2.2  | MCP Prompts (role-based)            | v0.2      | MVP | 1            |
| P5.2.3  | MCP Tools (state management)        | v0.4      | MVP | 2            |
| P5.3.1  | `agent execute [--next]`            | v0.3      | MVP | 1            |
| P5.3.2  | Agent Role Selection per Step       | v0.3      | MVP | 2            |
| P5.3.3  | Relevance Filtering                 | v0.3      | MVP | 1            |
| P5.4.1  | Agent Role Definition               | v0.3      | MVP | 0a           |
| P5.4.2  | Agent Role → Directives Binding     | v0.3      | MVP | 3            |
| P5.4.3  | Agent Context Pre-Loading           | v0.3      | MVP | 1            |
| P5.4.4  | Agent Execution Context             | v0.3      | MVP | 1            |
| P5.4.5  | Agent-Assisted Init Wizard          | v0.4      | MVP | 0a           |

### Extra 1 — Notification System

| Feature | Description                  | Release | Tag | Home journey |
|---------|------------------------------|---------|-----|--------------|
| X1.1    | "Human Needed" Notifications | v0.3    | MVP | 2            |
| X1.2    | Notification Routing         | v0.3    | MVP | 2            |

### Items [Future] (Post-MVP v1.1+)

Each row maps to a real **[Future]** `US-*-F*` story in the journey files, using the
vocabulary of `06_features.md` → "Post-MVP (v1.0+)" (and, for *Automated
enforcement*, the Post-MVP Opportunity column of `05_journeys.md` → Journey 4).

| Item (vision vocabulary)              | Story    | Journey | Tag    |
|---------------------------------------|----------|---------|--------|
| Semantic Memory search                | US-1-F1  | 1       | Future |
| IDE plugins                           | US-1-F2  | 1       | Future |
| Memory tagging & relationships        | US-1-F3  | 1       | Future |
| Advanced notifications (Slack, email) | US-2-F1  | 2       | Future |
| Automated enforcement (CI/CD hooks)   | US-4-F1  | 4       | Future |
| Dashboard UI                          | US-5-F1  | 5       | Future |
| Workflow visualization                | US-6-F1  | 6       | Future |
| Blockers & dependencies (full)        | US-6-F2  | 6       | Future |
| Process mining (auto-detect workflow) | US-0B-F1 | 0b      | Future |

**Vision Post-MVP items without a dedicated story (tracked, not yet expanded):**

| Item                       | Origin                                  | Note                                                                 |
|----------------------------|-----------------------------------------|----------------------------------------------------------------------|
| Multi-project support      | `06_features.md` → Post-MVP             | Cross-cutting; no single extension journey, so no `US-*-F*` story yet. |
| Persona Taylor (Architect) | `04_personas.md` (Status **Future**)    | A deferred persona, not a feature — no story until the persona lands. |

---

## Module 1 Validation Criterion

> **Rule:** 100% of features in `08_mvp-canvas.md` must be mapped under **[MVP]**.

- **Total MVP features (`06_features.md` → "Total Features (MVP): 66"):** 66
- **Features mapped under [MVP] in this story map:** 64 (the 64 rows in Pillar tables 1–5 + X1 above)
- **Unmapped MVP features:** 2 — P5.3.4 `agent list` and P5.3.5 `agent show`, added to `06_features.md` without a
  user story (re-measured 2026-10-18, `cp-002`; `bug-399`)
- **MVP coverage:** **64/66**

Coverage verification per pillar (re-measured 2026-10-18 against `06_features.md`'s pillar tables): P1 = 13/13,
P2 = 5/5, P3 = 8/8, P4 = 21/21, P5 = 15/17 (5.1×4, 5.2×3, 5.3×3 of 5, 5.4×5), X1 = 2/2 → **64/66**.

### Edge-case coverage (Stop-Check — second clause)

> **Rule:** every journey's **"Obstacles"** (`05_journeys.md`) must yield at least
> one edge-case / interruption story, so the map specifies exception handling and
> recovery — not only the happy path.

Edge-case stories are tagged **[MVP]**, carry an `US-<JOURNEY>-E<N>` id (the `-E`
suffix keeps them distinct from happy-path story ids and avoids collisions), and
are annotated `_(edge: …)_` — **not** `_(feat: …)_`, so they add **no** new feature
and the feature coverage above is unchanged by them. They live under an
**"Edge cases (interruption / exception handling)"** block beneath the relevant step
of each journey.

| Journey | File                  | Edge-case stories  | Count |
|---------|-----------------------|--------------------|-------|
| 0a      | 01_init-migrate.md    | US-0A-E1, US-0A-E2 | 2     |
| 0b      | 01_init-migrate.md    | US-0B-E1, US-0B-E2 | 2     |
| 1       | 02_session-context.md | US-1-E1, US-1-E2   | 2     |
| 2       | 03_review-workflow.md | US-2-E1, US-2-E2   | 2     |
| 3       | 04_team-task.md       | US-3-E1, US-3-E2   | 2     |
| 4       | 05_conventions.md     | US-4-E1            | 1     |
| 5       | 06_decisions.md       | US-5-E1            | 1     |
| 6       | 07_workflow-config.md | US-6-E1, US-6-E2, US-6-E3 | 3 |
| **Total** |                     |                    | **15** |

- **Journeys with ≥1 edge-case story:** **8 / 8**
- **Edge-case stories total:** **14** (all **[MVP]**)
- **Edge-case coverage:** **100% ✅**
