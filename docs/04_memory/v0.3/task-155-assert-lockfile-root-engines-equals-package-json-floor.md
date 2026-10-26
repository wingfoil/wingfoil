---
id: "task-155-assert-lockfile-root-engines-equals-package-json-floor"
type: task
title: "Assert that the lockfile's root `engines` equals `package.json`'s and that the floor equals the closure maximum"
status: done
release: "v0.3"
kind: "fix"
priority: "low"
tags: ["v0.3", "core", "tests", "publishing"]
ref: "spec-015"
bug: ["bug-046", "bug-047"]
depends_on: []
tmpl_version: 260703
wave: "w1"
---

## Description

Nothing asserts `package-lock.json`'s root `engines` equals `package.json`'s (`bug-046`); `spec-015` §1 says the floor "must equal" the dependency closure's maximum "enforced by an assertion", but `test/cli/publish-metadata.test.ts:602-609` asserts only that the floor satisfies each dependency (`bug-047`).

## Acceptance Criteria

- (red-first) a lockfile root `engines` edited to differ fails the suite.
- (red-first) an over-tight floor (above the closure maximum) fails the equality assertion.

## Implementation Notes

- **Size:** S · **wave:** 1 · **kind:** fix (`dl-133` Q1 (b)).
- **Implements:** spec-015 §1 (engines rule); dl-121 (named instances).
- **Notes:** Proposal key: C43.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

Branch `task/task-155-assert-lockfile-root-engines-equals-package-json-floor`, worktree
`../.wf2-wt/task-155`, cut from `main` at `903b87a6`; start `ab727e1a`, `bug-046` `[planned →
in-progress]` `bc16d1fe`, `bug-047` `[planned → in-progress]` `8bd422b9`. Measured with `node v22.21.0`,
`npm 11.6.2`, after `npm ci --offline` (exit 0). No network was used.

### design (architect)

**`depends_on`:** none (`depends_on: []`), so no upstream Execution Notes to read (dl-015).

**Specs.** `spec-015-packaging-publishing` is `approved` and `adr-010-node-22-runtime-floor` is
`accepted` (`grep -n "^status" docs/04_memory/design/specs/spec-015*.md
docs/04_memory/design/adrs/adr-010*.md`). `spec-015` §1 already states the rule this task enforces.
The floor "must equal the highest `engines.node` floor declared anywhere in the production dependency
closure" and is "enforced by an assertion in `test/cli/publish-metadata.test.ts` that recomputes it
from the installed tree" (`grep -n "must equal" docs/04_memory/design/specs/spec-015*.md` → `:71`).
`bug-047`'s Notes say the spec has no such sentence. That was true when the bug was filed
(2026-09-21). `task-074`'s revision of §1 added it later. So the spec needs no edit. The test file
made only half the sentence true: `it('declares a floor every production dependency accepts')`
checks satisfies-only.

**Closure source: the installed tree, not `package-lock.json`.** The coordinator suggested computing
the closure from the lockfile. `spec-015` §1 says the assertion recomputes the floor "from the
installed tree", and the existing `productionClosure()` walk already does that offline. Specs win
(CLAUDE.md §10.1), so the equality half reuses that walk. After `npm ci` the two sources hold the same
resolutions. The lockfile's own production entries give the same maximum: `commander` `>=22.12.0` is
the highest of 73 non-dev entries declaring `engines.node`, read from `packages` where `!dev`.

**"The floor" of a compound range.** A dependency's floor is the lowest version its range admits:
`^20.19.0 || ^22.13.0 || >=24` → `20.19.0`. The closure maximum is the highest of those values. The
satisfies-guard still covers gaps inside compound ranges.

**Scope, bug-046 addendum.** The bug's 2026-09-22 addendum widens the blind spot to the whole
`packages[""]` block, dependency ranges included. The assertion therefore covers every field npm
mirrors, not only `engines`. All seven fields the root carries today agree with `package.json`
(`name version license dependencies bin devDependencies engines`: each `true`, by the
`JSON.stringify(lock.packages[""][k]) === JSON.stringify(pkg[k])` check).

**Same class: `NODE_VERSION`.** `.github/workflows/publish.yml:139` and `ci.yml:54` pin `NODE_VERSION:
'22.12.0'`. `ci-workflow.test.ts:87` keeps the two equal, and `publish-pipeline.test.ts:168` pins
publish.yml to the literal `'22.12.0'`. Nothing tied either value to `package.json`. With a floor of
`>=22.13.0` in both copies, the four floor-related suites passed (104/104), so CI would have tested
below the declared floor. One characterization assertion now ties `publish.yml`'s `NODE_VERSION` to the
floor. `ci.yml` follows through the existing equality. Current values are consistent: `>=22.12.0` ==
`>=` + `22.12.0`. `package.json` and `package-lock.json` were not changed: no mismatch exists.

**Bugs demonstrated before any change** (on `8bd422b9`, by temporary mutation, restored afterwards):

| Mutation | Command | Result |
|---|---|---|
| lock root `engines.node` → `>=18.0.0` | `npx jest test/cli/publish-metadata.test.ts` | 68/68 passed — `bug-046` |
| floor `>=24.0.0` (manifest and lock) | same | 68/68 passed — `bug-047` |
| floor `>=22.13.0` (manifest and lock) | `npx jest` over `publish-metadata`, `types-node-floor`, `publish-pipeline`, `ci-workflow` | 104/104 passed — same-major over-tightening escapes every floor guard, the `@types/node` major pin included |

**AC classification (T1).**

| AC | Class | Why |
|---|---|---|
| 1 — a lockfile root `engines` edited to differ fails the suite | **red-first** | demonstrated above: the suite is green with the mutation on `main` |
| 2 — an over-tight floor fails the equality assertion | **red-first** | no equality assertion exists; `>=24.0.0` and `>=22.13.0` pass today |
| (added) real-repo mirror and equality assertions | characterization | today's repo already agrees; they pin it |
| (added) `NODE_VERSION` == floor | characterization | consistent today; same-class copy of the floor |

### red (developer)

`ee4ba3f4` adds two `describe` blocks to `test/cli/publish-metadata.test.ts`. The first covers the
mirror: the real-repo `engines` equality, the whole-mirror check, and fixtures for an edited `engines`,
a dropped `engines`, a drifted dependency range and key-order insensitivity. The second covers the
equality: the real-repo check, over-tight fixtures `>=24.0.0`, `>=22.13.0` and `>=22.12.1`, a
below-maximum fixture, an empty-closure refusal, 11 `minAdmitted` cases and an admits-nothing refusal.
`npx jest test/cli/publish-metadata.test.ts` → `Test suite failed to run — ReferenceError:
readLockRoot is not defined`, 0 tests run. The helpers the tests call did not exist. No stub was
added to shape the red.

### green (developer)

`bc1d6816`, test code only (`git diff --stat 903b87a6..HEAD -- src/` → empty):
- `lockRootMirrorDrift(manifest, root)` lists the fields where the lock root disagrees with the
  manifest, sorted. It compares every key the root carries, minus the computed `hasInstallScript`,
  plus every npm-mirrored field the manifest declares, so a dropped field also counts. Comparison uses
  canonical JSON (sorted keys).
- `minAdmitted(range)` returns the lowest version a range admits, and throws when the range admits
  nothing. `floorEqualityViolation(declared, closure)` names the closure entries that set the maximum
  in its message.
- The range grammar was factored into `parseRangeClauses` / `clauseAllows`, shared by `rangeAllows`
  and `minAdmitted`. One behaviour change in `rangeAllows`: the whole range is now parsed before any
  `||` alternative is evaluated. Unsupported syntax in a later alternative now throws even when an
  earlier one already admits the candidate. Before, `.some` short-circuited past it. This is
  stricter, in line with the evaluator's "throws on anything it does not understand" header. All 23
  `rangeCases` and the 5 refusal cases still pass.

`npx jest test/cli/publish-metadata.test.ts` → 93/93 passed.

`977fb88c` adds a characterization test in `test/cli/publish-pipeline.test.ts`: `>=${NODE_VERSION}`
equals `package.json` `engines.node`. 23/23 passed on its first run.

**ACs after the fix**, same temporary mutations, restored afterwards (`git status --short` clean):

| Mutation | Result |
|---|---|
| lock root `engines.node` → `>=18.0.0` | 2 failed: the `engines` equality and the whole-mirror check (AC 1) |
| floor `>=22.13.0` (manifest and lock) | 2 failed: `engines.node >=22.13.0 is above the production closure's highest floor 22.12.0 (commander@15.0.0)` (AC 2), and the `NODE_VERSION` tie |
| floor `>=24.0.0` (manifest and lock) | same 2 failures, `>=24.0.0` in the message |

### refactor (developer)

| Gate | Command | Result |
|---|---|---|
| unit + integration | `npm test` | 200 suites, 3389 tests, all passed |
| coverage | `npm run test:coverage` | All files 98.85 stmts / 95.39 branches / 95.18 funcs / 99.56 lines; `src/` untouched, so equal to `main` |
| lint | `npm run lint` | exit 0 |
| API docs | `npm run docs:api` | exit 0, no warnings |
| types | `npx tsc --noEmit -p tsconfig.json`; `npx tsc -p tsconfig.build.json --noEmit` | exit 0; exit 0 |
| BDD | `grep -rln "engines\|lockfile\|package-lock" docs/02_requirements/02_bdd/features/` | no output — no scenario covers the publish manifest, so there is nothing to extend |

A first green attempt was run through an `npx prettier --write`. The repository has no prettier
configuration, so that reformatted the whole file. The run was discarded and the commit redone
without it. `bc1d6816` is the clean 175+/13− diff.

### review (reviewer)

- AC 1: met. The real lockfile with `engines` mutated fails two cases (table above). The fixture
  ``reports a lockfile root `engines` edited to differ`` pins it without touching real files.
- AC 2: met. Floors `>=24.0.0`, `>=22.13.0` and `>=22.12.1` fail `floorEqualityViolation` in fixtures.
  On the real repository, `>=22.13.0` and `>=24.0.0` fail the equality case.
- Same class, in the files touched: the `publish.yml` `NODE_VERSION` copy of the floor is now tied to
  `package.json`. `types-node-floor.test.ts` already pins `@types/node` to the floor's major and is
  left as it is.
- No spec, ADR or other Memory element was edited, so there are no pending amendments (approver).

### review — pass 2: coordinator review fixes (2026-10-02)

The review verdict was *approve with fixes*. Three fixes were applied on this branch. The status stays
`in-review` and there was no re-submit.

1. **Floor definition.** The design section above reads "the floor" of a compound range as the
   lowest version that one range admits, and takes the maximum of those minimums over the closure.
   That reading fails on a gapped range. With `>=22.12.0` and `^20.19.0 || ^22.13.0 || >=24` (the
   shape `eslint@10` declares), `>=22.12.0` fails the satisfies guard and `>=22.13.0` fails the
   equality guard, so no floor passes both. The floor is now `closureFloor`: the least element of the
   intersection of every range. It is found as the smallest candidate among 0.0.0 and every
   comparator's lower bound that all ranges admit. An empty intersection throws. `minAdmitted` and
   its tests were replaced by `closureFloor` and 13 cases, gapped ones included.
   - Red `4f409a91`: the base fixture's `c` became non-gapped, and a new gapped fixture was added.
     `npx jest test/cli/publish-metadata.test.ts` → **1 failed, 93 passed**. The failure is the
     gapped case: `>=22.13.0 is above the production closure's highest floor 22.12.0`.
   - Green `538adc52` → 95/95.
   - The real value is unchanged, `>=22.12.0` (`commander@15.0.0`), because the production closure
     has no gapped range above it.
   - Same mutations, re-run after the fix, each restored afterwards. Lock root `engines` `>=18.0.0`:
     2 failed. Floor `>=22.13.0`: 1 failed ("is above … 22.12.0 (commander@15.0.0)"). Floor
     `>=24.0.0`: 1 failed. Floor `>=22.11.0`: 2 failed, the satisfies check and "is below".
2. **bug-046 and bug-047 addenda** (`6519d069`). bug-047 records that `spec-015:71` now has the "must
   equal" rule (`task-074`), that option 1 was chosen, and that this task resolves it. bug-046 records
   that its characterization suggestion was overtaken by the red shown by mutation.
3. **`LOCK_ROOT_MIRRORED_FIELDS`** now carries a note that npm may normalize fields such as `bin` and
   `funding` in the lock root (`538adc52`).

**Gates**, run with the pending amendment in the working tree:

| Gate | Command | Result |
|---|---|---|
| unit + integration | `npm test` | 200 suites / 3391 tests, all pass |
| coverage | `npm run test:coverage` | 98.85 / 95.35 / 95.18 / 99.56 |
| lint | `npm run lint` | exit 0 |
| API docs | `npm run docs:api` | exit 0 |
| types | `npx tsc --noEmit -p tsconfig.json`; `npx tsc -p tsconfig.build.json --noEmit` | exit 0; exit 0 |

`src/` is unchanged (`git diff --stat 903b87a6..HEAD -- src/` → empty). The branch figure moved from
95.39 in pass 1 to 95.35 on the same `src/`, which suggests run-to-run noise in branch coverage, not
an effect of this task.

**Pending amendments (approver)**

- `spec-015-packaging-publishing` (uncommitted in this worktree). The edit clarifies the §1
  `engines.node` bullet, says the assertion is two-sided, and adds a dated *Revision (2026-10-02)*
  note. Proposed reason:
  `§1 engines.node: "the highest floor" of the production closure is defined as the lowest version every range in it admits (the least element of their intersection), because the maximum of each range's own minimum is unsatisfiable together with the satisfies assertion once a range has a gap above it; the value stays >=22.12.0. The bullet also records that the assertion is now two-sided (task-155, bug-047).`
