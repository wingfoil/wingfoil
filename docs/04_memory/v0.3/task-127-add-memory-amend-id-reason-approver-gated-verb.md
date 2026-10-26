---
id: "task-127-add-memory-amend-id-reason-approver-gated-verb"
type: task
title: "Add `memory amend <id> --reason`, an approver-gated verb that records a content correction without a state change"
status: done
release: "v0.3"
kind: "feature"
priority: "high"
tags: ["v0.3", "core", "memory", "cli", "governance"]
ref: "dl-108"
bug: []
depends_on: ["task-126-declare-closed-wf-operation-grammar-bracket-set-state"]
tmpl_version: 260703
wave: "w0"
---

## Description

No verb amends an approved or terminal element, so every correction is a hand-written commit that `memory history` reports as `operation: null` (`dl-108` Context; spec-015 was amended seven times by hand). Ratified: a `memory amend <id> --reason` verb that commits the element's working-tree content change, leaves `status` untouched, requires approval authority, and writes `wf(<type>): amend <id> [<s> → <s>]` with `Approver:` and `Reason:`. A3 (what may be amended) is a per-type declaration in `memory.yaml`. Scheduled first so every later amendment in v0.3 (the Revision notes on approved specs and ready decision-logs) uses the verb.

## Acceptance Criteria

- (red-first) on an `approved` tech-spec with an uncommitted body edit, `memory amend <id> --reason r` exits 0, writes exactly one commit touching only that file, subject `wf(tech-spec): amend <id> [approved → approved]`, body `Approver: <name> <email> (approver)` and `Reason: r`.
- (red-first) refusals: no content change → exit 1; a working-tree edit that changes `status` → exit 1 naming the field; caller without approval authority → the same refusal `approve` gives (REQ-SEC-03); a type whose `memory.yaml` entry does not declare itself amendable → exit 1; missing or blank `--reason` → exit 2 (`dl-067`).
- (red-first) `memory history <id>` lists the entry with `operation: "amend"` and its approver and reason (P1.10).
- (red-first) `wingfoil memory --help` and `docs/cli-reference.md` list `amend` (the `test/docs/cli-reference.test.ts` gate).
- (characterization) `spec-008`, `spec-010` (amend owns the body and non-status fields) and `spec-001` (the per-type amendability key) carry the verb, each with a dated Revision note; this repository's `.wingfoil/memory.yaml` declares which types are amendable (`adr`: no, per A3 — a change to the decision is a new element), with a `version:` bump.

## Implementation Notes

- **Size:** M · **wave:** 0 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-108 A1 (a), A2 (i), A3; spec-008 §1/§2; spec-010 § Field-write ownership; spec-001 (per-type amendability).
- **Features:** P1.7, P1.10, P1.2.
- **Notes:** Proposal key: C02. `src/core/index.ts` (new CoreOperation), `src/memory/`, `src/cli/`. Uses the shared identity/pre-flight order of task-132 if task-132 lands first; otherwise task-132 folds `amend` into its helper. Consider `bug-076`'s lesson: the verb commits exactly the one file, `--only`.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

Branch `task/task-127-add-memory-amend-id-reason-approver-gated-verb`, worktree `../.wf2-wt/task-127`,
cut from `main` at `bd60a7a3` (task-126, task-128 and task-129 merged). Start `a0564ae6`. `bug: []`, so
there are no bug syncs.

### design (architect)

**`depends_on`** (dl-015): `task-126` Execution Notes read. What this task takes from them:
- `spec-008` §2 already declares the `amend` row, `memory amend` (`dl-108`), bracket `[s → s]`, and
  `src/memory/audit.ts` already reads `amend` as an operation. The subject written here is that
  row's: `wf(<type>): amend <id> [<s> → <s>]` with `Approver:` and `Reason:`.
- The approver's ruling of 2026-10-01 (recorded in task-126's review): `element.set_release` emits
  `assign`, not `amend`. `amend` is therefore exactly `dl-108`'s verb, approver-gated with per-type
  amendability, and nothing here serves `set_release`.

**Specs and decisions cited** (`awk '/^status:/{print $2;exit}'` on each): `spec-001`, `spec-008`,
`spec-010` `approved`; `dl-108`, `dl-067` `ready`.

**Design decisions** (to confirm at review):
1. **Per-type key `amendable: boolean`** on `MemoryTypeEntry`. Absent means `false`, so amending is
   opted into per type and the AC's "does not declare itself amendable" holds for an entry with no
   key. There is no `defaults.amendable`. It is read from the `memory.yaml` committed at `HEAD`, the
   copy `prepareMemoryTransition` already resolves (`command-baseline`).
2. **Values in this repository's `memory.yaml` 1.7:** `true` for `tech-spec`, `decision-log` and
   `service`, the types whose approved or terminal documents are corrected by hand today (`dl-108`
   Context, `dl-088`, the v0.3 Revision notes the task Description names). `false` for `adr`
   (`dl-108` A3) and, explicitly, for `release-line`, `release`, `task`, `bug` and `plan`, where no
   amendment practice exists yet. Widening is a one-line config change.
3. **What an amendment may change:** the body and every frontmatter field except `status`, `id` and
   `type`. The AC names `status`. `id` and `type` were added because they locate the element and
   select its path and machine: changing either is a new element, not a correction. Each refusal
   names the field (`frontmatter field 'id'`, …), using `describeDocumentChanges`.
4. **Other files in the working tree are ignored, not refused.** `commitPaths` stages and commits
   only the document's path (`bug-027`), and `verifyCommittedScope` checks afterwards that the commit
   holds only that path (`bug-076`). Modified and staged unrelated files stay as they were. This is
   what every other verb does. Refusing would make `amend` unusable while any other work is open,
   with nothing gained, since the commit cannot carry them.
5. **The content is the working tree's**, as on `submit` (`carries-content` scope). The baseline is
   `HEAD`: a document no commit holds is refused ("an amendment corrects a recorded document"), and a
   document equal to `HEAD` is "nothing to amend". Since `status` must equal the committed value, the
   bracket's state is the committed state.
6. **Pre-flight order** (task-132 has not landed): the `approve` order from task-125. `<id>`, then
   `requireReason` (exit 2), then git identity, then locate, then confinement (refactor, below), then
   amendability, then the edit checks, then `requireApprovalAuthority` (the same check and message as
   `approve`), then the commit. Authority comes after the document checks for `approve`'s reason: the
   message names the type.
7. **No new `TransitionOp`.** `prepareMemoryTransition` takes `TransitionOp | 'amend'` and, for
   `amend`, sets `to = from` after validating the state. The engine's `resolveTransitionTarget` is
   untouched. `formatMemoryCommitMessage`'s `op` gains `'amend'`.

**AC classification (T1).**

| AC | Class | Why |
|---|---|---|
| 1 — one commit, one file, subject and body | **red-first** | no `memory amend` existed (`node dist/cli.js memory --help` on `bd60a7a3` lists no `amend`) |
| 2 — refusals (no change, `status`, authority, not amendable, `--reason`) | **red-first** | same; the `--reason` refusals reuse `requireReason`, but the verb did not exist to reach it |
| 3 — `memory history` reports `operation: "amend"` with approver and reason | **red-first** end to end | the reader is `task-126`'s and already handles `amend`; the test is red because no command writes the commit. The reader half is characterization |
| 4 — `memory --help` and `docs/cli-reference.md` list `amend` | **red-first** | the reference entry, written first, makes `test/docs/cli-reference.test.ts` fail (documented, not shipped) |
| 5 — spec-001/008/010 and `memory.yaml` | characterization (documentation and configuration) | — |

### red (developer)

`770dbaca`: `test/core/memory-amend.test.ts` (AC1–AC4) and the `docs/cli-reference.md` entry, marked
**Unreleased (v0.3)**. `npx jest test/core/memory-amend.test.ts test/docs` → **2 suites failed, 18
tests failed, 3 passed**: all 17 amend tests (`"memoryAmend" is not registered on the memory
module`, and the `--help` test) plus the reference gate (`+ "memory amend"`, documented but not
shipped).

### green (developer)

`bb1173e9`:
- `src/core/index.ts`: `memoryAmendFn` and its `memoryAmend` registration (`mutates: true`, one
  positional `<id>`, required `--reason`), which makes it CLI `memory amend` and MCP Tool
  `memory.amend`.
- `src/core/memory-amend.ts` (new): `requireAmendableType` and `requireAmendableEdit`.
- `src/core/memory-transition.ts`: `op: 'amend'` is the self-loop.
- `src/memory/schema.ts`: `amendable`. `src/memory/commit-message.ts`: `op` accepts `'amend'`.
- Three registry lists pinned by name gained the verb: `test/core/production-registry.test.ts`,
  `test/core/parity.test.ts`, `test/mcp/read-only-agent-channel.test.ts` (twelve → thirteen
  mutating operations).
- One test fixture was corrected: the bug-076 test read `git status --porcelain` through a helper
  that trims, which ate the first line's leading index column. It now reads the output untrimmed.

`npx jest` → 166 suites / 2737 tests passed. task-129's derived sweep covers the new command with no
change: `npx jest test/cli/extra-operand-refusal.integration.test.ts --json` lists
`` `wingfoil memory amend` with one operand too many `` as passed.

`79dd5974` adds a `type`-change refusal test. It also puts `memoryAmend` into the three `it.each`
rows of `test/core/reason-trailer-verbs.test.ts` (blank, whitespace-only and forged-`Approver:`
reasons) as same-class characterization.

`8c0858c8` (documentation and configuration, AC5):
- `spec-001`: `amendable` in the `MemoryTypeEntry` block, a paragraph on it, worked examples carrying
  the 1.7 values, and a Revision note.
- `spec-008`: §2 gets a paragraph on `memory amend` (commit, ownership, refusals), the `--reason` row
  lists it as required, §1's one-id rule names it, and a Revision note.
- `spec-010`: a `memory.amend` ownership row, the paragraph after the table, and a Revision note.
- `.wingfoil/memory.yaml`: 1.6 → 1.7 (first edit since its last commit, `doc-versioning`), with
  `amendable` on every type and a header comment.

Specs have no `version:` field (`dl-047`), so they were edited in place, as earlier revisions were.
The pinned build still reads 1.7: `npm run -s wingfoil -- memory search --type adr` → exit 0, no
stderr.

**End to end on a scratch clone** (not this repository: an amendment needs approver authority).
`git clone` of the branch, then:
- Appended a line to `spec-015` and to `README.md`, then `node <worktree>/dist/cli.js memory amend
  spec-015-packaging-publishing --reason "scratch correction"` → exit 0. The commit was
  `wf(tech-spec): amend spec-015-packaging-publishing [approved → approved]` with `Approver:` and
  `Reason:`, `git show --name-only` named only the spec, and `README.md` stayed ` M`.
- `memory history … --format json`, last entry: `"operation":"amend","from":"approved","to":"approved"`,
  with approver and reason.
- `amend adr-001-…` → exit 1, `type 'adr' is not amendable: its memory.yaml entry declares
  amendable: false`.
- Two operands → exit 2, `takes one positional <id> (got 2 positionals)`.
- No `--reason` → exit 2.

The clone was deleted afterwards.

### refactor (developer)

`74b71cf3`:
- **Same-class gap found.** `test/core/memory-transition-symlink-target.test.ts` and
  `…-confinement.test.ts` drive every transition verb as a table "so a later verb … shows up as a
  missing row". `amend` was a missing row. Added, it failed on the message: the amend content checks
  read a symlinked document against `HEAD` and refused it for a field change it never made. Nothing
  was written either way.
- `memoryAmendFn` now asks `requireConfinedWriteTarget` right after locating the document, before
  amendability and the edit checks ("is this file ours at all" comes first, as in
  `commitMemoryTransition`). Without that line the two new rows fail (checked by commenting it out:
  2 failed, 30 passed); with it they pass.
- Coverage: tests for no git identity, document not found, and a failed commit post-condition
  returned as the error (a `jest.spyOn` on `commitMemoryTransition`).

Module comments in `src/memory/commit-message.ts` and `src/core/memory-transition.ts` now name
`amend`.

Gates, on the final tree (`npm run build` first):

| Command | Result |
|---|---|
| `npm run test:coverage` | exit 0; 166 suites / 2750 tests; 98.73 / 94.61 / 94 / 99.49 (stmts / branches / funcs / lines). `main` `bd60a7a3`, measured in a temporary worktree: 98.71 / 94.54 / 93.96 / 99.48, so no regression |
| `npm run -s lint` | exit 0 |
| `npm run -s docs:api` | exit 0 |
| `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| `npx tsc -p tsconfig.build.json --noEmit` | exit 0 |
| `npx jest test/docs` | green (the `memory amend` entry; its first sentence equals `--help`) |

Run note: `npm run -s test:coverage` fails one test, `test/cli/publish-secrets.test.ts` "publishes
(dry run) the tarball …". `-s` exports `npm_config_loglevel=silent`, the test's inner `npm publish`
inherits it, and its output is empty. Without `-s` it passes, and alone it passes (24/24). This is
not caused by this task (candidate finding for the coordinator).

BDD: no `.feature` file mentions `amend` (`grep -rln amend docs/02_requirements/02_bdd/features/` →
nothing), and no AC asks for a scenario, so none was added. The P1.7/P1.10 suites are green and
unchanged.

### review (reviewer)

Evidence per AC:
- AC1: `memory-amend.test.ts` "exits 0 and writes exactly one commit …" checks the exact message, a
  single path, a clean tree and the author's bytes verbatim. "an unrelated modified file and an
  unrelated staged file …" covers the `bug-076` lesson.
- AC2: the "AC2 — refusals" block covers no change, `status`, `id`, `type`, authority (the exact
  `approve` message), `adr` declaring `false`, `note` declaring nothing, committed versus
  working-tree `memory.yaml`, missing, empty and blank `--reason` (exit 2), and an untracked document.
- AC3: "`memory history` lists the amendment …".
- AC4: the "`wingfoil memory --help` lists amend" test, and `test/docs/cli-reference.test.ts`.
- AC5: `8c0858c8`.

Same-class search in the files touched: `grep -rln 'reject.*deprecate' src/core src/memory` lists
the verb enumerations. The two module comments that describe every Memory commit or every user of
the shared skeleton (`src/memory/commit-message.ts`, `src/core/memory-transition.ts`) now name
`amend`. So does the `DocumentScope` comment (`src/memory/frontmatter-edit.ts`). It said
`carries-content` was "`memory.submit` alone" because an approval carrying a body would attest to
content no subject mentions, and that was no longer true. It now names `amend` and says why its
subject does mention the content. The other hits describe the transition engine
(`src/memory/state-machine.ts`) or a single verb's own steps (`src/core/index.ts`). `amend` is not a
transition of the engine, so they were left. `CLAUDE.md` §1/§5.1 (command count "20", verb list) is owned by `align-agent-docs` (`dl-025`)
and left for the coordinator. So are `README.md`, `docs/user-guide.md` and `docs/agents.md` (the
`user-docs` phase).

### review (independent)

A separate review on `bd5419cb` (coordinator, 2026-10-01) returned **APPROVE WITH FIXES**. The task
stays `in-review`; nothing was resubmitted. The approver's rulings came during that review.

**F1 (should-fix): an amendment could break `spec-010` § Validation rules.** The reviewer
reproduced it: on an `approved` tech-spec with `required: [title, scope]`, deleting `scope:` or
blanking `title` and running `memory amend` → exit 0, committed.
- **red** `b4189d5f`: three cases (required field removed, title blanked, required field blanked) on
  a non-draft document, expecting exit 1 and `missing required field on amend: <field>`.
  `npx jest test/core/memory-amend.test.ts` → **3 failed, 22 passed** (`Expected: false, Received:
  true`, the amend succeeded). A draft-document case that may leave a field empty passed already
  (characterization, as `submit` allows it).
- **green** `8a288e2f`: `requireRequiredFieldsKept` (`src/core/memory-amend.ts`) runs `submit`'s
  own `missingRequiredFields` on the edited frontmatter whenever the state is not the machine's
  initial state (`sequence[0]`, which is `draft` for every declared type).

**F6 (nit): the authority-order rationale was false.** The type is known after step 3. Resolved by
**moving** the check, not by rewording: `requireApprovalAuthority` now runs right after
locate + confinement, as `approve` does, before amendability and the edit checks (`8a288e2f`; TSDoc
renumbered). This supersedes design decision 6's order. No test needed changing: no test relied on
a document refusal preceding the authority one.

**Approver rulings (Roberto, 2026-10-01), superseding design decisions 2 and 3:**
- **(a) Amendable types in this repository:** `true` for `tech-spec`, `decision-log`, `service`,
  `task`, `bug` and `plan`; `false` for `adr` (`dl-108` A3), `release` and `release-line`. This is
  in `.wingfoil/memory.yaml`, which was already 1.7 on this branch and is not yet on `main`, so it
  gets no further bump. Practice from now on: the approver's hand corrections of backlog tasks and
  bugs, and revisions of plans, become `amend` commits. A developer's own Execution Notes stay plain
  commits.
- **(b) Fields amend may not change** now include `release` (owned by `assign`), `rejection_reason`
  (owned by `reject`) and `supersedes` (the future trigger, `task-162`), besides `id`, `status` and
  `type`. That is `AMEND_RESERVED_FIELDS`; the refusal names the field.
  - **red** `6e9d2490`: three cases. `release` and `supersedes` failed on the missing refusal. The
    `rejection_reason` case failed on a fixture defect instead (`git commit` with nothing to commit,
    when the committed line is empty). The fix (seed only when there is something to seed) is in
    `259fd5c7`. Re-checked against the pre-fix list (`AMEND_RESERVED_FIELDS` temporarily set back to
    `['id', 'status', 'type']`): `-t "ruling"` → **3 failed**, all on the missing refusal.
  - **green** `259fd5c7`.
- **(c) The `wingfoil init` scaffold** (`src/storage/templates.ts`, `MEMORY_AMENDABLE`) declares
  `amendable` on its seven types, consistent with (a): `true` for `tech-spec`, `decision-log`,
  `task` and `bug`; `false` for `adr`, `release` and `release-line`. The scaffold has no `service`
  or `plan` type. A header comment line says what the key is.
  - **red** `6e9d2490`: a new block in `test/cli/fresh-init-transitions.test.ts` runs, per template,
    a real `init`, then tech-spec add → submit → approve, a body edit, then `amend`: exit 0, one
    commit with the `[approved → approved]` subject, clean tree. The same steps on an `adr` give
    exit 1 `declares amendable: false`. Result: **2 failed** (Scrum, Kanban), with `type
    'tech-spec' is not amendable: … does not declare amendable: true`.
  - **green** `259fd5c7`. No test pins the scaffold bytes: the full suite stays green, including
    `test/storage` and the built-in template checks.

**Docs** (`85f508fc`):
- `spec-008` §2's amend paragraph: the six reserved fields, the required-field rule, the
  authority order.
- `spec-010`: the ownership row and the paragraph list the six fields and their owners.
- `spec-001`'s worked examples: `task`, `bug`, `plan` are `true`.
- Each of those specs gains a sentence in its `task-127` Revision note. Those notes were not on
  `main` yet, so they were extended rather than given a second note.
- `docs/cli-reference.md`: the six fields, the required-field error, and what `init` declares.
- `src/memory/frontmatter-edit.ts`'s `DocumentScope` comment points to `AMEND_RESERVED_FIELDS`.

**Gates** (on `85f508fc`, `npm run build` first):

| Command | Result |
|---|---|
| `npm run test:coverage` | exit 0; 166 suites / 2759 tests; 98.73 / 94.58 / 94.01 / 99.49 (`main` `bd60a7a3`: 98.71 / 94.54 / 93.96 / 99.48) |
| `npm run -s lint` | exit 0 |
| `npm run -s docs:api` | exit 0 |
| `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| `npx tsc -p tsconfig.build.json --noEmit` | exit 0 |
| `npm run -s wingfoil -- memory search --type task` (pinned 0.2.2 reads `memory.yaml` 1.7) | exit 0 |
