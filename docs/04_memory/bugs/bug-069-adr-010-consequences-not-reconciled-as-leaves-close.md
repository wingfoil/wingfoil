---
id: "bug-069-adr-010-consequences-not-reconciled-as-leaves-close"
type: bug
title: "adr-010's Consequences state in two places that `@types/node` is still pinned `^18.19.130`, and nothing reconciles an accepted ADR's Consequences as its cascade leaves close"
status: in-review
severity: "low"
release-origin: "v0.2"
release: "v0.3"
feature: ""
contributor: ""
credit: ""
tmpl_version: 260703
---

## Summary

`adr-010-node-22-runtime-floor` is `accepted`. Its Consequences record, as present fact, that
`@types/node` is still pinned to the superseded floor — in **two** places, not one. `task-087` raised
the pin to `^22.20.4`, so both statements are now false in an `accepted` architectural decision that
a reader consults to know what the Node 22 floor cost.

## Steps to Reproduce

```
$ grep -n '18.19.130\|@types/node' docs/self/docs/04_memory/design/adrs/adr-010-node-22-runtime-floor.md
195:  - `@types/node` is still pinned `^18.19.130` explicitly to match the *old* floor, so the codebase
236:22.12.0 does not satisfy `eslint@10.6.0`), `bug-049` (`@types/node` still `^18`).
```

Line 195 is the *Neutral* bullet of Consequences; line 236 is the closing list of what the ADR does
**not** resolve. Read on `main` at `c4830c0`; the offsets are given only because this is a
reproduction step (`dl-075` permits them here), and the two passages are identified by their section
rather than by their line.

## Expected Behavior

Either the ADR's Consequences are reconciled when the elements they name close, or the ADR states its
Consequences as a dated snapshot so a reader knows to check the named elements rather than trusting
the sentence.

## Actual Behavior

Both sentences read as current fact, cite `bug-049` as the tracking element, and are wrong. A reader
following the citation does arrive at the truth — `bug-049` is closing through `task-087` — so the
damage is bounded by the ADR having cited its element in the same breath. That is what keeps this low
rather than medium.

## Notes

**The restraint that produced this was correct and should not be read as a criticism of it.**
`task-087` declined to amend an `accepted` ADR because no acceptance criterion authorised it,
following `task-074`'s precedent that a governing document moves with the code only when an AC says
so. That is the right instinct; the consequence is simply that something must own the reconciliation,
and today nothing does.

**The class matters more than this instance.** `adr-010` has four cascade leaves — `bug-046`,
`bug-047`, `bug-048` and `bug-049` — and nothing revisits its Consequences as each closes. Every one
that closes leaves another sentence stale, so the same defect will recur three more times without a
single new mistake being made. It is the same shape as `bug-008` / `dl-025`: a document that no
workflow gate owns, going stale by the ordinary operation of work elsewhere.

That general question — whether an ADR's Consequences should be reconciled at all, by whom, and
whether they should instead be written as dated snapshots — is a **decision, not a defect**, and
belongs in v0.3 planning next to `dl-025`. It is deliberately not filed as a decision-log here: one
instance does not settle whether a convention is wanted, and filing a dl nobody has asked to decide
would be inventing scope. This bug records the concrete falsehood; the convention question is named
so that whoever plans v0.3 finds it.

Fixing the two sentences is an in-place amendment under `dl-047` with a dated Revision note, the shape
`task-079`, `task-084` and `task-085` established for `spec-015`. Note `adr` and `tech-spec` share a
state machine, so the same convention applies unchanged.

## Triage & Execution Notes

- triage (2026-09-22): **low**. Both false sentences cite the element that carries the truth, so a
  careful reader is not stranded; no gate, test or release step depends on either. The cost is that
  an `accepted` ADR misdescribes its own consequences, and that the same will happen three more times
  as `bug-046`, `bug-047` and `bug-048` close.
- No fix task filed. The natural carrier is whichever task next has reason to amend `adr-010` — or
  the v0.3 planning decision on reconciling Consequences, which would fix all four at once rather
  than one per closure. Named here so that carrier is not invented later.
