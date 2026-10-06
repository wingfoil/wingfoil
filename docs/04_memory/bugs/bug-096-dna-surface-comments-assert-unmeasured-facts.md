---
id: "bug-096-dna-surface-comments-assert-unmeasured-facts"
type: bug
title: "The comment justifying the manual `version` global says `--version` is absent from `program.options`, and it is not — plus one present-tense comment still in the retired `dna set` grammar"
status: in-review
severity: "low"
release-origin: "v0.2"
release: "v0.3"
feature: "P2.1"
contributor: ""
credit: ""
tmpl_version: 260703
---

## Summary

Three residues from `task-093`, raised by its third-pass reviewer and approved over rather than
reworked. None changes behaviour; all three are durable prose that says something untrue or stale.

1. **The false measurement.** The comment justifying `globals.add('version')` in
   `test/cli/derived-option-namespace.test.ts`, and the Execution Notes repeating it, state that
   `--version` is *absent* from `program.options` because "`program.version()` and Commander register
   outside `.option()`". Measured, `program.options` holds
   `["--version","--format","--verbose","--no-color","--no-interactive"]`. Only `--help` is absent.
2. **The consequence.** Because the name is added by hand, stripping `version` from the *derived*
   globals leaves the suite at 13/13 green. So the globals half of "derived rather than a hand-listed
   copy" is hand-listed for the one name the `spec-008` §9 example is about.
3. **The stale comment.** `src/core/index.ts` still says `` `dna set version 2` writes `version: '2'` ``
   in the **present tense**, in the grammar `dl-082` retired. The three sibling old-spelling quotes
   (`src/dna/path.ts`, `src/dna/set.ts`, `src/dna/mutate.ts`) are past-tense historical records and
   were deliberately left; this one is not. `test/core/dna-set.test.ts`'s title
   "the general case — `dna set nonsense.at.any.depth value`" is the same case.

A fourth, smaller: a citation reading "`spec-008` §1's precedence rule" — §1 says globals "may appear
anywhere after `wingfoil`"; the word *precedence* lives in §2.

## Steps to Reproduce

Probe the built program:

```
program.options longs -> ["--version","--format","--verbose","--no-color","--no-interactive"]
```

Then remove `version` from the derived globals while leaving the manual `globals.add('version')`:
the namespace suite stays **13/13 green**.

## Expected Behavior

A comment that asserts a fact about the code names the command that establishes it, and is true. A
comment written in the present tense describes the current grammar.

## Actual Behavior

The justification is false for the only name it concerns, and the derivation it justifies is partly
hand-listed. One comment describes a command spelling that no longer exists, without marking itself
historical.

## Notes

**Test efficacy is materially intact, which is why this is `low` and why the task was approved.** In
the *invariant* test the manual addition can only create collisions, never hide them, and a real
removal of `program.version()` would break the behavioural drive two lines below. Nothing shipped is
wrong; what is wrong is the explanation of why the test works.

**This is the third instance of one class in one task.** `task-093` was rejected twice for a claim
written without running the measurement that settles it — first a coverage attribution, then a
`spec-008` §9 clause, now this comment. Three different sentences, one habit. The approver chose to
approve rather than reject a fourth time, on the ground that the first two were **operative
documentation** — a spec clause a user acts on — while this is an internal comment explaining a
test's construction, and that a fourth rejection of a fourth sentence would not teach what three did
not.

**The durable remedy is a rule, not a fix, and it is `task-094`'s ground.** That task exists to write
`dl-080`'s baseline rule "where an implementer meets it — a directive, or the specs — not only here".
The twin rule belongs beside it: *a comment that asserts a fact about the code must name the command
that establishes it.* Four tasks have now re-derived a ratified rule from prose, and three sentences
in one task have asserted unmeasured facts; both are the same missing-rule shape.

## Triage & Execution Notes

- triage (2026-09-24): **low**. No behaviour is wrong and no gate is weakened. Filed because
  `task-093` is `done` once approved, and nothing reschedules a done task's Execution Notes.
