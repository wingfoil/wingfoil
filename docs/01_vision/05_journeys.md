# User Journeys — WingFoil

**Version:** 1.5
**Date:** 2026-10-07
**Status:** Approved

---

## Journey 0a — Initialize WingFoil on a New Project

**Actor:** Alex (solo dev) or Morgan (tech lead setting up for the team)  
**Goal:** Set up WingFoil on a brand new project so the team has a single source of truth from day one.

**Scenario:** Starting a greenfield project. Alex (or Morgan) initializes WingFoil with a guided wizard that asks about
project structure, tech stack, and conventions, then generates initial DNA, directives, and workflow config
automatically.

| Step | Action                            | Tool / Interaction                                           | Outcome                                                                   |
|------|-----------------------------------|--------------------------------------------------------------|---------------------------------------------------------------------------|
| 1    | Create new repo and project files | Git / IDE                                                    | Project exists, empty WingFoil structure                                  |
| 2    | Run interactive setup wizard      | CLI: `wingfoil init` (interactive wizard)                    | Wizard guides user through: DNA, directives, Memory docs, workflow config |
|      | - Select reference workflow       | Menu: Scrum / Kanban / Lean Inception / Trunk-Based / Custom | Workflow template selected; auto-generates phases, directives, Memory     |
|      | - Wizard mode (default)           | Questions + multiple choice options                          | Fast setup with sensible defaults; template serves as baseline            |
|      | - Agent-assisted mode             | Natural conversation with AI agent                           | More flexible, personalized answers; template adapted to team context     |
| 3    | Start kickoff workflow phase      | CLI: `wingfoil workflow start --name [workflow]`             | First workflow step executes; project is officially started               |
| 4    | Verify project structure paths    | CLI: `wingfoil paths` or `wingfoil paths sources --list`     | User confirms all resource paths (code, docs, config) are properly mapped |

**Obstacles:**

- Wizard questions are generic — user must translate to project specifics
- Hard to decide tech stack upfront (especially for greenfield); can be updated later via `wingfoil dna set`
- Template directives may not match project style; customizable via `wingfoil directive create` or `edit`

**Success:** Within minutes, WingFoil is initialized with sensible defaults. Project is ready for collaborative
development; both humans and agents start immediately with aligned context. No manual YAML editing required.

---

## Journey 0b — Migrate WingFoil to an Existing Project

**Actor:** Morgan (tech lead) or Alex (migrating solo project)  
**Goal:** Set up WingFoil on an existing project without disrupting current work.

**Scenario:** Project has 6 months of history, undocumented conventions, and scattered decisions. Morgan (or Alex) runs
a migration wizard that auto-detects structure, imports existing docs, and codifies patterns from git history — reducing
manual work.

| Step | Action                           | Tool / Interaction                                        | Outcome                                                            |
|------|----------------------------------|-----------------------------------------------------------|--------------------------------------------------------------------|
| 1    | Audit current project state      | CLI: `wingfoil audit`                                     | Understand structure, tech stack, implicit conventions             |
| 2    | Run interactive migration wizard | CLI: `wingfoil init --mode infer` (interactive wizard)    | Wizard guides: DNA infer, directives, Memory seed, workflow config |
|      | - Infer DNA from codebase        | Proposes structure, human approves/refines                | DNA reflects reality: actual modules, stacks, team, paths          |
|      | - Deduce from git history        | Analyzes commits/authors to suggest initial team roles    | Directives suggested from observed patterns; customize as needed   |
|      | - Seed Memory with defaults      | Creates initial Memory structure; user fills in decisions | Memory ready for documenting decisions (not importing old docs)    |
|      | - Configure workflow             | Select built-in template, adapt to team process           | Workflow reflects current process + future improvements            |
|      | - Fill project's resource paths  | Wizard guides: map sources, tests, docs, config paths     | All project resource paths configured in DNA for agent navigation  |
| 3    | Soft rollout to the team         | Announcement + optional onboarding                        | Team starts using WingFoil gradually; not a hard cutover           |
| 4    | Begin using workflow and agents  | CLI: `wingfoil agent execute` or `wingfoil workflow next` | Agents and humans start executing workflow steps with full context |

**Obstacles:**

- DNA inference is imperfect — may miss or misclassify modules, stacks or structure (requires human review)
- Memory is seeded but empty — team must document existing decisions (not auto-imported to avoid outdated content)
- Directives inferred from patterns may be too permissive or restrictive (requires customization)
- Team skepticism: "Why add more process if we're already shipping?"

**Success:** Migration completes without disruption. WingFoil becomes the single source of truth within 1-2 sprints.
Team velocity increases because decisions are findable, searchable, and agents respect codified conventions. Zero manual
restructuring of existing code required.

---

## Journey 1 — Alex: "Start a New AI Session with Full Context"

**Actor:** Alex (solo dev)  
**Goal:** Start a new AI session, get the next task, and launch the agent with full project context in under 30
seconds — without re-explaining decisions or conventions.

**Scenario:** Alex has been away from the project for two weeks. He opens Claude Code and wants to resume development.
Instead of re-reading specs or context windows, he uses `workflow next` to see what to do, then `agent execute --next`
to launch the agent with pre-loaded context.

| Step | Action                                          | Tool / Interaction                          | Outcome                                                 |
|------|-------------------------------------------------|---------------------------------------------|---------------------------------------------------------|
| 1    | Alex reviews next task in workflow              | CLI: `wingfoil workflow next`               | Alex knows what to do or which task to pick             |
| 2    | Launch agent on next task with full context     | CLI: `wingfoil agent execute --next`        | Agent initializes with: role, task, directives, context |
| 3    | Agent auto-loads role-based directives + prompt | MCP Prompts: fetch step-specific directives | Agent knows rules + task instruction                    |
| 4    | Agent queries project DNA + Memory              | MCP Resources: fetch relevant context       | Agent has full context pre-loaded                       |
| 5    | Agent executes task with full context           | Agent output + commits                      | Task completes; Alex reviews and approves               |

**Obstacles:**

- Memory contains too much content — agent may fetch irrelevant docs despite filtering
- Directives become stale as project evolves; conflicts with current state
- Agent doesn't automatically know which decisions are still actively relevant vs. historical
- Relevance filtering is imperfect; context is noisy rather than crisp

**Success:** Task begins within 30 seconds of session start. Agent output is consistent with prior decisions and
conventions. No context window exhaustion. Alex doesn't re-explain anything; the agent receives the same context for
the same inputs (the Determinism Index's *Input* component), so conventions and next steps stay consistent across
sessions.

---

## Journey 2 — Sam: "Use WingFoil to Manage Review Workflow and Launch AI Review Agent"

**Actor:** Sam (code reviewer)  
**Goal:** During development loop, manage workflow state, find pending code/doc submissions for review, and launch AI
review agent with team directives to accelerate review process.

**Scenario:** Jordan (or another developer) has submitted code for review. Sam checks workflow status to see pending
reviews, selects a submission, launches a review agent with relevant directives and team standards, validates agent
output, and submits review decision.

| Step | Action                                            | Tool / Interaction                                                | Outcome                                                               |
|------|---------------------------------------------------|-------------------------------------------------------------------|-----------------------------------------------------------------------|
| 1    | Check pending review submissions in workflow      | CLI: `wingfoil workflow status --format json/yaml`                | Sam sees all open workflows and pending approvals                     |
| 2    | Select a submission to review                     | CLI workflow interface or dashboard                               | Sam picks a specific task from the list                               |
| 3    | Review submission details and assigned directives | CLI: `wingfoil workflow show --name release-cycle`                | Sam sees task context, submission, team conventions to verify         |
| 4    | Launch review agent with team directives          | CLI: `wingfoil agent execute --role reviewer --element task:{id}` | Agent initializes with: review directives, quality standards, context |
| 5    | Agent analyzes code/docs against standards        | MCP Resources: fetch code diffs, relevant Memory + Directives     | Agent checks against team conventions and quality standards           |
| 6    | Sam reviews agent output and provides feedback    | CLI output + human inspection of agent analysis                   | Sam validates agent analysis, spots missed issues, verifies quality   |
| 7    | Sam submits review decision                       | CLI: `wingfoil memory approve [document-id] --reason "reason"`    | Review is recorded; feedback is auditable and tied to directives      |

**Obstacles:**

- Review directives might be too strict or miss edge cases specific to the submission
- Agent-generated reviews might lack nuance or miss subtle quality issues
- Multiple pending reviews create bottleneck if Sam can't keep pace
- Team conventions might evolve; older submissions reviewed against outdated standards
- Agent-generated feedback might be too generic without project context

**Success:** Sam reviews submissions efficiently with AI assistance. Team conventions are enforced during review without
manual reminders. Developer feedback is clear, documented, and tied to team standards. Review process is auditable and
reproducible across reviewers. Sam gains confidence in AI for more complex tasks over time.

---

## Journey 3 — Jordan: "Execute Team Task with Auto-Loaded Directives and Workflow"

**Actor:** Jordan (team developer)  
**Goal:** Execute assigned task from team workflow with auto-loaded team directives and conventions, staying aligned
with team rules and Morgan's oversight.

**Scenario:** Morgan has assigned Jordan a development task in the team's workflow. Jordan picks it up from the task
list, sees team conventions and directives pre-loaded, executes the task with AI agent assistance, and submits work for
Morgan's approval.

| Step | Action                                              | Tool / Interaction                                    | Outcome                                                             |
|------|-----------------------------------------------------|-------------------------------------------------------|---------------------------------------------------------------------|
| 1    | Check assigned tasks in team workflow               | CLI: `wingfoil workflow next --assigned-to me`        | Jordan sees tasks assigned to him by Morgan                         |
| 2    | Select a task and review directives + context       | CLI: `wingfoil workflow show --name release-cycle`    | Jordan sees task description, assigned directives, team conventions |
| 3    | Review team context (DNA and relevant decisions)    | CLI: `wingfoil dna show` + `wingfoil memory search`   | Jordan understands team architecture and relevant decisions         |
| 4    | Launch agent to execute task with team rules        | CLI: `wingfoil agent execute --element task:{id}`     | Agent initializes with task, role directives, team context          |
| 5    | Agent executes task respecting team conventions     | MCP auto-loads directives for Jordan's developer role | Agent knows: code standards, testing requirements, review gates     |
| 6    | Jordan reviews agent output and verifies directives | IDE / code review tools                               | Jordan checks work against directives; requests changes if needed   |
| 7    | Jordan submits task for Morgan's approval           | CLI: `wingfoil memory submit [document-id]`           | Task is submitted; directives were followed; awaits Morgan's review |
| 8    | Receive Morgan's review feedback or approval        | CLI: `wingfoil workflow status --format json/yaml`    | Morgan approves or requests changes; feedback tied to directives    |

**Obstacles:**

- Team directives might be complex; Jordan needs to understand them to validate agent output
- Workflow approval gates can slow down development if Morgan is busy or in meetings
- New team conventions might be introduced without clear communication
- Directives might conflict with task requirements; needs clarification from Morgan
- Agent might misinterpret task scope and deliver something outside scope

**Success:** Jordan executes tasks independently using team workflow and auto-loaded directives. No re-explanation of
team rules or conventions needed. Tasks move smoothly through approval workflow. Jordan stays aligned with team
standards. Agent output consistently respects team rules. Morgan maintains visibility without micromanaging.

---

## Journey 4 — Morgan: "Enforce Team Conventions and Detect Violations"

**Actor:** Morgan (tech lead)  
**Goal:** Encode team rules once, have agents auto-load them, and get notified when work is submitted for approval —
ensuring governance is transparent, not burdensome.

**Scenario:** Morgan codifies the team's architectural rules (e.g., "new modules must have unit tests", "API changes
require review") as directives. Agents auto-load these rules when executing tasks. Developers submit deliverables via
workflow; Morgan reviews and approves. Rules enforce themselves without manual reminders.

| Step | Action                                                         | Tool / Interaction                                                   | Outcome                                                   |
|------|----------------------------------------------------------------|----------------------------------------------------------------------|-----------------------------------------------------------|
| 1    | Document team conventions                                      | CLI: `wingfoil memory add` (ADRs), `directive create` (custom rules) | Conventions are git-backed and discoverable               |
| 2    | Assign directives to roles                                     | CLI: `wingfoil directive assign --directive DIRECTIVE_ID --role ...` | Rules bind to job function, not person                    |
| 3    | Developer or agent creates workflow deliverables (e.g., Tasks) | CLI: `wingfoil memory add --type task --title "description"`         | Deliverable Memory file is created with frontmatter state |
| 4    | Developer or agent compiles deliverable and submits            | CLI: `wingfoil memory submit [document-id]`                          | File transitions to pending approval; Morgan notified     |
| 5    | Morgan reviews deliverable against directives                  | CLI: `wingfoil memory approve [document-id] --reason "reason"`       | Approval is recorded; directives were respected           |
| 6    | Rule is updated (if needed)                                    | Edit directive file + CLI: `wingfoil memory add` (record update)     | Future work respects the refinement                       |

**Obstacles:**

- Directives can be too rigid, blocking valid work or edge cases
- Notification fatigue depends on workflow configuration — too many approval gates or approvers = too many alerts (user
  responsibility to configure wisely)
- Violation detection relies on human review, not automated checks (code parsing is out of MVP scope)
- Team may perceive governance as "surveilling" rather than "guiding" if framed poorly

**Success:** Team conventions are applied consistently without manual reminders. Violations are caught early (at
approval time, before merge). Governance is transparent and auditable—all decisions are git-backed. Agents respect rules
automatically; no special instructions needed per task.

---

## Journey 5 — Casey: "Understand Project Decisions and Get Notified of Alignment Needs"

**Actor:** Casey (non-technical PM)  
**Goal:** Understand project decisions, see their rationale, track traceability (req→test→release), and get notified
only when high-level approval is needed — without overwhelming information.

**Scenario:** Casey is a non-technical PM. She wants to answer: What's the API design? What are architectural risks?
Have we committed to third-party integrations? She queries Memory, finds relevant decisions, traces how they flow to
tests/releases, and reviews an audit trail showing who decided and when.

| Step | Action                                          | Tool / Interaction                                                                                                         | Outcome                                                                         |
|------|-------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------|
| 1    | Access project Memory                           | CLI / Dashboard (v2)                                                                                                       | Casey sees all decisions and artifacts                                          |
| 1.5  | Explore project documentation structure         | CLI: `wingfoil paths docs` or `wingfoil paths governance`                                                                  | Casey sees where to find architecture, data models, team info, stakeholders     |
| 2    | Search or browse decisions by topic             | CLI: `wingfoil memory search api-design`                                                                                   | Casey finds the API design decision quickly                                     |
| 3    | Read the decision document (ADR, RFC)           | Memory file                                                                                                                | Casey understands what, why, and who decided                                    |
| 4    | Check who builds the project and with what      | CLI: `wingfoil dna show`                                                                                                   | Casey knows: team size, stacks                                                  |
| 4.5  | Check release progress (read-only view)         | CLI: `wingfoil workflow status` (P4.5, planned); until it ships, `wingfoil memory search --type release`                   | Casey knows: current phase, risks, as a view over workflow state                |
| 5    | Review traceability configured in workflow      | Configured in workflow + Memory metadata                                                                                   | Traceability shows req→test→release links (defined at setup, not auto-inferred) |
| 6    | Query audit trail for decisions and changes     | CLI: `wingfoil memory history [document-id]`                                                                               | Casey sees who decided what, when, why, and what changed                        |
| 7    | Agent or developer triggers "human needed" flag | Notification system (CLI hooks, email)                                                                                     | Casey is notified: specific action needed (e.g., "Approve database migration")  |
| 8    | Casey reviews and approves/declines             | CLI: `wingfoil memory approve [document-id] --reason "reason"` or `wingfoil memory reject [document-id] --reason "reason"` | Decision is documented and versioned in Memory                                  |

**Obstacles:**

- Memory can contain too much information, overwhelming Casey if unfiltered
- Old decisions clutter searches; no automatic distinction between active and archived
- Traceability links (req→test→release) must be configured upfront in workflow; not auto-discovered from code
- Notifications still lack context if not tied to approvals in workflow
- Audit trail works but doesn't highlight *when* decisions became obsolete

**Success:** Casey answers strategic questions in minutes without re-asking the team. Decisions are transparent and
traceable. Traceability shows how requirements flow to tests/releases. Stakeholder approvals don't block
development—they happen in parallel with technical work. All changes are auditable by person and timestamp.

---

## Journey 6 — Morgan: "Define and Evolve Workflow Configuration"

**Actor:** Morgan (tech lead)  
**Goal:** Design and refine the team's workflow using CLI commands (no YAML editing), then test and deploy it without
blocking in-flight work.

**Scenario:** After a few sprints, Morgan realizes the workflow lacks an approval gate for architecture decisions.
Instead of editing YAML, she uses CLI to define a new phase, assign approvers, attach directives, test it with an agent,
and roll it out. In-flight tasks are unaffected; new tasks pick up the new workflow.

| Step | Action                                    | Tool / Interaction                                                      | Outcome                                                     |
|------|-------------------------------------------|-------------------------------------------------------------------------|-------------------------------------------------------------|
| 1    | Review current workflow and identify gaps | CLI: `wingfoil workflow show --name [workflow]`                         | Morgan sees current workflow structure and gaps             |
| 2    | Define new workflow phase/step            | CLI: `wingfoil workflow create` + `wingfoil dna set` (roles, approvers) | New workflow phase is defined with approvers and directives |
| 3    | Bind directives to roles for new step     | CLI: `wingfoil directive assign --directive ... --role ...`             | Directives auto-load when agents/users execute new step     |
| 4    | Test workflow with agent (dry-run)        | CLI: `wingfoil agent execute --dry-run`                                 | Morgan validates workflow logic without blocking team       |
| 5    | Commit workflow changes to git            | Git commit                                                              | Workflow change is versioned and auditable                  |
| 6    | Announce changes and monitor execution    | CLI: `wingfoil workflow status --format json/yaml`                      | New tasks follow new workflow; in-flight tasks unaffected   |

**Obstacles:**

- Workflow design is complex—Morgan must think through approval gates, role definitions, conditional paths
- New phases can be disruptive if not clearly communicated to the team
- In-flight tasks may need manual migration if workflow is fundamentally restructured
- Testing edge cases (rejections, fallbacks, concurrent workflows) is hard to validate pre-deployment

**Success:** Workflow evolves via CLI commands, no YAML syntax errors. New phases deploy without blocking in-flight
work. Agents automatically adapt when new directives are loaded. Governance gates are captured in code and auditable. No
manual rework required when workflow changes.

---

## Key Observations Across All Journeys

| Journey      | Critical First Step                            | MVP Blocker                                  | Post-MVP Opportunity                         |
|--------------|------------------------------------------------|----------------------------------------------|----------------------------------------------|
| 0a (new)     | Workflow config from built-in template         | Simple YAML structure, minimal customization | Template library per methodology             |
| 0b (migrate) | Audit + infer workflow from team               | Auto-detect current process from git history | Process mining / workflow extraction         |
| 1 (Alex)     | Know next step via `wingfoil workflow next`    | Workflow state tracking on git               | Adaptive task suggestions                    |
| 2 (Sam)      | Find pending reviews + launch agent            | Workflow state filtering + review directives | Automated review checklists, quality metrics |
| 3 (Jordan)   | Receive auto-loaded directives from team       | Role-based directive assignment              | Task-specific directive overrides            |
| 4 (Morgan)   | Directive create + memory submit/approve cycle | Frontmatter validation + state transitions   | Automated enforcement (CI/CD hooks)          |
| 5 (Casey)    | Query Memory decisions and audit trail         | CLI + git file states                        | Dashboard with approval bottleneck alerts    |
| 6 (Morgan)   | Edit and test workflow safely                  | Workflow syntax validation + dry-run mode    | Workflow versioning per release              |
