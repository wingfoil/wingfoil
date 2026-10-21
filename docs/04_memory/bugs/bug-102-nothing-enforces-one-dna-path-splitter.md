---
id: "bug-102-nothing-enforces-one-dna-path-splitter"
type: bug
title: "`splitDnaPath` being the only place a DNA path is split is a fact about today's code, not an invariant anything checks"
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

`task-099` consolidated three `split('.')` call sites into one parser. Measured on its branch and
again on `main`, `grep -rn "split('\.')" src/` returns exactly one line — the sentence inside
`splitDnaPath`'s own doc comment.

Nothing keeps it that way. A fourth caller that splits a path itself compiles, passes every test, and
silently bypasses the quoting rule, the unterminated-quote refusal and the unaddressable-name refusal
that `dl-083` ratified.

## Steps to Reproduce

Add `keyPath.split('.')` anywhere in `src/dna/` or `src/core/` and run the suite. It passes.

## Expected Behavior

An invariant the grammar depends on is enforced by something that fails when it is broken, not by the
next reader noticing.

## Actual Behavior

It rests on care. The same shape as `bug-084`'s alias trap: a rule everybody knew, that nothing
checked, until a path went through the wrong door.

## Notes

**The pattern to copy already exists in this repository.** `test/cli/derived-option-namespace.test.ts`
(from `task-093`) enumerates from the source of truth rather than hard-coding, so a new schema field
breaks the build instead of slipping past. A derived guard here would assert that the parser is the
only splitter, reading the source rather than a list.

**Proposed by `task-099` and deliberately not built there** — it is a test about the shape of the
codebase rather than about the behaviour that task delivered, and building it would have widened a
task already carrying a ratified grammar.

**Worth pairing with `bug-096`'s twin rule when `task-094` writes it.** Both are the same missing
thing seen from two sides: a property everyone is expected to maintain, that nothing states and
nothing checks. One is about prose asserting facts; this one is about code preserving an invariant.

## Triage & Execution Notes

- triage (2026-09-24): **low**. No defect exists today — the fact holds, verified on `main` after the
  merge. Filed so the invariant has an owner before someone adds the fourth splitter, which is the
  only moment at which it becomes expensive.
