---
id: "task-172-confine-config-writers-dna-set-directive-create-directive"
type: task
title: "Confine the config writers (`dna set`, `directive create`, `directive assign`, `init`)"
status: in-progress
release: "v0.3"
kind: "fix"
priority: "high"
tags: ["v0.3", "core", "security"]
ref: "spec-011"
bug: ["bug-121"]
depends_on: ["task-131-make-dirty-target-guard-refuse-path-cannot-inspect"]
tmpl_version: 260703
---

## Description

Confinement is wired only in `directive remove` and the transition verbs; `writeDocument` in `dna set` and `directive create`, `directive-assign.ts` and `storage/layout.ts` write through a symlinked config file to a target outside the root (`bug-121`). The existing `requireConfinedWriteTarget` is the fix; `init`'s scaffold case needs its ruling in design.

## Acceptance Criteria

- (red-first) each of the four writers, with its target symlinked outside the root, exits 1 before writing and leaves the outside file unchanged.
- (characterization) in-root writes are unchanged.

## Implementation Notes

- **Size:** S · **wave:** 2 · **kind:** fix (`dl-133` Q1 (b)).
- **Implements:** REQ-SEC-06; spec-011.
- **Features:** P2.1, P3.1, P3.2, P5.1.1.
- **Notes:** Proposal key: C12.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

### design (architect) — 2026-10-05

- `depends_on`: `task-131` (`done`). Its Execution Notes (read in full) give the frame this task
  completes: `requireInspectableTarget`, run inside `requireUnmodifiedTarget(s)`, already refuses a
  target **beyond** a symlinked directory at `dna set`, `directive create`, `directive assign` and
  `initWingfoilStorage`, in or out of the root; it **excludes the leaf** on purpose and names
  `requireConfinedWriteTarget` as the write-path answer for it. `initWingfoilProject` (what `wingfoil
  init` runs, `grep -n initWingfoilProject src/cli/init-command.ts`) is not among its six call sites:
  it runs no target guard at all (`grep -n "requireUnmodified" src/core/init.ts` → only
  `initWingfoilStorage`'s line).
- Specs/decisions cited: `spec-011` `approved` (`grep -n "^status" docs/04_memory/design/specs/spec-011*`);
  `dl-086` `ready` (a guard over a filesystem effect resolves on the filesystem), `dl-080` `ready`.
  `spec-011` says nothing about confinement (`grep -n -i "confin\|symlink" docs/04_memory/design/specs/spec-011*`
  → nothing), so no spec edit is needed for the wiring.
- **Mechanism.** Wire the existing `requireConfinedWriteTarget(root, path, 'write')` (no new guard) at
  each writer, before any read or write of the target:
  `runDnaMutation` (`src/core/index.ts`, shared by all the `dna` mutating verbs — `grep -n
  "runDnaMutation(" src/core/index.ts`), `directiveCreateFn` (`src/core/index.ts`),
  `updateRoleAssignments` (`src/core/directive-assign.ts`, `directive assign`'s only write) and both
  init entry points (`src/core/init.ts`, a new local `requireScaffoldTargets` over every scaffold path,
  in one delimited block because `task-251` edits the same file). `src/storage/layout.ts` stays a pure
  write+commit mechanism, as its header declares; the guard belongs in the `CoreResult` layer like
  every other pre-flight (REQ-SYS-05).
  *Order:* confinement **first**, ahead of the dirty-target guard (and, in `directive create`, ahead of
  the already-exists check), as the Memory verbs and `directive remove` do — `requireConfinedTarget`'s
  own rule: a path that leaves the project is reported as leaving it. Consequence: the three
  out-of-root rows of `task-131`'s suite (`dna set`, `directive create`, `initWingfoilStorage` with a
  symlinked directory outside) are still refused with nothing written, but now with the boundary
  message ("outside the project root") instead of the inspectability one; the suite's assertion is
  adapted (`expectVerbRefusal`), the bytes/HEAD assertions are unchanged. In-root rows keep
  `task-131`'s message. What this task adds beyond that: the symlinked **leaf** (in or out of the
  root), the dangling leaf at `directive create`, and every `init` case on `initWingfoilProject`.
  *Considered and dropped:* placing confinement after the dirty guard to leave `task-131`'s messages
  untouched — it makes init's confinement unreachable (a linked `.wingfoil` is always an ancestor
  symlink, refused first as uninspectable) and contradicts the ordering rule every other write path
  follows.
- **`init`'s scaffold case — ruling needed (approver to confirm).** `bug-121` asks whether `init`
  can be checked against a boundary it is itself establishing. Options:
  - **(a) Confine like every other writer — recommended, implemented.** The boundary is the project
    (git) root, which `init` does not create: its guard 1 refuses a root with no `.git`. `init` only
    creates `.wingfoil/` beneath it. So each scaffold path is checked with `requireConfinedWriteTarget`
    before the first write, in both entry points. The only pre-existing shape a target can have is a
    `.wingfoil` that is a symlink to an empty (or absent-content) directory, since an initialized
    `.wingfoil` is refused first; out of the root it is now refused ("outside the project root").
    Same class, in the touched file: `initWingfoilProject` also gets `task-131`'s inspectability check
    (`requireUnmodifiedTargets` over the scaffold, vacuous for dirtiness since nothing can pre-exist),
    so an **in-root** symlinked `.wingfoil` is refused before writing instead of failing at `git add`
    after writing the whole scaffold. This aligns the two entry points.
  - (b) Refuse a symlinked `.wingfoil` outright at `init`, wherever it points, with one dedicated
    message. Same protection as (a)'s two checks together, one more message to maintain, and it would
    duplicate what the shared guards already say.
  - (c) Exempt `init` (the scaffold "establishes" the boundary; let a user keep the configuration
    elsewhere through a link). Rejected: git cannot stage a path beyond a symlink, so this is not a
    working layout to preserve — the command writes the whole scaffold at the destination and then
    fails at `git add` with git's raw text (measured at red, below).
- AC classification:

| AC | Class | Evidence (`test/core/config-writer-confinement.test.ts`) |
|----|-------|-----------------------------------------------------------|
| 1. each writer, target symlinked outside the root, exits 1 before writing; outside file unchanged | red-first | `dna set` (committed leaf link), `directive create` (committed **dangling** leaf link, `bug-121`'s 216-byte case), `directive assign` (committed `roles.yaml` link), `initWingfoilProject` (`.wingfoil` → empty outside dir). `initWingfoilStorage` with `.wingfoil` outside is **characterization**: `task-131` already refuses it (passed at red, not fabricated) |
| 1b. same class: leaf linked **inside** the root (`dna set`), in-root symlinked `.wingfoil` (`initWingfoilProject`) | red-first | rows "a dna.yaml linked to a file INSIDE …", "inside (same class, bug-118)" |
| 2. in-root writes unchanged | characterization | "characterization: in-root writes are unchanged" (init → dna set → directive create → directive assign, one path per commit, clean tree) + `initWingfoilStorage` on a fresh repo + the whole existing suite |

### red — 2026-10-05

- `npx jest test/core/config-writer-confinement.test.ts` → **6 failed, 3 passed, 9 total**. The six
  failures are the bug as reported: `dna set`, `directive create`, `directive assign` wrote through the
  link and then threw `Command failed: git … commit --only …` (the outside file rewritten / created);
  both `initWingfoilProject` cases returned git's raw `… add … is beyond a symbolic link` after writing
  the scaffold at the link's destination. The three passing rows are the characterization ones (the
  two AC2 rows and `initWingfoilStorage` outside, already refused by `task-131`).

### green — 2026-10-05

- `75bebf3e`: `requireConfinedWriteTarget` wired first in `runDnaMutation`, `directiveCreateFn`
  (ahead of the already-exists check), `updateRoleAssignments`, and both init entry points through the
  new `requireScaffoldTargets` (`src/core/init.ts`, one delimited block: confinement over every path,
  then `requireUnmodifiedTargets`; `initWingfoilStorage`'s guard 4 now calls it, `initWingfoilProject`
  gains it as guard 6). `test/core/write-guard-uninspectable-target.test.ts`: the three out-of-root
  verb rows now expect the boundary message (`expectVerbRefusal`), bytes/HEAD assertions unchanged.
- `npx jest test/core/config-writer-confinement.test.ts test/core/write-guard-uninspectable-target.test.ts`
  → 47/47; `npm test` → 234 suites, 4300 tests, all passed.

### refactor — 2026-10-05

- The guards removed the fixture that used to reach both init entry points' `IO` catch (a linked
  `.wingfoil` failing at `git add`): `npm run test:coverage` showed `init.ts` lines 227 and 311
  uncovered. `722c66ae` pins that branch on what it is for — git refusing the commit (a failing
  `pre-commit` hook) — as characterization (passed on first run).
- Gates (worktree, at `722c66ae`):

| Command | Result |
|---------|--------|
| `npm run test:coverage` | 234 suites / 4302 tests passed; 99.03 / 96.18 / 96.08 / 99.65 (stmts/branches/funcs/lines). Baseline `main` `a5ef0b75` (dev-loop plan; `git log a5ef0b75..0b297169 -- src test` → empty, so it is pre-batch main's too): 98.99 / 96.16 / 96.08 / 99.61 — no regression |
| `npm run lint` | exit 0 |
| `npm run docs:api` | exit 0 (at `75bebf3e`; `722c66ae` touches only a test) |
| `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| `npx tsc -p tsconfig.build.json --noEmit` | exit 0 (at `75bebf3e`) |
| `node scripts/check-governance.cjs --base 0b297169` | exit 0, 0 findings |

- BDD: `grep -rn -i "symlink\|symbolic link\|outside the project" docs/02_requirements/02_bdd/features`
  → only P3.4's dangling-link *listing* scenario, unrelated to a write; no scenario to extend.
- User docs: no CLI command, option or help text changed. `docs/cli-reference.md` § Git side effects
  already states the rule for every writer ("Safety checks on the file about to be written … whether a
  path leads outside the project through a symbolic link", `grep -n "outside the project"
  docs/cli-reference.md` → line 107), so it is untouched.

### review (self, reviewer) — 2026-10-05

- AC1: each of the four writers, target symlinked outside, exit 1, outside bytes unchanged, `HEAD`
  unchanged — rows in `test/core/config-writer-confinement.test.ts` (red at `f6939bb6`, green at
  `75bebf3e`). AC2: the characterization rows plus the full suite.
- Same class in touched files: every `writeDocument` call in `src/` now sits behind
  `requireConfinedWriteTarget` — `grep -rn "writeDocument(" src --include=*.ts` → `core/index.ts`
  (dna, directive create), `core/directive-assign.ts`, `core/memory-transition.ts` (`task-106`),
  `storage/layout.ts` (reached only through `src/core/init.ts`'s two guarded calls, `grep -rn
  "initStorage(" src`), `memory/entry.ts` (`memory add`, confined by `resolveConfinedMemoryPath`,
  `task-105`). The `dna` verbs `add`/`update`/`remove` share `runDnaMutation` with `set`, so they are
  covered by the same line.
- Decision for the approver: `init`'s scaffold ruling — option (a), see design.
- Pending amendments (approver): none.
- Merge order: `src/core/init.ts` is also edited by `task-251` (B2 notes: 172 merges first). This
  task's edits there are the import of `requireConfinedWriteTarget` and `ScaffoldFile`, guard 4's
  comment and call in `initWingfoilStorage`, guard 6 in `initWingfoilProject` (+ its doc item 6), and
  the delimited `requireScaffoldTargets` block.
