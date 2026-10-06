---
id: code-quality
name: "Code Quality"
type: directive
kind: custom
title: "Code Quality"
tags: [custom, code-quality, typescript]
ref: [P3.8]
---

# Directive — Code Quality

Custom stand-in directive (TypeScript / Node.js). Applies to anyone writing code.

> **Stand-in custom directive.** WingFoil ships its official built-in P3.8 templates, and
> `wingfoil init` installs them under `.wingfoil/directives/built-in/` (task-057). This repository's
> hand-authored configuration predates them, so this generic rule (adapted to the project
> methodology/tech-stack in `dna.yaml`) is kept here as `custom`; `ref: [P3.8]` names the built-in
> template it stands in for. Reconciling the stand-ins with the shipped templates is out of scope of
> bug-040, which corrected this note, and is not scheduled.

- Lint clean: no errors; warnings triaged before merge. Gate (`dl-034`, `dl-120` D5): the
  `dev-loop` `refactor` phase's `checks.post` entry `lint.clean`, run as `npm run lint` and asserted
  by `test/lint/lint-clean.test.ts`.
- Respect complexity limits; prefer small, single-responsibility functions.
- No dead code, no commented-out blocks, no `any` without justification (TypeScript).
- Match surrounding code style, naming, and idioms.
- All public APIs typed; validate external input with Zod at boundaries.
- Use conventional commit messages; every state change is a single git commit carrying author +
  timestamp (REQ-SEC-02). Relocated here from the former `dna.yaml`
  `conventions.process.commits`.

> Source: Features §P3.8 (Code Quality). Auto-installed for the TS/Node tech stack.
