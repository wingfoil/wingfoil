---
id: "task-173-add-whole-project-typecheck-clean-gate-control-character"
type: task
title: "Add the whole-project `typecheck.clean` gate and a control-character gate, and run them in CI and before release"
status: done
release: "v0.3"
kind: "feature"
priority: "high"
tags: ["v0.3", "core", "tests", "gates", "ci"]
ref: "dl-044"
bug: ["bug-073", "bug-185"]
depends_on: ["task-140-run-packaging-gate-push-pull-request-separate"]
tmpl_version: 260703
---

## Description

`test/**` lost its only standing typecheck gate; `tsc --noEmit` runs only by hand at release-submit (`dl-044`). No gate detects a raw NUL or other control character in a tracked text file (`bug-073`; `test/lint/` has only `coverage-scope`, `lint-clean`, `pack-ignore-scripts`).

## Acceptance Criteria

- (red-first) a `test/lint/` suite runs the full-project `tsc --noEmit` (src and test configs) and fails on a planted type error.
- (red-first) a `test/lint/` suite fails on a tracked text file holding a byte in `[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]`, naming file and offset; binary files are excluded by `git ls-files --eol` or an explicit list.
- (characterization) an `npm run typecheck` script exists; `ci.yml` (task-140) runs it; `release-submit.yaml` `pre-release-checks` declares `typecheck.clean` (version bump); `tsconfig.test.json`'s `ignoreDeprecations: "6.0"` carries a comment citing `dl-044` (accepted until TS 7). The `dev-loop.yaml` `refactor.checks.post` declaration is made by task-221, in the single v1.6 revision after task-205.
- (characterization) `.wingfoil/directives/custom/testing.md`'s `typecheck.clean` pointer, written by task-139 to name this task as the gate's deliverer, is rewritten to state the gate as running (`npm run typecheck`, the `test/lint/` suite) and no longer names this task (`dl-120` D3); it does not claim that `refactor` declares `typecheck.clean` before task-221 lands (the dev-loop declaration is task-221's).
- (characterization) `dl-044`'s third Action (the regression record on `task-065`) is written in this task's Execution Notes instead of editing a `done` element.
- (red-first; added at design 2026-10-05, `bug-185` absorbed per `dl-078`'s Amendment of 2026-10-01) a `Reason:` block is also refused when it carries DEL (U+007F), a C1 control (U+0080 to U+009F) or U+2028/U+2029, with the existing control-character message naming the first one by code point; `spec-008` §2 and the user docs say so.

## Implementation Notes

- **Size:** S · **wave:** 2 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-044 (recommended; main, repo-level scope, pin accepted until TS 7) — merged from proposal D20; bug-073 control-character gate.
- **Notes:** Proposal key: C22 (merged: D20). Merged with proposal D20 (same `dl-044` gate): one owner for the typecheck gate. Files: `test/lint/`, `package.json`, `.github/workflows/ci.yml`, `release-submit.yaml`, `tsconfig.test.json`.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

Branch `task/task-173-add-whole-project-typecheck-clean-gate-control-character`, worktree
`../.wf2-wt/task-173`, cut from `main` at `0b297169`; start `3652a11c`, bug syncs `559bc45f` (bug-073)
and `ac073c81` (bug-185). Wave 2, batch B2.

### design (architect)

**`depends_on` read (dl-015).** `task-140-run-packaging-gate-push-pull-request-separate` is `done`
(`grep -n "^status" docs/04_memory/v0.3/task-140-*.md`). Its notes fix the `ci.yml` shape this task
extends: one `packaging-gate` job, run steps pinned in order by `test/cli/ci-workflow.test.ts`, no
`continue-on-error`. `task-250` later added `npm run check:audit` last, under `if: ${{ !cancelled() }}`
(batch notes). No deferred work names this task.

**Sources.** `dl-044` is `ready`; its approve commit `16436983` rules "Main: recommended … Scope: also
repo-level (CI / release-submit). Pin: accept until TS 7". `dl-078` is `ready` and carries the
Amendment of 2026-10-01 extending the Reason refusal past C0 and naming this task as the one that runs
it (`sed -n '/## Amendments/,$p' docs/04_memory/design/dls/dl-078-*.md`). `bug-073` is the
control-character gate; `bug-185` is the Reason refusal. `spec-008-cli-grammar` is `approved` and its
§2 states the control-character case as C0 only, so it needs a Revision (pending amendment below). No
BDD scenario covers either rule (`grep -rni "control" docs/02_requirements/02_bdd/features` prints
nothing), so no BDD change.

**Scope added at design.** `bug-185` is in this task's `bug:` list, but no AC covered it: the triage
(`bug-ingest-rel-v0.3-w1b1-review-findings-plan`, approver ruling recorded in `dl-078` by `7cd76166`)
absorbed it after the ACs were written. One AC is added (above), so the bug's fix is checkable.

**Motivation on record.** The B1 gate of this wave merged two branches that each compiled alone and
together broke `tsc` (TS2554); the integration fix is `ff82aa04` (plan v1.12). `npm test` was green on
the merge, because ts-jest is transpile-only: exactly the gap `dl-044` describes.

**Design choices.**
- **Typecheck projects.** `npm run typecheck` = `tsc --noEmit -p tsconfig.json && tsc --noEmit -p
  tsconfig.build.json`. "src and test configs" is read as `tsconfig.json` (the whole project, `src` and
  `test`, `module: Node16`; the only config that typechecks `test/**`) plus `tsconfig.build.json` (`src`
  as `npm run build` compiles it). `tsconfig.test.json` is left out: it is ts-jest's runtime config,
  strictly more permissive (`module: CommonJS`), and costs ~38 s for no extra diagnostic (`time npx tsc
  --noEmit -p tsconfig.test.json` → 38 s, exit 0). **Approver to confirm.**
- **Suite shape.** As `dl-034`'s `lint-clean.test.ts`: the suite runs the check out of process and
  requires exit 0. It also pins `scripts.typecheck` to the exact string its project list implies, so the
  command `ci.yml` and `release-submit` run is the one the suite asserts, and proves the runner says red
  on a planted TS2322 in a temp project (the `bug-026` shape that transpile-only ts-jest lets through),
  with a clean control case.
- **Binary exclusion: explicit list, not `git ls-files --eol`.** git reports `-text` for any file
  holding a NUL, so excluding what git calls binary would exclude exactly `bug-073`'s file.
  `BINARY_EXTENSIONS = ['.png']`: the only `-text` files today are the five PNGs under `docs/assets/`
  (`git ls-files --eol | grep -- -text`).
- **Byte rule.** `[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]` as the AC states, as a byte scan (the
  `no-control-regex` lint rule forbids the regex). Each finding names path, byte, offset and line.
  Tracked files only (`git ls-files -z`); a tracked path missing from the working tree, a symlink or a
  submodule is skipped.
- **Existing violations.** The sweep finds four raw bytes in two `done`/`closed` Memory documents:
  `bug-050` line 149 (`0x1f`) and `task-086` lines 196 (`0x1f` twice) and 416 (`0x1e`), each inside a
  quoted `memory history --format json` value. They are replaced by the JSON escape `\u001f` /
  `\u001e`, which is what `--format json` actually prints (`JSON.stringify` escapes C0), so the text
  becomes more accurate, not less. Both are Memory past their first state: pending amendments below.
  The alternative, an allowlist of known offsets in the suite, was rejected: it would leave the
  invisible bytes in place. **Approver to confirm.**
- **CI.** A `npm run typecheck` step after `prepublishOnly` and before `check:audit` (which stays last),
  so a red test step still reports the typecheck (condition corrected at review, F2 below). The
  control-character gate is a suite of `npm test`, so it runs inside `prepublishOnly` (CI and
  `publish.yml`'s tag gate) without a step of its own.
- **Reason rule (bug-185).** `firstControlCharacter` also returns DEL..U+009F and U+2028/U+2029. The
  message is unchanged ("control character other than tab or newline (found U+XXXX)"): `dl-078`'s
  Amendment says each is "refused like the others", and the message is quoted verbatim by `spec-008`
  §2 and `docs/cli-reference.md`. The governance check calls the same function, and finds nothing new
  on the corpus (refactor below).

**AC classification (T1).**

| AC | Class | Why |
|---|---|---|
| 1 — typecheck suite fails on a planted type error | red-first | no suite and no runner exist at `0b297169` (`ls test/lint`) |
| 2 — control-character suite, file + offset, binaries excluded | red-first | no such suite exists (`ls test/lint`); `bug-073` |
| 3 — `npm run typecheck`, `ci.yml`, `release-submit.yaml`, `tsconfig.test.json` comment | characterization | configuration; the script and the `ci.yml` step are pinned by the AC 1 suite and `ci-workflow.test.ts` |
| 4 — `testing.md` pointer rewritten | characterization | directive prose |
| 5 — `dl-044` Action 3 recorded here | characterization | notes only (below) |
| 6 — Reason refusal past C0 (bug-185) | red-first | `reasonRefusalMessage('ok \u2028 x')` is `null` at `0b297169` (bug-185 Steps to Reproduce) |

### red (developer)

Commit `466c5771`: `test/lint/typecheck-clean.test.ts`, `test/lint/control-characters.test.ts` (both
import helpers that do not exist yet) and a new `describe` in `test/memory/reason-trailer.test.ts`
(DEL, U+0080, U+0085, U+009B, U+009F, U+2028, U+2029 refused and named; neighbours U+007E, U+00A0,
U+2027, U+202A accepted; first-offender ordering across ranges).
`npx jest test/lint/typecheck-clean.test.ts test/lint/control-characters.test.ts
test/memory/reason-trailer.test.ts` → `Test Suites: 3 failed`, `Tests: 8 failed, 47 passed, 55 total`:
both lint suites `Cannot find module './helpers/…'`, and the 8 new reason cases fail.

### green (developer)

Commit `6a93df25`:
- `test/lint/helpers/typecheck.ts` (`TYPECHECK_PROJECTS`, `typecheckScript`, async `runTypecheck`);
  `package.json` `typecheck` script.
- `test/lint/helpers/control-characters.ts` (`BINARY_EXTENSIONS`, `controlCharacterOffsets`,
  `scanTrackedFiles`, `formatFindings`).
- `src/memory/commit-message.ts`: `firstControlCharacter` extended; `ReasonDefect` doc updated.
- `.github/workflows/ci.yml` (step + header), `test/cli/ci-workflow.test.ts` (pinned run list now
  `npm ci`, `prepublishOnly`, `typecheck`, `check:audit`; a new case pins the two steps'
  `if:` conditions, corrected at review, F2 below), `release-submit.yaml` 1.0 → 1.1 (`typecheck.clean` in `pre-release-checks`),
  `tsconfig.test.json` (comment citing `dl-044`'s ruling `16436983`, accepted until TS 7),
  `testing.md` pointer, and the Reason rule in `docs/cli-reference.md`, `docs/user-guide.md`,
  `docs/agents.md`.

Before the pending amendments, the control-character suite failed on the real tree, naming
`bug-050…md: byte 0x1f at offset 6474 (line 149)` and three `task-086` offsets: the gate's first real
finding. With them in the working tree, `npx jest` on the six affected suites (the two new ones,
`reason-trailer`, `ci-workflow`, `reason-control-chars.integration`, `core/reason-trailer-verbs`) →
`Tests: 132 passed, 132 total`.

Demonstrations on the real tree (reverted after each; `git status --short` shows only the three
pending amendments):
- a NUL appended to `src/memory/git-log.ts` → the suite fails with `src/memory/git-log.ts: byte 0x00 at
  offset 7884 (line 126)`;
- `test/lint/zz-planted.ts` holding `export const planted: number = "x";` → `npm run -s typecheck`
  exits 2 with `error TS2322`.

### refactor (developer)

Run sequentially in the worktree, after `npm ci`, with the three pending amendments in the tree.

| Command | Result |
|---|---|
| `npm test` | exit 0; 235 suites / 4331 tests passed (401 s) |
| `npm run test:coverage` | 98.99 / 96.17 / 96.08 / 99.61 (stmts / branches / funcs / lines) vs `main` `a5ef0b75` 98.99 / 96.16 / 96.08 / 99.61 (plan v1.12): no regression; `commit-message.ts` 100 / 100 / 100 / 100. The run had 2 failures, both wall-clock budgets (`query-latency` p95 1465 ms, `resource-latency` p95 1035 ms) at load average 55; re-run alone, `npx jest test/core/query-latency.test.ts test/mcp/resource-latency.test.ts` → 8 passed |
| `npm run lint` | exit 0 |
| `npm run docs:api` | exit 0 |
| `npx tsc --noEmit -p tsconfig.json` / `npx tsc -p tsconfig.build.json --noEmit` / `npm run typecheck` | exit 0 each |
| `node scripts/check-governance.cjs --base 0b297169` | exit 0; 0 findings |

`npm test` gets slower by the two `tsc` runs (~50 s of CPU, `time npx tsc --noEmit -p …` → 32 s and
17 s idle); the suite's timeout is 300 s. No CLI command or help text changed, so
`test/docs/cli-reference.test.ts` is unaffected (the reference's rule prose was edited, green in
`npm test`).

### review (reviewer, self)

- AC 1: met — `typecheck-clean.test.ts` runs both projects and fails on a planted TS2322 (fixture
  case), and `npm run typecheck` exits 2 on a planted error in the real tree (green, above).
- AC 2: met — `control-characters.test.ts` reports `path: byte 0xNN at offset N (line L)`; binaries by
  the explicit `BINARY_EXTENSIONS` list, with the reason `--eol` is not used written in the helper.
- AC 3: met — `package.json` `typecheck`; `ci.yml` step pinned by `ci-workflow.test.ts`;
  `release-submit.yaml` 1.1 declares `typecheck.clean`; `tsconfig.test.json` comment cites `dl-044`.
  The `dev-loop.yaml` declaration is left to `task-221` (`git diff 0b297169 --
  .wingfoil/workflows/custom/dev-loop.yaml` is empty).
- AC 4: met — `testing.md` names `npm run typecheck` and `test/lint/typecheck-clean.test.ts`, no longer
  names this task, and does not say `refactor` declares the check (`grep -n "task-173\|refactor"
  .wingfoil/directives/custom/testing.md` → lines 19, 26, 28 only, none in the pointer at 31–35).
- AC 5: met — below.
- AC 6: met — `reason-trailer.test.ts` new `describe`, 9 cases; `spec-008` §2 (pending) and three user
  docs updated.
- Same class, files touched: every C0-only statement of the Reason rule in non-Memory docs was updated
  (`grep -rn "control character other than tab" docs/*.md`); the `src/` wording ("a control character
  other than tab or newline") stays true and matches the message.
- No raw control byte in anything this task wrote: the control-character suite passes over the tree.

**`dl-044` Action 3 — the regression record on `task-065` (written here, not in the `done` task).**
`task-065-fix-commander-esm-jest-harness` gave ts-jest `tsconfig.test.json` (`module: CommonJS`,
`moduleResolution: Node10`). With it, emit-level diagnostics on test sources under the project's real
`module: Node16` semantics (e.g. TS1479 on `import { Command } from 'commander'`) stopped failing
`npm test`; they still failed `tsc --noEmit -p tsconfig.json`, which no gate ran. Semantic errors in
`test/**` had never failed `npm test` (ts-jest is transpile-only under `isolatedModules: true`), and
`bug-026` (TS2339 in `test/core/directive-create.test.ts`) reached `main` through `task-050` with every
gate green. `task-065` recorded `tsc --noEmit` as a hand-run guard. From this task on, the guard is
`typecheck.clean`: `npm run typecheck`, asserted inside `npm test` by `test/lint/typecheck-clean.test.ts`.

### review fixes (independent review: APPROVE WITH FIXES)

Commit `7a72158e`.
- **F1.** `test/memory/reason-trailer.test.ts` held RAW U+2028, U+2029, NBSP, U+2027 and U+202A
  (the last a bidi control) at lines 236, 237, 250, 256 and 257. The editing tool resolved the
  `\uXXXX` escapes I typed into the characters themselves: the `bug-073` incident in another shape.
  Rewritten as escapes. `grep -nP '[\x{2028}\x{2029}\x{00A0}\x{2027}\x{202A}]'
  test/memory/reason-trailer.test.ts` → no output (exit 1). The other files this task touched have
  no raw U+0080–U+009F, U+00A0, U+2027–U+2029, U+202A–U+202E or U+2066–U+2069 (`grep -rnP` over
  `test/lint`, `src/memory/commit-message.ts`, `.github`, this task file and the three user docs → no
  output). The control-character gate did not catch F1 because it judges single bytes below 0x80 only,
  as the AC defines it; widening it to Unicode invisibles is reported to the coordinator as a candidate,
  not done here.
- **F2.** Under `!cancelled()` alone, the typecheck step also ran after a failed `npm ci`, with no
  `tsc` installed: a second, misleading red. The install step now has `id: install`, and typecheck runs
  under `${{ !cancelled() && steps.install.outcome == 'success' }}`. `check:audit` stays last under
  `!cancelled()`. `ci-workflow.test.ts` pins the id and both conditions; the `ci.yml` header says why.
- **Nit.** `docs/cli-reference.md`'s rule paragraph re-wrapped.

Re-run after the fixes, with the three pending amendments in the tree:
`npx jest test/memory/reason-trailer.test.ts test/cli/ci-workflow.test.ts test/lint/control-characters.test.ts test/docs/cli-reference.test.ts test/lint/typecheck-clean.test.ts`
→ 5 suites, 95 tests passed; `npm run lint`, `npx tsc --noEmit -p tsconfig.json`,
`npx tsc -p tsconfig.build.json --noEmit` → exit 0 each; `node scripts/check-governance.cjs --base
0b297169` → exit 0, 0 findings. The task stays `in-review`.

### Pending amendments (approver)

Uncommitted in the worktree; the gates above ran with them. The control-character suite fails on the
committed branch until the first two are recorded.

- `bug-050-reason-control-characters-fabricate-history-entries` — `--reason "Replaces the raw 0x1f byte on line 149 with the JSON escape \u001f, which is what memory history --format json prints. The raw byte failed the control-character gate (task-173, bug-073) and was invisible in every editor."`
- `task-086-fix-reason-control-chars-history-forgery` — `--reason "Replaces three raw control bytes (0x1f twice on line 196, 0x1e on line 416) with the JSON escapes \u001f and \u001e, which is what memory history --format json prints. The raw bytes failed the control-character gate (task-173, bug-073)."`
- `spec-008-cli-grammar` — `--reason "Section 2's Reason control-character case extends past C0 to DEL, the C1 controls and U+2028/U+2029, per dl-078's Amendment of 2026-10-01 (bug-185), with a dated Revision note. Implemented by task-173; no exit code or message changed."`
