---
id: bug-205-spec-001-and-spec-009-declare-e-invalid-schema-error-codes-that-src-never-emits
type: bug
title: "spec-001 and spec-009 declare E_INVALID_* schema error codes that src never emits"
status: open
severity: "medium"           # REQUIRED — critical | high | medium | low
release-origin: "v0.3"     # optional — release where the bug was FOUND (dl-016), e.g. "v0.1"
release: ""            # optional — fix/implementation release, stamped by release-planning/build-backlog (dl-016)
feature: "P1.13"            # optional — related feature ID, e.g. "P1.6"
contributor: ""        # optional — who originated this contribution, if not the git author (dl-020); credited for AI-generated work derived from it
credit: ""             # optional — free-text credit note (dl-020)
tmpl_version: 260703   # Orignal template version
tags: ["v0.3"]
---

## Summary

`spec-001` (sub-schema `StateMachine`, `:107-108`) names `E_INVALID_MEMORY_SCHEMA` and `E_INVALID_STATE_GRAPH` as the errors of an invalid `memory.yaml`, and `spec-009` §3 declares the `E_INVALID_<SCHEMA>_SCHEMA` / `E_INVALID_<X>` family (`E_INVALID_MEMORY_YAML_SCHEMA`, `E_INVALID_DNA_YAML_SCHEMA`, `E_INVALID_WORKFLOWS_YAML_SCHEMA`, `E_INVALID_GATES_REF`). None of the six is defined or emitted in `src/`: a schema failure surfaces as the generic `E_VALIDATION`. The two specs also disagree with each other (`E_INVALID_MEMORY_SCHEMA` vs `E_INVALID_MEMORY_YAML_SCHEMA`). Which side is wrong — the specs or the code — is undecided.

## Steps to Reproduce

1. `for c in E_INVALID_MEMORY_SCHEMA E_INVALID_STATE_GRAPH E_INVALID_DNA_YAML_SCHEMA E_INVALID_GATES_REF E_INVALID_MEMORY_YAML_SCHEMA E_INVALID_WORKFLOWS_YAML_SCHEMA; do printf "%s: " $c; grep -rn "$c" src | wc -l; done` → `0` for each. (`E_INVALID_ID`, `E_INVALID_ID_PATTERN_CHARS`, `E_INVALID_TRANSITION` and `E_INVALID_REVISION` do exist.)
2. `grep -n E_INVALID docs/04_memory/design/specs/spec-001*.md` → `:107-108`, `E_INVALID_MEMORY_SCHEMA` (Zod shape), `E_INVALID_STATE_GRAPH` (gate/waiting not in sequence, or `"deprecated"` declared). `spec-009:199-200` declares the family with the other four names.
3. In a scratch repository (`wingfoil init --template Kanban --no-interactive`), change `defaults.states.gates` key `pending` to `nosuch`, commit, then `node dist/cli.js --format json memory search` →
   ```
   {"error":"E_VALIDATION defaults.states.gates.nosuch (<scratch>/.wingfoil/memory.yaml): `gates` key \"nosuch\" must be a member of `sequence`"}
   ```
   exit `1`.

## Expected Behavior

One error-code contract: either `src/validation` emits the codes `spec-001`/`spec-009` declare (`E_INVALID_STATE_GRAPH` / `E_INVALID_GATES_REF` here), or the specs are amended to the codes the code emits, and `spec-001` and `spec-009` agree with each other.

## Actual Behavior

The specs declare six codes no code path produces; the invalid-gate case above reports `E_VALIDATION`. All six are allowlisted as `UNTRIAGED` in `test/docs/name-resolvability.allowlist.ts`.

## Notes

- Found by `task-151`'s independent reviewer (name check, `symbol` class).
- A ruling is needed before a task can fix it: spec-side (rename to what ships) or code-side (map Zod issues to declared codes, a visible change in `--format json` error output).

## Triage & Execution Notes

Captured on 2026-10-02 by `bug-ingest-rel-v0.3-w1b4-review-findings-plan`, from the independent reviews of wave 1
batch B4 (`dev-loop-rel-v0.3-plan`), against `main` at `243f8f05` (B4 merges up to `ea637c43`).
