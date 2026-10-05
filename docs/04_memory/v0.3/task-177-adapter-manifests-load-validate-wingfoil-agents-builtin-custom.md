---
id: "task-177-adapter-manifests-load-validate-wingfoil-agents-builtin-custom"
type: task
title: "Adapter manifests load and validate from `.wingfoil/agents/{built-in,custom}/`, and the `agent` module is registered"
status: in-progress
release: "v0.3"
kind: "feature"
priority: "high"
tags: ["v0.3", "agent", "schema", "validation"]
ref: "adr-012"
bug: []
depends_on: ["task-138-dna-yaml-declares-team-agents-adapter-runs-paths"]
tmpl_version: 260703
---

## Description

Creates `src/agent` (`spec-016` §1). It adds the module to `dna.yaml` `modules` beside the nine that exist, and registers `CoreModule` `agent` with no operations yet. The first code in it is the manifest: - a strict Zod schema for every §2.2 field, run through `spec-009`'s two-pass entry; - the closed placeholder set of §2.3, with whole-argv-element filling (`dl-090` Q3 (a)) and the per-field legality; - discovery of `built-in/` and `custom/` at `HEAD`, where a name present in both directories is an error. Nothing launches yet.

## Acceptance Criteria

- (red-first) A manifest with an unknown key, a missing required field, or `format` ≠ 1 is refused with `adapter '<name>': <zod issue>`. The detail lines follow `dl-055`.
- (red-first) `§2.3` rules are enforced: an unknown placeholder is a validation error; so is a placeholder concatenated inside an argv element (`--x={bootstrap}`); so is `{bootstrap}` used when `prompt.via` ≠ `arg`; so is `{session_id}` in `session.lookup_args` or `usage.lookup_args` under `session.id: output|lookup`; so is `prompt.via: stdin` combined with an interactive launch.
- (red-first) Required-with rules: `mcp.template` with `config-file`, `session.assign_args` with `assign`, the `*_args` + `field(s)` with `output`/`lookup`, `verified_with` on a built-in. `mcp.via` has no `none`.
- (red-first) The same basename under `built-in/` and `custom/` is refused at discovery. The file basename must equal `name`.
- (red-first) Manifests are read at `HEAD` (`dl-080` (B), `command-baseline`): an uncommitted manifest edit does not change the loaded adapter.
- (red-first) Only the adapter a caller selects is parsed and validated (`spec-016` §3.2 step 5); a broken unrelated manifest does not block it.
- (characterization) `.wingfoil/dna.yaml` `modules` gains `agent` (path `src/agent`), and the API-docs gate (`test/docs/`) covers the new module.

## Implementation Notes

- **Size:** M · **wave:** 2 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** adr-012 points 2, 6; spec-016 §1, §2.1–§2.3, §2.6 (declarations only).
- **Features:** P5.3.1.
- **Notes:** Proposal key: B05. fixture manifests live under `test/fixtures/agents/`. The fake **script** is task-200.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
