---
id: task-247-decide-every-memory-transition-from-the-element-s-committed-status-and-resolve-its-document-at-head
type: task
title: "Decide every memory transition from the element's committed status and resolve its document at HEAD"
status: done
release: "v0.3"
kind: "fix"
priority: "high"           # optional — high | medium | low
tags: ["v0.3","core","memory","baseline"]
ref: "bug-187"                # optional — backlog item ID, e.g. "TASK-001"
bug: ["bug-187"]                # optional — LIST of bug ids this task closes (dl-045). Two cases: a fix task derived from a bug
                       # by release-planning, and a bug ABSORBED into an existing task's Acceptance Criteria because that
                       # task already owns the ground. `bug.sync_state` iterates this list; a bug with no task naming it
                       # here never advances past `triaged` (only a reject to `closed`, dl-123). A single string is still accepted for documents predating dl-045.
                       # dev-loop keeps the source bug's state in sync with this task via bug.sync_state
depends_on: ["task-137-read-pillar-configuration-memory-documents-any-commit-not"]         # optional — ids of tasks whose Execution Notes constrain this one (dl-015); authored at planning time, may be appended during design
tmpl_version: 260703   # Orignal template version
wave: "w1"
---

## Description

`memory submit` finds its document by scanning the working tree (`findMemoryDocumentById`, called from
`prepareMemoryTransition`, `src/core/memory-transition.ts`) and reads the current `status` from the
working-tree frontmatter (`bug-187`). It can therefore:
- submit again an element already past `draft` at `HEAD`;
- submit a hand-made document that has no `add` commit;
- refuse a document deleted in the working tree that `HEAD` still holds.

The other transition verbs resolve the id the same way, the shape of `bug-108`. `spec-006` §6 item 1
(approved) states that a transition reads the element's committed `status`, and §6's table, as amended
by `task-161`, records these reads as working-tree deviations owed to `HEAD`. `task-137` provides the
readers at a commit.

## Acceptance Criteria

- (red-first) `memory submit` decides the transition from the `status` committed at `HEAD`. With
  `HEAD` at `open` and the working tree edited back to `draft`, it is refused as an illegal
  transition from `open`, exit 1, and nothing is written.
- (red-first) A document with no commit at `HEAD`, created by hand, is refused by every transition
  verb (submit, approve, reject, deprecate, amend) with a message naming `memory add`, exit 1.
- (red-first) Every transition verb resolves the id against the documents at `HEAD`. The edited
  working-tree file is still what `submit` and `amend` commit: content from the working tree, state
  from `HEAD`.
- (characterization) The existing transition suites stay green. `spec-006` §6's table no longer lists
  these reads as deviations, and `spec-008` §11 likewise; both are amended with a dated Revision note.

## Implementation Notes

- **kind:** fix · **wave:** 1 (added after `commit-backlog`, from `task-161`'s independent review).
- **Implements:** `spec-006` §6 item 1; `dl-080`; closes `bug-187`.
- **Features:** P1.6–P1.9.
- **Notes:**
  - Use `findMemoryDocumentByTypeAndIdAtRev` and `loadMemoryYamlAtRev` from `task-137` at the sha
    resolved once.
  - `task-132`'s `beginMemoryTransition` is the single preamble to change.
  - `bug-108` (`directive remove` resolves its name in the working tree) is the same class but a
    different command, not in scope.
- Added on 2026-10-02 by the approver's triage of `bug-187`
  (`bug-ingest-rel-v0.3-w1b2-review-findings-plan`).

## Execution Notes

Branch `task/task-247-decide-every-memory-transition-from-the-element-s-committed-status-and-resolve-its-document-at-head`,
worktree `../.wf2-wt/task-247`, cut from `main` at `903b87a6`; start `45f7148f`, `bug-187` synced
`planned → in-progress` at `215af0b2`.

### design (architect)

**`depends_on` read (dl-015).** `task-137` (`done`): resolve `HEAD` once with `resolveRevision`, pass
the sha to every reader so they see one commit, and feed the Memory readers the `memoryYaml` loaded at
that sha. Its review records that a symlink committed under a scan root is listed at a commit as a
blob (its link text), while the working-tree scan follows it. That matters here: a transition on a
symlinked document now finds nothing at `HEAD` (see green). `task-132`'s `beginMemoryTransition` stays
the single preamble; only `prepareMemoryTransition`, which it calls, changes.

**Specs.** `spec-006` and `spec-008` are `approved` (`grep -m1 '^status:'`). `spec-006` §6 item 1 states
the rule; its table and `spec-008` §11 list the transition verbs' id lookup and status read as
working-tree deviations owed to `HEAD`. They become `HEAD` rows: pending amendments below.

**Shape.** `prepareMemoryTransition` resolves `HEAD` once (`atHeadOr(resolveRevision)`, so no commit at
all keeps the "not committed at HEAD" refusal), loads `memory.yaml` with `loadMemoryYamlAtRev(sha)` and
finds the document by bare id with a new `findMemoryDocumentByIdAtRev` (`src/memory/query.ts`, the
bare-id sibling of `task-137`'s `findMemoryDocumentByTypeAndIdAtRev`, same lazy batch parse). `type`
and `from` come from `HEAD`; `content` and `frontmatter` from the working tree, which is what `submit`
and `amend` commit. The working tree supplies the content to commit, is checked to be the same element
`HEAD` records (present, same `id` and `type`), and is otherwise read only to word a refusal (`command-baseline`:
"may be read to explain a refusal, never to decide one"):

- not found at `HEAD` but a working-tree document carries the id → `NOT_FOUND` naming the path, "is
  not committed at HEAD" and `memory add`; when `HEAD` holds that path under another id →
  `VALIDATION` naming `frontmatter field 'id'`; when the path is behind a symlink or outside the root
  → the filesystem guards' own refusal (`requireConfinedWriteTarget`, `requireInspectableTarget`);
- found at `HEAD`, deleted in the working tree → `VALIDATION` naming the path ("deleted in the working
  tree"), instead of `document not found`;
- working-tree `id` or `type` differs from `HEAD`'s → `VALIDATION` naming the field, so `submit`
  cannot commit a different element than the one it decided on.

**AC classification (T1).**

| AC | Class | Why |
|---|---|---|
| 1 — submit decides from `HEAD`'s `open` | red-first | the working-tree status decided (red: the verb computed `draft → open` and `git commit` threw "nothing to commit") |
| 2 — uncommitted document refused by all five verbs, naming `memory add` | red-first for submit/approve/reject/deprecate; characterization for amend | `amend` already refused it (`requireAmendableEdit`, "nothing to amend … memory add and memory submit"); the other four committed it or failed with the write guard's wording |
| 3 — id resolved at `HEAD`; content from the working tree | red-first (lookup, deleted file, status edit on submit); characterization (amend content) | the working-tree scan picked an uncommitted copy and reported a deleted document as not found; amend already committed working-tree content |
| 4 — existing suites green, spec tables amended | characterization | |

### red (developer)

`a41173c6` adds `test/core/memory-transition-head-baseline.test.ts`. `npx jest
test/core/memory-transition-head-baseline.test.ts --json` → **13 failed, 3 passed of 16**: AC1, AC3
submit-status, AC3 sorted copy, AC3 deleted ×5, AC2 ×4 (submit/approve/reject/deprecate), AC2 staged.
The 3 passing are the two amend characterizations and the unchanged P1.6 sc.3 message. Each failure is
the defect (wrong `from`, a commit made, `document not found`, the write guard's wording), not a fixture
fault.

### green (developer)

`3638548b`: `src/core/memory-transition.ts`, `src/memory/query.ts` (+ barrel). Two test-side changes on
the way, both wording, not rule: the red assertions expected `from 'open'`, the `dl-032` message reads
`illegal transition open -> …`; fixed in the red suite. Existing suites that met the stricter rule:

- `memory-amend.test.ts`: three refusals now come from the preamble; the preamble's messages were worded
  to keep their pinned substrings (`frontmatter field 'id'|'type'`, `<path> is not committed at HEAD`)
  rather than changing those tests.
- `memory-transition-commit-scope.test.ts` "approve refuses a document not tracked at HEAD at all":
  the refusal now precedes the write guard, so its expected text moves from the guard's "not tracked at
  HEAD" to the preamble's "is not committed at HEAD" + `memory add`. Same rule, earlier refusal.
- `memory-machine-baseline.test.ts`: its spy on `loadMemoryYamlAtHead` moves to `loadMemoryYamlAtRev`,
  the reader the preamble now calls; the property pinned (a non-`ValidationError` propagates) is
  unchanged.
- The symlink suites (`memory-transition-symlink-target`, `memory-transition-confinement`,
  `write-guard-uninspectable-target`) commit their documents already; at `HEAD` a symlinked document or
  type directory is not a tree entry under the scan roots, so it is not found. The not-found branch
  therefore asks the two filesystem guards first, which keeps those suites' "symbolic link" /
  "outside the project root" refusals. No fixture needed to commit anything new.

Also in `3638548b`: `command-baseline` 1.3 → 1.4 (its "where the shipped code still deviates" paragraph
keeps only `bug-108`; `test/directives/schema.test.ts` pins 1.4) and `docs/cli-reference.md`'s *Git side
effects* paragraph, which described this defect.

### refactor (developer)

`b5b9ef3c`. The first coverage run (`3638548b`) came back under `main`: 98.74 / 95.28 / 95.22 / 99.50
against 98.85 / 95.39 / 95.18 / 99.56. Causes, by `lcov.info` diff: the preamble now shadows three
defences that the suites reached through it — `requireAmendableEdit`'s not-at-`HEAD` refusal
(`memory-amend.ts:104`), `requireNoDivergentStage`'s inspectability refusal (`write-guard.ts:181`), and
`memoryAmendFn`'s confinement check (`index.ts:1413`) — plus a dead `catch` in the new `recordedIdAt`
(the full `HEAD` scan has already parsed every path it could read). Changes: the dead `catch` removed;
the first two defences pinned directly; a new case per write-side verb (`submit`, `amend`) where a
committed document is swapped for a symlink out of the project in the working tree, which reaches the
remaining two; a test that an unparsable working-tree document cannot change a refusal; a test for the
renamed-id refusal.

| Gate | Result |
|---|---|
| `npm run test:coverage` (worktree, `b5b9ef3c` + pending amendments) | 201 suites / 3387 tests passed; 98.86 / 95.42 / 95.22 / 99.57 |
| the same on `903b87a6`, detached worktree | 200 suites / 3363 tests; 98.85 / 95.39 / 95.18 / 99.56 — no regression |
| `memory-transition.ts` | 99.06 / 98.33 / 100 / 100; uncovered line 281 = rethrow of a non-`ValidationError` from the content read (base had the same, line 177) |
| `npm run lint` | exit 0 |
| `npm run docs:api` | exit 0, 0 warning lines (`grep -ci warning`) |
| `npx tsc --noEmit -p tsconfig.json` / `npx tsc -p tsconfig.build.json --noEmit` | exit 0 / exit 0 |
| `npm run -s check:governance` | exit 0; gated: 0 findings |
| `npm run build && node scripts/e2e-smoke.cjs -- node "$PWD/dist/cli.js"` | exit 0, 19 `ok` lines, none other |

BDD: `P1.6`–`P1.9` features have no scenario about the baseline (`grep -il "working tree\|committed"`
over them → nothing); their scenarios run in `memory-submit`/`approve`/`reject`/`deprecate` suites,
green above.

### review (reviewer)

| AC | Status | Evidence |
|---|---|---|
| 1 | met | "AC1: HEAD at `open` …": `INVALID_TRANSITION`, exit 1, `illegal transition open -> `, `HEAD` and the file unchanged |
| 2 | met | "AC2: %s refuses a hand-made, untracked document" ×5 + staged variant: exit 1, message holds `memory add` and the path, no commit, file byte-identical |
| 3 | met | sorted-copy case refused from `pending`; deleted ×5 name the path, never `document not found`; submit commits working-tree body with `from: draft` despite a hand-set `backlog`; amend commits working-tree body at `open → open` |
| 4 | met | full suite 3387/3387; spec-006 §6 and spec-008 §11 edited with dated Revision notes (pending amendments) |

Same-class sweep in touched files: `grep -n "findMemoryDocumentById(" src/core` → only `memoryHistory`
(a read that gates nothing, `spec-006` §6 item 4) and the explaining scan. `directive remove`
(`bug-108`) is the same class in another command, out of scope per the task.

**Pending amendments (approver)** — uncommitted in the worktree, gates run with them:

- `spec-006-core-domain-api` — `--reason "§6's table moves the transition verbs' id lookup and status read from working tree, deviating to HEAD, per item 1 and bug-187, as task-247 implements them; the working tree supplies the content to commit and is checked to be the element HEAD records; the deviating row keeps directiveRemove alone (bug-108)."`
- `spec-008-cli-grammar` — `--reason "§11's working tree, a defect row drops the Memory transition verbs, which find their document and read its status at HEAD since task-247 (bug-187); the HEAD row names what they read there."`

### review fixes (independent review: approve with fixes)

Red `97d0e596` (4 new cases in `memory-transition-head-baseline.test.ts`; `npx jest … -t "review:"` →
4 failed: the old hint, "deleted" for a dangling link, a raw `ValidationError` throw). Fix `f4ec961c`.

1. **Restore hint.** `git restore -- <path>` restores from the index, which lacks the path after `git rm`
   or `git mv`. The refusal now names `git restore --source=HEAD --staged --worktree -- <path>`; the
   tests run that exact command after a staged deletion and a staged rename and read the committed
   file back. Checked by hand over a dangling link too (scratch repo: the link is replaced by the file).
2. **Dangling link.** Presence is now `lstatSync` (a link is present even when dangling). A live link
   reaches the write-side guards as before; a dangling one, which the content read would otherwise
   throw on, is refused naming "a symbolic link whose target does not exist", with the same hint.
3. **Claim precision.** "Read only to word a refusal" overstated: the presence and `id`/`type` checks
   refuse because of the working tree. Reworded in the module header, `command-baseline` 1.4 (still
   1.4: the bump is this task's and unreleased), the `spec-006` Revision note and table row (pending
   amendment, reason updated above) and the design notes: the working tree supplies the content to
   commit, is checked to be the same element `HEAD` records (present, same `id` and `type`), and is
   otherwise read only to word a refusal. `docs/cli-reference.md` makes no such claim.
4. **Stale TSDoc.** `src/core/index.ts`: `memorySubmitFn`/`memoryApproveFn`/`memoryRejectFn`/
   `memoryDeprecateFn`/`memoryAmendFn` steps now say the document is read at `HEAD` too, and approve's
   step 6 names `findMemoryDocumentByIdAtRev` at `HEAD`. `grep -rn "findMemoryDocumentById\b" src` →
   the `memoryHistory` call (a read that gates nothing), the explaining scan, the barrels, and
   `src/mcp/memory-resource.ts`'s history note about the bare-id primitive — none describes a transition.
5. **Malformed committed document.** Small: one `try` around `findMemoryDocumentByIdAtRev` in
   `prepareMemoryTransition`; `parseMemoryDocumentsAtSha` is untouched. A `ValidationError` becomes a
   `VALIDATION` refusal at exit 1 whose message names the document as `HEAD:<path>` (the reader labels
   it with the resolved sha; the label is rewritten). A non-`ValidationError` still propagates
   (`memory-transition.ts:215`, uncovered, as the existing rethrow at :323 is).

| Gate (worktree `f4ec961c` + pending amendments) | Result |
|---|---|
| `npm run test:coverage` | 201 suites / 3391 tests passed; 98.85 / 95.40 / 95.22 / 99.57 (base `903b87a6`: 98.85 / 95.39 / 95.18 / 99.56) |
| `npm run lint` / `npm run docs:api` | exit 0 / exit 0, 0 warning lines |
| `npx tsc --noEmit -p tsconfig.json` / `npx tsc -p tsconfig.build.json --noEmit` | exit 0 / exit 0 |
