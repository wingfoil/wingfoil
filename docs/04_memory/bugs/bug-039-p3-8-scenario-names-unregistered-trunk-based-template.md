---
id: "bug-039-p3-8-scenario-names-unregistered-trunk-based-template"
type: bug
title: "BDD P3.8 Scenario 2 selects a \"Trunk-Based\" init template that does not exist (only Scrum and Kanban are registered; Trunk-Based is P4.18)"
status: triaged
severity: "low"
release-origin: "v0.2"
release: "v0.4"
feature: "P3.8"
contributor: ""
credit: ""
tmpl_version: 260703
---

## Summary

`P3.8-builtin-directive-templates.feature`, Scenario "Built-in templates are selected by methodology",
is written against a methodology `wingfoil init` cannot select. The acceptance contract of a `minor-v0.2`
feature (P3.8) depends on a reference template that belongs to P4.18, a later feature.

## Steps to Reproduce

1. `sed -n 14-17p docs/02_requirements/02_bdd/features/p3-directives/P3.8-builtin-directive-templates.feature`
   → `Given the selected methodology is "Trunk-Based"` / `When initialization completes` /
   `Then the 6 built-in templates are installed and available for assignment`.
2. On `main` (`8a6a091`): `src/storage/templates.ts:54` —
   `export const TEMPLATE_NAMES = TEMPLATES.map((t) => t.name)`; the `TEMPLATES` array has exactly two
   entries, `name: 'Scrum'` and `name: 'Kanban'` (`src/storage/templates.ts:35` and `:43`).
3. `grep -rn Trunk docs/02_requirements/02_bdd/features` → only this scenario and
   `p4-workflow/P4.18-reference-workflow-templates.feature:3,18` (the reference workflow templates,
   Scrum/Kanban/Lean Inception/Trunk-Based/Custom).
4. Scheduling: `docs/04_memory/planning/rl-v1/minor-v0.2.md:8` lists `P3.8` among its features;
   `grep -ln P4.18 docs/self/docs/04_memory/planning/rl-v1/*.md` → `minor-v0.3.md`.

## Expected Behavior

Every scenario of a feature scheduled in a release is executable against that release's product.

## Actual Behavior

Scenario 2 cannot be run literally in v0.2. `task-057-builtin-directive-templates` had to reinterpret it
(`git show 9b77243:docs/self/docs/04_memory/v0.2/task-057-builtin-directive-templates.md`, AC2 at line
118: implemented as "for every registered template", noting "`Trunk-Based` is not a registered init
template (`TEMPLATE_NAMES` = Scrum, Kanban) → proposed element").

## Notes

- The scenario's intent is clear — the six built-ins are installed **independently** of the chosen
  methodology — and `task-057`'s "every registered template" reading captures it.
- **Fix options, for triage:** (1) reword the scenario to "for every registered methodology template"
  (or name `Kanban`), so it is executable now; (2) keep "Trunk-Based" and mark the scenario as deferred
  until P4.18. Option 1 matches what `task-057` implements.
- BDD files are acceptance contracts; editing one is a requirements change the approver makes.

## Triage & Execution Notes

- capture: raised by the implementation of `task-057-builtin-directive-templates` (Wave 2, 2026-09-17),
  filed under `bug-ingest-rel-v0.2-wave2-review-findings-plan`.
