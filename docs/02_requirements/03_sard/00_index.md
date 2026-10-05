# System & Architecture Requirements Document (SARD) — Index

**Module:** 3 — SARD
**Source:** `docs/02_requirements/01_user_story_map/` + `docs/02_requirements/02_bdd/` + `docs/01_vision/`
**Generated:** 2026-06-26

---

## Purpose

Extracts the technical, infrastructural, and non-functional requirements (NFRs) latent in
the behavioral specifications (Module 2). Each requirement carries a **Traceability** chain
back to its origin — `Feature Px.y → US-<id> → BDD <.feature>` — and a **measurable Fit
Criterion**. The registry below shows the compact feature-id view; the full Feature→US→BDD
chain is recorded in each requirement's `Traceability` field in the part files 01–05.

## Structure (5 macro-areas mapped 1:1 to files 01–05)

| File                                                   | Area                                 | ID prefix     | Count  |
|--------------------------------------------------------|--------------------------------------|---------------|--------|
| [01_architecture.md](01_architecture.md)               | Architectural Constraints & Patterns | `REQ-SYS-*`   | 9      |
| [02_performance-nfr.md](02_performance-nfr.md)         | Performance & Latency                | `REQ-PERF-*`  | 5      |
| [03_state-context.md](03_state-context.md)             | State & Context Management           | `REQ-STATE-*` | 10     |
| [04_integrations.md](04_integrations.md)               | Integrations & Interfaces            | `REQ-INT-*`   | 9      |
| [05_security-compliance.md](05_security-compliance.md) | Security & Compliance                | `REQ-SEC-*`   | 11     |
| **Total**                                              |                                      |               | **44** |

> The 5 macro-areas map 1:1 to files 01–05: file 01 captures the cross-cutting architectural
> constraints (REQ-SYS), and files 02–05 the four NFR macro-areas that depend on them.

---

## Requirement Registry

### Architecture (`REQ-SYS-*`)

| ID         | Title                                | Fit Criterion (summary)                                | Traceability (feature-ids)    |
|------------|--------------------------------------|--------------------------------------------------------|-------------------------------|
| REQ-SYS-01 | Git-backed single source of truth    | Fresh clone reconstructs 100% state, no external store | P1.1, P1.11               |
| REQ-SYS-02 | Decoupled pillars                    | Each artifact validates in isolation                   | P2.4, P3.5, P4.1, P1.13   |
| REQ-SYS-03 | Stateless state derivation           | No state index; recompute == stored                    | P4.13                     |
| REQ-SYS-04 | Configurable per-type state machines | New type honored with no code change                   | P1.13, P4.11              |
| REQ-SYS-05 | Dual interface over shared core      | CLI↔MCP operation parity == 100% (bootstrap exempt)   | P5.1.1-P5.1.4, P5.2.1-P5.2.3  |
| REQ-SYS-06 | include() composition, main/sub      | Sub runs once-per-element; sub not startable           | P4.1, P4.2, P4.16         |
| REQ-SYS-07 | Deterministic context assembly       | Two assemblies byte-identical                          | P5.4.4                    |
| REQ-SYS-08 | Role-based binding                   | Role reassignment needs 0 directive edits              | P3.2, P3.7, P4.14, P5.4.2 |
| REQ-SYS-09 | npm distribution                     | `npm i -g wingfoil` exposes CLI, exits 0               | MVP canvas                |

### Performance (`REQ-PERF-*`)

| ID          | Title                         | Fit Criterion (summary)        | Traceability (feature-ids) |
|-------------|-------------------------------|--------------------------------|----------------------------|
| REQ-PERF-01 | Agent context load time       | < 30,000 ms p95                | P5.3.1, P5.4.3    |
| REQ-PERF-02 | DNA/Memory query latency      | < 1,000 ms p95                 | P1.5, P1.10, P2.2 |
| REQ-PERF-03 | workflow next latency         | < 1,000 ms p95                 | P4.4              |
| REQ-PERF-04 | MCP resource fetch latency    | < 1,000 ms p95                 | P5.2.1            |
| REQ-PERF-05 | Bounded context via relevance | Exactly K relevant docs loaded | P5.3.3, P1.9      |

### State & Context (`REQ-STATE-*`)

| ID           | Title                                     | Fit Criterion (summary)                      | Traceability (feature-ids) |
|--------------|-------------------------------------------|----------------------------------------------|----------------------------|
| REQ-STATE-01 | Frontmatter lifecycle, per-type validated | Illegal transition rejected, state unchanged | P1.6, P4.11, P4.13   |
| REQ-STATE-02 | State recomputability                     | Recompute == cached for a commit             | P4.13                |
| REQ-STATE-03 | Active context, multiple mains            | Last-started targeting; end restores         | P4.2, P4.3           |
| REQ-STATE-04 | Atomic step execution                     | Failure leaves working tree clean            | P4.10                |
| REQ-STATE-05 | Role/task-scoped context                  | 100% role directives, 0 foreign              | P5.4.3, P5.4.4, P3.6 |
| REQ-STATE-06 | Deprecated excluded from context          | Never in context/default search              | P1.9, P5.3.3         |
| REQ-STATE-07 | include() iteration state                 | N matches → N sub runs                       | P4.16                |
| REQ-STATE-08 | Default state-machine fallback            | Type w/o states uses default graph           | P1.13                |
| REQ-STATE-09 | Context determinism                       | Cross-ref REQ-SYS-07                         | P5.4.4               |
| REQ-STATE-10 | Process conformance                       | P computed from git + config; byte-identical reruns | P1.2, P1.7, P1.10, P1.13, P4.1, P4.13 |

### Integrations (`REQ-INT-*`)

| ID         | Title                       | Fit Criterion (summary)                       | Traceability (feature-ids)         |
|------------|-----------------------------|-----------------------------------------------|------------------------------------|
| REQ-INT-01 | MCP Resources read-only     | Write via Resources refused                   | P5.2.1               |
| REQ-INT-02 | MCP Prompts role-based      | Prompt embeds 100% role directives            | P5.2.2, P3.6         |
| REQ-INT-03 | MCP Tools state mutation    | Same validation as CLI; agent-authored commit | P5.2.3               |
| REQ-INT-04 | CLI exit-code contract      | 0/1/2 matrix asserted                         | P1.3, P1.6, P1.7, P5.1.4 (+ all command features) |
| REQ-INT-05 | Machine-readable formats    | json/yaml parse valid                         | P2.5, P4.5                         |
| REQ-INT-06 | Git operations as actions   | Effect produced; conflict aborts clean        | P4.10                              |
| REQ-INT-07 | Agent execution wrapper     | role/element resolved, context pre-loaded     | P5.3.1, P5.3.2                     |
| REQ-INT-08 | Consistent CLI error format | `error: <reason>`, non-zero, suggestion       | P5.1.4                             |
| REQ-INT-09 | Notification delivery & failure contract | 100% human-needed events notified; delivery failure logs + non-zero exit | X1.1 |

### Security & Compliance (`REQ-SEC-*`)

| ID         | Title                                 | Fit Criterion (summary)          | Traceability (feature-ids) |
|------------|---------------------------------------|----------------------------------|----------------------------|
| REQ-SEC-01 | Git identity required                 | No identity → mutation refused   | P1.2                    |
| REQ-SEC-02 | Complete audit trail                  | author+timestamp on 100% changes | P1.2, P1.7, P1.8, P1.10 |
| REQ-SEC-03 | Role-based approval authority         | Unauthorized approve rejected    | P1.7, P4.14             |
| REQ-SEC-04 | Mandatory reason on verbs             | Missing --reason → exit 2        | P1.7, P1.8, P1.9        |
| REQ-SEC-05 | Read-only agent read channel          | Cross-ref REQ-INT-01/03          | P5.2.1, P5.2.3          |
| REQ-SEC-06 | Storage confinement                   | Write outside memory/ refused    | P1.11                   |
| REQ-SEC-07 | Immutable built-in assets             | Built-in remove rejected         | P3.3, P4.9              |
| REQ-SEC-08 | Secret/credential hygiene             | 0 secret patterns committed      | P3.8                    |
| REQ-SEC-09 | Human approval before inferred writes | Nothing persisted until approved | P2.3, P5.1.2            |
| REQ-SEC-10 | Built-in template integrity           | Corrupt template aborts init     | P3.8, P4.17             |
| REQ-SEC-11 | Notification routing authority        | Routed only to dna.yaml-configured roles; 0 to unconfigured | X1.2, X1.1 |

---

## Module 3 validation

> **Rule:** every requirement (REQ) must include a quantifiable, measurable Fit Criterion.

- **Total requirements:** 44 (SYS 9, PERF 5, STATE 10, INT 9, SEC 11)
- **Requirements with a Fit Criterion:** 44 / 44
- **Requirements without a Fit Criterion:** 0
- **Coverage:** **100% ✅**

### Verification results (2026-06-26)

> Recorded when the registry held 43 requirements. `REQ-STATE-10` (added 2026-10-01, `task-141`) carries a
> `Fit Criterion:` line, so the 100% coverage above still holds.

| Check                                    | Result                                                                       |
|------------------------------------------|------------------------------------------------------------------------------|
| REQ per file                             | SYS=9, PERF=5, STATE=9, INT=9, SEC=11 → **43**                               |
| REQ with a `Fit Criterion:` line         | **43/43**                                                                    |
| REQ missing a Fit Criterion              | **0**                                                                        |
| All Fit Criteria quantifiable/measurable | **✅** (latency in ms p95, counts, exit codes, byte-equality, log assertions) |
