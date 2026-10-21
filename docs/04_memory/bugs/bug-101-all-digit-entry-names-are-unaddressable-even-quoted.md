---
id: "bug-101-all-digit-entry-names-are-unaddressable-even-quoted"
type: bug
title: "An entry named with digits alone stays unaddressable even when quoted, because the index guard runs after the delimiters are stripped — the same class `bug-091` filed, surviving its own fix"
status: triaged
severity: "low"
release-origin: "v0.2"
release: "v0.4"
feature: "P2.1"
contributor: ""
credit: ""
tmpl_version: 260703
---

## Summary

`dl-083` says a quoted path segment is taken verbatim and that inside it "`.` is an ordinary
character. Every other character is ordinary too." That is not true of digits.

`splitDnaPath` strips the quote delimiters before handing segments to `resolveDnaPath`, whose
`/^\d+$/` guard then cannot tell `0` from `"0"`. So an entry whose `name` is `0` — schema-legal, since
`uniquelyNamed` constrains duplicates and nothing constrains characters — is refused with
*"entries of 'stacks.technologies' are addressed by name, not by index"*, identically quoted or bare.
There is no spelling that reaches it.

## Steps to Reproduce

Found by `task-099`'s reviewer and measured on that branch's build.

1. Add an entry whose `name` is `0` (or any all-digit string) to a collection. The schema accepts it.
2. `wingfoil dna update 'stacks.technologies."0".category' --value x`
3. Refused — the quoted form produces the same index-guard message as the bare `stacks.technologies.0`.

## Expected Behavior

Either a quoted segment reaches an all-digit name, as `dl-083` says it should, or `dl-083` records
digits as a second reserved shape alongside `"` and says so.

## Actual Behavior

The quoting rule has no effect on this case, and the decision that introduced it states the opposite.

## Notes

**This is `bug-091`'s own class, surviving `bug-091`'s fix** — a schema-legal name that no spelling
reaches. That is what makes it worth an element rather than a note: the fix for the first instance
did not generalise, and the reason is mechanical and easy to miss. `splitDnaPath` deliberately returns
plain strings, so by the time the index guard runs, the information that a segment *was* quoted is
gone.

**The remedy is not a one-line change**, which is why `task-099` is not being asked to absorb it.
`DnaPathSplit` would have to carry a per-segment "was quoted" flag and `resolveDnaPath` would have to
consult it — a change to the parser's return type and to every consumer. Worth doing deliberately.

**The alternative remedy is a documentation fix**: `dl-083` narrows its "every other character is
ordinary" sentence to exclude an all-digit segment, and the refusal message says so. Cheaper, and
defensible — an entry named `0` is not something a real project writes, unlike `Node.js`, which is the
whole reason `bug-091` mattered. Decide which before scheduling.

**Severity `low` on the same reasoning the alternative rests on.** Nothing in this repository's
`dna.yaml`, nor either `init` template, carries an all-digit name — and this time that was checked
with `grep -nE '^\s*- name: *"?[0-9]+"?\s*$' docs/self/.wingfoil/dna.yaml`, which returns nothing,
rather than asserted the way `bug-091`'s original claim was.

## Triage & Execution Notes

- triage (2026-09-24): **low**. No current data is unreachable and the failure is a refusal, not a
  corruption. Filed because `dl-083` is `ready` and currently says something about quoted segments
  that is false, which a reader will rely on.
