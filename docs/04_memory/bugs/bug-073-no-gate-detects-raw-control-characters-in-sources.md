---
id: "bug-073-no-gate-detects-raw-control-characters-in-sources"
type: bug
title: "No gate detects a raw control character in a tracked text file: lint, both typechecks and the full suite all pass with a NUL byte embedded in a TypeScript source"
status: closed
severity: "medium"
release-origin: "v0.2"
release: "v0.3"
feature: ""
contributor: ""
credit: ""
tmpl_version: 260703
---

## Summary

A raw NUL byte was embedded in `src/memory/git-log.ts` when an editing tool resolved a unicode escape
into the character it denotes. Everything compiled, `eslint` passed, both typechecks passed and the
full Jest suite passed. The only symptom anywhere was `git diff` reporting the file as binary
(`Bin 5521 -> 5502 bytes`). No gate in this repository looks at the bytes of a tracked text file.

## Steps to Reproduce

Demonstrated twice — once accidentally during `task-086-fix-reason-control-chars-history-forgery`, and
once deliberately by its reviewer, who re-injected a raw NUL as the delimiter and ran the gates:

- `npm run lint` → exit 0
- `npx tsc --noEmit -p tsconfig.json` → exit 0
- the framing suite → 16 passed

and `git diff` reporting `Bin`, which is the whole of the detection available today.

A sweep of all 643 tracked files finds none containing a raw NUL at present, so this is a missing
guard rather than a live contamination.

## Expected Behavior

A tracked text file containing a raw control character fails a gate, naming the file. The repository
already has the shape for this: `test/lint/` holds repository-wide meta-gates, including the one that
enforces `lint.clean`.

## Actual Behavior

Nothing detects it. A file can become binary-as-far-as-git-is-concerned and pass every check.

## Notes

The concrete cost is already recorded in this repository's history and is permanent: three commits on
`task-086`'s branch are stored as `Bin` diffs, so the *how* of that change cannot be read in
`git log -p` for those commits — the audit trail is degraded for exactly the file whose subject is
the integrity of the audit trail.

The general risk is wider than a diff becoming unreadable. A control character in a source file is
invisible in every editor and most review tools, which makes it a natural hiding place: `bug-050` is
the demonstration that an invisible character in text this repository handles can change what a
program does. A guard here is cheap and its absence is what made the incident survivable only by
accident.

Scope worth settling at triage rather than assuming: which characters (NUL alone, all C0 except tab,
newline and carriage return, or the C1 range too), and which files (tracked text files, or everything
outside an allowlist for genuine binaries like images). The narrow version — NUL in any tracked file
whose path is not allowlisted — is a few lines and closes the observed incident.

Related: `dl-078-should-reason-refuse-c0-control-characters` asks a neighbouring question about
control characters as *user input*. This bug is about control characters in *our own sources*; they
share a cause and nothing else, and neither answers the other.

## Triage & Execution Notes

- triage (2026-09-22): **medium**. Nothing is contaminated today and the sweep is clean, so this is a
  missing guard rather than a defect in the product. It is not low because the incident already
  happened once, was caught by accident, and left a permanent mark in the history.
- No fix task filed: a `test/lint/` guard in the established shape, sized by the scope question above.
  Natural v0.3 item unless the approver wants it sooner.
