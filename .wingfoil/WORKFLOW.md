# WingFoil — Workflow Reference

This document describes the complete workflow configuration for the WingFoil project as defined in
`.wingfoil/` (this directory). The single startable lifecycle is `sw-life-cycle`; four independent
**ingest mains** can be started on demand at any time.

---

## Software Life Cycle — `sw-life-cycle`

The end-to-end lifecycle from product discovery to end-of-life. Inception, specification, init,
and sunset run once; `release-line-cycle` iterates once per major version (v1, v2, ...) and
contains its own `initial-design` + `delivery` sub-phases — reusable as-is when a new major
version starts, without re-running `wingfoil-init`.

```mermaid
flowchart TD
    I["**inception**\n`lean-inception`\nProduct discovery — Vision Package"]
    S["**specification**\n`specification-downcast`\nUSM → BDD → SARD → Backlog"]
    INIT["**init**\n`wingfoil-init`\nConfig pillars only"]
    SFR["**seed-first-release-line**\nmemory.add(release-line, v1)\ninline phase, no include"]
    RLC["**release-line-cycle**\niterate_over: release-line\napprove → initial-design → delivery → plan-next-release-line"]
    SU["**sunset**\n`end-of-life`\nDeprecate + archive"]

    I --> S --> INIT --> SFR --> RLC --> SU
```

---

## Phase 1 — Inception: `lean-inception`

Five sessions transform the Product Brief into the Vision Package.
Input: `docs/01_vision/01_product-brief.md`.

```mermaid
flowchart TD
    PB["Product Brief"]

    S1["**Session 1** · `vision` *(facilitator)*\nProduct Vision · Is/Is Not"]
    S2["**Session 2** · `personas` *(facilitator)*\nPersonas"]
    S3["**Session 3** · `journeys` *(facilitator)*\nUser Journeys"]
    S4["**Session 4** · `features` *(architect)*\nFeature Brainstorm + Review"]
    S5["**Session 5** · `sequencer` *(product-owner)*\nSequencer + MVP Canvas"]

    VP["Vision Package\n`docs/01_vision/`"]

    PB --> S1 --> S2 --> S3 --> S4 --> S5 --> VP
```

**Outputs:** `product-vision.md`, `is-isnot.md`, `personas.md`, `journeys.md`, `features.md`,
`sequencer.md`, `mvp-canvas.md`.

---

## Phase 2 — Specification: `specification-downcast`

Four modules in strict sequence. Each module ends with a Stop-Check gate before the next begins.
Input: the full Vision Package from Phase 1.

```mermaid
flowchart TD
    VP["Vision Package\n`docs/01_vision/`"]

    M1["**Module 1** *(product-owner)*\n`user-story-mapping`\nbackbone → vertical-explosion → mvp-cut"]
    SC1{{"Stop-Check\n100% MVP Canvas features covered\nedge-case stories present"}}

    M2["**Module 2** *(qa)*\n`specification-by-examples`\nisolate-mvp → write-scenarios (Gherkin)"]
    SC2{{"Stop-Check\nscenarios atomic + testable\nzero ambiguous adjectives/adverbs"}}

    M3["**Module 3** *(architect)*\n`volere-requirements`\nextract-requirements → apply-volere-shell → group-by-macro-area"]
    SC3{{"Stop-Check\nevery REQ has numeric/boolean Fit Criterion"}}

    M4["**Module 4** *(product-owner)*\n`backlog-export`\ngenerate-records → map-dependencies → validate (JSON)"]
    SC4{{"Stop-Check\nvalid JSON · no duplicate IDs · no circular deps"}}

    VP --> M1 --> SC1 --> M2 --> SC2 --> M3 --> SC3 --> M4 --> SC4
```

**Outputs:** `docs/02_requirements/01_user_story_map/`, `02_bdd/`, `03_sard/`,
`docs/03_backlog/04_backlog/`.

---

## Phase 3 — Init: `wingfoil-init`

Runs once, ever, between specification and the first release-line. Pure config/tooling bootstrap:
creates the four WingFoil configuration pillars. No Memory content at all — no release roadmap, no
ADRs/Decision Logs/tech-specs; those all moved to `release-line-cycle` (Phase 5) so they can run
again for v2, v3, ... without repeating this phase.

```mermaid
flowchart TD
    IN["Specification outputs\n`docs/01_vision/` · `docs/02_requirements/` · `docs/03_backlog/`"]

    P1["**init-config** *(tech-lead)*\ndna.yaml · memory.yaml\ndirectives/ · roles.yaml · workflows.yaml"]
    SC1{{"Stop-Check\nschema valid per pillar · no status: fields\n[SPEC] refs present · roles declared in DNA"}}

    IN --> P1 --> SC1
```

---

## Phase 4 — Seed First Release Line

Runs once, ever, right after init — an inline `sw-life-cycle` phase (no `include:`), since it just
seeds the single input `release-line-cycle` (Phase 5) needs to start.

```mermaid
flowchart TD
    P2["**seed-first-release-line** *(product-owner)*\nmemory.add(type: release-line, version: v1) → memory.submit\nrelease-line: draft → planning\n✔ P4.12: [title, version]\n`docs/04_memory/planning/{id}.md`"]
```

Every *subsequent* release-line (v2, v3, ...) is **self-seeded** instead — by `plan-next-release-line`
at the end of the previous release-line-cycle iteration (Phase 5 below). This is the only place in
the whole config where a workflow creates an element of the same type its own outer loop iterates
over; it fits the existing `iterate_over` + `where` semantics (always a live query against current
Memory state, REQ-SYS-03 — never a fixed snapshot), just not previously exercised this way.

---

## Phase 5 — Release Line: `release-line-cycle`

Iterated once per release-line (`iterate_over: release-line`, `where: status ∈ [planning, active]`).
Composes the release-line-scoped setup (`initial-design`) with the per-release delivery loop
(`delivery`), then closes the release-line and self-seeds the next one.

```mermaid
flowchart TD
    AP["**approve** *(tech-lead)*\nmemory.approve\nrelease-line: planning → active\n🔑 Approval gate — *approver*\n↩ REJECT → approve"]
    ID["**initial-design**\nseed-releases + optional ADRs/DLs/tech-specs\n(see Phase 5a below)"]
    DL["**delivery** *(iterate_over: release)*\nwhere: release-line={release-line.version}, status∈[draft,planning,in-development]\n— release-cycle per minor release (see Phase 6 below) —"]
    PN["**plan-next-release-line** *(product-owner)*\nelement.set_state(done); IF another major planned:\nmemory.add(release-line) → memory.submit (self-seed)\n✔ pre-check: all its releases are `released`"]

    AP --> ID --> DL --> PN
```

### Phase 5a — Initial Design: `initial-design`

Runs once per release-line-cycle iteration — reusable as-is for v2, v3, ... Generates this
release-line's minor-release roadmap, then records the architecture/product decisions and
artefact specs already implied by it. `seed-releases` is required; the other three are optional.

```mermaid
flowchart TD
    IN2["`approve` output\nrelease-line: active"]

    P2b["**seed-releases** *(product-owner)*\nmemory.add(type: release, release-line: {release-line.version}, kind: minor) × N\nstatus: draft (no pending state)\n✔ P4.12: [title, kind, version, pillar, features, requirements, release-line]\n(kind exempt for minor-v0.1 … minor-v1.0)\n`docs/04_memory/planning/rl-{release-line}/{id}.md`"]
    SC2b{{"Stop-Check\nN files · all draft\nfeatures list complete per release"}}

    P3["**seed-adrs** *(architect)* · **OPTIONAL**\nmemory.add(type: adr)\ndraft → pending → accepted\n✔ P4.12: [title, sard_ref]\n`docs/04_memory/design/adrs/{id}.md`"]
    SC3{{"Stop-Check\nSARD ref present · Context/Decision/Consequences\nall ADRs status: accepted"}}

    P4["**seed-dls** *(architect)* · **OPTIONAL**\nmemory.add(type: decision-log)\ndraft → in-discussion → ready\n✔ P4.12: [title]\n`docs/04_memory/design/dls/{id}.md`"]
    SC4{{"Stop-Check\nContext/Decision/Consequences\nall DLs status: approved"}}

    P5["**seed-specs** *(architect)* · **OPTIONAL**\nagent.survey_specs (this release-line) → memory.add(type: tech-spec)\ndraft → pending → approved\n✔ P4.12: [title, scope]\n`docs/04_memory/design/specs/{id}.md`"]
    SC5{{"Stop-Check\nnot already covered by an approved spec\nall specs status: approved"}}

    IN2 --> P2b --> SC2b --> P3 --> SC3 --> P4 --> SC4 --> P5 --> SC5

    style P3 fill:#f9f9f9,stroke:#bbb,stroke-dasharray:5 5
    style SC3 fill:#f9f9f9,stroke:#bbb,stroke-dasharray:5 5
    style P4 fill:#f9f9f9,stroke:#bbb,stroke-dasharray:5 5
    style SC4 fill:#f9f9f9,stroke:#bbb,stroke-dasharray:5 5
    style P5 fill:#f9f9f9,stroke:#bbb,stroke-dasharray:5 5
    style SC5 fill:#f9f9f9,stroke:#bbb,stroke-dasharray:5 5
```

`seed-specs` is the release-line-wide sibling of `release-planning`'s `identify-specs` (Phase 6
below): same survey logic, but for artefacts spanning this whole release-line rather than one
release's task scope (e.g. `memory.yaml`'s own schema). `identify-specs` already dedupes against
"not yet covered by an approved spec", so nothing seeded here is re-created once a release's own
delivery starts.

---

## Phase 6 — Delivery: `release-cycle`

Iterated once per release (`iterate_over: release`, `where: release-line = {release-line.version},
status ∈ [draft, planning, in-development]` — scoped to the current release-line-cycle iteration).
Seven phases in sequence, each including one sub-workflow: `planning` (`release-planning`),
`implementation` (`dev-loop`), `user-docs` (`user-docs`, dl-013/dl-025), `e2e-smoke` (`e2e-smoke`,
dl-023), `submit` (`release-submit`), `publishing` (`release-publishing`) and `retrospective`
(`retrospective`). A patch runs every phase except `retrospective` (dl-092).

```mermaid
flowchart TD
    RP["**planning** → `release-planning`\nadvance-pinned-build → define-scope → triage-bugs → reconcile-governance\n→ record-adrs (opt.) → identify-specs → build-backlog → commit-backlog\n✔ P4.12 per step (see sub-diagram below)\n🔑 Approval gates — *approver*\nrelease: draft → planning → in-development"]

    DL["**implementation** → `dev-loop` *(iterate_over: task)*\nwhere: status=backlog, tags=[release.version]\n— design gate + TDD cycle per task, incl. bug-fix tasks —\nkeeps source bug in sync via bug.sync_state"]

    UD["**user-docs** → `user-docs`\ncheck-implementation-complete → align-user-docs → align-agent-docs\n🔑 Approval gates — *approver*\n(see sub-diagram below)"]

    ES["**e2e-smoke** → `e2e-smoke`\nfresh-init → drive-cli → mcp-registration → gate\n🔑 Approval gate — *approver*\n(see sub-diagram below)"]

    RS["**submit** → `release-submit`\npre-release-checks → enter-releasing → approve-release\n🔑 Approval gate — *approver*\nrelease: in-development → releasing\n↩ REJECT → pre-release-checks"]

    RP2["**publishing** → `release-publishing`\ntag → publish → mark-released\ngit tag · npm stage publish + approve\n🔑 Approval gate — *approver*\nrelease: releasing → released"]

    RT["**retrospective** → `retrospective`\nexplore → additional-points → capture → approve\n✔ P4.12: [title]\n🔑 Approval gates — *approver*\nOUTPUT: `docs/04_memory/design/dls/retro-{release.version}.md`"]

    RP --> DL --> UD --> ES --> RS --> RP2 --> RT
```

### Dev Loop — `dev-loop`

Iterated once per task (`iterate_over: task`) — including fix tasks derived from bugs. A `design`
gate precedes the TDD red-green-refactor cycle; rejection at review sends the task back to `red`.
Every phase that changes the task's state also calls `bug.sync_state`: a no-op unless the task
carries a `bug:` field, in which case it recomputes the source bug's own state from the aggregate
progress of *all* its derived fix tasks (task and bug share the `in-progress`/`in-review` state
names by design, so no separate bug-fix workflow is needed).

```mermaid
flowchart TD
    ST["**start** *(developer)*\ngit branch {task.id}\ntask: backlog → in-progress\n↳ bug.sync_state: source bug planned → in-progress"]
    DES["📐 **design** *(architect)* · safety net\nverify a tech-spec exists + is approved for every\nfile format/schema/constant/API the task implements\n✔ P4.12: [title, scope] (if scaffolded) + tech-spec: approved"]
    RED["🔴 **red** *(developer)*\nwrite failing test\n✔ tests.exist + tests.failing"]
    GREEN["🟢 **green** *(developer)*\nmin code to pass\n✔ tests.passing"]
    REF["🔵 **refactor** *(developer)*\nclean code, keep tests green\n✔ tests.passing + coverage ≥ 80%"]
    REV["📋 **review** *(reviewer)*\ntask: in-progress → in-review\n↳ bug.sync_state: source bug → in-review (once ALL its fix tasks are)\n🔑 Approval gate — *approver*"]
    DONE["✅ **done** *(developer)*\ngit merge to main\ntask: in-review → approved → done\n↳ bug.sync_state: source bug → resolved → closed (once ALL its fix tasks are done)"]

    ST --> DES --> RED --> GREEN --> REF --> REV
    REV -->|APPROVE| DONE
    REV -->|REJECT| RED
```

`design` is a fallback: most artefacts should already have an approved tech-spec from
`release-planning`'s `identify-specs` step; this gate only catches artefacts discovered while
implementing the task (detail not predictable at planning time).

### Release Planning — `release-planning`

Eight steps in sequence; `record-adrs` is optional. `advance-pinned-build` moves the pinned
published build forward first (dl-095); `triage-bugs` and `reconcile-governance` sweep in-scope
`open` bugs and not-ready decision-logs/ADRs into their gated states (dl-016), selecting only
elements whose `release` is empty or this release. Each `memory.add` step carries a P4.12 check gate
enforcing the required frontmatter fields before the next step begins. `define-scope`'s gate exempts
the releases added before dl-092 (`minor-v0.1` … `minor-v1.0`) from `kind`, which they do not carry
(bug-175).

```mermaid
flowchart TD
    AB["**advance-pinned-build** *(tech-lead)*\nnpm.pin_advance(wingfoil-released)\nforward only, published builds only\n✔ check:lockfile · check:mcp"]
    DS["**define-scope** *(product-owner)*\nmemory.submit\nrelease: draft → planning\n✔ P4.12: [title, kind, version, pillar, features, requirements, release-line]\n(kind exempt for minor-v0.1 … minor-v1.0)"]
    TB["**triage-bugs** *(tech-lead)*\nmemory.approve: bug open → triaged\n🔑 Approval gate — *approver*\n↩ REJECT → closed"]
    RG["**reconcile-governance** *(product-owner)*\nmemory.approve: decision-log in-discussion → ready\nadr pending → accepted\n🔑 Approval gate — *approver*\n↩ REJECT → draft"]
    RA["**record-adrs** *(architect)* · **OPTIONAL**\nmemory.add(type: adr) → memory.submit → memory.approve\n✔ spec-review.passed · P4.12: [title, sard_ref]\n🔑 Approval gate — *approver*\n`docs/04_memory/design/adrs/{id}.md`"]
    IS["**identify-specs** *(architect)*\nagent.survey_specs → memory.add(type: tech-spec) → memory.submit\n✔ P4.12: [title, scope]\n🔑 Approval gate — *approver*\n`docs/04_memory/design/specs/{id}.md`"]
    BB["**build-backlog** *(product-owner)*\nmemory.add(type: task) → memory.submit\nper ready DL / selected triaged bug: memory.add(type: task, dl/bug) → memory.submit\n→ bug.set_state(planned) · element.set_release\n✔ P4.12: [title, release, kind]\n`docs/04_memory/{release}/{id}.md`"]
    CB["**commit-backlog** *(tech-lead)*\ntask.set_state(backlog) · release.set_state(in-development)\n🔑 Approval gate — *approver*"]

    AB --> DS --> TB --> RG --> RA --> IS --> BB --> CB
    RG --> IS

    style RA fill:#f9f9f9,stroke:#bbb,stroke-dasharray:5 5
```

`identify-specs` surveys the release scope for file formats, schemas, constant sets, and module
APIs implied by its tasks, and scaffolds a tech-spec draft for each one not yet covered by an
approved spec — proactively, before `build-backlog` creates the tasks that will implement them.
`dev-loop/design` (above) remains as a reactive fallback for artefacts discovered only during
implementation.

### User Docs — `user-docs`

The documentation gate between `implementation` and `submit` (dl-013), which also owns the
agent-facing documents (dl-025). It starts only once every task of the release is `done`.

```mermaid
flowchart TD
    CI["**check-implementation-complete** *(tech-lead)*\n✔ pre: every task tagged {release.version} is done"]
    AU["**align-user-docs** *(developer)*\nREADME.md · docs/user-guide.md · docs/cli-reference.md\ndocs/examples/ · CHANGELOG.md\n✔ aligned with the shipped CLI/feature surface\n🔑 Approval gate — *approver*"]
    AA["**align-agent-docs** *(architect)*\nCLAUDE.md · .wingfoil/README.md · .wingfoil/WORKFLOW.md\n✔ status, element/state tables, workflow list and role bindings\nmatch CORE_MODULES, memory.yaml, workflows.yaml, roles.yaml\n✔ WORKFLOW.md names every workflow and phase\n🔑 Approval gate — *approver*"]

    CI --> AU --> AA
```

dl-025 leaves open whether `align-agent-docs` also runs at `plan-next-release-line`, when a
release-line closes; today only `user-docs` declares it.

### E2E Smoke — `e2e-smoke`

The end-to-end gate before `submit` (dl-023): a fresh `wingfoil init`, the CLI driven through its
commands, and the repository's MCP registration checked.

```mermaid
flowchart TD
    FI["**fresh-init** *(qa)*\nwingfoil init on a scratch project\n✔ exit 0 · scaffold round-trips its own loaders"]
    DC["**drive-cli** *(qa)*\ndna show · dna set · memory add/submit · paths · directives list\n✔ exit codes match spec-005 · no schema-invalid artifact"]
    MR["**mcp-registration** *(qa)*\nnpm run check:mcp\n✔ exit 0 · registered server version == package.json pin\n✔ advertised channels == EXPECTED_CHANNELS"]
    GA["**gate** *(qa)*\n✔ e2e-smoke-passed (staged: warn, then hard-reject)\n🔑 Approval gate — *approver*"]

    FI --> DC --> MR --> GA
```

---

## Phase 7 — Sunset: `end-of-life`

Retires the product or a major line. Documents remain in the repository (agents ignore deprecated
content, REQ-STATE-06).

```mermaid
flowchart TD
    AN["**announce** *(product-owner)*\nmemory.add(type: decision-log) 'End-of-life plan'\n✔ P4.12: [title]\n🔑 Approval gate — *approver*"]
    DE["**deprecate** *(tech-lead)*\nmemory.deprecate on active releases + ADRs\n✔ deprecated content excluded from agent context"]
    AR["**archive** *(tech-lead)*\ngit.commit('end-of-life: archive')\nfreeze the repository line"]

    AN --> DE --> AR
```

---

## Ingest Mains

Four lightweight `kind: main` workflows startable on demand at any point during the project
(REQ-STATE-03 allows multiple open mains concurrently).

```mermaid
flowchart LR
    subgraph BI["bug-ingest"]
        direction TB
        B1["**capture** *(developer)*\nmemory.add(type: bug)\nmemory.submit\n✔ P4.12: [title, severity]\ndraft → open"]
        B2["**triage** *(tech-lead)*\nmemory.approve\n🔑 *approver*\nopen → triaged"]
        B1 --> B2
    end

    subgraph DLI["decision-log-ingest"]
        direction TB
        D1["**capture** *(product-owner)*\nmemory.add(type: decision-log)\nmemory.submit\n✔ P4.12: [title]\ndraft → in-discussion"]
        D2["**approve** *(approver)*\nmemory.approve\nin-discussion → ready"]
        D1 --> D2
    end

    subgraph AI["adr-ingest"]
        direction TB
        A1["**capture** *(architect)*\nmemory.add(type: adr)\nmemory.submit\n✔ P4.12: [title, sard_ref]\ndraft → pending"]
        A2["**approve** *(approver)*\nmemory.approve\npending → accepted"]
        A1 --> A2
    end

    subgraph SI["service-ingest"]
        direction TB
        S1["**capture** *(developer)*\nmemory.add(type: service)\nmemory.submit\n✔ P4.12: [title, provider, kind, owner_role, verify]\n✔ spec-007 scan clean\ndraft → pending"]
        S2["**approve** *(approver)*\nruns `verify`\nmemory.approve\npending → active"]
        S1 --> S2
    end
```

| Workflow | Produces | Typical trigger |
|---|---|---|
| `bug-ingest` | `docs/04_memory/bugs/{id}.md` | Defect found during dev-loop or testing |
| `decision-log-ingest` | `docs/04_memory/design/dls/{id}.md` | Ad-hoc product/process decision |
| `adr-ingest` | `docs/04_memory/design/adrs/{id}.md` | Architectural decision during any phase |
| `service-ingest` | `docs/04_memory/services/{id}.md` | External state set up (account, credential by reference, listing, setting, domain, handle — `dl-088`) |

---

## Memory Element State Machines

State is derived from Memory file frontmatter at runtime — no separate state index (REQ-SYS-03).
`memory.deprecate` can be called from any state on any type.

### Release Line

```mermaid
stateDiagram-v2
    direction LR
    [*] --> draft
    draft --> planning : memory.submit
    planning --> active : memory.approve
    planning --> draft : memory.reject
    active --> done : trigger (all its releases are `released`)
    draft --> deprecated : memory.deprecate
    planning --> deprecated : memory.deprecate
    active --> deprecated : memory.deprecate
    done --> deprecated : memory.deprecate
```

### Release

```mermaid
stateDiagram-v2
    direction LR
    [*] --> draft
    draft --> planning : workflow.set_state
    planning --> in_development : workflow.set_state
    in_development --> releasing : workflow.set_state
    releasing --> released : workflow.set_state
    draft --> deprecated : memory.deprecate
    planning --> deprecated : memory.deprecate
    in_development --> deprecated : memory.deprecate
    releasing --> deprecated : memory.deprecate
    released --> deprecated : memory.deprecate

    in_development : in-development
```

### Task

```mermaid
stateDiagram-v2
    direction LR
    [*] --> draft
    draft --> pending : memory.submit
    pending --> backlog : task.set_state (approved)
    pending --> draft : memory.reject (reopen)
    backlog --> in_progress : workflow.set_state
    in_progress --> in_review : memory.submit
    in_review --> approved : memory.approve
    in_review --> in_progress : memory.reject (back to red)
    approved --> done : workflow.set_state

    in_progress : in-progress
    in_review : in-review
```

### ADR

```mermaid
stateDiagram-v2
    direction LR
    [*] --> draft
    draft --> pending : memory.submit
    pending --> accepted : memory.approve
    pending --> draft : memory.reject
    accepted --> superseded : waiting (a later ADR's supersedes:, no CLI verb)
    accepted --> deprecated : memory.deprecate
    superseded --> deprecated : memory.deprecate
```

### Tech Spec

```mermaid
stateDiagram-v2
    direction LR
    [*] --> draft
    draft --> pending : memory.submit
    pending --> approved : memory.approve
    pending --> draft : memory.reject
    approved --> superseded : waiting (a later spec's supersedes:, no CLI verb)
    approved --> deprecated : memory.deprecate
    superseded --> deprecated : memory.deprecate
```

### Decision Log  *(own machine — `dl-012` as reduced by `dl-017`)*

```mermaid
stateDiagram-v2
    direction LR
    [*] --> draft
    draft --> in_discussion : memory.submit
    in_discussion --> ready : memory.approve
    in_discussion --> draft : memory.reject
    ready --> deprecated : memory.deprecate

    in_discussion : in-discussion
```

### Bug

```mermaid
stateDiagram-v2
    direction LR
    [*] --> draft
    draft --> open : memory.submit
    open --> triaged : memory.approve
    open --> closed : memory.reject (wontfix / duplicate)
    triaged --> planned : bug.set_state (release-planning/build-backlog, fix task(s) created)
    triaged --> closed : memory.reject (wontfix after triage, dl-123)
    planned --> closed : memory.reject (wontfix before the fix starts, dl-123)
    planned --> in_progress : bug.sync_state (dev-loop, first fix task starts)
    in_progress --> in_review : bug.sync_state (dev-loop, ALL fix tasks in review)
    in_review --> resolved : bug.sync_state (dev-loop, ALL fix tasks done)
    in_review --> in_progress : memory.reject (reopen)
    resolved --> closed : bug.sync_state (dev-loop, ALL fix tasks done)
    resolved --> in_progress : memory.reject (reopen)
    closed --> deprecated : memory.deprecate

    in_progress : in-progress
    in_review : in-review
```

### Plan  *(`dl-019` — phase-plan execution scaffold)*

```mermaid
stateDiagram-v2
    direction LR
    [*] --> draft
    draft --> active : memory.submit (the phase starts)
    active --> done : workflow (the phase's produces:/checks hold)
    draft --> deprecated : memory.deprecate
    active --> deprecated : memory.deprecate
```

### Service  *(`dl-088` — external state, never a secret value)*

```mermaid
stateDiagram-v2
    direction LR
    [*] --> draft
    draft --> pending : memory.submit (set up and described)
    pending --> active : memory.approve (the approver ran verify)
    pending --> draft : memory.reject
    active --> deprecated : memory.deprecate (dropped or replaced)
```

---

## Roles Summary

| Role | Responsibilities in workflows |
|---|---|
| `product-owner` | Release-line seeding/closing (`seed-first-release-line`, `plan-next-release-line`), release-line roadmap (`seed-releases`), release planning, scope definition, governance reconcile, backlog creation |
| `tech-lead` | Config init, release-line approval, pinned-build advance, bug triage, backlog approval, implementation-complete check, release submission and publishing, deprecation |
| `architect` | Features session, Volere requirements, ADR authoring, tech-spec identification/authoring (`identify-specs`, `dev-loop/design`), agent-facing docs (`align-agent-docs`) |
| `developer` | TDD dev-loop (red/green/refactor), branch management, user-facing docs (`align-user-docs`), bug capture, service capture |
| `reviewer` | Code review in dev-loop |
| `qa` | BDD specification, end-to-end smoke (`e2e-smoke`), pre-release checks |
| `facilitator` | Lean inception sessions, retrospective exploration and capture |
| `approver` | All approval gates (bug triage, governance reconcile, backlog commit, task review, documentation, e2e smoke, release, retrospective, end-of-life, service verification) |
