---
id: "bug-152-read-commands-print-json-by-default"
type: bug
title: "The default `console` output format falls back to pretty-printed JSON for every read command, so a human running a command with no `--format` sees JSON either way"
status: in-progress
severity: "low"
release-origin: "v0.2"
release: "v0.3"
feature: "P2.5"
contributor: ""
credit: ""
tmpl_version: 260703
---

## Summary

`--format`'s default value is `console` (`grep -n "option('--format" src/cli/program.ts` →
`.option('--format <format>', 'output format (console|json|yaml)', 'console')`), and P2.5's own
feature description lists `console` as a format distinct from `json`. But `renderSuccess`
(`src/cli/output.ts`) implements `console` as a synonym for pretty-printed JSON — `wingfoil paths`
run with no `--format` at all produces the same shape of output as `wingfoil paths --format json`
would with indentation, not a human-oriented rendering.

## Steps to Reproduce

Reproduced against `wingfoil@0.2.1`, a fresh project:

1. `wingfoil paths` (no `--format`, so the documented `console` default applies) →
   ```
   {
     "sources": [],
     "tests": [],
     "docs": [],
     "config": [
       ".wingfoil"
     ],
     "governance": []
   }
   ```
2. `sed -n '14,26p' src/cli/output.ts`:
   ```ts
   export function renderSuccess(value: unknown, format: OutputFormat): string {
     if (format === 'json') return JSON.stringify(value) + '\n';
     if (format === 'yaml') return yamlDump(value);
     return JSON.stringify(value, null, 2) + '\n';
   }
   ```
   — the `console` branch (the final `return`) is pretty-printed JSON, differing from `--format json`
   only in indentation, not in kind. The module's own doc-comment says so directly: "`console` falls
   back to pretty-printed JSON, the same structure as `json`/`yaml`, until a command-specific spec
   defines a human-facing rendering."

## Expected Behavior

Per P2.5's own feature description (three distinct formats: console/json/yaml), a human running a
read command with no `--format` sees an actual human-oriented rendering, not the same JSON structure
with different whitespace.

## Actual Behavior

Every read command's `console`-format output is JSON; the only visible difference from
`--format json` is pretty-printing.

## Notes

- Root cause: this is a stated, deliberate interim placeholder, not a hidden defect — `output.ts`'s
  own doc-comment records that no command-specific spec has yet defined what a human-facing `console`
  rendering should look like for the read-only pillar queries that shipped first (task-006's
  Execution Notes are cited directly in the source comment).
- This is a genuine behaviour change, not a one-line fix: today's unflagged output is relied on,
  structurally, by anything already parsing it as JSON, so the retrospective schedules the real
  human-readable rendering for v0.3 rather than a patch release, with `--format json` staying
  available and unchanged for callers that want the structured form explicitly.
- Fix: define each read command's actual `console` rendering (a spec-005 extension, per command),
  and change `renderSuccess`'s `console` branch to use it instead of falling back to JSON.

## Triage & Execution Notes

- capture: filed by the v0.2 retrospective (retro-v0.2); reproduced independently against `wingfoil
  paths` on a fresh scaffold, and confirmed as a stated (not silent) placeholder in `src/cli/output.ts`'s
  own doc-comment.
