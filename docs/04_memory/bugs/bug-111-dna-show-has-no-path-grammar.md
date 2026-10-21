---
id: "bug-111-dna-show-has-no-path-grammar"
type: bug
title: "`dna show` resolves a single top-level key and never splits on `.`, so nothing below a section is readable — and `dl-083`'s own worked example cannot run"
status: triaged
severity: "medium"
release-origin: "v0.2"
release: ""
feature: "P2.2"
contributor: ""
credit: ""
tmpl_version: 260703
---

## Summary

`dnaShowFn` resolves its argument as **one top-level key** of `dna.yaml` and never splits it on `.`.
So the whole write surface is addressable by path — `dna set|add|remove|update` all take a dotted
`<path>`, with quoted segments since `dl-083` — while the **read** surface stops at a section.

Measured on `main`'s build in a throwaway `wingfoil init --template Scrum` repository:

```
$ wingfoil dna show stacks                    exit 0   (the whole subtree)
$ wingfoil dna show stacks.technologies
error: no DNA key named 'stacks.technologies'          exit 1
$ wingfoil dna show project.license
error: no DNA key named 'project.license'              exit 1
```

## Steps to Reproduce

The three commands above.

## Expected Behavior

A user who can write `dna update stacks.technologies."Node.js".version` can read it back with the same
path.

## Actual Behavior

They must `dna show stacks` and read the whole subtree, or `--format json` it and filter outside the
tool.

## Notes

**Quoting is not what is missing.** `dl-083` gave the write surface quoted segments, and its Decision
block offered `dna show 'stacks.technologies."Commander.js"'` as a worked example. That example cannot
run, and would not run with the quoting rule implemented, because a plain dotted path fails
identically. `dl-083` now carries a dated Correction saying so; this is the gap that Correction
names.

**Deliberately not absorbed into `dl-083` or `task-099`.** Giving `dna show` a path grammar is a new
read surface with its own questions — what it prints for a collection, what it does for an absent
optional section, what exit code an unresolvable read gets — and its own BDD scenario. Absorbing it
would have let a ratified decision grow a surface it never argued for.

**It is `medium` rather than `low` because of the asymmetry, not the inconvenience.** A tool whose
write grammar is richer than its read grammar teaches a path syntax and then refuses it, which is the
kind of inconsistency `dl-082` was written to remove from this very pillar.

**When it is scheduled, `splitDnaPath` and `resolveDnaPath` already exist** (`src/dna/set.ts`,
`src/dna/path.ts`, from `task-099`) and are the same parser the write verbs use — so the work is the
read semantics and the refusals, not the parsing.

## Triage & Execution Notes

- triage (2026-09-25): **medium**. Nothing is broken and no data is unreachable — `dna show <section>`
  plus `--format json` gets a user anywhere. The cost is a surface that contradicts its own sibling.
- Raised by `task-099`, which measured it while implementing the write-side quoting. Recorded in
  `dl-083`'s Correction as "filed separately"; this is that filing.
