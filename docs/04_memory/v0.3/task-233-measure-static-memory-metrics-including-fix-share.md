---
id: "task-233-measure-static-memory-metrics-including-fix-share"
type: task
title: "Measure the static and Memory metrics, including the fix share"
status: in-progress
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

### Retrospective

<!-- filled while working -->
