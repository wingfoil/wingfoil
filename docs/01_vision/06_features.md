# Features — WingFoil

**Version:** 1.8
**Date:** 2026-10-05  
**Status:** Approved

---

## Feature List — Organized by Pillar

Features are organized into **5 Core Pillars** (P1–P5, with P1 including shared infrastructure) + **Extra Features** (
X1).
Each feature includes: ID, Journey references, User personas, Description, and Type.

---

### **Pillar 1: Project Memory (P1)**

Centralized, git-backed storage for decisions, ADRs, RFCs, and project artifacts. **Note:** Features P1.1 and P1.2
provide shared infrastructure (git storage + versioning) used by all pillars (Memory, DNA, Directives, Workflow) to
persist their configuration and state files.

| ID    | Feature                                | Journey            | User                | Description                                                                                                                                                      | Type           |
|-------|----------------------------------------|--------------------|---------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------------|
| P1.1  | Git-Backed Storage (foundational)      | 0a, 0b, 1, 2, 3, 4 | All                 | Centralized git repository for all project state (Memory, DNA, Directives, Workflow) in `.wingfoil/`                                                             | Infrastructure |
| P1.2  | Versioning & Audit Trail (all pillars) | 0a, 1, 2, 3, 5     | Morgan, Casey       | All changes (Memory, DNA, Directives, Workflow) tracked via git with author, timestamp, commit message                                                           | Infrastructure |
| P1.3  | `wingfoil memory add`                  | 0a, 0b, 2, 4, 5    | Morgan, Alex, Casey | Create/add document to Memory in `.wingfoil/memory/` (draft state)                                                                                               | Command        |
| P1.4  | `wingfoil memory import`               | 0b                 | Morgan, Alex        | Scan project for existing docs and import into Memory (interactive, with metadata extraction)                                                                    | Command        |
| P1.5  | `wingfoil memory search`               | 1, 3, 5            | Casey, Alex         | Query Memory by keyword and metadata                                                                                                                             | Command        |
| P1.6  | `wingfoil memory submit`               | 2, 3, 4, 5         | Morgan, Alex        | Submit Memory document for approval (pending state)                                                                                                              | Command        |
| P1.7  | `wingfoil memory approve`              | 2, 4, 5            | Morgan, Casey       | Approve Memory document (approved state); records reason                                                                                                         | Command        |
| P1.8  | `wingfoil memory reject`               | 2, 4, 5            | Morgan, Casey       | Reject Memory document; reverts to draft for rework                                                                                                              | Command        |
| P1.9  | `wingfoil memory deprecate`            | 2, 3, 5            | Morgan, Casey       | Mark Memory document as deprecated (remains in repo, agents ignore)                                                                                              | Command        |
| P1.10 | `wingfoil memory history`              | 2, 3, 5            | Morgan, Casey       | View audit trail of Memory document (commits, approvals, state changes)                                                                                          | Command        |
| P1.11 | Memory Entries (git-backed)            | 0a, 0b, 1, 2, 3    | All                 | Store documents, decisions, artifacts in `.wingfoil/memory/` with versioning                                                                                     | Infrastructure |
| P1.12 | Keyword Memory Search                  | 1, 3, 5            | Alex, Casey         | Find relevant docs by keyword and metadata                                                                                                                       | Feature        |
| P1.13 | Memory Element Schema (`memory.yaml`)  | 0a, 0b, 2, 4       | All                 | Define each element type (path pattern, name, description, tags, **allowed states + transitions**) in `.wingfoil/memory.yaml`; basis for per-type state machines | Infrastructure |

---

### **Pillar 2: Project DNA (P2)**

Structural map of project (modules, tech stack, conventions, team structure in `.wingfoil/dna.yaml`).

| ID   | Feature                         | Journey         | User         | Description                                                                                                                           | Type           |
|------|---------------------------------|-----------------|--------------|---------------------------------------------------------------------------------------------------------------------------------------|----------------|
| P2.1 | `wingfoil dna set/add/update/remove`| 0a, 6           | All          | Define/update project DNA: `set` writes scalar fields; `add`/`update`/`remove` edit collection entries (`dl-081`, `dl-082`). `set` and `update` both stay — `set` is `update` with a scalar-only guard whose refusal names the verb that works (`bug-092` ruling)                                                                                                             | Command        |
| P2.2 | `wingfoil dna show`             | 3, 5            | All          | Query and display project DNA                                                                                                         | Command        |
| P2.3 | `wingfoil dna infer`            | 0b              | Morgan, Alex | Auto-scan codebase and propose DNA structure (human reviews/approves)                                                                 | Command        |
| P2.4 | Project DNA (structured config) | 0a, 0b, 1, 2, 3 | All          | Define project anatomy (modules, tech stack, team members, conventions) in `.wingfoil/dna.yaml`                                       | Infrastructure |
| P2.5 | `wingfoil paths [category]`     | 0a, 0b, 5       | All          | Query project resource paths by category (sources, tests, docs, config, governance, runs — `spec-002` Categories); drill-down support; formats: console, json, yaml | Command        |

---

### **Pillar 3: Project Directives (P3)**

Role-based rules that humans and agents respect automatically (in `.wingfoil/directives/`).

| ID   | Feature                                | Journey      | User         | Description                                                                                         | Type           |
|------|----------------------------------------|--------------|--------------|-----------------------------------------------------------------------------------------------------|----------------|
| P3.1 | `wingfoil directive create`            | 0a, 4        | Morgan, Alex | Create new custom directive file                                                                    | Command        |
| P3.2 | `wingfoil directive assign`            | 2, 4, 6      | Morgan       | Bind directive to role (defined in DNA)                                                             | Command        |
| P3.3 | `wingfoil directive remove`            | 2, 4, 6      | Morgan, Alex | Remove custom directive after verifying it's not referenced elsewhere                               | Command        |
| P3.4 | `wingfoil directives list`             | All          | All          | List available directives (custom + built-in) and role assignments                                  | Command        |
| P3.5 | Project Directives (custom + built-in) | 0a, 0b, 2, 4 | Morgan, Alex | Define "how we work" rules, scoped by role; custom + built-in in `.wingfoil/directives/`            | Infrastructure |
| P3.6 | Auto-Load Directives by Role           | 1, 2, 3      | All          | Directives auto-load when agents/developers execute tasks with that role                            | Feature        |
| P3.7 | Role-Based Directive Assignment        | 0a, 0b, 2, 4 | Morgan       | Bind multiple directives to roles; one-to-many relationships                                        | Feature        |
| P3.8 | Built-in Directive Templates           | 0a, 0b       | All          | Pre-configured templates: Code Quality, Testing, Code Review, Architecture, Security, Documentation | Feature        |

---

### **Pillar 4: Project Workflow (P4)**

Unified tracking of project progress, blockers, and deliverables (main config in `.wingfoil/workflows.yaml`, which
`include()`s built-in/custom workflow files from `.wingfoil/workflows/{built-in,custom}/`; state in
`.wingfoil/memory/` frontmatter).

| ID    | Feature                                     | Journey            | User          | Description                                                                                                                                                                                                                         | Type           |
|-------|---------------------------------------------|--------------------|---------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------------|
| P4.1  | Project Workflow (configuration)            | 0a, 0b, 2, 3, 4, 6 | Morgan        | Define workflow structure (phases → steps → atomic actions); each workflow is **startable**, **includable** or both (`kind: main`/`sub` are aliases); main file `.wingfoil/workflows.yaml` includes built-in/custom workflows       | Infrastructure |
| P4.2  | `wingfoil workflow start {workflow}`        | 0a, 0b             | Morgan, Alex  | Open a **startable** workflow and set it as the active workflow context; initialize first step (a workflow that is only includable is not started — it runs when a phase includes it)                                               | Command        |
| P4.3  | `wingfoil workflow end {workflow}`          | 0a, 0b             | Morgan, Alex  | Close the active (or named) main workflow; clear/restore the active context                                                                                                                                                         | Command        |
| P4.4  | `wingfoil workflow next`                    | 1, 3               | Alex, Morgan  | Show next step of the active workflow, its **element**, directives for the role + instructions                                                                                                                                      | Command        |
| P4.5  | `wingfoil workflow status`                  | 2, 3, 4, 5, 6      | Morgan, Casey | Show state of all open (active) main workflows and pending approvals; highlights the active one. *Also called:* pending gates                                                                                                                                     | Command        |
| P4.6  | `wingfoil workflow list`                    | 0a, 0b             | All           | List workflows **executable now** (startable workflows + an includable one when it is the next step); `--all` lists every defined workflow                                                                                          | Command        |
| P4.7  | `wingfoil workflow show`                    | 0a, 0b, 6          | All           | Display details of a workflow (phases, steps, directives, Memory structure)                                                                                                                                                         | Command        |
| P4.8  | `wingfoil workflow create`                  | 0a, 0b, 2, 4, 6    | Morgan, Alex  | Create new custom workflow file (interactive or flag-based)                                                                                                                                                                         | Command        |
| P4.9  | `wingfoil workflow remove`                  | 2, 4, 6            | Morgan, Alex  | Remove custom workflow after verifying it's not included elsewhere                                                                                                                                                                  | Command        |
| P4.10 | Workflow Steps (atomic actions)             | 0a, 0b, 1, 2, 4    | All           | Steps execute: memory.add, memory.submit, agent.execute, git operations (branch, worktree, merge)                                                                                                                                   | Feature        |
| P4.11 | Deliverables (Memory + State)               | 0a, 0b, 2, 4       | All           | Memory files with frontmatter state tracking; states follow the element's **per-type** state machine in `.wingfoil/memory.yaml` (default: draft → pending → approved/rejected → deprecated)                                         | Feature        |
| P4.12 | Workflow Checks (pre/post execution)        | 0a, 0b, 1, 2, 4, 6 | All           | Validation rules for steps (file.exists, frontmatter.required, git.commits, tests.coverage). *Also called:* gates; what evaluates one is its *verifier* (command, script, CI or agent)                                                                                                                                         | Feature        |
| P4.13 | Workflow State Deduction (from Memory)      | 0a, 0b, 1, 2, 3, 4 | All           | State deduced from Memory file existence and frontmatter, validated against the element type's allowed states (P1.13); no separate state index file needed                                                                          | Infrastructure |
| P4.14 | Approval Routing (role-based from DNA)      | 0a, 0b, 2, 4       | Morgan, Casey | Define approvers by role (team members defined in `.wingfoil/dna.yaml`) or person. *Also called:* human + agent verification, when an automated or agent check precedes the human decision                                                                                                                                                   | Feature        |
| P4.15 | Fallback on Rejection                       | 2, 4               | Morgan, Casey | On reject, jump to a `fallback.step` within the same workflow; optionally assign a new state (`fallback.set_state`) to the rejected document. *Also called:* remediation loop                                                                                        | Feature        |
| P4.16 | Workflow include() Composition              | 0a, 0b, 4, 6       | Morgan        | Main `.wingfoil/workflows.yaml` references sub-workflows/steps via `include()`; an include runs once or **once per element** via `iterate_over: <type>` with optional `where` filters (status/tags)                                 | Feature        |
| P4.17 | Built-in Workflow Templates (Task, Release) | 0a, 0b, 2, 4       | All           | Pre-built workflows per common patterns (e.g. Release as a main workflow, Task as an includable sub)                                                                                                                                | Feature        |

Pre-built methodology templates for fast onboarding.

| ID    | Feature                      | Journey | User         | Description                                                                         | Type    |
|-------|------------------------------|---------|--------------|-------------------------------------------------------------------------------------|---------|
| P4.18 | Reference Workflow Templates | 0a, 0b  | All          | Pre-built methodology templates: Scrum, Kanban, Lean Inception, Trunk-Based, Custom | Feature |
| P4.19 | Template Expansion           | 0a, 0b  | Alex, Morgan | Auto-generate phases, directives, Memory sections from selected template            | Feature |
| P4.20 | Template Customization       | 0a, 0b  | Morgan       | Override template defaults to match team style                                      | Feature |

---

### **Pillar 5: Interaction Layer (P5)**

Dual interface (CLI for humans, MCP Server for agents).

#### **5.1 — Project Initialization**

| ID     | Feature                      | Journey                  | User         | Description                                                                      | Type    |
|--------|------------------------------|--------------------------|--------------|----------------------------------------------------------------------------------|---------|
| P5.1.1 | `wingfoil init`              | 0a                       | Alex, Morgan | Initialize WingFoil on new project (interactive wizard, with template selection) | Command |
| P5.1.2 | `wingfoil init --mode infer` | 0b                       | Morgan, Alex | Initialize WingFoil on existing project with codebase inference                  | Command |
| P5.1.3 | `wingfoil audit`             | 0b                       | Morgan, Alex | Scan project and summarize current state (languages, frameworks, structure)      | Command |
| P5.1.4 | CLI UX Improvements          | 0a, 0b, 1, 2, 3, 4, 5, 6 | All          | Better help, formatting, error messages, shell integration                       | Feature |

#### **5.2 — MCP Server**

| ID     | Feature                            | Journey    | User   | Description                                                                   | Type   |
|--------|------------------------------------|------------|--------|-------------------------------------------------------------------------------|--------|
| P5.2.1 | MCP Resources (DNA + Memory)       | 1, 2, 3    | Agents | Agents can efficiently fetch DNA entries and Memory documents (read-only)     | Server |
| P5.2.2 | MCP Prompts (role-based templates) | 1, 2, 3    | Agents | Auto-load role-specific directives and instruction templates at session start | Server |
| P5.2.3 | MCP Tools (state management)       | 1, 2, 3, 4 | Agents | Agents can submit deliverables and update workflow state via MCP tools        | Server |

#### **5.3 — Agent Execution**

| ID     | Feature                           | Journey        | User         | Description                                                                                                                                                                                 | Type    |
|--------|-----------------------------------|----------------|--------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|---------|
| P5.3.1 | `wingfoil agent execute [--next]` | 0a, 1, 2, 4, 6 | All          | Wrapper that launches the agent with auto-loaded context; with `--next` the role and target element are resolved from the current workflow step (explicit override via `--element type:id`) | Command |
| P5.3.2 | Agent Role Selection per Step     | 0a, 1, 2, 4    | All          | Route agent to correct role based on current workflow step                                                                                                                                  | Feature |
| P5.3.3 | Relevance Filtering               | 1, 2, 3        | Alex, Agents | Agent loads only relevant Memory docs, avoiding noise                                                                                                                                       | Feature |

#### **5.4 — Agent Configurations**

| ID     | Feature                                             | Journey        | User         | Description                                                             | Type    |
|--------|-----------------------------------------------------|----------------|--------------|-------------------------------------------------------------------------|---------|
| P5.4.1 | Agent Role Definition                               | 0a, 1, 2, 3, 4 | Morgan       | Define available agent roles (developer, reviewer, QA, architect, etc.) | Feature |
| P5.4.2 | Agent Role → Directives Binding                     | 1, 2, 3, 4     | Morgan       | Bind directives to agent roles; auto-load at execution                  | Feature |
| P5.4.3 | Agent Context Pre-Loading                           | 1, 2, 3, 4     | Agents       | Auto-fetch DNA, Memory, directives based on role and task               | Feature |
| P5.4.4 | Agent Execution Context (DNA + Memory + Directives) | 1, 2, 3, 4     | Agents       | Structured context passed to agents at task start                       | Feature |
| P5.4.5 | Agent-Assisted Init Wizard                          | 0a, 0b         | Alex, Morgan | Natural conversation with AI agent for project setup                    | Feature |

---

### **Extra 1: Notification System (X1)**

Notifications and alerts across all features.

| ID   | Feature                      | Journey | User          | Description                                  | Type    |
|------|------------------------------|---------|---------------|----------------------------------------------|---------|
| X1.1 | "Human Needed" Notifications | 2, 3    | Morgan, Casey | Notify when approval or decision is required | Feature |
| X1.2 | Notification Routing         | 2, 3    | Morgan, Casey | Route notifications by role/decision type    | Feature |

---

## Features by Release

### **v0.1 — Project Memory + DNA**

**Target Date:** July 10, 2026

| Feature ID | Feature                               | Complexity | Dependencies       | MVP Risk | Priority | Why                                    | Notes                                              |
|------------|---------------------------------------|------------|--------------------|----------|----------|----------------------------------------|----------------------------------------------------|
| P1.1       | Git-Backed Storage (foundational)     | Low        | Git                | Low      | Critical | Foundation for all pillars             | Stores all project state in `.wingfoil/`           |
| P1.2       | Versioning & Audit Trail              | Low        | Git                | Low      | Critical | Enables change tracking and audit      | Via git commits automatically                      |
| P1.3       | `wingfoil memory add`                 | Low        | Git                | Low      | Critical | Core user workflow                     | Essential for all personas                         |
| P1.5       | `wingfoil memory search`              | Medium     | Memory, file I/O   | Medium   | Critical | Find decisions quickly                 | Keyword search MVP; semantic post-MVP              |
| P1.11      | Memory Entries (git-backed)           | Low        | Git                | Low      | Critical | Storage layer for Memory pillar        | Shared infrastructure for all pillars              |
| P1.12      | Keyword Memory Search                 | Medium     | Memory, file I/O   | Medium   | Critical | Query Memory by topic                  | Basic keyword matching                             |
| P1.13      | Memory Element Schema (`memory.yaml`) | Low        | Git                | Low      | Critical | Per-type state machines for Memory     | Element schema in `.wingfoil/memory.yaml`; full custom-states configuration refined in v1.0 (see 07_sequencer.md Week 5) |
| P2.1       | `wingfoil dna set/add/update/remove` | Low        | DNA                | Low      | Critical | Define/update project structure        | Basic CRUD operations                              |
| P2.2       | `wingfoil dna show`                   | Low        | DNA                | Low      | Critical | Query project structure                | Essential for all journeys                         |
| P2.4       | Project DNA (structured config)       | Low        | None               | Low      | Critical | Storage layer for DNA pillar           | Shared infrastructure for all pillars              |
| P2.5       | `wingfoil paths [category]`           | Medium     | DNA (paths config) | Low      | High     | Query resource paths without full scan | Supports drill-down and multi-format output        |
| P5.1.1     | `wingfoil init` (wizard/params)       | Low        | DNA, Directives    | Low      | Critical | First user interaction                 | Wizard + params modes only; infer mode in v0.4     |
| P5.2.1     | MCP Resources (DNA + Memory)          | Medium     | MCP spec, CLI      | Medium   | Critical | Agents can access project state        | Read-only skeleton in v0.1; full endpoints in v0.4 |

---

### **v0.2 — Project Directives**

**Target Date:** July 17, 2026

| Feature ID | Feature                                | Complexity | Dependencies                | MVP Risk | Priority | Why                                 | Notes                                                                                     |
|------------|----------------------------------------|------------|-----------------------------|----------|----------|-------------------------------------|-------------------------------------------------------------------------------------------|
| P1.6       | `wingfoil memory submit`               | Low        | Memory, frontmatter         | Low      | Critical | Submit docs for approval            | Transitions draft → pending                                                               |
| P1.7       | `wingfoil memory approve`              | Low        | Memory, frontmatter         | Low      | Critical | Approve Memory documents            | Records approver, timestamp, reason                                                       |
| P1.8       | `wingfoil memory reject`               | Low        | Memory, frontmatter         | Low      | Critical | Reject documents for rework         | Reverts to draft with feedback                                                            |
| P1.9       | `wingfoil memory deprecate`            | Low        | Memory, frontmatter         | Low      | Medium   | Mark docs as obsolete               | Agents ignore deprecated docs                                                             |
| P1.10      | `wingfoil memory history`              | Low        | Git                         | Low      | High     | View audit trail of decisions       | Shows commits + state transitions                                                         |
| P3.1       | `wingfoil directive create`            | Low        | Built-in template library   | Low      | Critical | Teams define custom rules           | Custom directives for team style                                                          |
| P3.2       | `wingfoil directive assign`            | Medium     | DNA (roles)                 | Medium   | High     | Bind rules to roles                 | Role defined in `.wingfoil/dna.yaml`                                                      |
| P3.3       | `wingfoil directive remove`            | Low        | None                        | Low      | Medium   | Remove custom directives            | Verify not referenced elsewhere                                                           |
| P3.4       | `wingfoil directives list`             | Low        | None                        | Low      | High     | Discover available rules            | Essential for Morgan to manage                                                            |
| P3.5       | Project Directives (custom + built-in) | Medium     | Memory, built-in templates  | Low      | Critical | Storage layer for Directives pillar | Shared infrastructure for all pillars                                                     |
| P3.6       | Auto-Load Directives by Role           | Medium     | Directive system, templates | Medium   | Critical | Agents respect rules automatically  | Core value proposition                                                                    |
| P3.7       | Role-Based Directive Assignment        | Low        | None                        | Low      | High     | Flexible role bindings              | One role → multiple directives                                                            |
| P3.8       | Built-in Directive Templates           | Low        | None                        | Low      | High     | Reduce friction                     | Pre-configured: Code Quality, Testing, Code Review, Architecture, Security, Documentation |
| P5.2.2     | MCP Prompts (role-based)               | Medium     | Directive system, templates | Medium   | Critical | Agents receive instructions + rules | Auto-loaded at session start                                                              |

---

### **v0.3 — Project Workflow**

**Target Date:** July 24, 2026

> **Note:** the Memory lifecycle verbs (`memory add/submit/approve/reject/deprecate/history`) are
> delivered in v0.1–v0.2. v0.3 does **not** re-deliver them; it integrates them into workflow steps
> (approval routing, `fallback.set_state`, `agent execute`).
>
> **Scope note (release sequencing, aligned to `07_sequencer.md`):** v0.3 exposes the workflow
> *command surface*, but the riskier execution/validation machine is hardened later. Atomic step
> execution (P4.10), pre/post checks (P4.12) and the built-in Task/Release templates (P4.17) are
> completed in **v1.0** (07_sequencer.md Week 5); MCP Tools for state management (P5.2.3) ship in
> **v0.4** alongside the rest of the MCP server. The reference workflow templates (P4.18–P4.20)
> moved from v0.3 to **v0.4** on 2026-09-29 (`release-planning-rel-v0.3-plan` R3).

| Feature ID | Feature                                     | Complexity | Dependencies                             | MVP Risk | Priority | Why                                   | Notes                                             |
|------------|---------------------------------------------|------------|------------------------------------------|----------|----------|---------------------------------------|---------------------------------------------------|
| P4.1       | Project Workflow (configuration)            | Medium     | None                                     | Low      | Critical | Define team process                   | v0.1 + v0.2 foundation                            |
| P4.2       | `wingfoil workflow start`                   | Low        | Workflow config                          | Low      | Critical | Begin workflow phase                  | Atomic operation                                  |
| P4.3       | `wingfoil workflow end`                     | Low        | Workflow config                          | Low      | Critical | Close workflow phase                  | Atomic operation                                  |
| P4.4       | `wingfoil workflow next`                    | Low        | Workflow, directives                     | Low      | Critical | Know what to do next                  | Essential for all journeys                        |
| P4.5       | `wingfoil workflow status`                  | Low        | Workflow state                           | Low      | Critical | See project state                     | For Casey + Morgan                                |
| P4.6       | `wingfoil workflow list`                    | Low        | Workflow config                          | Low      | High     | Browse available workflows            | Built-in + custom                                 |
| P4.7       | `wingfoil workflow show`                    | Low        | Workflow config                          | Low      | High     | View workflow details                 | Phases, steps, directives                         |
| P4.8       | `wingfoil workflow create`                  | Low        | Workflow config                          | Low      | High     | Create custom workflows               | Interactive or flag-based                         |
| P4.9       | `wingfoil workflow remove`                  | Low        | Workflow config                          | Low      | Medium   | Remove custom workflows               | Verify not included elsewhere                     |
| P4.11      | Deliverables (Memory + State)               | Medium     | Memory, git versioning                   | Medium   | Critical | Track work items                      | Frontmatter-based state                           |
| P4.13      | Workflow State Deduction (from Memory)      | Low        | Git, Memory frontmatter                  | Low      | Critical | Deduce state from Memory files        | No separate `.wingfoil/state/` index needed       |
| P4.14      | Approval Routing (role-based from DNA)      | Medium     | DNA (roles, team members), Notifications | Medium   | High     | Route approvals correctly             | Team members defined in `.wingfoil/dna.yaml`      |
| P4.15      | Fallback on Rejection                       | High       | State machine, optional steps            | High     | High     | Handle rejections gracefully          | Return to previous step                           |
| P4.16      | Workflow include() Composition              | Medium     | Workflow config                          | Medium   | High     | Compose sub-workflows; iterate_over   | include() once or once-per-element                |
| P5.3.1     | `wingfoil agent execute [--next]`           | Medium     | Agent SDK, MCP, Directives               | High     | Critical | Launch agents with context            | Foundation for agent journeys                     |
| P5.3.2     | Agent Role Selection per Step               | Medium     | Workflow system                          | Medium   | High     | Route agent by step                   | Correct role per phase                            |
| P5.3.3     | Relevance Filtering                         | Medium     | Memory, Agent context                    | Medium   | Medium   | Load only relevant docs               | Avoid context window exhaustion                   |
| P5.4.1     | Agent Role Definition                       | Low        | None                                     | Low      | Critical | Define agent personas                 | Developer, Reviewer, QA, Architect                |
| P5.4.2     | Agent Role → Directives Binding             | Low        | Directive system                         | Low      | Critical | Auto-load rules for agent             | Core differentiator                               |
| P5.4.3     | Agent Context Pre-Loading                   | Medium     | DNA, Memory, Directives                  | Medium   | Critical | Pre-fetch agent context               | <30 sec launch time                               |
| P5.4.4     | Agent Execution Context                     | Medium     | MCP, Agent SDK                           | Medium   | Critical | Structured context passing            | DNA + Memory + Directives                         |
| X1.1       | "Human Needed" Notifications                | Medium     | CLI hooks, git hooks                     | Medium   | High     | Alert on approvals needed             | Essential for Morgan + Casey                      |
| X1.2       | Notification Routing                        | Medium     | DNA (roles), Notifications               | Medium   | Medium   | Route alerts by role                  | Role-based or person-specific                     |

---

### **v0.4 — Polish & Documentation**

**Target Date:** July 31, 2026

| Feature ID | Feature                           | Complexity | Dependencies                          | MVP Risk | Priority | Why                               | Notes                                          |
|------------|-----------------------------------|------------|---------------------------------------|----------|----------|-----------------------------------|------------------------------------------------|
| P1.4       | `wingfoil memory import`          | Medium     | Memory, file I/O                      | Medium   | High     | Auto-import existing docs         | Reduce 0b friction                             |
| P5.1.3     | `wingfoil audit`                  | Medium     | Codebase scanning                     | Medium   | High     | Understand state before migration | Feeds `init --mode infer`                      |
| P5.1.2     | `wingfoil init --mode infer`      | Medium     | Codebase scanning, audit, dna infer   | Medium   | Critical | Adoption for existing projects    | Needs audit + dna infer                        |
| P2.3       | `wingfoil dna infer`              | Medium     | Codebase scanning, language detection | Medium   | High     | Auto-detect DNA                   | Reduce 0b friction                             |
| P5.1.1     | `wingfoil init --template {name}` | Low        | Template system                       | Low      | High     | CLI flag for templates            | Flag of P5.1.1 (init); v0.1 had menu selection |
| P5.1.4     | CLI UX Improvements               | Low        | None                                  | Low      | High     | Polish help, formatting, errors   | Better user experience                         |
| P5.4.5     | Agent-Assisted Init Wizard        | Medium     | Agent SDK, conversation               | Medium   | High     | Natural language setup            | Alternative to Q&A mode                        |
| P5.2.3     | MCP Tools (state management)       | Medium     | Workflow state, MCP spec              | Medium   | High     | Agents can update workflow state  | Submit, approve, record memory                 |
| P4.18      | Reference Workflow Templates                | Low        | Workflow config                          | Low      | High     | Fast onboarding with proven workflows | Scrum, Kanban, Lean, Trunk-Based                  |
| P4.19      | Template Expansion                          | Low        | Workflow config                          | Low      | High     | Generate workflow + directives        | From template selection                           |
| P4.20      | Template Customization                      | Low        | Workflow config                          | Low      | Medium   | Override defaults                     | Adapt templates to team                           |

---

### **v1.0 — MVP Complete**

**Target Date:** August 7, 2026

| Feature ID | Feature                                     | Complexity | MVP Risk | Priority | Why                                             |
|------------|---------------------------------------------|------------|----------|----------|-------------------------------------------------|
| P4.10      | Workflow Steps (atomic actions)             | High       | High     | Critical | Execute step logic (memory/agent/git ops)       |
| P4.12      | Workflow Checks (pre/post)                  | High       | High     | Critical | Enforce quality gates (file/git/test checks)    |
| P4.17      | Built-in Workflow Templates (Task, Release) | Low        | Low      | High     | Common workflow patterns (Task + Release)       |
| —          | All v0.4 features stable                     | —          | Low      | Critical | Production-ready; battle-tested                 |
| —          | Determinism Index reported (I, P, O)        | —          | Medium   | Critical | Input at its 100% target; Process conformance and Outcome equivalence published with their trend (dl-131) |
| —          | ≥1 real team using WingFoil                 | —          | High     | Critical | Early adopter validation                        |

---

### **Post-MVP (v1.0+)**

| Feature                               | Complexity | MVP Risk | Why Deferred                                      |
|---------------------------------------|------------|----------|---------------------------------------------------|
| Semantic Memory search                | High       | Medium   | Keyword search works; NLP post-MVP                |
| Dashboard UI                          | High       | Medium   | CLI works; web UI post-MVP                        |
| IDE plugins                           | Medium     | Medium   | CLI + MCP sufficient; native integration post-MVP |
| Advanced notifications (Slack, email) | Medium     | Low      | Basic CLI notifications work                      |
| Workflow visualization                | High       | Medium   | Status commands work; visual Gantt post-MVP       |
| Process mining (auto-detect workflow) | High       | High     | Manual config in MVP; ML-based post-MVP           |
| Blockers & dependencies (full)        | Medium     | Medium   | Basic fallback works; critical path post-MVP      |
| Memory tagging & relationships        | Low        | Low      | Flat structure works; linked docs post-MVP        |
| Multi-project support                 | Medium     | Medium   | Single project in MVP; expand post-MVP            |

---

## MVP Feature Set Summary

**Core Infrastructure:**

- ✓ Git-Backed Storage (P1.1) — All state in `.wingfoil/`
- ✓ Versioning & Audit Trail (P1.2) — Via git commits

**Pillar 1 — Project Memory:**

- ✓ Memory Entries (P1.11) — `.wingfoil/memory/`
- ✓ Element schema + per-type state machines (P1.13) — `.wingfoil/memory.yaml`
- ✓ Add, Search, History commands (P1.3, P1.5, P1.10)
- ✓ Keyword search (P1.12)

**Pillar 2 — Project DNA:**

- ✓ Project DNA (P2.4) — `.wingfoil/dna.yaml`
- ✓ Set/Add/Update/Remove, Show, Infer commands (P2.1–P2.3)

**Pillar 3 — Project Directives:**

- ✓ Project Directives (P3.5) — `.wingfoil/directives/`
- ✓ Create, Assign, Remove, List commands (P3.1–P3.4)
- ✓ Built-in templates (P3.8)
- ✓ Auto-Load by Role (P3.6)

**Pillar 4 — Project Workflow:**

- ✓ Project Workflow (P4.1) — `.wingfoil/workflows.yaml` (main file + `include()` of built-in/custom workflows)
- ✓ Startable/includable workflows (`kind: main`/`sub` as aliases), active context, context-aware list (P4.1–P4.6)
- ✓ State deduced from Memory, validated per-type (P4.13) — no separate state file
- ✓ All workflow commands (P4.2–P4.9)
- ✓ Deliverables, Routing, Fallback (step+state), iterate_over (P4.11, P4.13–P4.16) — v0.3
- ✓ Workflow Checks pre/post (P4.12) and Git operations in workflow steps / atomic actions (P4.10) — hardened in **v1.0** (07_sequencer.md Week 5)
- ✓ Built-in Workflow Templates (Task, Release) (P4.17) — completed in **v1.0**

**Pillar 5 — Interaction Layer:**

- ✓ CLI Commands (P5.1) — init, audit, etc.
- ✓ MCP Server (P5.2) — Resources, Prompts, Tools
- ✓ Agent Execution (P5.3) — auto-loaded context
- ✓ Agent Configurations (P5.4) — roles, directive binding

**Extra Features:**

- ✓ Reference Workflow Templates (P4.18–P4.20) — Scrum, Kanban, Lean, Trunk-Based — **v0.4**
- ✓ Notification System (X1) — Basic approvals

**Total Features (MVP):** 63 core features across all pillars
**Release Timeline:** 5 weeks (v0.1 → v1.0)
**Target Adoption:** ≥1 real team by v0.2, ≥3 teams by v1.0

---

## Key Implementation Notes

### Workflow State Deduction (P4.13)

State is **deduced from Memory files**, not stored in a separate index. The valid states for each file come from its
element type's state machine in `.wingfoil/memory.yaml` (P1.13):

- A `task` file with frontmatter `status: in-progress` → that task is being implemented
- A `release` file with frontmatter `status: releasing` → release phase in progress
- Transitions are validated against the type's graph; an illegal transition is rejected

This avoids a separate `.wingfoil/state/workflows.md` index file and keeps state close to deliverables. Git tracks all
state changes via Memory file commits.

### Memory Element Schema & Per-Type State Machines (P1.13)

Memory element types are **not hardcoded**: they are configured in `.wingfoil/memory.yaml`. Each type declares its path
pattern, name, description, tags, and — crucially — **its own state machine** (allowed states + transitions). There is
no single global state machine: a `release` and a `task` move through different lifecycles. The CLI verbs
(`submit`/`approve`/`reject`/`deprecate`) and workflow `element.set_state` actions are both validated against the type's
graph. A `defaults` block (`draft → pending → approved/rejected → deprecated`) is used by any type that does not
override
`states`.

```yaml
# .wingfoil/memory.yaml (excerpt)
types:
  release:
    path: "release/{id}.md"
    states:
      values: [ draft, planning, in-development, releasing, released, deprecated ]
      initial: draft
      transitions: { draft: [ planning ], planning: [ in-development ], in-development: [ releasing ], releasing: [ released ], "*": [ deprecated ] }
  task:
    path: "task/{id}.md"
    states:
      values: [ draft, pending, backlog, in-progress, in-review, approved, done, deprecated ]
      initial: draft
      transitions: { draft: [ pending ], pending: [ backlog, draft ], backlog: [ in-progress ], in-progress: [ in-review ], in-review: [ approved, in-progress ], approved: [ done ], "*": [ deprecated ] }
```

This is why the same verb can land in different states by type (e.g. approving a task during planning → `backlog`, while
approving it after review → `approved`), avoiding the "approved twice" ambiguity.

### Workflow Kinds, Active Context & Composition (P4.1, P4.2, P4.6, P4.16)

- **Startable and includable:** every workflow declares `startable: true` (started with `workflow start`, e.g.
  `release-cycle`, `report-bug`, `create-rfc`), `includable: true` (run when a phase `include:`s it by name, e.g. a TDD
  `dev-loop`), or both. `kind: main` (startable only) and `kind: sub` (includable only) stay as aliases. A workflow that
  is only includable is never started with `workflow start`.
- **Active context:** `wingfoil workflow start <name>` sets the **active workflow**; subsequent commands target it
  unless `--name` is given. Multiple startable workflows can be open at once (e.g. start `report-bug` during a
  `release-cycle` phase); commands reference the **last** started.
- **Context-aware `list`:** `workflow list` shows only what is **executable now** — startable workflows plus an includable one when it
  is the next step. `--all` lists every defined workflow.
- **Composition with iteration:** an `include()` runs once, or **once per element** via `iterate_over: <type>` with
  optional `where` filters by status/tags.

```yaml
# release-cycle implementation phase: run the TDD sub once per backlog task of this release
- name: implementation
  include: dev-loop-tdd
  iterate_over: task
  where: { status: [ backlog ], tags: [ "{release.version}" ] }
```

### Fallback on Rejection (P4.15)

A rejection returns to a named step in the same workflow and may override the document's state:

```yaml
review:
  approval: { by_role: reviewer }
  fallback: { step: red, set_state: in-progress }   # reject → back to 'red', task → in-progress
```

### Team Members & Approval Routing (P4.14)

Team members are defined in `.wingfoil/dna.yaml` under a `team:` section:

```yaml
team:
  members:
    - name: Morgan
      email: morgan@...
      roles: [ tech-lead, approver ]
    - name: Jordan
      email: jordan@...
      roles: [ developer ]
```

Approval routing references roles/people from DNA, enabling role-based approval without hardcoding emails.

### Git Operations in Workflow (P4.10)

Workflow steps can execute git operations:

- **Create branch**: For feature branches
- **Create worktree**: For parallel development
- **Merge**: After approval
- **Commit**: To record state changes

Example step configuration:

```yaml
- name: Code Review
  role: reviewer            # agent.execute resolves role + element from the step (P5.3.1)
  actions:
    - git.create_branch(task-id)
    - agent.execute
    - git.merge(to: main)
```

### Built-in Directive Templates (P3.8)

WingFoil provides pre-configured directive templates for common scenarios (6 types):

- **Code Quality**: linting, code coverage, complexity limits
- **Testing**: test-first/TDD, coverage thresholds, test structure
- **Code Review**: Review checklist, approval gates
- **Architecture**: ADR requirements, tech decisions
- **Security**: Credential handling, secrets
- **Documentation**: README, API docs, decision logs

Built-in directive templates are auto-installed during `wingfoil init` based on the selected methodology. Teams can
create custom directives with `wingfoil directive create`.

### Agent Role Configurations (P5.4)

WingFoil supports the following agent roles, configurable per team:

- **Developer**: Writes code, creates features, applies code quality directives
- **Reviewer**: Reviews code/docs, checks against team standards, approves/rejects
- **QA**: Tests features, validates acceptance criteria, runs checks
- **Architect**: Makes design decisions, documents ADRs
- **Custom Roles**: Teams can define additional roles (e.g., "data-engineer", "security-lead")

Each role has:

- **Directives** bound to it (auto-loaded at execution)
- **Memory** documents it can access (role-specific context)
- **Workflow Steps** it can trigger
- **Approval Authority** (which roles can approve its work)

### Complexity, Risk, Priority Ratings

**Complexity:**

- **Low**: Straightforward implementation, few dependencies, proven patterns
- **Medium**: Moderate complexity, some integration required, standard approaches
- **High**: Complex state management, multiple dependencies, novel or complex patterns

**MVP Risk:**

- **Low**: Well-understood, low chance of MVP delay
- **Medium**: Some uncertainty, may require design iteration
- **High**: High complexity or novel feature; may impact timeline if issues arise

**Priority:**

- **Critical**: Blocks v0.1–v0.3 release or core journey; non-negotiable
- **High**: Important for adoption but can be deferred to v0.4 if necessary
- **Medium**: Nice-to-have in MVP; could move to post-MVP without major impact
- **Low**: Post-MVP or optional enhancements
