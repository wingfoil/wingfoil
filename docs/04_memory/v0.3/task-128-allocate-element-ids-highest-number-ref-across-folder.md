---
id: "task-128-allocate-element-ids-highest-number-ref-across-folder"
type: task
title: "Allocate element ids from the highest number on every ref, across every folder the type's path can resolve to"
status: done
release: "v0.3"
kind: "fix"
priority: "high"
tags: ["v0.3", "core", "memory", "ids", "determinism"]
ref: "dl-101"
bug: ["bug-087", "bug-162"]
depends_on: []
tmpl_version: 260703
wave: "w0"
---

## Description

`nextSequenceNumber` (`src/memory/add.ts:85`) returns the count of files in the working-tree folder + 1, so a gapped sequence reissues an id already taken (`bug-087`; it fired on this planning as `dl-130`), and a `task`'s per-release folder restarts the counter at 1 in every release (`bug-162`). Ratified `dl-101` (a): take the highest number + 1 across local and remote-tracking refs and the working tree, over every folder the type's path pattern resolves to (all `v0.*/` folders for `task`). Until this ships build-backlog adds tasks by hand.

## Acceptance Criteria

- (red-first) with `dl-001…dl-020, dl-022` committed (gap at 021), `memory add --type decision-log` creates `dl-023`, not `dl-022` (`bug-087`).
- (red-first) with `task-108` under `v0.2/` and nothing under `v0.3/`, `memory add --type task --set release=v0.3` creates `task-109-…` under `v0.3/` (`bug-162`).
- (red-first) a number taken only on another local branch or on a remote-tracking ref is skipped (new scenario in `P1.3-memory-add.feature`, as `dl-101` Action 3 asks).
- (red-first) the result is independent of ref enumeration order (sorted, `REQ-SYS-07`).
- (characterization) the command-baseline directive records the allocator's declared baseline (committed refs + working tree), with a `version:` bump.

## Implementation Notes

- **Size:** M · **wave:** 0 · **kind:** fix (`dl-133` Q1 (b)).
- **Implements:** dl-101 §2 (a), Action 3; command-baseline (declared baseline, dl-080).
- **Features:** P1.3.
- **Notes:** Proposal key: C03. no network access at `add` time (`git fetch` stays the operator's step, `dl-101` §1.1); (b) remote reservation is not in scope. `dl-101` §1's hand rule goes into the `git-conventions` directive (the task implementing `dl-119`, domain D); the release-health metric (`dl-101` Action 4) goes to the task implementing `dl-089`.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

Branch `task/task-128-allocate-element-ids-highest-number-ref-across-folder`, worktree
`../.wf2-wt/task-128`, cut from `main` at `6a28d281`. Start `5f87e09c`; `bug-087` and `bug-162`
`[planned → in-progress]` at `7fcc2b12` and `bab70d11`.

### design (architect)

**`depends_on` read (dl-015).** `depends_on: []`: nothing to read.

**Specs.** `spec-001-memory-yaml-schema` is `approved` (`grep -m1 '^status:'` → `approved`). Its
"Counter algorithm" already said `max(captured) + 1`, but it also said "all other `path` placeholders
are already literal values" (one folder, the cause of `bug-162`) and "the filesystem is the source of
truth" (one checkout, which `dl-101` replaces). The code followed neither half of step 5: it counted
matching files rather than taking their maximum (`bug-087`). The ACs require the spec to change, so
it was revised by hand in `f716fed2`: the counter's pattern treats every non-`{id}` token as a
wildcard; the candidates come from every local branch, remote-tracking ref, `HEAD` and the working
tree; no network; a failed git read is an error. A dated *Revision (2026-09-30)* note records it, with
no `version:` bump, as the file's earlier revisions did (tech-specs carry no `version:`, `dl-047`).
`dl-101` is `ready` (direction (a)).

**BDD.** This repository runs its BDD contracts as Jest suites that cite the `.feature` scenario
(`grep -rln "P1.3-memory-add" test` → `test/core/memory-add.test.ts`). The scenario `dl-101` Action 3
asks for, "The generated id skips a number already taken on another ref", was added to
`P1.3-memory-add.feature` in `f716fed2` and is executed by
`test/core/memory-add-id-allocation.test.ts`.

**AC classification (T1).**

| AC | Class | Why |
|---|---|---|
| 1 — gap at `dl-021` → `dl-023` | **red-first** | the count gives `dl-022` |
| 2 — `task-108` in `v0.2/` → `task-109` in `v0.3/` | **red-first** | the per-folder count gives `task-001` |
| 3 — a number taken only on another branch or remote-tracking ref is skipped (BDD) | **red-first** | the working-tree count cannot see refs |
| 4 — independent of ref enumeration order | **red-first as planned, corrected at red** (below) | |
| 5 — `command-baseline` records the declared baseline, version bump | characterization (documentation) | no behaviour |

**Design choices** (for the approver to confirm; see also review):
- *The working tree* is read as git sees it: `git ls-files --cached --others --exclude-standard`,
  i.e. the index plus untracked, non-ignored files. A file git ignores does not reserve a number.
- `HEAD` is scanned too, so a detached `HEAD` (a CI checkout) counts.
- A non-`{id}` path token matches **one or more** path segments, because `{scope}` is multi-segment
  (`rl-v1/rel-v0.3`, `memory.yaml` `plan.path` comment).
- Tags and stashes are not scanned; `dl-101` names local and remote-tracking refs.

### red (developer)

`4bf3d8dd`: `test/core/memory-add-id-allocation.test.ts` (ACs 1–4 through the registered
`memoryAdd` operation) and `test/memory/add-sequence.test.ts` (the pure maximum and the git reads).
`npx jest test/core/memory-add-id-allocation.test.ts test/memory/add-sequence.test.ts` →
**2 suites failed, 16 failed / 1 passed of 17**. The four core failures are the ACs:
`dl-022-probe` received for `dl-023-probe` (AC 1), `task-001-probe` for `task-109-probe` (AC 2),
`decision-003-use-redis` for `decision-006-use-redis` (AC 3), `decision-001-probe` for
`decision-008-probe` (AC 4). The 12 unit failures are `highestSequenceNumber is not a function` and
the new `nextSequenceNumber(root, path, id)` signature. The one pass, "is 1 in a repository with no
commit", passed against the old signature by accident (the root holds no `.md`) and is a
characterization.

**AC 4 correction.** Its red is real but it is carried by the missing ref scan, not by any order
dependence: the old count was order-independent too. The order property itself is a property of a
maximum, pinned by the permutation test in `add-sequence.test.ts` and by two repositories whose ref
names sort in opposite orders. No red was fabricated for it.

### green (developer)

`f9c6c1e4`, `fix(memory)`:
- `src/memory/add.ts`: `highestSequenceNumber(paths, pathPattern, idPattern)` (pure) builds one
  RegExp from the `path` pattern (`{id}` → the materialized `id_pattern` with `{n}` captured, every
  other token a wildcard) and takes the maximum. `nextSequenceNumber(root, pathPattern, idPattern)`
  collects the paths under the pattern's literal prefix from `git ls-files`, then from
  `listPathsAtRev` (`src/storage/commit.ts`) over the de-duplicated, sorted commits of
  `for-each-ref refs/heads refs/remotes` and `HEAD`, and adds one. `resolveTypeDirectory` is removed:
  nothing calls it any more (`grep -rn resolveTypeDirectory src test` → nothing).
- Git reads are `spawnSync` with stderr captured and a 256 MiB buffer. A spawn error or an unexpected
  exit status throws `StorageError` `E_GIT_READ_FAILED` (new, `src/storage/errors.ts`), which
  `memoryAddFn` already maps to `IO`, exit 1. `rev-parse --verify --quiet HEAD` exiting 1 is the one
  accepted miss (unborn `HEAD`). `listPathsAtRev` returning `null` for an enumerated commit also
  throws. No read fails silently. (`task-142` later unifies a git-read helper; none was built here.)
- `src/validation/id.ts`: `patternToSource(pattern, { captureNumeric })`, which `patternToRegExp` now
  wraps.
- `src/core/index.ts` calls the new signature, and its TSDoc no longer says the counter reads the
  working tree. The comments in `src/core/write-guard.ts` and two test files that said the absent-target
  guard is reachable "because the counter reads the working tree" now say why it still is: a
  slug-only id repeats with its title.
- `test/core/memory-add-symlink-target.test.ts` (`bug-120` D1): its fixture aimed a `{n}` id at a
  planted link by counting. Since a `{n}` id is now above every number any baseline holds, including
  the untracked link, that setup cannot reach the guard. The fixture now uses a slug-only
  `note-{slug}`, which aims at the link through the title; every assertion is unchanged in kind.

`npx jest test/core/memory-add-id-allocation.test.ts test/memory/add-sequence.test.ts test/memory/add.test.ts test/core/memory-add test/core/write-guard-dirty-target.test.ts test/validation`
→ 17 suites, 203 passed.

AC 5, `fc9e0e92`: `command-baseline` 1.1 gains *Declared baselines*, whose first entry is this
counter's baseline and why it may be wider than `HEAD` (it can only raise the number). The directive
had no version. A frontmatter `version:` key makes `directives list` warn
`unknown field(s) ignored: version, date` (`node dist/cli.js directives list --role developer`), so
the bump is a `**Version:** 1.1 · **Date:** 2026-09-30` body line, which `doc-versioning` allows.

### refactor (developer)

`e28bde44`: one `runGitRead` helper in place of a nullable reader with `?? ''` fallbacks. Two branches
the first full run left uncovered are now pinned: `git` absent from `PATH` (spawn `ENOENT`) and a
remote-tracking ref whose object is not a commit (`ls-tree` fails). A `{scope}/{id}.md` pattern
(no literal prefix) is also tested. The helper passes `env: process.env`, as `src/storage/commit.ts`
does, so a test's environment reaches git.

Gates, on `e28bde44`:

| Command | Result |
|---|---|
| `npm run test:coverage` (`jest --coverage`, the same suite as `npm test`) | exit 0; 163 suites / 2658 tests; 98.69 / 94.33 / 93.9 / 99.48 |
| same, on the base `bab70d11` (temporary detached worktree) | 2639 tests; 98.68 / 94.29 / 93.84 / 99.47: no regression |
| `npm run -s lint` | exit 0 |
| `npm run -s docs:api` | exit 0 |
| `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| `npx tsc -p tsconfig.build.json --noEmit` | exit 0 |

`src/memory/add.ts` is at 100 / 98.5 / 100 / 100. Its one uncovered branch, line 58, predates this
task (98.27 branches on the base).

**On this repository** (`npm run -s build`, then `nextSequenceNumber` from `dist/memory` at the
repository root): `task` → **247** (`task-246` is the highest, in `v0.3/`), `decision-log` →
**137** (`dl-136` is the highest on any ref), `bug` → **176**. The same all-refs scan `dl-101` §1
gives by hand agrees on `dl-136`. Cost, corrected at the independent review: **about 430–640 ms per
call, 1.4–1.7 s for the three**, measured with three runs of
`node -e 'const m=require("./dist/memory"); … process.hrtime.bigint() around each m.nextSequenceNumber(".", path, id) …'`
over the three types (runs: 635/503/545, 488/514/536, 529/429/465 ms), with
`git for-each-ref --format='%(objectname)' refs/heads refs/remotes | sort -u | wc -l` → 38 distinct
ref commits. The first version of this note said "all three in 438 ms", which was wrong.

### review (reviewer)

Unit and BDD suites green (gates above). Evidence per AC:
- AC 1: `memory-add-id-allocation.test.ts` "gap at 021", and `add-sequence.test.ts` "not the count".
- AC 2: "task-108 under v0.2/", and "spans every folder".
- AC 3: the BDD scenario test, and "a branch that is not checked out and a remote-tracking ref".
- AC 4: "ref names sorting in opposite orders", and the six-permutation test.
- AC 5: `command-baseline.md` *Declared baselines*, `**Version:** 1.1`.

Same-class search in the files touched: `grep -n "readdirSync\|statSync\|existsSync" src/memory/add.ts`
→ nothing, so no filesystem count is left (the two "working tree" mentions in that file describe the
new baseline). The comments that described the old counter (`src/core/index.ts`,
`src/core/write-guard.ts`, two test headers) were updated.

For the approver:
- The directive's version is a body line, not the `version:` key the AC names (reason above).
- `docs/cli-reference.md` still says "a per-type counter". It documents 0.2.2 and belongs to
  `user-docs`; it was left unchanged.
- The four design choices under *design*.

### review (independent)

An independent review (2026-09-30) returned **approve with fixes**. Four findings, all applied on
this branch with the task still `in-review`:

1. **False rationale about ignored files.** The symlink test's header said a `{n}` id "can no longer
   be aimed at a planted file". That is not true for a **git-ignored** file. The counter reads the
   working tree as git sees it, so an ignored file reserves no number. The reviewer planted an
   ignored `bug-013-x.md`, and `memory add` refused through `requireAbsentTarget` ("something already
   exists there", exit 1). The header now says "a planted file that git does not ignore". The same
   correction is made in `src/core/write-guard.ts` (`requireAbsentTarget`'s TSDoc), in the comment
   before the guard in `memoryAddFn` (`src/core/index.ts`) and in the header of
   `test/core/write-guard-dirty-target.test.ts`. Each now names the ignored-file case and states the
   guard's job: refuse, never overwrite.
2. **Wrong timing.** "All three in 438 ms" is corrected in *refactor* above, with the command used to
   measure it. The cost is linear in the number of distinct ref commits (one `git ls-tree` spawn
   each). Reducing it, for example by listing the prefix's tree object once per distinct tree, is left
   as a follow-up for `task-142`, which unifies the git-read helper.
3. **`{n:N}` in spec-001.** The rewritten counter step 3 named `{n:N}`, which the code does not
   implement (`idPatternIssues('task-{n:3}-{slug}')` reports a malformed token; only `{n}`, `{nn}`
   and `{nnn}` are accepted). Step 3 now names only the tokens the code accepts, and the
   *Revision (2026-09-30)* note records it. The placeholder table's `{n:N}` row is unchanged. That
   gap predates this task, and the coordinator is filing it separately.
4. **AC 5.** The `version:` bump the AC names is a body line, `**Version:** 1.1 · **Date:**
   2026-09-30`, because a frontmatter `version:` key makes `directives list` warn about an unknown
   field. **The approver should accept or overrule this.**
