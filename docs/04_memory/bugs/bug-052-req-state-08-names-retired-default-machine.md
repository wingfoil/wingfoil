---
id: "bug-052-req-state-08-names-retired-default-machine"
type: bug
title: "REQ-STATE-08 still specifies the pre-spec-001 default machine with a `rejected` state, and its P1.13 BDD scenario asserts it — the reconciliation spec-001 called for never happened"
status: closed
severity: "medium"
release-origin: "v0.2"
release: "v0.3"
feature: "P1.13"
contributor: ""
credit: ""
tmpl_version: 260703
---

## Summary

`spec-001-memory-yaml-schema` (`approved`) retired the default state machine's `rejected` state as a
deliberate behaviour change, stated in terms that no document ever records `status: rejected` again,
and said explicitly that "REQ-STATE-08's wording … must be reconciled". Nothing reconciled it.
REQ-STATE-08's Description still reads `draft → pending → approved/rejected → deprecated`, its P1.13
BDD scenario still asserts that machine in those words, and the live `memory.yaml` repeats it in a
`[SPEC: REQ-STATE-08]` annotation — while the shipped code implements spec-001's machine and no
document on `main` carries a `rejected` status.

## Steps to Reproduce

Measured 2026-09-21 on `main` at `ba2cad0`.

1. **The requirement.** `docs/02_requirements/03_sard/03_state-context.md:93-100`:

```
### REQ-STATE-08 — Default state-machine fallback

* **Description:** A Memory type that does not declare its own `states` uses the default machine
  `draft → pending → approved/rejected → deprecated`.
* **Rationale:** Reduce config friction for simple types.
* **Fit Criterion:** A type defined without a `states` block accepts exactly the default transitions and rejects any
  transition outside them.
* **Traceability:** Feature P1.13 (US-0A-04, BDD `p1-memory/P1.13-memory-element-schema.feature`).
```

2. **The spec that retired it**, `spec-001-memory-yaml-schema` (`status: approved`), `:250-257`:

```
- **DELIBERATE BEHAVIOR CHANGE — the default machine loses its `rejected` state.** The current default
  is a five-value machine `draft → pending → approved/rejected → deprecated` in which `rejected` is a
  **real, frontmatter-visible status** with its own re-open edge (`rejected → draft`). Migrating it to
  … records `status: rejected` again.** This is a genuine change to what appears on disk, not a cosmetic
  rename — REQ-STATE-08's wording (`draft → pending → approved/rejected → deprecated`) describes the
  *old* behavior and must be reconciled.
```

and `:272`: "the old `transitions` shape (REQ-STATE-08, the P1.8 BDD) is downstream of this spec."

3. **The code implements spec-001, not REQ-STATE-08.** `src/memory/state-machine.ts:89` says so in as
   many words, and no `rejected` state exists anywhere:

```
$ sed -n '89p' src/memory/state-machine.ts
 * SARD entry now names both. The previously-specified `rejected` is **not** here: `spec-001-memory-yaml-schema`
$ grep -rn "'rejected'\|\"rejected\"" src/
(no output)
```

4. **No document records it either.**

```
$ grep -rn "^status: rejected" docs/
(no output)
```

5. **Three live artefacts still assert the retired machine.** This is the part the received framing did
   not name, and it is why the fix is not a one-line edit:

   - the requirement itself (step 1);
   - **the acceptance contract** — `docs/02_requirements/02_bdd/features/p1-memory/P1.13-memory-element-schema.feature:17`:

     ```
     Then type "note" uses the default machine draft -> pending -> approved/rejected -> deprecated
     ```

   - **the live self-config** — `.wingfoil/memory.yaml:51`:

     ```
     # [SPEC: REQ-STATE-08] default machine: draft -> pending -> approved/rejected -> deprecated.
     ```

     sitting four lines above a `defaults.states` block that is `sequence: [draft, pending, approved]`
     with `gates.pending.reject: draft`. The comment is *correctly* citing REQ-STATE-08 per the §9
     field-provenance convention — it is faithful to a stale requirement, which is exactly how a stale
     requirement propagates.

   Two further hits are **not** defects and are listed so a fixer does not chase them:
   `docs/02_requirements/03_sard/00_index.md:70` (a summary table row that names the requirement, not
   the machine) and `docs/05_plans/X_wingfoil-init-plan.md:101` (a grandfathered `X_*` plan — history).

## Expected Behavior

REQ-STATE-08's Description names the machine the project actually implements, and the P1.13 BDD
scenario asserts that machine, so that a reader of the SARD and a reader of the code reach the same
conclusion about what a type without a `states` block does.

## Actual Behavior

The authoritative requirement and its acceptance scenario both describe a five-state machine with a
frontmatter-visible `rejected` status that the tool does not implement, no configuration declares, and
no document has ever carried.

## Notes

### Why this is a specification defect and not merely stale prose

CLAUDE.md §10.1 makes `docs/02_requirements/` authoritative over the config, and BDD scenarios are the
**acceptance contracts** (CLAUDE.md §2). So the project currently has an authoritative requirement and
a binding acceptance scenario that contradict shipped, `approved`-spec'd behaviour. Anyone deriving
work from the SARD — a future `defaults` change, a new type, a validator — inherits the wrong machine
and has no signal that they should not. `spec-001` foresaw this and left an instruction; the
instruction has no owner and nothing schedules it.

### It blocks nothing today, which is why it has survived

`resolveStateMachine` reads `typeEntry.states ?? defaults.states` from `memory.yaml`; it never reads
the SARD. `task-010-default-state-machine-fallback` (`done`) delivered REQ-STATE-08's coverage against
the *implemented* machine — its own notes record asserting "reject pending→draft with NO `rejected`
status" — so the test suite is green against spec-001 while the requirement it cites says otherwise.
Nothing fails, and nothing will, until someone trusts the SARD text.

### Fix shape — do NOT apply as part of this report

Three edits, one pass, and the SARD one is the only one with a governance cost:

1. `03_state-context.md` REQ-STATE-08 Description → spec-001's machine (`draft → pending → approved`,
   `reject` returning to `draft`, `deprecated` as the implicit wildcard), with a pointer to spec-001 so
   the change is traceable rather than mysterious. The Fit Criterion needs no change — it is written in
   terms of "the default transitions", whatever they are.
2. The P1.13 BDD scenario line, to match.
3. `memory.yaml:51`'s `[SPEC: REQ-STATE-08]` comment, to match — and this one must come **after** (1),
   per the §9 convention that a `[SPEC]` field's referenced specification changes first.

Sequencing note: `task-071-fix-init-memory-yaml-state-machine` is the task that puts a `defaults` block
into the `init` scaffold and cites REQ-STATE-08 as its requirement. It is `in-progress` on its branch
(`task/task-071-fix-init-memory-yaml-state-machine`, HEAD `d0d568f`, re-submitted and awaiting review).
Whether the reconciliation rides that task or gets its own is a scoping call for release-planning, not
for this report — but they touch the same requirement and should at least know about each other.

### Severity `medium`

No user impact, no failing test, no runtime consequence. `medium` rather than `low` because the stale
text sits in the two places this project treats as authoritative — the SARD and a BDD acceptance
scenario — and because an `approved` tech-spec explicitly ordered the reconciliation, which makes this
an unpaid debt rather than an oversight nobody noticed.

### Related

`spec-001-memory-yaml-schema` (`approved` — the spec that retired the state and ordered the
reconciliation), `adr-008-per-type-state-machines`, `task-010-default-state-machine-fallback` (`done` —
REQ-STATE-08's coverage, written against the implemented machine),
`task-071-fix-init-memory-yaml-state-machine` (in rework/review on its branch — the other live consumer
of REQ-STATE-08), `bug-030-init-memory-yaml-has-no-state-machine`,
`dl-072-init-scaffold-per-type-state-machines` (filed in this same batch — the `defaults`-vs-per-type
question, which also depends on REQ-STATE-08 saying something true),
`bug-053-spec-011-memory-yaml-row-stale-states-encoding` (the same spec-001 migration's other
un-reconciled downstream text), `dl-012`, `dl-017-decision-log-remove-delivery-states`, REQ-STATE-01,
REQ-SYS-04, P1.13.

## Triage & Execution Notes

Raised during the round-6 governance ingest (2026-09-21), from the review of
`task-071-fix-init-memory-yaml-state-machine`. Filed unfixed — the agent stops at `open`.

Both texts named in the received framing were opened and quoted from the files rather than recalled;
the code side was settled by `grep -rn "'rejected'\|\"rejected\"" src/` and
`grep -rn "^status: rejected" docs/`, both empty. The received framing named only REQ-STATE-08's
Description; a sweep for other live occurrences found **two more that are defects** (the P1.13 BDD
scenario and `memory.yaml:51`) and two that are not (an index row and a grandfathered plan). Those are
recorded above so the fix is scoped correctly the first time.

Not attempted: editing the SARD, the feature file or `memory.yaml`; and no judgement on whether this
folds into `task-071` — that is release-planning's call.
