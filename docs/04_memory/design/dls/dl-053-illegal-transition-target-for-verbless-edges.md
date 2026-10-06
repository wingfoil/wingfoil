---
id: "dl-053-illegal-transition-target-for-verbless-edges"
type: decision-log
title: "Which `<to>` the illegal-transition message prints when the verb has no legal edge from the current state"
status: deprecated
context: "dev-loop-review"
release: "v0.2"
contributor: ""
credit: ""
tmpl_version: 260703
---

## Context

`dl-032` (`ready`) ratified the illegal-transition message as
`illegal transition <from> -> <to> for type '<type>'` (REQ-STATE-01 Fit Criterion). A transition verb
(`submit`, `approve`, `reject`) names no target of its own, and by definition an **illegal** call has no
legal edge from `<from>` — so `<to>` needs a rule, and neither `dl-032`, REQ-STATE-01 nor `spec-001`
gives one. The only fixed points are the two BDD scenarios that pin a concrete string:

- `P1.6-memory-submit.feature:21` and `P5.2.3-mcp-tools.feature:18`: `submit` on a `task` in `approved`
  → `illegal transition approved -> pending for type 'task'`.

On this repository's `task` machine (`.wingfoil/memory.yaml:113-117`:
`sequence: [draft, pending, backlog, in-progress, in-review, approved, done]`, gates `pending` and
`in-review`, waiting `[backlog, approved]`) the literal forward edge out of `approved` is `done`, not
`pending` — so the BDD's `pending` is not "the next state".

**What `task-045` implemented** (`task/task-045-memory-submit`, `7bfa835`,
`src/memory/state-machine.ts` `contractTarget`, lines 246-271): the **canonical edge** — `<to>` is the
target the verb reaches from the first state, in `sequence` order, from which it is legal (`submit` on
`task` → `pending`). It is the only mechanical rule found that reproduces the BDD string. Two
refinements: if that canonical target equals `<from>` (a self-loop), print the **next state in
`sequence`** instead; if the verb is legal nowhere, print `(none)`.

**What the review found.** Run against `7bfa835`'s `resolveTypeTransition` (branch source transpiled
with the repo's `typescript`, imports pointed at `main`'s `dist/`) and this repository's `memory.yaml`:

| type | from | verb | printed |
|---|---|---|---|
| `task` | `approved` | `submit` | `illegal transition approved -> pending for type 'task'` (BDD ✓) |
| `task` | `draft` | `reject` | `illegal transition draft -> pending for type 'task'` |
| `task` | `backlog` | `approve` | `illegal transition backlog -> in-progress for type 'task'` |
| `decision-log` | `ready` | `approve` | `illegal transition ready -> (none) for type 'decision-log'` |
| `decision-log` | `draft` | `approve` | `illegal transition draft -> ready for type 'decision-log'` |

The rows after the first show the self-loop fallback generalising badly:

- `reject` from `draft` prints `-> pending` — a state `reject` never reaches (its canonical edge is
  `pending -> draft`, whose target equals `<from>`, so the fallback substitutes `draft`'s successor).
- `approve` from `backlog` prints `-> in-progress` — an engine-only `waiting` edge no verb drives.
- `decision-log` `approve` prints `-> ready` from every state except `ready` itself, where it prints
  `(none)`, although `-> ready` is exactly the edge `approve` would take.

Every rule for `<to>` becomes the contract for `task-046` (`approve`) and `task-047` (`reject`); it has to
be settled before they implement.

## Decision

*Approver to choose.*

1. **Canonical edge, with a verb-shaped self-loop fallback** (recommended). `<to>` = the verb's
   canonical target (first legal edge in `sequence` order) when it differs from `<from>`; when it equals
   `<from>`, the **next canonical edge for that same verb** in `sequence` order (i.e. keep walking for a
   different target of the same verb); `(none)` only if the verb has no other target. Never the next
   `sequence` state. Reproduces both BDD strings; `reject` from `draft` on `task` prints the next distinct
   reject target (`in-progress`, from `in-review`); `decision-log` `approve` from `ready` prints
   `(none)` — acceptable, since `ready -> ready` is not a transition.
2. **Canonical edge, self-loop prints the canonical target anyway** (`ready -> ready`,
   `draft -> draft`). Simplest; honest about the verb's edge; reads oddly.
3. **Canonical edge only, `(none)` on self-loop.** Simple and never misleading, but gives the user no
   hint in the self-loop case.
4. **Drop `<to>` from the message** for verb-only calls and amend REQ-STATE-01 / both BDDs. Removes the
   ambiguity at the cost of re-opening `dl-032`.

## Rationale

- The canonical-edge core is justified by the BDD alone, and it is what `task-045` ships; only the
  fallback is in question.
- A message that names an edge the verb cannot take (`reject … -> pending`) or an engine-only edge
  (`approve … -> in-progress`) misinforms exactly the user who has just made an illegal call; option 1
  keeps every printed `<to>` a real target of the verb the user typed.
- The rule must be a pure function of `(machine, from, verb)` walked in `sequence` order (REQ-SYS-07);
  all four options are.

## Actions

- Owner **approver**: choose before `task-046` and `task-047` reach `design`.
- Hand the outcome to `task-045` (rework of `contractTarget` if 1, 3 or 4), `task-046`, `task-047`
  explicitly — `dl-015`'s `read_related` does not cover decision-logs.
- Record the chosen rule in `spec-001` or REQ-STATE-01 (dated Revision note per `dl-047`), and fix
  `spec-004` §4.3's example accordingly (`bug-032`).

Related: `dl-032`, `bug-032`, REQ-STATE-01, BDD `P1.6` / `P5.2.3`, `task-045-memory-submit`,
`task-046`, `task-047`, `spec-001`.

**Replaced on 2026-10-06 by `dl-154-an-illegal-transition-prints-none-as-its-target-replacing-dl-053-s-canonical-edge` (option A, `(none)`); this decision-log is deprecated.**
