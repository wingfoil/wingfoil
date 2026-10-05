---
id: "bug-028-mcp-command-missing-from-cli-specs"
type: bug
title: "The shipped `wingfoil mcp` command is missing from the CLI command surface in spec-005, spec-006 §3 and spec-008 §1"
status: closed
severity: "low"
release-origin: "v0.2"
release: "v0.3"
feature: "P5.2.1"
contributor: ""
credit: ""
tmpl_version: 260703
---

## Summary

`wingfoil mcp` has shipped since `task-030` (`486c67b`), is wired in `src/cli/program.ts:111`, and is
specified on its own in `spec-014-mcp-server-entry-point` §1 — but the three specs that enumerate the
CLI's command surface do not list it: `spec-006` §3's bootstrap table, `spec-008` §1's flat-command
list and `spec-005`'s Context all name only `init`, `paths` and `audit`.

## Steps to Reproduce

1. `grep -n "command('init')\|command('mcp')" src/cli/program.ts` on `main` (`8a6a091`) →
   `85: .command('init')` and `111: .command('mcp')`.
2. `grep -n -w mcp docs/self/docs/04_memory/design/specs/spec-00{5,6,8}*.md | grep -v 'src/mcp\|mcp-server'`
   → the only hit is `spec-006:120`, the "MCP naming" note; no row, noun or flat command named `mcp`.
3. `sed -n 176,181p docs/self/docs/04_memory/design/specs/spec-006-core-domain-api.md` — the
   "Project bootstrap & audit" table has rows `projectInit` (`wingfoil init`) and `projectAudit`
   (`wingfoil audit`) and nothing for `wingfoil mcp`.
4. `sed -n 32,37p docs/self/docs/04_memory/design/specs/spec-008-cli-grammar.md` — both the grammar
   comment (`# flat command, e.g. init, paths, audit`) and the `<noun>` bullet (`a flat command (init,
   paths, audit)`) omit `mcp`.
5. `sed -n 12,13p docs/self/docs/04_memory/design/specs/spec-005-cli-command-contract.md` — "flat
   command (`init`, `audit`, `paths`)".

## Expected Behavior

A reader of the CLI grammar and command specs finds every command the binary accepts, with a pointer
to the spec that defines the ones outside `CORE_MODULES` — for `mcp`, `spec-014` §1.

## Actual Behavior

`mcp` is visible only in `spec-014` and in the code. The omission was noticed while implementing
`dl-041` (`ebfb1e3`), which edited exactly these tables and lists and left `mcp` out because its scope
was the `module` column.

## Notes

- **The `spec-006` §3 half depends on `dl-046`.** How §3 represents commands that are not a
  `CoreModule` (today `projectInit`'s row carries an MCP column of `Tool project.init`, which no code
  can derive) is the question `dl-046` raises; an `mcp` row should follow whatever that decides.
  `spec-008` §1 and `spec-005` are independent of it: adding `mcp` to their flat-command lists is a
  one-word edit each.
- `mcp` is not an MCP-exposed operation (`spec-014` §1: starting the server "is not itself an
  MCP-exposed operation"), so a §3 row must say so rather than invent a Tool/Resource name.
- Tech-specs carry no `version:` field (see `dl-047`); follow the dated "Revision" note precedent
  `ebfb1e3` used for the same two specs.

## Triage & Execution Notes

- capture: raised during the `dl-041` implementation (Wave 2, 2026-09-17), filed under
  `bug-ingest-rel-v0.2-wave2-review-findings-plan`. Severity `low`: documentation only, no behaviour
  affected.
