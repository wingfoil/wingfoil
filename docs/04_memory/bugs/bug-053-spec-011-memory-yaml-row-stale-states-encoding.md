---
id: "bug-053-spec-011-memory-yaml-row-stale-states-encoding"
type: bug
title: "spec-011's `memory.yaml` contract row still describes per-type `states` as `(values/initial/transitions)` — the encoding spec-001 retired — and never mentions `defaults`"
status: in-progress
severity: "low"
release-origin: "v0.2"
release: "v0.3"
feature: "P1.13"
contributor: ""
credit: ""
tmpl_version: 260703
---

## Summary

`spec-011-storage-layout` (`approved`) defines the contract of each top-level config file. Its
`memory.yaml` row still says each type declares "`states` (values/initial/transitions)" — the
dict-of-arrays encoding `spec-001-memory-yaml-schema` replaced with `sequence`/`gates`/`waiting` — and
the word `defaults` does not appear in the file at all, so the block that carries the default machine
for every type without its own is absent from the layout contract.

## Steps to Reproduce

Measured 2026-09-21 on `main` at `ba2cad0`.

1. The row, `docs/04_memory/design/specs/spec-011-storage-layout.md:104`:

```
| `memory.yaml`    | Memory (P1.13)      | `types:` map — one entry per element type, each declaring `path` (must contain `{id}`), `states` (values/initial/transitions), and `template:` (`frontmatter.required` + `file:` pointing into `memory/templates/`) |
```

2. `defaults` is never mentioned:

```
$ grep -n "defaults" docs/self/docs/04_memory/design/specs/spec-011-storage-layout.md
(no output)
```

3. The encoding it names was retired by `spec-001-memory-yaml-schema` (`approved`), whose own summary
   of the change is at `:164`:

```
# DEFAULT machine — was: draft→pending, pending→{approved,rejected}, rejected→draft
```

and whose schema (`:116`) declares `states: StateMachine.optional(), // absent ⇒ defaults.states applies (REQ-STATE-08)`.

4. The live config and the code both use the new encoding. `.wingfoil/memory.yaml:58-63`:

```
defaults:
  states:
    sequence: [ draft, pending, approved ]
    gates:
      pending: { reject: draft }   # …
```

```
$ grep -n "sequence:" src/memory/schema.ts | head -3
34:    sequence: z.array(z.string()).min(1),
$ grep -rn "initial:" src/memory/
(no output — the retired encoding's keys appear nowhere in src/)
```

5. **The same retired phrase survives twice inside `memory.yaml` itself**, in the `[SPEC]`
   field-provenance annotations that are supposed to describe the file's own shape:

```
$ grep -rn "values/initial/transitions" docs/
docs/self/docs/04_memory/design/specs/spec-011-storage-layout.md:104:…`states` (values/initial/transitions)…
docs/self/.wingfoil/memory.yaml:14:# So `path`, `states` (values/initial/transitions) and the `defaults` block are [SPEC]; per-type
docs/self/.wingfoil/memory.yaml:67:# Types — per type, `path` and `states` (values/initial/transitions) are [SPEC] (P1.13 / REQ-SYS-04);
```

Those are the **only** three occurrences in the whole repository. Note `:14` is internally
inconsistent on its own line: it names the retired three-key encoding and the `defaults` block in the
same sentence — the second half is post-spec-001, the first half is pre.

6. Both documents are `approved`, so neither can be edited silently:

```
$ grep -n "^status:" docs/self/docs/04_memory/design/specs/spec-011-storage-layout.md
5:status: approved
```

## Expected Behavior

spec-011's `memory.yaml` row describes the file as it is: per-type `states` in the
`sequence`/`gates`/`waiting` encoding, optional, with a top-level `defaults.states` block supplying the
machine for any type that omits it.

## Actual Behavior

The row names a retired three-key encoding and omits `defaults` entirely, so a reader implementing
against spec-011 alone would author a `memory.yaml` the loader rejects and would not know the default
machine has a home in the file.

## Notes

### A second staleness in the same table, same row-neighbour

Found while verifying the above, in the row immediately before it (`:103`):

```
| `dna.yaml`       | DNA (P2.4)          | Modules, tech stack, team & roles, conventions, resource `paths:` … |
```

`conventions` is no longer a field of `dna.yaml`. `spec-002-dna-yaml-schema:54` states it directly —
"`conventions` is **not** a top-level field of `DnaYaml`" — and `:229` records the removal with a
relocation table for every value it held. The live `dna.yaml` keeps only a prose comment at `:157`
explaining where the section went.

This is the same defect class (an `approved` layout spec whose contract column was not updated when a
schema spec moved underneath it), in the same table, fixable in the same pass. It is recorded here
rather than as its own bug for that reason; if triage prefers them split, this paragraph is the whole
of the second one.

### Why it has survived

spec-011 is a *layout* spec: nothing loads it, nothing validates against it, and the schema specs
(spec-001, spec-002) are what the code actually implements. So the drift is invisible to every gate.
It matters at exactly one moment — when someone reads spec-011 to learn what a config file contains,
which is what a layout spec is for.

### Fix shape — do NOT apply as part of this report

Four edits in one pass: spec-011's two contract cells (`memory.yaml` — new encoding plus `defaults`;
`dna.yaml` — drop `conventions`), and `memory.yaml`'s own two `[SPEC]` annotations at `:14` and `:67`.
spec-011 is `approved`, so per `dl-047-tech-specs-carry-no-version-field` its half is a dated Revision
note plus re-ratification, not a silent change; the `memory.yaml` comments are ordinary config edits
that per the §9 convention must follow, not precede, the spec correction. The rewrite should carry a
pointer to spec-001/spec-002 so the next reader can see which spec is authoritative for the shape.

### Severity `low`

No code, no test, no user-visible behaviour depends on it; it is documentation inside an `approved`
spec that no gate reads. Filed because spec-011 is the document a newcomer or a future `init`-related
task would consult first, and because `bug-052` shows the same spec-001 migration left more than one
downstream text unreconciled — the pattern is worth making visible.

### Related

`spec-001-memory-yaml-schema` (`approved` — retired the `values/initial/transitions` encoding,
introduced `defaults`), `spec-002-dna-yaml-schema` (`approved` — removed `conventions`),
`bug-052-req-state-08-names-retired-default-machine` (the same migration's other un-reconciled
downstream text, in the SARD and a BDD scenario),
`dl-047-tech-specs-carry-no-version-field` (the amendment route for an `approved` spec),
`bug-030-init-memory-yaml-has-no-state-machine`,
`task-071-fix-init-memory-yaml-state-machine` (in rework/review on its branch — its own scaffold
changes are specified against spec-011), `dl-072-init-scaffold-per-type-state-machines` (filed in this
batch; its options are stated in terms spec-011 does not yet define), REQ-SYS-02, REQ-SYS-04, P1.13.

## Triage & Execution Notes

Raised during the round-6 governance ingest (2026-09-21), from the review of
`task-071-fix-init-memory-yaml-state-machine`. Filed unfixed — the agent stops at `open`.

The line was read from the file at the cited number and the absence of `defaults` settled by a `grep`
over the whole document (empty), rather than by scanning. The `dna.yaml`/`conventions` neighbour was
found by reading the surrounding table and confirmed against `spec-002`'s own statement of the removal
before being recorded. A repository-wide `grep` for the retired phrase then turned up **two more live
occurrences inside `memory.yaml` itself** (`:14`, `:67`) that the received framing did not name; they
are the reason the fix shape above is four edits rather than one.

Not attempted: editing spec-011 or `memory.yaml`, and no judgement on whether the `dna.yaml` row should
be split into its own bug.
