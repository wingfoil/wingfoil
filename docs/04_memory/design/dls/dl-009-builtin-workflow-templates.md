---
id: dl-009-builtin-workflow-templates
type: decision-log
title: "Ship pre-built workflow templates instead of generating on-demand"
status: ready
context: scope
release: "v0.4"
tmpl_version: 260703
---

## Context

Teams starting with WingFoil need to define workflows suited to their development process. The question is whether to provide pre-made methodology templates (Scrum, Kanban, Lean Inception, Trunk-Based Development) that users customize, or to generate workflows dynamically on demand based on user input.

## Decision

Ship **pre-defined, curated workflow templates** (Scrum, Kanban, Lean Inception, Trunk-Based Development) that teams select, expand with phases and directives, and customize to match their style. Do not generate workflows dynamically.

## Rationale

Pre-built templates strike a critical balance between fast onboarding and predictability:

- **Known-good baseline:** Teams get proven, tested workflow patterns immediately, rather than unpredictable dynamically generated workflows that lack validation.
- **Determinism:** Consistent templates across teams improve reproducibility — two independent runs with the same template selection will produce substantially equivalent workflow configurations (advancing the Determinism Index per WingFoil's north star).
- **Team-specific customization:** P4.20 (Template Customization) allows teams to override defaults to match their exact style without the overhead of authoring from scratch.
- **Scaffolding cost:** Pre-built templates eliminate friction in the initialization journey (P5.1 — `wingfoil init`), directly supporting the MVP goal of reducing time to first deliverable.

Dynamically generated workflows, by contrast, would require a sophisticated inference engine and extensive parametrization — a higher implementation cost with uncertain UX quality and lower test coverage. Curated templates place the confidence bar on a smaller, more manageable surface.

## Actions

1. **Implement Template Expansion (P4.19):** Auto-generate workflow phases, directives, and Memory section scaffolds from the selected template during `wingfoil init`.
2. **Implement Template Customization (P4.20):** Provide override hooks (directives, phase ordering, state machines) so teams can adapt templates without editing YAML by hand.
3. **Validate Template Completeness:** Ensure each template includes all four pillars (Memory element types, DNA roles, Directives, Workflow phases) and passes the determinism check (identical inputs → identical outputs across runs).
