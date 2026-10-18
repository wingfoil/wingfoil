# WingFoil — Product Vision (docs/vision)

**Last indexed:** 2026-10-18

This folder holds the **product-vision specification** for WingFoil, produced through a Lean Inception workshop (see
[`X_lean-inception-plan.md`](X_lean-inception-plan.md)). This README is a **navigation index**: it tells you which
document holds which information and on which lines, so you can open only the relevant range instead of reading whole
files.

> **WingFoil in one sentence:** an open-source harness for AI-assisted software development that governs the process
> around the tools that generate specifications, plans and code — decisions, rules, roles and workflow state, versioned
> in git and shared by every human and agent — and makes that process *deterministic*.

---

## How to use this index

**For AI agents:** find your topic in the *Quick lookup* table or the *Per-document section maps* below, then read only
the cited `Lx–Ly` range of that file. Don't load entire documents. **Line numbers are valid for the version/date listed
in the document map** — before relying on a range, confirm the target file's header `Version`/`Date` still match this
index; if they differ, the file changed and the ranges may have drifted (re-scan its headings, which are stable
anchors). A range runs from a section's heading to the line before the next heading of the same or a higher level.

**For humans:** read top-to-bottom in this order: `01_product-brief` → `02_product-vision` / `03_is-isnot` →
`04_personas` → `05_journeys` → `06_features` → `07_sequencer` / `08_mvp-canvas`. `X_cli-cmds` is reference;
`X_lean-inception-plan` is process/meta.

**Keeping it current.** Every edit to a document in this folder updates its row in the document map and its section
ranges in the same commit (`dl-132-vision-change-and-feature-ingest`, element 5).

---

## Document map (versions & last-modified dates)

Versions/dates/status are taken from each file's own header (the source of truth for freshness). *Lines* is the file's
line count (`awk 'END{print NR}'`).

| Document                                               | Ver | Date       | Status   | Lines | What it contains                                                                                                        |
|--------------------------------------------------------|-----|------------|----------|-------|-------------------------------------------------------------------------------------------------------------------------|
| [`01_product-brief.md`](01_product-brief.md)           | 1.11 | 2026-10-18 | Approved | 362   | Executive summary: vision, problem, pillars, differentiators, personas, metrics, GTM, timeline, tech stack, constraints |
| [`02_product-vision.md`](02_product-vision.md)         | 1.3 | 2026-10-06 | Approved | 103   | Vision statement, key decisions, and the reference-workflow/methodology-template model                                  |
| [`03_is-isnot.md`](03_is-isnot.md)                     | 1.4 | 2026-10-06 | Approved | 59    | Scope boundaries: what WingFoil IS / IS NOT / DOES / DOES NOT                                                           |
| [`04_personas.md`](04_personas.md)                     | 1.2 | 2026-10-07 | Approved | 149   | The primary persona (Morgan) and the 7 personas (Alex, Sam, Jordan, Morgan, Casey, Taylor, the maintainer)              |
| [`05_journeys.md`](05_journeys.md)                     | 1.6 | 2026-10-10 | Approved | 287   | 8 end-to-end user journeys (0a, 0b, 1–6): steps, obstacles, success                                                     |
| [`06_features.md`](06_features.md)                     | 1.17 | 2026-10-18 | Approved | 549   | 66 features (by pillar + by release) and the data-model / implementation notes                                          |
| [`07_sequencer.md`](07_sequencer.md)                   | 2.1 | 2026-10-18 | Approved | 480   | Active-day budgets, actuals and calendar forecast; the original 5-week plan; per-release Definition of Done, risks      |
| [`08_mvp-canvas.md`](08_mvp-canvas.md)                 | 1.13 | 2026-10-18 | Approved | 221   | MVP canvas: problem/solution/value, target users, metrics, success criteria                                             |
| [`X_cli-cmds.md`](X_cli-cmds.md)                       | 1.7 | 2026-10-15 | Approved | 486   | CLI command reference: signatures, parameters, release timeline, per-persona usage                                      |
| [`X_lean-inception-plan.md`](X_lean-inception-plan.md) | —   | 2026-06-11 | —        | 42    | Workshop plan: sessions, key decisions, output list                                                                     |

---

## Quick lookup — "where do I find…?"

| You need…                                                           | Go to                                                                                                  |
|---------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------|
| The vision statement                                                | `01_product-brief` L9–21 · `02_product-vision` L9–19 · `08_mvp-canvas` Value Proposition L38–45        |
| The core problem WingFoil solves                                    | `01_product-brief` L22–38 · `08_mvp-canvas` L9–23                                                      |
| The 5 pillars (Memory, DNA, Directives, Workflow, Interaction)      | `01_product-brief` L39–79 · `08_mvp-canvas` L65–105                                                    |
| Scope boundaries (is / is-not / does / does-not)                    | `03_is-isnot` (whole file, L9–59)                                                                      |
| The primary persona (Morgan) and why                                | `04_personas` L9–20 · `01_product-brief` note L108 · `08_mvp-canvas` note L57                          |
| Persona details (pains, goals, AI-usage)                            | `04_personas` L9–149 · quick summary `01_product-brief` L106–160                                       |
| End-to-end user flows                                               | `05_journeys` (per-journey ranges below)                                                               |
| The full feature list + feature IDs (P1.x…X1.x)                     | `06_features` L9–168                                                                                   |
| Which feature ships in which version                                | `06_features` L169–322 · `07_sequencer` scope changes L113–142 · `01_product-brief` GTM L203–248       |
| CLI commands, flags & parameters                                    | `X_cli-cmds` (per pillar below)                                                                        |
| Data model: `memory.yaml`, state machines, workflow kinds, fallback | `06_features` L378–549 · `02_product-vision` Main/Sub L62–69                                           |
| Reference workflow templates (Scrum/Kanban/Lean/Trunk-Based)        | `02_product-vision` L31–103 · `06_features` P4.18–P4.20 (L102–104)                                     |
| Schedule: active-day budgets, actuals, forecast                     | `07_sequencer` L9–142 · original plan L143–154 · `01_product-brief` L249–265                           |
| Definition of Done per release                                      | `07_sequencer` L378–447                                                                                |
| Success metrics & criteria                                          | `01_product-brief` L161–196 & L266–312 · `08_mvp-canvas` L106–131 & L162–201                           |
| The Determinism Index (I, P, O) and who controls each component     | `01_product-brief` North Star L163–183 and Solution L39–79 · `08_mvp-canvas` L108–118 · `03_is-isnot`  |
| Competitive differentiators (Replaces / Works with)                 | `01_product-brief` L80–105 · `08_mvp-canvas` L132–150                                                  |
| Tech stack & constraints                                            | `01_product-brief` L313–337                                                                            |

---

## Per-document section maps

### `01_product-brief.md`

- Vision Statement — L9–21
- Core Problem — L22–38
- Solution / Five Pillars (Five Pillars L44; determinism sentence and *Who controls what* close the section) — L39–79
- Key Differentiators (Replaces L86, Works with L96) — L80–105
- Target Users (primary-persona note L108, Morgan L111, Alex L120, Sam L126, Jordan L135, Casey L144, the maintainer
  L152) — L106–160
- Success Metrics (North Star and the composite Index L163, Supporting Indicators L184) — L161–196
- Market Position / Go-to-Market (L203) — L197–248
- Investment & Timeline — L249–265
- Success Criteria (v0.1 L268, v0.2 L277, v0.3 L283, v0.4 L289, v1.0 L297, fallback L305) — L266–312
- Technical Stack — L313–324
- Known Constraints & Assumptions — L325–337
- References — L338–362

### `02_product-vision.md`

- Vision Statement — L9–19
- Key Decisions — L20–30
- Reference Workflows & Methodology Templates — L31–103 (Supported Templates L37, How it works L47, Main vs Sub L62,
  Benefits L70, Example: Scrum L77)

### `03_is-isnot.md`

- IS — L9–17
- IS NOT — L18–30
- DOES — L31–50
- DOES NOT — L51–59

### `04_personas.md`

- Primary persona — Morgan — L9–20
- Alex (solo dev) — L21–37
- Sam (code reviewer) — L38–55
- Jordan (team developer) — L56–74
- Morgan (tech lead) — L75–91
- Casey (non-technical manager; own goals as read-only views, approves when the DNA assigns it) — L92–112
- Taylor (architect, future) — L113–128
- Persona 7, the maintainer receiving AI-generated contributions — L129–149

### `05_journeys.md`

- Journey 0a — Initialize on a new project — L9–38
- Journey 0b — Migrate to an existing project — L39–72
- Journey 1 — Alex: new session with full context — L73–104
- Journey 2 — Sam: review workflow + AI review agent — L105–138
- Journey 3 — Jordan: team task with auto-loaded directives — L139–173
- Journey 4 — Morgan: enforce conventions / detect violations — L174–206
- Journey 5 — Casey: decisions & alignment notifications (step 4.5: release progress as a read-only view) — L207–243
- Journey 6 — Morgan: define & evolve workflow — L244–275
- Key Observations across journeys — L276–287

### `06_features.md`

- Feature List by Pillar — L9–168
    - Pillar 1 Project Memory (P1.1–P1.13) — L17–40
    - Pillar 2 Project DNA (P2.1–P2.5) — L41–54
    - Pillar 3 Project Directives (P3.1–P3.8) — L55–71
    - Pillar 4 Project Workflow (P4.1–P4.21) — L72–114
    - Pillar 5 Interaction Layer (P5.1.1–P5.4.5) — L115–157 (5.1 L119, 5.2 L128, 5.3 L136, 5.4 L146)
    - Extra 1 Notifications (X1.1–X1.2) — L158–168
- Features by Release (v0.1 L171, v0.2 L193, v0.3 L216, v0.3.1 L261, v0.4 L272, v1.0 L292, Post-MVP L307) — L169–322
- MVP Feature Set Summary (incl. total = 66 features) — L323–377
- Key Implementation Notes — L378–549 (State Deduction L380, `memory.yaml` schema L392, Workflow Kinds/Composition L422,
  Fallback L444, Team & Approval Routing L454, Git Ops L471, Built-in Directive Templates L491, Agent Roles L505,
  Element Provenance L522, Complexity/Risk/Priority ratings L530)

### `07_sequencer.md`

- Re-baseline on active days — L9–142 (Actuals v0.1–v0.2 L25, Active-day budgets L64, Calendar forecast L97, Scope
  changes since the original plan L113)
- Timeline Overview (original plan) — L143–154
- Week-by-Week Breakdown (Week 1 L157, Week 2 L191, Week 3 L224, Week 4 L274, Week 5 L310) — L155–343
- Critical Path — L344–362
- Risk Mitigation — L363–377
- Definition of Done per release (v0.1 L380, v0.2 L392, v0.3 L405, v0.4 L419, v1.0 L433) — L378–447
- Success Criteria (v1.0 MVP) — L448–471
- Capacity & Assignments — L472–480

### `08_mvp-canvas.md`

- Problem — L9–23
- Solution — L24–37
- Value Proposition — L38–45
- Target Users (Morgan primary first, the maintainer's row; primary-persona note L57) — L46–64
- Key Features (all 5 pillars) — L65–105
- Metrics of Success (North Star L108, Supporting Indicators L119) — L106–131
- Competitive Advantage (Replaces / Works with) — L132–150
- Risks & Mitigations — L151–161
- Success & Next Steps (criteria L164, if succeeds L181, if stalls L192) — L162–201
- Appendix: Documentation Reference — L202–221

### `X_cli-cmds.md`

- Pillar 1 — Memory commands + parameters (params L40) — L17–58
- Pillar 2 — DNA commands + parameters (params L91) — L59–105
- Pillar 3 — Directives commands + parameters (params L129) — L106–139
- Pillar 4 — Workflow commands + parameters (params L182) — L140–196
- Pillar 5 — Initialization commands + parameters (params L214) — L197–223
- Agent Execution commands + parameters (params L232) — L224–245
- Global Options — L246–261
- Command-Line Syntax Conventions — L262–301
- Release Timeline by Command — L302–339
- Command Reference by Persona (Alex L342, Morgan L351, Casey L361, Jordan L370, Sam L379) — L340–388
- Revision history — L389–486

### `X_lean-inception-plan.md`

- Sessions — L10–21
- Key Decisions (Session 1) — L22–31
- Outputs — L32–42

---

## Conventions used across these docs

- **Pillars:** Project Memory, Project DNA, Project Directives, Project Workflow, Interaction Layer.
- **Versions/releases:** v0.1 (Memory+DNA) → v0.2 (Directives) → v0.3 (Workflow) → v0.4 (Interaction Layer) → v1.0 (MVP
  complete). The original plan's dates (Jul 10 / 17 / 24 / 31 / Aug 7, 2026) are no longer the schedule; budgets in
  active days and the current forecast are in `07_sequencer` L9–142.
- **Feature IDs:** `P<pillar>.<n>` (e.g. `P4.13`), sub-grouped for Pillar 5 as `P5.<group>.<n>`; extras as `X1.n`.
- **Journeys:** `0a`, `0b`, `1`–`6` (8 total).
- **Storage layout:** `.wingfoil/{memory.yaml, dna.yaml, workflows.yaml}` + dirs
  `.wingfoil/{memory,directives,workflows}/`.
