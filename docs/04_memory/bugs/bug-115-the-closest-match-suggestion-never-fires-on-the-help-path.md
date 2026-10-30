---
id: "bug-115-the-closest-match-suggestion-never-fires-on-the-help-path"
type: bug
title: "`wingfoil memroy` suggests `memory`; `wingfoil help memroy` suggests nothing — the same typo gets help or no help depending on how it is reached"
status: in-review
severity: "low"
release-origin: "v0.2"
release: "v0.3.2"
feature: "P5.1"
contributor: ""
credit: ""
tmpl_version: 260703
---

## Summary

`spec-008` §1 requires an unknown command to suggest a near match. It fires on the direct path and not
through `help`:

```
$ wingfoil memroy
error: unknown command 'memroy'                  (Did you mean memory?)     exit 2
$ wingfoil help memroy
error: unknown command 'memroy'                                             exit 2
```

Same typo, same message, same exit code — and a suggestion in one case only.

## Steps to Reproduce

The two commands above, on `task-103`'s build.

## Expected Behavior

A near-match suggestion is a property of "this command does not exist", not of the route that
discovered it.

## Actual Behavior

The direct path goes through Commander's `unknownCommand` error, which carries `suggestSimilar`; the
`help <unknown>` path goes through `_dispatchHelpCommand` into `commander.help`, which has no
suggestion machinery, and the line is WingFoil's own.

## Notes

**Distinct from `bug-104`, and the two want fixing together.** `bug-104` is about the *format* of a
suggestion that does fire — Commander's `(Did you mean memory?)` against the `hint:` line
`spec-005` §3.1 declares. This is about a suggestion that does not fire at all. But the line for
`help <unknown>` is emitted by WingFoil (`task-103` added it), so it is the natural place to put a
correctly-formatted suggestion when `bug-104` is decided — one pass, not two.

**Found by `task-103`, which deliberately did not add one**, since inventing a suggestion format while
`bug-104` is open would have pre-empted that decision.

## Triage & Execution Notes

- triage (2026-09-25): **low**. The message is correct and the exit code is right; a user loses a
  convenience on one of two routes to the same mistake. Schedule with `bug-104`.

### Retrospective

- Fixed by `task-315`: the help path now reuses the direct path's `closestCommand`/`unknownCommandHint` at the
  level the help command was typed at, so `wingfoil help memroy` and `wingfoil memroy` print the same
  `error:`/`hint:` lines (`test/cli/operand-error-shape.integration.test.ts`, task-315's AC 3 block). The
  carve-out sat in two places, the code and `spec-005` §3.1, and both had to move together.
