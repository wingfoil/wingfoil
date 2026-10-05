# Product Backlog — Index

**Module:** 4 — Product Backlog Compilation
**Source:** `01_user_story_map/` + `02_bdd/` + `03_sard/`
**Generated:** 2026-06-26 · **Release reconciliation (sequencer source-of-truth):** 2026-06-29 — IDs kept stable, only `release`/partitions updated (see `../../02_requirements/X_vision-release-incoherence.md`)

> **Status: frozen archive — not maintained.** `backlog.json`, `schema.json` and
> `by-release/*.json` are the backlog as imported for v0.1 planning (one commit, `b9c4df0b`,
> 2026-06-29) and are not edited afterwards. Task management has since switched over to
> WingFoil Memory (`docs/design.md`, *Bootstrap phase → Switch-over*): the authoritative task
> store is `docs/04_memory/`, and each `by-release/*.json` survives only as the planning input a
> release's `requirements:` field cites — used when building that release's backlog as a starting
> suggestion (as in `release-planning-rel-v0.2-plan`), not a contract. Text quoted here (`acceptance_criteria`, DNA shapes, scenario steps) records what the
> sources said **at import** and may have moved since: e.g. `TASK-023` quotes `P2.1-dna-set`
> scenario 1 as it read before `task-100` rewrote it, and `TASK-025` names the `tech_stack` and
> `conventions` DNA sections that `spec-002-dna-yaml-schema` retired in dna v1.1. For the current
> contract, read the file `acceptance_criteria_full` points to.

---

## Purpose

Transforms the documentary chain into atomic, implementation-ready work items, ready for
import into Jira/GitHub via API automation.

- **63 User Story tasks** — one per `[MVP]` home story (one per feature) from Module 1.
  The Gherkin Happy Path from Module 2 is embedded in `acceptance_criteria`; the full
  `.feature` file is linked in `acceptance_criteria_full`.
- **43 Technical Tasks** — one per `REQ-*` from the SARD (Module 3), each linked via
  `related_stories` to the functional stories it affects.
- **106 tasks total.**

> **Granularity decision (1 task per feature, not 1 per US MVP).** The backlog mints
> **63 User Story tasks — one per MVP feature** (full feature coverage), rather than one
> task per individual `[MVP]` user story (94). This is a **deliberate granularity choice**,
> not an oversight relative to the plan (`X_specs-downcast-plan.md:231`): the home story of
> each feature carries the Gherkin Happy Path, and the 31 additional `[MVP]` stories without
> their own BDD anchor are ref-marked duplicates already covered by their feature's task. The
> ref → feature mapping is therefore 1:1 and complete (no feature invented or dropped).

## Files

| File                               | Content                                                |
|------------------------------------|--------------------------------------------------------|
| `backlog.json`                     | Full combined array of 106 tasks (import source)       |
| `schema.json`                      | JSON Schema (draft-07) used to validate `backlog.json` |
| `by-release/v0.1.json … v1.0.json` | The same tasks partitioned by release wave             |

## Task shape

```json
{
  "id": "TASK-016",
  "ref": "P1.1",
  "type": "User Story",
  "title": "Implement Git-Backed Storage",
  "description": "As Alex, deliver feature P1.1 (US-0A-01) …",
  "acceptance_criteria": "Scenario: …\nGiven …\nWhen …\nThen …",
  "acceptance_criteria_full": "docs/02_requirements/02_bdd/features/p1-memory/P1.1-git-backed-storage.feature",
  "priority": "Critical",
  "release": "v0.1",
  "pillar": "P1",
  "tags": [
    "MVP",
    "P1",
    "v0.1"
  ],
  "dependencies": [
    "TASK-001"
  ]
}
```

Technical Tasks replace `pillar`/`acceptance_criteria_full` with `area` + `related_stories`.

## ID scheme

IDs are **stable, opaque identifiers** drawn from the range `TASK-001 … TASK-106`. They
were originally minted in delivery-flow order (Technical Tasks first, then User Stories,
ascending by release wave), but after the release reconciliation
(see `docs/02_requirements/X_vision-release-incoherence.md`) the IDs are **deliberately
decoupled from the release wave**: a task's `release` can change while its ID stays fixed,
so the numbering **no longer follows the wave order** and is not contiguous within a wave.
The kind is carried by the `type` field and `tags`, not encoded in the ID, so User Story
and Technical Task numbers are interleaved.

The ID spans below are therefore **no longer contiguous per wave** (7 tasks moved between
waves while keeping their original IDs); only the per-wave counts are authoritative:

| Wave | ID range (non-contiguous after reconciliation) | Tasks (Technical + User Story) |
|------|-----------------------------------------------|--------------------------------|
| v0.1 | within `TASK-001` … `TASK-106` | 28 |
| v0.2 | within `TASK-001` … `TASK-106` | 25 |
| v0.3 | within `TASK-001` … `TASK-106` | 38 |
| v0.4 | within `TASK-001` … `TASK-106` | 10 |
| v1.0 | within `TASK-001` … `TASK-106` | 5 |

Example mappings: `REQ-SYS-01` → `TASK-001`, `P1.1` → `TASK-016`,
`REQ-PERF-03` → `TASK-058`, `P4.4` → `TASK-070`, `X1.2` → `TASK-096`.

## Dependency model

- **Direction:** a User Story task **depends on** the Technical Tasks (`REQ-*`) that
  enable its feature (infrastructure-first). This guarantees a **DAG** (stories → techs;
  techs have no outgoing dependencies), so there are no cycles.
- **Enabler coverage (not universal):** the infrastructure-first guarantee applies to the
  stories that *have* an infrastructural enabler. **16 User Story tasks carry no
  dependencies** (18 before the NOTIF-05 propagation linked X1.1/X1.2 to their new enablers
  TASK-105/106) because they are self-contained or themselves foundational (no separate
  `REQ-*` blocks them); for those stories there is nothing to sequence before them. So the
  guarantee holds **per story with an enabler**, not for 100% of the User Story tasks.
- **Numbering vs. dependencies:** a Technical Task is placed in the *earliest* release
  among its related stories, so every dependency points to a task in the **same or an
  earlier wave** and the graph remains a DAG with the build order intact (infra before
  feature). After the ID/wave decoupling
  (see `docs/02_requirements/X_vision-release-incoherence.md`) the **numeric ID order no
  longer necessarily reflects the build order** — a dependency may point to a
  higher-numbered task — so rely on `release` + the dependency edges, not on the ID
  sequence, to read the build order.
- **Traceability:** each Technical Task also lists `related_stories` (the affected
  functional stories), giving the reverse link without creating a cycle.

> Note: the direction US → Technical Task **coincides with the plan**
> (`X_specs-downcast-plan.md:234`: the tech-ids go into the `dependencies` of the User
> Stories). **No inversion has occurred** relative to the plan. The `related_stories` field
> supplies the reverse tech → story link without creating any cycle.

### Foundational / cross-cutting Technical Tasks

> `TASK-005` (REQ-SYS-09, npm distribution) and `TASK-010` (REQ-INT-04, CLI exit-code
> contract) have an **intentionally empty `related_stories`**: they are foundational,
> cross-cutting infrastructure that is not tied to any single story. Their empty
> `related_stories` is a deliberate annotation, not a missing link (each task also carries a
> `note` field stating this).

### Release split annotation (TASK-027)

> `TASK-027` (P5.1.1, `wingfoil init`) stays in **v0.1**, while the `init --template`
> portion of the feature is planned for **v0.4**. This split is recorded in the USM index;
> the task carries an explanatory `note` field documenting it so the single-release backlog
> entry is not read as losing the deferred portion.

## Distribution by release

| Release   | Tasks                                         |
|-----------|-----------------------------------------------|
| v0.1      | 28                                            |
| v0.2      | 25                                            |
| v0.3      | 38                                            |
| v0.4      | 10                                            |
| v1.0      | 5 (stabilization milestone + deferred high-risk workflow features: P4.10, P4.12, P4.17, REQ-STATE-04, REQ-INT-06) |
| **Total** | **106**                                       |

> Technical Tasks are placed in the earliest release among their related stories
> (foundational `REQ-*` with no concrete feature source default to v0.1).

---

## Stop-Check (Module 4 validation)

> **Rule:** the JSON array must pass syntactic validation, with no duplicate IDs and no
> circular dependencies.

### Verification results (2026-06-26)

| Check                                             | Result                                                |
|---------------------------------------------------|-------------------------------------------------------|
| `backlog.json` syntactically valid JSON           | **✅**                                                 |
| Conforms to `schema.json` (draft-07)              | **✅**                                                 |
| Total tasks                                       | **106** (63 User Story + 43 Technical)                |
| Duplicate IDs                                     | **0** (106/106 unique)                                |
| Dangling dependencies                             | **0**                                                 |
| Circular dependencies                             | **0** (topological sort completes over all 106 nodes) |
| Self-dependencies                                 | **0**                                                 |
| User Stories with non-empty `acceptance_criteria` | **63/63**                                             |
| Per-release files parse and sum to total          | 28+25+38+10+5 = **106 ✅**                             |

**Module 4 Stop-Check: PASSED.** The documentary chain (Modules 1→4) is complete.
