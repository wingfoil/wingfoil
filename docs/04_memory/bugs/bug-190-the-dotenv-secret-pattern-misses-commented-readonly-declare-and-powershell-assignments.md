---
id: bug-190-the-dotenv-secret-pattern-misses-commented-readonly-declare-and-powershell-assignments
type: bug
title: "The dotenv secret pattern misses commented, readonly, declare and PowerShell assignments"
status: closed
severity: "low"           # REQUIRED — critical | high | medium | low
release-origin: "v0.3"     # optional — release where the bug was FOUND (dl-016), e.g. "v0.1"
release: "v0.3"            # optional — fix/implementation release, stamped by release-planning/build-backlog (dl-016)
feature: "P5.4"            # optional — related feature ID, e.g. "P1.6"
contributor: ""        # optional — who originated this contribution, if not the git author (dl-020); credited for AI-generated work derived from it
credit: ""             # optional — free-text credit note (dl-020)
tmpl_version: 260703   # Orignal template version
tags: ["v0.3"]
---

## Summary

After `task-135` the `dotenv-style-secret-line` pattern (`spec-007` §2) accepts leading whitespace, `export` and a list marker, but not other common credential-line shapes.

## Steps to Reproduce

1. `npm run build`.
2. For each of `# TOKEN=abcdef123`, `- export TOKEN=abcdef123`, `readonly API_KEY=abcdef123`, `$env:API_TOKEN="abcdef123"`: `node -e "const {scanText}=require('./dist/validation'); console.log(scanText(LINE + '\\n','x.txt').blocking.length)"`.

## Expected Behavior

Each is a blocking finding, or `spec-007` states that it is out of scope and why.

## Actual Behavior

Each prints `0` (re-run on `main` on 2026-10-02). The commented `.env` line is a common real leak shape.

## Notes

- Found by `task-135`'s independent reviewer.
- Widening the prefix list also widens the false positives `task-135` documented (indented code assignments).

## Triage & Execution Notes

Captured on 2026-10-02 by `bug-ingest-rel-v0.3-w1b2-review-findings-plan`, from the independent reviews of wave 1
batch B2 (`dev-loop-rel-v0.3-plan`).
