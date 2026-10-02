# User Story Map — Initialization & Migration

**Backbone:** Project setup (greenfield and brownfield)
**Origin Journey:** `05_journeys.md` → Journey 0a (Initialize on New Project) + Journey 0b (Migrate to Existing Project)
**Primary Persona:** Alex (solo dev) / Morgan (tech lead)

> Tag: **[MVP · vX]** = MVP delivery release · **[Future]** = post-MVP. See [00_index.md](00_index.md).

---

## Backbone A: Initialization on new project (Journey 0a)

### Step 1 — Repository creation and project structure

* **[MVP · v0.1]** US-0A-01: As Alex, I want all project state saved in a centralized git repository in `.wingfoil/` so
  I have a single source of truth versioned from day one. _(feat: P1.1)_
* **[MVP · v0.1]** US-0A-02: As Morgan, I want every modification (Memory, DNA, Directives, Workflow) automatically
  tracked via git with author, timestamp, and message so that I have an audit trail without manual work. _(feat: P1.2)_
* **[MVP · v0.1]** US-0A-03: As Alex, I want a `.wingfoil/memory/` structure ready to contain versioned documents and
  artifacts so that I can record decisions immediately. _(feat: P1.11)_
* **[MVP · v0.1]** US-0A-04: As Morgan, I want to define Memory element types (pattern paths, allowed states, and
  transitions) in `.wingfoil/memory.yaml` so that I have coherent per-type state machines. _(feat: P1.13)_
* **[MVP · v0.1]** US-0A-05: As Alex, I want a structured project map (modules, stacks, team, resource paths) in
  `.wingfoil/dna.yaml` so that humans and agents have shared anatomy. _(feat: P2.4)_

### Step 2 — Interactive setup wizard execution

* **[MVP · v0.1]** US-0A-06: As Alex, I want to initialize WingFoil with an interactive wizard (`wingfoil init`) with
  methodology template selection so that I can configure the project in minutes without manual YAML editing. _(feat: P5.1.1)_
* **[MVP · v0.4]** US-0A-07: As Morgan, I want AI agent-assisted setup mode (natural conversation) so that I can adapt the
  template to my team context. _(feat: P5.4.5)_
* **[MVP · v0.1]** US-0A-08: As Alex, I want to define/update project DNA with `wingfoil dna set` so that I can set initial
  modules, stacks, and team. _(feat: P2.1)_
* **[MVP · v0.2]** US-0A-09: As Morgan, I want the wizard to install predefined directive templates (Code Quality,
  Testing, Code Review, Architecture, Security, Documentation) so that I start with sensible rules reducing friction. _(feat: P3.8)_
* **[MVP · v0.3]** US-0A-10: As Alex, I want to choose a reference workflow template (Scrum / Kanban / Lean Inception /
  Trunk-Based / Custom) so that I generate phases and structure consistent with my methodology. _(feat: P4.18)_
* **[MVP · v0.3]** US-0A-11: As Alex, I want template selection to automatically expand phases, directives, and Memory
  sections so that I avoid manual configuration. _(feat: P4.19)_
* **[MVP · v0.3]** US-0A-12: As Morgan, I want to override template defaults so that I can adapt it to my team's style. _(feat: P4.20)_
* **[MVP · v0.3]** US-0A-13: As Morgan, I want to define available agent roles (developer, reviewer, QA, architect, …)
  so that I can route agents by role. _(feat: P5.4.1)_
* **[MVP · v0.4]** US-0A-14: As Alex, I want clear help, formatting, and error messages in the CLI so that I can configure
  the project without confusion _(cross-cutting)_. _(feat: P5.1.4)_

#### Edge cases (interruption / exception handling)

* **[MVP · v0.1]** US-0A-E1: As Alex, I want the `wingfoil init` wizard to be resumable after an abort or crash (re-run
  continues from the last saved answer) so that an interrupted setup loses no progress and needs no manual YAML cleanup.
  _(edge: Journey 0a — interrupted wizard)_
* **[MVP · v0.1]** US-0A-E2: As Morgan, I want to revise generic or mismatched wizard guesses afterwards via
  `wingfoil dna set` and `wingfoil directive edit` so that defaults that don't fit the project can be corrected without
  re-initializing. _(edge: Journey 0a — generic/mismatched defaults)_

### Step 3 — Workflow kickoff phase launch

* **[MVP · v0.3]** US-0A-15: As Morgan, I want to define workflow structure (phases → steps → atomic actions) with
  `kind: main/sub` classification in `.wingfoil/workflows.yaml` so that I model the team process. _(feat: P4.1)_
* **[MVP · v0.3]** US-0A-16: As Alex, I want to start a main workflow with `wingfoil workflow start --name [workflow]`
  setting it as active context so that I officially begin the project. _(feat: P4.2)_
* **[MVP · v0.3]** US-0A-17: As Alex, I want to close the active main workflow with `wingfoil workflow end` so that I
  reset/clear active context when done. _(feat: P4.3)_
* **[MVP · v0.3]** US-0A-18: As Alex, I want to list executable workflows now with `wingfoil workflow list` so that I know
  what I can start. _(feat: P4.6)_
* **[MVP · v0.3]** US-0A-19: As Alex, I want to view workflow details (phases, steps, directives, Memory structure) with
  `wingfoil workflow show` so that I understand how it's composed. _(feat: P4.7)_
* **[MVP · v1.0]** US-0A-20: As the system, I want to execute steps as atomic actions (memory.add, memory.submit,
  agent.execute, git operations) so that I automate workflow progression. _(feat: P4.10)_
* **[MVP · v1.0]** US-0A-21: As Alex, I want predefined workflow templates (Task, Release) so that I start from common
  patterns without building from scratch. _(feat: P4.17)_

### Step 4 — Project structure path verification

* **[MVP · v0.1]** US-0A-22: As Alex, I want to query resource paths by category (
  `wingfoil paths sources/tests/docs/config/governance`) with drill-down and console/json/yaml output so that I confirm all
  resources are mapped for agent navigation. _(feat: P2.5)_

---

## Backbone B: Migration to existing project (Journey 0b)

### Step 1 — Current project state audit

* **[MVP · v0.4]** US-0B-01: As Morgan, I want to run `wingfoil audit` to scan the project and summarize languages,
  frameworks, and structure so that I understand the state before migration. _(feat: P5.1.3)_

### Step 2 — Interactive migration wizard

* **[MVP · v0.4]** US-0B-02: As Morgan, I want to initialize WingFoil on existing project with
  `wingfoil init --mode infer` so that I migrate without rewriting code structure. _(feat: P5.1.2)_
* **[MVP · v0.4]** US-0B-03: As Morgan, I want `wingfoil dna infer` to scan the codebase and propose DNA structure (
  which I approve/refine) so that DNA reflects real modules and stacks. _(feat: P2.3)_
* **[MVP · v0.4]** US-0B-04: As Alex, I want to scan the project and import existing documents into Memory interactively
  with metadata extraction (`wingfoil memory import`) so that I reduce migration friction. _(feat: P1.4)_

#### Edge cases (interruption / exception handling)

* **[MVP · v0.4]** US-0B-E1: As Morgan, I want `wingfoil dna infer` to present its proposal for human approval and
  refinement before writing so that misclassified structure or missed modules and stacks are corrected and no wrong DNA is
  committed. _(edge: Journey 0b — imperfect inference)_
* **[MVP · v0.4]** US-0B-E2: As Morgan, I want directives inferred from git history flagged as drafts I can tighten or
  relax before activation so that overly permissive or restrictive rules never enforce silently. _(edge: Journey 0b —
  mis-scoped inferred directives)_

### Step 3 — Gradual team rollout

* **[MVP · v0.3]** US-0B-05: As Morgan, I want workflow steps and approval routing already active so that I introduce
  WingFoil gradually without a hard cutover. _(ref: P4.1, P4.14 — home in other journeys)_

### Step 4 — Workflow and agent usage begins

* **[MVP · v0.3]** US-0B-06: As Jordan, I want to execute workflow steps with `wingfoil workflow next` and
  `wingfoil agent execute` so that I start working with full context. _(ref: P4.4, P5.3.1 — home in Journey 1)_

### Future (Post-MVP)

* **[Future]** US-0B-F1: As Morgan, I want process mining that automatically infers workflow from git history so that I avoid
  manual process configuration. _(Post-MVP: Process mining)_