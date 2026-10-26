---
id: "task-168-accept-declared-not-applicable-value-required-fields-explicit"
type: task
title: "Accept a declared not-applicable value for required fields, and an explicit empty list"
status: done
release: "v0.3"
kind: "feature"
priority: "medium"
tags: ["v0.3", "core", "memory"]
ref: "dl-124"
bug: ["bug-147"]
depends_on: ["task-127-add-memory-amend-id-reason-approver-gated-verb"]
tmpl_version: 260703
wave: "w1"
---

## Description

`isEmptyValue` (`src/memory/submit.ts:18-22`) treats `[]` as missing, so an author who explicitly sets `features: []` is refused (`bug-147`), and a required field cannot say "does not apply" (`dl-124`). Ratified: `template.frontmatter.not_applicable_allowed: [...]`, value `"n/a — <reason>"`, accepted only for declared fields.

## Acceptance Criteria

- (red-first) a declared field holding `"n/a — patch release"` passes `submit`; bare `n/a` or an undeclared field holding it is refused, naming the field.
- (red-first) the empty-list rule chosen in design (accept `[]` as present, or require `n/a` for lists) is asserted and stated in `spec-010`.
- (characterization) this repository's `memory.yaml` declares not-applicable for `release`'s `pillar`/`requirements` if the approver confirms (Action 4; version bump).

## Implementation Notes

- **Size:** S · **wave:** 1 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-124 Q1 (A) `n/a`, Q2 (a) `not_applicable_allowed`, Q3 (ii) quoted reason; spec-001; spec-010.
- **Features:** P1.6, P1.13.
- **Notes:** Proposal key: C28.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

Branch `task/task-168-accept-declared-not-applicable-value-required-fields-explicit`, worktree
`../.wf2-wt/task-168`, cut from `main` at `903b87a6`; start `e0469fd4`, `bug-147` synced
`planned → in-progress` at `b06aa42e`.

### design (architect)

**`depends_on`** (dl-015): `task-127`'s Execution Notes read. What this task takes from them: review
F1 made `memory amend` run `submit`'s own required-field check past the type's initial state
(`requireRequiredFieldsKept`, `src/core/memory-amend.ts`). The not-applicable rule therefore has to
apply to both verbs from one function, or the two would disagree about what "filled" means.

**Specs and decisions cited** (`awk '/^status:/{print $2;exit}'` on each): `spec-001`, `spec-010`
`approved`; `dl-124`, `dl-092` `ready`. `dl-124`'s ratification is `09cc2ae8`
(`git log --follow` on its file): "Q1 (A), Q2 (a), Q3 (ii)".

**Design decisions** (to confirm at review):
1. **The value.** A string whose trimmed text starts with `n/a`, in any case, not followed by a word
   character, is *not-applicable-shaped* (`n/a`, `N/A`, `n/a — x`; not `n/available`, not
   `P1 (n/a for docs)`). The one accepted form is `n/a — <non-blank reason>`, em dash only, as the
   ratified Q3 (ii) text writes it. An ASCII `n/a - reason` is refused as "needs a reason".
2. **Undeclared fields.** A not-applicable-shaped value on a required field the type does not list is
   refused whatever its form. This is what keeps `task.kind` (required since `task-150`, not listed)
   from being skipped with `n/a`. `title` is never listable: spec-010 requires it of every type, and
   `memory.yaml` validation refuses `title` in the list. Optional fields are not checked.
3. **Schema.** `not_applicable_allowed: string[]` (optional) next to `required`. Two semantic checks:
   each entry is a member of `required`, and `title` is not one.
4. **One check for two verbs.** `requireRequiredFields(memoryYaml, type, frontmatter, verb)`
   (`src/core/required-fields.ts`, new) is called by `memory submit` and by amend's
   `requireRequiredFieldsKept`. Messages: the existing `missing required field on <verb>: a, b`
   (unchanged), and `not-applicable value on <verb>: <field> does not accept one (…)` /
   `<field> needs a reason, written "n/a — <reason>"`, joined by `; ` when both apply.
5. **No existing document is affected.** `grep -rniE '^[a-z_-]+: *"?n/a' docs/04_memory docs/05_plans`
   → nothing, so no committed frontmatter becomes refusable.

**AC classification (T1).**

| AC | Class | Why |
|---|---|---|
| 1 — declared `"n/a — patch release"` passes; bare `n/a` or an undeclared field holding it is refused naming the field | **red-first** for the refusals and the schema key; the accepting half is characterization (a non-empty string already passes `isEmptyValue`) | no `not_applicable_allowed` key and no refusal existed on `903b87a6` |
| 2 — the empty-list rule (ruling Q-A (1)), asserted and stated in spec-010 | **red-first** both ways | an explicit `[]` was refused on `903b87a6`; the untouched-scaffold test passed then and turns red once `[]` is accepted, until the scaffold changes |
| 3 — `memory.yaml` declares not-applicable for `release`'s `pillar`/`requirements` (ruling Q-B) | characterization (configuration), with a test on the live file | — |

### Questions for the approver (asked 2026-10-02, ruled the same day — see below)

**Q-A — the empty-list rule (AC2, `bug-147`).** The two sources point different ways once the
scaffolds are read:
- `bug-147` Expected Behavior: a present `[]` is filled; non-empty only if `memory.yaml` declares a
  minimum. `dl-124` Context agrees `[]` should be fixed, but reads it as "none yet", not "does not
  apply".
- But `.wingfoil/memory/templates/release.md` scaffolds `features: []   # REQUIRED`. YAML cannot tell
  an author's `[]` from the untouched scaffold's, so accepting `[]` silently turns `release.features`
  into a field an unedited scaffold satisfies. `features` is the only required list field in this
  repository (`grep -n "\[\]" .wingfoil/memory/templates/*.md`, cross-checked with the `required:`
  lists in `memory.yaml`).

Options:
- **(1) Accept `[]` as present** (fixes `bug-147` as filed), and change the `release` scaffold to
  `features:` (null) so an untouched scaffold still fails. Touches `.wingfoil/memory/templates/release.md`
  and the `init` scaffold if it declares a required list (to be checked).
- **(2) Accept `[]` as present, scaffolds unchanged.** Simplest; weakens `release.features`.
- **(3) Keep `[]` as missing; a list field that does not apply says `"n/a — <reason>"`** (needs the
  field declared). `bug-147` would be closed as "by design" rather than fixed.
Recommendation: (1). It fixes the bug as filed and keeps the check on the one field that has it.

**Q-B — `dl-124` Action 4 / AC3.** Action 4 says `release` declares not-applicable "once `dl-092`
settles patch tracking"; `dl-092` is `ready` and `patch-v0.2.2` exists, but it filled the fields
(`pillar: "P1"`, `requirements: "docs/04_memory/design/dls/retro-v0.2.md"`). Should `memory.yaml`
(1.9 → 1.10) declare `not_applicable_allowed: [ pillar, requirements ]` on `release` — and also
`features`, which `dl-124`'s Q2 (a) example lists? `patch-v0.2.2` is `released` and `release` is not
amendable, so it stays as it is either way.

### red (developer)

`9e9f2d34`: `test/memory/submit.test.ts` (pure `notApplicableRefusals`), `test/memory/schema.test.ts`
(`not_applicable_allowed`), `test/core/memory-submit.test.ts` (a `release` fixture with
`kind` required and not listed) and `test/core/memory-amend.test.ts` (the same rule past draft).
`npx jest test/memory/submit.test.ts test/memory/schema.test.ts test/core/memory-submit.test.ts
test/core/memory-amend.test.ts` → **4 suites failed, 14 tests failed, 72 passed**: the 7 pure tests
(`notApplicableRefusals` not exported), 3 schema refusals, 3 submit refusals, 2 amend refusals. The
accept-path tests passed already (characterization, decision 1 above).

### green (developer)

`14bb7902`: `notApplicableRefusals` in `src/memory/submit.ts`; `TemplateFrontmatter` with its two
checks in `src/memory/schema.ts`; `requireRequiredFields` in `src/core/required-fields.ts`, called by
`memorySubmitFn` and `requireRequiredFieldsKept`. Same four files → 4 suites, **86 passed**.

`775e52f4`: `docs/cli-reference.md`, `memory submit` and `memory amend` entries (marked Unreleased (v0.3)).

### refactor (developer)

Gates on `775e52f4` plus the uncommitted spec amendments (`npm run build` first):

| Command | Result |
|---|---|
| `npm run test:coverage` | exit 0; 200 suites / 3381 tests; 98.86 / 95.42 / 95.23 / 99.57 (main after B3, plan v1.8: 98.85 / 95.39 / 95.18 / 99.56) |
| `npm run -s lint` | exit 0 |
| `npm run -s docs:api` | exit 0 |
| `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| `npx tsc -p tsconfig.build.json --noEmit` | exit 0 |
| `npx jest test/docs` | 3 suites / 7 tests passed |
| per-file coverage of `submit.ts`, `schema.ts`, `required-fields.ts` | 100 / 100 / 100 / 100 |

BDD: `P1.6-memory-submit.feature` has no scenario on required-field content and no AC asks for one;
none added.

### approver rulings (Roberto, 2026-10-02, relayed by the coordinator)

- **Q-A: option (1).** An author's explicit `[]` counts as filled. The `release` scaffold changes
  `features: []` to `features:` (null) so an untouched scaffold still fails submit. Its
  `tmpl_version` is bumped by the file's precedent: `92908e8c` (dl-092) moved it to the change date,
  `260703 → 260929`; this change makes it `261002`.
- **Q-B:** `memory.yaml` 1.9 → 1.10 declares `not_applicable_allowed: [ pillar, requirements ]` on
  `release`, **not** `features`.
- **Design decisions 1, 2 and 4 accepted as defaults:** em dash only (`n/a — <reason>`); optional
  fields unchecked; both errors joined by `; `, missing first.

### red, second pass (developer)

`3411da67`:
- `test/memory/submit.test.ts`: the `d: []` expectation inverted (an explicit `[]` is filled), plus
  `[]` filled and `null` missing.
- `test/core/memory-submit.test.ts`: a block on the REAL `.wingfoil/memory.yaml` and the REAL
  `release` scaffold, every other required field filled. (a) The untouched scaffold refuses, naming
  `features`. (b) `features: []` passes. (c) `n/a — …` passes on `pillar`/`requirements` and is
  refused on `features`.
- `test/memory/schema.test.ts`: the live `release` lists exactly `[pillar, requirements]`, and `task`
  lists nothing.

`npx jest test/memory/submit.test.ts test/memory/schema.test.ts test/core/memory-submit.test.ts` →
**5 failed, 55 passed**: the two pure tests, (b), (c) and the live-config test. (a) passed, since `[]`
was still missing. With only `isEmptyValue` changed, the same run on the two submit suites →
**2 failed** ((a) and (c)): (a) was red as predicted, because the scaffold's `[]` now passed.

### green, second pass (developer)

`84646e40`:
- `isEmptyValue` (`src/memory/submit.ts`) drops the array branch.
- `.wingfoil/memory/templates/release.md`: `features:` (null), with a comment, `tmpl_version 261002`.
- `.wingfoil/memory.yaml` 1.10: `not_applicable_allowed: [ pillar, requirements ]` on `release`.
- `docs/cli-reference.md`: one sentence on `[]` versus an empty value.
- The `src/core/required-fields.ts` header comment no longer lists the empty list as missing (the one
  same-class statement found by `grep -rn "empty list" src/ docs/cli-reference.md docs/user-guide.md
  docs/agents.md .wingfoil/*.yaml`).

The `wingfoil init` scaffold declares no required list field. Its only `required:` is
`[id, type, title, status]` (`grep -n "required:" src/storage/templates.ts` → line 308). So nothing
changes there. The tests that write their own `release` template (`memory-add-id-tokens`,
`memory-add-set`) use fixtures, not the real scaffold. Pinned build on 1.10:
`npm run -s wingfoil -- memory search --type release` → exit 0.

**The `1.10` version reads as `1.1`.** YAML parses `version: 1.10` as the number 1.1, and
`MemoryYaml.version` is `z.number()`, so a quoted `"1.10"` would fail the schema. The full suite
showed it: `test/core/task-kind.test.ts` (task-150) "memory.yaml is version 1.9" failed with
`toBe(1.9)` against 1.1. No `src/` code reads `memory.yaml`'s `version`
(`grep -rn "\.version\b" src/`; only package, MCP and directive versions). `b0e1ee4f` pins the
version as written (`/^version: 1\.10\b/m`) instead. The ruling's number is kept; flagged to the
approver (`2.0` is the alternative that parses monotonically).

### refactor, second pass (developer)

Gates on `b0e1ee4f` plus the uncommitted spec amendments (`npm run build` first):

| Command | Result |
|---|---|
| `npm run test:coverage` | exit 0; 200 suites / 3386 tests; 98.86 / 95.42 / 95.23 / 99.57 (main after B3, plan v1.8: 98.85 / 95.39 / 95.18 / 99.56) |
| `npm run -s lint` | exit 0 |
| `npm run -s docs:api` | exit 0 (on `84646e40`; `b0e1ee4f` changes one test only) |
| `npx tsc --noEmit -p tsconfig.json` / `npx tsc -p tsconfig.build.json --noEmit` | exit 0 / exit 0 |
| `npm run -s wingfoil -- memory search --type release` (pinned build, `memory.yaml` 1.10) | exit 0 |

### review (reviewer)

Evidence per AC:
- AC1: `test/core/memory-submit.test.ts` "declared not-applicable values" block (accept, bare `n/a`,
  undeclared `kind`, both errors joined). The same rule on amend is in `test/core/memory-amend.test.ts`
  "task-168 —" cases. The pure rules are in `test/memory/submit.test.ts`.
- AC2: `test/memory/submit.test.ts` "bug-147 …", and the "empty required list vs untouched scaffold"
  block. Stated in `spec-010` (pending amendment).
- AC3: `test/memory/schema.test.ts` "task-168 (dl-124 Action 4 …)" on the live file, and block (c).
- Same class: the `required-fields.ts` comment (above). `docs/agents.md` §119 lists only the missing-field
  error; it is owned by `user-docs` and is left for the coordinator.

### Review fixes (coordinator review APPROVE WITH FIXES; approver rulings 2026-10-02)

The task stays `in-review`; it was not resubmitted.

| # | Fix | Class | Evidence |
|---|---|---|---|
| 1 | `[]` is filled **only** on a field the type's scaffold, committed at `HEAD`, declares as a list. Everywhere else (`title`, `task.kind`, …) it stays missing | **red-first** | Reviewer: `requireRequiredFields(…, 'task', {title:[], release:[], kind:[]})` returned ok, a regression vs `main` from the second pass |
| 2 | `memory.yaml` → `2.0`, not `1.10`, asserted as a number | **red-first** (the numeric test failed on 1.10 → 1.1) | — |
| 3 | `n/a` accepts any case and any whitespace around the em dash; another separator is refused naming the exact form | **red-first** | `N/A — x`, `n/a—x` got a false "needs a reason" |
| 4 | spec-010: reader sentence made a non-normative note; quoting recommended, not justified as required; cli-reference softened | documentation | — |

**The list-field rule (fix 1), as decided and stated in spec-010 and cli-reference.**
`scaffoldListFields` (`src/memory/submit.ts`) reads the scaffold's top-level frontmatter fields. A
field is a list field when its parsed value is a YAML sequence, or when it is `null` and its own line's
inline comment matches `/#.*\bLIST\b/` (upper case, whole word). `title` is never one. With no
`template.file`, or none committed, no field is. The scaffold is read at `HEAD`
(`readCommittedScaffold`, `src/core/required-fields.ts`, `command-baseline`), so an uncommitted
scaffold edit cannot change what a submit accepts. The word `LIST` was already the convention for a
list field in `task.md` (`bug: []  # optional — LIST of bug ids`). The `release` scaffold's
`features:` comment now carries it. `committedScaffoldDeclaresRelease` (`src/core/memory-amend.ts`)
reuses the same reader. On this repository: release → `['features']`; task → none of
`title, release, kind` (`test/memory/submit.test.ts` "scaffoldListFields" block).

The second-pass inversion of the original `d: []` expectation was undone: with no list fields, `[]`
is missing again, as on `main`.

**red** `8b48c696`. `npx jest test/memory/submit.test.ts test/core/memory-submit.test.ts
test/core/task-kind.test.ts` → **10 failed, 47 passed**:
- `scaffoldListFields` ×3, not exported;
- `[]` on title/release/kind was accepted, ×2 (pure and core);
- no committed scaffold, ×1;
- the n/a variants ×2, the wrong-separator message ×1;
- the numeric version ×1.

**green** `b3ef59cf`: `scaffoldListFields`, `missingRequiredFields(…, listFields)`, the
`bad-form` problem and its message, `readCommittedScaffold`, the `root` parameter on
`requireRequiredFields`/`requireRequiredFieldsKept`. `memory.yaml` 2.0 with a version comment, the
release scaffold's `LIST` comment, and `docs/cli-reference.md`. The `tmpl_version` stays `261002`:
same day, and that change is not yet on `main`.

Gates on `b3ef59cf` plus the pending amendments (`npm run build` first):

| Command | Result |
|---|---|
| `npm run test:coverage` | exit 0; 200 suites / 3395 tests; 98.85 / 95.43 / 95.25 / 99.57 (main after B3, plan v1.8: 98.85 / 95.39 / 95.18 / 99.56) |
| `npm run -s lint` | exit 0 |
| `npm run -s docs:api` | exit 0 |
| `npx tsc --noEmit -p tsconfig.json` / `npx tsc -p tsconfig.build.json --noEmit` | exit 0 / exit 0 |
| `npm run -s wingfoil -- memory search --type release` (pinned build, `memory.yaml` 2.0) | exit 0 |

### Re-review fixes (coordinator re-review APPROVE WITH FIXES; approver ruling 2026-10-02)

The task stays `in-review`; it was not resubmitted. **This supersedes the list-field rule of the
first review fixes above.** The `LIST` comment convention, `scaffoldListFields` and the git read of the
scaffold for it are gone.

| # | Fix | Class |
|---|---|---|
| 1 | RULING: list fields are declared config, `template.frontmatter.lists`. `memory.yaml` (still 2.0) gives `release` `lists: [ features ]`. The schema checks each entry is in `required` and never `title`, as for `not_applicable_allowed`. A list counts as filled only on a declared field, `[]` included | **red-first** |
| 2 | Same class: on a field not in `lists`, any list or mapping (`[]`, `[""]`, `[x]`, `{}`) is missing. A date is a value: the default js-yaml schema gives a `Date` object, and it must not count as a mapping | **red-first** (reviewer: `missingRequiredFields({title:"T",kind:{}},["kind"],[])` returned `[]`) |
| 3 | spec-010: an unquoted `n/a: <reason>` "is not valid YAML", replacing "would parse as a mapping". Checked: `node -e "require('js-yaml').load('pillar: n/a: patch release\\n')"` → `bad indentation of a mapping entry` | documentation |

**red** `3f9bec99`. `npx jest test/memory/submit.test.ts test/memory/schema.test.ts
test/core/memory-submit.test.ts` → **8 failed, 66 passed**:
- the `lists` schema refusals ×3 and the live-config `lists` test;
- the pure list/mapping rules ×2;
- the core run without `lists`, which passed through the `LIST` comment;
- `release: [""]` / `kind: {}` on a task.

The `scaffoldListFields` tests were removed with the function.

**green** `d92b1301`:
- `isEmptyValue(value, isListField)`;
- `missingRequiredFields(…, listFields)` fed from `template.frontmatter.lists`;
- `TemplateFrontmatter` checks both subsets;
- `requireRequiredFields` / `requireRequiredFieldsKept` lose the `root` parameter again;
- `readCommittedScaffold` is removed, so `committedScaffoldDeclaresRelease` is back to its own read, as on `main`;
- `memory.yaml` `lists: [ features ]`;
- the release scaffold comment no longer gives `LIST` a meaning;
- `docs/cli-reference.md` updated.

The original `e: ['x']` expectation now counts `e` missing (ruling 2).

No committed document is affected. `grep -rnE '^(title|sard_ref|scope|severity|workflow|phase|provider|kind|owner_role|verify|release|version|pillar|requirements|release-line): *[\[{]' docs/04_memory docs/05_plans` → nothing. The same fields with an empty value and a block below match only two body lines, not frontmatter.

Gates on `d92b1301` plus the pending amendments (`npm run build` first):

| Command | Result |
|---|---|
| `npm run test:coverage` | exit 0; 200 suites / 3400 tests; 98.87 / 95.44 / 95.23 / 99.57 (main after B3, plan v1.8: 98.85 / 95.39 / 95.18 / 99.56) |
| `npm run -s lint` | exit 0 |
| `npm run -s docs:api` | exit 0 |
| `npx tsc --noEmit -p tsconfig.json` / `npx tsc -p tsconfig.build.json --noEmit` | exit 0 / exit 0 |
| `npm run -s wingfoil -- memory search --type release` (pinned build) | exit 0 |

### Pending amendments (approver)

Uncommitted in the worktree, final text after the re-review:
- `spec-001-memory-yaml-schema` — `--reason "task-168: dl-124 Action 2 and bug-147. TemplateConfig.frontmatter gains two optional subsets of required, each entry in required and never title: not_applicable_allowed, the fields that may hold the not-applicable value, and lists, the fields whose value is a list. This repository's memory.yaml 2.0 declares not_applicable_allowed [pillar, requirements] and lists [features] on release (dl-124 Action 4). The version rule now says version is a number compared numerically, so 1.9 is followed by 2.0, never 1.10 (approver rulings 2026-10-02). Revision note added."`
- `spec-010-memory-frontmatter-schema` — `--reason "task-168: dl-124 Action 2 and bug-147. Validation rules gain the not-applicable row and the paragraph on the reserved value n/a — <reason> (any case, any spacing around the em dash; quoting recommended), for submit and for amend past the initial state. They also gain the definition of non-empty: a list counts as filled only on a field declared in template.frontmatter.lists, [] included, and on any other field a list or a mapping is missing (approver rulings 2026-10-02). The note on readers is non-normative. Revision note added."`
