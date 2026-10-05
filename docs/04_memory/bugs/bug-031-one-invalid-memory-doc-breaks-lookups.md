---
id: "bug-031-one-invalid-memory-doc-breaks-lookups"
type: bug
title: "One Memory document with unparseable frontmatter breaks search and by-id lookup repo-wide, and the error does not name the file"
status: in-progress
severity: "low"
release-origin: "v0.2"
release: "v0.3"
feature: "P1.5"
contributor: ""
credit: ""
tmpl_version: 260703
---

## Summary

`memory search` and every by-id lookup (`findMemoryDocumentById`, used by `memory history`) parse each
Memory document's frontmatter in turn and abort on the first YAML error. A single malformed document
therefore makes queries about **other, valid** documents fail with exit 2, and the message printed
carries the YAML parser's excerpt but **not the path of the offending file** — even though that path
is captured.

## Steps to Reproduce

Reproduced on `main` (`8a6a091`) with the built CLI:

1. In a fresh git repository: `wingfoil init --template Scrum`, then
   `wingfoil memory add --type task --title 'Good task'` and `... --title 'Other task'`
   (→ `docs/memory/task/task-001-good-task.md`, `task-002-other-task.md`).
2. `wingfoil memory search task` → both documents listed, exit 0.
3. Break only the second document: replace its `title:` line with `title: "unterminated`.
4. `wingfoil memory search Good` → exit 2, stderr:
   ```
   error: unexpected end of the stream within a double quoted scalar (5:1)

    2 | type: task
    3 | title: "unterminated
    4 | status: draft
    5 |
   -----^
   ```
   `--format json` → `{"error":"unexpected end of the stream within a double quoted scalar (5:1)\n\n 2 | type: task\n …"}`;
   `--verbose` prints the same lines. None names `task-002-other-task.md`.
5. Add a third document (`memory add --title 'Third task'`, committed while the broken edit is
   stashed, then restore it) and run `wingfoil memory history task-003-third-task` → exit 2, same
   message. `memory history task-001-good-task` still succeeds — the scan is sorted and stops at the
   first match, so only ids sorting **after** the broken file are affected.

## Expected Behavior

- A query about a valid document is not failed by an unrelated malformed one — or, if a strict
  repository-wide failure is the intended contract, the error at minimum **names the file** so the
  user can fix it.
- The documented behaviour of the reader agrees with this: `loadMemoryDocumentSummary`'s TSDoc
  (`src/memory/query.ts:126-129`) says search/history "must handle documents of every type and any
  (even structurally imperfect) state, so this is a read, never a validation".

## Actual Behavior

One broken file takes down search and history for most of the repository, and the user is shown a
five-line YAML excerpt with no filename.

## Notes

- **The path is already captured and then dropped.** `loadMemoryDocumentSummary` calls
  `parseYaml(frontmatterText, absolute)` (`src/memory/query.ts:138`), which throws
  `ValidationError.yamlParse(filePath, message)` → issue `{ code: E_YAML_PARSE_ERROR, file: filePath }`
  (`src/validation/errors.ts:66-70`). `loadOrError` (`src/core/index.ts:119-131`) maps it to
  `coreErr({ code: 'VALIDATION', message, details: { issues } })`, and the CLI renders only
  `result.error.message` (`src/cli/registrar.ts:132` → `src/cli/error.ts:16-20`). That dropped
  `details` channel is the subject of `dl-055`; fixing the renderer would fix the filename half of this
  bug for free.
- **Two independent fixes, for triage:** (1) name the file in the message (via `dl-055`, or by folding
  the path into `yamlParse`'s message); (2) make the scan tolerant — skip and warn on an unparseable
  document, which is what the TSDoc above already promises.
- Out of scope, noticed while reproducing: the successful `memory history task-001-good-task` call in
  step 5 also leaked git's own `fatal: path '…' exists on disk, but not in '<initial-commit sha>'` line
  to stderr while exiting 0 (the document did not exist at the repository's first commit).

## Triage & Execution Notes

- capture: raised by the review of `task-045-memory-submit` (Wave 2, 2026-09-17), filed under
  `bug-ingest-rel-v0.2-wave2-review-findings-plan`. Severity `low`: requires a malformed document
  (hand-edited frontmatter), and the failure is loud rather than silent.
