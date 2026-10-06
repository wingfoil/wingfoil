---
id: "bug-040-builtin-directive-docs-stale-after-task-057"
type: bug
title: "Documentation that says the P3.8 built-in directive templates are \"not yet implemented\" becomes stale when task-057 merges"
status: closed
severity: "low"
release-origin: "v0.2"
release: "v0.3"
feature: "P3.8"
contributor: ""
credit: ""
tmpl_version: 260703
---

## Summary

`task-057-builtin-directive-templates` (branch `task/task-057-builtin-directive-templates`, `9b77243`,
not merged) makes `wingfoil init` install the six P3.8 templates into `.wingfoil/directives/built-in/`.
Several documents describe the templates as not implemented, or `built-in/` as reserved for content that
does not exist yet. **They are accurate on `main` today and become stale at the moment `task-057`
merges.** This bug is filed now so that the correction is scheduled with, or right after, that merge.

## Steps to Reproduce

All on `main` (`8a6a091`) unless stated; each statement is true today and false once `task-057` ships:

1. `spec-011-storage-layout` (`approved`), `sed -n 112-113p` — `built-in/` is "reserved for the official
   P3.8 directive templates shipped by the `wingfoil` npm package once implemented. Today it contains only
   `.gitkeep` (empty)"; and `:43-44` — "Official P3.8 templates; EMPTY today (only a .gitkeep) — not yet
   implemented".
2. The dogfood directives: `grep -rn 'not yet implemented' docs/self/.wingfoil` →
   `roles.yaml:3` ("WingFoil's official built-in templates (P3.8) are not yet implemented"), the
   "Stand-in custom directive … not yet implemented" note in each of the six P3.8 stand-ins
   (`custom/architecture.md`, `code-quality.md`, `code-review.md`, `documentation.md`, `security.md`,
   `testing.md`; e.g. `custom/security.md:15`).
3. The repository's agent-orientation file (§3) says the stand-ins live in `custom/` "until the tool
   ships them".
4. `task-057` itself confirms the scope and what it left: `git show 9b77243:docs/self/docs/04_memory/v0.2/task-057-builtin-directive-templates.md`,
   lines 98-99 ("spec-011's *text* is stale on this point ('EMPTY today' …) → reported as a proposed
   element") and 206-207 (`src/core/builtin-asset.ts:8` "still says '(empty today, `.gitkeep` only)'").
   `git diff --stat main...9b77243` touches no spec and nothing under `docs/self/.wingfoil/`.

## Expected Behavior

After `task-057` merges, documentation distinguishes two facts that are currently worded as one: the
P3.8 templates **are** shipped by the tool and installed by `init`; this repository's own dogfood tree
(`.wingfoil/directives/built-in/`) still has none, because moving the dogfood config onto the
tool-managed layout is a separate, open intention.

## Actual Behavior

The texts above state that the templates are not implemented.

## Notes

- **What stays true after the merge — do not "fix" it:** the dogfood `.wingfoil/directives/built-in/`
  remains empty (`.gitkeep` only), and the stand-ins remain in `custom/`. `task-057` judged
  `src/core/builtin-asset.ts:8` still accurate on that reading ("it paraphrases spec-011's description of
  the dogfood tree"); the corrections are about the "not implemented / once implemented" clauses.
- `spec-011`'s separate claim that `roles.yaml` binds by directive **name** is wrong **today**,
  independently of `task-057`; it is tracked as `dl-060`, not here.
- The agent-orientation file has no owning gate (`dl-025`, `bug-008`); its line is listed for
  completeness, and its correction follows whatever that ownership decision settles.
- **Owner, for triage:** cheapest inside `task-057` before its approval (it is the change that makes the
  text stale, and its notes already enumerate the places), otherwise a follow-up documentation task.
  Tech-specs carry no `version:` (`dl-047`); record the `spec-011` edit as a dated Revision note.

## Triage & Execution Notes

- capture: raised by the implementation of `task-057-builtin-directive-templates` (Wave 2, 2026-09-17),
  filed under `bug-ingest-rel-v0.2-wave2-review-findings-plan`. Severity `low`: documentation only.

- **2026-10-01 (`task-133`'s independent review).** Since `task-133` bound `security` globally, the
  stand-in `.wingfoil/directives/custom/security.md` reaches every role's context in this
  repository, together with its stale stand-in note saying the built-in P3.8 templates are not yet
  implemented. That raises this bug's visibility. The fix is unchanged: `task-188`.
