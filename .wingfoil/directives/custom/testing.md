---
id: testing
name: "Testing"
type: directive
kind: custom
title: "Testing"
tags: [custom, testing, tdd, jest]
ref: [P3.8]
version: "1.4"   # 1.4: T5, heavy gates attached and under the machine-wide lock (task-349, dl-170 Decision 4) (prev 1.3: coverage non-regression against the integration branch's figures, release/X.Y or main (task-286, dl-159 A1.6) (prev 1.2))
---

# Directive — Testing

Custom stand-in directive. Applies to developers, QA and reviewers (`roles.yaml`; reviewers since
`dl-134` §3, task-205).

> **Stand-in custom directive.** WingFoil ships its official built-in P3.8 templates, and
> `wingfoil init` installs them under `.wingfoil/directives/built-in/` (task-057). This repository's
> hand-authored configuration predates them, so this generic rule (adapted to the project
> methodology/tech-stack in `dna.yaml`) is kept here as `custom`; `ref: [P3.8]` names the built-in
> template it stands in for. Reconciling the stand-ins with the shipped templates is out of scope of
> bug-040, which corrected this note, and is not scheduled.

- Test-first / TDD: write a failing test before the implementation (red → green → refactor).
- **Test-strategy classification (`dl-014` / T1):** at the `dev-loop` design gate, classify each
  acceptance criterion as **red-first** (behavior is new — a genuine failing test precedes the code)
  or **characterization** (behavior already exists — pin it with a test that passes on first run).
  Characterization is legitimate for verification/infra tasks; **never fabricate a red or add dead
  code to force one**. Record the per-AC classification in the task's Execution Notes.
- Maintain >80% coverage (Jest); coverage must not regress on merge. Gate (80% floor only): the
  `dev-loop` `refactor` phase's `checks.post` entry `tests.coverage(min: 80)`, run as
  `npm run test:coverage` against `jest.config.js` `coverageThreshold` (80). Non-regression is not
  asserted by any gate: it is checked by hand at `refactor`, against the integration branch's figures
  (`release/X.Y` or `main`, `git-conventions` §1; `dl-159`).
- Each behavior has at least one happy-path and one edge/error-path test (mirrors the BDD suite).
- Tests are deterministic and isolated; no reliance on external services or wall-clock/random.
- Test sources typecheck as cleanly as production sources (`dl-044`). Gate: `typecheck.clean`, the
  whole-project `tsc --noEmit` over `tsconfig.json` (src and test) and `tsconfig.build.json` (src),
  run as `npm run typecheck` and asserted by `test/lint/typecheck-clean.test.ts`, so `npm test` fails
  on a type error in either tree. `ci.yml` runs `npm run typecheck` on every push; `dev-loop`'s
  `refactor` and `release-submit`'s `pre-release-checks` declare `typecheck.clean`.

## WingFoil-specific clauses (`dl-121`, `dl-134`, `dl-170`)

The rules in this section are WingFoil's own. They are not part of the generic P3.8 template that
this stand-in mirrors. T1 and T2 were ratified in `dl-121-testing-directive-extensions` (`ready`,
Q1 (a), Q2 following `dl-120` Q1 (a)); T3 and T4 in `dl-134-dev-loop-separation-of-duties`
(`ready`, Q1 (a), Q2 (a)), placed here under `dl-121` Q2; T5 in `dl-170-cap-the-number-of-worktrees-whose-test-and-coverage-gates-run-at-the-same-time` (`ready`,
Decision 4, Q2 (C)). When this stand-in is reconciled with the
shipped built-in template, this section is kept as a `custom` rule and is not dropped with the
generic rules above.

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
- **T3 — `red` is `qa`'s, and it is black-box.** In `dev-loop`, the `red` phase is run by the `qa`
  role (`dl-134` §1, Q1 (a)). `qa` writes every acceptance test of the task, characterization tests
  included, from the Acceptance Criteria and the approved tech-specs, through the public interface
  (the CLI, the exported API), and does not read the implementation the tests constrain. A
  characterization test that fails on first run means the AC was red-first after all: it goes back
  to `design` for reclassification. An AC that cannot be turned into a test without reading the code
  goes back to `design` too.
- **T4 — `red`'s tests are frozen in `green` and `refactor`.** The files `red`'s commit touched are
  not modified in `green` or `refactor` (`dl-134` §2, Q2 (a)). If `green` finds one of those tests
  wrong, the task goes back to `red`, where `qa` fixes it. Other test files may still change, as a
  contract change legitimately updates older tests, and each such change is listed in the task's
  Execution Notes for the reviewer; `refactor`'s coverage additions are new files or files `red` did
  not touch. The reviewer checks it with `git log --first-parent --no-merges --format=%h
  <red-commit>..HEAD -- <red's test files>` (empty). It compares only the branch's own non-merge
  commits since `red`: a change brought in by an inward `Merge branch '<integration branch>' into task/…`
  commit (`main`, or `release/X.Y` on the maintenance line, `git-conventions` §1) is excluded
  (`--first-parent` never visits the integration branch's side of that merge). From v1.0 the `dev-loop` post-check `tests.unchanged(since: red)` on `green` and `refactor`
  evaluates it (P4.12); until then this rule and the reviewer do.
- **T5 — Heavy gates run attached and under the lock (`dl-170` Decision 4).** A heavy gate — the full
  suite (`npm test` with no suite filter), the coverage run (`npm run test:coverage`, `npm run test:report`), the
  production type-check or build (`npm run typecheck`, `npm run build`) — is run in the foreground, or as a
  background command its session tracks and reads to the end; it is never detached (`nohup`, `setsid`, `&` with
  `disown`, a terminal multiplexer), because a detached gate outlives the session that should read it and holds the
  machine while nobody waits for it. It is run through the npm scripts, which take the machine-wide lock of
  `scripts/heavy-gate.cjs`: one heavy gate at a time on the machine, waiting while another holds the lock and,
  outside CI, while the 1-minute load average is above the cores; the wait is reported once on stderr, naming the
  holder's pid and worktree. A gate is never started around the lock (a bare `jest`, `tsc -p tsconfig.build.json`)
  to skip the wait. An agent is resumed only after checking that its worktree has no live gate process
  (`ps -eo pid,etime,args` filtered on the worktree path, the output quoted in the notes); a live one is waited
  for, or ended, first. `dev-loop` names the lock on `green`, `refactor` and `review` (`checks.pre`
  `gate.slot-free`, evaluated from v1.0, P4.12).
- **Secret-shaped fixtures** follow `security-secrets` S1: a fixture that must match a secret pattern
  is assembled at runtime, never committed as one literal (`dl-073` Action 3, `dl-122`).

> Source: Features §P3.8 (Testing). Aligns with `dev-loop` TDD sub-workflow.
