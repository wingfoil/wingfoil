# SARD — Part 1: Architectural Constraints & Patterns

**Document:** System & Architecture Requirements Document (SARD)
**Source:** `docs/02_requirements/02_bdd/` (BDD scenarios) + `docs/01_vision/` (Vision Package)
**ID prefix:** `REQ-SYS-*`

> Every requirement carries a **Fit Criterion**: an objective, measurable acceptance test.

---

## 1. Architectural Constraints & Patterns

### REQ-SYS-01 — Git-backed single source of truth

* **Description:** All project state (Memory, DNA, Directives, Workflow) is persisted as files under `.wingfoil/` in the
  project's git repository. No external database or service holds authoritative state.
* **Rationale:** One versioned, auditable source of truth; zero infra to operate (Vision: open-source harness).
* **Fit Criterion:** A fresh `git clone` of the repository reconstructs 100% of Memory/DNA/Directives/Workflow state
  with no external data source; a state dump before and after clone is byte-identical.
* **Traceability:** Feature P1.1 (US-0A-01, BDD `p1-memory/P1.1-git-backed-storage.feature`); Feature P1.11
  (US-0A-03, BDD `p1-memory/P1.11-memory-entries.feature`).

### REQ-SYS-02 — Decoupled pillars as independent artifacts

* **Description:** The four pillars are separate, independently loadable config artifacts: `.wingfoil/memory.yaml`,
  `.wingfoil/dna.yaml`, `.wingfoil/directives/`, `.wingfoil/workflows.yaml`.
* **Rationale:** Component decoupling; a change in one pillar must not force edits in another.
* **Fit Criterion:** Each pillar artifact passes its own schema validation in isolation; editing one artifact and
  reloading does not raise errors in the others (automated cross-pillar load test).
* **Traceability:** Feature P2.4 (US-0A-05, BDD `p2-dna/P2.4-project-dna-config.feature`); Feature P3.5 (US-4-03,
  BDD `p3-directives/P3.5-project-directives.feature`); Feature P4.1 (US-0A-15, BDD `p4-workflow/P4.1-workflow-config.feature`);
  Feature P1.13 (US-0A-04, BDD `p1-memory/P1.13-memory-element-schema.feature`).

### REQ-SYS-03 — Stateless state derivation (no state index)

* **Description:** Workflow state is deduced from Memory file existence and frontmatter; there is no separate
  `.wingfoil/state/` index.
* **Rationale:** Avoids dual-source-of-truth drift; state lives next to the deliverable.
* **Fit Criterion:** No `.wingfoil/state/` artifact exists; deleting any in-memory cache and recomputing state yields a
  result identical to the prior computation for the same commit.
* **Traceability:** Feature P4.13 (US-1-02, BDD `p4-workflow/P4.13-state-deduction.feature`).

### REQ-SYS-04 — Configurable per-type state machines

* **Description:** Memory element types and their state machines (states + transitions) are declared in
  `.wingfoil/memory.yaml`, not hardcoded.
* **Rationale:** Different element types (task, release) have different lifecycles.
* **Fit Criterion:** Adding a new type with custom states to `memory.yaml` is honored by `submit`/`approve`/`reject`
  with no source-code change; an illegal transition for that type is rejected.
* **Traceability:** Feature P1.13 (US-0A-04, BDD `p1-memory/P1.13-memory-element-schema.feature`); Feature P4.11
  (US-4-08, BDD `p4-workflow/P4.11-deliverables.feature`).

### REQ-SYS-05 — Dual interface over a shared core

* **Description:** Humans interact via CLI; agents via an MCP server. Both sit on the same core domain logic.
* **Rationale:** Single behavior, two surfaces; prevents divergence between human and agent operations.
* **Fit Criterion:** Every state-mutating operation available in the CLI is reachable via an MCP tool and vice versa; an
  automated parity test enumerates both surfaces and reports 0 unmatched operations. The bootstrap commands are exempt:
  `init`, which must run before a WingFoil project exists, and `mcp`, which starts the MCP server itself. Neither is
  exposed on MCP, and the parity test does not enumerate them. Ratified by `dl-046-bootstrap-commands-in-spec-006-section-3`
  (2026-09-29, option A(a)); an agent connected through `wingfoil mcp` is already inside an initialised project, so an
  MCP `init` would have no caller.
* **Traceability:** Feature P5.1.1 (US-0A-06, BDD `p5-interaction/P5.1.1-init.feature`); Feature P5.1.2 (US-0B-02,
  BDD `p5-interaction/P5.1.2-init-infer.feature`); Feature P5.1.3 (US-0B-01, BDD `p5-interaction/P5.1.3-audit.feature`);
  Feature P5.1.4 (US-0A-14, BDD `p5-interaction/P5.1.4-cli-ux.feature`); Feature P5.2.1 (US-1-07,
  BDD `p5-interaction/P5.2.1-mcp-resources.feature`); Feature P5.2.2 (US-1-06, BDD `p5-interaction/P5.2.2-mcp-prompts.feature`);
  Feature P5.2.3 (US-2-11, BDD `p5-interaction/P5.2.3-mcp-tools.feature`).

### REQ-SYS-06 — Workflow composition via include() with main/sub kinds

* **Description:** Workflows declare `kind: main` (independently startable) or `kind: sub` (include-only); composition
  uses `include()` with optional `iterate_over`/`where`.
* **Rationale:** Reusable process building blocks.
* **Fit Criterion:** A `sub` cannot be started directly (rejected); an `include` with
  `iterate_over: task where status=backlog` runs exactly once per matching element (verified by P4.16 scenarios).
* **Traceability:** Feature P4.1 (US-0A-15, BDD `p4-workflow/P4.1-workflow-config.feature`); Feature P4.2 (US-0A-16,
  BDD `p4-workflow/P4.2-workflow-start.feature`); Feature P4.16 (US-6-04, BDD `p4-workflow/P4.16-include-composition.feature`).

### REQ-SYS-07 — Deterministic context assembly (North Star)

* **Description:** Identical inputs (specs + config + project state) produce an equivalent agent execution context.
* **Rationale:** Determinism Index is the product's North Star metric.
* **Fit Criterion:** Assembling the execution context twice for the same task, role, and unchanged project state yields
  byte-for-byte identical output.
* **Traceability:** Feature P5.4.4 (US-1-05, BDD `p5-interaction/P5.4.4-execution-context.feature`);
  `08_mvp-canvas.md` (North Star).

### REQ-SYS-08 — Role-based binding (function, not person)

* **Description:** Directives and approval authority bind to roles defined in `.wingfoil/dna.yaml`, never to hardcoded
  individuals.
* **Rationale:** Rules survive team changes; no per-person edits.
* **Fit Criterion:** Reassigning a person's role in DNA changes their effective directives and approval authority with
  zero edits to directive or workflow files.
* **Traceability:** Feature P3.2 (US-4-05, BDD `p3-directives/P3.2-directive-assign.feature`); Feature P3.7 (US-4-06,
  BDD `p3-directives/P3.7-role-based-assignment.feature`); Feature P4.14 (US-4-07, BDD `p4-workflow/P4.14-approval-routing.feature`);
  Feature P5.4.2 (US-3-07, BDD `p5-interaction/P5.4.2-role-directives-binding.feature`).

### REQ-SYS-09 — Distribution as an npm package

* **Description:** WingFoil ships as an installable npm package exposing the `wingfoil` CLI.
* **Rationale:** MVP success criterion: "Published to npm with documentation".
* **Fit Criterion:** `npm install -g wingfoil` makes the `wingfoil` command available on PATH and `wingfoil --help`
  exits 0; the published package includes README + command docs.
* **Traceability:** `08_mvp-canvas.md` (MVP Success Criteria) — distribution requirement with no behavioral BDD
  feature; verified directly against the npm-publish acceptance test.
