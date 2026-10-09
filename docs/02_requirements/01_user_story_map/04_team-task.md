# User Story Map — Team Task Execution with Auto-Loaded Directives

**Backbone:** Take ownership of assigned task, execute with team directives, submit for approval
**Origin Journey:** `05_journeys.md` → Journey 3 (Jordan: "Execute Team Task with Auto-Loaded Directives")
**Primary Persona:** Jordan (team developer)

> Tag: **[MVP · vX]** = MVP delivery release · **[Future]** = post-MVP. See [00_index.md](00_index.md).

---

## Backbone: Team task

### Step 1 — Check tasks assigned in team workflow

* **[MVP · v0.3]** US-3-01: As Jordan, I want to see tasks assigned to me with `wingfoil workflow next --assigned-to me`
  so that I know what to work on. _(ref: P4.4 — home in Journey 1)_

### Step 2 — Select task and review directives + context

* **[MVP · v0.3]** US-3-02: As Jordan, I want to see task description, assigned directives, and team conventions with
  `wingfoil workflow show release-cycle` so that I understand what I must respect. _(ref: P4.7 — home in Journey 0a)_

### Step 3 — Review team context (DNA and relevant decisions)

* **[MVP · v0.1]** US-3-03: As Jordan, I want to query and display project DNA with `wingfoil dna show` so that I understand
  team architecture. _(feat: P2.2)_
* **[MVP · v0.1]** US-3-04: As Jordan, I want to search for relevant decisions with `wingfoil memory search` so that I align
  with what's already been decided. _(ref: P1.5 — home in Journey 1)_

### Step 4 — Launch agent to execute task with team rules

* **[MVP · v0.3]** US-3-05: As Jordan, I want to launch the agent with `wingfoil agent execute --element task:{id}` so that I
  initialize it with task, role directives, and team context. _(ref: P5.3.1 — home in Journey 1)_

### Step 5 — Agent executes respecting team conventions

* **[MVP · v0.2]** US-3-06: As Jordan, I want directives to auto-load when agents/developers execute tasks with that
  role so that the agent knows code standards, test requirements, and review gates without manual instructions. _(feat: P3.6)_
* **[MVP · v0.3]** US-3-07: As Morgan, I want to bind directives to agent roles with auto-load on execution (role →
  directives binding) so that rule-role binding is an automatic differentiator. _(feat: P5.4.2)_

### Step 6 — Jordan reviews agent output and verifies directives

* **[MVP · v0.3]** US-3-08: As Jordan, I want to verify agent work against directives and request changes if needed so that I
  ensure compliance before submission. _(ref: P5.4.4 — home in Journey 1)_
* **[MVP · v0.3]** US-3-E1: As Jordan, I want to reject and re-run the agent when its output drifts outside the task
  scope so that out-of-scope work is caught before submission and never approved by mistake. _(edge: Journey 3 — agent
  scope drift)_

### Step 7 — Jordan submits task for Morgan's approval

* **[MVP · v0.2]** US-3-09: As Jordan, I want to submit a Memory document for approval with
  `wingfoil memory submit [document-id]` (transition draft → pending) so that I submit work to Morgan's review. _(feat: P1.6)_
* **[MVP · v0.3]** US-3-E2: As Jordan, I want my submitted deliverable to stay safely in `pending` while Morgan is
  unavailable so that a blocked approval gate never loses my work or forces rework. _(edge: Journey 3 — blocked approval
  gate)_

### Step 8 — Receive feedback or approval from Morgan

* **[MVP · v0.3]** US-3-10: As Jordan, I want to see if Morgan approves or requests changes with
  `wingfoil workflow status` so that I close the loop with directive-linked feedback. _(ref: P4.5 — home in Journey 2)_