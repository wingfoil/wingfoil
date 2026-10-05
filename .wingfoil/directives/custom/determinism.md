---
id: determinism
name: "Determinism discipline (North Star)"
type: directive
kind: custom
title: "Determinism discipline (North Star)"
tags: [custom, determinism, north-star]
ref: [REQ-SYS-07, REQ-STATE-09]
---

# Directive — Determinism discipline (North Star)

Custom WingFoil rule. Applies especially to developers and architects.

- Optimize for the Determinism Index, which is composite (`dl-131-determinism-index-scope`,
  Decision 3) and promises each component only as far as its controller allows:
  - **I — Input** is guaranteed by WingFoil: identical inputs (specs + config + project state) yield
    an identical agent execution context, verified by tests (REQ-SYS-07, REQ-STATE-09).
  - **P — Process conformance** is to be measured on every run: well-formed `wf()` commits, legal
    transitions, each phase's `produces:` present, the traceability chain complete. Today only the
    first two are measured, by `scripts/check-governance.cjs` (`npm run check:governance`,
    `task-167`); `produces:` presence and traceability completeness have no measure yet
    (`dl-131` Action 7).
  - **O — Outcome equivalence** — behaviourally equivalent software from two independent runs — is
    reported, never promised: it depends on the agent and model, which WingFoil does not choose.

  Never write "substantially equivalent software" as something WingFoil guarantees; it is the goal
  the Index measures.
- Context assembly must be deterministic — no wall-clock, randomness, or unordered iteration in
  context-building paths (REQ-SYS-07, REQ-STATE-09).
- Prefer explicit, declared configuration over implicit/inferred behavior.
- When two designs are equally good, choose the one that is more reproducible.

> Rationale: determinism is the product's reason to exist; the harness must embody it.
