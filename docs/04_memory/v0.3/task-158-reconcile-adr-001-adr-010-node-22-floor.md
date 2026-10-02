---
id: "task-158-reconcile-adr-001-adr-010-node-22-floor"
type: task
title: "Reconcile adr-001 and adr-010 with the Node 22 floor"
status: in-progress
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
- (characterization) no status change; `grep -n "Node.js 18+\|still \`\^18\`"` hits only inside the correction notes.

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
