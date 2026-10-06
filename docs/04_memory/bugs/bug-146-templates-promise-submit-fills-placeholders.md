---
id: "bug-146-templates-promise-submit-fills-placeholders"
type: bug
title: "Every scaffolded Memory template claims `memory submit` \"replaces these placeholder comments with real content\"; `submit` only changes `status:`/`rejection_reason` and leaves the body untouched"
status: in-progress
severity: "low"
release-origin: "v0.2"
release: "v0.3"
feature: "P1.6"
contributor: ""
credit: ""
tmpl_version: 260703
---

## Summary

Every one of the nine `.wingfoil/memory/templates/*.md` scaffolds carries a body comment reading
"`wingfoil memory add` copies this scaffold verbatim; `memory submit` replaces these placeholder
comments with real content and fills the required frontmatter fields." `memory submit`'s actual
implementation does neither: it moves `status:` forward and removes `rejection_reason`, and nothing
else.

## Steps to Reproduce

Reproduced against `wingfoil@0.2.1`, fresh project (`init --template Kanban`):

1. `grep -n "replaces" .wingfoil/memory/templates/bug.md` →
   ```
   <!-- bug body. `wingfoil memory add` copies this scaffold verbatim; `memory submit` replaces
        these placeholder comments with real content and fills the required frontmatter fields. -->
   ```
   — present verbatim in all nine templates (`grep -rl "replaces" .wingfoil/memory/templates/`).
2. `wingfoil memory add --type bug --title "repro placeholder bug"` → writes
   `docs/memory/bug/bug-001-repro-placeholder-bug.md` with the placeholder comment intact and
   `status: draft`.
3. Hand-set the one other required field (`severity: "low"`) and run
   `wingfoil memory submit bug-001-repro-placeholder-bug` → `{"id":"...","from":"draft","to":"pending"}`.
4. `cat docs/memory/bug/bug-001-repro-placeholder-bug.md` after submit: the placeholder comment
   (`<!-- bug body. ... -->`) is byte-for-byte unchanged; only `status:` moved from `draft` to
   `pending`.
5. `grep -n "removeFrontmatterField\|setFrontmatterField" src/memory/submit.ts` — `renderSubmitDocument`
   calls exactly these two functions and nothing that touches the body.

## Expected Behavior

Either `submit` fills required frontmatter fields and strips placeholder comments as the scaffold's
own text promises, or the scaffold text is corrected to describe what `submit` actually does (moves
`status:` forward after the author has already filled in the required fields and body by hand).

## Actual Behavior

The scaffold's self-description does not match `submit`'s implementation, for every element type
that ships a template.

## Notes

- Root cause: the template wording (`.wingfoil/memory/templates/*.md` and the equivalent
  scaffold `wingfoil init` writes) was authored aspirationally, ahead of `memory.submit`'s actual
  scope (spec-010's "field-write ownership": `submit` owns only `status`/`rejection_reason`), and
  never reconciled once the verb shipped.
- Gate: neither `user-docs` nor `dev-loop`'s doc-coverage gate checks the scaffold templates
  themselves against `submit`'s behaviour — those gates check WingFoil's own user-facing docs, not
  the scaffold text that ships to every consumer project — so this mismatch was never caught.
- Fix: rewrite the comment to state what `submit` actually does, e.g. "fill in the required
  frontmatter fields and replace this placeholder with real content **before** running
  `wingfoil memory submit`, which then moves `status` forward."

## Triage & Execution Notes

- capture: filed by the v0.2 retrospective (retro-v0.2); reproduced independently end to end
  (`memory add` → `memory submit`) rather than relying solely on reading the source.
