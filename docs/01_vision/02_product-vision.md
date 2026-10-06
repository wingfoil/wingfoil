# Product Vision — WingFoil

**Version:** 1.3
**Date:** 2026-10-06
**Status:** Approved

---

## Vision Statement

**For** developers and teams already using AI agents to write software  
**who** lose consistency and control over the development process as the project grows  
**WingFoil is** an open-source harness for AI-assisted software development  
**that** makes the process deterministic by giving both humans and AI agents a structured, authoritative interface to the project  
**Unlike** tools that generate specifications, plans or code  
**our product** governs the process around them — decisions, rules, roles and workflow state — versioned in git and shared by every human and agent

---

## Key Decisions

| Question                                    | Decision                                                                                                                                        |
|---------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------|
| Unified or per-persona vision?              | Unified — the core value proposition applies across all user types                                                                              |
| Primary target                              | Developers and teams **already using** AI agents                                                                                                |
| Core value language                         | "Deterministic" — correct and intentional                                                                                                       |
| Differentiator vs. flat agent-rule files    | Distinct: WingFoil provides structured DNA, role-based Directives, a Project Workflow engine, and an MCP server — not a single flat config file |

---

## Reference Workflows & Methodology Templates

WingFoil includes **built-in reference workflow templates** based on well-known software methodologies and team
structures. These templates serve as starting points for workflow configuration, allowing teams to adopt proven
processes without designing from scratch.

### Supported Templates

| Methodology         | Use Case                                         | Workflow Phases                                                            | Approval Gates            | Directives Focus                                     |
|---------------------|--------------------------------------------------|----------------------------------------------------------------------------|---------------------------|------------------------------------------------------|
| **Scrum**           | Team-based iterative delivery                    | Sprint Planning → Development → Code Review → QA Testing → Merge & Release | Code review, QA sign-off  | Sprint commitments, definition of done, story points |
| **Kanban**          | Continuous flow, minimal WIP                     | To Do → In Progress → In Review → Done                                     | Continuous delivery gates | WIP limits, lead time, cycle time                    |
| **Lean Inception**  | Product discovery & MVP validation               | Discovery → Validation → Build → Test → Release                            | Stakeholder checkpoints   | MVP scope, risk mitigation, lean thinking            |
| **Trunk-Based Dev** | High-frequency integration, short-lived branches | Feature flag → Dev → Merge → Deploy                                        | Automated CI/CD checks    | Code quality, test coverage, deployment frequency    |
| **Custom**          | Team-defined process                             | User-defined                                                               | User-defined              | User-defined                                         |

### How Reference Workflows Work

1. **Selection at Init** — During `wingfoil init`, user selects a template or chooses "custom"
2. **Template Expansion** — WingFoil generates:
    - Workflow phases and state transitions
    - Default directives for common roles (developer, reviewer, QA, etc.)
    - Suggested Memory structure (ADRs, decisions, risks)
    - Initial DNA `stacks.methodologies`, with methodology-specific directives
3. **Customization** — All generated artifacts can be customized:
    - Modify phases, approval gates, roles
    - Override directives to match team style
    - Add team-specific Memory sections
4. **Version Control** — Template choices are versioned in git; audit trail shows what template was used and how it was
   modified

### Main vs Sub Workflows

Workflows are either **main** (independently startable — e.g. a release cycle, a bug report, an RFC creation) or **sub**
(include-only building blocks reused inside other workflows — e.g. a TDD dev-loop). Several main workflows can be active
at once (a `report-bug` started during a `release-cycle`); commands target the most recently started one. Sub-workflows
are never started directly: a phase `include()`s them, optionally once per element (`iterate_over`). The reference
templates above are delivered as composable main + sub workflows.

### Benefits

- **Fast Setup** — Teams start with proven workflow structure, not blank canvas
- **Consistency** — Agents learn methodology-specific conventions automatically
- **Gradual Adoption** — Teams can migrate from one template to another as maturity increases
- **Knowledge Transfer** — New team members understand workflow structure immediately (it's a known methodology)

### Example: Scrum Template

When a team selects the Scrum template, WingFoil pre-configures:

**Phases:**

- Sprint Planning (define tasks, estimate)
- Development (implement features, in-progress)
- Code Review (peer review + approval)
- QA Testing (acceptance testing)
- Merge & Release (deploy to production)

**Auto-Generated Directives:**

- All tasks must have story points assigned
- Code changes require 2+ approvals before merge
- All tests must pass in CI/CD before QA gate
- Retrospective scheduled at end of sprint

**Suggested Memory:**

- Sprint goals (updated per sprint)
- Definition of Done checklist
- Known risks and mitigation strategies
- Team velocity history

Teams can then refine these conventions within sprints without re-designing the entire workflow.
