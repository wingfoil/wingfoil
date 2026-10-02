---
id: "bug-158-date-and-author-id-tokens-are-declared-but-not-implemented"
type: bug
title: "The `{date}` and `{author}` id tokens that `spec-001` declares are not implemented: `memory add` fails on them, and `--set` refuses them with a message saying the command fills them itself"
status: in-progress
severity: "low"
release-origin: "v0.2.2"
release: "v0.3"
feature: "P1.3"
contributor: ""        # optional — who originated this contribution, if not the git author (dl-020); credited for AI-generated work derived from it
credit: ""             # optional — free-text credit note (dl-020)
tmpl_version: 260703   # Orignal template version
---

## Summary

`spec-001`'s token table declares `{date}` (current date `YYYYMMDD`, UTC, system clock) and
`{author}` (slug-normalized git `user.name`), first in the fixed expansion order (lines 145–149).
`memory add` implements neither. `expandFieldTokens` leaves them in place as "not-yet-implemented"
(`src/memory/add.ts:236–240`), and nothing expands them later. A type whose `id_pattern` uses one
cannot create any element.

## Steps to Reproduce

1. Build `main` at `1087c166`.
2. In a scratch repository with a committed `.wingfoil/`, set the `bug` type's
   `id_pattern: "bug-{date}-{slug}"` and commit.
3. Run `memory add --type bug --title "x"`.
4. Run `memory add --type bug --title "y" --set date=20260929`.

## Expected Behavior

Step 3 creates `bug-20260929-x` (on that date), as `spec-001` declares. Or, if the tokens are not
to be supported yet, `spec-001` marks them as reserved and not implemented, and a `memory.yaml` that
uses them is refused at load time.

## Actual Behavior

- Step 3: `error: missing value for token {date}`, exit 1. The message does not say the token is
  unimplemented.
- Step 4: `error: invalid flag value: --set cannot set "date": memory add fills it itself or through
  its own option`, exit 2. That claim is false: nothing fills it.

Both run on 2026-09-29 in the session scratchpad.

## Notes

- Found at `task-110`'s review (2026-09-29). The gap predates `task-110`, which reserved the two
  names in `--set` without implementing them. The approver ruled it a bug.
- No `memory.yaml` in this repository or in `init`'s scaffold uses either token today, which is why
  the severity is low.
- `{date}` reads the wall clock. Implementing it must respect the `determinism` directive's rules on
  wall-clock reads.

## Triage & Execution Notes

<!-- triage (bug-ingest): severity call; fix: pointer to the fix task(s). -->
