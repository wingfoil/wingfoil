# BDD Specification Suite — Index

**Module:** 2 — BDD Specification Suite
**Source:** `docs/02_requirements/01_user_story_map/` (Module 1)
**Input:** MVP-tagged user stories only
**Generated:** 2026-06-26

---

## Purpose

Translates the **[MVP]** user stories from Module 1 into deterministic system behaviors
and edge cases, expressed in Gherkin (Given-When-Then).

- **Unit:** one `.feature` file per MVP feature (`Px.y` / `X1.y`), grouped by pillar.
  The 31 additional `[MVP]` user stories in Module 1 that carry no BDD anchor
  (`_(ref: Px.y)_` marker) are **ref-marked duplicates**: they share the behavior of their
  feature and are fully covered by that feature's `.feature` file. No extra file is needed.
- **Coverage rule:** every feature has **≥1 nominal (Happy Path)** scenario and **≥1
  error/edge** scenario.
- **No ambiguous terms:** vague wording ("fast", "quickly") is replaced by quantified
  criteria (e.g., "within 1 second", "< 30 seconds"), sourced from `08_mvp-canvas.md`
  ("Metrics of Success").

## Quantified non-functional targets (from `08_mvp-canvas.md`)

| Metric            | Target used in scenarios          |
|-------------------|-----------------------------------|
| Context Load Time | < 30 seconds                      |
| DNA/Memory query  | < 1 second                        |
| Rule compliance   | 100% correct directives per role  |
| Audit trail       | every change has author+timestamp |

## Folder layout

```
02_bdd/
├── 00_index.md
└── features/
    ├── p1-memory/        (13 features)
    ├── p2-dna/           (5 features)
    ├── p3-directives/    (8 features)
    ├── p4-workflow/      (20 features)
    ├── p5-interaction/   (16 features)
    └── x1-notification/  (2 features)
```

## Feature → file → home story map

| Feature | Home story | `.feature` file                                                    |
|---------|------------|--------------------------------------------------------------------|
| P1.1    | US-0A-01   | `features/p1-memory/P1.1-git-backed-storage.feature`               |
| P1.2    | US-0A-02   | `features/p1-memory/P1.2-versioning-audit-trail.feature`           |
| P1.3    | US-4-01    | `features/p1-memory/P1.3-memory-add.feature`                       |
| P1.4    | US-0B-04   | `features/p1-memory/P1.4-memory-import.feature`                    |
| P1.5    | US-1-08    | `features/p1-memory/P1.5-memory-search.feature`                    |
| P1.6    | US-3-09    | `features/p1-memory/P1.6-memory-submit.feature`                    |
| P1.7    | US-2-10    | `features/p1-memory/P1.7-memory-approve.feature`                   |
| P1.8    | US-4-11    | `features/p1-memory/P1.8-memory-reject.feature`                    |
| P1.9    | US-5-04    | `features/p1-memory/P1.9-memory-deprecate.feature`                 |
| P1.10   | US-5-08    | `features/p1-memory/P1.10-memory-history.feature`                  |
| P1.11   | US-0A-03   | `features/p1-memory/P1.11-memory-entries.feature`                  |
| P1.12   | US-1-09    | `features/p1-memory/P1.12-keyword-search.feature`                  |
| P1.13   | US-0A-04   | `features/p1-memory/P1.13-memory-element-schema.feature`           |
| P2.1    | US-0A-08   | `features/p2-dna/P2.1-dna-set.feature`                             |
| P2.2    | US-3-03    | `features/p2-dna/P2.2-dna-show.feature`                            |
| P2.3    | US-0B-03   | `features/p2-dna/P2.3-dna-infer.feature`                           |
| P2.4    | US-0A-05   | `features/p2-dna/P2.4-project-dna-config.feature`                  |
| P2.5    | US-0A-22   | `features/p2-dna/P2.5-paths.feature`                               |
| P3.1    | US-4-02    | `features/p3-directives/P3.1-directive-create.feature`             |
| P3.2    | US-4-05    | `features/p3-directives/P3.2-directive-assign.feature`             |
| P3.3    | US-6-07    | `features/p3-directives/P3.3-directive-remove.feature`             |
| P3.4    | US-4-04    | `features/p3-directives/P3.4-directives-list.feature`              |
| P3.5    | US-4-03    | `features/p3-directives/P3.5-project-directives.feature`           |
| P3.6    | US-3-06    | `features/p3-directives/P3.6-auto-load-by-role.feature`            |
| P3.7    | US-4-06    | `features/p3-directives/P3.7-role-based-assignment.feature`        |
| P3.8    | US-0A-09   | `features/p3-directives/P3.8-builtin-directive-templates.feature`  |
| P4.1    | US-0A-15   | `features/p4-workflow/P4.1-workflow-config.feature`                |
| P4.2    | US-0A-16   | `features/p4-workflow/P4.2-workflow-start.feature`                 |
| P4.3    | US-0A-17   | `features/p4-workflow/P4.3-workflow-end.feature`                   |
| P4.4    | US-1-01    | `features/p4-workflow/P4.4-workflow-next.feature`                  |
| P4.5    | US-2-01    | `features/p4-workflow/P4.5-workflow-status.feature`                |
| P4.6    | US-0A-18   | `features/p4-workflow/P4.6-workflow-list.feature`                  |
| P4.7    | US-0A-19   | `features/p4-workflow/P4.7-workflow-show.feature`                  |
| P4.8    | US-6-02    | `features/p4-workflow/P4.8-workflow-create.feature`                |
| P4.9    | US-6-11    | `features/p4-workflow/P4.9-workflow-remove.feature`                |
| P4.10   | US-0A-20   | `features/p4-workflow/P4.10-workflow-steps.feature`                |
| P4.11   | US-4-08    | `features/p4-workflow/P4.11-deliverables.feature`                  |
| P4.12   | US-6-03    | `features/p4-workflow/P4.12-workflow-checks.feature`               |
| P4.13   | US-1-02    | `features/p4-workflow/P4.13-state-deduction.feature`               |
| P4.14   | US-4-07    | `features/p4-workflow/P4.14-approval-routing.feature`              |
| P4.15   | US-4-12    | `features/p4-workflow/P4.15-fallback-on-rejection.feature`         |
| P4.16   | US-6-04    | `features/p4-workflow/P4.16-include-composition.feature`           |
| P4.17   | US-0A-21   | `features/p4-workflow/P4.17-builtin-workflow-templates.feature`    |
| P4.18   | US-0A-10   | `features/p4-workflow/P4.18-reference-workflow-templates.feature`  |
| P4.19   | US-0A-11   | `features/p4-workflow/P4.19-template-expansion.feature`            |
| P4.20   | US-0A-12   | `features/p4-workflow/P4.20-template-customization.feature`        |
| P5.1.1  | US-0A-06   | `features/p5-interaction/P5.1.1-init.feature`                      |
| P5.1.2  | US-0B-02   | `features/p5-interaction/P5.1.2-init-infer.feature`                |
| P5.1.3  | US-0B-01   | `features/p5-interaction/P5.1.3-audit.feature`                     |
| P5.1.4  | US-0A-14   | `features/p5-interaction/P5.1.4-cli-ux.feature`                    |
| P5.2.1  | US-1-07    | `features/p5-interaction/P5.2.1-mcp-resources.feature`             |
| P5.2.2  | US-1-06    | `features/p5-interaction/P5.2.2-mcp-prompts.feature`               |
| P5.2.3  | US-2-11    | `features/p5-interaction/P5.2.3-mcp-tools.feature`                 |
| P5.3.1  | US-1-03    | `features/p5-interaction/P5.3.1-agent-execute.feature`             |
| P5.3.2  | US-2-07    | `features/p5-interaction/P5.3.2-agent-role-selection.feature`      |
| P5.3.3  | US-1-10    | `features/p5-interaction/P5.3.3-relevance-filtering.feature`       |
| P5.3.5  | —          | `features/p5-interaction/P5.3.5-agent-show.feature`                |
| P5.4.1  | US-0A-13   | `features/p5-interaction/P5.4.1-agent-role-definition.feature`     |
| P5.4.2  | US-3-07    | `features/p5-interaction/P5.4.2-role-directives-binding.feature`   |
| P5.4.3  | US-1-04    | `features/p5-interaction/P5.4.3-context-preloading.feature`        |
| P5.4.4  | US-1-05    | `features/p5-interaction/P5.4.4-execution-context.feature`         |
| P5.4.5  | US-0A-07   | `features/p5-interaction/P5.4.5-agent-assisted-wizard.feature`     |
| X1.1    | US-2-02    | `features/x1-notification/X1.1-human-needed-notifications.feature` |
| X1.2    | US-2-03    | `features/x1-notification/X1.2-notification-routing.feature`       |

---

## Module 2 validation

- [x] All 63 MVP features have a `.feature` file — **63/63 ✅**
- [x] Each file has ≥1 Happy Path scenario and ≥1 Error/Edge scenario — **✅** (190 scenarios total)
- [x] No vague performance adjectives (quantified criteria only) — **✅** (0 vague
  performance adjectives in Given/When/Then steps; the term "relevant" is not a vague
  adjective but is defined operationally by the relevance-filtering rule in feature
  **P5.3.3**)

### Verification results (2026-06-26)

| Check                                       | Result                                         |
|---------------------------------------------|------------------------------------------------|
| `.feature` files per pillar                 | P1=13, P2=5, P3=8, P4=20, P5=15, X1=2 → **63** |
| Total scenarios                             | **190**                                        |
| Files with ≥1 nominal **and** ≥1 error/edge | **63/63**                                      |
| Vague performance adjectives in steps       | **0** ("relevant" defined by P5.3.3)           |
| Files starting with `Feature:`              | **63/63**                                      |
