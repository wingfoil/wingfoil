---
id: "task-189-cover-or-remove-untested-paths-src-core-index"
type: task
title: "Cover or remove the untested paths of `src/core/index.ts`"
status: in-review
release: "v0.3"
kind: "fix"
priority: "low"
tags: ["v0.3", "core", "tests", "coverage"]
ref: ""
bug: ["bug-161"]
depends_on: ["task-132-read-approver-identity-once-use-authority-check-approver", "task-134-report-source-file-coverage-so-untested-file-counts"]
tmpl_version: 260703
---

## Description

`src/core/index.ts` has 8 statements and 14 branch arms no test reaches (`bug-161`, measured at `68f64091`). Measured again after task-132's preamble refactor moves them.

## Acceptance Criteria

- (red-first) each reachable arm gets a test; each unreachable one is removed or carries an ignore comment stating why; the task lists the before/after counts with the command.

## Implementation Notes

- **Size:** S · **wave:** 2 · **kind:** fix (`dl-133` Q1 (b)).
- **Implements:** coverage gate.
- **Notes:** Proposal key: C44.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

### design (architect)

- depends_on read (dl-015): `task-132` (`done`) moved the transition preamble out of `src/core/index.ts` and left one uncovered CJS re-export getter; `task-134` (`done`) made every `src/` file count in the report, so this file's numbers are those of a full run. Neither defers work to this task.
- No spec is cited by the task; nothing to confirm or amend.
- The planning-time counts are stale (`bug-161` measured 8 statements / 14 arms at `68f64091`). **Measurement command** (used before and after, each run alone in this worktree): `npx jest --coverage --coverageReporters=json --coverageReporters=json-summary --coverageReporters=text-summary --coverageDirectory=<tmp>`, then a scratch `node` reader listing the zero entries of `s` and `b` for `src/core/index.ts` in `coverage-final.json` (the bug's own Steps to Reproduce).
- **Before** (branch at `c24d7843` = main `02fd6102` + start/sync): 6 statements uncovered of 592, 12 branch arms of 279, 16 functions of 110 (all anonymous: the compiler-generated re-export getters the approver accepted at `task-122`, out of scope per `bug-161`). Summary 586/592 statements, 267/279 branches.

| # | line (before) | arm | reachable? | treatment |
|---|---|---|---|---|
| 1 | 229 | `loadOrError`: `refusal === null` → re-throw | yes: a loader error that is neither `ValidationError` nor ENOENT (EISDIR on a `dna.yaml` directory) | test |
| 2-4 | 474-476 | `runDnaMutation` defaults of `subject`, `scalarOnly`, `force` | no: `grep -n "runDnaMutation(" src/core/index.ts` → 4 call sites, all pass five arguments | removed (parameters required) |
| 5 | 649 | `dnaMutationRequest`: `options ?? {}` right side | yes: `dna remove` with no options object (MCP Tool arguments are optional) | test |
| 6 | 745 | `singleOption`: array value → last occurrence | yes: `memory add` with a repeated option | test |
| 7-8 | 860 | `memory add` post-condition alarm | yes: a pre-commit hook that rewrites the staged file (task-088/092 precedent) | test |
| 9 | 870 | `memory add` catch: not a `ValidationError` | yes: a pre-commit hook that exits 1 (`commitPaths` throws git's error) | test |
| 10 | 871 | issue-less `ValidationError` fallback to `error.message` | no: `grep -rn "new ValidationError(\|ValidationError.semantic(\|ValidationError.yamlParse(" src` → every site passes a literal issue, is guarded by `issues.length > 0`, or maps a failed Zod parse (≥1 issue) | removed |
| 11-12 | 874 | `throw error` | as #9 | test |
| 13-14 | 1855 | `directive create` alarm | yes: hook rewrites the new directive | test |
| 15 | 2028 | `directive remove`: inventory refused | yes: a custom directive with no frontmatter (`E_MISSING_FRONTMATTER`) | test |
| 16-17 | 2071 | `directive remove` alarm | yes: hook stages an extra file | test |

- **AC classification (corrected from the planning label "red-first"):** the behaviour of every reachable arm already exists, so its test is **characterization** (passes on first run; testing directive: never fabricate a red). The two removals are refactors with no behaviour change. The failing-then-passing evidence for the AC is the coverage measurement itself (before 6/12 → after 0/0). No ignore comment was needed.

### red / characterization

- `test/core/write-guard-committed-paths.test.ts`: three cases added to "the alarm is reachable" (directive create, directive remove, memory add). `test/core/core-index-arms.test.ts` (new): the other five arms.
- `npx jest test/core/write-guard-committed-paths.test.ts` → 20 passed; `npx jest test/core/core-index-arms.test.ts` → 5 passed (first run, as characterization expects). Commit `48fcc63a`; `b298cd70` adds `?.` after `npx tsc --noEmit -p tsconfig.json` flagged `project` as possibly undefined.

### green

- `43ac78cc`: `runDnaMutation`'s defaults removed; `memory add`'s `ValidationError` branch reports the joined issue messages with no fallback (comment states why). The `dna set version 2` comment block (task-184) is untouched: `git diff 02fd6102 -- src/core/index.ts` changes only lines 474-476 and the catch at ~870.
- `npx jest test/core/dna test/core/memory-add test/core/core-index-arms` → 20 suites, 201 tests passed.

### refactor (gates)

- **After** (same command, at `43ac78cc`): `src/core/index.ts` statements 591/591 (100%), branches 274/274 (100%), functions 94/110 (unchanged: the 16 re-export getters), lines 493/493. Uncovered statements 0, uncovered arms 0.
- Full run: 271 suites, 5020 tests passed; global Statements 99.23% (6087/6134), Branches 96.72% (3401/3516), Functions 96.53%, Lines 99.71% (before: 99.13 / 96.39 / 96.53 / 99.69, 270 suites / 5010 tests). Not regressing.
- `npm test` → exit 0, 271 suites / 5020 tests. `npm run lint` → exit 0. `npm run docs:api` → exit 0. `npx tsc --noEmit -p tsconfig.json` → exit 0. `npx tsc -p tsconfig.build.json --noEmit` → exit 0. `node scripts/check-governance.cjs --base 02fd6102` → exit 0, 0 findings.
- BDD: no scenario covers Jest coverage of `src/core` (`grep -rli coverage docs/02_requirements/02_bdd/features/` names only P4.12, the unbuilt workflow-engine check); none added.
- No CLI command or help text changed; `docs/cli-reference.md` untouched.

### review (self, code-review directive)

- AC met: every reachable arm has a test, the unreachable ones are removed, before/after counts and the command are above.
- Pending amendments (approver): none.
- Candidate findings, not filed: (1) a config file that cannot be read for a reason other than ENOENT (e.g. `.wingfoil/dna.yaml` is a directory) makes `wingfoil dna show` / `paths` print `error: EISDIR: illegal operation on a directory, read` at exit 1, naming no file (observed with `node dist/cli.js dna show` on a scratch repo); (2) when `memory add`'s commit is refused (pre-commit hook exits 1) the operation throws git's raw `Command failed: git -C <absolute tmp path> commit …` and leaves the new element staged in the index (`node dist/cli.js memory add --type bug --title X` on a scratch init repo with that hook → exit 1, then `git status --short` → `A  docs/memory/bug/bug-001-x.md`).
