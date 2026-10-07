---
id: "bug-150-workflow-list-accepts-unknown-types-and-roles"
type: bug
title: "`workflow list` accepts a phase action naming a Memory type `memory.yaml` never defines, and a `role` no role list names, with no warning and exit 0"
status: closed
severity: "low"
release-origin: "v0.2"
release: "v0.3"
feature: "P4.6"
contributor: ""
credit: ""
tmpl_version: 260703
---

## Summary

`Phase.role` and `Phase.actions` (`src/workflow/schema.ts`) are a bare optional string and a bare
optional string array, with no cross-check against `dna.yaml`'s role catalogue or `memory.yaml`'s
registered types. A phase declaring `role: nobody` and `actions: ['memory.add(type: nonsense)']` —
neither of which exists anywhere in the project's configuration — passes `workflow list` unchanged
and unflagged.

## Steps to Reproduce

Reproduced against `wingfoil@0.2.1`, fresh project (`init --template Kanban`):

1. `grep -n "role: z.string()" src/workflow/schema.ts` → `role: z.string().optional()`;
   `grep -n "actions: z.array" src/workflow/schema.ts` → `actions: z.array(z.string()).optional()` —
   both free strings, no enum or reference constraint.
2. Edit `.wingfoil/workflows/custom/bug-ingest.yaml`'s `capture` phase to add
   `role: nobody` and `actions: ['memory.add(type: nonsense)']` (`nobody` is not among
   `.wingfoil/dna.yaml`'s `team.roles`; `nonsense` is not a key under `.wingfoil/memory.yaml`'s
   registered types).
3. `wingfoil workflow list --format json` → exit `0`; the `bug-ingest` workflow's `capture` phase is
   echoed back verbatim: `{"name":"capture","role":"nobody","optional":false,"actions":["memory.add(type:
   nonsense)"]}`. No warning, no non-zero exit, no indication either value is invalid.
4. `grep -n "role\b" src/workflow/schema.ts src/core/loaders.ts` confirms no cross-validation exists
   anywhere in the loader pipeline between a phase's `role`/`actions` and the roles/types actually
   declared elsewhere in the project's configuration.

## Expected Behavior

`workflow list` reports a warning (in its own `warnings` field, per the contract the command already
exposes) when a phase names a role absent from `dna.yaml`'s role catalogue, or an action referencing
a Memory type absent from `memory.yaml`.

## Actual Behavior

Both are accepted silently; a typo in either place is indistinguishable, from the command's output,
from a correct configuration.

## Notes

- Root cause: `Phase`'s schema validates shape (a string is a string) but not project-relative
  meaning; no `SemanticCheck` cross-references `role`/`actions` tokens against `dna.yaml`/
  `memory.yaml`, unlike the manifest-level `include`-path-resolves and "at least one `kind: main`"
  checks spec-003 already requires the loader to run.
- Gate: `e2e-smoke`/`dev-loop` run `workflow list` only against this repository's own hand-written,
  already-correct workflows, so there is no adversarial fixture with a deliberately wrong `role`/
  `type`, and this validation gap was never exercised.
- Fix: add `SemanticCheck`s that every phase `role` (when present) names a role in `dna.yaml`'s
  `team.roles`, and every `memory.*(type: X)` token in `actions` names a type registered in
  `memory.yaml`, surfaced through `workflow list`'s existing `warnings` array.

## Triage & Execution Notes

- capture: filed by the v0.2 retrospective (retro-v0.2); reproduced independently against the stock
  Kanban scaffold with a deliberately-invalid role/type pair.
