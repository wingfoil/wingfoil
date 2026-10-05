---
id: bug-185-a-reason-block-accepts-del-c1-controls-and-the-unicode-line-separators
type: bug
title: "A Reason block accepts DEL, C1 controls and the Unicode line separators"
status: closed
severity: "low"           # REQUIRED — critical | high | medium | low
release-origin: "v0.3"     # optional — release where the bug was FOUND (dl-016), e.g. "v0.1"
release: "v0.3"            # optional — fix/implementation release, stamped by release-planning/build-backlog (dl-016)
feature: "P1.7"            # optional — related feature ID, e.g. "P1.6"
contributor: ""        # optional — who originated this contribution, if not the git author (dl-020); credited for AI-generated work derived from it
credit: ""             # optional — free-text credit note (dl-020)
tmpl_version: 260703   # Orignal template version
tags: ["v0.3"]
---

## Summary

`task-166` refuses C0 control characters other than tab and newline in a `Reason:` block, as `dl-078` (A) ratified. DEL (U+007F), the C1 controls (e.g. CSI U+009B, NEL U+0085) and the Unicode line separator (U+2028) are still accepted. They can be just as invisible or misleading in a terminal or a log viewer.

## Steps to Reproduce

1. `npm run build`.
2. `node -e "const m=require('./dist/memory'); for (const c of ['\\x7f','\\u009b','\\u0085','\\u2028']) console.log(m.reasonRefusalMessage('ok '+c+' x'))"`. Each case prints `undefined`, meaning accepted; the same call with `\\x1b` returns the refusal.

## Expected Behavior

A decision on whether the refusal extends past C0. If it does, the same refusal names the code point.

## Actual Behavior

All four are accepted, verified on `main` after the B1 merge with the command above.

## Notes

- Found by `task-166`'s developer and independent reviewer.
- Outside `dl-078` (A)'s C0 scope, so it probably needs a decision-log (amend `dl-078`, or a new one) before a task.
- No `wf()` commit on `main` contains any of these characters (reviewer's corpus check).

## Triage & Execution Notes

Captured on 2026-10-01 by `bug-ingest-rel-v0.3-w1b1-review-findings-plan`, from the independent reviews
of wave 1 batch B1 (`dev-loop-rel-v0.3-plan`).
