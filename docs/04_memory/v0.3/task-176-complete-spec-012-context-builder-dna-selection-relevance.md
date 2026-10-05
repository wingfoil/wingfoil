---
id: "task-176-complete-spec-012-context-builder-dna-selection-relevance"
type: task
title: "Complete the `spec-012` context builder: DNA selection, relevance-filtered Memory, the canonical §7 payload and its validation, all pinned to `stateRef`"
status: in-progress
release: "v0.3"
kind: "feature"
priority: "high"
tags: ["v0.3", "agent", "context", "determinism"]
ref: "spec-012"
bug: []
depends_on: ["task-137-read-pillar-configuration-memory-documents-any-commit-not"]
tmpl_version: 260703
---

## Description

P5.4.4 ("structured context passed to agents at task start") and P5.3.3 (relevance filtering) are only half built. `assembleExecutionContext` returns the element alone as `memory` and serializes nothing. This task makes `context-builder` the single public entry of `spec-012` §1: - input: `ContextRequest {role, element, stateRef, limits}`; - every read goes through task-137's rev readers; - DNA selection follows §4, Memory follows §6 through `filterRelevantMemoryDocuments`, now fed at `stateRef`; - output: the §7 canonical Markdown payload, with `ExecutionContext.warnings` kept outside it (§5.1); - the context is validated before use (P5.4.4 sc. 3). `agent execute` (task-218) and the `{role}-session` Prompt (task-195) are its two consumers.

## Acceptance Criteria

- (red-first) P5.4.4 sc. 1: the assembled context exposes distinct, individually addressable `dna`, `memory` and `directives` sections, and the serialized payload carries the §7 section headings as fixed literals, including `## 4. Relevant Memory (0 documents)` when empty.
- (red-first) P5.4.4 sc. 2 / `spec-012` §8: two independent builds of the same `(role, element, stateRef, limits)` are byte-identical. A build at a different `stateRef` whose Memory differs is not. The payload holds no timestamp, host or absolute path, uses LF only, has exactly one trailing `\n`, and re-emits YAML with sorted keys.
- (red-first) P5.4.4 sc. 3: a context missing a section is refused with `invalid execution context: missing '<section>' section` (verbatim, e.g. `'directives'`) before any consumer uses it.
- (red-first) P5.3.3 sc. 1–3 on a 100-document fixture: exactly the relevant documents appear in `## 4`, a `deprecated` one is excluded, and none relevant → zero documents plus the recorded note `no relevant Memory found for task`. The note travels in the result's diagnostics, not inside the §7 payload.
- (characterization) P5.4.2 sc. 1–2: a directive bound to `developer` (and one added later) appears under `## 3. Directives` of a `developer` context. The globals are present, and the ids are sorted ascending (`spec-012` §5).
- (characterization) `ExecutionContext.warnings` keeps `spec-012` §5.1's three kinds in their fixed order and never enters the payload bytes (dl-050, dl-051).
- (red-first) `spec-012` §4 DNA selection: modules are filtered by the element's `modules:`/`scope:`, or all modules when it has none; every `paths` category is included, `runs` among them once task-138 lands; sections come in `dna.yaml` declared order.
- (characterization) REQ-PERF-05: a 1,000-document fixture stays within `DEFAULT_CONTEXT_LIMITS`.

## Implementation Notes

- **Size:** L · **wave:** 2 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** spec-012 §3–§8; dl-050 (warnings stay out of the payload, spec-012 §5.1).
- **Features:** P5.3.3, P5.4.2, P5.4.4.
- **Notes:** Proposal key: B02. amend `spec-012` §4 with a `doc-versioning` bump. It still says "Always include … `conventions`" (removed by `spec-002` v1.1) and lists five `paths` categories. Verify both with `grep -n conventions docs/04_memory/design/specs/spec-012*.md` before editing. `src/core/context.ts`, `src/core/relevance.ts` (its "not pinned to a revision" doc sentence changes). Keep `resolveRoleDirectives` as the one resolver (dl-033 (b): binding lives in `src/dna/roles.ts` and `resolveRoleDirectives`, authority stays out).
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
