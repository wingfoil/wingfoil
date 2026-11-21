# User Story Map — Decision Visibility & Alignment Notifications

**Backbone:** Understand decisions, traceability (req→test→release), audit trail, targeted approvals
**Origin Journey:** `05_journeys.md` → Journey 5 (Casey: "Understand Project Decisions and Get Notified")
**Primary Persona:** Casey (non-technical PM)

> Tag: **[MVP · vX]** = MVP delivery release · **[Future]** = post-MVP. See [00_index.md](00_index.md).

---

## Backbone: Visibility and decisions

### Step 1 — Access project Memory

* **[MVP · v0.1]** US-5-01: As Casey, I want CLI access to all project decisions and artifacts so that I see state without
  asking the team. _(ref: P1.11 — home in Journey 0a)_

### Step 1.5 — Explore document structure

* **[MVP · v0.1]** US-5-02: As Casey, I want to query document paths with `wingfoil paths docs` /
  `wingfoil paths governance` so that I know where to find architecture, data model, and team/stakeholder info. _(ref: P2.5 —
  home in Journey 0a)_

### Step 2 — Search/navigate decisions by topic

* **[MVP · v0.1]** US-5-03: As Casey, I want to search decisions by topic with `wingfoil memory search api-design` so that I
  quickly find the decision I need. _(ref: P1.5 — home in Journey 1)_
* **[MVP · v0.2]** US-5-04: As Casey, I want deprecated documents marked with `wingfoil memory deprecate` (stay in repo,
  agents ignore them) so that I distinguish active decisions from archived ones and avoid clutter in searches. _(feat: P1.9)_

#### Edge cases (interruption / exception handling)

* **[MVP · v0.2]** US-5-E1: As Casey, I want deprecated decisions filtered out of my searches by default (opt-in to
  include them) so that archived clutter never obscures the active decision I am looking for. _(edge: Journey 5 —
  archived clutter)_

### Step 3 — Read decision document (ADR, RFC)

* **[MVP · v0.1]** US-5-05: As Casey, I want to read the decision document so that I understand what, why, and who decided.
  _(ref: P1.11 — home in Journey 0a)_

### Step 4 — Check DNA for current state

* **[MVP · v0.1]** US-5-06: As Casey, I want to display DNA with `wingfoil dna show` so that I know who builds the
  project and with what: team size and stacks. _(ref: P2.2 — home in Journey 3)_

### Step 4.5 — Check release progress (read-only view)

* **[MVP · v0.3]** US-5-11: As Casey, I want a read-only view of the open workflow runs with `wingfoil workflow status`
  — each run at its current phase, the steps waiting on its frontier and the pending approvals with who they are routed
  to — so that I follow release progress and see what is pending or blocking without asking the team. _(ref: P4.5 —
  home in Journey 2)_

### Step 5 — Review traceability configured in workflow

* **[MVP · v0.3]** US-5-07: As Casey, I want to see req→test→release traceability links defined in workflow and Memory
  metadata so that I understand how requirements flow to test and release. _(ref: P4.1 — home in Journey 0a)_

### Step 6 — Query audit trail

* **[MVP · v0.2]** US-5-08: As Casey, I want to query a document's audit trail with
  `wingfoil memory history [document-id]` so that I see who decided what, when, why, and what changed. _(feat: P1.10)_

### Step 7 — Trigger "human needed" flag

* **[MVP · v0.3]** US-5-09: As Casey, I want to be notified when my specific action is required (e.g., "Approve database
  migration") so that I intervene only when needed. _(ref: X1.1 — home in Journey 2)_

### Step 8 — Casey reviews and approves/declines

* **[MVP · v0.2]** US-5-10: As Casey, I want to approve or reject with
  `wingfoil memory approve/reject [document-id] --reason "..."` so that decision is documented and versioned in Memory. _(
  ref: P1.7, P1.8 — home in Journey 2/4)_

### Future (Post-MVP)

* **[Future]** US-5-F1: As Casey, I want a web UI dashboard with approval bottleneck alerts so that I monitor visually
  without CLI. _(Post-MVP: Dashboard UI)_
