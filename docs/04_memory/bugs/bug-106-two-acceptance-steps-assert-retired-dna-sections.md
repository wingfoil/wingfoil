---
id: "bug-106-two-acceptance-steps-assert-retired-dna-sections"
type: bug
title: "Two acceptance steps assert that the DNA declares or displays a `conventions` section, which measurement refutes — `bug-089`'s class, in two files it did not own"
status: closed
severity: "medium"
release-origin: "v0.2"
release: "v0.3"
feature: "P2.2"
contributor: ""
credit: ""
tmpl_version: 260703
---

## Summary

Two BDD steps assert sections the schema does not declare:

- `P2.4-project-dna-config.feature` line 11 — "declares the sections `modules`, `tech_stack`,
  `team`, `conventions`"
- `P2.2-dna-show.feature` line 9 — "the output includes tech stack, modules, conventions, and team
  sections"

Measured on `main`'s build in a throwaway `wingfoil init --template Scrum` repository:

```
$ wingfoil dna show          -> keys: version, project, modules, stacks, team, paths   exit 0
$ wingfoil dna show conventions
error: no DNA key named 'conventions'                                                  exit 1
```

`conventions` is neither emitted nor showable. `stacks` and `paths` **are** emitted and are named by
neither step.

## Steps to Reproduce

The two commands above, plus reading the two lines.

## Expected Behavior

An acceptance step asserts what the tool does.

## Actual Behavior

Both assert a shape `spec-002` retired in v1.1, and both would fail the moment a BDD runner exists.

## Notes

**This is exactly `bug-089`'s class**, in two files `task-100` did not own — an acceptance contract
contradicting the shipped schema, latent because nothing executes `.feature` files. It is separated
from `bug-105` deliberately: that one is narrative and asserts nothing, this one is a contract and
would go red.

**`P2.2` lines 13–14 are explicitly NOT in this class and must not be swept up.**
`wingfoil dna show tech_stack` is a **deliberate read-side alias** — exit 0, returning the `stacks`
subtree — pinned on purpose by `test/core/dna-show.test.ts`. `spec-002`'s Consequences describe it.
Correcting it would break a working behaviour.

**Found by `task-100`'s reviewer**, after the task cleared `P2.2` on the strength of reading its
second scenario. The defect is in the first.

**Fix it with `bug-105` in one pass.** Both live in the same two files, and the person correcting a
narrative line is already looking at the step below it.

## Triage & Execution Notes

- triage (2026-09-24): **medium**. Same grade and same reasoning as `bug-089`: nothing fails at
  runtime and no user is affected, but an acceptance contract that contradicts the shipped schema is
  the divergence the traceability chain exists to prevent — and with no BDD runner, nothing will ever
  report it.
