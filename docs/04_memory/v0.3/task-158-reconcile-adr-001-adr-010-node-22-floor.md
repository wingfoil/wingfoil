---
id: "task-158-reconcile-adr-001-adr-010-node-22-floor"
type: task
title: "Reconcile adr-001 and adr-010 with the Node 22 floor"
status: approved
release: "v0.3"
kind: "fix"
priority: "low"
tags: ["v0.3", "process", "docs", "adr"]
ref: ""
bug: ["bug-054", "bug-069"]
depends_on: []
tmpl_version: 260703
---

## Description

adr-001 states "Node.js 18+ … per dna.yaml" in the present tense; adr-010's Consequences still say `@types/node` is pinned `^18`. Dated correction notes, not rewrites.

## Acceptance Criteria

- (characterization) `adr-001:32` gains a dated Correction note (dl-001 precedent) naming dna.yaml's 22.12+ and adr-010; `adr-010:195-196,236` gain a Revision note naming `^22.20.4` (`package.json:70`).
- (characterization) no status change; `grep -n "Node.js 18+"` on adr-001 and `grep -n "\^18"` on adr-010 hit only the sentences the notes correct (adr-001's stack parenthetical; adr-010's *Neutral* bullet `^18.19.130` and closing list) and the notes themselves. adr-010's other `Node.js 18+` hits are historical quotes and stay. *(AC amended at design, 2026-10-02: the original grep also hit those quotes and missed `^18.19.130`.)*
- (red-first, approver ruling 2026-10-02) `adr` is `amendable: true` in `.wingfoil/memory.yaml` (version 2.2, after task-153's 2.1) and in the `wingfoil init` scaffold, so the two notes are committed with `memory amend`. `spec-001` records the change in a dated Revision note.

## Implementation Notes

- **Size:** S · **wave:** 1 · **kind:** fix (`dl-133` Q1 (b)).
- **Implements:** .
- **Notes:** Proposal key: D30.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

### design (architect, 2026-10-02) — STOPPED: the ACs need an edit to two `accepted` ADRs, and no route the specs allow is open to this task

**What the ACs ask.** Both ACs require changing the text of two `accepted` ADRs: a dated Correction
note in `adr-001-git-backed-storage` (Decision, the stack parenthetical) and a Revision note in
`adr-010-node-22-runtime-floor` (Consequences *Neutral* bullet and the closing "not resolved" list).
Status of both read, not recalled: `grep -n "^status:" docs/04_memory/design/adrs/adr-001*.md
docs/04_memory/design/adrs/adr-010*.md` → `accepted` twice. The facts the notes would state hold:
`grep -n '"node":\|"@types/node"' package.json` → `"node": ">=22.12.0"`, `"@types/node": "^22.20.4"`;
`.wingfoil/dna.yaml` Node.js `version: "22.12+"`. The floor's definition is `spec-015` §1 as revised
by `task-155` (Revision 2026-10-02: the lowest version every production range admits; value
`>=22.12.0`, set by `commander@15`) — any note would cite that, not restate a rule.

**Why no route is open.** `.wingfoil/memory.yaml` declares the `adr` type `amendable: false`
("a change to the decision is a new ADR", `dl-108` A3; approver ruling at `task-127`), so
`memory amend` refuses it (`src/core/memory-amend.ts` → `type 'adr' is not amendable`). The
2026-09-29 hand Revision note on `adr-009` (`0fcc2e59`, `docs(self):`) predates the verb and the
key; it is no longer a precedent a task may follow. No other verb edits an `accepted` ADR, and a hand
commit is excluded by the batch brief. Adding a superseding ADR is an `adr-ingest` action this task
may not take. So the edit is not made, and the task stops after design for an approver ruling.

**Options for the approver** (none taken):
1. **Make `adr` amendable for corrective notes** — `memory.yaml` `adr: amendable: true`, version
   2.0 → 2.1, with a `spec-001` Revision note (its worked example marks `adr` `false`). `dl-108` A3's
   own text supports this: "facts that later evidence corrected, and dated revision notes" are
   amendments, and only "a change to the decision itself" needs a new ADR. Neither note here changes a
   decision. The coordinator then runs `memory amend` on both ADRs. Open sub-question: whether the
   `wingfoil init` scaffold (`src/storage/templates.ts` `MEMORY_AMENDABLE`, `adr: false`) follows.
   *Recommended*: smallest change, keeps the record, and the tool records the operation.
2. **A superseding ADR via `adr-ingest`** — disproportionate: `adr-001`'s decision (git storage) is
   unchanged, and `superseded` is a `waiting` state with no engine trigger, so the old ADR would stay
   `accepted` and still carry the false sentence with no pointer in the document.
3. **An approver-authorised hand `wf(adr): amend` commit** — contradicts the declared
   `amendable: false`; `memory history` would show an operation the tool refuses. Not recommended.
4. **Re-scope** — treat ADR bodies as dated snapshots (the alternative `bug-069` names under Expected
   Behavior), record that convention in a decision-log, and close the two bugs without editing the
   ADRs. This is the class question `bug-069` defers to v0.3 planning.

**AC defects found in design (to fix whichever option is taken).**
- AC2's grep cannot pass as written for `adr-010`: `grep -n "Node.js 18+\|still \`\^18\`"` on the two
  ADRs hits `adr-010` five more times (Context quote of adr-005's title; Actions items 2, 3, 5, 6,
  which quote the cascade's stale artefacts as history). Those are historical records, not
  present-tense claims, and should stay. The AC's grep should be scoped to `adr-001` for
  `Node.js 18+`.
- The same grep misses the first `adr-010` falsehood: the *Neutral* bullet reads "still pinned
  `^18.19.130`", which the pattern "still `^18`" does not match.
- Same class, same document: `adr-010` also says `bug-047` exists "because nothing yet says whether our
  floor must *equal* that maximum or merely satisfy it". `task-155` settled that (`spec-015` §1
  Revision 2026-10-02: equality and satisfaction both asserted). A Revision note on `adr-010` should
  name `task-155` too (fix same-class instances in touched files).

**Proposed note text, if option 1 is ruled** (not written into the ADRs):
- `adr-001`, below the Decision paragraph: "> **Correction (<date>) — the stack parenthetical reads
  Node.js 22.12+, not Node.js 18+.** `adr-010-node-22-runtime-floor` (`accepted`) moved the runtime
  floor to Node.js 22.12; `dna.yaml` says `22.12+` and `package.json` `engines.node` is `>=22.12.0`
  (`spec-015` §1). The decision of this ADR — git as the single store, no database — is unchanged.
  The sentence above is left as written."
- `adr-010`, after Consequences: "**Revision (<date>) — the Neutral bullet and the closing list are
  out of date.** `task-087` raised `@types/node` to `^22.20.4` (`bug-049` closed); `task-155` (`bug-047` closed)
  settled the equal-versus-satisfy question (`spec-015` §1). The decision is unchanged;
  the text above is left as the record of 2026-09-21."

**AC classification**: both remain characterization (documentation; no behaviour). No red phase.

### design, resumed — approver ruling (2026-10-02): option 1

The approver chose option 1. `adr` becomes `amendable: true` for dated correction and Revision notes,
here and in the `wingfoil init` scaffold; a changed decision is still a new ADR (`dl-108` A3).
`memory.yaml` goes to 2.2, after task-153's 2.1 (same batch; the coordinator resolves the version-line
conflict at merge). The two ADR notes and the `spec-001` Revision note are pending amendments, left
uncommitted for the coordinator's `memory amend`. AC2 is amended as found above, and AC3 records the
ruling (approver to confirm the AC text at review).

No code path hard-codes the refusal: `src/core/memory-amend.ts` `requireAmendableType` reads the
committed entry (`grep -rn "'adr'" src --include=*.ts` → only `MEMORY_TYPES` and an unrelated
`relevance.ts` link field). So the change is configuration plus the scaffold constant.

AC classification:

| AC | class | why |
|----|-------|-----|
| 1 — the two notes | characterization | documentation; pinned by the greps below |
| 2 — no status change, greps | characterization | documentation |
| 3 — `adr` amendable here and in the scaffold | red-first | the refusal existed; the tests fail on it |

AC1 cites `package.json:70` for `@types/node`; it is line 71 today
(`grep -n '"@types/node"' package.json` → `71`). The note cites no line offset (`dl-075`).

### red

`3873d3a7`. New `test/core/adr-amendable.test.ts`: this repository's `memory.yaml` declares `adr`
`amendable: true`, keeps task-127's values on every other type, and is version ≥ 2.2; with that file,
amending an `accepted` adr writes one `wf(adr): amend <id> [accepted → accepted]` commit.
`test/cli/fresh-init-transitions.test.ts`: on a fresh Scrum and Kanban project the adr amend now
succeeds instead of being refused. `test/core/memory-amend.test.ts`: its fixture mirrors this
repository's file, so `adr` there declares `true`, a new adr-amend case is added, and the
"declares amendable: false" refusal and the committed-not-working-tree case move to a `release` entry.
That file stays green throughout: the core reads its fixture's config, so it pins behaviour that
already exists.

`npx jest test/core/adr-amendable.test.ts test/core/memory-amend.test.ts test/cli/fresh-init-transitions.test.ts`
→ 5 failed, 52 passed. The failures were the two config assertions, the repo-config amend
(`type 'adr' is not amendable`), and the two fresh-init templates.

### green

`d6617861`. `.wingfoil/memory.yaml` 2.0 → 2.2, `adr: amendable: true`, with the ruling in the
comment. `src/storage/templates.ts` `MEMORY_AMENDABLE.adr = true`. The `doc-versioning` directive no
longer says an `adr` is not edited in place (same class; it declares no `version:`, so no bump).
`docs/cli-reference.md` `memory amend`: the scaffold's amendable list and the refusal example now use
`release`. Two test corrections were found on the first green run: the repo-config test's `sard_ref`
must be a string (a list on a required field not in `lists` is missing since task-168), and the
scaffold's `adr` runs the default machine, so its amend reads `[approved → approved]`.
Re-run: 2 suites, 24 tests passed.

### refactor (gates run WITH the pending amendments in the working tree)

- `npm run test:coverage` → exit 0, 209 suites / 3528 tests passed. All files: 98.86 % statements,
  95.45 % branches, 95.29 % functions, 99.57 % lines. The only `src/` change is one boolean literal,
  so coverage cannot regress. It includes `test/docs/name-resolvability.test.ts` (new backticked
  names in the ADRs and `spec-001`) and `test/docs/cli-reference.test.ts`.
- `npm run lint` → 0 · `npm run docs:api` → 0 · `npx tsc --noEmit -p tsconfig.json` → 0 ·
  `npx tsc -p tsconfig.build.json --noEmit` → 0.

### review (self, reviewer)

- AC1: `adr-001` carries the dated Correction block below the Decision paragraph, naming
  `dna.yaml`'s `22.12+`, `adr-010` and `spec-015` §1. `adr-010` carries a dated Revision note at the
  end of Process Notes naming `^22.20.4` (`task-087`), `task-155` and `spec-015` §1's Revision of
  2026-10-02. It also covers the other closed cascade leaves: `bug-046`/`bug-047` (task-155),
  `bug-048` (closed at v0.3 triage, `533760d8`). That is `bug-069`'s same-class point: all four
  leaves are now closed (`grep -H "^status:" docs/04_memory/bugs/bug-04[6-9]*.md` → closed ×4).
  *Corrected at review (2026-10-02):* that did not cover every stale sentence. Two more were in
  Consequences: the *Negative* "Six artefacts now disagree with the code" (the cascade merged at
  `7bb95d6e`; `grep -n "22.12" README.md CLAUDE.md docs/01_vision/01_product-brief.md` → all
  `22.12+`) and the second *Neutral* "remain `task-074`'s work" (`task-074` `done`). The Revision note
  now has a bullet covering both.
- AC2: `grep -n "Node.js 18+" adr-001` → `:32` (the corrected sentence), `:34`, `:37` (the note);
  `grep -n "\^18" adr-010` → `:195`, `:236` (the corrected sentences), `:269-271` (the note).
  `git diff -- docs/04_memory/design/adrs | grep "^[-+]status"` → nothing. Both ADRs are
  insertions only (24 lines).
- AC3: as red/green above.
- Agent docs: `CLAUDE.md` and `.wingfoil/README.md` say nothing about `adr` amendability
  (`grep -n -i "amendable" CLAUDE.md .wingfoil/README.md` → nothing). Candidate `align-agent-docs`
  finding: `CLAUDE.md` §5.1 lists five operations and never mentions `memory amend`.

### Pending amendments (approver)

Uncommitted in the worktree. Commit them with `memory amend` once `d6617861` (memory.yaml 2.2) is at
HEAD, since amend reads `amendable` from HEAD:

- `spec-001-memory-yaml-schema` — `--reason "adr becomes amendable for dated correction notes (approver ruling 2026-10-02, task-158): the amendable paragraph and the adr worked example follow memory.yaml 2.2, with a dated Revision note. A changed decision is still a new ADR, per dl-108 A3."`
- `adr-001-git-backed-storage` — `--reason "Dated Correction note: the stack parenthetical's Node.js 18+ reads Node.js 22.12+, per adr-010 and spec-015 section 1. The storage decision is unchanged (bug-054, task-158)."`
- `adr-010-node-22-runtime-floor` — superseded at review by the updated reason under "review fixes" below. Was: `--reason "Dated Revision note: the Consequences and the closing list describe bug-046 to bug-049 as open. All four are closed: @types/node is ^22.20.4 (task-087), and the floor definition and the equality guard came with task-155 (spec-015 section 1, Revision 2026-10-02). The decision is unchanged (bug-069, task-158)."`

### review fixes (2026-10-02, approve with fixes)

1. The `.wingfoil/memory.yaml` header comment (lines 7–11) still listed `adr` as `false`. It now lists
   `adr` as `true` since the 2026-10-02 ruling (`task-158`), keeping "a change to the decision is a
   new ADR (`dl-108` A3)". Committed (config).
2. The `adr-010` Revision note (pending amendment) gains the cascade/`task-074` bullet, and its lead
   says "every element and action". The `--reason` below is updated.

Re-run: `npx jest test/core/adr-amendable.test.ts test/core/memory-amend.test.ts test/cli/fresh-init-transitions.test.ts test/docs`
→ 8 suites, 78 tests passed; `npm run lint` → 0; `npx tsc --noEmit -p tsconfig.json` → 0.

Updated `--reason` for `adr-010-node-22-runtime-floor`: "Dated Revision note: the Consequences and the closing list describe bug-046 to bug-049, the cascade under Actions and task-074's share as open. All are closed or done: @types/node is ^22.20.4 (task-087), the floor definition and the equality guard came with task-155 (spec-015 section 1, Revision 2026-10-02), and the cascade merged at 7bb95d6e. The decision is unchanged (bug-069, task-158)."
