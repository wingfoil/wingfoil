---
id: "bug-100-cli-reference-runs-two-positional-notations"
type: bug
title: "`X_cli-cmds.md` now writes required positionals as `<ANGLE>` in Pillar 2 and `[BRACKETS]` everywhere else, and nothing schedules the conversion"
status: in-review
severity: "low"
release-origin: "v0.2"
release: "v0.3"
feature: "P5.1"
contributor: ""
credit: ""
tmpl_version: 260703
---

## Summary

`task-098` changed the document's *Required vs. optional arguments* convention: a required positional
is now `<ANGLE>` and an optional one `[BRACKETS]`. The document previously said "Required arguments in
`[brackets]`" and every pillar followed it.

The change was forced and is correct — `dl-082`'s own Decision block writes the ratified grammar as
`dna set <path> --value <v>`, so `dl-082` Action 3 could not be satisfied without either angle
brackets or a document contradicting its own new rows. `task-098` took the honest branch: it changed
the convention and **flagged Pillars 1, 3, 4 and 5 as still bracketing required positionals** rather
than silently leaving two rules in force.

What is missing is the follow-through. The reference now runs two notations, the non-conforming rows
are labelled but not converted, and no element schedules the conversion.

## Steps to Reproduce

Read the *Command-Line Syntax Conventions* section, then any Pillar 1 row —
`memory approve [document-id] [--reason "reason"]`. The id is **required**:
`wingfoil memory approve` → `error: missing required argument: memory approve <id>`, exit 2 (measured
on `main`'s build). Under the document's own new rule it should read `<document-id>`.

## Expected Behavior

One notation, applied throughout, so a reader can tell a required positional from an optional one by
looking at it.

## Actual Behavior

Two, with a note explaining which pillars have not been converted — which is honest but is a state no
document should rest in.

## Notes

**Scope was right and the residue is the cost of it being right.** `task-098` owned `bug-090`, which
is `dna set`'s grammar and the Pillar 2 rows `dl-082` moved. Converting four other pillars would have
been exactly the silent widening `dl-082` E3 warns against. Its reviewer accepted the convention
change as inside Action 3 and named this residue as the thing to file — which is what this is.

**The conversion is mechanical but not blind.** Each bracketed positional has to be checked against
the shipped binary to know whether it is required, and several rows describe commands that do not
exist (`workflow status`, `workflow next`, `workflow show`, `audit`, `memory import`, `dna infer`,
`workflow create`). For those, the notation asserts a grammar nobody has built, which is the same
trap `bug-099` item 2 records: correcting them would state a future contract rather than describe a
present one. Decide per row whether to convert or to mark *Not built*, the way `task-098` marked
`dna infer`.

**Best done with `bug-099`, in the `user-docs` phase.** Both are residual accuracy work on the same
document, both rise in cost the moment `v0.2` publishes and the reference becomes the first thing a
new user reads, and doing them together means reading each row once.

## Triage & Execution Notes

- triage (2026-09-24): **low**. Nothing is wrong about what a user may type; the notation is a reading
  aid that currently means two things in one document. Filed because a done task's Execution Notes
  reschedule nothing, and this was recorded only there.
- Introduced by `task-098` knowingly, as the cheaper of two honest options. Not a defect in that work.

### Retrospective

- Fixed by `task-245`: one notation, `--help`'s, in every command row (`<id>`, `[<ref>]`, `<path>`), Pillar 2 included, and
  in the parameter tables' positionals (Pillar 2's `category` and Pillar 3's `ROLE` rows keep the names two guards pin); the
  rows of unbuilt commands are marked *Not built* rather than given an invented grammar, as the Notes proposed.
  `test/docs/x-cli-cmds.test.ts` derives the expected spelling from the program, so the next shipped command cannot
  drift unnoticed.
