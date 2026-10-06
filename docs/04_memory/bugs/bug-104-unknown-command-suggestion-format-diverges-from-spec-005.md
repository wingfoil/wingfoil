---
id: "bug-104-unknown-command-suggestion-format-diverges-from-spec-005"
type: bug
title: "The unknown-command suggestion is Commander's `(Did you mean memory?)`, not the `hint:` line `spec-005` §3.1 declares — and a test now pins the third party's shape as though it were the contract"
status: closed
severity: "medium"
release-origin: "v0.2"
release: "v0.3"
feature: "P5.1"
contributor: ""
credit: ""
tmpl_version: 260703
---

## Summary

`spec-008` §1 requires an unknown command to suggest a near match, and traces the format to
`spec-005` §3.1, which declares a `hint:` line — `hint: did you mean "memory"?`. WingFoil has an
emitter for exactly that (`src/cli/error.ts`), and it is **not on this path**.

What ships is Commander's own text appended to the error message: `(Did you mean memory?)`. Two
divergences, neither recorded anywhere:

1. **Format.** Parenthetical suffix versus a `hint:` line in WingFoil's declared error format.
2. **Algorithm.** `spec-008` §1 names Levenshtein distance ≤ 2;
   `node_modules/commander/lib/suggestSimilar.js` uses Damerau–Levenshtein with `maxDistance = 3` and
   a 0.4 similarity ratio. Different inputs will and will not be suggested.

## Steps to Reproduce

`wingfoil memroy add` on `task-101`'s build: the stderr line carries `(Did you mean memory?)`.
`grep -rn "hint:" src/cli/error.ts` shows the declared emitter; nothing on the unknown-command path
calls it. `grep` over `docs/` finds no element recording the divergence.

## Expected Behavior

Either the suggestion is emitted in WingFoil's own declared format by WingFoil's own emitter, or
`spec-005` §3.1 and `spec-008` §1 record that the suggestion is delegated to Commander and describe
what it actually produces, including the algorithm.

## Actual Behavior

The spec declares one shape, the binary emits another, and a test added by `task-101` now asserts
Commander's shape — so the third party's output is pinned as though it were the contract. A Commander
upgrade that reworded its suffix would fail a WingFoil test for a reason no WingFoil document
explains.

## Notes

**This does not undermine `task-101`.** Its narrower claim is sound and should survive: the
`P5.1.4-cli-ux.feature` scenario as literally written — exit 2, the message, a suggestion naming
`memory` — now passes in full, which it did not before. What overstates is the sentence in its notes
and in a test header claiming the change "completes `spec-008` §1's `E_UNKNOWN_COMMAND` treatment".
Half of it is completed; the format half is not.

**The choice is real, not a formality.** Delegating to Commander is defensible — it is maintained,
tested, and already installed — but then the specs must say so, because a declared format nobody
implements is worse than an undeclared one. Re-emitting through `src/cli/error.ts` keeps the error
format uniform across every failure the tool produces, at the cost of reimplementing or wrapping the
distance calculation.

**Found by `task-101`'s reviewer**, in the gap between what the task measured and what its prose
claimed.

## Triage & Execution Notes

- triage (2026-09-24): **medium**. Nothing fails and every message is useful; the cost is that an
  approved spec describes an error format the tool does not emit, on the error path a new user is
  most likely to hit first. Not `low` because a test now depends on a third party's wording without
  a document explaining why.
