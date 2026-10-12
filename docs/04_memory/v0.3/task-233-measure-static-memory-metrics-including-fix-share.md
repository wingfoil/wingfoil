---
id: "task-233-measure-static-memory-metrics-including-fix-share"
type: task
title: "Measure the static and Memory metrics, including the fix share"
status: done
release: "v0.3"
kind: "feature"
priority: "medium"
tags: ["v0.3", "process", "release-health", "scripts"]
ref: "dl-089"
bug: ["bug-331"]
depends_on: ["task-150-declare-task-kind-stop-line-threshold", "task-222-declare-release-health-catalogue-v2-report-schema-release"]
tmpl_version: 260703
---

## Description

Complexity, duplication, import cycles and bypasses, unused dependencies and install size, dangling process-id references, SARD-cited-by-tests, bug and DL flow, document-divergence share, Memory volume, and Q18/Q19 from the `kind` field (heuristic before v0.3).

## Acceptance Criteria

- (red-first) each metric on a fixture with known answers; no new dependency (`dl-010`): where a metric needs a tool the repo lacks (e.g. clone detection), a minimal in-repo implementation or `not-measurable` with the reason, decided at design.
- (red-first) Q18/Q19 read `kind` for v0.3+ and the name-or-`bug:` heuristic for v0.1/v0.2; a feature task that absorbed a bug counts as feature (dl-133 §1).
- (characterization) Q15 classifies with dl-116's definition written in the catalogue.
- (characterization) `dl-010` Action 3 (E sweep): the production dependency count (`npm ls --omit=dev --depth=0`) is reported in the static metrics, so every retrospective sees it.

## Implementation Notes

- **Size:** M · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-089 §2 (Q05–Q10, Q13–Q16); dl-133 §1 (Q18, Q19 + v0.1/v0.2 heuristic backfill); dl-116 Action 2; dl-010 Action 3 (dependency count audit, E sweep).
- **Features:** P4.1.
- **Notes:** Proposal key: D17.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.
- **Handover from wave 3 B4 (2026-10-10, `task-222`'s independent review; W3 B4 follow-ups,
  `bug-ingest-rel-v0.3-w3b4-review-findings-plan`).** Three gaps in what this task measures, found against the
  catalogue `task-222` wrote (`docs/08_health/metrics.yaml` version 2):
  - **Q20 (bug net flow) has no owner.** It is in the catalogue's `added` list (`dl-100` §4 (a)) but neither this
    task's criteria nor `task-231`'s name it (`grep -n "Q20" docs/04_memory/v0.3/task-23*.md` → nothing). It is a
    Memory metric (bugs moved to `closed`/`deprecated` minus bugs added in the window), so it belongs here unless the
    approver assigns it elsewhere; record the choice in the Execution Notes.
  - **The dependency count of the last criterion has no catalogue metric.** The criterion reports `npm ls
    --omit=dev --depth=0` (`dl-010` Action 3), but no metric id carries it: either Q08 is redefined to hold it, or a
    new entry is added, with a decision-log if the choice is contested (`traceability`, filing rule 2), following
    the catalogue's `added`/`redefined` rules.
  - **Q15's mechanical rule will misclassify** bugs absorbed by large feature tasks: it classifies a bug as a
    document divergence from the non-merge commits of its fix (its definition), and a bug absorbed by a feature
    task (e.g. `bug-307` by `task-208`) shares its fix commits with the feature's code. Restrict the rule to the
    commits that cite the bug, or report such bugs as `not-classifiable`, and pin the case with a fixture.

## Execution Notes

### design (architect, 2026-10-12)

- **Start.** Branch cut from `main` `3e692099`, then `git merge --no-ff task/task-232-…` (`988b99e0`): task-232's
  approved toolchain half of `measure.cjs` is the base (B6 rounds). `bug-331` joined by approver ruling R5 (W3 B6);
  synced `planned → in-progress` (`641d5bd3`).
- **depends_on read (dl-015).** `task-150` (`done`): `kind: feature | fix` required on every task, `memory.yaml`
  `task.stop_the_line` (`field: kind`, `counts: fix`); the v0.1/v0.2 files carry no `kind` and are classified by
  this task's name-or-`bug:` heuristic. `task-222` (`done`): catalogue v2, report schema, `catalogue.cjs`; its B4
  review handed this task Q20, the dependency-count metric and Q15's restriction (Implementation Notes). `task-231`
  (`done`, history half): one entry per catalogue metric, `QUALITY_OWNERS` placeholders; `dl-173` holds five of its
  definitions open. `task-232` (`done`, toolchain half): `QUALITY_OWNERS` holds only this task's entry; my measurers go
  in their own block; tests `await measureRelease` and pass `toolchain: false` (`OFFLINE`); no wall-clock or random
  value in any recorded value or reason; a missing or failing tool → `not-measurable`, never a zero. `task-275`
  (`done`): `stop_the_line.open` excludes `deprecated`.
- **Decisions cited are ratified:** `grep -m1 '^status' docs/04_memory/design/dls/dl-{089,133,116,010,100}-*.md` →
  all `ready`; `dl-173` → `in-discussion`: its five definitions (G08, G09, G15, P02/P05, P03) stay untouched. No
  tech-spec governs `scripts/release-health/` (task-231/232 design, unchanged): the contract is dl-089 §2/§6, the
  catalogue and the schema. No spec edit is required.
- **No new dependency (dl-010).** Every measurer runs on what the measuring checkout already has: `typescript`
  (AST: imports, comments, test titles) and `eslint` + `typescript-eslint` (the `complexity` and
  `max-lines-per-function` rules through `Linter`), all three devDependencies (`package.json`), plus `js-yaml`.
  Q06 (clone detection) is a minimal in-repo implementation. A measurer whose module is missing is `not-measurable`
  with the reason.
- **Design — the static and Memory half** (its own block, `// --- the static and Memory metrics …`, run in the same
  worktree after the history half and BEFORE the toolchain half, so `npm ci`/build outputs never reach it; files are
  those `git ls-tree` lists at the point, read from the worktree; Memory documents read with one
  `git cat-file --batch` per commit). Definitions this script fixes where the catalogue leaves a choice (the header
  lists them, like task-231's):
  - **Q05** ESLint's `complexity` rule (classic count) with max 15 and `max-lines-per-function` with max 80
    (blank and comment lines counted, IIFEs included), inline `eslint-disable` ignored (`allowInlineConfig: false`),
    over the code files of `paths.sources`; value `{ complex, long }`, each function named
    `<file>:<line> <name>: …`; a file that does not parse → `not-measurable` naming it.
  - **Q06** clones: 8 consecutive non-blank lines, compared trimmed, occurring at two or more places of the same
    category (`paths.sources`, `paths.tests`); every line of such a window is duplicated; value
    `{ sources, tests }` shares with raw counts.
  - **Q07** imports read with the TypeScript AST (import/export declarations, `require`, `import()`). Cycles: the
    strongly connected components of the runtime import graph of `paths.sources` (type-only imports excluded: they
    are erased); bypasses: an import, type-only included, from `src/cli*` or `src/mcp/` into `src/storage`,
    `src/memory`, `src/dna`, `src/directives` or `src/workflow` (spec-006 §1), unless a Memory document at the point
    has a line naming the importing file and the word "deviation". Value `{ cycles, bypasses }`, each named.
  - **Q08** unused: a `package.json` `dependencies` entry no runtime import of `paths.sources` names (the package
    or a subpath). Install size: when the toolchain half installed (`npm ci` passed), `npm ls --omit=dev --all
    --json --long` (each production package's directory, its own `node_modules` excluded) plus the packed tarball's
    `unpackedSize` (`npm pack --dry-run --json --ignore-scripts`); otherwise `null` with the reason in `raw`.
  - **dl-010 Action 3 (the dependency count):** Q08's `raw.runtime_dependencies` — the top level of `npm ls
    --omit=dev --depth=0` (the same `npm ls` JSON's top-level keys) when installed, else the `dependencies` of
    `package.json` at the point, with `raw.runtime_dependencies_from` saying which. **Decision for the approver:** it is
    reported inside Q08 (its denominator), not as a new catalogue metric: adding or redefining a metric bumps the
    catalogue and requires a decision-log (catalogue header, `dl-089` §2), which this task may not file; a candidate
    is in the final report.
  - **Q09** a reference is a `task|bug|dl|adr|spec|svc-<n>` id in a comment or in the title of a
    `describe`/`it`/`test` call; ids in other string literals are fixture data, and files under a `fixtures/`
    directory are excluded (both "fixtures excluded"). It resolves when a Memory document at the point has the same
    prefix and number. Measured on this tree: 107 dangling with every string literal counted (all fake test ids such
    as `task-999`), 9 with this rule (`../devloop-kit/task-233-scratch/`, a probe).
  - **Q10** scope: the `REQ-*` ids of the file the release's `requirements:` names (or the ids of a list); cited:
    the id as a word in a file of `paths.tests` outside `fixtures/`.
  - **Q13 / Q20** from the bug documents at the previous point and at the point (by id): added = absent before;
    closed = `closed` now and not before; terminal (Q20) = `closed` or `deprecated` now and not before; open = neither.
    Q13 value `{ added, closed, closure_ratio, open_unassigned }`, raw the open bugs by severity.
  - **Q14** age in days (two decimals) from the `wf(decision-log): add` commit naming the id (else the first commit
    adding the file at its path) to the point, both commit times; no clock.
  - **Q15** (the B4 handover): for a bug added in the window, the fix tasks are the tasks whose `bug:` names it; their
    commits are the non-merge, non-`wf()` commits citing both a fix task's id and the bug's id. A bug with no fix task,
    or with no such commit, is unclassified (counted beside the share); otherwise it is a divergence when those
    commits change no executable line under `paths.sources` (every changed line blank or a comment). A bug absorbed
    by a feature task (`bug-307` by `task-208`) is judged on its own commits only.
  - **Q16** words: whitespace-separated tokens of a document's body (frontmatter excluded), median per type;
    comment-line ratio: non-blank lines of `paths.sources` code whose every character is inside a comment.
  - **Q18 / Q19** a task belongs to the release when its `release:` equals the version (deprecated tasks included,
    counted in raw). Releases before v0.3: the heuristic of dl-133 §1 — fix when an id segment is `fix` or `bug:`
    names a bug (it counts v0.2 as 46 of 75, dl-133's baseline). From v0.3: the field `memory.yaml`
    `task.stop_the_line.field` declares (`kind`) — fix when it equals `counts` (`fix`), feature for the other declared
    value, unclassified when missing; a feature task that absorbed a bug stays a feature. Q19's commit-backlog commit:
    the first `wf(release)` commit naming the release whose bracket ends `→ in-development]`
    (`release-planning` `commit-backlog`, `release.set_state(in-development)`); a task added after it is one whose
    `<id>.md` is not in that commit's tree (moves included).
  - **Q20 owner: this task** (B4 handover; no approver ruling assigned it elsewhere).
- **bug-331** (R5): Q18/Q19 read `task.stop_the_line`'s `field` and `counts` (the classification) and count every
  task of the release; the threshold, `open` and `max_share` stay dev-loop `start.checks.pre`'s. The comment says so,
  `memory.yaml` 3.1 → 3.2 on this branch. task-230 takes 3.1 → 3.2 on its own branch and merges first: **the gate
  re-bumps this branch to 3.3** after task-230 (B6 notes, R5).
- **AC classification (testing directive), corrected:**

| AC | Class | Why |
|---|---|---|
| 1 — each metric on a fixture with known answers; no new dependency | red-first | nothing measures Q05–Q10, Q13–Q16, Q18–Q20 (`grep -n "QUALITY_OWNERS" -A2 scripts/release-health/measure.cjs` → all thirteen left to task-233) |
| 2 — Q18/Q19 from `kind` for v0.3+, the heuristic for v0.1/v0.2; an absorbed bug stays feature | red-first | same |
| 3 — Q15 classifies with dl-116's definition written in the catalogue | characterization (the catalogue text) + red-first (the classifier, under AC 1) | `grep -n "dl-116" docs/08_health/metrics.yaml` → Q15's `decision` and the v2 `changes` entry: the definition is already there (task-222) |
| 4 — the production dependency count reported in the static metrics | **red-first** (was characterization) | `grep -n "npm ls" scripts/release-health/measure.cjs` → nothing: a characterization test would fail on first run |
| bug-331 — the comment names the readers that apply the threshold | documentation | a comment; checked by `sed -n` in refactor, and Q18/Q19 reading `field`/`counts` is pinned under AC 2 |

- **Real measurement:** none planned. Every metric is pinned on fixtures with known answers; the one real run (a
  heavy gate) is taken only if the refactor gates leave a doubt, under the slot (`--max-workers 2`), and the notes
  say whether it ran.

### red (qa role, developer agent — B6 runs red in the developer session, W3 B6 rulings, second set, T4)

- `d983e28f`: new `test/release-health/measure-static.test.ts` (a fixture repository whose ledger lists what each file
  and commit shows, one case per metric with hard-coded answers; the v0.2 heuristic fixture; the unparsable-source
  case; Q08's toolchain path with a stub runner; `classifyTask`; the characterization of this repository's v0.2
  tasks); `measure.test.ts`'s two placeholder assertions ("Q05 not-measurable … task-233") now expect Q05 measured;
  `classifyTask` and the footprint step names declared in `measure.d.cts` so the red fails on behaviour, not on a
  missing type.
- Failing run: `npx jest test/release-health/measure-static test/release-health/measure.test.ts --maxWorkers=2` →
  `Tests: 23 failed, 65 passed, 88 total`: the assertions (each metric still `not-measurable … task-233`) and
  `classifyTask is not a function`; no fixture or setup error (`grep -E "Expected|Received|TypeError"` of the run).

### green (developer, 2026-10-12)

- `638afd72` (`feat`): the static and Memory block of `measure.cjs` as designed; `QUALITY_OWNERS` and its loop
  removed; `measureRelease` runs `measureStatic` after the history half and before the toolchain half, and builds Q08
  after the toolchain half (its install size reads the installed tree through an `afterToolchain` hook of
  `toolchainEntries`, called only after `npm ci` passed, so task-232's step list is unchanged when no hook is passed).
  `npx jest test/release-health --maxWorkers=2` → `Tests: 122 passed, 122 total`.
- **Test change after red** (T4): both measure test files gained `jest.setTimeout(60_000)` with the reason in a comment.
  Every measure now loads ESLint and TypeScript once per test file and lints and parses the fixture: the first
  `beforeAll` took 10.4 s (timed by a throw-away copy of the test, not kept), the default is 5 s. No assertion changed.
- `886ed1ba` (`fix(config)`, bug-331): `memory.yaml`'s `task.stop_the_line` comment names dev-loop `start.checks.pre`
  as the one reader of the threshold, and Q18/Q19 as readers of `field`/`counts` only, counting every task of the
  release; `version: 3.1 → 3.2` with its history line. **task-230 also takes 3.1 → 3.2 on its own branch and merges
  first: the gate re-bumps this branch to 3.3** (B6 rulings R5). `npx jest test/lint/version-bump test/core/task-kind`
  → `29 passed`.

### refactor (developer, 2026-10-12)

- `e1b1c3b9`: `measure.cjs`'s header states the static half and each definition it fixes; `.wingfoil/WORKFLOW.md`'s
  release-health paragraph says what `measure.cjs` measures now (no "until task-233 lands"); each citation pattern
  of Q15 is compiled once.
- **A run on this repository, static half only** (no toolchain: not a heavy gate):
  `node scripts/release-health/measure.cjs --release v0.3 --at HEAD --previous 0671d035 --offline --no-toolchain`
  → 26 s at load 18; Q05 35 complex / 19 long functions (127 files), Q06 0.22 % sources / 5.96 % tests, Q07 2 cycles
  and 5 bypasses, Q09 9 dangling (as the design probe; 8 once `4030aeb4` removed the `dl-999` comment of
  `measure-static.test.ts`, review F8), Q10 66.67 % (8/12), Q16 comment-line ratio 44.15 %, Q18 35.95 %
  (55 fix of 153, by `kind`), Q19 32 added after `2bc3071e`, 46.88 % fix. It found one defect: the bypass of
  `src/cli.ts` was counted "recorded" because `task-020` has a line naming `src/cli.ts` and saying "No deviation".
- **The full suite found two more** (`npm test -- --maxWorkers=2` under the slot at `e1b1c3b9`, load 9.8 → 6.4:
  `Tests: 2 failed, 7120 passed, 7122 total`): `test/lint/git-log-readers` (a `git show` of a commit in Q15's diff
  reader, task-268's rule) and `test/lint/no-fabricated-stderr` (the Q08 failure stub returned a written `stderr`,
  bug-070). `4030aeb4` fixes all three: `git diff-tree --no-commit-id -p --unified=0 --no-renames --root`; a deviation
  is recorded only by a line naming the importing file, the module it reaches and "deviation" (new pin: `dl-003`'s
  body "No deviation in src/cli/run.ts here." records nothing); the stub's `stderr` is real npm 11.6.2 output of
  `npm ls --omit=dev --all --json --long` with `left-pad` declared and not installed (home directory redacted), passed
  as an outcome object. Rerun on the real repository: Q07 6 bypasses, `recorded_deviations: 0`.
  `npx jest test/release-health test/lint/no-fabricated-stderr test/lint/git-log-readers --maxWorkers=2` →
  `Tests: 129 passed, 129 total`. This touches red's test file again (T4): one stub made real, one fixture body
  given the "No deviation" line (the DL median stays 2), one comment no longer citing a fake id, and two assertion
  edits in the Q08 failure case — `toContain('ELSPROBLEMS')` narrowed to `toContain('npm error code ELSPROBLEMS')`, and
  `not.toContain('_logs')` added (the reason must not carry npm's dated log pointer); none weakened. (Corrected at the
  independent review, F8.)
- **A run on this repository over v0.3's window** (`--previous v0.2.2 --offline --no-toolchain`, 4106 commits; 23 min
  29 s, almost all of it the history half's governance passes): Q13 169 added / 162 closed (95.86 %), 15 open without a
  release; Q14 25 in-discussion, median 6.72 days; Q15 36.99 % (27 of 73 classified, 96 unclassified); Q20 −7 (162
  terminal, 169 added: floor breached); Q18/Q19 as above. Report at `../devloop-kit/task-233-scratch/real-static3.json`.
  **No toolchain run was taken** (R4-style heavy gate): Q08's install half is pinned by the stubbed case only.
- **Gates at `4030aeb4`**, under the slot: `npm run test:coverage -- --maxWorkers=2` (load 7.4 → 3.1) → `Test Suites: 385
  passed`, `Tests: 7122 passed, 7122 total`, All files 99.3 / 97.22 / 97.93 / 99.7 — unchanged from task-232's
  (`git diff --stat 3e692099 HEAD -- src jest.config.js` → empty; `scripts/` is outside `collectCoverageFrom`);
  `npm run lint` → 0; `npm run docs:api` → 0; `npx tsc --noEmit -p tsconfig.json` → 0;
  `npx tsc -p tsconfig.build.json --noEmit` → 0; `node scripts/check-governance.cjs --base 0671d035` → `17 wf()
  commits`, `gated: 0 findings`; `node scripts/lint-claims.cjs --base 0671d035` → `0 warnings in 0 files, 4 files read`.
  Main-sync: `main` is still `3e692099`, an ancestor of HEAD (`git merge-base --is-ancestor main HEAD`).
- T4 (`git log --first-parent --no-merges --format=%h d983e28f..HEAD -- test/release-health/`) → `4030aeb4`, `638afd72`:
  the timeouts and the three changes above.
- BDD: `grep -rln "release-health\|measure.cjs" docs/02_requirements/02_bdd/features/` → no scenario for the Q metrics
  (task-232's finding, unchanged); none added. No CLI command touched: `docs/cli-reference.md` not concerned.

### review (reviewer, self, 2026-10-12)

- AC 1 met: one case per metric on `staticFixture` with hard-coded answers (`measure-static.test.ts`), the
  unparsable-source case (Q05 `not-measurable` naming the file), Q10/Q19 `not-measurable` with the reason; no new
  dependency (`git diff 3e692099 HEAD -- package.json package-lock.json` → empty); Q06's detector is in-repo.
- AC 2 met: "Q18 — … by `kind` (v0.3+); an absorbed bug stays a feature" (task-004, `kind: feature`, `bug: [bug-004]`),
  "Q19 — … after the commit-backlog commit", the v0.2 fixture (heuristic, `task-021` with `kind: feature` and a bug
  counted fix), and this repository's v0.2 tasks → 46 fix of 75 (dl-133's baseline).
- AC 3 met: the catalogue's Q15 states dl-116's definition (`grep -n "dl-116" docs/08_health/metrics.yaml` → its
  `decision` and the v2 `changes` source); the classifier applies it, restricted to the commits citing the bug.
- AC 4 met: Q08 `raw.runtime_dependencies` (2 from `package.json` without the toolchain; 2 from `npm ls`'s top level
  with it), `runtime_dependencies_from` naming the source; on this repository 4.
- bug-331 met: `sed -n 136,139p .wingfoil/memory.yaml` → the readers stated as above; `taskClassRule` reads
  `field`/`counts` from the point's `memory.yaml` (`classifyTask` case with `field: category`).
- `dl-173`'s five definitions untouched: `git diff 988b99e0 HEAD -- scripts/release-health/measure.cjs | grep -nE
  "^[-+].*(measureAttribution|declaredVerbs|measureBranches|uncheckedCommits|producesPresent)"` → nothing.
- Same class in the files touched: no other `git show` of a commit and no other written `stderr` in them (the two lint
  suites pass); no reason carries the worktree path (Q05's names repository-relative paths; the footprint reasons go
  through the runner's relativizing).
- Determinism: no clock (Q14 uses commit times), no randomness, every list sorted; the static case's second run is
  byte-identical (`is byte-identical on a second run at the same point`).

### independent review (2026-10-12) and fixes (developer)

- Verdict: APPROVE WITH FIXES (coordinator; probe `../devloop-kit/task-233-review/m.cjs`): every number re-derived
  matches; decisions 1–5 and the T4 deviations accepted. In-task fixes F1, F2, F3, F6, F8; the follow-ups (Q15's
  catalogue text vs code, Q09 fictional ids, Q14 `--follow`, v0.1/v0.2 at their own points) are the coordinator's.
- `aa8a49a5` (red, new `test/release-health/measure-static-guards.test.ts`, so red's earlier files stay as they were):
  run against `064e1d6a`'s parent `measure.cjs` → `Tests: 3 failed, 3 total`; against the fix → `3 passed`.
- `064e1d6a` (fix):
  - **F1**: a point with no `.wingfoil/dna.yaml` (e.g. `v0.2.1`, before task-111) or no source file leaves Q05, Q07,
    Q08, Q09, Q10 and Q16 `not-measurable` with the reason (naming `--at`), instead of zeros and a false Q08 breach
    (all six real dependencies "unused" at `v0.2.1`); Q16 keeps a measured half with the other `null` and its reason in
    `raw` when only one input is missing; the header says v0.1/v0.2 are backfilled by measuring at a later commit.
  - **F2**: `afterToolchain` receives `built`; after a failed build Q08's install size is `null` with "npm run build did
    not succeed, so npm pack would pack an incomplete dist/", and neither `npm ls` nor `npm pack` runs.
  - **F3** (bug-331, same class): the `memory.yaml` comment says the threshold is declared by dev-loop
    `start.checks.pre` and applied by hand until checks run — no code in `src/` reads it
    (`grep -rn "stop_the_line\|stop-the-line" src/` → nothing); no second version bump (one per file per branch).
  - **F6**: Q05 records `eslint version` and `typescript-eslint version`; Q07, Q09 and Q16 `typescript version`.
  - T4: `measure.test.ts`'s toolchain-fixture assertion "Q05 measured" becomes "Q05 not-measurable: no code file under
    paths.sources" — that fixture has no source file, so F1 changes the answer; the point it pins (no longer left to
    task-233) holds.
- Gates at `064e1d6a`, under the slot: `npm test -- --maxWorkers=2` (load 4.4 → 3.6) → `Test Suites: 386 passed`,
  `Tests: 7127 passed, 7127 total`; `npm run test:coverage -- --maxWorkers=2` → 7127 passed, All files 99.3 / 97.22 /
  97.93 / 99.7; `npm run lint` → 0; `npx tsc --noEmit -p tsconfig.json` → 0;
  `node scripts/check-governance.cjs --base 0671d035` → `gated: 0 findings`; `node scripts/lint-claims.cjs --base
  0671d035` → 0 warnings. No real measurement run.
- T4 (`git log --first-parent --no-merges --format=%h d983e28f..HEAD -- test/release-health/measure.test.ts
  test/release-health/measure-static.test.ts`) → `064e1d6a`, `4030aeb4`, `638afd72`, each accounted for above.

### Pending amendments (approver)

- `bug-331` (uncommitted): its `### Retrospective` gains one item (dl-115 Q2 (a)). Proposed `--reason`: "Retrospective
  item for bug-331, written by task-233 while fixing it: the reader list was written before any code read the block."
- No tech-spec, ratified decision-log or other task needed an edit.

### Retrospective

- A real run on this repository found a defect no fixture had (a "No deviation" line counted as a recorded
  deviation, `4030aeb4`), and the full suite's lint gates found two more (a commit-showing git reader, a written
  stderr): rules that exist as lint tests are cheaper to run before the full suite (`npx jest test/lint`).
- Every measure now loads ESLint and TypeScript (about 4 s per test file, first `beforeAll` 10.4 s): the two measure
  test files needed `jest.setTimeout(60_000)`.
- The history half dominates a real run: 23 min 29 s over v0.3's 4106 commits with `--no-toolchain`, the static half
  under 30 s of it (26 s for a 34-commit window, all included) — the governance passes run twice (P07).
- Q15's mechanical rule counts a fix that changes only configuration or tests as a divergence (e.g. `bug-181`,
  `bug-225` among the 27 on this repository): a candidate for the catalogue's next decision-log.
