# Product Brief — WingFoil

**Version:** 1.8
**Date:** 2026-10-07  
**Status:** Approved

---

## Vision Statement

**For** developers and teams already using AI agents to write software  
**who** lose consistency and control over the development process as the project grows  
**WingFoil is** an open-source harness for AI-assisted software development  
**that** makes the process deterministic by giving both humans and AI agents a structured, authoritative interface to
the project
**Unlike** tools that generate specifications, plans or code  
**our product** governs the process around them — decisions, rules, roles and workflow state — versioned in git and
shared by every human and agent

---

## Core Problem

As software projects grow and teams adopt AI agents for development, they face a critical challenge:
**maintaining consistency and control becomes nearly impossible**.

**Symptoms:**

- Context is managed through brute force (full codebase scans, massive context windows)
- Decisions and conventions drift across sessions and between team members
- Agents and developers operate without a shared source of truth
- The larger the project, the worse the signal-to-noise ratio
- Governance is manual, leaky, and exhausting to maintain

**Impact:** Reduced determinism, increased governance overhead, and constant rework.

---

## Solution: WingFoil

WingFoil provides an open-source harness that gives humans and AI agents
a **structured, authoritative interface** to any software project:

### Five Pillars

1. **Project Memory** — Git-backed storage for decisions and artifacts
    - Centralized, versioned, queryable
    - Audit trail of who decided what and when

2. **Project DNA** — Structural map of the project
    - Modules, stacks (technologies and methodologies), team, resource paths; the team's rules are Directives
    - Source of truth for project anatomy; enables agents to navigate without full codebase scans

3. **Project Directives** — Role-based rules that both humans and agents respect
    - Custom directives (team-defined)
    - Built-in directives (WingFoil templates)
    - Scoped by role, auto-loaded for agents

4. **Project Workflow** — Unified tracking and communication of project flow
    - Commands to record development state and decisions
    - Configuration to expose workflow status to both developers and agents
    - Ensures all actors (human + AI) maintain a shared understanding of progress, blockers, and next steps

5. **Interaction Layer** — Dual interface
    - CLI for humans (init, dna, memory, directive, audit, workflow, etc.)
    - MCP Server for agents (read-only Resources, role-based Prompts, workflow commands)

This architecture is designed to make the process **deterministic**: two independent development runs from the same
specs + WingFoil config, using different AI agents, should produce substantially equivalent software, and two projects
built from the same base configuration should produce similar git trees (the same checkpoint and flow commits). The
claim is measured by the Determinism Index (*Success Metrics*), whose first value is expected from v0.3's
release-health run (`dl-089-release-health-analyses-before-retrospective`, metric D01).

**Who controls what.** WingFoil controls the context it assembles for each agent and the process it governs, and it
measures the rest. The code is written by the agents and models the customer chooses, so whether two runs' code agrees
is not under WingFoil's control: it is measured, never promised (`dl-131-determinism-index-scope`).

---

## Key Differentiators

WingFoil is the **governance layer** around AI-assisted development: it records who decided what, under which rules,
in which state. It replaces the informal ways a project keeps that record today, and it works alongside the tools that
produce specifications, plans and code rather than competing with them (`dl-112-positioning-as-a-governance-layer`).

### Replaces

| Instead of                                      | WingFoil                                                                 | What it adds                         |
|-------------------------------------------------|--------------------------------------------------------------------------|--------------------------------------|
| Flat agent-rule files                           | Structured, queryable, multi-layer (Memory + DNA + Directives)           | Scales with project complexity       |
| README + scattered docs                         | Centralized, versioned, indexed                                          | One source of truth                  |
| Brute-force context (large windows, full scans) | Selected by role and task; the same inputs assemble the same context     | Reproducible context, fewer tokens   |
| Manual governance                               | Rule binding by role + auto-load                                         | Agents receive the rules every time  |
| Implicit workflow state                         | Explicit workflow state, deduced from Memory and shared by every actor   | All actors aligned on progress       |

### Works with

| Alongside                     | What they do                                        | What WingFoil adds                                                          |
|-------------------------------|-----------------------------------------------------|-----------------------------------------------------------------------------|
| Spec-driven development tools | Turn a specification into plans, tasks and code     | Governs the lifecycle around the spec: approvals, state machines, role-bound rules, audit trail |
| Coding agents                 | Write and change the code, with the model chosen    | Launches them with their role's directives and context; records every state change in git |
| IDEs                          | Editing, navigation, running the code               | Reaches them through MCP and the CLI, with no IDE plugin                    |

---

## Target Users

Morgan is the **primary persona**: the only production use so far, WingFoil's own repository, has Morgan's shape, with
AI agents as the team (`dl-113-personas-revisited`; the full profiles are in [`04_personas.md`](04_personas.md)).

### Morgan — Tech Lead (primary)

- **Profile:** Senior developer leading a team of 3–8. Sets architecture, reviews PRs, defines conventions. The team may
  consist mostly of AI agents directed by one person.
- **Pain:** Agents don't respect established rules unless explicitly reminded. Governance is manual and leaky. Difficult
  to keep team and agents synchronized on progress.
- **Goal with WingFoil:** Encode team rules once; have them auto-loaded and enforced. Track and communicate workflow
  state to the entire team.

### Alex — Solo Developer

- **Profile:** Full-stack developer, works alone on side projects or freelance. Daily driver: Claude Code or Cursor.
- **Pain:** Every new AI session starts from scratch. The agent re-discovers conventions, drifts from original intent.
- **Goal with WingFoil:** Load relevant project info in seconds; stop re-explaining context.

### Sam — Code Reviewer

- **Profile:** Developer on a team of 3–8, beginning to adopt AI tools. Currently uses AI agents only for code review
  and quality checks, not for writing code.
- **Pain:** Limited confidence in AI for development tasks yet; concerns about quality and team fit. Limited visibility
  into what conventions apply in reviews.
- **Goal with WingFoil:** Start simple with AI-assisted review workflows; gradually expand to other tasks as confidence
  grows. Maintain quality standards through clear directives.

### Jordan — Team Developer

- **Profile:** Mid-level developer on a team of 3–8, directed by a tech lead (like Morgan). Uses AI agents daily for
  code writing and exploration.
- **Pain:** Doesn't know what conventions Morgan has defined; agents ignore team rules. Hard to sync on what's been
  decided and where the project stands.
- **Goal with WingFoil:** Follow team directives automatically; stay aligned on project state without constant manual
  updates.

### Casey — Non-Technical Manager

- **Profile:** Product manager, team lead, or stakeholder. Does not write code. Cares about delivery and velocity.
- **Pain:** Unclear what's been decided, what the process is, what risks exist, and what the team's actual progress is.
- **Goal with WingFoil:** Read-only views over Memory and workflow state: decisions and their reasons, pending
  approvals, release progress. Casey reads the project's state and never changes it.

### The Maintainer — Receiving AI-Generated Contributions

- **Profile:** Maintains an open-source project; more and more of the contributions it receives are AI-generated.
- **Pain:** Volume outruns review; a contribution arrives as code with no record of the intent or the decision behind it.
- **Goal with WingFoil:** Receive contributions as intent (a `bug`, a `decision-log`) under `dl-020-contribution-model`;
  trace every accepted change to an approval the maintainer made; have the project's rules reach the contributor's agent.

---

## Success Metrics

### North Star

**Determinism Index:** Two independent development runs from the same base (specs + WingFoil config) using different AI
agents should produce substantially equivalent software, with shared understanding of project workflow state and
progress alignment across all team members and agents.

*Substantially equivalent* means **behaviourally equivalent**: both codebases pass the same acceptance contracts,
derived from the specifications and written before either run. Form, style, structure and textual similarity are not
part of it.

The Index is **composite**, and each component states who controls it and what is promised
(`dl-131-determinism-index-scope`):

| Component                     | What it measures                                                                                     | Controlled by                  | Promise                         |
|-------------------------------|------------------------------------------------------------------------------------------------------|--------------------------------|---------------------------------|
| **I — Input**                 | The assembled context is identical for identical inputs                                              | WingFoil                       | Guaranteed: 100%, by tests      |
| **P — Process conformance**   | The run followed the workflow: well-formed commits, legal transitions, phase outputs present, traceability complete, each phase run by its declared role (by distinct actors where the workflow requires it); between two runs, similar git trees (the same checkpoint and flow commits) | WingFoil + the agent | Measured on every run           |
| **O — Outcome equivalence**   | Behavioural equivalence of two independent runs' software                                            | The customer's agent and model | Measured periodically, never promised |

Textual or structural similarity of the code is out of scope.

### Supporting Indicators

| Metric                       | Target                                                          |
|------------------------------|-----------------------------------------------------------------|
| **Adoption**                 | ≥1 real team using WingFoil by v0.4                             |
| **Context Load Time**        | <30 seconds to load relevant Memory + DNA + Workflow            |
| **Rule Compliance**          | 100% of agents receive correct directives for their role        |
| **Workflow State Sync**      | All team members + agents share current project state           |
| **Query Speed**              | DNA/Memory/Workflow queries <1 second                           |
| **Audit Trail Completeness** | All decisions and state changes traceable to author + timestamp |

---

## Market Position

**License:** MIT (open source)  
**Distribution:** npm package + GitHub  
**Monetization:** None (MVP); positioning for commercial offerings (v1+)

### Go-to-Market Strategy

**Incremental Release Roadmap:** WingFoil releases build progressively. Each version centers on a pillar, but shared
infrastructure (git storage, audit trail) and an early MCP Resources skeleton land in v0.1, reference templates arrive
with the Workflow pillar (v0.3), and some versions span more than one pillar. v1.0 integrates and stabilizes all five
rather than adding a new one.

**Phase 1 (v0.1):** Project Memory + Project DNA

- Core foundations: storage, querying, CLI basics
- Target: Solo developers (Alex) validating core workflow
- Focus: Determinism for memory + architecture
- **Dogfooding:** WingFoil itself becomes the first production user—WingFoil development is managed by WingFoil (v0.1+
  features used immediately)

**Phase 2 (v0.2):** + Project Directives

- Governance layer: role-based rules, auto-loading
- Target: Small teams (Morgan, Sam + early adopters)
- Focus: Team rule enforcement, first validation with real teams

**Phase 3 (v0.3):** + Project Workflow

- Unified state tracking and team synchronization
- Target: Expanding teams with Jordan-type developers
- Focus: Shared context, blockers, progress alignment

**Phase 4 (v0.4):** + Interaction Layer (polish & stabilization)

- CLI UX refinement, MCP stability, documentation
- Target: Broader adoption, production readiness; non-technical stakeholders (Casey) gain read-only views over
  decisions and their reasons, pending approvals and release progress, through read commands (a user interface stays
  out of the MVP, `dl-008-cli-first-no-gui`)
- Focus: User experience, reliability

**Version 1.0 (MVP Complete):** All five pillars integrated, stable, and battle-tested

**Target Channels:**

- GitHub (trending projects)
- Hacker News
- AI / developer communities (Twitter, Dev.to, Slack communities)
- Partner with Claude Code, Cursor, VS Code AI extensions

---

## Investment & Timeline

- **Team:** 1 developer (Roberto Pompermaier, supported by AI agents)
- **Release sequence:** v0.1 (Project Memory + Project DNA) → v0.2 (+ Project Directives) → v0.3 (+ Project
  Workflow) → v0.4 (+ Interaction Layer) → v1.0 (MVP Complete), each centered on a pillar (some releases deliver
  shared infrastructure or span two pillars).
- **Estimate:** ~13 story points (v0.1), ~63 across the full MVP; roadmap TBD post-validation
- **Schedule:** release budgets are stated in **active development days**, and the calendar is a forecast that
  states its cadence assumption. Budgets, actuals and the current forecast live in one place,
  [`07_sequencer.md`](07_sequencer.md) (*Re-baseline on active days*), which this brief does not repeat
  (`dl-096-schedule-rebaseline-on-active-days`).

**Note:** The original plan of one release per calendar week did not survive a pause in
development and v0.2's scope growth; it is kept in the sequencer, next to the actuals, for comparison.

---

## Success Criteria

### v0.1 Success (Project Memory + DNA)

- ✓ Core foundations stable: Memory creation/read/update, DNA structure
- ✓ Data integrity preserved (git versioning works)
- ✓ CLI is intuitive and documented
- ✓ MCP server is stable (<1 sec queries)
- ✓ Solo developer (Alex) can complete Journey 1 end-to-end
- ✓ Released to npm

### v0.2 Success (+ Directives)

- ✓ Team developer (Jordan) and Tech Lead (Morgan) can define and enforce team rules
- ✓ Agents auto-receive correct directives for their role
- ✓ First pilot team trialing WingFoil for early validation

### v0.3 Success (+ Project Workflow)

- ✓ Team can track and share project state without manual updates
- ✓ All actors (humans + agents) stay aligned on progress and blockers
- ✓ Workflow state queryable and updateable via CLI + MCP

### v0.4 Success (+ Interaction Layer)

- ✓ Existing projects can adopt WingFoil via `init --mode infer` (Journey 0b)
- ✓ MCP server stable (Resources + Prompts + Tools) with <1 sec queries
- ✓ CLI help, formatting, and error messages polished
- ✓ Journey 5 (Casey) and Journey 6 (Morgan) executable end-to-end
- ✓ ≥1 real team using WingFoil in production

### v1.0 Success (MVP Complete)

- ✓ All five pillars integrated and stable
- ✓ ≥3 teams actively using WingFoil
- ✓ Determinism Index reported (I, P, O): Input at its 100% target; Process conformance and Outcome equivalence
  published with their trend (Outcome informs the retrospective and does not gate the release)
- ✓ Audit trail complete for all decisions and state changes

### If Initial Validation (v0.1) Fails

- Reduce scope: drop advanced Memory features (import, bulk operations)
- Pivot to solo dev use case (Alex only, Journey 1)
- Extend timeline, reassess viability

---

## Technical Stack

**Language & Runtime:** TypeScript, Node.js 22.12+ (npm)  
**Storage:** Git (local file-backed, YAML + Markdown)  
**CLI:** Commander.js  
**MCP Server:** Model Context Protocol (stdio transport, `@modelcontextprotocol/sdk`)  
**Validation:** Zod (JSON Schema)  
**Testing:** Jest (>80% coverage target)  
**Deployment:** npm registry (public), semantic versioning

---

## Known Constraints & Assumptions

- **Single Project:** One `.wingfoil/` instance per repo (multi-project in v1+)
- **Git-only Storage:** No cloud backend; all state versioned in git
- **Local First:** No real-time collaboration (async via git push/pull) (auto-sync in v1+)
- **Timeline:** budgeted in active development days, with a forecast that states its cadence; see
  [`07_sequencer.md`](07_sequencer.md) (*Re-baseline on active days*)
- **No IDE Plugins in MVP:** MCP sufficient; native integration in v1+
- **Keyword Search Only:** Semantic search deferred to v1.1+
- **Manual Approval Gates:** No automated workflow triggers in MVP

---

## References

This brief summarizes outputs from a 2-day Lean Inception workshop (June 2026). See the workshop plan in
[`X_lean-inception-plan.md`](X_lean-inception-plan.md).

**Core Documents:**

- [`02_product-vision.md`](02_product-vision.md) — Vision statement, key decisions
- [`03_is-isnot.md`](03_is-isnot.md) — Scope boundaries
- [`04_personas.md`](04_personas.md) — User types and pain points
- [`05_journeys.md`](05_journeys.md) — 8 end-to-end user journeys
- [`06_features.md`](06_features.md) — 64 features across 5 pillars

**Technical & Planning:**

- [`X_cli-cmds.md`](X_cli-cmds.md) — CLI commands reference (all pillars)
- [`07_sequencer.md`](07_sequencer.md) — Active-day budgets, actuals and calendar forecast; the original
  week-by-week plan; Definition of Done
- [`08_mvp-canvas.md`](08_mvp-canvas.md) — MVP canvas and success criteria

**Other tools:** *Key Differentiators* names categories of tools, not products, so this brief states no
fact about what a specific third-party tool does. An edit that states one cites its source and the date it was read here
(`dl-112-positioning-as-a-governance-layer`, ratified with that condition).

All documents are versioned in git and open for refinement as development progresses.
