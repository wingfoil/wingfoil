# User Story Map — Workflow Configuration Definition and Evolution

**Backbone:** Workflow design/refinement via CLI (no YAML), test and deploy without blocking ongoing work
**Origin Journey:** `05_journeys.md` → Journey 6 (Morgan: "Define and Evolve Workflow Configuration")
**Primary Persona:** Morgan (tech lead)

> Tag: **[MVP · vX]** = MVP delivery release · **[Future]** = post-MVP. See [00_index.md](00_index.md).

---

## Backbone: Workflow evolution

### Step 1 — Review current workflow and identify gaps

* **[MVP · v0.3]** US-6-01: As Morgan, I want to see current workflow structure and gaps with
  `wingfoil workflow show [workflow]` so that I understand what's missing (e.g., an approval gate for architecture
  decisions). _(ref: P4.7 — home in Journey 0a)_

### Step 2 — Define new workflow phase/step

* **[MVP · v0.3]** US-6-02: As Morgan, I want to create a custom workflow with `wingfoil workflow create` (interactive
  or flag-based) so that I define new phase without manual YAML editing. _(feat: P4.8)_
* **[MVP · v1.0]** US-6-03: As Morgan, I want to define pre/post step validation rules (file.exists,
  frontmatter.required, git.commits, tests.coverage) so that I enforce quality gates on new steps. _(feat: P4.12)_
* **[MVP · v0.3]** US-6-04: As Morgan, I want to compose sub-workflows via `include()`, executable once or
  once-per-element with `iterate_over: <type>` and `where` filters (status/tags), so that I reuse logic across elements. _(feat: P4.16)_
* **[MVP · v0.1]** US-6-05: As Morgan, I want to update roles and approvers in DNA with `wingfoil dna set` so that I support
  the new approval gate. _(ref: P2.1 — home in Journey 0a)_

### Step 3 — Bind directives to roles for new step

* **[MVP · v0.2]** US-6-06: As Morgan, I want to bind directives to new step roles with
  `wingfoil directive assign --directive ... --role ...` so that they auto-load when agents/users execute it. _(ref: P3.2 —
  home in Journey 4)_
* **[MVP · v0.2]** US-6-07: As Morgan, I want to remove a custom directive with `wingfoil directive remove` after
  verifying it's not referenced elsewhere so that I keep configuration clean during evolution. _(feat: P3.3)_

### Step 4 — Test workflow with agent (dry-run)

* **[MVP · v0.3]** US-6-08: As Morgan, I want to test workflow logic with `wingfoil agent execute --dry-run` so that I
  validate it without blocking the team. _(ref: P5.3.1 — home in Journey 1)_
* **[MVP · v0.3]** US-6-E1: As Morgan, I want to dry-run rejection and fallback paths (not only the happy path) with
  `wingfoil agent execute --dry-run` so that edge transitions are validated before deployment, not discovered in
  production. _(edge: Journey 6 — untested edge transitions)_

### Step 5 — Commit workflow changes to git

* **[MVP · v0.1]** US-6-09: As Morgan, I want workflow changes versioned and auditable via git commit so that I track process
  evolution. _(ref: P1.2 — home in Journey 0a)_

### Step 6 — Announce changes and monitor execution

* **[MVP · v0.3]** US-6-10: As Morgan, I want to monitor new tasks follow new workflow (in-flight tasks remain
  unchanged) with `wingfoil workflow status` so that I deploy without manual migration. _(ref: P4.5 — home in Journey 2)_
* **[MVP · v0.3]** US-6-11: As Morgan, I want to remove a custom workflow with `wingfoil workflow remove` after
  verifying it's not included elsewhere so that I safely deprecate obsolete processes. _(feat: P4.9)_
* **[MVP · v0.3]** US-6-E2: As Morgan, I want in-flight tasks to keep running on their original workflow version when I
  deploy a restructured workflow so that a mid-flight process change never corrupts or blocks active work. _(edge:
  Journey 6 — in-flight migration)_
* **[MVP · v0.3]** US-6-12: As Morgan, I want each run's process conformance computed from git and the configuration
  alone — every check with its items checked and failing, every failing item named — so that I see whether a run
  followed the workflow without trusting the agent's own report. _(req: REQ-STATE-10; ref: P1.2, P4.13 — measured by
  the release-health catalogue's P measures)_

### Future (Post-MVP)

* **[Future]** US-6-F1: As Morgan, I want workflow visualization (Gantt/graph) so that I visually understand phases and
  dependencies. _(Post-MVP: Workflow visualization)_
* **[Future]** US-6-F2: As Morgan, I want full blocker and dependency management (critical path) so that I model complex
  relationships beyond simple fallback. _(Post-MVP: Blockers & dependencies full)_
