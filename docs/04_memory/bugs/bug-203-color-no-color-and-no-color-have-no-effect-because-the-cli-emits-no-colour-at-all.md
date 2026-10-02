---
id: bug-203-color-no-color-and-no-color-have-no-effect-because-the-cli-emits-no-colour-at-all
type: bug
title: "--color, --no-color and NO_COLOR have no effect because the CLI emits no colour at all"
status: open
severity: "low"           # REQUIRED — critical | high | medium | low
release-origin: "v0.3"     # optional — release where the bug was FOUND (dl-016), e.g. "v0.1"
release: ""            # optional — fix/implementation release, stamped by release-planning/build-backlog (dl-016)
feature: "P5.1.4"            # optional — related feature ID, e.g. "P1.6"
contributor: ""        # optional — who originated this contribution, if not the git author (dl-020); credited for AI-generated work derived from it
credit: ""             # optional — free-text credit note (dl-020)
tmpl_version: 260703   # Orignal template version
tags: ["v0.3"]
---

## Summary

`spec-008` §2 declares `--color` a negatable flag, default `true`, that writes ANSI colour on stdout, and says colour is also disabled when `NO_COLOR` is set to a non-empty string (§3 shows the `colorEnabled = opts.color && !isNoColorEnvSet()` pattern). The CLI registers `--no-color` (`src/cli/program.ts:143`), but nothing reads `opts.color` or `NO_COLOR`, and nothing in `src/` writes an escape sequence. Both flags are accepted and change nothing, and the `NO_COLOR` rule is unimplemented.

## Steps to Reproduce

1. `grep -rn NO_COLOR src` → no output.
2. `grep -rn 'x1b' src` → no output (no ANSI escape anywhere in `src/`).
3. `grep -rn "opts.*color\|\.color\b" src` → no output; the only hit for the flag is the registration, `src/cli/program.ts:143: .option('--no-color', 'disable ANSI colors')`.
4. `node dist/cli.js dna show > a.txt; node dist/cli.js --no-color dna show > b.txt; cmp a.txt b.txt && echo identical; grep -c $'\x1b' a.txt` → `identical`, `0`.

## Expected Behavior

Either the CLI honours `spec-008` §2–§3 (colour on a console stdout, off under `--no-color` or a non-empty `NO_COLOR`), or `spec-008` and the `--help` text say that no output is coloured yet and the flag is accepted for forward compatibility.

## Actual Behavior

`--color`/`--no-color` are no-ops and `NO_COLOR` is never read; `spec-008` describes behaviour that does not exist. `task-151`'s name check lists `NO_COLOR` in `spec-008` as `UNTRIAGED` (`test/docs/name-resolvability.allowlist.ts`).

## Notes

- Found by `task-151`'s independent reviewer.
- Related: `bug-152` (`planned`, `task-156`) — `--format console` falls back to JSON while `spec-008` §2 promises colour and `✓/⚠/✗`. The rendering itself is `dl-043`, deferred to v0.4. Whatever `task-156` declares about the console fallback can declare the colour flags in the same edit.

## Triage & Execution Notes

Captured on 2026-10-02 by `bug-ingest-rel-v0.3-w1b4-review-findings-plan`, from the independent reviews of wave 1
batch B4 (`dev-loop-rel-v0.3-plan`), against `main` at `243f8f05` (B4 merges up to `ea637c43`).
