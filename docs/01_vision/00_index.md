# WingFoil — Product Vision (docs/vision)

**Last indexed:** 2026-10-05

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
| [`01_product-brief.md`](01_product-brief.md)           | 1.6 | 2026-10-01 | Approved | 347   | Executive summary: vision, problem, pillars, differentiators, personas, metrics, GTM, timeline, tech stack, constraints |
| [`02_product-vision.md`](02_product-vision.md)         | 1.2 | 2026-10-01 | Approved | 103   | Vision statement, key decisions, and the reference-workflow/methodology-template model                                  |
| [`03_is-isnot.md`](03_is-isnot.md)                     | 1.3 | 2026-10-01 | Approved | 59    | Scope boundaries: what WingFoil IS / IS NOT / DOES / DOES NOT                                                           |
| [`04_personas.md`](04_personas.md)                     | 1.0 | 2026-06-15 | Approved | 113   | The 6 personas (Alex, Sam, Jordan, Morgan, Casey, Taylor) with pains and goals                                          |
| [`05_journeys.md`](05_journeys.md)                     | 1.3 | 2026-10-01 | Approved | 286   | 8 end-to-end user journeys (0a, 0b, 1–6): steps, obstacles, success                                                     |
| [`06_features.md`](06_features.md)                     | 1.8 | 2026-10-05 | Approved | 518   | 63 features (by pillar + by release) and the data-model / implementation notes                                          |
| [`07_sequencer.md`](07_sequencer.md)                   | 1.8 | 2026-10-01 | Approved | 471   | Active-day budgets, actuals and calendar forecast; the original 5-week plan; per-release Definition of Done, risks      |
| [`08_mvp-canvas.md`](08_mvp-canvas.md)                 | 1.6 | 2026-10-01 | Approved | 213   | MVP canvas: problem/solution/value, target users, metrics, success criteria                                             |
| [`X_cli-cmds.md`](X_cli-cmds.md)                       | 1.3 | 2026-09-24 | Approved | 393   | CLI command reference: signatures, parameters, release timeline, per-persona usage                                      |
| [`X_lean-inception-plan.md`](X_lean-inception-plan.md) | —   | 2026-06-11 | —        | 42    | Workshop plan: sessions, key decisions, output list                                                                     |

---

## Quick lookup — "where do I find…?"

| You need…                                                           | Go to                                                                                                  |
|---------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------|
| The vision statement                                                | `01_product-brief` L9–21 · `02_product-vision` L9–19 · `08_mvp-canvas` Value Proposition L38–45        |
| The core problem WingFoil solves                                    | `01_product-brief` L22–38 · `08_mvp-canvas` L9–23                                                      |
| The 5 pillars (Memory, DNA, Directives, Workflow, Interaction)      | `01_product-brief` L39–79 · `08_mvp-canvas` L58–97                                                     |
| Scope boundaries (is / is-not / does / does-not)                    | `03_is-isnot` (whole file, L9–59)                                                                      |
| Persona details (pains, goals, AI-usage)                            | `04_personas` L9–113 · quick summary `01_product-brief` L106–147                                       |
| End-to-end user flows                                               | `05_journeys` (per-journey ranges below)                                                               |
| The full feature list + feature IDs (P1.x…X1.x)                     | `06_features` L9–159                                                                                   |
| Which feature ships in which version                                | `06_features` L160–300 · `07_sequencer` scope changes L108–133 · `01_product-brief` GTM L190–233       |
| CLI commands, flags & parameters                                    | `X_cli-cmds` (per pillar below)                                                                        |
| Data model: `memory.yaml`, state machines, workflow kinds, fallback | `06_features` L355–518 · `02_product-vision` Main/Sub L62–69                                           |
| Reference workflow templates (Scrum/Kanban/Lean/Trunk-Based)        | `02_product-vision` L31–103 · `06_features` P4.18–P4.20 (L102–104)                                     |
| Schedule: active-day budgets, actuals, forecast                     | `07_sequencer` L9–133 · original plan L134–145 · `01_product-brief` L234–250                           |
| Definition of Done per release                                      | `07_sequencer` L369–438                                                                                |
| Success metrics & criteria                                          | `01_product-brief` L148–183 & L251–297 · `08_mvp-canvas` L98–123 & L154–193                            |
| The Determinism Index (I, P, O) and who controls each component     | `01_product-brief` North Star L150–170 and Solution L39–79 · `08_mvp-canvas` L100–110 · `03_is-isnot`  |
| Competitive differentiators (Replaces / Works with)                 | `01_product-brief` L80–105 · `08_mvp-canvas` L124–142                                                  |
| Tech stack & constraints                                            | `01_product-brief` L298–322                                                                            |

---

## Per-document section maps

### `01_product-brief.md`

- Vision Statement — L9–21
- Core Problem — L22–38
- Solution / Five Pillars (Five Pillars L44; determinism sentence and *Who controls what* close the section) — L39–79
- Key Differentiators (Replaces L86, Works with L96) — L80–105
- Target Users (Alex L108, Sam L114, Jordan L123, Morgan L132, Casey L140) — L106–147
- Success Metrics (North Star and the composite Index L150, Supporting Indicators L171) — L148–183
- Market Position / Go-to-Market (L190) — L184–233
- Investment & Timeline — L234–250
- Success Criteria (v0.1 L253, v0.2 L262, v0.3 L268, v0.4 L274, v1.0 L282, fallback L290) — L251–297
- Technical Stack — L298–309
- Known Constraints & Assumptions — L310–322
- References — L323–347

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

- Alex (solo dev) — L9–25
- Sam (code reviewer) — L26–43
- Jordan (team developer) — L44–62
- Morgan (tech lead) — L63–79
- Casey (non-technical manager) — L80–96
- Taylor (architect, future) — L97–113

### `05_journeys.md`

- Journey 0a — Initialize on a new project — L9–38
- Journey 0b — Migrate to an existing project — L39–72
- Journey 1 — Alex: new session with full context — L73–104
- Journey 2 — Sam: review workflow + AI review agent — L105–138
- Journey 3 — Jordan: team task with auto-loaded directives — L139–173
- Journey 4 — Morgan: enforce conventions / detect violations — L174–206
- Journey 5 — Casey: decisions & alignment notifications — L207–242
- Journey 6 — Morgan: define & evolve workflow — L243–274
- Key Observations across journeys — L275–286

### `06_features.md`

- Feature List by Pillar — L9–159
    - Pillar 1 Project Memory (P1.1–P1.13) — L17–40
    - Pillar 2 Project DNA (P2.1–P2.5) — L41–54
    - Pillar 3 Project Directives (P3.1–P3.8) — L55–71
    - Pillar 4 Project Workflow (P4.1–P4.20) — L72–107
    - Pillar 5 Interaction Layer (P5.1.1–P5.4.5) — L108–148 (5.1 L112, 5.2 L121, 5.3 L129, 5.4 L137)
    - Extra 1 Notifications (X1.1–X1.2) — L149–159
- Features by Release (v0.1 L162, v0.2 L184, v0.3 L207, v0.4 L250, v1.0 L270, Post-MVP L285) — L160–300
- MVP Feature Set Summary (incl. total = 63 features) — L301–354
- Key Implementation Notes — L355–518 (State Deduction L357, `memory.yaml` schema L369, Workflow Kinds/Composition L399,
  Fallback L421, Team & Approval Routing L431, Git Ops L448, Built-in Directive Templates L468, Agent Roles L482,
  Complexity/Risk/Priority ratings L499)

### `07_sequencer.md`

- Re-baseline on active days — L9–133 (Actuals v0.1–v0.2 L25, Active-day budgets L64, Calendar forecast L92, Scope
  changes since the original plan L108)
- Timeline Overview (original plan) — L134–145
- Week-by-Week Breakdown (Week 1 L148, Week 2 L182, Week 3 L215, Week 4 L265, Week 5 L301) — L146–334
- Critical Path — L335–353
- Risk Mitigation — L354–368
- Definition of Done per release (v0.1 L371, v0.2 L383, v0.3 L396, v0.4 L410, v1.0 L424) — L369–438
- Success Criteria (v1.0 MVP) — L439–462
- Capacity & Assignments — L463–471

### `08_mvp-canvas.md`

- Problem — L9–23
- Solution — L24–37
- Value Proposition — L38–45
- Target Users — L46–57
- Key Features (all 5 pillars) — L58–97
- Metrics of Success (North Star L100, Supporting Indicators L111) — L98–123
- Competitive Advantage (Replaces / Works with) — L124–142
- Risks & Mitigations — L143–153
- Success & Next Steps (criteria L156, if succeeds L173, if stalls L184) — L154–193
- Appendix: Documentation Reference — L194–213

### `X_cli-cmds.md`

- Pillar 1 — Memory commands + parameters (params L34) — L14–51
- Pillar 2 — DNA commands + parameters (params L83) — L52–96
- Pillar 3 — Directives commands + parameters (params L119) — L97–133
- Pillar 4 — Workflow commands + parameters (params L172) — L134–183
- Pillar 5 — Initialization commands + parameters (params L199) — L184–211
- Agent Execution commands + parameters (params L218) — L212–227
- Global Options — L228–240
- Command-Line Syntax Conventions — L241–276
- Release Timeline by Command — L277–312
- Command Reference by Persona (Alex L315, Morgan L324, Casey L334, Jordan L343, Sam L352) — L313–361
- Revision history — L362–393

### `X_lean-inception-plan.md`

- Sessions — L10–21
- Key Decisions (Session 1) — L22–31
- Outputs — L32–42

---

## Conventions used across these docs

- **Pillars:** Project Memory, Project DNA, Project Directives, Project Workflow, Interaction Layer.
- **Versions/releases:** v0.1 (Memory+DNA) → v0.2 (Directives) → v0.3 (Workflow) → v0.4 (Interaction Layer) → v1.0 (MVP
  complete). The original plan's dates (Jul 10 / 17 / 24 / 31 / Aug 7, 2026) are no longer the schedule; budgets in
  active days and the current forecast are in `07_sequencer` L9–133.
- **Feature IDs:** `P<pillar>.<n>` (e.g. `P4.13`), sub-grouped for Pillar 5 as `P5.<group>.<n>`; extras as `X1.n`.
- **Journeys:** `0a`, `0b`, `1`–`6` (8 total).
- **Storage layout:** `.wingfoil/{memory.yaml, dna.yaml, workflows.yaml}` + dirs
  `.wingfoil/{memory,directives,workflows}/`.
