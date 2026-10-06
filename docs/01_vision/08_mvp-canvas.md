# MVP Canvas — WingFoil v1.0 (MVP Complete)

**Version:** 1.8
**Date:** 2026-10-06
**Status:** Approved

---

## Problem

As projects grow and teams adopt AI agents for development, they lose consistency and control:

- **Context Management:** Brute-force approach (full codebase scans, massive context windows)
- **Decision Drift:** Conventions and decisions diverge across sessions and team members
- **No Shared Source of Truth:** Agents and developers operate independently
- **Governance Breakdown:** Rules are manual, leaky, and constantly need re-explaining
- **Ungoverned Process:** Even identical specs with different agents follow different processes, so their
  codebases diverge and nobody can say where; WingFoil governs the process and measures the outcome

**Impact:** Reduced determinism, increased governance overhead, constant rework, team friction.

---

## Solution

WingFoil is an open-source harness that gives humans and AI agents a **structured, authoritative interface** to a
project:

- **Project Memory** — git-backed storage for decisions and artifacts
- **Project DNA** — structural map of the project (modules, stacks, team, resource paths)
- **Project Directives** — role-based rules that both humans and agents respect
- **Project Workflow** — unified tracking and communication of project flow, ensuring all actors maintain
  shared understanding of progress and blockers
- **Interaction Layer** — CLI for humans, MCP for agents

---

## Value Proposition

**For** developers and teams already using AI agents  
**WingFoil** makes the development process deterministic  
**By** centralizing memory, conventions, directives, and workflow state — keeping them synchronized across all actors

---

## Target Users

| User                         | Problem                                                    | Solution                                    | Success                                             |
|------------------------------|------------------------------------------------------------|---------------------------------------------|-----------------------------------------------------|
| **Alex** (solo dev)          | Re-explains context every session                          | Load relevant info in 30 seconds            | Agent is pre-loaded; work starts immediately        |
| **Sam** (code reviewer)      | Reviews are manual, slow, inconsistent with team standards | Launch AI review agent with team directives | Reviews are fast, auditable, and tied to standards  |
| **Jordan** (team developer)  | Doesn't know team rules; agents ignore them                | Auto-loaded team directives per role        | Submits work aligned with team standards first time |
| **Morgan** (tech lead)       | Conventions drift; governance is leaky                     | Encode rules once; auto-load for agents     | Rules are enforced; violations are caught early     |
| **Casey** (non-tech manager) | Decisions are scattered; visibility is poor                | Query decisions and audit trail             | Can answer strategic questions in minutes           |

---

## Key Features (MVP v1.0)

### All 5 Pillars Delivered

**Pillar 1: Project Memory (v0.1)**
✓ Git-backed document storage (each type at the path `.wingfoil/memory.yaml` declares)  
✓ Element schema + per-type state machines (`.wingfoil/memory.yaml`)  
✓ Versioning & audit trail (git commits)  
✓ Add, search, history commands

**Pillar 2: Project DNA (v0.1)**
✓ Structured project map (`.wingfoil/dna.yaml`)  
✓ Modules, stacks, team  
✓ Queryable resource paths (`wingfoil paths`)

**Pillar 3: Project Directives (v0.2)**
✓ Custom + built-in directive templates  
✓ Role-based assignment and auto-load  
✓ Versionable in git

**Pillar 4: Project Workflow (v0.3)**
✓ Workflow configuration (`.wingfoil/workflows.yaml` main file + `include()` of built-in/custom workflows)  
✓ Workflow kinds (main/sub), active context, context-aware `list`  
✓ Per-type state machines in `.wingfoil/memory.yaml` (default: draft → pending → approved/rejected)  
✓ Fallback on rejection (target step + state), approval routing, `iterate_over` composition  
✓ Built-in workflow templates (Scrum, Kanban, Lean, Trunk-Based)

**Pillar 5: Interaction Layer (v0.4)**
✓ CLI commands (init, dna, memory, directive, workflow, agent)  
✓ MCP Server (Resources, Prompts, Tools)  
✓ Agent execution with auto-loaded context

**Not in MVP v1.0:**
✗ Semantic memory search (keyword search only)  
✗ Automated validation (manual review)  
✗ IDE plugins (MCP only)  
✗ Dashboard UI (CLI only)

---

## Metrics of Success

### North Star

**Determinism Index:** Two independent development runs from the same base (specs + WingFoil config) using different AI
agents should produce substantially equivalent software.

*Substantially equivalent* means **behaviourally equivalent**: both codebases pass the same acceptance contracts,
derived from the specifications and written before either run. Form, style, structure and textual similarity are not
part of it. The Index is composite — **I**nput (WingFoil, guaranteed), **P**rocess conformance (WingFoil + the agent,
measured on every run), **O**utcome equivalence (the customer's agent and model, measured, never promised); see the
product brief's *Success Metrics* (`dl-131-determinism-index-scope`).

### Supporting Indicators

| Metric                       | Target                                                   | How Measured            |
|------------------------------|----------------------------------------------------------|-------------------------|
| **Adoption**                 | ≥1 real team using WingFoil by v0.4                      | GitHub issues, feedback |
| **Context Load Time**        | <30 seconds to load relevant Memory + DNA + Workflow     | Agent session timing    |
| **Rule Compliance**          | 100% of agents receive correct directives for their role | MCP integration tests   |
| **Query Speed**              | DNA/Memory queries <1 second                             | CLI + MCP benchmarks    |
| **Audit Trail Completeness** | All decisions traceable to author + timestamp            | Git log verification    |
| **Workflow State Sync**      | All team members + agents share current project state    | Workflow status checks  |

---

## Competitive Advantage

WingFoil is the governance layer around AI-assisted development. It replaces the informal ways a project records
decisions, rules and state, and works alongside the tools that produce specifications, plans and code; the product
brief's *Key Differentiators* is the reference (`dl-112-positioning-as-a-governance-layer`).

| Relation   | Category                                        | What WingFoil adds                                                                     |
|------------|-------------------------------------------------|----------------------------------------------------------------------------------------|
| Replaces   | Flat agent-rule files                           | Structured, queryable, multi-layer (Memory + DNA + Directives + Workflow)              |
| Replaces   | README + scattered docs                         | One versioned, indexed source of truth, with an audit trail on changes                 |
| Replaces   | Brute-force context (large windows, full scans) | Context selected by role and task; the same inputs assemble the same context            |
| Replaces   | Manual governance                               | Rules bound to roles and auto-loaded; no re-explaining                                 |
| Replaces   | Implicit workflow state                         | Explicit state in Memory frontmatter, shared by every human and agent                  |
| Works with | Spec-driven development tools                   | Governs the lifecycle around the spec: approvals, state machines, role-bound rules, audit trail |
| Works with | Coding agents                                   | Launches them with their role's directives and context; records every state change in git |
| Works with | IDEs                                            | Reaches them through MCP and the CLI, with no IDE plugin                               |

---

## Risks & Mitigations

| Risk                        | Mitigation                                       |
|-----------------------------|--------------------------------------------------|
| `dna infer` too complex     | Simplify heuristics; fallback to manual guidance |
| MCP integration delays      | Start early; lean on open MCP spec               |
| Documentation lag           | Minimize scope; prioritize README + examples     |
| Single developer bottleneck | Use AI agents for reviews and async work         |

---

## Success & Next Steps

### MVP Success Criteria (v1.0)

- ✓ All 8 user journeys executable and tested (0a, 0b, 1–6)
    - Journey 0a: New project initialization with template
    - Journey 0b: Existing project migration
    - Journey 1: Alex (solo dev) with auto-loaded context
    - Journey 2: Sam (code reviewer) with review workflow
    - Journey 3: Jordan (team developer) with auto-loaded directives
    - Journey 4: Morgan (tech lead) with governance enforcement
    - Journey 5: Casey (PM) with decision visibility
    - Journey 6: Morgan (tech lead) with workflow evolution
- ✓ Data integrity preserved (git versioning + audit trail work)
- ✓ CLI is intuitive and documented (help text, examples)
- ✓ MCP server is stable (<1 sec queries)
- ✓ All 5 pillars integrated and stable
- ✓ Published to npm with documentation

### If v1.0 MVP Succeeds

- Report the Determinism Index (I, P, O): Input at its 100% target; Process conformance and Outcome equivalence
  published with their trend, Outcome informing the retrospective rather than gating a release
- Gather feedback from early adopters (the first four weeks after the v1.0 release; its forecast date is in
  [`07_sequencer.md`](07_sequencer.md))
- Secure ≥1 real team using WingFoil in production by the v0.4 milestone (budget and forecast in
  [`07_sequencer.md`](07_sequencer.md))
- Prioritize v1.1+ roadmap: semantic search, dashboard UI, IDE plugins, automated validation
- Explore commercial positioning (white-label, enterprise features, SaaS model)

### If v1.0 Stalls or Fails

- Reassess critical path: identify the release that overran its active-day budget, reduce scope for that release +
  subsequent releases
- Fallback options: drop advanced features (dna infer → manual, semantic search → defer, validation → defer)
- Pivot: focus on solo dev use case (Journeys 0a + 1) for v1.0, move team features to v1.1
- Extend timeline: re-forecast the calendar in [`07_sequencer.md`](07_sequencer.md), maintain pillar sequence

---

## Appendix: Documentation Reference

This MVP Canvas is part of a comprehensive product specification created via Lean Inception workshop (June 2026).
Each document's version, date and status are listed in one place, the document map of
[`00_index.md`](00_index.md), which reads them from each file's header; this appendix does not repeat them.

| Document                   | Content                                                    |
|----------------------------|------------------------------------------------------------|
| `01_product-brief.md`      | Executive summary, vision, success metrics, timeline, GTM  |
| `02_product-vision.md`     | Vision statement, key decisions, reference workflows       |
| `03_is-isnot.md`           | What WingFoil is/isn't, does/doesn't do                    |
| `04_personas.md`           | 6 personas: Alex, Sam, Jordan, Morgan, Casey, Taylor       |
| `05_journeys.md`           | 8 user journeys (0a, 0b, 1–6) with scenarios and obstacles |
| `06_features.md`           | 63 features across 5 pillars, organized by release version |
| `07_sequencer.md`          | Active-day budgets, actuals, forecast; original plan       |
| `08_mvp-canvas.md`         | This file — MVP canvas with success criteria               |
| `X_cli-cmds.md`            | CLI commands reference (all pillars)                       |
| `X_lean-inception-plan.md` | Lean Inception workshop plan and session log               |

**All outputs are versioned in git and open for refinement as development progresses.**
