---
id: "task-192-stamp-wingfoil-commit-wingfoil-version-semver-sha-pin"
type: task
title: "Stamp every WingFoil commit with `WingFoil-Version: <semver> (<sha>)` and pin `git commit --cleanup`"
status: in-progress
release: "v0.3"
kind: "feature"
priority: "high"
tags: ["v0.3", "core", "storage", "build", "audit"]
ref: "dl-111"
bug: ["bug-051"]
depends_on: ["task-166-settle-reason-block-grammar-shape-rule-terminator"]
tmpl_version: 260703
---

## Description

No commit says which build wrote it. Ratified: the `build` script writes `dist/build-info.json` (`{version, commit}`, `-dirty` suffix, no timestamp); `commitPaths` appends the trailer paragraph; `wingfoil --version` prints `<semver> (<sha>)`; `memory history` surfaces it. A run without the file writes `(unknown)`. In the same primitive, `commitPaths` (`src/storage/commit.ts:80`) passes no `--cleanup`, so the declared body normal form depends on the operator's git config (`bug-051`). B's run record reuses the stamp (`spec-016` run-record field 13).

## Acceptance Criteria

- (red-first) every commit written through `commitPaths` ends with a trailer paragraph whose `git log --format='%(trailers:key=WingFoil-Version,valueonly)'` is `<package version> (<sha>)`, or `(unknown)` when no build-info exists; one test per commit site family (memory, dna, directive, init).
- (red-first) two builds of one clean commit produce byte-identical `build-info.json`; a dirty tree stamps `<sha>-dirty`.
- (red-first) `wingfoil --version` prints `<semver> (<sha>)`.
- (red-first) `memory history` entries carry a `wingfoil` field when the trailer is present.
- (red-first) with `commit.cleanup=verbatim` in the fixture's git config, a reason with trailing whitespace and blank-line runs is still stored normalized (`--cleanup=whitespace` pinned); the four cleanup modes are covered (`bug-051`).
- (characterization) `npm pack --dry-run` includes `dist/build-info.json`; `publish.yml`'s `--ignore-scripts` pack still gets it (built by `build`, not `prepack`).

## Implementation Notes

- **Size:** M · **wave:** 2 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-111 Q2 (a), Q3 (i), Actions 2–3; spec-004 §4.3 (trailer paragraph); spec-008 §2.
- **Features:** P1.2, P1.10.
- **Notes:** Proposal key: C06. `package.json` `build`, `scripts/`, `src/storage/commit.ts`, `src/cli/program.ts`, `src/memory/history.ts`. The `dl-089` metric (Action 4) belongs to that DL's task (domain D).
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

### design (architect)

**`depends_on`** (dl-015). `task-166` (`done`) already reserved `WingFoil-Version` in
`RESERVED_TRAILER_LINE_RE`, case-insensitively, and amended `dl-067` clause 4 and `spec-008` §2's
`--reason` row (`grep -n "WingFoil-Version" src/memory/commit-message.ts` → line 53). That is `dl-111`
Q1 (A) and half of Action 2, so this task does not touch the refusal.

**Decisions and specs cited.** `dl-111` `ready`, ratified with Q1 (A), Q2 (a), Q3 (i)
(`git log --follow --grep='approve dl-111' -- docs/04_memory/design/dls/dl-111-*.md` → `a42d540e`);
`bug-051` `in-progress`; `spec-004`, `spec-008`, `spec-016` `approved` (`grep -m1 '^status:'` on each).
Both specs are `amendable` tech-specs, so their edits are pending amendments, below.

**Design decisions** (to confirm at review):
1. **The record.** `scripts/write-build-info.cjs`, run by `build` after `tsc`
   (`"build": "tsc -p tsconfig.build.json && node scripts/write-build-info.cjs"`). `commit` is
   `git rev-parse HEAD`, `-dirty` when `git status --porcelain` lists anything (untracked files
   included: the built tree is then not the commit), `unknown` when git cannot answer. The file is
   always written, so no stale record survives a rebuild. Two-space JSON, fixed key order, no
   timestamp.
2. **The reader.** `src/storage/build-stamp.ts` `readBuildStamp()`: version from `package.json` (two
   levels above the module, in `src/` and `dist/` alike), commit from `build-info.json` (one level
   above). A commit not matching `^[0-9a-f]{7,64}(-dirty)?$` reads as `unknown`, so a malformed record
   cannot inject a line into the trailer.
3. **The trailer is a paragraph of its own**, appended by `commitPaths` as a string, not through
   `git commit --trailer`: an `Approver:`/`Reason:` body is itself trailer-shaped, and git would merge
   the signature into it, which would make `parseReasonBlock` read the whole body as the trailer block
   and cut a multi-line reason short.
4. **`--cleanup=whitespace`** is passed by `commitPaths` (bug-051): it is git's default for `-m`, so
   nothing changes under the default config, and the declared normal form now holds under `strip`,
   `verbatim` and `scissors` too.
5. **`CoreResult.commit.message` stays the operation's message**, without the trailer. The signature
   belongs to the primitive. Three tests (`memory-amend`, `memory-approve`, `memory-supersede`) had
   compared `commit.message` with `%B`; they now compare it with the operation's message.
6. **`memory history`**: `MemoryTransition.wingfoil: string | null`; the view adds `wingfoil` **only
   when present** (the AC's wording), so an entry without the key was written by hand or by an older
   build. `parseVersionTrailer` reads only the body's final paragraph when every line of it is
   trailer-shaped, as git does, and also accepts a body that is that paragraph alone (a subject-only
   commit).
7. **`--version`** prints the stamp. The MCP server's `serverInfo.version` stays the bare semver
   (`spec-014`), through `readPackageVersion`.
8. **The supersede recovery command**, which the operator runs by hand when the second commit
   fails, carries no trailer: "no trailer" means "not written by WingFoil".
9. `test/global-setup.cjs` builds with `npm run -s build`, so the suites drive a `dist/` that has its
   record. `scripts/e2e-smoke.cjs --expect-version X` accepts `X (<sha>)` as well as a bare `X`
   (older builds). `publish-staging.cjs` passes through it.

**AC classification (T1).**

| AC | Class | Why |
|---|---|---|
| 1 — trailer on every `commitPaths` commit, one test per family | **red-first** | no commit carried one (`git grep -n WingFoil-Version c80167d6 -- src/storage` → nothing) |
| 2 — byte-identical record, `-dirty` | **red-first** | no record or writer existed |
| 3 — `--version` prints `<semver> (<sha>)` | **red-first** | it printed `package.json`'s version |
| 4 — `memory history` `wingfoil` field | **red-first** | no such field |
| 5 — `--cleanup=whitespace` pinned, four modes | **red-first** for `strip` (a `#` reason line was deleted) and for a raw message under `verbatim`. The *reason* under `verbatim` is characterization, since `normalizeReason` already writes it normalized | `bug-051` steps 2 and 4 |
| 6 — `npm pack` includes `dist/build-info.json` | **characterization** | `files: ["dist", …]` already ships anything under `dist/` |

### red (developer)

`e2efb456`: `test/storage/wingfoil-version-trailer.test.ts` (commitPaths shape; init, memory add and
deprecate, dna set, directive create and remove; five cleanup modes × raw message and deprecate
reason), `test/storage/build-stamp.test.ts`, `test/cli/build-info.test.ts` (writer, `build` script,
dist record, compiled `--version`, compiled `init`/`memory add` trailer, `memory history` field), three
`memory-history` cases, and `--version` expectations in `program.test.ts`, `program.integration.test.ts`
and `npm-distribution.test.ts`.
`npx jest test/storage/wingfoil-version-trailer.test.ts test/storage/build-stamp.test.ts test/cli/build-info.test.ts test/core/memory-history.test.ts test/cli/program.test.ts test/cli/program.integration.test.ts test/cli/npm-distribution.test.ts`
→ **7 suites failed, 34 tests failed, 134 passed** (the implementation set aside, a clean tree). The
failures are the new cases; the passing ones are the untouched cases of those files and the
`commit.cleanup=` deprecate-reason rows except `strip`, as classified.

### green (developer)

`ab8b2898`: as design 1–9. Two test defects showed up at green and were fixed there: `%B` adds a
newline git does not store, so the exact-body helper reads `git cat-file commit`; `directive remove`
takes its name as `positional`. 15 suites pinned a whole commit body or `--version`; each now appends
the trailer (`test/storage/helpers/stamp-trailer.ts` for `src/` runs,
`test/cli/helpers/dist-stamp.ts` for `dist/`). `publish-pipeline.test.ts` pins the new `build` script.
AC6's pack case was added to `npm-distribution.test.ts` and passed on its first run.
`docs/cli-reference.md`: Git side effects (the trailer and the pinned cleanup), `--version`, and
`memory history`'s `wingfoil` field, all marked Unreleased (v0.3).

### refactor (developer)

On `ab8b2898` plus the two pending amendments:

| Command | Result |
|---|---|
| `npm run test:coverage` | exit 0; 221 suites / 3935 tests; 98.89 / 95.6 / 95.37 / 99.58 (stmts / branches / funcs / lines); `build-stamp.ts` and `commit-message.ts` 100; `commit.ts` 98.8 / 97.11 / 100 / 100, uncovered lines 185, 374, 418 are not this task's |
| `npm run -s lint` | exit 0 |
| `npm run -s docs:api` | exit 0 |
| `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| `npx tsc -p tsconfig.build.json --noEmit` | exit 0 |
| `node scripts/check-governance.cjs --base c80167d6` | exit 0, 0 findings |
| `npm run -s build && node dist/cli.js --version` | `0.2.2 (ab8b2898…-dirty)` (dirty: the two pending amendments) |

The previous recorded baseline, `task-166`'s final tree, was 98.73 / 94.61 / 94.03 / 99.49, so there
is no regression. Coverage was not re-measured on `main` for this task.

BDD: P1.2 and P1.10 state no build signature, and no AC asks for a scenario (`grep -rn -i
"version" docs/02_requirements/02_bdd/features/p1-memory/P1.10-memory-history.feature` → nothing).
No scenario added; both suites are green in the full run.

### review (reviewer)

Evidence per AC:
- AC1: `wingfoil-version-trailer.test.ts` init, memory (add + deprecate), dna, directive (create +
  remove) cases, read through `%(trailers:key=WingFoil-Version,valueonly)`; the `<sha>` case through the
  compiled CLI in `build-info.test.ts`.
- AC2: `build-info.test.ts` "two builds … byte-identical", the two `-dirty` cases, `unknown`.
- AC3: `build-info.test.ts` "`wingfoil --version` prints `<semver> (<sha>)`", plus the updated
  `program`, `npm-distribution`, `commander-parse-exit-codes` and `missing-verb-exit-code` cases.
- AC4: `memory-history.test.ts` "the `wingfoil` field" describe (present, absent, final paragraph
  only, multi-line reason intact); end to end in `build-info.test.ts`.
- AC5: `wingfoil-version-trailer.test.ts` `commit.cleanup=` rows for unset, `strip`, `whitespace`,
  `verbatim`, `scissors`.
- AC6: `npm-distribution.test.ts` "includes dist/build-info.json".

Readers of the new trailer, checked against `dist/`:
`node -e` with `parseReasonBlock`/`reasonRefusalMessage`/`parseVersionTrailer` on
`Approver…\nReason: first line\n\nsecond paragraph, Action: amend x.\n\nWingFoil-Version: 0.3.0 (abc1234)`
gives the two-paragraph reason, no refusal and `0.3.0 (abc1234)`. `check-governance.test.ts` and
`reason-trailer*.test.ts` are green.

Same class in touched files: every whole-body `%B` pin in `test/` that the full run reported is fixed,
and `git grep -n "'--format=%B'" test` lists none still expecting a trailer-less tool commit (the
full run is green). README.md and `docs/user-guide.md` show a 0.2.2 approve commit without the
trailer. They describe the released build and are left to `user-docs`. CLAUDE.md §5.1 says
"`git commit -m` applies regardless", which belongs to `align-agent-docs`. Both are reported to the
coordinator.

### Pending amendments (approver)

Edited in this worktree and left uncommitted, for `memory amend` at the review gate:

- `spec-008-cli-grammar` — proposed `--reason`: "Section 2 per dl-111 (Q2 (a), Q3 (i), Action 2) and
  bug-051, carried out by task-192: the --version row prints the build stamp semver (sha), the
  normal-form note says the commit primitive passes --cleanup=whitespace instead of relying on git's
  default, and a new note states the WingFoil-Version trailer paragraph every commit ends with. The
  Revision note dated 2026-10-05 records it."
- `spec-004-mcp-surface-contract` — proposed `--reason`: "Section 4.3 item 2 shows the
  WingFoil-Version trailer paragraph that every commit, a Tool's included, ends with, per dl-111
  Action 2, carried out by task-192. The Revision note dated 2026-10-05 records it."
