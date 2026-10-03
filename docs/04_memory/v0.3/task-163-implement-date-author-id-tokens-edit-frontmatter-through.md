---
id: "task-163-implement-date-author-id-tokens-edit-frontmatter-through"
type: task
title: "Implement the `{date}` and `{author}` id tokens and edit frontmatter through the shared setter"
status: in-review
release: "v0.3"
kind: "fix"
priority: "low"
tags: ["v0.3", "core", "memory"]
ref: "spec-001"
bug: ["bug-033", "bug-157", "bug-158", "bug-176"]
depends_on: ["task-128-allocate-element-ids-highest-number-ref-across-folder"]
tmpl_version: 260703
---

## Description

`spec-001` declares `{date}` (UTC `YYYYMMDD`) and `{author}` (slugged `user.name`); `memory add` fails on them and `--set` refuses them with a false message (`bug-158`). `dl-107` Action 1 names a slug rule `spec-009` §1 does not hold (`bug-157`). `add.ts`'s private `setFrontmatterField` (`src/memory/add.ts:121-127`) edits indented keys and strips inline comments, while `frontmatter-edit.ts` exists unused (`bug-033`).

## Acceptance Criteria

- (red-first) `id_pattern: "bug-{date}-{slug}"` creates `bug-<UTC date>-x`; `{author}` expands to the slugged identity; the clock is read once per call through an injectable seam (tests fix it).
- (red-first) `--set date=…` is either accepted or refused with a true message (design decides, `spec-008` §10 states it).
- (red-first) `memory add` leaves nested keys and inline comments of the template intact.
- (characterization) `spec-009` §1 points to `spec-001`'s `{slug}` rule, closing `dl-107` Action 1.

## Implementation Notes

- **Size:** M · **wave:** 1 · **kind:** fix (`dl-133` Q1 (b)).
- **Implements:** spec-001 id_pattern tokens; dl-107 Action 1 (spec-009 half).
- **Features:** P1.3.
- **Notes:** Proposal key: C29.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

Branch `task/task-163-implement-date-author-id-tokens-edit-frontmatter-through`, worktree
`../.wf2-wt/task-163`, cut from `main` at `243f8f05` (B4 merged). Start `c0e47dd5`; `bug-033`,
`bug-157`, `bug-158` and `bug-176` `[planned → in-progress]` at `256bc39d`, `19bed067`, `7f9e8586`,
`d3066acc`. `bug-176` was absorbed into this task by the coordinator (its own Notes propose it, `dl-045`).

### design (architect)

**`depends_on` read (dl-015).** `task-128` (`done`): its counter takes the highest `{n}` on every ref
and the working tree, matched against the id pattern **after** the field tokens are materialized, and
its step 3 sentence in `spec-001` said `{n:N}` is not implemented. Both carried into this design:
`{date}` and `{author}` are materialized before the counter regexp is built (spec-001 order), and the
`{n:N}` note is removed now that the token works.

**Shared behaviour checked on `main`.** `task-247` (transitions read at `HEAD`) and `task-168`
(`lists`, `not_applicable_allowed`) changed no line of `src/memory/frontmatter-edit.ts`'s setter or
of `memory add`'s path (`git log --oneline 243f8f05 -4 -- src/memory/frontmatter-edit.ts src/memory/add.ts`
→ `task-142`, `task-170`, `task-127` ×2; none from `task-247` or `task-168`). `memory add` still resolves the type, path and
scaffold at `HEAD` (`resolveAddType`).

**Specs.** `spec-001`, `spec-008` and `spec-009` are `approved` (`grep -m1 '^status:'` on each). The
ACs need all three to change; the edits are **pending amendments** (below), left uncommitted.

**Design decisions** (for the approver to confirm):
1. **`{date}`'s source is the add commit's author date, not a free wall-clock read.** `spec-001` said
   "system clock"; the `determinism` directive forbids wall-clock reads in context-building paths.
   `memory add` is a write path, but the date still reaches a durable id, so it is read **once**,
   through `git var GIT_AUTHOR_IDENT` (`readAuthorDate`, `src/memory/add.ts`): git answers with
   `GIT_AUTHOR_DATE` when set and parsable, otherwise the clock. The add commit is then recorded with
   that same instant, passed as `@<seconds> <offset>` in the commit's `GIT_AUTHOR_DATE` (corrected at
   review, fix 1: the bare pair is re-parsed by git only from 9 digits of seconds up), so the id and
   its commit cannot disagree and a run is reproducible by fixing one variable. This is the AC's
   "injectable seam": tests fix it with `GIT_AUTHOR_DATE`. The read happens only when the pattern
   has `{date}`. UTC is kept (`2026-09-29T23:30-02:00` → `20260930`).
2. **`{author}` is the author name `requireGitIdentity` already resolved** (task-132's order:
   `GIT_AUTHOR_NAME`, `author.name`, `user.name`), slugged by `slugifyTitle` — one rule with `{slug}`.
   It is not re-read (`dl-064` B.1). The add commit now pins that author (`CommitOptions.author`, as
   the transition verbs do), so `{author}` and the commit author agree by construction. A name that
   slugs to nothing is a validation error naming the token (exit 1).
3. **`--set date=…` / `--set author=…` stay refused (exit 2), each with a true message naming its
   source** (AC 2). Accepting `--set date` would let the id disagree with its commit; `GIT_AUTHOR_DATE`
   is the way to choose the date. The other reserved names keep the shared message.
4. **`{n:N}` (`bug-176`) is implemented rather than dropped from the spec**: `n:N`, `N >= 1`, pads to a
   minimum of `N`. `{n}` keeps its 3-digit floor (every id in this repository has it); the spec row
   that said "no padding" is corrected to the engine, and `{n:1}` is the unpadded form. Same-class fix
   found here: `generateId` looked `{nn}`/`{nnn}` up under their own names while `memory add` passes
   only `n`, so a `{nnn}` pattern failed in `memory add`; every `{n}`-family token now reads `n`.
5. **bug-033**: `renderAddDocument` edits through `frontmatter-edit.ts`'s setter. A new
   `setFrontmatterEntry(content, key, valueYaml)` is the raw-value form `setFrontmatterField` now wraps,
   because `memory add` writes a flow sequence (`tags`) and keeps its existing quoting (title and
   `--set` values JSON-quoted, `id` plain) — so the only output change is the two bug fixes.
   Same class in the same file: `writtenFields` matched an indented key as a declaration; now
   top-level only.

**BDD.** Run as Jest suites citing the scenario (`grep -rln "P1.3-memory-add" test`). A scenario for
`{date}`/`{author}` was added to `P1.3-memory-add.feature` (`f7740a78`), executed by
`test/core/memory-add-date-author.test.ts`.

**AC classification (T1).**

| AC | Class | Why |
|---|---|---|
| 1 — `{date}` / `{author}` expand; clock read once through a seam | **red-first** | `missing value for token {date}` on `main` |
| 2 — `--set date=…` refused with a true message, stated in `spec-008` §10 | **red-first** | the message changes (design 3) |
| 3 — nested keys and inline comments of the template kept | **red-first** | `bug-033`'s reproduction fails on `main` |
| 4 — `spec-009` §1 points to `spec-001`'s `{slug}` rule | characterization (documentation) | no behaviour |
| `bug-176` — `{n:N}` | **red-first** | `idPatternIssues('task-{n:3}-{slug}')` → malformed on `main` |

### red (developer)

`3ff70ceb`: new `test/core/memory-add-date-author.test.ts`; additions to `test/memory/add.test.ts`
and `test/validation/id.test.ts`; `test/core/memory-add-id-tokens.test.ts`'s "{date} stays
unsupported" case and its `date=` refusal row rewritten to the new contract.
`npx jest test/core/memory-add-date-author.test.ts test/core/memory-add-id-tokens.test.ts test/memory/add.test.ts test/validation/id.test.ts`
→ **4 suites failed; 22 failed, 52 passed of 74**. Every failure is an AC: `{date}`/`{author}`
unexpanded (AC 1), the two `--set` messages (AC 2), the nested `title` and stripped comments, and
`writtenFields`'s nested match (AC 3), `{n:N}` malformed and `{nnn}` missing (`bug-176`). The one
new case that passed, "still refuses `{n:}` / `{n:0}`", is a guard (characterization), not a red.

### green (developer)

`31326633`, `fix(memory)`: `src/validation/id.ts` (`{n:N}`, exported `isNumericToken`, the `n` value
for every numeric token); `src/memory/frontmatter-edit.ts` (`setFrontmatterEntry`);
`src/memory/add.ts` (`readAuthorDate`, `formatIdDate`, `IdTokenSources`, `{date}`/`{author}` in
`expandFieldTokens`, `reservedSetMessage`, `renderAddDocument` through the shared setter, top-level
`writtenFields`); `src/core/index.ts` (reads the date once when the pattern has `{date}`, passes the
author name, pins author and date on the add commit). Three expectations in
`memory-add-id-tokens.test.ts` and one in `test/cli/memory-add-set.integration.test.ts` (`be37daa8`)
asserted `/^kind: "patch"$/m` — the stripped comment of `bug-033` — and now assert the comment kept.
`npx jest test/core/memory-add test/memory test/validation test/core/memory` → 51 suites, 941 passed.

`9550eccf`: `docs/cli-reference.md`'s `memory add` entry names the two tokens' sources and `{n:N}`.
`command-baseline` is unchanged: the author date is not repository state, so it is no baseline.

### refactor (developer)

`7a67c7d3` pins an unparsable `GIT_AUTHOR_DATE` (exit 1, `IO`, nothing written). `25d654ce` splits
the pure `identDate` parse out of `readAuthorDate` so its refusal is unit-tested, and pins
`formatIdDate` and `expandFieldTokens`'s order with and without sources.

Gates on `25d654ce`, with the three pending spec amendments in the working tree:

| Command | Result |
|---|---|
| `npm run test:coverage` (same suite as `npm test`) | exit 0; 209 suites / 3548 tests; stmts 98.86 / branches 95.49 / funcs 95.30 / lines 99.57 |
| same, on the base `243f8f05` (temporary detached worktree) | 208 / 3522; 98.86 / 95.45 / 95.29 / 99.57: no regression |
| `npm run -s lint` | exit 0 |
| `npm run -s docs:api` | exit 0 |
| `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| `npx tsc -p tsconfig.build.json --noEmit` | exit 0 |

After the BDD case (`f7740a78`), `npm test` → 209 suites / 3549 tests, exit 0.
Totals read from `coverage/coverage-final.json` with `istanbul-lib-coverage`. `src/memory/add.ts`
100 / 98.61 / 100 / 100 (base 100 / 98.24). `test/docs/name-resolvability.test.ts` passes with the
spec edits: no new unresolved name (the untriaged counts for the three specs are unchanged).

Dogfood (`npm run -s build`, then `renderAddDocument` from `dist/memory/add.js` on this repository's
`.wingfoil/memory/templates/bug.md`): `id`, `title`, `status` keep their `# …` comments.

### review (reviewer)

Evidence per AC:
- AC 1: `memory-add-date-author.test.ts` "expands to the UTC YYYYMMDD…" (`bug-20260930-x`), "is read
  once per call…", "pins the add commit…", the three `{author}` cases, "expands in spec-001 order",
  and the BDD case. "Read once" holds by construction (one `readAuthorDate` call in `memoryAddFn`);
  the test shows its observable consequence, that every `{date}` and the commit date agree.
- AC 2: the two `--set` rows in the same file and in `memory-add-id-tokens.test.ts`; `spec-008` §10
  (pending amendment).
- AC 3: `test/memory/add.test.ts` "fills the top-level title, not a nested one…" (the `bug-033`
  reproduction, byte-exact), "keeps the comment on tags and on a --set field", `writtenFields`.
- AC 4: `spec-009` §1 bullet (pending amendment); `grep -n -i slug` on it now hits that bullet.
- `bug-176`: `test/validation/id.test.ts` `{n:N}` block; `memory-add-date-author.test.ts` `{n:2}`,
  `{n:1}`, `{nnn}`.

Same-class search in the files touched: `git grep -n '\[ \\\\t\]\*' <rev> -- src/memory src/core` → two
hits at `243f8f05` (the private setter and `writtenFields`, both in `src/memory/add.ts`), none at
`HEAD`, so no indentation-tolerant key match is left on the add path.

### Review fixes (coordinator review, 2026-10-03: approve with fixes)

1. **The pinned author date with few digits of seconds.** `readAuthorDate` returns git's bare
   `<seconds> <offset>`, and the add commit was given it as `GIT_AUTHOR_DATE` unchanged; git re-parses
   that form as a timestamp only from 9 digits of seconds up. With `GIT_AUTHOR_DATE='@0 +0000'` the id
   was built (`bug-19700101-…`), then `git commit` died with `fatal: invalid date format: 0 +0000`,
   exit 1, the new file left staged. Red-first: `memory-add-date-author.test.ts` "pins an epoch date
   with few digits too (@0 +0000 → 19700101), leaving nothing staged" → `npx jest
   test/core/memory-add-date-author.test.ts` 1 failed / 14 passed, the failure printing that `fatal:`.
   Fix: the commit gets `@<seconds> <offset>` (`src/core/index.ts`) → 15 passed. Checked by hand with
   the built CLI on a scratch repository (`bug-{date}-{author}-{n:2}`, `GIT_AUTHOR_DATE='@0 +0000'`) →
   `bug-19700101-ada-01`, exit 0, `git status --porcelain` empty. Design decision 1's wording is
   corrected (it said "any format git parses"). The other failure paths this task adds — an
   unparsable `GIT_AUTHOR_DATE`, an author name that slugs to nothing — fail before anything is
   written; the date one asserts `git status --porcelain` is empty.
2. **`docs/cli-reference.md`**: the exit-1 list names the two new failures with their messages, and
   `{date}` is "today (UTC)". The pending `spec-008` §10 amendment gains the same two rows. Messages
   checked with the built CLI: `error: value for token {author} is empty once the git author name
   "李明" is slugged` and `error: E_GIT_READ_FAILED: git var GIT_AUTHOR_IDENT failed in <root>: fatal:
   invalid date format: not a date`, both exit 1.

Gates after the fixes: `npx jest test/core/memory-add test/memory test/validation test/docs
test/cli/memory-add-set.integration.test.ts` → 43 suites / 713 tests passed; `npm run -s lint`,
`npm run -s docs:api`, both `tsc` → exit 0.

**Pending amendments (approver)** — edited in the worktree, uncommitted, for `memory amend`:
- `spec-001-memory-yaml-schema` — `--reason "task-163: the {date}, {author} and {n:N} placeholder rows state what memory add implements: {date} is the UTC date of the add commit's author date (GIT_AUTHOR_DATE or the clock), {author} the slugged author name, {n} pads to three digits and {n:N} to N; counter step 3 drops its not-implemented note (bug-158, bug-176)."`
- `spec-008-cli-grammar` — `--reason "task-163: §10 gives --set date and --set author their own refusal messages, each naming where the value comes from, since memory add now fills both tokens, and its error table gains the two exit-1 failures those tokens add: an author name that slugs to nothing and a GIT_AUTHOR_DATE git cannot parse (bug-158)."`
- `spec-009-validation-strategy` — `--reason "task-163: §1's character-class bullet points to spec-001's {slug} row instead of restating the rule, which closes the spec-009 half of dl-107 Action 1 (bug-157)."`

**Merge order.** `task-162` also edits `spec-001` and merges first; this amendment touches the
placeholder table, counter step 3 and appends one Revision note, so a conflict, if any, is at the end
of the Process Notes.

**For the approver.** Design decisions 1–5 above. `dl-107` itself is not edited: its Action 1 now has
both halves done (`spec-001` in `0f68c739`, `spec-009` here); recording that on the `ready` DL would be
another amendment, not proposed.
