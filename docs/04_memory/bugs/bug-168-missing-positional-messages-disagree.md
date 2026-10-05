---
id: bug-168-missing-positional-messages-disagree
type: bug
title: "The missing-operand error has two shapes: `missing required argument: memory submit <id>` for Memory and directive verbs, but `missing required argument: wingfoil dna update <path> --value <value>` for the DNA verbs"
status: in-review
severity: "low"
release-origin: "v0.2.2"
release: "v0.3"
feature: "P5.1.4"
contributor: ""
credit: ""
tmpl_version: 260703
---

## Summary

When a verb's required operand is missing, core refuses with exit 2 and a `missing required
argument:` line. For the `memory` and `directive` verbs the line names the command and the operand
(`memory submit <id>`). For the `dna` verbs it names a full usage line with the `wingfoil` prefix and
an option (`wingfoil dna update <path> --value <value>`). Two shapes for the same error make the
messages harder to read. `spec-008` §4 now fixes one form: `missing required argument: --<name>`,
plus the closed-set suffix since `task-119`.

## Steps to Reproduce

1. On `main` at `b9458ffe`, `npm run build`. In a scratch repository with `init --template Scrum`
   done, run each of: `memory submit`, `memory approve`, `memory history`, `directive remove`,
   `dna set`, `dna update`, `dna remove`, with no operand.

## Expected Behavior

One shape for every verb, stated in `spec-008` (§4 or §5), e.g. `missing required argument: <id>`
followed by the command's usage.

## Actual Behavior

Observed 2026-09-29, exit 2 in every case:
- `error: missing required argument: memory submit <id>` (and the same for `memory approve`,
  `memory history`);
- `error: missing required argument: directive remove <name>`;
- `error: missing required argument: wingfoil dna set <path> --value <value>` (and the same for
  `dna update`, `dna remove`).

## Notes

- Found at `task-120`'s review (2026-09-29). `task-120` gave every command a described `<operand>`
  in `--help` but left core's refusal messages as they were. The approver ruled it a bug.
- `task-120`'s implementer also reported that the `dna update` form names `--value` although not
  every `dna update` needs it. This was not reproduced here: `dna update project.name` without
  `--value` refuses with `--value is required at 'project.name'`. The fix task checks it per path
  kind.
- The raw `ENOENT` of `dna show`, `paths` and `memory search` in an uninitialised repository, from
  the same report, is `bug-035`'s ground and not part of this bug.

## Triage & Execution Notes

<!-- triage (bug-ingest): severity call; fix: pointer to the fix task(s). -->
