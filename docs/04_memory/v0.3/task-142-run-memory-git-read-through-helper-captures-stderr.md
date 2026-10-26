---
id: "task-142-run-memory-git-read-through-helper-captures-stderr"
type: task
title: "Run every Memory git read through one helper that captures stderr, sets `maxBuffer` and fails loudly"
status: done
release: "v0.3"
kind: "fix"
priority: "medium"
tags: ["v0.3", "core", "memory", "git"]
ref: "spec-006"
bug: ["bug-072", "bug-093", "bug-097", "bug-178"]
depends_on: []
tmpl_version: 260703
wave: "w1"
---

## Description

`walkGitLogFields` (`src/memory/git-log.ts:84-90`) sets no `maxBuffer` and turns any error, ENOBUFS included, into an empty history (`bug-072`); it and `findElementCreationSha` (`history.ts:107`) inherit the operator's stderr (`bug-093`); `core.quotePath=false` and the probe's `stdio` are load-bearing and unpinned, and `audit.ts`'s `readStatusAt` TSDoc overclaims (`bug-097`). Workflow state deduction (A) reads history more, so a silent empty history becomes a wrong answer.

## Acceptance Criteria

- (red-first) a `git log` output above 1 MiB returns the full history (fixture with a long history or a lowered buffer seam), and a genuine git failure is an `IO` error, not `[]`.
- (red-first) the out-of-process harness in `test/memory/history-rename-path.test.ts` shows no git diagnostics on the operator's stderr for both call sites.
- (red-first) a non-ASCII element path round-trips through history (`core.quotePath=false` pinned).
- (characterization) the `readStatusAt` TSDoc says what the code does (T1).

## Implementation Notes

- **Size:** S · **wave:** 1 · **kind:** fix (`dl-133` Q1 (b)).
- **Implements:** spec-006 (error model); REQ-INT-08.
- **Features:** P1.10, P1.5.
- **Notes:** Proposal key: C07.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

Branch `task/task-142-run-memory-git-read-through-helper-captures-stderr`, worktree
`../.wf2-wt/task-142`, cut from `main` at `cac8a447`. Start `bc1895ec`; bug syncs `[planned →
in-progress]`: `bug-072` `1d4f7369`, `bug-093` `f20e1c03`, `bug-097` `d82a6e40`, `bug-178` `f1139ec0`.
`bug-178` was absorbed at triage as an added acceptance criterion (AC5 below).

### design (architect)

**`depends_on`:** none (`depends_on: []`). Two merged W1 tasks touch the same code, and their
Execution Notes were read for reuse. `task-137` added `resolveCommitAtRev`, `readPathsAtRev` and
`E_GIT_READ_FAILED` / `E_INVALID_REVISION` in `src/storage`. This task reuses the error codes and
`readPathsAtRev`'s `cat-file --batch` parsing pattern. `task-132` changed `commitPaths` (author via
env) and is not touched here.

**Specs.** `spec-006-core-domain-api` is `approved` (`grep -n '^status' …spec-006*` → `approved`);
its error model (§2) has `IO`, and this task uses it. `spec-001` is `approved`; its counter algorithm
fixes *which* baselines are read, not *how*, so batching changes no clause. `grep -rn "ls-tree\|walkGitLogFields\|getMemoryHistory" docs/04_memory/design/specs/ docs/02_requirements/02_bdd/features/p1-memory/`
→ no hit, so no spec or BDD scenario states the old `[]`-on-failure contract. No spec edit needed.

**Design.**
- One helper, `runGitRead` / `runGitReadBytes`, in new `src/storage/git-read.ts`, next to
  `E_GIT_READ_FAILED`. It replaces `src/memory/add.ts`'s local `runGitRead` (task-128), which already
  had the right shape. It pipes stderr and carries it inside the error. It sets a 256 MiB
  `maxBuffer`. Any exit status not listed in `accepted` throws `E_GIT_READ_FAILED`.
- `walkGitLogFields` stops returning `[]` on failure. One `fatal:` is still an answer: an unborn
  `HEAD` (a repository with no commit), which git reports with the same exit 128. Only after a
  failure, `rev-parse --verify --quiet HEAD^{commit}` exits 1 and the walk returns `[]`. A healthy
  walk costs no extra process.
- `findElementCreationSha` and `collectHistoricalPaths` go through the helper. They keep their
  contextual message prefix and now add git's own text.
- `readStatusAt` goes through the helper and accepts exit 128 as "no document here" (`null`). Its
  TSDoc now says that this read cannot tell absence from corruption. Verified: `git show HEAD:f.md`
  with the blob object deleted → `fatal: bad object`, exit 128; `git show HEAD:nope.md` → exit 128.
- `memory history` maps a `StorageError` from the walk to `CoreError` `IO`.
- `bug-178`: new `listPathsAtRevs` in `src/storage/commit.ts`. It returns the union of
  `listPathsAtRev` over many revisions. Round one is one `git cat-file --batch` for every revision's
  root tree (which proves that the revision names a commit) and its tree at the prefix. Each further
  directory level is one more batch, asking only for subtrees not read yet. The process count
  therefore depends on the directory depth, not on the ref count. `git rev-list --objects` was
  rejected: it de-duplicates by object, so an identical blob at two paths would report only one path.
- A structural pin for the `bug-093` rule: no `src/memory/*.ts` imports `child_process`.

**Contract change, for the approver.** `getMemoryHistory` and `auditAttribution` on a `root` that is
not a git repository used to return `[]`, and two tests pinned that (`test/memory/history.test.ts`,
`test/memory/audit.test.ts`). They now throw `E_GIT_READ_FAILED`. AC1 says "a genuine git failure is
an `IO` error, not `[]`", and "not a repository" is one. No production caller can reach it:
`memory history` runs at a root that `resolveProjectRoot` found by its `.git`.

**AC classification (T1).**

| AC | Class | Why |
|---|---|---|
| 1 — git log > 1 MiB read whole; genuine git failure is `IO`, not `[]` | **red-first** | `ENOBUFS` and every failure → `[]` today |
| 2 — no git diagnostics on the operator's stderr, both call sites (out-of-process harness) | **red-first** | `walkGitLogFields` and `findElementCreationSha` inherit fd 2 today |
| 3 — non-ASCII path round-trips (`core.quotePath=false` pinned) | **characterization** (reclassified) | the flag is already there and the behaviour is correct: the test passes on first run. Its value is the pin, shown by mutation (red section) |
| 4 — `readStatusAt` TSDoc says what the code does | characterization / documentation | no behaviour |
| 5 — (`bug-178`) id allocation reads every ref in a constant number of git processes | **red-first** | one `ls-tree` per distinct ref commit today |

### red (developer)

Commit `5060cdee`. `npx jest test/memory/git-read.test.ts test/memory/history-rename-path.test.ts test/memory/add-sequence.test.ts test/memory/history.test.ts test/memory/audit.test.ts`
→ **12 failed, 104 passed** (5 suites):
- `git-read.test.ts` (new), 6 red. A 1.25 MiB commit body read by `getMemoryHistory` →
  `Received length: 0`. A 1.25 MiB subject read by `auditAttribution`, whose fields have no `%b` →
  `[]`. `walkGitLogFields` over a deleted tree object → no throw. `getMemoryHistory` on a non-repo →
  no throw. `memory history` core op over a corrupt repo → `ok: true`. The `child_process` import
  rule → 4 modules (`add.ts`, `audit.ts`, `git-log.ts`, `history.ts`). An unborn `HEAD` still `[]`
  passed (characterization of the case kept).
- `history-rename-path.test.ts`, 3 red (AC2). An out-of-process call from `dist/` against a non-repo,
  for `walkGitLogFields` and `findElementCreationSha`, printed `fatal: not a git repository` on
  stderr. `collectHistoricalPaths` already had a clean stderr but did not carry git's text in its
  error (`bug-093` expected behaviour). AC3 (`caffè` path across a rename) passed on first run.
  **Mutation:** replacing `PATH_PROBE_ARGS` with `[]` → `npx jest … -t AC3` fails (3 extra
  `null`-path entries), restored with `git checkout src/memory/history.ts`.
- `add-sequence.test.ts`, 1 red (AC5). A `git` shim first on `PATH` counts invocations:
  `Expected: 6, Received: 16` (2 vs 12 branches).
- `history.test.ts` and `audit.test.ts`, 1 red each: the not-a-repo case flipped from `[]` to
  `E_GIT_READ_FAILED`.

### green (developer)

Commit `6ffffb37`, as designed. One deviation from the design: `spawnSync` rejects
`encoding: 'buffer'` when `input` is given (`TypeError: Unknown encoding: buffer`), so the bytes form
passes `encoding: undefined`. The last `add-sequence` test asserted the old mechanism's message
(`git ls-tree`). It now asserts the batch's message, which names the non-commit object.
`npx jest test/memory test/core/memory-history.test.ts test/storage` → green after that fix;
`npm test` → 190 suites, 3214 tests, all passed.

**Measured on this repository** (41 distinct ref commits by
`git for-each-ref refs/heads refs/remotes --format='%(objectname)' | sort -u | wc -l`; the same
script runs `nextSequenceNumber` for `task`, `dl`, `bug` against base `cac8a447` built from
`git archive` and against this branch, with a counting `git` shim, two runs each). Same answers
(`248`, `140`, `194`). **132 → 14** git processes for the three calls. About **1.3 s → 0.18 s** in
total (`process.hrtime`).

### refactor (developer)

Commit `137f97c5`. Added `test/storage/git-read.test.ts` (the helper's contract) and more
`list-paths-at-revs.test.ts` cases (shared subtree, missing subtree object, newline prefix fallback,
`env` option). These close the branches the first coverage run left open. The `auditAttribution`
TSDoc and one `history-scaffold-copy` test comment still claimed the walk returns `[]` on failure,
and both were corrected (same class as AC4; `grep -rn "whose catch returns\|never throws" src test`).

Gates, at `137f97c5`:
- `npm test` → 191 suites, 3222 tests at the run before the last two `list-paths-at-revs` cases (3224 after). One run had 1 failure,
  `test/core/query-latency.test.ts` (`memory search` p95, wall clock, other worktrees running jest).
  Re-run alone: `npx jest test/core/query-latency.test.ts` → 4 passed. `memory search` does no git
  read, so this task's code is not on that path.
- `npm run test:coverage` → 191 suites, 3224 tests, all passed. Coverage 98.83 / 95.21 / 95.08 / 99.53
  (statements / branches / functions / lines). `main`'s figures at the B2 merge, as recorded in
  `dev-loop-rel-v0.3-plan`, are 98.84 / 95.24 / 95.01 / 99.54. That is −0.01 / −0.03 / +0.07 / −0.01,
  inside the noise of the new code's unreachable guards (a truncated `cat-file` answer).
  The approver decides whether that counts as a regression.
- `npm run lint` → exit 0. `npm run docs:api` → exit 0, 0 warnings.
  `npx tsc --noEmit -p tsconfig.json` → 0. `npx tsc -p tsconfig.build.json --noEmit` → 0.
- No CLI command or help text changed, so `docs/cli-reference.md` is untouched.

### review (reviewer, self)

- AC1 met: `git-read.test.ts` "a git log past … 1 MiB" ×2 and "a genuine git failure …" ×3 (the
  core op answers `IO`, message `unable to read tree`).
- AC2 met: `history-rename-path.test.ts` "task-142 — no Memory git call writes …" ×3, which also
  pins the probe's stderr (`bug-097` item 2).
- AC3 met: "a non-ASCII element path round-trips", with the mutation above.
- AC4 met: `readStatusAt` TSDoc rewritten. The sentence `bug-097` item 3 quotes is gone, and the new
  text states the exit-128 ambiguity and what catches a broken walk instead.
- AC5 met: the `bug-178` spawn-count test, plus the measurement above.
- `grep -rln "child_process" src/memory` → nothing. Spawning code left in `src/` (`grep -rln
  "spawnSync\|execFileSync" src`): `src/core/git-identity.ts`, `src/core/confinement.ts`,
  `src/storage/commit.ts`, `src/storage/git-read.ts`, `src/validation/secret-scan.ts`. *Corrected
  by the independent review:* `readPathAtRev` / `listPathsAtRev` in `commit.ts` **are** Memory reads
  (callers `memory amend`, `memory add-type`, the loaders, the write guard), and they had the same
  defect. They now go through the helper (see "review (independent)" below). After that fix,
  `probeGit` is left only for `pathPorcelainStatus` and `commitParent`, which read no document
  content.
- Unasserted (T1): the 256 MiB ceiling itself is not exercised (a test would need over 256 MiB of
  git output). Only "past 1 MiB" is asserted.

### review (independent)

Verdict **APPROVE WITH FIXES**, five findings, all applied while the task stays `in-review`. The red
commit is `9e0d8ee0` and the fix is `3d125403`.

1. **The gitlink test was vacuous.** `update-index --cacheinfo 160000,…` was followed by
   `commitAll`'s `git add -A`, which dropped the entry because its path is absent on disk. The
   gitlink branch of `listPathsAtRevs` had 0 hits. The fixture now stages with `add -A` first, then
   adds the gitlink, then runs a plain `git commit`. The test asserts that `git ls-tree` shows the
   `160000 commit` entry before it asserts the entry is excluded.
2. **Zero-padded tree modes were read as files.** A legacy `040000` tree entry did not match the
   text comparison with `'40000'`. That under-counts ids, the `bug-087` reissue class. Modes are now
   compared by their type bits (`& 0o170000`). The red case is a tree written with
   `hash-object -t tree --literally`. `listPathsAtRev` already answered correctly, and `listPathsAtRevs`
   did not.
3. **`readPathAtRev` / `listPathsAtRev` had the same defect.** Through `probeGit` they had no
   `maxBuffer` and turned every failure into `null`, so a committed 1.2 MiB document read as absent.
   They now go through `runGitRead` with `accepted: [0, 128]`. Exit 128 stays `null`, because git
   gives that status to an absent path, an unresolvable revision and an unreadable object alike.
   Spawn and buffer failures throw. Red: `test/storage/read-at-rev-large.test.ts`, 3 failed out of 4.
   The 18,000-entry listing was checked to exceed 1 MiB before the assertion. The `revision.ts`
   comment saying `readPathAtRev` "answers `null` for every git failure" is now in the past tense.
4. **Coverage.** New tests cover the default prefix and the non-`StorageError` rethrow in
   `memoryHistoryFn`. The rethrow is pinned as today's behaviour (a `ValidationError` for unparsable
   frontmatter at a revision); that tolerance is `bug-188`'s, not this task's. Lines still uncovered
   in `commit.ts`:
   - 347 and 391, the "truncated answer" guards of the two `cat-file --batch` parsers. They fire only
     if git exits 0 having printed fewer header lines than it was sent requests, which no fixture can
     provoke without a fake git.
   - 158, `pathPorcelainStatus`'s default `?? ''`. This was already uncovered on `main`.
5. **The `listPathsAtRevs` TSDoc claimed equivalence "by construction".** The prefix is now
   canonicalised: leading `./` and trailing `/` are dropped, and a file prefix lists that file. The
   TSDoc narrows the claim to "compared case by case in the test" and names the spellings that are
   not normalised (`..`, inner `//`).

Gates at `3d125403`, each run alone:
- `npm test`: 192 suites, 3234 tests, all passed.
- `npm run test:coverage`: 192 suites, 3234 tests, coverage **98.85 / 95.34 / 95.09 / 99.55**. That
  is at or above `main`'s 98.84 / 95.24 / 95.01 / 99.54 on all four.
- `npm run lint`: exit 0. `npm run docs:api`: exit 0, 0 warnings. Both `tsc` runs: exit 0.

**Pending amendments (approver):** none. No approved element was edited.
