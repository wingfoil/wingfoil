---
id: testing
name: "Testing"
type: directive
kind: custom
title: "Testing"
tags: [custom, testing, tdd, jest]
ref: [P3.8]
---

# Directive — Testing

Custom stand-in directive. Applies to developers and QA.

> **Stand-in custom directive.** WingFoil's official built-in P3.8 templates are not yet implemented;
> until they ship, this generic rule (adapted to the project methodology/tech-stack in `dna.yaml`) is
> kept as `custom`. `ref: [P3.8]` records the built-in template it becomes once those exist.

- Test-first / TDD: write a failing test before the implementation (red → green → refactor).
- **Test-strategy classification (`dl-014` / T1):** at the `dev-loop` design gate, classify each
  acceptance criterion as **red-first** (behavior is new — a genuine failing test precedes the code)
  or **characterization** (behavior already exists — pin it with a test that passes on first run).
  Characterization is legitimate for verification/infra tasks; **never fabricate a red or add dead
  code to force one**. Record the per-AC classification in the task's Execution Notes.
- Maintain >80% coverage (Jest); coverage must not regress on merge. Gate (80% floor only): the
  `dev-loop` `refactor` phase's `checks.post` entry `tests.coverage(min: 80)`, run as
  `npm run test:coverage` against `jest.config.js` `coverageThreshold` (80). Non-regression is not
  asserted by any gate: it is checked by hand at `refactor`, against `main`'s figures.
- Each behavior has at least one happy-path and one edge/error-path test (mirrors the BDD suite).
- Tests are deterministic and isolated; no reliance on external services or wall-clock/random.
- Test sources typecheck as cleanly as production sources (`dl-044`). Gate: `typecheck.clean`, the
  whole-project `tsc --noEmit` over `tsconfig.json` (src and test) and `tsconfig.build.json` (src),
  run as `npm run typecheck` and asserted by `test/lint/typecheck-clean.test.ts`, so `npm test` fails
  on a type error in either tree. `ci.yml` runs `npm run typecheck` on every push, and
  `release-submit`'s `pre-release-checks` declares `typecheck.clean`.

## WingFoil-specific clauses (`dl-121`)

The two rules in this section are WingFoil's own. They are not part of the generic P3.8 template
that this stand-in mirrors. They were ratified in `dl-121-testing-directive-extensions` (`ready`,
Q1 (a), Q2 following `dl-120` Q1 (a)). When this stand-in is reconciled with the shipped built-in
template, this section is kept as a `custom` rule and is not dropped with the generic rules above.

- **T1 — A guard says exactly what it asserts.** The name, `describe`/`it` title, module doc, TSDoc
  and workflow `checks:` string of any test, script or gate describe what its assertions verify,
  and no more. A requirement clause, acceptance criterion or declared check that no assertion
  covers is recorded as **unasserted**: in the task's Execution Notes, and as a bug if it outlives
  the task. It is never reported as done. Narrowing the prose to match the assertions is a
  legitimate fix, and so is widening the assertions to match the prose.
- **T2 — An environment-dependent fix ships a regression check.** Some defects appear only under a
  particular tool version, OS, timezone, locale, file ownership or runner. Such a defect is fixed
  together with a check that fails if the defect's condition returns. The check asserts the
  **invariant the fix restored** (the lockfile entries, the parsed offset, the file's owner), so it
  fails in any environment the suite runs in, not only the one that broke. Its form is an invariant
  check that the normal suite runs (`dl-121` Q1 (a)), as `scripts/check-lockfile-pins.cjs` is run
  by `test/cli/check-lockfile-pins.test.ts` (`task-104`). A CI matrix across environments may be
  added later; it does not replace the invariant check.

> Source: Features §P3.8 (Testing). Aligns with `dev-loop` TDD sub-workflow.
