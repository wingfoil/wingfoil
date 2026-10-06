---
id: adr-008-per-type-state-machines
type: adr
title: "Configurable per-type state machines"
status: accepted
sard_ref: REQ-SYS-04
supersedes: ""
tmpl_version: 260703   # Orignal template version
---

## Context

Memory holds several element types — `release-line`, `release`, `task`, `adr`, `decision-log`,
`tech-spec`, `bug` — and each one has a genuinely different lifecycle. A `release` moves through
`draft → planning → in-development → releasing → released`; a `task` through `draft → pending →
backlog → in-progress → in-review → approved → done`; a `bug` through `draft → open → triaged →
planned → in-progress → in-review → resolved → closed`. These are not cosmetic relabelings of one
underlying flow: a `release` has no `in-review` state and a `task` has no `releasing` state, and the
branching points differ too (e.g. a `bug` can be closed directly from `open` on reject, something no
other type does). Hardcoding a single global lifecycle in source code would force every type into the
same shape, or require a code change each time a new type or a new lifecycle nuance is needed — directly
at odds with REQ-SYS-07's "explicit declared config over inferred/hardcoded behaviour." Some types,
however (`decision-log` in the current config), have a genuinely simple lifecycle and don't need a
bespoke machine at all — forcing every type to declare one in full would be unnecessary config
friction (REQ-STATE-08's stated rationale). Without this decision, either all types would be squeezed
into one rigid machine, or every type — however simple — would have to hand-write states and
transitions.

## Decision

Each Memory element type declares its **own** state machine — a `values` list, an `initial` state,
and a `transitions` map — inline in that type's entry under `types:` in `.wingfoil/memory.yaml`.
There is no single global lifecycle. A type that does **not** declare a `states` block falls back to
the shared `defaults.states` machine (REQ-STATE-08): `draft → pending → approved/rejected →
deprecated`, with `rejected → draft` (re-open) and a wildcard `"*" → deprecated` available from any
state. In the current config, `release-line`, `release`, `task`, `adr`, `tech-spec`, and `bug` each
declare their own `states` block; `decision-log` declares none and therefore runs on the default
machine.

> **Correction (2026-10-05) — the encoding, the default machine and `decision-log`'s machine are
> `spec-001`'s, not the ones named above.** A machine is encoded as `sequence` (the forward chain),
> `gates` (`{state: {reject: target}}`, a state whose forward edge needs `approve`) and `waiting`
> (states advanced by no CLI verb), per `spec-001-memory-yaml-schema`; the `values` / `initial` /
> `transitions` keys this ADR names are used by no machine in `.wingfoil/memory.yaml`
> (`grep -n "transitions:\|initial:" .wingfoil/memory.yaml` → no output). The default machine is
> `draft → pending → approved` with `pending` rejecting to `draft`: there is no `rejected` state, and
> `deprecated` is the reserved implicit target every state reaches, declared in no machine.
> `decision-log` has its own machine, `draft → in-discussion → ready` (`dl-012`, `dl-017`), so no type
> in this repository runs on the default. Wherever this document says `values`, `initial`,
> `transitions` or `rejected`, read the encoding and states above. The decision of this ADR is
> unchanged: each type declares its own machine, with a shared default for a type that declares none.
> The text above is left as written (`bug-213`, `task-188`).

The CLI verbs (`memory submit` / `approve` / `reject` / `deprecate`) and the workflow
`element.set_state` action are both validated against the type's declared graph before the
transition is applied: a target state must appear in that type's `values`, and the move from the
current state to the target must be a legal edge in its `transitions` map (or match a `"*"` wildcard
edge). This validation is uniform across types — the engine walks whichever graph the type declares,
default or custom — so adding a new type, or giving an existing type a new state or transition, is a
config-only change to `memory.yaml`; no source-code change is required (per REQ-SYS-04's fit
criterion), and an illegal transition is rejected at the same validation point regardless of which
type it belongs to.

## Consequences

- **Positive:**
  - New element types, or new states/transitions on an existing type, are added by editing
    `memory.yaml` — no source-code change, satisfying REQ-SYS-04's fit criterion directly.
  - Simple types (currently `decision-log`) get a sane lifecycle for free via REQ-STATE-08's default,
    without needing to author a bespoke `states` block.
  - A single validation code path (walk the type's declared or default graph) serves both the CLI and
    the workflow engine's `element.set_state`, so the two surfaces cannot silently diverge on what
    transitions are legal (consistent with the dual-interface principle in REQ-SYS-05).
  - Illegal transitions — an undeclared target state, or a source→target pair with no edge — are
    rejected with a clear error instead of silently corrupting frontmatter state.

- **Negative:**
  - Each type's `states` block must be authored carefully: an unreachable state, a transition
    pointing at a target absent from `values`, or a missing wildcard-deprecate edge is a
    configuration bug that only surfaces when someone hits that transition.
  - Because there is no single canonical lifecycle, understanding "what state can this element be in
    next" always requires looking up that specific type's block in `memory.yaml` (or its fallback to
    `defaults`) rather than reasoning from one shared mental model.
  - Cross-type workflow logic that wants to react uniformly to "approved" or "done" states (e.g. a
    release-line closing only once every release under it is `released`) has to know each type's own
    vocabulary for the equivalent milestone, since state *names* are not standardized across types.

- **Neutral:**
  - The state-machine *structure* (a `values`/`initial`/`transitions` shape, validated the same way
    for every type) is spec-defined (REQ-SYS-04, REQ-STATE-08); the specific state *vocabulary* each
    type uses (e.g. `releasing` for `release` vs. `in-review` for `task`) is an authoring choice, free
    to evolve per type without touching the mechanism.
  - There is no `.wingfoil/state/` index: state is read from each document's own frontmatter, so this
    decision only fixes what transitions are *legal*, not where state is *stored* (that is a separate
    concern, REQ-SYS-03).

## Process Notes

Grounded directly in `docs/02_requirements/03_sard/01_architecture.md` (REQ-SYS-04) and
`docs/02_requirements/03_sard/03_state-context.md` (REQ-STATE-08), cross-checked against the live
`types:` and `defaults:` blocks in `.wingfoil/memory.yaml` on `design/initial-design` for the
actual per-type state vocabularies (e.g. `release` has no `pending`/`in-review` state, `bug` can close
directly from `open`, `decision-log` has no `states` block and runs on the default). This document is
expanded with the concrete per-type machine details and the default-fallback case.
