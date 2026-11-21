# User Story Map — Governance: Conventions and Violation Detection

**Backbone:** Encode rules once, auto-load for agents, notify and approve on submission
**Origin Journey:** `05_journeys.md` → Journey 4 (Morgan: "Enforce Team Conventions and Detect Violations")
**Primary Persona:** Morgan (tech lead)

> Tag: **[MVP · vX]** = MVP delivery release · **[Future]** = post-MVP. See [00_index.md](00_index.md).

---

## Backbone: Governance and conventions

### Step 1 — Document team conventions

* **[MVP · v0.1]** US-4-01: As Morgan, I want to create/add documents to Memory with `wingfoil memory add` (draft state)
  so that I make conventions git-backed and searchable. _(feat: P1.3)_
* **[MVP · v0.2]** US-4-02: As Morgan, I want to create custom directives with `wingfoil directive create` so that I encode
  my team's "how we work" rules. _(feat: P3.1)_
* **[MVP · v0.2]** US-4-03: As Morgan, I want to define scoped rules by role (custom + built-in) in
  `.wingfoil/directives/` so that I have a shared, versionable directive layer. _(feat: P3.5)_
* **[MVP · v0.2]** US-4-04: As Morgan, I want to list available directives (custom + built-in) and role assignments with
  `wingfoil directives list` so that I manage rules with visibility. _(feat: P3.4)_

### Step 2 — Assign directives to roles

* **[MVP · v0.2]** US-4-05: As Morgan, I want to bind a directive to a role (defined in DNA) with
  `wingfoil directive assign --directive ID --role ...` so that rules bind to function, not person. _(feat: P3.2)_
* **[MVP · v0.2]** US-4-06: As Morgan, I want to bind multiple directives to a role (one-to-many relationship) so that I
  compose flexible rules by function. _(feat: P3.7)_
* **[MVP · v0.3]** US-4-07: As Morgan, I want to define approvers by role or person (team members in
  `.wingfoil/dna.yaml`) so that I route approvals without hardcoding email. _(feat: P4.14)_

### Step 3 — Create workflow deliverables

* **[MVP · v0.3]** US-4-08: As Jordan (or agent), I want to create a deliverable Memory with state in frontmatter (
  `wingfoil memory add --type task --title "..."`) so that state follows per-type state machine. _(feat: P4.11)_

### Step 4 — Compile and submit deliverable

* **[MVP · v0.2]** US-4-09: As Jordan (or agent), I want to compile and submit deliverable with
  `wingfoil memory submit` (transition to pending) so that Morgan is notified for review. _(ref: P1.6 — home in Journey 3)_

### Step 5 — Review deliverable against directives

* **[MVP · v0.2]** US-4-10: As Morgan, I want to approve a deliverable with
  `wingfoil memory approve [document-id] --reason "..."` so that I record that directives were respected. _(ref: P1.7 — home
  in Journey 2)_
* **[MVP · v0.2]** US-4-11: As Morgan, I want to reject a document with `wingfoil memory reject` returning it to draft
  with feedback so that I send it back for rework. _(feat: P1.8)_
* **[MVP · v0.3]** US-4-12: As Morgan, I want on rejection the workflow to jump to a `fallback` step in the same
  workflow, optionally setting new document state (`fallback.set_state`), so that I handle rejections gracefully. _(feat: P4.15)_
* **[MVP · v0.4]** US-4-14: As Morgan, I want CI to check every pushed commit range with `wingfoil verify --base <rev>`
  so that a forged approval, an approval without authority or a status changed outside a Memory operation fails the
  build (exit `1`) instead of reaching the audit trail unnoticed. _(feat: P1.14)_
* **[MVP · v0.3]** US-4-15: As Morgan, I want to print one recorded agent run with `wingfoil agent show <run-id>` — its
  role, agent, exit status, duration and token counts — and the commit that added it, so that I see what an agent did on
  a deliverable's step before I approve it. _(feat: P5.3.5)_

#### Edge cases (interruption / exception handling)

* **[MVP · v0.2]** US-4-E1: As Morgan, I want to approve a deliverable with a documented exception reason when an overly
  rigid directive blocks otherwise-valid work so that legitimate edge cases proceed without silently weakening the rule.
  _(edge: Journey 4 — overly rigid directive)_

### Step 6 — Update rule (if needed)

* **[MVP · v0.1]** US-4-13: As Morgan, I want to edit the directive file and record update with `wingfoil memory add` so
  future work respects the refinement, auditably. _(ref: P1.3, P3.5)_

> **Scope note (`05_journeys.md`, obstacles J4):** MVP violation detection
> relies on human review at approval time, not automatic code parsing
> (out of MVP scope — see [Future]).

### Future (Post-MVP)

* **[Future]** US-4-F1: As Morgan, I want automatic directive enforcement via CI/CD hooks so that I detect violations before
  merge without manual review. _(Post-MVP: Automated enforcement)_
