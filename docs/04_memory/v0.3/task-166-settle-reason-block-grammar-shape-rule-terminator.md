---
id: "task-166-settle-reason-block-grammar-shape-rule-terminator"
type: task
title: "Settle the `Reason:` block's grammar: shape-rule terminator, C0 refusal and the reserved `WingFoil-Version` key"
status: done
release: "v0.3"
kind: "feature"
priority: "high"
tags: ["v0.3", "core", "memory", "grammar", "security"]
ref: "dl-070"
bug: []
depends_on: ["task-126-declare-closed-wf-operation-grammar-bracket-set-state", "task-127-add-memory-amend-id-reason-approver-gated-verb"]
tmpl_version: 260703
wave: "w1"
---

## Description

Three ratified changes to `src/memory/commit-message.ts` and `spec-008` §2's `--reason` row, done in one pass as Appendix B proposed: keep the shape rule for the trailer paragraph and write it into `spec-008` (dl-070 S3) with a remedy in the refusal (S4); refuse C0 control characters other than `\t`/`\n` at exit 2 naming the character (dl-078; 0 of 1471 `wf(` bodies contain one); extend `RESERVED_TRAILER_LINE_RE` (`commit-message.ts:47`) to `WingFoil-Version` (dl-111 Q1).

## Acceptance Criteria

- (red-first) `--reason` containing `\x07` or `\x1b` exits 2 on every verb that takes it, `deprecate` included, and names the character by code point; `\t` and `\n` are accepted.
- (red-first) a reason line beginning `WingFoil-Version:` is refused at exit 2 like `Approver:`.
- (red-first) the trailing-`Key: value`-paragraph refusal message states the remedy (add a closing sentence) (S4).
- (characterization) existing multi-line reasons and the normalization contract are unchanged.
- (characterization) `spec-008` §2 states the terminator rule and the reserved keys; `dl-067` carries a dated amendment for clause 4, made with `memory amend` (task-127).

## Implementation Notes

- **Size:** S · **wave:** 1 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-070 (A)+S3+S4; dl-078 (A); dl-111 Q1 (A); dl-067 clause 4 revision; spec-008 §2.
- **Features:** P1.7, P1.9.
- **Notes:** Proposal key: C05.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

Branch `task/task-166-settle-reason-block-grammar-shape-rule-terminator`, worktree `../.wf2-wt/task-166`,
cut from `main` at `c43221c4`. Start `c8a14d2b`. `bug: []`, so there are no bug syncs.

### design (architect)

**`depends_on`** (dl-015). `task-126`: §2 of `spec-008` now carries the closed `wf()` verb subsection,
and its edits stay inside §2 plus a Revision note; this task does the same. `task-127`: `memory amend`
takes a required `--reason` through `requireReason`, and `test/core/reason-trailer-verbs.test.ts`
already lists it in the refusal rows, so every sweep here has four verbs (`approve`, `reject`,
`deprecate`, `amend`). `dl-067` (decision-log) and `spec-008` (tech-spec) are both `amendable: true`
in `.wingfoil/memory.yaml` (`grep -n amendable .wingfoil/memory.yaml`), so both edits are pending
amendments, below.

**Decisions and specs cited** (`awk '/^status:/{print $2;exit}'` on each): `dl-067`, `dl-070`, `dl-078`,
`dl-111` `ready`; `spec-008` `approved`. The rulings, from the approve commits' `Reason:`
(`git log --grep='approve dl-0\(70\|78\)\|approve dl-111'`): `dl-070` (A), keep the shape rule, with S3
(write it into `spec-008` §2) and S4 (remedy in the refusal); `dl-078` (A), refuse C0 except tab and
newline at exit 2, naming the character; `dl-111` Q1 (A), extend the reserved-key regex.

**Design decisions** (to confirm at review):
1. **New defect class `control-character`**, judged in the order blank, control character, reserved
   line, trailing paragraph, on the NORMALIZED text like every other rule. Consequence: a carriage
   return is accepted, because `normalizeReason` already turns CRLF and a lone CR into LF, so no CR
   ever reaches the commit. The set is exactly C0 (`U+0000`-`U+001F`) minus `U+0009` and `U+000A`, so
   form feed and vertical tab are refused. DEL (`U+007F`), the C1 controls (e.g. CSI `U+009B`, NEL
   `U+0085`) and LS (`U+2028`) are outside `dl-078` (A)'s C0 scope and are still accepted; the
   coordinator files that as a follow-up.
2. **The message names the FIRST offending character**, as `(found U+001B)` after the class message,
   so it is a function of the input alone (REQ-SYS-07). Because the class message is static and the
   full one is not, a new export `reasonRefusalMessage(reason)` returns the exact text, and both
   `requireReason`/`optionalReason` and `formatMemoryCommitMessage` use it. `reasonDefect` and
   `reasonDefectMessage` keep their signatures.
3. **Scan instead of a regex** for the control characters: the `no-control-regex` lint rule refuses a
   character class over `\x00-\x1f` (`npx eslint src/memory/commit-message.ts` reported it on the
   first version).
4. **The reserved keys are matched case-insensitively** — all three, since the independent review
   (below). The first pass kept the existing case-sensitive regex; git reads trailer keys
   case-insensitively, and `dl-111` names git's trailer reader.
5. **Remedy text** (S4): `…; add a closing sentence after it, or fold those lines into prose` — the
   wording CLAUDE.md §5.1 already gives the author.
6. **Deliberate change to a pinned test.** `test/memory/git-log-framing.test.ts` pinned that `0x1e`/
   `0x1f` stayed legal content "so a future widening is a deliberate, visible change". This is that
   change: the case now expects `control-character` and says why.

**Measurement before refusing** (`dl-078` action 2), on `main` at `c43221c4` with this branch's build
(`npm run build`, then a script over `git log main --format='%H%x00%B%x00%x01'` calling
`parseCommitReason` and `reasonDefect` from `dist/`): 1841 `wf(` commit bodies, **0** carry a C0
character other than tab/newline; the 581 `approve`/`reject`/`deprecate`/`amend` commits carry 580
reasons (one `deprecate` has none), and **0** are refused by the amended rules (re-run after the
review's case-insensitive change: still 0). `git log main --format=%B | grep -c '^WingFoil-Version:'` → 0.

**AC classification (T1).**

| AC | Class | Why |
|---|---|---|
| 1 — `\x07`/`\x1b` refused at exit 2 on every verb, named by code point; `\t`/`\n` accepted | **red-first** for the refusal; the tab/newline half is characterization | `reasonDefect` refused no control character (the `git-log-framing` pin above); tab and newline were already legal |
| 2 — `WingFoil-Version:` line refused like `Approver:` | **red-first** | `RESERVED_TRAILER_LINE_RE` was `Approver\|Reason` |
| 3 — trailing-paragraph refusal states the remedy | **red-first** | the message had no remedy |
| 4 — multi-line reasons and the normal form unchanged | characterization | the existing `reason-trailer` / `reason-trailer-verbs` cases, untouched and green; corpus measurement above |
| 5 — `spec-008` §2 states the terminator and reserved keys; `dl-067` dated amendment | characterization (documentation) | pending amendments, below |

### red (developer)

`6aa02283`: `test/memory/reason-trailer.test.ts` (new describe "dl-067 clause 4 as amended by
task-166"), `test/core/reason-trailer-verbs.test.ts` (three `it.each` over the four verbs: `\x07` and
`\x1b`, `WingFoil-Version:`, remedy), and the `git-log-framing` pin flipped.
`npx jest test/memory/reason-trailer.test.ts test/memory/git-log-framing.test.ts test/core/reason-trailer-verbs.test.ts`
→ **3 suites failed, 28 tests failed, 68 passed**. The 28 are exactly the new refusal and message
cases; the tab/newline, carriage-return and `WingFoil-Version`-as-prose cases passed, as classified.

### green (developer)

`4fbd78cb`:
- `src/memory/commit-message.ts`: `control-character` defect, `firstControlCharacter`,
  `RESERVED_TRAILER_LINE_RE` gains `WingFoil-Version`, the two changed messages,
  `reasonRefusalMessage`; the formatter throws its text.
- `src/core/require-reason.ts`: uses `reasonRefusalMessage`. `src/memory/index.ts` exports it.
- A round-trip case through a real `git commit` for a reason with interior tabs.

`8d11a160`: `test/cli/reason-control-chars.integration.test.ts` (task-086's end-to-end suite) drove
`memory approve` with a `0x1e`/`0x1f` reason through `dist/cli.js` and read the history back. The verb
now refuses that reason, so the suite failed (3 tests, in the first full run). It now asserts the
refusal through the real CLI (exit `2`, `found U+001E` on stderr, `HEAD` unmoved) and writes the
approval commit by hand, the shape older history still has; the three read-side cases are unchanged
and pass (`npx jest test/cli/reason-control-chars.integration.test.ts` → 4 passed).

`f8cc1cc6`: `docs/cli-reference.md` ("Rules for `--reason`", marked Unreleased (v0.3)),
`docs/user-guide.md` and `docs/agents.md` state the reserved key and the C0 rule.

### refactor (developer)

No code restructuring was needed beyond the regex-to-scan change (design 3). Gates, on `8d11a160` plus
the two uncommitted amendments:

| Command | Result |
|---|---|
| `npm run test:coverage` | exit 0; 166 suites / 2791 tests; 98.73 / 94.61 / 94.03 / 99.49 (stmts / branches / funcs / lines). `task-127`'s final tree, merged as `main`'s code: 98.73 / 94.61 / 94 / 99.49, so no regression. `commit-message.ts` and `require-reason.ts` 100/100/100/100 |
| `npm run -s lint` | exit 0 |
| `npm run -s docs:api` | exit 0 |
| `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| `npx tsc -p tsconfig.build.json --noEmit` | exit 0 |
| `npx jest test/docs` | 4 passed |

Run note: a first run as `npm run -s test:coverage` failed 5 tests in 3 suites: the 3 in
`reason-control-chars` (fixed above), `test/cli/publish-secrets.test.ts` (the `-s` loglevel issue
`task-127` recorded) and `test/mcp/resource-latency.test.ts` (REQ-PERF-04, under parallel load).
Re-run alone, `npx jest test/mcp/resource-latency.test.ts test/cli/publish-secrets.test.ts` → 28
passed; the full run without `-s` is the one in the table.

BDD: no `.feature` file states a reason refusal (`grep -rn -i "invalid flag value\|Key: value"
docs/02_requirements/02_bdd/features/` → nothing) and no AC asks for a scenario, so none was added. The
P1.7/P1.8/P1.9 suites are green in the full run.

### Pending amendments (approver)

Edited in this worktree and left uncommitted, for `memory amend` at the review gate:

- `spec-008-cli-grammar` — proposed `--reason`: "Section 2's --reason grammar, per dl-070 (A) with S3
  and S4, dl-078 (A) and dl-111 Q1 (A), carried out by task-166: the unrecordable-value row gains the
  control-character case named by code point, lists WingFoil-Version among the reserved trailer keys,
  matched in any letter case, and gives the trailing-paragraph refusal its remedy; a new note states
  the terminator rule as a shape rule modelled on git's, and where it differs from git's. The
  Revision note dated 2026-10-01 records it."
- `dl-067-reason-trailer-contract` — proposed `--reason`: "Clause 4 amended as dl-070 (A) with S4,
  dl-078 (A) and dl-111 Q1 (A) ratified, carried out by task-166: a dated Amendments section restates
  the clause with the control-character refusal, the reserved WingFoil-Version key with all reserved
  keys matched in any letter case, and the shape-rule terminator modelled on git's with its remedy,
  and records the corpus measurement."

### review (reviewer)

Evidence per AC:
- AC1: `reason-trailer-verbs.test.ts` "a reason carrying %j is refused at exit 2, naming %s" (8 rows:
  four verbs × `\x07`, `\x1b`); `reason-trailer.test.ts` seven code points, first-offender, tab/newline
  and CR cases, plus the tab round trip; end to end through `dist/cli.js` in
  `reason-control-chars.integration.test.ts`.
- AC2: `reason-trailer-verbs.test.ts` "`WingFoil-Version:` line is refused at exit 2" (four verbs);
  `reason-trailer.test.ts` reserved-key case and the prose-not-at-column-0 case.
- AC3: `reason-trailer-verbs.test.ts` "states the remedy" (four verbs); unit message case.
- AC4: the existing normal-form, block and corpus cases unchanged and green; 0 of the 580 reasons in
  `main`'s 581 governance commits refused (one `deprecate` has no reason).
- AC5: `spec-008` §2 row and the terminator note, `dl-067` Amendments (2026-10-01), pending above.

Same class in touched files: every place that states the reason rules was checked
(`grep -rn "Approver:. or .Reason:" src docs/*.md README.md .wingfoil`) and the three user documents
updated. CLAUDE.md §5.1 states them too and is not edited here (it belongs to `user-docs`'
`align-agent-docs` phase, `dl-025`); reported to the coordinator.

### review (independent)

Verdict: approve with fixes. Each fix, and what changed:

1. **"The heuristic git itself uses" was false.** git also takes a mixed final paragraph for trailers
   when at least 25% of its lines are trailers and one key is git-generated or configured (the
   reviewer read a forged `wingfoil-version: 9.9.9` through `%(trailers:key=WingFoil-Version)` beside a
   `Signed-off-by:` line). The pending `spec-008` §2 note and the `dl-067` amendment now say "a shape
   rule modelled on git's", state the difference, and give it as the reason the reserved keys are
   refused on every line.
2. **Reserved keys were case-sensitive.** Red `fd902f53`: `npx jest test/memory/reason-trailer.test.ts
   test/core/reason-trailer-verbs.test.ts` → **5 failed, 78 passed** (`wingfoil-version: 1 (x)`,
   `approver: …`, `REASON:` on the unit, four verb rows). Green `aa29439e`: `/i` on
   `RESERVED_TRAILER_LINE_RE`. No history reading changes: `git log main --format=%B | grep -ciE
   '^(approver|reason|wingfoil-version):'` and the case-sensitive `grep -cE` both give 1183, and the
   reader regexes are untouched. Stated in both pending texts and in `docs/cli-reference.md`
   (`ab79a603`).
3. **Dangling "candidate finding below".** Design decision 1 now says what stays accepted and that the
   coordinator files it.
4. **`src/core/index.ts`** (`memoryDeprecateFn`'s order list and its inline comment) described the
   refusal as "blank or trailer-shaped". Both now name the control-character case (`aa29439e`).
   `grep -rn -i "trailer-shaped" src` finds no other description of the rule.
5. **581 vs 580.** The `dl-067` amendment and these notes now say 581 commits carry 580 reasons.

Gates after the fixes, with the two pending amendments in the working tree:

| Command | Result |
|---|---|
| `npm run test:coverage` | exit 0; 166 suites / 2796 tests; 98.73 / 94.61 / 94.03 / 99.49; `commit-message.ts` 100 |
| `npm run -s lint` | exit 0 |
| `npm run -s docs:api` | exit 0 |
| `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| `npx tsc -p tsconfig.build.json --noEmit` | exit 0 |
