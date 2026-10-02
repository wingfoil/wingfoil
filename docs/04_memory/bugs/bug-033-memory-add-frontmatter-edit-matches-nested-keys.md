---
id: "bug-033-memory-add-frontmatter-edit-matches-nested-keys"
type: bug
title: "`memory add`'s private frontmatter setter edits indented (nested) keys and strips inline comments"
status: in-progress
severity: "low"
release-origin: "v0.2"
release: "v0.3"
feature: "P1.3"
contributor: ""
credit: ""
tmpl_version: 260703
---

## Summary

`src/memory/add.ts` fills the scaffold with a private `setFrontmatterField` (line 102, since
`task-020`, `eb5f41d`) whose pattern `^([ \t]*)<key>:.*$` (1) matches the **first** line carrying the
key at **any indentation**, so a nested key can be edited instead of the top-level one, and (2) replaces
the whole line, dropping the template's inline `# …` comment. `task-045` wrote a second, stricter
helper (`src/memory/frontmatter-edit.ts`, top-level keys only, comment preserved) for the transition
verbs, so the two write paths now disagree on the same operation.

## Steps to Reproduce

On `main` (`8a6a091`), against the built `dist/memory/add.js`:

1. Nested key — a scaffold with a nested `title:` above the top-level one:
   ```
   node -e "const {renderAddDocument}=require('./dist/memory/add.js');
   console.log(renderAddDocument('---\nid: \"{auto}\"   # auto-generated\nmeta:\n  title: nested-keep-me\ntitle: \"\"   # REQUIRED\nstatus: draft  # auto-set\n---\n\nbody\n',{id:'task-001-x',title:'X'}))"
   ```
   → output frontmatter:
   ```
   id: task-001-x
   meta:
     title: "X"
   title: ""   # REQUIRED
   status: draft
   ```
   The nested `meta.title` was overwritten, the top-level `title` stayed empty, and the `id`/`status`
   comments were removed.
2. Comments — this repository's own bug template:
   `renderAddDocument(readFileSync('docs/self/.wingfoil/memory/templates/bug.md','utf8'), {id:'bug-999-x', title:'X'})`
   → `id: bug-999-x`, `title: "X"`, `status: draft` with their `# …` comments gone, while the untouched
   `severity: ""           # REQUIRED — critical | high | medium | low` keeps its comment.

## Expected Behavior

`memory add` edits only top-level keys and keeps each edited line's trailing comment — as the
function's own TSDoc states as its intent (`src/memory/add.ts:97-99`: "preserving the scaffold's
ordering, comments and other fields verbatim", although the same sentence documents the
`^<indent>key:` pattern that defeats it), and as the scaffolds themselves state (a fresh project's
`.wingfoil/memory/templates/task.md` body: "`wingfoil memory add` copies this scaffold verbatim") — the same behaviour `task-045`'s helper implements
(`git show 7bfa835:src/memory/frontmatter-edit.ts`, lines 1-13: "Only **top-level** keys (column 0)
are matched … a trailing `# comment` on the edited line is kept").

## Actual Behavior

Nested keys can be silently mis-edited, and inline comments on `id`/`title`/`status`/`tags` are
stripped on every `memory add`.

## Notes

- **Impact is narrow today.** The templates `wingfoil init` scaffolds carry no inline comments and no
  nesting (`head -6 .wingfoil/memory/templates/task.md` in a fresh project → bare `id: ""`,
  `type: task`, `title: ""`, `status: draft`), so defaults are unaffected. It bites customised
  templates — including this repository's own (`.wingfoil/memory/templates/*.md` all carry
  inline comments) once `memory add` is dogfooded.
- **Suggested fix:** once `task-045` merges, route `renderAddDocument` through
  `src/memory/frontmatter-edit.ts`'s `setFrontmatterField` and delete the private copy, with a
  regression test for both cases above.
- Related: `bug-004` (closed — the same comment-stripping class, for `dna set`).

## Triage & Execution Notes

- capture: raised during the implementation of `task-045-memory-submit` (Wave 2, 2026-09-17), filed
  under `bug-ingest-rel-v0.2-wave2-review-findings-plan`. Severity `low`: only customised templates
  are affected.
