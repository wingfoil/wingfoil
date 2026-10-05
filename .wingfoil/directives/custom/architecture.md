---
id: architecture
name: "Architecture"
type: directive
kind: custom
title: "Architecture"
tags: [custom, architecture, decision]
ref: [P3.8]
---

# Directive — Architecture

Custom stand-in directive. Applies to architects and the tech lead.

> **Stand-in custom directive.** WingFoil ships its official built-in P3.8 templates, and
> `wingfoil init` installs them under `.wingfoil/directives/built-in/` (task-057). This repository's
> hand-authored configuration predates them, so this generic rule (adapted to the project
> methodology/tech-stack in `dna.yaml`) is kept here as `custom`; `ref: [P3.8]` names the built-in
> template it stands in for. Reconciling the stand-ins with the shipped templates is out of scope of
> bug-040, which corrected this note, and is not scheduled.

- Record significant architectural decisions as an `adr` in `docs/04_memory/design/adrs/`
  (context, decision, consequences).
- Respect the standing architecture decisions (REQ-SYS-01..08): git-backed single source of
  truth, no state index, per-type state machines, dual CLI+MCP interface, include()-based
  composition, role-based binding.
- Keep pillars decoupled — a change in one pillar artifact must not force edits in another (REQ-SYS-02).
- New architecture decisions reference the SARD requirement(s) they implement.
- Author a `tech-spec` for every shared file format, schema, constant set, or module API before
  tasks that implement it enter the backlog — release-line-wide ones in `initial-design/seed-specs`
  (once per release-line, before its delivery starts), release-scoped ones in
  `release-planning/identify-specs`; `dev-loop/design` is only the reactive fallback for artefacts
  discovered mid-task.
- **Spec-review gate before approval (`dl-022`):** before a `tech-spec` moves `pending → approved` or
  an `adr` moves `pending → accepted`, confirm it passes four checks — (1) **internal** consistency
  (prose agrees with its own code listings/examples), (2) **cross-spec** consistency (no naming,
  URI/field-scheme, or terminology conflict with sibling already-approved specs), (3) **spec ↔
  BDD/vision** alignment (command grammar and field names match the acceptance contracts), (4)
  **traceability** (cites the REQ(s)/feature it serves, accurately). Enforced at
  `initial-design/seed-specs`+`seed-adrs`, `release-planning/identify-specs`, and
  `release-planning/record-adrs`; also checked by reviewers under the `code-review` directive.

> Source: Features §P3.8 (Architecture); SARD `docs/02_requirements/03_sard/01_architecture.md`.
