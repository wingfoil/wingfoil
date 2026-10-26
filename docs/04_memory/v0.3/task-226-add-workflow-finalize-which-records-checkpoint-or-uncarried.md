---
id: "task-226-add-workflow-finalize-which-records-checkpoint-or-uncarried"
type: task
title: "Add `workflow finalize`, which records a checkpoint or an uncarried approval as a phase-record commit"
status: done
release: "v0.3"
kind: "feature"
priority: "high"
tags: ["v0.3", "workflow", "cli", "approvals"]
ref: "spec-017"
bug: []
depends_on: ["task-126-declare-closed-wf-operation-grammar-bracket-set-state", "task-132-read-approver-identity-once-use-authority-check-approver", "task-192-stamp-wingfoil-commit-wingfoil-version-semver-sha-pin", "task-216-add-workflow-next-naming-next-step-verb-role"]
tmpl_version: 260703
wave: "w3"
---

## Description

28 phases on this repository complete only by a record (spec-017 §12). `finalize [<ref>] [--step <key>] [--reason]` writes one commit with no file change, subject `workflow: finalize <instance-id> <key>` (outside the `wf()` grammar) and the phase-record trailers; on an `approval:` phase it needs approver authority and a `dl-067`-shaped reason with `Approver:` / `Reason:` in the body.

## Acceptance Criteria

- (red-first) Finalizing a checkpoint step writes the trailers `WingFoil-Phase: <w>.<p> completed`, `WingFoil-Instance`, `WingFoil-Element`/`WingFoil-Item`, and the next deduction moves past the step; the output is the finalized step and the new next step.
- (red-first) Refusals: `step '<key>' is not on the frontier of <instance>` and `phase '<w>.<p>' completes from its evidence: <kinds>` (`CONFLICT`, exit 1); missing git identity (REQ-SEC-01).
- (red-first) On an approval phase: an identity without the `approver` role gets `memory approve`'s refusal; missing/blank/`Approver:`-leading reason → exit 2 with the `dl-067` messages; a valid one writes `Approver:` and `Reason:` exactly as `memory approve` does, with the identity read once (`bug-149`).
- (red-first) `memory history` does not report the finalize commit as a Memory operation.
- (characterization) The empty commit is written with `--allow-empty` through the storage commit helper with the pinned `--cleanup` mode (`bug-051`'s rule), and is refused on a dirty index rather than sweeping staged files (`dl-106`).

## Implementation Notes

- **Size:** M · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** spec-017 §7.9, §4.3 `record`, §5.1 (uncarried approvals), §5.4; ruling R11; dl-104 D1 (b)–(c); REQ-SEC-01; REQ-SEC-03; P1.7.
- **Features:** P4.13, P4.14.
- **Notes:** Proposal key: A13.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

Branch `task/task-226-add-workflow-finalize-which-records-checkpoint-or-uncarried`, worktree
`../.wf2-wt/task-226`, cut from `main` at `30b268a3` (pre-batch main, W3 B5); start `f02acf08`
(`wf(task): start … [backlog → in-progress]`). `bug: []`, so no bug status syncs.

### design (architect)

**`depends_on` read (dl-015).** All four are `done` (`grep -H "^status:" docs/04_memory/v0.3/task-{126,132,192,216}-*.md`).
- `task-126`: `workflow: finalize …` is outside the `wf()` grammar; `parseMemoryOperation` already reads it
  as `null` (its AC 6 was a characterization: the reader requires `^wf\(`).
- `task-132`: the identity is read once (`requireGitIdentity`) and handed to `requireApprovalAuthority`
  and to the commit as its author (`CommitOptions.author`) — `bug-149`. Order usage → identity →
  legality → authority. Reused as is.
- `task-192`: every tool commit ends with a `WingFoil-Version:` paragraph appended by the commit
  primitive (`stampedMessage`), `--cleanup=whitespace` pinned (`bug-051`).
- `task-216`: `workflow next` reports `evidence.finalizable` (missing = `[record]`), its third-party
  "human needed" line says `workflow finalize` is "not available yet", and `docs/cli-reference.md` marks
  it planned (task-216 review fix 4): this task replaces both. `buildStep` / `NextResult` are reused for
  the output.

**Specs.** `spec-017`, `spec-003`, `spec-005`, `spec-006`, `spec-008` are `approved`
(`grep -H "^status:" docs/04_memory/design/specs/spec-0{03,05,06,08,17}*.md`). §7.9, §4.3 `record`,
§5.1, §5.4, §10, §11 of `spec-017` define the command.

**A spec conflict, found at design (decision 3 below).** `spec-003` § "Evidence" puts the record's
`WingFoil-Phase` / `WingFoil-Instance` / `WingFoil-Element|Item` lines in "the trailer block" of the commit,
and the deduction reads them with git's `%(trailers:only,unfold)` (`src/core/workflow-deduction.ts`
`readWalk`), which reads **the final paragraph only**. `spec-008` §2 says the build signature is "a
paragraph of its own holding one trailer line" at the end of every tool commit (`stampedMessage`,
`src/storage/commit.ts`). Both cannot hold: a record whose phase trailers sit in their own paragraph
before the signature is invisible to the deduction. Measured on a scratch repository:
`git commit --allow-empty -m "workflow: finalize p x.y" -m "WingFoil-Phase: x.y completed
WingFoil-Instance: p" -m "WingFoil-Version: 0.3.0 (abc)"`, then `git log -1
--format='%(trailers:only,unfold)'` prints `WingFoil-Version: 0.3.0 (abc)` alone.

**Scope surprises.**
- The uncarried-approval detection (`recordNeeded` on the six approval phases of `spec-017` §5.1) is
  `task-225`'s AC 5, not this task's: `deduce.ts` adds `record` today only to a checkpoint, an `awaits`
  and a `created` step that created nothing (`grep -n "recordNeeded" src/workflow/deduce.ts` → 1220).
  `finalize` therefore takes any step whose `evidence.finalizable` is true, and requires authority and a
  reason whenever its phase declares `approval:` — which already covers the approval **checkpoints**
  (`release-submit.approve-release`, `release-publishing.publish`, `retrospective.additional-points`). The
  three approval phases with other evidence (`user-docs.align-user-docs`, `agent-docs.align-agent-docs`,
  `e2e-smoke.gate`) become finalizable when `task-225` lands (merge-order note in the report).
- No empty-commit primitive exists (`grep -rn "allow-empty" src` → nothing): it is new code in
  `src/storage/commit.ts`, so AC 5 is not a characterization (classification below).
- A new `mutates: true` operation needs a row in `test/cli/dry-run.integration.test.ts`, whose rows
  assume a commit with paths and a diff; the empty commit's plan has `paths: []` and `diff: ""`.

**AC classification (T1, `testing` directive).**

| AC | Class | Why |
|---|---|---|
| 1 — record trailers; next deduction moves past; output finalized + new next | **red-first** | no `workflowFinalize` operation (`grep -n workflowFinalize src/core/index.ts` → nothing) |
| 2 — refusals: not on the frontier, completes from its evidence (`CONFLICT`, 1); no git identity | **red-first** | new command |
| 3 — approval phase: authority refusal, reason exit 2 (`dl-067`), `Approver:`/`Reason:` as `memory approve`, identity read once | **red-first** | new command |
| 4 — `memory history` does not report the finalize commit | **characterization** | the AC says red-first, but `memory history <id>` walks one element's file (`getMemoryHistory(root, relativePath)`, `src/memory/history.ts`), which an empty commit never touches, and `parseMemoryOperation` reads `workflow: finalize …` as `null` (`task-126` AC 6). A red here would be fabricated: the test pins it on a real finalize commit |
| 5 — `--allow-empty` through the storage helper, pinned `--cleanup`, refused on a dirty index (`dl-106`) | **red-first** for the helper and the dirty-index refusal; the `--cleanup=whitespace` pin is inherited (characterization) | the AC says characterization, but no empty-commit path exists in `src/` (above) |

**Decisions (for the approver to confirm at review).**
1. **Code.** `src/core/workflow-finalize.ts` (`workflowFinalizeAtHead`, `renderFinalizeConsole`), registered
   `workflowFinalize` (`mutates: true`, positional `<ref>` optional, options `--step`, `--reason`). Storage:
   `commitEmpty` in `src/storage/commit.ts` and `stagedPaths`; the dirty-index refusal is a write-guard
   (`requireCleanIndex`, `src/core/write-guard.ts`).
2. **The empty commit uses `git commit --only --allow-empty`** with no pathspec: git's documented form for an
   empty commit that leaves the index alone, so even a caller that skips the guard cannot sweep staged files.
   The guard still refuses first (the AC; `dl-106`'s predictable refusal), before the dry-run stop, so
   `--dry-run` refuses too.
3. **Record trailers share the final paragraph with the signature** (conflict above): the message is
   `workflow: finalize <instance> <key>`, an optional `Approver:`/`Reason:` paragraph, then ONE final
   paragraph `WingFoil-Phase: …`, `WingFoil-Instance: …`, `WingFoil-Element|Item: …` (none for an unscoped
   step) and `WingFoil-Version: …` last. Implemented once as `CommitOptions.trailers` in the commit
   primitive (also what `task-227`'s `WingFoil-Instance` / `WingFoil-Step` on `memory add` needs).
   `spec-008` §2's build-signature bullet and `spec-017` §7.9 are amended (pending). `spec-003` needs no
   amendment: its § "Evidence" already puts the record in "the trailer block" (`spec-003` line 239), which is
   the final paragraph (review F3, 2026-10-11).
4. **Refusal order:** an unrecordable `--reason` (exit 2, `optionalReason`, before any read) → git identity
   (REQ-SEC-01) → instance → step on the frontier → evidence → `--reason` missing on an `approval:` phase
   (exit 2, `missing required argument: --reason`; known only once the phase is) → authority → clean index
   → the commit.
5. **Authority message type.** `requireApprovalAuthority`'s `user not authorized to approve type '<type>'`
   names the step's scope element type, else the instance's bound element type, else `plan`.
6. **No step to finalize.** No open instance and no `<ref>`: `NOT_FOUND` `no active workflow to finalize`
   (as `end`'s `no active workflow to end`). An instance with an empty frontier: `CONFLICT`, with `next`'s
   message (`no next step: workflow '<name>' is complete` / abandoned / not loaded).
7. **`--reason` on a phase without `approval:`** is optional and, when given, recorded as a `Reason:` line
   with no `Approver:` line (as `memory deprecate`).
8. **Output** `FinalizeResult` (`spec-017` §8): `baseline` is the commit the finalize gated on, `finalized`
   the step as `next` builds it at that baseline, `next` the instance's first frontier step re-deduced at
   the new `HEAD`, `commit` the sha. Console: `finalized <key> (<sha>)` then `next`'s step lines.

### red (qa)

`9bf6ba92`: `test/core/workflow-finalize.test.ts` (AC 1–5 on the registered operation: a bound
checkpoint, `--step`, an unscoped step, a collection step with `WingFoil-Item`, an `awaits` step, an optional
reason; the refusals; REQ-SEC-01 with an isolated empty git config; the approval phase with `GIT_AUTHOR_*`
naming the approver; `memory history`; the dirty index), `test/storage/commit-empty.test.ts` (AC 5: no path,
trailers in the final paragraph, `commit.cleanup=strip` keeps a `#` line, a staged file stays staged and out
of the commit, the dry-run plan), `test/cli/workflow-finalize.integration.test.ts` (exit codes 0/1/2 and the
console on `dist/`), a `workflowFinalize` row in `test/cli/dry-run.integration.test.ts` (`empty: true`: plan
`paths: []`, `diff: ""`, the real commit records no path; mutating count 15 → 16), and
`test/core/workflow-next-review-fixes.test.ts`'s third-party line now names the whole finalize command.
Run: `npx jest test/core/workflow-finalize.test.ts test/storage/commit-empty.test.ts
test/core/workflow-next-review-fixes.test.ts test/cli/workflow-finalize.integration.test.ts
test/cli/dry-run.integration.test.ts` → **32 failed, 30 passed** (62): every new case fails on the missing
operation or the missing `commitEmpty` export; AC 4's characterization fails only because it needs a
finalize commit to look for (the same test passes at green, `35144856`, with no edit to it); the dry-run table's other 15 rows pass.

### green (developer)

`35144856`: `src/core/workflow-finalize.ts` (`workflowFinalizeAtHead`, `phaseRecordTrailers`,
`renderFinalizeConsole`), `workflowFinalize` registered in `src/core/index.ts`; `src/storage/commit.ts`
gains `CommitOptions.trailers` (joined into the signature's paragraph by `stampedMessage`), `commitEmpty`
(`git commit --only --allow-empty --quiet --cleanup=whitespace`; dry-run plan with no paths) and
`stagedPaths`; `CommitFailure` words an empty commit as `an empty commit`; `src/core/write-guard.ts` gains
`requireCleanIndex`. `src/core/workflow-next.ts`: `readNextInputs`, `unresolvedRef`, `emptyFrontierMessage`
and `stepLines` exported for `finalize` (same behaviour for `next`), and the third-party line names
`wingfoil workflow finalize <instance> --step <key>`. The four files other than the dry-run table →
**35 passed**; the dry-run file with `-t "workflowFinalize|table names"` → 2 passed, 25 skipped.

### refactor (developer)

- `575e96b9`: `docs/cli-reference.md` (a `workflow finalize` entry; `--dry-run` list and empty plan; the shared
  trailer paragraph under "Git side effects"; `workflow next`'s "not available yet" sentence replaced),
  `docs/user-guide.md` (one sentence), the rosters `test/core/production-registry.test.ts`,
  `test/core/parity.test.ts`, `test/mcp/read-only-agent-channel.test.ts` gain `workflowFinalize`; the three
  `PLANNED` `wingfoil workflow finalize` entries of `test/docs/name-resolvability.allowlist.ts` are spent
  (removed). One entry is **added** to `test/docs/enumeration-parity.allowlist.ts`: `spec-004 §4.1 tools`,
  surplus `workflow.finalize`, `TOOLS_V04` — the same reason its siblings (`agent.execute`, `memory.*`,
  `workflow.start|end`) carry: the production server serves no Tool before v0.4 (decision 9 below).
- `67ec0b63`: the `workflow` module's description no longer says it only reads.
- `b5e6cd05`: `test/core/workflow-finalize-render.test.ts` (a new file, red's files untouched): the console
  renderer, an unscoped approval phase's authority type `plan`, and a `pre-commit` hook refusing the empty
  commit (`CommitFailure`, `git did not commit an empty commit: …`, `HEAD` unmoved) → 4 passed.

Gates (with the pending spec amendments in the working tree):
- `npm run test:coverage -- --maxWorkers=2` (dl-170 interim rule: no other heavy gate running, load 7.7)
  → **350 suites, 6511 tests passed**; All files 99.21 % statements, 96.93 % branches, 97.44 % functions,
  99.62 % lines (the W3 B4 gate log `gate-w3b4-cov.log`: 99.29 / 97.04 / 97.74 / 99.69 — main has moved since,
  so the comparison is indicative). `src/core/workflow-finalize.ts` 90.54 / 85 / 84.61 / 91.66 in that run,
  before `b5e6cd05` covered the renderer and the `plan` fallback; `src/storage/commit.ts` 98.96 / 97.54 / 100
  / 99.6 (line 204, the refused empty commit, covered by `b5e6cd05`).
- `npm run lint` exit 0; `npm run docs:api` exit 0; `npx tsc --noEmit -p tsconfig.json` exit 0;
  `npx tsc -p tsconfig.build.json --noEmit` exit 0; `node scripts/lint-claims.cjs --base 30b268a3` → 2 warn-only `state-claim` hits in this file, reworded at review
  (F4; without `--base` the script reads no file, so the earlier "0 warnings" said nothing);
  `node scripts/check-governance.cjs --base 30b268a3` → 2 `wf()` commits checked (start, submit), 0 findings.
- Earlier full-suite runs (`npmtest1/2.log`) were killed by session restarts; their partial output showed the
  four roster/parity failures fixed in `575e96b9` and REQ-PERF latency failures under load 30+ (not re-run
  alone: the coverage run above passed them at load ≈ 8).

### review (self, reviewer)

| AC | Status | Evidence |
|---|---|---|
| 1 | met | `workflow-finalize.test.ts` AC 1 (6 cases): subject, trailers in the final paragraph read by `%(trailers:key=WingFoil-Phase,valueonly)`, no path in `git show --name-only`, frontier moves (`deduceWorkflowStateAtHead`), `finalized`/`next`; `WingFoil-Item` and an unscoped step |
| 2 | met | AC 2 cases: not on the frontier, completes from its evidence (`state`), unknown `<ref>`, no instance, empty frontier; REQ-SEC-01 with an isolated empty git config; CLI exit 1 in `workflow-finalize.integration.test.ts` |
| 3 | met | non-approver → `user not authorized to approve type 'task'`; missing / blank / `Approver:`-leading reason → `UsageError` (CLI exit 2); `Approver: Morgan …` + `Reason:` with `%an <%ae>` = the `GIT_AUTHOR_*` identity, not `user.*` (`bug-149`) |
| 4 | met (characterization) | `memory history` of the task and of the plan does not list the finalize sha |
| 5 | met | `commit-empty.test.ts`: `--allow-empty`, `commit.cleanup=strip` keeps `#`, staged file untouched; finalize on a dirty index → `VALIDATION`, `assertPersistenceUnchanged` holds; dry-run row with `paths: []` |

Same-class fixes in touched files: `workflow next`'s third-party line and `docs/cli-reference.md`'s "not
available yet" (both replaced); the module description. Not done here (other tasks own them): see
"Candidate findings" in the report.

**Decision 9 (for the approver).** The `enumeration-parity` allowlist gains one entry (the batch notes say
an allowlist only loses entries): `spec-004` §4.1 must list `workflow.finalize` under §4.2's bijection, and
the production server registers no Tool before v0.4, so the finding is the documented `TOOLS_V04` class.
The alternative — leaving `workflow.finalize` out of §4.1 — breaks §4.2.

### review fixes (2026-10-11, independent review: approve with fixes)

- F1: `spec-008` §2's build-signature bullet now opens "ends with a trailer paragraph whose last line is
  `WingFoil-Version: …`" (it still said "a paragraph of its own holding one trailer line"); its Revision note and
  the proposed `--reason` below say so.
- F2: `stampedMessage`'s doc comment (`src/storage/commit.ts`) describes the final trailer paragraph and the
  `trailers` parameter (task-227's wording, naming both tasks). Comment only.
- F3: design decision 3 no longer claims a `spec-003` amendment.
- F4: the claim lint run with `--base`, its two hits reworded; the governance count corrected to 2.

### Pending amendments (approver)

Left uncommitted in the worktree; the coordinator runs `memory amend` at the review gate.
- `spec-004-mcp-surface-contract` — `--reason "task-226 ships workflow finalize, registered mutates: true, so section 4.1 gains the workflow.finalize Tool row that section 4.2's parity rule requires; the Tool is served from v0.4 with the others (P5.2.3). No URI, Resource or other Tool changes."`
- `spec-006-core-domain-api` — `--reason "task-226 registers workflowFinalize in CORE_MODULES, so section 3's row loses its planned marker. Its MCP Tool stays v0.4; no other row changes."`
- `spec-008-cli-grammar` — `--reason "task-226 ships workflow finalize: section 2's --dry-run list gains it with its empty plan, the build-signature bullet says every commit ends with a trailer paragraph whose last line is WingFoil-Version and that a commit's own trailers open that paragraph, because git reads trailers from the final paragraph only, and sections 11 and 12 gain the command and its --step option. No exit code changes."`
- `spec-017-workflow-commands-and-state-deduction` — `--reason "task-226 implements section 7.9 and records what it left open: the record's trailers go in the final paragraph with WingFoil-Version last, the empty commit uses git commit --only --allow-empty and is refused on a dirty index, and the no-instance, empty-frontier and authority-type answers. No rule of sections 4 or 5 changes."`

### Retrospective

- Four session restarts and a load-165 episode cut full-suite runs mid-way (`npmtest1.log`, `npmtest2.log`
  end without a summary); only the coverage run under dl-170's one-gate rule completed (6511 passed).
- `npx tsc -p tsconfig.build.json --noEmit` was started once while two other worktrees ran heavy gates
  (`pgrep` printed them in the same command): the check and the run were chained with `;`, not `&&`. Proposal:
  a kit helper that waits for the slot and then runs the gate.
- A spec conflict surfaced only by reading the git trailer reader: `spec-003` (record in the trailer block) vs
  `spec-008` (signature in a paragraph of its own). `task-227`'s `WingFoil-Instance` / `WingFoil-Step` on
  `memory add` meet the same rule.
