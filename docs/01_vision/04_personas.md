# Personas — WingFoil

**Version:** 1.1
**Date:** 2026-10-06
**Status:** Approved

---

## Primary persona — Morgan

**Morgan (Persona 4) is the primary persona** (`dl-113-personas-revisited`, Q1 (A)). These personas were written at the
inception workshop, before anything was used. Two releases later the only production use is WingFoil's own repository,
and its shape is Morgan's with agents as the team: one person sets the rules, approves every gate and directs AI agents
that execute as developer, reviewer, QA and architect without approval authority (`.wingfoil/dna.yaml` `team`). Morgan's
goals (encode the team's rules once, be notified when a human decision is required) are the ones v0.2 shipped and v0.3
extends. The other personas stay as written: no persona is renamed or removed, so the journeys, the features' persona
column and the User Story Map that name them stay valid.

---

## Persona 1 — Alex, the Solo Developer

> *"I'm the only one who knows what this codebase is supposed to do — including the AI."*

- **Profile:** Full-stack developer, works alone on side projects or freelance. Uses Claude Code or Cursor as daily
  driver. Manages everything: architecture, code, deploy, docs.
- **AI usage level:** Writing → Planning → Review
- **Pain:** Every new AI session starts from scratch. The agent re-discovers conventions already established, makes
  decisions already made, drifts from the original intent. Alex re-explains context constantly.
- **Goals with WingFoil:**
    - Load the agent with relevant project info in seconds (not the entire codebase)
    - Stop re-explaining decisions
    - Keep the codebase consistent across sessions
    - Know what to do next without re-reading specs (`wingfoil workflow next`)

---

## Persona 2 — Sam, the Code Reviewer

> *"I want to review code faster with AI help, but I need confidence that quality standards are being enforced."*

- **Profile:** Developer on a team of 3–8, beginning to adopt AI tools. Currently uses AI agents only for code review,
  quality checks, and documentation review — not yet for writing code.
- **AI usage level:** Review → Planning (gradually expanding)
- **Pain:** Limited confidence in AI for development tasks yet; concerns about quality and team fit. Limited visibility
  into what conventions apply during reviews. Reviews are manual, slow, and inconsistent with team standards.
- **Goals with WingFoil:**
    - Launch AI review agent with clear team directives and quality standards
    - See what submissions are pending review without digging through PRs
    - Validate agent output quickly against documented conventions
    - Gradually build confidence in AI for other tasks (writing, planning)
    - Keep review decisions auditable and traceable to team standards

---

## Persona 3 — Jordan, the Team Developer

> *"I want to know what rules I'm supposed to follow and get my agent to respect them automatically."*

- **Profile:** Mid-level developer on a team of 3–8, directed by a tech lead (like Morgan). Uses AI agents daily for
  code writing and exploration.
- **AI usage level:** Writing → Review
- **Pain:** Doesn't know what conventions Morgan has defined; agents ignore team rules without reminders. Hard to sync
  on what's been decided, what conventions apply, and where the project stands. Constantly asks "Is this the right
  approach?"
- **Goals with WingFoil:**
    - Follow team directives automatically without re-reading them every session
    - Know what task to work on next from team workflow
    - Get agent to respect team rules without manual instructions
    - Stay aligned with team context and decisions
    - Submit work that's aligned with team standards the first time

---

## Persona 4 — Morgan, the Tech Lead

> *"I need to know that agents are working within the rules we've set, not inventing new ones."*

- **Profile:** Senior developer leading a team of 3–8. Sets architecture decisions, reviews PRs, defines conventions.
  The team (humans + agents) works in parallel streams, and it may consist mostly of AI agents directed by one person.
- **AI usage level:** Review → Planning
- **Pain:** Agents don't respect established conventions unless explicitly reminded. Decisions made in one session don't
  propagate. Governance is manual and leaky.
- **Goals with WingFoil:**
    - Encode the team's rules once and have them enforced automatically
    - Know when an agent or developer is working outside the guardrails
    - Get notified when a human decision is required
    - Define team workflow once; have agents and humans follow it consistently

---

## Persona 5 — Casey, the Non-Technical Manager

> *"I need visibility into the development process without being in every decision."*

- **Profile:** Product manager, team lead, or stakeholder. Does not write code. Cares about delivery, quality, and team
  velocity. Works with one or more technical leads who handle the details.
- **AI usage level:** Review (agents' outputs) → Planning (project roadmap, specs)
- **Pain:** Unclear what's been decided, what the process is, what risks exist. Relies entirely on secondhand
  information from technical leads. Can't tell if an agent's output is correct or aligned with intent.
- **Goals with WingFoil:** Casey needs to read the project's state, never to change it, so each goal is a **read-only
  view** over Memory and workflow state (`dl-113-personas-revisited`, Q2 (a)). The views are delivered by read commands
  and later by a user interface, which `dl-008-cli-first-no-gui` keeps out of the MVP.
    - Decisions and their reasons: what was decided, by whom, when and why, at a glance (the audit trail)
    - Pending approvals: where a human decision is required and alignment or review is needed
    - Release progress: workflow state, and the bottlenecks that hold it back
    - The project's methodology: which workflow and which rules the team follows

---

## Persona 6 — Taylor, the Architect (Future)

> *"I need to document what we've decided, and have both humans and agents reference it correctly."*

- **Profile:** Solutions architect or senior developer who designs systems and makes foundational decisions. Works with
  Morgan (Tech Lead) to codify architecture patterns.
- **AI usage level:** Planning → Review
- **Pain:** Architectural decisions get buried in Slack, old docs, or nowhere. Agents reinvent decisions. New team
  members don't know the principles.
- **Goals with WingFoil:**
    - Write architectural decisions once (ADR, RFC) and have them centrally queryable
    - Have agents reference architecture docs in their reasoning
    - Build a searchable knowledge base of design patterns and constraints

---

---

## Persona 7 — the Maintainer Receiving AI-Generated Contributions

> *"I can't review everything that arrives, and code alone doesn't tell me what it was meant to do or who decided it."*

- **Profile:** Maintains an open-source project and receives contributions from people outside the core team, more and
  more of them generated by AI.
- **AI usage level:** Review → Planning
- **Pain:** The volume of contributions outruns review. A contribution arrives as code, with no record of the intent or
  of the decision behind it.
- **Goals with WingFoil:**
    - Receive contributions as intent (a `bug`, a `decision-log`) rather than as code, under
      `dl-020-contribution-model`
    - Trace every accepted change to an approval the maintainer made
    - Have the project's rules reach the contributor's agent

---

*Note: Taylor is defined for future reference. MVP focuses on Morgan (primary), Alex, Sam, Jordan, and Casey. Persona 7
(`dl-113-personas-revisited`, Q3 (x)) is the maintainer on the receiving end of `dl-020-contribution-model`; it has no
journeys yet, and they enter through the vision-change process (`dl-132-vision-change-and-feature-ingest`) rather
than here.*