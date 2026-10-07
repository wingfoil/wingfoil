---
id: "task-210-add-dry-run-mutating-verb-through-commit-primitive"
type: task
title: "Add `--dry-run` to every mutating verb through the commit primitive"
status: in-review
release: "v0.3"
kind: "feature"
priority: "medium"
tags: ["v0.3", "core", "cli"]
ref: "dl-106"
bug: ["bug-217"]
depends_on: ["task-129-refuse-operand-beyond-command-declares-exit-2-before", "task-192-stamp-wingfoil-commit-wingfoil-version-semver-sha-pin"]
tmpl_version: 260703
---

## Description

Ratified: every operation registered `mutates: true` in `CORE_MODULES` (28 today, `grep -c "mutates: true" src/core/index.ts`) accepts `--dry-run`: it prints the transition, the paths and the diff the commit would contain, writes nothing and exits 0, or exits with the refusal's code. Implemented once, at the registry/commit-primitive level, so A's and B's new mutating operations inherit it.

## Acceptance Criteria

- (red-first) table-driven over the registry: every `mutates: true` op accepts `--dry-run`; afterwards `git status --porcelain` and `git rev-parse HEAD` are unchanged.
- (red-first) a dry run of a refused operation exits with that refusal's code.
- (red-first) `--format json` dry-run output lists `{paths, subject, diff}`.
- (characterization) `spec-008` §2 lists `--dry-run`; `docs/cli-reference.md` documents it.

## Implementation Notes

- **Size:** M · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-106 W2; spec-008 §2 (global flags).
- **Features:** P5.1.4.
- **Notes:** Proposal key: C24.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.
- **Handover from the W2 B4b triage (2026-10-06, `bug-217`).** A refusing pre-commit hook makes `memory add` print
  git's raw `error: Command failed: git -C <absolute path> commit --only ...` text, the absolute path included, before
  the hook's stderr; `bug-217` quotes it with the path elided. The raw text is the same class as `bug-251` (Node or git
  text with an absolute path on stderr): reword the refusal when fixing the staged leftover, or say why not.

## Execution Notes

### Design (architect)

- **Dependencies (dl-015).** `task-129` and `task-192` are `done` (`grep -n "^status:" docs/04_memory/v0.3/task-1{29,92}-*.md`);
  neither defers work to this task (`grep -n "task-210\|dry.run" …` → only `npm pack --dry-run` in task-192). The
  pending handover is `task-189`'s: `test/core/core-index-arms.test.ts` pinned memory add's rethrow arm on the raw
  hook error "pending bug-217 (owned by task-210)" — given another trigger below.
- **Specs.** `spec-008-cli-grammar` is `approved`, `dl-106` is `ready` (`grep -n "^status:"` on both). `spec-005` §1
  already defers `--dry-run`'s reporting to spec-008 (lines 65-68, 302-305), so only spec-008 changes.
- **How many operations.** The registry has **14** `mutates: true` operations, not 28 (task) nor 34 (batch notes):
  `grep -c "^\s*mutates: true," src/core/index.ts` → 14, while `grep -c "mutates: true" src/core/index.ts` → 34 also
  counts 20 comment lines. The table test asserts the 14 against `enumerateOperations(CORE_MODULES)`.
- **Where the mode lives.** One primitive, `writeAndCommit(root, changes, message, options)` (`src/storage/commit.ts`),
  replaces every `writeDocument`/`removeDocument` + `commitPaths` pair: `memory add` (`src/memory/entry.ts`), the
  transition verbs (`commitMemoryTransition`), the `dna` verbs, `directive create|assign|remove`, and `init`'s
  `initStorage` (`grep -rn "commitPaths(\|writeDocument(\|removeDocument(" src` after the change → only the
  definitions, the guards, and the supersede recovery write). The dry-run mode travels in an `AsyncLocalStorage`
  (`src/storage/dry-run.ts`), so operations never see the flag: at the commit point the primitive records the plan
  and throws a stop; `captureDryRun` reports the plan whatever the operation did with that throw. The raw writers
  throw during a dry run, so a future writer that bypasses the primitive fails the table test instead of writing.
- **Flag placement — decision for the approver.** `--dry-run` is added by the CLI registrar to every command whose
  operation `mutates` (derived, never declared), not registered on the root program: a read command, `init` and `mcp`
  refuse it as an unknown option (exit 2). A root-level global would have been accepted by `init`, which would then
  run for real. spec-008 §2 gets a row that names the commands, like `--reason`'s (the existing §2 exception).
  `task-245` (X_cli-cmds) says "global flag": it should describe it as above.
- **Plan shape.** `{dryRun: true, subject, message, paths, diff}`: AC3's three fields plus the full message (Reason/
  Approver body and the `WingFoil-Version:` trailer) and a discriminator. The diff is git's (first pass: `git diff
  --no-index` between two temp files; corrected at review, F3 below, to a blob-to-blob diff of the blobs the commit
  would record), with `--- a/<path>`/`+++ b/<path>` headers. `console` prints the payload as indented JSON, like every success today.
- **Known limits (in spec-008's row).** Git hooks are not run; `memory approve` whose `supersedes:` trigger fires
  plans only the approve commit (the finalize commit's message names the approve sha). The first pass also said "success
  warnings computed after the commit are not shown in a dry run", and that this was in spec-008's row: both false —
  the warnings were computed BEFORE the commit and every one was dropped, and the row did not say so (review F4, fixed
  below: they are now carried).
- **bug-217.** On a write or commit failure the primitive restores, for every path, the working-tree bytes (deletes a
  created file and the directories it created) and the index entry (`git ls-files -s` before, `update-index
  --force-remove` + `--index-info` after) — for the transition verbs too, which answers the bug's open question:
  `submit`'s uncommitted content is restored, not lost. A git failure becomes `StorageError` `E_COMMIT_FAILED`:
  `git did not commit <paths>: <git's stderr, one line, project root removed> — nothing was committed, and the working
  tree and the index are as they were`. git's stderr is captured, not inherited, so the hook's text no longer
  precedes the error raw, and `Command failed: git -C <abs>` is gone (handover: reworded). The one exception is
  `memory approve`'s finalize commit: its recovery tells the operator to commit the finalized file as it stands, so
  that path rewrites it after the rollback (`src/core/index.ts`, finalize catch).

| AC | Classification | Why |
|----|----------------|-----|
| 1 table-driven, writes nothing | red-first | no `--dry-run` existed (`grep -rniE "dry.run\|dryRun" src` → nothing at ed4607a4) |
| 2 refused dry run exits with the refusal's code | red-first | same |
| 3 JSON `{paths, subject, diff}` | red-first | same |
| 4 spec-008 §2 + cli-reference document it | **red-first** (was characterization) | neither file named `--dry-run` at ed4607a4; a doc test (`test/docs/dry-run-documented.test.ts`) now holds both |
| bug-217 rollback + reworded error | red-first | reproduced by the red run below |

### Red

Commit `17fd1aea`: `test/cli/dry-run.integration.test.ts`, `test/cli/commit-failure-rollback.integration.test.ts`,
`test/docs/dry-run-documented.test.ts`. `npx jest <those three> --verbose` → **23 failed, 5 passed**: every table row
`status: 2, unknown option '--dry-run'`; refusal rows expecting exit 1 got 2; `memory add` with a refusing hook left
`docs/memory/bug/bug-001-hooked.md` changed ("file changed after a refused write attempt"); both doc tests found no row.
The 5 passing: the registry-completeness test, the two exit-2 refusal rows (Commander's unknown-option exit coincides),
and the two "does not take `--dry-run`" tests.

### Green

Commit `5f544a67`: `src/storage/dry-run.ts`, `writeAndCommit` + `E_COMMIT_FAILED`, call sites converted,
`src/core/dry-run.ts` (`DRY_RUN_FLAG`, `runAsDryRun`), registrar wiring, and `buildFlagValues` reading Commander's
camel-cased key (`commanderKey`) — a dashed flag (`dry-run`) read as `undefined` before (same class as task-093's
options fix). `npx jest test/cli/dry-run.integration.test.ts test/cli/commit-failure-rollback.integration.test.ts` →
26 passed.

### Refactor

Commits `19c9b831`, `3f9392f8`, `60dc1f6b`. Directory cleanup simplified; unreachable arms removed from the failure
reason (a one-element sort comparator, a `realpathSync` catch) and one `gitEnv` helper shared; `test/storage/write-and-commit.test.ts` and
`test/cli/registrar-dry-run.test.ts` cover the arms the spawned CLI cannot show to coverage. Pins updated:
`test/cli/program.test.ts` (memory add now lists `--dry-run`), `test/core/core-index-arms.test.ts` (memory add's
rethrow arm reached through the dry-run stop; the hook case is now the IO arm with `E_COMMIT_FAILED`).

Gates (with the spec-008 amendment in the working tree):
- `npm run test:coverage` → exit 0, 278 suites / 5122 tests passed (load average 20, `uptime`); All files
  **99.26 / 96.74 / 96.72 / 99.72** (stmts/branches/funcs/lines). Main `ed4607a4`, same command on a `git archive`
  copy: 99.23 / 96.72 / 96.53 / 99.71 (two suites fail there only because the copy has a one-commit history) — no
  regression. Per file: `src/storage/dry-run.ts` 100/96.29/100/100, `src/core/dry-run.ts` 100, `src/cli/registrar.ts`
  100, `src/cli/program.ts` funcs 97.14 → 100, `src/storage/commit.ts` 98.88/97.27/100/100 → 99.2/97.12/100/100 (the
  two pre-existing `options.env` ternaries of the batch readers are the remaining branch arms).
  A first measurement (before `60dc1f6b`) was 99.23/96.63/96.46/99.72, below main on branches and functions; the
  extra tests and the arm removal in `60dc1f6b` closed it.
- An earlier full `npm test` failed only the three latency assertions (`test/core/query-latency.test.ts` ×2,
  `test/mcp/resource-latency.test.ts`) at load average 84 (`uptime`); re-run alone → 8 passed. Not a regression.
- `npm run lint` → 0; `npm run docs:api` → 0; `npx tsc --noEmit -p tsconfig.json` → 0;
  `npx tsc -p tsconfig.build.json --noEmit` → 0; `node scripts/check-governance.cjs --base ed4607a4` → 0 findings.
- BDD: no feature file names `--dry-run` (`grep -rn "dry-run" docs/02_requirements/02_bdd` → nothing); P5.1.4 is the
  feature, none added (the CLI integration test is the acceptance drive).

### Review (self, reviewer)

- AC1: `dry-run.integration.test.ts` drives all 14 operations; `assertPersistenceUnchanged` compares `git status
  --porcelain --ignored`, `HEAD`, refs and bytes; then the real run's commit equals the plan (subject, `%B`, paths,
  hunks vs `git show --diff-algorithm=myers -U3`). AC2: six refusal rows (exit 1 ×4, exit 2 ×2), stdout empty, nothing
  written. AC3: JSON parsed per row. AC4: doc test green with the amendment.
- Same-class sweep in touched files: `buildFlagValues` dashed key (fixed); every `writeDocument`+`commitPaths` pair
  converted (grep above).

### Pending amendments (approver)

- `spec-008-cli-grammar` — §2 intro (two exceptions), new `--dry-run` row, Revision note 2026-10-06. Proposed reason:
  "dl-106 W2, carried out by task-210: §2 gains the --dry-run row every mutating command takes, registered from the
  registry's mutates flag rather than on the root command, and the Revision note records bug-217's E_COMMIT_FAILED
  refusal that replaces git's raw text."

### Review fixes (2026-10-07)

Review verdict: approve with fixes F1–F6, all in this task; status stays `in-review` (no re-submit). Red commit
`065b4e24`; fixes `8b13ac6a`, `fb6168b9`. Red evidence: the four behavioural tests (F1 init, F2 `index.lock`, F4
warnings, F5 supersede wording) run against the pre-fix head `180998f5` (`git archive` to a scratch copy, the new test
files copied in, `npx jest test/cli/commit-failure-rollback.integration.test.ts test/cli/dry-run.integration.test.ts
test/core/memory-supersede.test.ts`) → **4 failed, 45 passed**, each on its finding. The storage unit tests for F1/F3 import
`CommitFailure`/`planDiff`, which the pre-fix head does not export (red by construction); the F3 behaviour is the
reviewer's repro (`crlf2.json` in `devloop-kit/task-210-review`): the old `unifiedDiff` compared the raw CRLF text
with the LF blob, so every line differed.

- **F1 (defect, fixed).** `removeCreatedDirectories` now collects every directory each file's write created (from the
  file's directory up to the first one `mkdirSync` created) and removes them deepest first across all files, skipping
  a non-empty one instead of stopping. Tests: `init` refused by a hook leaves no `.wingfoil/` and `docs/` (checked on
  the filesystem) and the retry succeeds; a two-file write whose files share a created parent leaves nothing.
- **F2 (defect, fixed).** The working tree is restored first; the index is then compared with its prior entries
  (`git ls-files -s`, which a held lock does not block) and rewritten only when it differs, best effort. A failure
  there is reported in the `CommitFailure` message (root stripped): `…but the index entries of <paths> could not be
  put back (<git>): check them with git status`. Tests: `memory add` under a held `.git/index.lock` → exit 1,
  `E_COMMIT_FAILED`, no absolute path, no `Command failed`, file gone; a hook that replaces `.git/index` with a
  directory → the index problem reported, the working tree restored.
- **F3 (claim false, fixed).** `planDiff` (`src/storage/dry-run.ts`) hashes the new side with `git hash-object
  --path=<path> -w` in the repository under the operator's environment — so `core.autocrlf` at any level and
  `.gitattributes` apply as in the commit — into a temporary object directory (`GIT_OBJECT_DIRECTORY`, the repository's
  objects as an alternate; the repository gains no object), and diffs blob to blob with `GIT_CONFIG_NOSYSTEM=1`,
  `GIT_CONFIG_GLOBAL=<devnull>` and `-c` pins for `diff.context`, `diff.interHunkContext`, `diff.indentHeuristic`,
  `diff.suppressBlankEmpty`, `diff.algorithm`. Stated in spec-008 §2 and the CLI reference: the hunks are `git show`'s
  under git's default diff settings; an operator's own `diff.*` can lay out `git show` differently, never with
  different content. Test: an isolated `GIT_CONFIG_GLOBAL` with `core.autocrlf=input`, `diff.interHunkContext=10`,
  `diff.suppressBlankEmpty=true`, `diff.context=10`, `diff.indentHeuristic=false`; a CRLF rewrite with two one-line
  changes plans exactly two 1-line hunks, equal to `git show` of the real commit run with system/global config off.
- **F4 (claim false, fixed — carried, the preferred option).** `CommitOptions.warnings`: the dna verbs, `directive
  assign`, `memory add` (the `limits` scan's diagnostics) and every transition verb (`commitMemoryTransition`'s new
  `warnings` parameter, defaulting to the lookup's `W_MEMORY_UNREADABLE` lines; `memory approve` passes both lookups'
  when the supersede trigger fires) hand the primitive the warnings they will report; `runAsDryRun` returns them on the
  plan result. Test: `dna add --force` on a flow-mapping `dna.yaml` — the dry run's stderr equals the real run's, and
  nothing is written. spec-008 §2 and the CLI reference say so; the design bullet above is corrected.
- **F5 (fixed).** The supersede recovery quotes `commitFailureSummary(error)`: `E_COMMIT_FAILED: git did not commit
  <paths>: <git>` (+ the index problem, if any), without the "as they were" clause. Test: the existing
  `memory-supersede.test.ts` failure case now pins that wording and the clause's absence.
- **F6 (fixed).** spec-008 §6 "Pinned refusal strings" gains the normative `E_COMMIT_FAILED` row (every writing
  command and `init`, exit `1`, message shape, rollback, root stripping, the index variant, the supersede quote); the
  Revision note points to it. Pending amendment, uncommitted.

Gates on head `fb6168b9`, spec-008 amendment in the working tree:
- `npm run test:coverage` (load average 4.9 → 13.2, `uptime` before/after) → exit 0, 278 suites / 5133 tests; All files
  **99.26 / 96.78 / 96.74 / 99.72**. Main `ed4607a4` (same command, `git archive` copy, recorded above):
  99.23 / 96.72 / 96.53 / 99.71 — no regression on any column. Before review, the pre-review head measured 96.74 branches in
  this worktree and 96.71 in the reviewer's run — the second is below main's 96.72; this head measures 96.78, above
  main, after the review fixes removed unreachable arms and tested every new one (`fb6168b9`). New files: `src/storage/dry-run.ts` 100/100/100/100,
  `src/core/dry-run.ts` 100; `src/storage/commit.ts` branches 97.27 (main 97.27).
- `npm run lint` → 0; `npm run docs:api` → 0; `npx tsc --noEmit -p tsconfig.json` → 0;
  `npx tsc -p tsconfig.build.json --noEmit` → 0; `node scripts/check-governance.cjs --base ed4607a4` → 0 findings.

- **F7 (re-review, fixed).** `planDiff` no longer sets `GIT_CONFIG_NOSYSTEM`/`GIT_CONFIG_GLOBAL`: that switch-off also
  dropped the operator's `safe.directory`, so in a repository another user owns the dry run failed with
  `E_GIT_READ_FAILED` where the real run committed; the hunk-shaping `diff.*` keys stay pinned with `-c`, which wins
  over every level. Nit: a dry run's `dna`/`roles` rewrite warning reads "would be rewritten"
  (`CommitOptions.plannedWarnings`), the real run's text unchanged. Red `ed904bd2` (`GIT_TEST_ASSUME_DIFFERENT_OWNER=1`
  with an isolated global `safe.directory=*` → `threw`; the dry-run warning test → "was rewritten"), fix `95be29f3`;
  `npm test` → 278 suites / 5135 passed; lint, docs:api, both tsc → 0; governance `--base ed4607a4` → 0 findings.

Pending amendment, updated reason (replaces the one above):
- `spec-008-cli-grammar` — "dl-106 W2, carried out by task-210: §2 gains the --dry-run row every mutating command
  takes, registered from the registry's mutates flag rather than on the root command, with the plan's diff computed
  from the blobs the commit would record under pinned diff settings and the real run's warnings carried, a rewrite
  warning worded as a plan; §6 gains the
  normative E_COMMIT_FAILED row for bug-217's rollback, which replaces git's raw text; the Revision note records both."

