---
id: dl-144-importers-from-other-spec-driven-tools-come-first-for-openspec-then-for-spec-kit-kiro-is-out-of-scope
type: decision-log
title: "Importers from other spec-driven tools come first for OpenSpec, then for Spec Kit; Kiro is out of scope"
status: ready
context: "ad-hoc"            # optional — short label for the context, e.g. "retrospective", "planning", "ad-hoc"
release: ""            # optional — implementation release this DL is assigned to (stamped at release-planning/build-backlog, dl-016), e.g. "v0.1"
contributor: ""        # optional — who originated this contribution, if not the git author (dl-020); credited for AI-generated work derived from it
credit: ""             # optional — free-text credit note (dl-020)
tmpl_version: 260703   # Orignal template version
tags: ["import","adoption","interop"]
---

## Context

**v0.4 plans the adoption commands.** `wingfoil memory import` (P1.4, "Scan project for existing
docs and import into Memory") and `wingfoil init --mode infer` (P5.1.2) are in v0.4's scope
(`docs/01_vision/06_features.md`; `docs/04_memory/planning/rl-v1/minor-v0.4.md`). Neither names a
source format beyond "existing docs".

**The most common existing docs, in WingFoil's market, are another spec-driven tool's files.**
Read 2026-10-01/02:
- **OpenSpec** keeps `openspec/specs/`, `openspec/changes/<name>/` and
  `openspec/changes/archive/YYYY-MM-DD-<name>/` (README, <https://github.com/Fission-AI/OpenSpec>),
  and is the most installed of these tools (2,317,591 npm downloads of `@fission-ai/openspec` from
  2026-09-01 to 2026-09-30). Its change-based layout is meant for projects that already exist.
- **Spec Kit** keeps `specs/<feature>/spec.md`, `plan.md` and `tasks.md` (`docs/upgrade.md`,
  <https://github.com/github/spec-kit>) and a constitution at `.specify/memory/constitution.md`.
- **No official converter** exists between these tools or into WingFoil; neither repository's docs
  name one. Third-party migrators exist (for example `sdd-translate`, `karvey-import`), each into
  its own format.

Raised by the approver on 2026-10-02 as the outcome of a market analysis.

## Decision

**Importers from other spec-driven tools are a priority, in this order: OpenSpec, then Spec Kit.**
- Each importer reads the tool's documented Markdown layout and maps it to WingFoil Memory
  elements, as a source format of `memory import` and `init --mode infer`.
- **Kiro importers are out of scope.**

## Rationale

- **Adoption goes through the tool already in use.** `dl-140` (D2) makes integrations with
  spec-driven tools Alex's acquisition channel; an importer is the first step of coexistence.
- **OpenSpec first:** largest install base, and the layout aimed at existing projects. Spec Kit
  second: documented layout, large reach.
- **Documented Markdown layouts make a deterministic import possible**; no converter has to be
  inferred.

## Actions

1. **Ratify** at `in-discussion → ready`. Owner: approver.
2. **At release-planning v0.4**: a tech-spec for the import mapping (element types, states,
   provenance, determinism), then one task per importer. Order in the roadmap: fourth (`dl-140`,
   D3).

## Relations

- **Scopes:** P1.4 `memory import`, P5.1.2 `init --mode infer` (v0.4).
- **Related:** `dl-140` (positioning, roadmap order), `dl-145` (the coexistence guides).
