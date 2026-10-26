---
id: "task-227-link-added-element-workflow-step-memory-add-workflow"
type: task
title: "Link an added element to its workflow step with `memory add --workflow <ref> [--step <key>]`"
status: done
release: "v0.3"
kind: "feature"
priority: "high"
tags: ["v0.3", "workflow", "memory", "cli"]
ref: "spec-017"
bug: []
depends_on: ["task-128-allocate-element-ids-highest-number-ref-across-folder", "task-163-implement-date-author-id-tokens-edit-frontmatter-through", "task-216-add-workflow-next-naming-next-step-verb-role"]
tmpl_version: 260703
wave: "w3"
---

## Description

The only way an element becomes "created by" a step is the pair of trailers on its add commit. `memory add` gains `--workflow <ref>` and `--step <key>`; `workflow next` already reports them filled on every `memory.add` action (task-216).

## Acceptance Criteria

- (red-first) With `--workflow`, the add commit carries `WingFoil-Instance: <id>` and `WingFoil-Step: <key>`, and the element appears in the step's `created` on the next deduction.
- (red-first) Without `--step`, the one frontier step adding `--type` is chosen; none → `no step of <instance> adds a <type>`; several → the same refusal listing the keys (`CONFLICT`, exit 1).
- (characterization) Without `--workflow`, `memory add`'s output and commit are byte-identical to before (existing suites unchanged).
- (characterization) `spec-008` gains both options in the `memory add` grammar, with a dated Revision note.

## Implementation Notes

- **Size:** S · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** spec-017 §7.10, §4.8 linkage; ruling R16; spec-008 amendment (`memory add --workflow`, `--step`).
- **Features:** P4.13, P4.11.
- **Notes:** Proposal key: A14.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

### Design (architect, 2026-10-10)

- **Specs.** `spec-017` (§4.8 linkage, §7.10, §10, §11) and `spec-008` (§12) are `approved`
  (`grep -n "^status" docs/04_memory/design/specs/spec-0{08,17}-*.md`).
- **depends_on (dl-015).** `task-128` and `task-163` are `done` and leave no handover on `memory add`
  (`grep -n "andover\|task-227\|--workflow" docs/04_memory/v0.3/task-1{28,63}-*.md` → nothing). `task-216`
  (`done`) hands over item 6: `next` already prints `memory add … --title <title> --workflow <instance> --step <key>`
  (`src/core/workflow-next.ts:313`), and `docs/cli-reference.md` marks the two options as planned (its fix 4).
- **What reads the linkage.** `readFacts` (`src/core/workflow-deduction.ts:194-216`) takes `WingFoil-Instance` and
  `WingFoil-Step` from `%(trailers:only,unfold)` (line 135), i.e. from the message's **final paragraph** only.
  `commitPaths` appends `WingFoil-Version:` as a paragraph of its own (`stampedMessage`,
  `src/storage/commit.ts:98`), so a linkage paragraph written into the caller's message would be invisible to
  the deduction. Design: `CommitOptions.trailers` — extra trailer lines the primitive writes in the
  signature's paragraph, before `WingFoil-Version:` (which stays the last line). The dry-run plan's `message`
  goes through the same `stampedMessage`, so `--dry-run` shows the linkage too. Without the option nothing
  changes (AC 3).
- **Resolution** (`src/core/memory-add-link.ts`, new): one deduction at `HEAD` (`readDeductionSnapshotAtHead` +
  `deduceWorkflowState`, as `workflow next`), `resolveInstanceRef` for `<ref>`, then the frontier steps with a
  `memory.add` action whose `type:` (`memoryAddType`) is the `--type` given. Runs after the type is resolved and
  before the id is allocated, so every refusal precedes the write and a `--dry-run` refuses the same way.
  Refusals (all exit 1):
  - `<ref>` names no open instance: `workflow is not open: <ref>` for a loaded workflow name, else
    `unknown workflow: <ref>` (`NOT_FOUND`) — `workflow next`'s two lines (`spec-017` §10);
  - `--step <key>` not on the instance's frontier: `step '<key>' is not on the frontier of <instance>`
    (`CONFLICT`) — `finalize`'s row of §10, reused;
  - no frontier step (or the `--step` one) adds the type: `no step of <instance> adds a <type>` (`CONFLICT`);
  - several, without `--step`: `no step of <instance> adds a <type> alone: give --step, one of: <k1>, <k2>`
    (`CONFLICT`, keys in frontier order, also in `details.steps`);
  - a `spec-003` error at `HEAD`: `VALIDATION`, through `loadOrError`.
  `--step` without `--workflow` is a usage error (exit 2): `missing required argument: --workflow`.
- **AC classification** (testing directive, dl-014/T1):

| AC | Class | Why |
|---|---|---|
| 1 trailers + `created` | red-first | `memory add` declares no `--workflow` today: the option is ignored and no trailer is written |
| 2 step selection / refusals | red-first | new behaviour |
| 3 no `--workflow` unchanged | characterization | existing suites pin the output; one new test pins the message and that no `WingFoil-Instance`/`-Step` line is written |
| 4 spec-008 grammar | characterization | a spec edit (pending amendment), checked by reading it back; the CLI side is pinned by `test/docs/cli-reference.test.ts` |

- **Spec edits (pending amendments, uncommitted):** `spec-008` §12 rows for `memory add --workflow` / `--step`
  + a dated Revision note (AC 4); `spec-017` §10 gains the `memory add --workflow` refusal rows (the §7.10
  text names the "none" / "several" refusals but §10's table has no row for them).

### Red (qa, 2026-10-10)

- `d5f4626d` — `test/core/memory-add-workflow-link.test.ts` (AC 1–3, through the registered `memoryAdd`) and
  `test/cli/memory-add-workflow.integration.test.ts` (`--help`, following `workflow next`'s printed argv, exit
  codes, through `dist/cli.js`). Run before any source change:
  `npx jest test/core/memory-add-workflow-link.test.ts test/cli/memory-add-workflow.integration.test.ts` →
  **15 failed, 1 passed** (the AC 3 case passes: characterization). The failures are the right ones: no
  `WingFoil-Instance`/`-Step` line (only `WingFoil-Version`), `element: null` after the add, `ok: true` where
  each refusal is expected, `--step`/`--workflow` absent from `--help`.
- `c25ad788` — two red-era expectations corrected after green showed them wrong, plus one case added:
  once the creating step binds its element its key gains the scope (`capture.record@bug:<id>`, `spec-017`
  §4.9), and the CLI fixture's `note` type lacked `template.frontmatter`, so it failed on `memory.yaml`, not on
  the behaviour. The added case links a second bug through that scoped key and checks it is listed in
  `created` without rebinding (§3.4). `tests.unchanged(since: red)` will name this commit.

### Green (developer, 2026-10-10)

- `96722ec9` — `CommitOptions.trailers` (`src/storage/commit.ts`): extra trailer lines in the signature's
  paragraph, before `WingFoil-Version:`; used by the real commit and the dry-run plan alike.
  `src/core/memory-add-link.ts` (new): `resolveAddLink` / `addLinkTrailers`. `memoryAddFn`
  (`src/core/index.ts`): `--step` without `--workflow` is a `UsageError`; the link is resolved inside the
  existing `try`, through `loadOrError`, after the type and before the id; `CoreResult.commit.message` is
  the subject plus the linkage paragraph (the build signature aside, as before). The `memoryAdd` operation
  declares the two value options. Same command → **16 passed**.

### Refactor (developer, 2026-10-11)

- `7e31a55c` — `docs/cli-reference.md`: `memory add` gains the two options, the linkage paragraph and the
  exit-1 refusals; `workflow next`'s "Planned" paragraph keeps only `agent execute --workflow/--step` (task-235).
  `memoryAddFn`'s doc comment names the link step. A CLI case pins `--dry-run`'s planned message with the
  linkage before `WingFoil-Version:`. `test/docs/name-resolvability.allowlist.ts` loses the `spec-017` entry
  `wingfoil memory add … --workflow <ref> [--step <key>]` (`plannedBy: task-217, task-227`), which the test
  reported `stale` once the options shipped.
- **Gates** (with the spec amendments in the working tree; load rule of the B5 notes: `--maxWorkers=2`,
  started at a 1-minute load of 22.14):
  - `npm run test:coverage -- --maxWorkers=2` (the same jest config `npm test` runs, plus coverage) at
    `96722ec9` + uncommitted docs → **349 suites, 6493 tests passed**; All files 99.29 / 97.04 / 97.75 / 99.70
    (stmts / branches / funcs / lines) against the B4 gate's 99.29 / 97.04 / 97.74 / 99.69
    (`grep "^All files" ../devloop-kit/gate-w3b4-cov.log`); `src/core/memory-add-link.ts` 100 / 100 / 100 / 100.
    Two earlier full runs were killed by machine restarts/the coordinator under load 165 (no result); the
    timing suites `query-latency` / `resource-latency` failed only in one of those loaded runs and passed here.
  - After `7e31a55c` (comment, one test case, allowlist line, docs): `npx jest
    test/docs/name-resolvability.test.ts test/docs/enumeration-parity.allowlist.test.ts
    test/cli/memory-add-workflow.integration.test.ts test/docs/cli-reference.test.ts --maxWorkers=2` → 23 passed;
    task suites `test/core/memory-add-workflow-link.test.ts` + the CLI one → 29 passed together with
    name-resolvability.
  - `npx tsc --noEmit -p tsconfig.json`, `npx tsc -p tsconfig.build.json --noEmit`, `npm run lint`,
    `npm run docs:api` → exit 0 (at `7e31a55c`).
  - `node scripts/check-governance.cjs --base 30b268a3` → "1 wf() commits … and 3 other commits", gated 0,
    history 0 (run at `96722ec9`; re-run before submit below).
  - name-resolvability's untriaged counts for spec-008 (1) and spec-017 (8) are the same with the HEAD
    versions of both specs checked out (`git checkout HEAD -- <specs>`, run, restore): the amendments add none.
- **BDD:** no scenario of `P4.11` / `P4.13` names `memory add --workflow` or the linkage
  (`grep -rln -- "--workflow\|WingFoil-Step\|created by" docs/02_requirements/02_bdd/features/` → nothing);
  the ACs ask for none.

### Review (reviewer self-check, 2026-10-11)

| AC | Status | Evidence |
|---|---|---|
| 1 | met | `memory-add-workflow-link.test.ts` AC 1 block: `%(trailers:only,unfold)` of the add commit is `WingFoil-Instance`, `WingFoil-Step`, `WingFoil-Version`; the next `deduceWorkflowStateAtHead` binds the bug and lists it in `created`; a second link via the scoped key is listed without rebinding. CLI: following `workflow next`'s printed argv links the bug |
| 2 | met | AC 2 block: one step chosen; none → `no step of cap-1 adds a note` / `no step of loop-1 adds a bug`; several → `… alone: give --step, one of: twice.early, twice.late` (`CONFLICT`, `details.steps`); `--step` picks; off-frontier and unknown/closed `<ref>` refused; nothing written (HEAD and `git status` unchanged). CLI: exit 1 / exit 2 |
| 3 | met | AC 3 case: message and `%B` are the bare subject + `STAMP_TRAILER`; every pre-existing suite passes unchanged (349/6493) |
| 4 | met (pending amendment) | `spec-008` §12 rows + Revision note (uncommitted, below); CLI side pinned by `test/docs/cli-reference.test.ts` |

- Same-class check in the files touched: the one other place a commit's message is built outside
  `stampedMessage` is none (`grep -n "stampedMessage" src/storage/commit.ts` → the real commit and the dry-run
  plan, both pass `options.trailers`).
- Security: the trailer values are an open instance's id and a frontier key from the deduction, never the raw
  `--workflow` / `--step` text (a value that matches neither is refused), so no user text reaches the message.

### Pending amendments (approver)

- `spec-008-cli-grammar` — §12 rows `memory add --workflow <ref>` / `--step <key>` + Revision (2026-10-10).
  Proposed `--reason`: `task-227 ships memory add --workflow <ref> [--step <key>] (spec-017 §7.10, ruling R16): §12 gains one row per option, with --step's dependency on --workflow (exit 2) and the refusals' exit 1; no global flag, exit code or error format changes.`
- `spec-017-workflow-commands-and-state-deduction` — §7.10 (trailer placement, off-frontier `--step`,
  `--step` without `--workflow`), §10 rows for `memory add --workflow`, Revision (2026-10-10).
  Proposed `--reason`: `task-227 ships memory add --workflow/--step: §7.10 says the linkage trailers sit in the final paragraph before WingFoil-Version, which is the only paragraph git and the walk read, and how an off-frontier --step is refused; §10 gains the none and several refusal rows §7.10 already named. No deduction rule changes.`

### Decisions for the approver

1. **Trailer placement.** The linkage lines share the final paragraph with `WingFoil-Version:` (a new
   `CommitOptions.trailers`), because `%(trailers)` reads only that paragraph; a paragraph of their own would be
   invisible to the deduction. `WingFoil-Version:` stays the last line.
2. **"Several" wording.** §7.10 says "the same refusal listing their keys": implemented as
   `no step of <instance> adds a <type> alone: give --step, one of: <k1>, <k2>` (`CONFLICT`), keys in frontier order.
3. **Off-frontier `--step`** reuses `finalize`'s `step '<key>' is not on the frontier of <instance>` (`CONFLICT`);
   a frontier `--step` whose phase adds another type gets the "none" message.
4. **`--step` without `--workflow`** is exit 2, `missing required argument: --workflow` (the `dna add --value`
   precedent), rather than defaulting to the active instance.
5. **`<ref>` refusals** mirror `workflow next`: a loaded workflow with no open instance → `workflow is not open:
   <ref>`, anything else (including a closed instance's id) → `unknown workflow: <ref>` (both `NOT_FOUND`).
6. **`CoreResult.commit.message`** with `--workflow` is the subject plus the linkage paragraph (what is recorded,
   the build signature aside); without it, unchanged.

### Candidate findings (not filed)

- **The creating step's key changes once it binds.** Before the first link the key is `capture.record`; after
  it, `capture.record@bug:<id>` (`spec-017` §4.9 scope). Both keys link correctly (tested), but a user who copied
  `--step capture.record` from an earlier `workflow next` is refused after the first add as "not on the
  frontier". Possibly worth a sentence in spec-017 §4.9/§7.10 or an alias for the unscoped key.
- **A closed instance's id as `<ref>`** reads `unknown workflow: <id>` (shared with `workflow next`), which
  misnames an instance as a workflow; a dedicated "instance is not open" message may be clearer.
- `bug-324` (seven `decision-log-ingest` plans with no linkage) can now be resolved by following `next`'s argv
  for new captures; a backfill of the old ones is still open there.

### Merge-order notes

- **task-226** (`workflow finalize`, merges before 227) writes its phase-record trailers
  (`WingFoil-Phase`/`-Instance`/`-Element`) and meets the same paragraph problem: if it adds its own trailer
  mechanism to `src/storage/commit.ts`, expect a conflict around `CommitOptions` / `stampedMessage`; the two
  should converge on one `trailers` option at the gate.
- **task-217 / 226 / 225 / 235**: adjacent edits in `docs/cli-reference.md` (227 edits the `memory add` entry and
  the `workflow next` "Planned" paragraph, from which 235 will drop the `agent execute` part), spec-017 §7.10/§10
  and §12 of spec-008 (Revision notes in merge order), and `test/docs/name-resolvability.allowlist.ts` (217 is
  also in the removed entry's `plannedBy`). `CORE_MODULES`: 227 only touches the `memoryAdd` options block.

### Retrospective

- Two red expectations were wrong for reasons only green could show (scoped key after binding; a fixture schema
  gap): one correction commit `c25ad788`, named for `tests.unchanged(since: red)`.
- Three full-suite runs were lost to restarts/load (detached runs included); the load rule (`--maxWorkers=2`,
  wait for load ≤ 24, no detached runs) made the fourth complete.
