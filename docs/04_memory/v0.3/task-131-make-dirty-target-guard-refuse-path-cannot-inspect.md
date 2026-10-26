---
id: "task-131-make-dirty-target-guard-refuse-path-cannot-inspect"
type: task
title: "Make the dirty-target guard refuse a path it cannot inspect, and stop exporting the unconfined resolver"
status: done
release: "v0.3"
kind: "fix"
priority: "high"
tags: ["v0.3", "core", "security", "storage"]
ref: "dl-086"
bug: ["bug-118", "bug-122", "bug-124", "bug-182"]
depends_on: []
tmpl_version: 260703
wave: "w1"
---

## Description

`requireUnmodifiedTarget` treats empty `git status --porcelain` as clean (`src/core/write-guard.ts:124`), which is also what git prints for a path beyond a symlink, so the guard fails open on every write path (`bug-118`); a `directives/custom` symlinked elsewhere inside the root unlinks the file and then fails at commit (`bug-124`). `resolveMemoryPath`, the unconfined sibling, is exported from the storage barrel with no caller (`bug-122`). v0.3 adds writers (run records, workflow plans) that will call this guard.

## Acceptance Criteria

- (red-first) a target beyond a symlink (in-root and out-of-root) is refused before any write, exit 1, naming the path; the six `requireUnmodifiedTarget` call sites are covered.
- (red-first) `directive remove` on an in-root symlinked `custom/` refuses before unlinking; the file still exists afterwards (`bug-124`).
- (red-first) `resolveMemoryPath` is not exported from `src/storage/index.ts` (a test on the barrel's export list).
- (characterization) an ordinary clean target still passes.

## Implementation Notes

- **Size:** M · **wave:** 1 · **kind:** fix (`dl-133` Q1 (b)).
- **Implements:** REQ-SEC-06; dl-086 (filesystem-effect reads); dl-080.
- **Features:** P1.1, P3.3.
- **Notes:** Proposal key: C11.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

### design (architect) — 2026-10-01

- `depends_on: []` — no upstream Execution Notes to read (dl-015). Cited decisions: `dl-080` (`ready`,
  option (B)), `dl-086` (`ready`: a guard over an imminent syscall resolves on the filesystem),
  `dl-045` (`ready`: absorbed bugs ride the task's `bug:` list). No tech-spec governs
  `src/core/write-guard.ts`; none needed amending.
- **Added AC (bug-182, absorbed by the approver's triage 2026-10-01, `631deb8e`):** "a content-carrying
  verb (`memory submit`, `memory amend`) refuses, exit 1, naming the path, when the document's staged
  version differs from both `HEAD` and the working tree; a staged version equal to either still
  commits." Classified **red-first** (today `git add` silently overwrites the index).
- **Mechanism.** `bug-118` asks for a distinction, not a stricter rule: an empty porcelain is "clean"
  only for a path git can see. A new `requireInspectableTarget` lstat-walks the path's *proper
  ancestors* (root-relative; the root's own location is not inspected) and refuses when one is a
  symlink. The **leaf is excluded**: a symlinked leaf is a mode-120000 blob git does report, and
  `directive remove` of one must keep working (`bug-044` benign case, pinned in
  `test/core/directive-remove-confinement.test.ts`); a *write* through a symlinked leaf is already the
  confinement module's refusal (`requireConfinedWriteTarget`, `bug-120`). It runs first inside
  `requireUnmodifiedTarget` (so all six call sites inherit it), inside `requireAbsentTarget` (`memory
  add`, same class: write-then-`git add`-fails), and inside the new `requireNoDivergentStage`, which
  `commitMemoryTransition` now runs under `carries-content` where it ran nothing. `dl-080` itself needs
  no amendment: the rule (refuse a target carrying unowned modifications) is unchanged; the defect was
  the guard reading "invisible" as "clean". **Approver to confirm** (bug-118 left this open).
- `bug-122`: option 1 of the bug's three (stop exporting). `grep -rn "resolveMemoryPath" src test`
  before the change: `src/storage/memory-path.ts`, `src/storage/index.ts`,
  `test/storage/memory-path.test.ts` (imports the module directly) — no caller through the barrel.
- Scope kept to `src/core/write-guard.ts` and `src/storage/index.ts` plus a 5-line change to
  `commitMemoryTransition` and its doc (`src/core/memory-transition.ts`), required for bug-182 and for
  submit/amend behind a symlinked directory. `src/core/confinement.ts` (task-130's) is untouched.

| AC | Class | Evidence (all in `test/core/write-guard-uninspectable-target.test.ts`) |
|----|-------|---------------------------------------------------------------------------|
| 1. target beyond a symlink (in-root and out-of-root) refused before any write, exit 1, naming the path; six call sites | red-first | unit (in/out, modified and unmodified); `dna set`, `directive create`, `initWingfoilStorage` (in/out); `directive remove` (in-root; out-of-root is refused first by confinement, existing suite); approve/reject/deprecate/submit in an in-root symlinked type dir (out-of-root: `memory-transition-confinement.test.ts`). `directive assign`: see note below |
| 2. `directive remove` on in-root symlinked `custom/` refuses before unlinking; file survives (bug-124) | red-first | "directive remove — an in-root symlinked custom/ …" — bytes, HEAD and `git status --porcelain` empty |
| 3. `resolveMemoryPath` not exported from `src/storage/index.ts` | red-first | "storage barrel — … (bug-122)" over `Object.keys(storage)` |
| 4. an ordinary clean target still passes | characterization | unit clean / absent-with-missing-parent / symlinked-leaf cases, plus the whole existing suite green |
| 5. (added, bug-182) divergent staged version refused by submit/amend | red-first | "content-carrying verbs refuse a staged version …" + two characterization rows (staged = worktree; index = HEAD) |
| same-class: `memory add` into an in-root symlinked type dir | red-first | "memory add — a NEW target …" (unit + verb) |

`directive assign` note: `roles.yaml` is beyond a symlink only when `.wingfoil/` itself is one. When that
symlink is **committed** (the fixture's case) the verb is already refused (exit 1, nothing written) by its
HEAD role-catalogue read ("'.wingfoil/dna.yaml' is not committed at HEAD") before the guard is reached.
When it exists in the **working tree only**, `dna.yaml` is still at HEAD, the verb reaches the guard, and
git reports `roles.yaml` as ` D` — so the old guard already refused it as dirty (the new one refuses it
first, as uninspectable). Corrected at independent review. The verb row is therefore **characterization**;
the guard's answer for `.wingfoil/roles.yaml` is pinned red-first at unit level. Discovered at red, not
fabricated.

### red — 2026-10-01

- `npx jest test/core/write-guard-uninspectable-target.test.ts` → **22 failed, 12 passed, 34 total**
  (commit `e104d747`). Failures were the intended ones: the unit guard returned `ok`; every verb
  wrote first and then threw `Command failed: git … add … is beyond a symbolic link` (dna set,
  directive create/remove, the four transition verbs, memory add); `initWingfoilStorage` returned that
  raw git text; submit/amend committed over the staged version (`result.ok === true`); the barrel listed
  `resolveMemoryPath`. The 12 passing were the characterization rows and the git-blindness probe.

### green — 2026-10-01

- `7a7d605b`: `requireInspectableTarget` + `requireNoDivergentStage` in `src/core/write-guard.ts`,
  wired into `requireUnmodifiedTarget`, `requireAbsentTarget` and `commitMemoryTransition`
  (`carries-content`); `resolveMemoryPath` dropped from the storage barrel.
  `npx jest test/core/write-guard-uninspectable-target.test.ts` → 34/34; `npm test` → 167 suites,
  2794 tests, all passed.

### refactor — 2026-10-01

- `c7e8b69b`: an ancestor `lstat` cannot read (e.g. `EACCES`) is now also "cannot inspect" → refusal
  (was a rethrow, the one uncovered line); divergent-stage condition reduced to one test of git's `XY`.
  One test added for it **after** the code (not red-first; skipped when running as root).
- Gates (all from the worktree, at `c7e8b69b`):

| Command | Result |
|---------|--------|
| `npm test` | 167 suites / 2795 tests passed |
| `npm run test:coverage` | 98.74 / 94.59 / 94.04 / 99.49 (stmts/branches/funcs/lines). Baseline `c43221c4` (merge-base, temporary worktree): 98.73 / 94.58 / 94.01 / 99.49 — no regression. `write-guard.ts` 100 / 98.27 / 100 / 100 |
| `npm run lint` | exit 0 |
| `npm run docs:api` | exit 0 |
| `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| `npx tsc -p tsconfig.build.json --noEmit` | exit 0 |

- BDD: `grep -rln "modifications\|symlink\|symbolic" docs/02_requirements/02_bdd/features` → nothing;
  no scenario covers the write guard, so none to extend. No CLI command or help text changed, so
  `docs/cli-reference.md` is untouched (`grep -n "symbolic link\|uncommitted modifications"
  docs/cli-reference.md docs/user-guide.md` → nothing).

### review (self, reviewer) — 2026-10-01

- Every AC row above has a test; `grep -rn "resolveMemoryPath" src` → only `src/storage/memory-path.ts`.
- Same class in touched files: `requireUnmodifiedTargets` delegates to `requireUnmodifiedTarget`
  (covered); `requireAbsentTarget` fixed in this task (row "same-class").
- Not changed, deliberately: a symlinked **leaf** passes this guard (see design).
- Pending amendments (approver): none.
- Merge order: `task-130` edits `src/core/confinement.ts`; this task does not touch it, but edits
  `commitMemoryTransition` (`src/core/memory-transition.ts`, the check-2 doc bullet and the
  `scope === 'declared-fields-only'` block) — a textual conflict is possible if `task-130` edits the
  same block.

### review (independent) — 2026-10-01

- Coordinator's independent review: **APPROVE** (a symlink above the project root verified safe — only
  root-relative ancestors are walked; all gates reproduced), with four wording fixes, applied:
  1. `src/storage/index.ts`: the comment no longer implies the barrel exports the guarded resolver.
  2. `requireInspectableTarget`'s message: "git reports nothing for a path it cannot reach" was true only
     for a committed symlink (a working-tree-only one shows ` D`); now "git cannot stage or inspect a
     path beyond a symbolic link or an unreadable directory". Tests pin only `symbolic link` and the
     `cannot be read (EACCES)` clause, both kept, so no test text changed.
  3. `requireInspectableTarget` and `requireNoDivergentStage` re-exported from `src/core/index.ts` next to
     their siblings.
  4. The `directive assign` reasoning (notes above and the test comment) now states both the committed
     and the working-tree-only symlink cases.
- Item 3 first dropped function coverage to 93.78 (below the 94.01 baseline): the barrel's two new
  re-export getters were never called. The suite now imports the guards from `src/core` and adds one
  test calling both through it.
- Gates after the fixes: `npm run test:coverage` → 167 suites / 2796 tests passed; 98.74 / 94.63 / 94.06
  / 99.49 (baseline `c43221c4`: 98.73 / 94.58 / 94.01 / 99.49). `npm run lint`, `npm run docs:api`,
  `npx tsc --noEmit -p tsconfig.json`, `npx tsc -p tsconfig.build.json --noEmit` → exit 0.
