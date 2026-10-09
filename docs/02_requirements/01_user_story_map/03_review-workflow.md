# User Story Map — Review Workflow Management & Review Agent

**Backbone:** Workflow state management, identify pending submissions, launch review agent, decide
**Origin Journey:** `05_journeys.md` → Journey 2 (Sam: "Manage Review Workflow and Launch AI Review Agent")
**Primary Persona:** Sam (code reviewer)

> Tag: **[MVP · vX]** = MVP delivery release · **[Future]** = post-MVP. See [00_index.md](00_index.md).

---

## Backbone: Review workflow

### Step 1 — Check pending review submissions

* **[MVP · v0.3]** US-2-01: As Sam, I want to see the status of all open main workflows and pending approvals with
  `wingfoil workflow status --format json/yaml` so that I identify reviews to do. _(feat: P4.5)_
* **[MVP · v0.3]** US-2-02: As Sam, I want to be notified when approval or decision is required ("Human Needed") so that I
  don't need to manually monitor the queue. _(feat: X1.1)_
* **[MVP · v0.3]** US-2-03: As Morgan, I want notifications routed by role or person (notification routing) so that I receive
  only relevant alerts. _(feat: X1.2)_

#### Edge cases (interruption / exception handling)

* **[MVP · v0.3]** US-2-E1: As Sam, I want pending reviews to stay queued and visible across sessions until decided so
  that a backlog of submissions is never lost when I cannot keep pace. _(edge: Journey 2 — review bottleneck)_

### Step 2 — Select a submission to review

* **[MVP · v0.3]** US-2-04: As Sam, I want to select a specific task from pending reviews list so that I focus on one
  submission at a time. _(ref: P4.5)_

### Step 3 — Review submission details and assigned directives

* **[MVP · v0.3]** US-2-05: As Sam, I want to see task context, submission, and team conventions to verify with
  `wingfoil workflow show release-cycle` so that I know what to evaluate against. _(ref: P4.7 — home in Journey 0a)_

### Step 4 — Launch review agent with team directives

* **[MVP · v0.3]** US-2-06: As Sam, I want to launch an agent with
  `wingfoil agent execute --role reviewer --element task:{id}` so that I initialize it with review directives, quality
  standards, and context. _(ref: P5.3.1 — home in Journey 1)_
* **[MVP · v0.3]** US-2-07: As the system, I want to route the agent to the correct role based on current workflow step
  so that I apply the right directives for review phase. _(feat: P5.3.2)_

### Step 5 — Agent analyzes code/doc against standards

* **[MVP · v0.3]** US-2-08: As the agent, I want to retrieve code diffs and relevant Memory/Directives so that I verify
  submission against team conventions and quality standards. _(ref: P5.2.1 — home in Journey 1)_

### Step 6 — Sam reviews agent output and provides feedback

* **[MVP · v0.3]** US-2-09: As Sam, I want to inspect agent analysis to validate it and find missed issues so that I ensure
  review quality. _(ref: P5.4.4 — home in Journey 1)_
* **[MVP · v0.3]** US-2-E2: As Sam, I want to override or annotate the review agent's output before recording my
  decision so that missed nuance or false positives never propagate unchecked into the audit trail. _(edge: Journey 2 —
  imperfect agent review)_

### Step 7 — Sam sends review decision

* **[MVP · v0.2]** US-2-10: As Sam, I want to approve a Memory document with
  `wingfoil memory approve [document-id] --reason "..."` recording approver, timestamp, and reason so that review is
  auditable and tied to directives. _(feat: P1.7)_
* **[MVP · v0.4]** US-2-11: As the agent, I want to submit deliverables and update workflow state via MCP Tools so that I
  record review decision without manual intervention. _(feat: P5.2.3)_

### Future (Post-MVP)

* **[Future]** US-2-F1: As Sam, I want advanced notifications (Slack, email) so that I receive review alerts in team
  channels. _(Post-MVP: Advanced notifications)_