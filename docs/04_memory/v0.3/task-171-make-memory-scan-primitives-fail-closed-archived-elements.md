---
id: "task-171-make-memory-scan-primitives-fail-closed-archived-elements"
type: task
title: "Make the Memory scan primitives fail closed on archived elements and tolerant of unreadable files"
status: in-review
release: "v0.3"
kind: "fix"
priority: "high"
tags: ["v0.3", "core", "memory", "query"]
ref: "dl-038"
bug: ["bug-031", "bug-164", "bug-188", "bug-189", "bug-201"]
depends_on: ["task-130-show-coreerror-details-surface-give-refusal-shape-under"]
tmpl_version: 260703
---

## Description

`listMemoryDocumentsByType` and `findMemoryDocumentByTypeAndId` (`src/memory/query.ts:207,241`) have no `includeArchived` option (`dl-038` option 1: default exclusion, mirroring `MemorySearchOptions`); one unparseable frontmatter throws from `parseYaml` (`query.ts:138`) and breaks search and by-id lookup repo-wide without naming the file (`bug-031`); files with no frontmatter come back as matches with a path and nothing else (`bug-164`, 14 of 481 matches here).

## Acceptance Criteria

- (red-first) both primitives exclude `deprecated`/`superseded` by default and include them with `includeArchived: true`; `task-038`'s characterization test is amended deliberately, citing `dl-038`.
- (red-first) one malformed Memory file no longer fails `memory search` or `memory submit <other-id>`; the malformed file is reported as a warning naming its repository-relative path (P4.13 sc.3's wording, `W_MEMORY_UNREADABLE`, shared with A's deduction).
- (red-first) `memory search` returns only elements with `id` and `type`; frontmatter-less files are left out (`bug-164`).
- (characterization) the TSDoc at `query.ts:126-129` matches the tolerant behaviour.
- (red-first; added at design 2026-10-05 for `bug-188`, absorbed by amend `d1f71ab1`) `memory history` lists a document one of whose revisions has frontmatter that is not YAML: exit 0, the revision is an entry whose `to` is `null` and whose `unreadable` names the parse error, and a `W_MEMORY_UNREADABLE` warning names the path and the commit. The consistency check (`verifyTransitionConsistency`) keeps refusing such a revision, so `scripts/check-governance.cjs` still reports it as "state not checked".
- (red-first; added at design for `bug-189`, absorbed by amend `abd748d1`) one rule for both baselines: a symbolic link under a Memory scan root is never followed or parsed, by the working-tree scan or by the scan at a commit; a `.md` link is reported as `W_MEMORY_UNREADABLE`, and a gitlink / nested repository is skipped by both.
- (red-first; added at design for `bug-201`, absorbed by amend `6ed9a134`) `atHeadOr` falls back only for an unborn `HEAD` or a `root` that is not a repository; any other failed git read is thrown, so the caller refuses it by name.

## Implementation Notes

- **Size:** M · **wave:** 2 · **kind:** fix (`dl-133` Q1 (b)).
- **Implements:** dl-038 option 1; spec-017 §1.4 (tolerant reads, P4.13 sc.3).
- **Features:** P1.5, P1.12, P4.13.
- **Notes:** Proposal key: C08.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.


## Execution Notes

Branch `task/task-171-make-memory-scan-primitives-fail-closed-archived-elements`, worktree
`../.wf2-wt/task-171`, cut from `main` at `c80167d6`. Start `e393ec59`; bug syncs `[planned →
in-progress]`: `bug-031` `5ce9113d`, `bug-164` `45d66ecc`, `bug-188` `274e2591`, `bug-189`
`4be592be`, `bug-201` `77aa0772`. Wave 2, batch B1.

### design (architect)

**`depends_on` read (dl-015).** `task-130` is `done` (`grep -n "^status:"`). From its Execution
Notes: a refusal's `details.issues` (`file`, `detail`) reach every surface (`src/core/error-details.ts`);
a success carries operator text on the `CoreResult.warnings` channel (task-169), rendered once by
`src/cli/warning.ts` on stderr. This task uses both and adds neither.

**Specs and decisions.** `spec-017` is `approved` and `dl-038` is `ready` (`grep -n "^status:"` on
both). `spec-017` §1.4 fixes the code and the message (`W_MEMORY_UNREADABLE`: `unreadable frontmatter
in <file>: <reason>`) and §2 the shape (`spec-003`'s `{ code, severity, file, path, message }`, `file`
repository-relative). `dl-038`'s Actions ask, for option 1, that the new default be stated in
`spec-004` §2.1 and `spec-012`; both are `approved`, so those edits are pending amendments (below).
The bug list grew after planning: `bug-188`, `bug-189` and `bug-201` were absorbed by the approver's
amends `d1f71ab1`, `abd748d1`, `6ed9a134` (`git show --stat`), without ACs. Three ACs are added above
for them, derived from each bug's Expected Behavior.

**Measured before any change** (`npm run build`, `node dist/cli.js`, this repository at `77aa0772`):
- `memory search --format json` → 731 matches, 14 with no `id` and no `type` (bug-164: the
  `docs/05_plans` files `dl-019` grandfathered).
- `memory history task-070-license-file` → exit 2, `error: bad indentation of a mapping entry
  (5:264)`, no file named (bug-188, and bug-031's missing file name).

**Decisions taken (approver to confirm):**

1. **Where the warning comes from.** The scan primitives take an `onDiagnostic` callback and report
   each `W_MEMORY_UNREADABLE` as a `Diagnostic` (`src/validation/diagnostic.ts`) in path order, so
   `task-198`'s deduction can take the same objects. `memoryUnreadableDiagnostic(file, reason)` is the
   one builder. The reason is the first line of the YAML error (the excerpt js-yaml appends is
   dropped), as `scripts/check-governance.cjs` already does. Core renders each one with
   `formatDiagnostic` onto `CoreResult.warnings`: `W_MEMORY_UNREADABLE (<file>): unreadable
   frontmatter in <file>: <reason>`. A by-id lookup stops at its match, so it reports only the files
   it read before it.
2. **What `memory search` leaves out silently.** A file with no `id` or no `type` is not an element and
   is not reported: in this repository it would print 14 warnings on every search. Only a file whose
   frontmatter does not parse, or a `.md` symbolic link, is reported. `spec-017` §1.4 asks deduction to
   *report* the frontmatter-less plans; that is `task-198`'s choice, and the builder is shared.
3. **`includeArchived`** is added to `listMemoryDocumentsByType`, `findMemoryDocumentByTypeAndId` and
   its `…AtRev` sibling, default `false` (`dl-038` option 1). `wingfoil://memory/{type}/{id}` passes
   `true`, the collection Resource drops its own filter, and `assembleExecutionContext` keeps its
   result filter (it now holds by construction). `findMemoryDocumentById` stays neutral: `memory
   history` and the transition verbs must reach an archived element, and `dl-038` names only the two
   primitives.
4. **A transition whose id is not found while a committed document was unreadable** stays `NOT_FOUND`
   with the pinned first sentence `document not found: <id>` (P1.6 sc.3), and a second sentence names
   the unreadable `HEAD:<path>`s, because the id may be in one of them. A found id succeeds and carries
   the warnings, on all five verbs (and the `supersedes:` finalize).
5. **Symbolic links (bug-189): skipped by both baselines.** The commit read is the deterministic one
   (the bug's Notes), and following a link can leave the root (REQ-SEC-06). A `.md` link is reported;
   a link to a directory and a gitlink / nested repository (a directory holding `.git`) are skipped
   without a report, as the commit read already skips a gitlink. One exception, for explanation only:
   the transition verbs' `uncommittedDocumentPath`, which words a refusal already decided at `HEAD`,
   keeps following links (`followSymlinks: true`), so the `bug-117`/`bug-120` refusals keep naming the
   link (`command-baseline`: the working tree may explain a refusal, never decide one).
6. **`memory history` (bug-188).** The entry gets an `unreadable` key only when that revision does not
   parse, so every other entry keeps its shape. The next entry's `from` is then `null`, since the state
   before it is unknown. `verifyTransitionConsistency` stays strict (throws the `ValidationError`), so
   `check-governance` keeps its "state not checked" report (`test/cli/check-governance.test.ts`).
7. **`atHeadOr` (bug-201)** takes `root` and falls back on `E_GIT_READ_FAILED` only when `root` holds no
   `.git`. Everything else, `git` that cannot be spawned included, is thrown. Before, its TSDoc listed
   "no runnable `git`" as a fallback case; that sentence goes.

**Out of scope, reported, not changed:** `src/core/relevance.ts` still reads with the strict
`loadMemoryDocumentSummary`, so one malformed document still aborts an agent's relevance filter.
Changing that changes a context payload `spec-012` governs.

**AC classification (T1).**

| AC | Class | Why |
|---|---|---|
| 1 — `includeArchived` on both primitives, task-038's test amended | **red-first** | no option today; both return archived elements |
| 2 — one malformed file fails neither `memory search` nor `memory submit <other-id>`; warning names it | **red-first** | both refuse today (exit 2 / exit 1) |
| 3 — `memory search` returns only elements | **red-first** | 14 id-less matches today |
| 4 — the TSDoc at `query.ts:126-129` | characterization (documentation) | it already promises tolerance; the code now matches it |
| 5 — `memory history` over an unparsable revision (bug-188) | **red-first** | exit 2 today |
| 6 — one symlink/gitlink rule (bug-189) | **red-first** | the working tree follows links today |
| 7 — `atHeadOr` (bug-201) | **red-first** | every `E_GIT_READ_FAILED` falls back today |

### red (developer)

`e434c395`. New suites `test/memory/query-tolerant.test.ts` (primitives) and
`test/core/memory-scan-tolerant.test.ts` (search, history, `atHeadOr`). Amended on purpose, each with
a comment naming why:
- `task-038`'s `listMemoryDocumentsByType` characterization in `test/memory/query.test.ts`, citing
  `dl-038`;
- that file's search fixtures, which had no `type:`, and its two cases that pinned an id-less or
  type-less match (`bug-164`);
- three tests that pinned a throw on unparsable frontmatter: `task-247`'s review fix 5
  (`memory-transition-head-baseline`, now two cases), `task-142`'s finding 4 (`git-read`), and the
  context-assembly contract (`context.test.ts`).

BDD: `P1.5-memory-search.feature` and `P1.10-memory-history.feature` each gain two edge scenarios. The
new suites implement them.

`npx jest` on the six touched suites → **28 failed, 118 passed, 146 total** (6 suites failed). The
`atHeadOr` characterization cases also fail on the old code, because the signature gains `root`. That
is a compile-shape failure, not a fabricated red: their behaviour (fallback for an unborn `HEAD` and
for a non-repository) is unchanged.

### green (developer)

`ea2a37be`.
- `src/memory/query.ts`: the tolerant scans, `W_MEMORY_UNREADABLE`, `memoryUnreadableDiagnostic`,
  `includeArchived`, the element filter, and the link rule.
- `src/storage/commit.ts`: `listBlobEntriesAtRev`; `listPathsAtRev` is now built on it.
- `src/core/revision.ts`: `listBlobEntriesAtCommit`; `atHeadOr(root, …)`.
- `src/memory/audit.ts`: tolerant `reconstructMemoryTransitions`, strict `verifyTransitionConsistency`.
- `src/core/index.ts`: warnings on search, history and the five verbs.
- `src/core/memory-transition.ts`: the tolerant lookup at `HEAD`, the `NOT_FOUND` note, and
  `followSymlinks` on the explaining read.
- `src/mcp/memory-resource.ts` and `src/core/context.ts`: the `dl-038` call sites.

Two test fixes surfaced by the full run:
- `test/core/helpers/reference-repo.ts`: the 1,000-document fixture had no `type:`, so after
  `bug-164` no document was an element; it now carries each document's real type.
- `test/memory/query-at-rev.test.ts`: the spy moves to `listBlobEntriesAtRev`, the lister the scan now
  calls.

One test typo in the red suite was fixed: `?.id` on a `MemoryDocumentSummary`, which `tsc` refused.

`docs/cli-reference.md` (`e14b0d0c`): the `memory history` and `memory search` entries describe the v0.3
behaviour.

Measured on this repository with `npm run build` and `node dist/cli.js`:
- `memory search --format json` → 717 matches, 0 without `id` or `type` (731 and 14 before);
- `memory history task-070-license-file` → exit 0 with two `W_MEMORY_UNREADABLE` warnings, at
  `a651335d` and `ff388267` (exit 2 before).

### refactor (developer)

| gate | command | result |
|---|---|---|
| unit + BDD | `npm run test:coverage` (all suites) | 220 suites, **3917 passed**, 0 failed |
| coverage | same run, `All files` | statements 98.72 %, branches 95.08 %, functions 95.46 %, lines 99.45 % |
| lint | `npm run lint` | exit 0 |
| API docs | `npm run docs:api` | exit 0 |
| typecheck | `npx tsc --noEmit -p tsconfig.json`; `npx tsc -p tsconfig.build.json --noEmit` | exit 0, exit 0 |
| governance | `node scripts/check-governance.cjs --base c80167d6` | exit 0 |
| docs gates | `npx jest test/docs` | 34 passed |

Latency under load: on the first targeted run `test/mcp/resource-latency.test.ts` failed one p95 case.
Re-run alone (`npx jest test/mcp/resource-latency.test.ts`) → 4 passed, and the full run passed. No
threshold was touched.

### review (self, reviewer)

| AC | status | evidence |
|---|---|---|
| 1 `includeArchived` | met | `query-tolerant` "dl-038 option 1" block; `query.test.ts` AC2 amended, citing `dl-038` |
| 2 malformed file fails neither search nor submit; warning names the path | met | `memory-scan-tolerant` search cases; `memory-transition-head-baseline` "task-171" cases (submit ok + warning; a miss names `HEAD:<path>`) |
| 3 search returns only elements | met | `query-tolerant` bug-164 block; this repository: 0 of 717 without `id`/`type` |
| 4 TSDoc | met | `loadMemoryDocumentSummary`'s TSDoc now says the single-file read throws and the scans are tolerant |
| 5 history over an unparsable revision | met | `memory-scan-tolerant` bug-188 case; `check-governance.test.ts` "does not parse" still passes (strict verify) |
| 6 one link rule | met | `query-tolerant` bug-189 block (both baselines, same diagnostic); the symlink/confinement suites of the transition verbs still pass |
| 7 `atHeadOr` | met | `memory-scan-tolerant` bug-201 block: an unspawnable `git` (PATH emptied) throws `E_GIT_READ_FAILED` |

Same-class check in the files I touched: `grep -rn "loadMemoryDocumentSummary\|listMemoryDocumentPaths" src`
→ only `src/core/relevance.ts` still scans with a strict read. It is out of scope (design, above) and
is reported, not changed.

**Pending amendments (approver)**, edited in the worktree and left uncommitted:
- `spec-004-mcp-surface-contract`: §2.1 bullet plus a dated Revision note. Proposed `--reason`: "States
  in §2.1 that wingfoil://memory/{type} leaves archived elements out and the single-document Resource
  still returns them, per dl-038 option 1 (task-171); behaviour unchanged."
- `spec-012-context-loader-relevance-filtering`: a §6 sentence plus a dated Revision note. Proposed
  `--reason`: "States in §6 that the Memory scan primitives exclude archived documents by default with
  an explicit includeArchived opt-in, per dl-038 option 1 (task-171)."
