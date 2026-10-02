---
id: "task-162-fire-supersedes-trigger-superseding-element-approval"
type: task
title: "Fire the `supersedes:` trigger on the superseding element's approval"
status: in-progress
release: "v0.3"
kind: "feature"
priority: "medium"
tags: ["v0.3", "core", "memory", "state-machine"]
ref: "dl-065"
bug: []
depends_on: ["task-126-declare-closed-wf-operation-grammar-bracket-set-state"]
tmpl_version: 260703
---

## Description

`superseded` is a `waiting` state that nothing reaches (`grep -rn supersedes src/` → TSDoc only), and `a7d783aa` moved `adr-005` there by hand under a `deprecate` subject. Ratified: when an element whose `supersedes:` names another is approved into its accepted/approved state, the named element moves `accepted/approved → superseded`. `superseded → deprecated` stays legal.

## Acceptance Criteria

- (red-first) approving `adr-B` (`supersedes: adr-A`, `adr-A` `accepted`) moves `adr-A` to `superseded`; the commit(s) follow the grammar chosen in design (one `approve` plus one declared trigger commit, or one commit naming both — stated in `spec-010` and task-126's verb list).
- (red-first) a `supersedes:` naming a missing id, another type, or an element not in accepted/approved is refused before any write, exit 1.
- (characterization) `spec-010`'s "deprecate-adjacent … superseded" row and `spec-004`'s "approver-gated" wording are corrected (Q2, Q3); the task records how `adr-005` is expressed now (no history rewrite, `dl-035`).

## Implementation Notes

- **Size:** M · **wave:** 1 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-065 Q1.1, Q2, Q3; spec-001/spec-010 (trigger); spec-010 row reworded; spec-004 wording.
- **Features:** P1.7, P1.13.
- **Notes:** Proposal key: C27.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

Branch `task/task-162-fire-supersedes-trigger-superseding-element-approval`, worktree
`../.wf2-wt/task-162`, cut from `main` at `243f8f05`. Start `c64b6ee1`. `bug:` is empty, so no bug
syncs.

### design (architect)

**`depends_on`** (dl-015): `task-126` is `done`. Its Execution Notes give the closed `wf()` list
(`spec-008` §2, eleven verbs, `MEMORY_OPERATIONS` in `src/memory/audit.ts`), the rule "which verb a
`set_state` emits" (`approve` under `approval:`, else `finalize` into the last state of the type's
`sequence`, else `start`), and `verifyTransitionConsistency`, whose `isMachineEdge` already counts a
`waiting` state's forward edge (`accepted → superseded`) as an edge. Nothing it defers names this
task.

**Specs and decisions cited** (`awk '/^status:/{print $2;exit}'` on each): `spec-001`, `spec-003`,
`spec-004`, `spec-006`, `spec-008` and `spec-010` are `approved`; `dl-065`, `dl-061`, `dl-079` and
`dl-035` are `ready`. `dl-065`'s ruling is its approve `Reason:` (`b9cc84c4`): Q1.1, an engine
trigger fired on the superseding element's `approve` (its `pending → accepted/approved`); Q2, the
reworded `spec-010` row; Q3, `superseded → deprecated` stays legal and `spec-004` says
"state-transition verbs".

**D1 — two commits, not one.** The AC leaves the grammar to design: one `approve` plus a declared
trigger commit, or one commit naming both. One commit is ruled out by how history is read, not by
taste. `memory history` attributes a commit to a document by path (`reconstructMemoryTransitions`,
`src/memory/audit.ts`, walks `git log --follow` on the file), and the consistency check compares a
subject's bracket with that file's frontmatter before and after. A single
`wf(adr): approve adr-B [pending → accepted]` commit that also moved `adr-A` would show in `adr-A`'s
history as an `approve` with the approver's identity, declaring `pending → accepted` while the file
went `accepted → superseded`: a false approval record and a `mismatch` finding. The specs also give
each operation one commit scoped to its document (`spec-006` §7 step 5; `spec-010`'s audit paragraph,
"every `memory.submit`/`approve`/`reject`/`deprecate` is exactly one commit"). `dl-061` C reached the
same answer for its derived cross-element move: one approver commit plus one derived commit, emitted
together and cross-referenced. The coordinator asked whether a spec makes an approval and its side
effect inseparable. None does for an element inside Memory: the only "same commit" rule is about an
artefact *outside* Memory, and it lives only in agent guidance, not in a spec (`grep -rn -i
"separable\|same commit" docs/01_vision docs/02_requirements docs/04_memory/design` finds no such
rule). The pair is kept together another way: every refusal of both halves runs before the first
write (D3), and the second commit cites the first by sha.

**D2 — the trigger commit's verb is `finalize`.** No new verb. The trigger is an engine-driven
`set_state(superseded)` on the predecessor, and `superseded` is the last state of the `adr` and
`tech-spec` sequences (`.wingfoil/memory.yaml`). `spec-008` §2 already says a `set_state` into the
last state of the type's `sequence` emits `finalize`. `sync` was weighed and set aside: `spec-003`
defines it as recomputing a linked element's state from the aggregate of its derived elements, which
is not what happens here. The commit:

```
wf(adr): finalize adr-A [accepted → superseded]

Reason: superseded by adr-B (its supersedes: field), approved in <approve sha>.
```

It carries no `Approver:` line. The decision is recorded once, on the `approve` commit (`dl-061`
B.1's reasoning for a derived commit). The `Reason:` line is what `memory history` surfaces for the
entry (`parseCommitReason` reads `Reason:` independently of `Approver:`). The `finalize` row of
`spec-008` §2 gains this emitter. To confirm: the approver may prefer a dedicated verb, which would be
a change to both verb tables (`spec-008` §2, `spec-003`).

**D3 — the rule, and where it is decided.** On `memory approve <B>`, after the authority check:

- The trigger is read only when the approve's target `t` is a `waiting` state whose next `sequence`
  state is `superseded` (`SUPERSEDED_STATE`). That is `accepted` for `adr` and `approved` for
  `tech-spec`. It is computed from the committed machine, with no type name in code. On any other
  approve, `supersedes:` is not read: only those two types have the edge, and a type without the edge
  has nothing for the field to trigger (`spec-010`, "`supersedes` is the trigger of the `superseded`
  edge").
- The field is read from `B` **as `HEAD` records it** (task-247; `command-baseline` 1.4). `approve`
  already refuses a working-tree edit of `B`, so the two agree whenever a commit can follow.
- Empty or absent: no trigger, one commit (unchanged behaviour). A value that is not a string is
  refused.
- The named element `A` is located at the **same `HEAD` sha** that decided `B`'s transition, so
  the two decisions cannot come from two commits. It must exist (`NOT_FOUND`), be of `B`'s type
  (`VALIDATION`), and be in `t` (`INVALID_TRANSITION`, with `dl-032`'s
  `illegal transition <s> -> superseded for type '<type>'` as the cause). It must pass the same
  working-tree guards as any transition target: not deleted, not a dangling symlink, confined to the
  project, `id`/`type` unchanged, no uncommitted edit. All exit `1`. Every refusal is worded
  `cannot approve <B>: its supersedes: field names <A>, …`, and nothing is written.
- Only then are the two commits made. `B`'s `approve` first, then `A`'s `finalize`, whose `Reason:`
  cites the approve sha. The one failure left between them is git itself failing on the second
  commit. It is reported (exit `1`) with the approve sha and the hand-made command that completes
  the pair. The approve is not rolled back: rewriting a commit behind the user's back is worse
  (`verifyCommittedScope`'s own reasoning, `dl-035`).
- Authority: `A` is `B`'s type, so the approver authority already checked for `B` covers it.
  `superseded → deprecated` stays legal: the wildcard edge is legal from any state, and
  `test/core/memory-deprecate.test.ts` already pins it on an `adr` in `superseded` (Q3).

Code shape: `prepareMemoryTransition` is split so its body runs at a given sha
(`prepareMemoryTransitionAtRev`), and it exposes the sha and the committed frontmatter it decided
from. The trigger reuses that body with a `supersede` resolution in place of a verb, and
`commitMemoryTransition`'s pre-write checks become a separate exported step
(`checkMemoryTransition`), so both halves can be checked before either is written. `TransitionOp`
is not widened: `supersede` is not a verb, and widening it would give `contractTarget` and the CLI a
verb that does not exist.

**`adr-005` (AC3).** `a7d783aa` moved `adr-005` `accepted → superseded` by hand, under the subject
`wf(adr): deprecate adr-005-typescript-node-stack [accepted → superseded]`. History is not rewritten
(`dl-035`). It stays `superseded`. `memory history` reads that entry as `operation: deprecate`
with `from: accepted`, `to: superseded`. The bracket is a machine edge (the `waiting` forward edge),
so the consistency check reports no `illegal-hop` and no `mismatch`. `adr-010`, whose
`supersedes: "adr-005-typescript-node-stack"` names it, is `accepted`. Once this task ships, the same
move would be `wf(adr): finalize adr-005-typescript-node-stack [accepted → superseded]`, written by
`memory approve adr-010-…`. The hand-made commit is the one record of the trigger firing before the
trigger existed. Measured below (review).

**AC classification (T1).**

| AC | Class | Why |
|---|---|---|
| 1 — approving `adr-B` moves `adr-A` to `superseded`, in the declared grammar | **red-first** | nothing reads `supersedes:` (`grep -rn supersedes src/` → comments and `memory amend`'s reserved-field list only) |
| 2 — a `supersedes:` naming a missing id, another type, or an element not in `accepted`/`approved` is refused before any write, exit `1` | **red-first** | today the approve succeeds and ignores the field |
| 2b — an empty `supersedes:`, and a type with no `superseded` edge, approve as before (one commit) | characterization | the existing behaviour, pinned so the trigger cannot widen |
| 3 — `spec-010` row, `spec-004` wording, `adr-005` recorded | characterization (documentation) | — |

### red (developer)

`a82ff253`, `test/core/memory-supersede.test.ts` (new). The fixture uses the real `adr` and
`tech-spec` machines, plus a `task` type with no `superseded` edge. `npx jest
test/core/memory-supersede.test.ts` gave **14 failed, 4 passed (18)**. The 14 failures were AC1 ×3
(adr, history plus consistency, tech-spec) and AC2 ×11 (missing id, other type, `draft`, `pending`,
`superseded`, `deprecated`, itself, a list value, an uncommitted edit of `A`, `A` deleted in the
working tree, `A` held only by the working tree). Each failed because the approve succeeded with one
commit (`Expected: false, Received: true`; AC1: no `superseded` key in the result). The 4 that passed
are AC2b ×3 and the HEAD-baseline case, as classified.

### green (developer)

`b7267525`.
- `src/memory/state-machine.ts`: `supersedesEdgeFrom(machine, state)` and `resolveSupersedeTarget`.
  The second throws `dl-032`'s `illegal transition <s> -> superseded for type '<t>'`.
- `src/core/memory-transition.ts`: `prepareMemoryTransition`'s body is now
  `prepareMemoryTransitionAtRev(root, sha, memoryYaml, id, op, expectedType?)`, and the prepared
  transition carries `sha` and `committedFrontmatter`. `TransitionResolution` adds `supersede` and
  leaves `TransitionOp` unchanged. `checkMemoryTransition` is `commitMemoryTransition`'s pre-write
  half (checks 1 to 3).
- `src/core/memory-supersede.ts` (new): `prepareSupersede` and `supersedeReason`.
- `src/core/index.ts`: `memoryApproveFn` step 8, and `MemoryApproveResult.superseded`.
- `src/memory/commit-message.ts`: `op` accepts `finalize`.

The same commit added a test for a git failure between the two commits. A `pre-commit` hook refuses
`adr-1`. The approve stays, and the message gives its sha and the `finalize` message to commit by
hand. One test-helper fix went in with it: the refusal helper read `A` before the "deleted" case
removed it. `npx jest test/core/memory- test/memory` → 44 suites, 835 tests passed.

### refactor (developer)

`a62ae8d5`, `8840d38a`.
- `SUPERSEDED_STATE`'s TSDoc said the state is "reached along the forward `sequence` by `approve`",
  which `spec-001` forbids for a `waiting` state (`dl-065` Actions). It now names the trigger.
  `memoryDeprecateFn`'s TSDoc and `memory-amend.ts`'s reserved-field comment point at it too.
- The first full coverage run lowered statements from 98.86 to 98.85, because the trigger path had a
  second, unreachable `return committed`. One approve commit path now serves both cases.
- `resolveSupersedeTarget`'s `filePath` no longer has a default, since its one caller passes it.
- An uncommitted edit of the approved element `B` is refused as before when the trigger would fire
  (test added).
- BDD: `P1.7-memory-approve.feature` gains two scenarios, run by `test/core/memory-supersede.test.ts`
  (header). `docs/cli-reference.md`'s `memory approve` entry gains an "Unreleased (v0.3)" paragraph.

Gates, on `8840d38a` with the pending amendments below in the working tree:

| Command | Result |
|---|---|
| `npm run test:coverage` | exit 0; 209 suites / 3543 tests; 98.87 / 95.48 / 95.32 / 99.58 (`main` at `ea637c43`, as the dev-loop plan records it: 98.86 / 95.45 / 95.29 / 99.57; no regression) |
| `npm run -s lint` | exit 0 |
| `npm run -s docs:api` | exit 0, no warning |
| `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| `npx tsc -p tsconfig.build.json --noEmit` | exit 0 |
| `npx jest test/docs` | 21/21 (`cli-reference`, name resolvability over the amended specs) |

`src/core/memory-supersede.ts` is at 100/100/100/100. The branches left uncovered in
`memory-transition.ts` (259, 378) are the existing non-`ValidationError` rethrows.

### review (reviewer)

Evidence per AC:
- **AC1.** "AC1: approving adr-B …" asserts two commits, one document each, the exact `approve` and
  `finalize` messages, and that only `status` changed. "AC1: `memory history` …" asserts that
  `adr-A`'s last entry reads `finalize`, `accepted → superseded`, with `approver: null` and the
  `Reason:` citing the approve sha, and that `verifyTransitionConsistency` finds nothing on either
  document. The tech-spec case follows the same `approved → superseded` edge. The grammar is
  `spec-008` §2's `finalize` row plus the paragraph "The `supersedes:` trigger emits `finalize`", and
  `spec-010`'s "Retiring a replaced element". Both are pending amendments (below).
- **AC2.** The eleven refusal cases each assert exit `1`, an unchanged `HEAD` and both files
  byte-identical. The `INVALID_TRANSITION` cases carry `dl-032`'s message.
- **AC2b.** An empty or absent `supersedes:`, and a type without the edge, give one commit.
- **AC3.** The amendments to `spec-010` (Q2, Q3) and `spec-004` (Q3) are below. On `adr-005`:
  `npm run build && node dist/cli.js memory history adr-005-typescript-node-stack --format json` gives,
  for `a7d783aa`, `operation: deprecate`, `from: accepted`, `to: superseded`, `approver: null`.
  `verifyTransitionConsistency` on that file, with the committed `adr` machine, returns `[]`. The
  record stays as written (`dl-035`). Under this task the same move is
  `wf(adr): finalize adr-005-typescript-node-stack [accepted → superseded]`, written by
  `memory approve adr-010-node-22-runtime-floor`. `adr-010` is `accepted` already, so nothing will
  ever re-fire for that pair.

Same-class search: `grep -rn -i superseded src test docs/cli-reference.md docs/user-guide.md
docs/agents.md README.md .wingfoil/directives | grep -i -E "nothing|never reach|no
trigger|future|does not exist|unreach|by hand|not yet"` finds no stale claim in the files this task
owns. One remains outside them: `CLAUDE.md` §5.1's deprecate step 1 says the trigger "does not exist
yet". That file is owned by `align-agent-docs` (`dl-025`), so it is left for the coordinator.

Not changed, on purpose:
- `spec-003`, whose action-expression text already says `superseded` is reached by this trigger on
  the superseding element's `approve`.
- `.wingfoil/memory.yaml`, whose `waiting` comments already name the trigger (`task-153` edits its
  annotations).
- `spec-010`'s audit paragraph ("every … approve … is exactly one commit"). The `finalize` is its own
  operation, and the new paragraph says so.

### Pending amendments (approver)

All five are approved tech-specs, left uncommitted in the worktree for `memory amend`:

- `spec-001-memory-yaml-schema` — `--reason "task-162 (dl-065 Q1.1): the supersedes: trigger is stated after the deprecated-is-implicit paragraph: approving an element into the waiting state whose next state is superseded moves the element its committed supersedes: names, of the same type and in that state, to superseded in a commit of its own; Revision note dated 2026-10-02."`
- `spec-010-memory-frontmatter-schema` — `--reason "task-162 (dl-065 Q2, Q3, Q1.1): the memory.deprecate row says the verb writes deprecated on every type, never superseded; the memory.approve row and a new paragraph say the supersedes: trigger writes superseded in a finalize commit, and that superseded to deprecated stays legal; Revision note dated 2026-10-02."`
- `spec-008-cli-grammar` — `--reason "task-162 (dl-065 Q1.1): the finalize row names the supersedes: trigger as an emitter, and a paragraph gives the trigger's commit, with no Approver: line and a Reason: citing the approve sha; no verb is added; Revision note dated 2026-10-02."`
- `spec-004-mcp-surface-contract` — `--reason "task-162 (dl-065 Q3, Q1.1): section 4.3 says state-transition verbs where it said approver-gated, in the bracket sentence and the dl-054 note, and item 2 names the one approve that makes two commits; Revision note dated 2026-10-02."`
- `spec-006-core-domain-api` — `--reason "task-162 (dl-065 Q1.1): section 7 step 5 says where an approve's supersedes: trigger decides the superseded element (at step 3's commit, before any write) and that it gets a second commit; Revision note dated 2026-10-02."`

### Decisions for the approver to confirm

1. **D2**: the trigger commit's verb is `finalize`, read from the existing `set_state` rule. The
   alternatives are `sync`, or a new verb (a change to both verb tables).
2. **D1**: two commits rather than one. They are cross-referenced by sha, and every refusal runs
   before the first write.
3. **D3**: on a type without a `superseded` edge, a non-empty `supersedes:` is not read rather than
   refused. `supersedes:` holds one id, and a list is refused.
