---
id: "task-149-defining-role-dna-makes-usable-once-duplicate-role"
type: task
title: "Defining a role in DNA makes it usable at once, and a duplicate role is refused with P5.4.1's message"
status: done
release: "v0.3"
kind: "feature"
priority: "medium"
tags: ["v0.3", "agent", "dna", "roles"]
ref: ""
bug: []
depends_on: []
tmpl_version: 260703
wave: "w1"
---

## Description

P5.4.1 is in `minor-v0.3` `features:` with no task yet. Sc. 1–2 are characterization: a role added with `dna add team.roles --value data-engineer` is accepted by `directive assign` and by `agent execute --role` (task-218). Sc. 3 expects `role already defined: reviewer`, but `dna add` answers a duplicate with the generic `'<path>' already exists: …` (`src/dna/mutate.ts:292`). No test pins P5.4.1 (`grep -rln "P5.4.1" test` → nothing).

## Acceptance Criteria

- (characterization) A new role is immediately valid for `directive assign <id> <role>` and for `assertRoleDefined` (P5.4.1 sc. 1–2).
- (red-first) A duplicate `team.roles` entry is refused, nothing is written, exit 1, with sc. 3's message. **Or**, if design finds that `spec-002` / `spec-008` declare the generic message for every collection, the task returns the conflict to the approver instead of choosing. The outcome goes into Execution Notes.

## Implementation Notes

- **Size:** S · **wave:** 1 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** P5.4.1 BDD sc. 1–3.
- **Features:** P5.4.1.
- **Notes:** Proposal key: B18.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

### design (architect)

- **depends_on:** none (`depends_on: []`), so no upstream Execution Notes to read (dl-015).
- **Specs cited are `approved`:** `grep -n "^status" docs/04_memory/design/specs/spec-00{2,6,8}-*.md` → all three `approved`.
- **The conflict check the AC asks for — no conflict.** Neither spec declares a generic duplicate message
  for every collection. `spec-002` declares name *uniqueness* (the `uniquelyNamed` refinement, Revision
  2026-09-23) but no refusal text; `spec-008` §9 says uniqueness is a schema constraint, and §6's
  *Pinned refusal strings* table pins only two `directive` reasons, "beside the ones the BDD features
  pin". `grep -n -i "unique\|carries an entry\|entry named\|role already" docs/04_memory/design/specs/spec-00{2,8}-*.md`
  → no refusal text; `grep -rn "already carries an entry named" docs test src` → only `src/dna/mutate.ts:247`.
  The generic text was code-only, so P5.4.1 sc. 3's text is implemented, not escalated.
- **Which code path sc. 3 hits.** The description cites `src/dna/mutate.ts:292` (`mutateEntry`,
  `'<path>' already exists`), but "define the role again" in `spec-008` §9's grammar is
  `dna add team.roles --value reviewer`, which reaches `mutateCollection` (`mutate.ts:247`,
  `'team.roles' already carries an entry named 'reviewer' — …`). That is the one changed.
  The entry-path spelling is a misuse of `add`, not a definition, and is left unchanged:
  `wingfoil dna add team.roles.reviewer` → exit `2`, `error: missing required argument: --value`
  (usage error raised before the mutation, `dnaMutationRequest` in `src/core/index.ts`);
  `wingfoil dna add team.roles.reviewer --value x` → exit `1`, the generic
  `error: 'team.roles.reviewer' already exists: …` (`mutateEntry`). Both reproduced with
  `node dist/cli.js` on a scratch repo (corrected at independent review). **Approver to confirm.**
- **"Usable at once", read against the HEAD baseline** (`command-baseline` 1.3, `spec-006` §6,
  `spec-008` §11). `directive assign` validates the role against `dna.yaml` at `HEAD`
  (`src/core/directive-assign.ts`, bug-082). `dna add` writes and commits its own change
  (`runDnaMutation`, `src/core/index.ts`: `writeDocument` then `commitPaths` → `wf(dna): add team.roles <role>`).
  So "at once" means **after the `dna add` commit, which the command itself makes** — no extra step.
  A role written into the working tree by hand is not usable until committed; that refusal is
  already pinned by `test/core/directive-assign-role-baseline.test.ts` (AC3/AC6) and is not duplicated.
- **Approval authority and context** (`src/core/approval-authority.ts`, `loadDnaYamlAtHead`): defining
  a role in `team.roles` grants authority to nobody. Authority is held by a `team.members` entry with the
  `approver` role at `HEAD`, so a new catalogue role changes no authority decision. That is consistent
  with P5.4.1. `agent execute --role` (task-218, `backlog`) does not ship yet; P5.4.2's role check is
  `assertRoleDefined` (`src/dna/roles.ts`), so AC1 pins that function, as the AC words it.
- **AC classification** (testing directive):

| AC | Classification | Why |
|----|----------------|-----|
| AC1 — new role valid for `directive assign` and `assertRoleDefined` (sc. 1–2) | characterization | `dna add` already commits and `directive assign` already reads `HEAD`; the test passes on first run |
| AC2 — duplicate refused, nothing written, exit 1, sc. 3's message | red-first | `dna add` answered with the generic collection message |

### red

- `test/core/agent-role-definition.test.ts` (new). It covers P5.4.1 sc. 1–3 against the registered `dna.dnaAdd`
  and `directive.directiveAssign` operations in temp repos, plus the mutation layer.
- `npx jest test/core/agent-role-definition.test.ts` → **2 failed, 2 passed, 4 total**. Sc. 1 and 2 passed
  (characterization). The two sc. 3 tests failed with `Received: "'team.roles' already carries an entry
  named 'reviewer' — entry names are unique (dl-081); use \`dna update\` to change it"`. Commit `4db9c814`.

### green

- `src/dna/mutate.ts`: `mutateCollection`'s duplicate-`add` refusal goes through
  `duplicateEntryMessage`. A `PINNED_DUPLICATE_MESSAGES` map, keyed by the collection's unquoted segments, gives
  `team.roles` → `role already defined: <name>`. Every other collection keeps dl-081's generic text,
  and a test pins `modules` to it. Keyed by segments so `team."roles"` (dl-083 quoting) gets the same text.
  That case is pinned too.
- `docs/cli-reference.md` `dna add`: Errors now name the duplicate refusal (generic + the role text). A
  line says a role added by `dna add` is usable by `directive assign` at once, and a hand edit only once committed.
- `npx jest test/core/agent-role-definition.test.ts test/dna test/core/dna-mutation-surface.test.ts` → 12 suites,
  267 tests passed. Commit `37672d4a`.

### refactor

- `npm test` → 201 suites, 3368 tests passed. Main per the dev-loop plan was 200 / 3363.
- `npm run test:coverage` → All files 98.86 / 95.39 / 95.19 / 99.56 (stmts/branch/funcs/lines). Main per the
  plan was 98.85 / 95.39 / 95.18 / 99.56, so nothing regressed. `src/dna/mutate.ts` is at 99.01 / 94.87 / 100 / 100. Its
  uncovered branches (108, 260, 316, 325, 405–424) predate this task.
- `npm run lint` → exit 0. `npm run docs:api` → exit 0. `npx tsc --noEmit -p tsconfig.json` → exit 0.
  `npx tsc -p tsconfig.build.json --noEmit` → exit 0.
- BDD: this repo has no Gherkin runner. Features are pinned by Jest tests that name their scenarios.
  The new suite names P5.4.1 sc. 1–3. `grep -rln "P5.4.1" test` → `test/core/agent-role-definition.test.ts`.
  The `.feature` file is unchanged, because the implementation matches it.

### review (reviewer)

- AC1 met: sc. 1 (`reviewer`) and sc. 2 (`data-engineer`) are each committed by `dna add`. The tests check
  `git log -1`, a clean `git status --porcelain`, and `git show HEAD:.wingfoil/dna.yaml`. Each role then
  passes `assertRoleDefined` and `directive assign`, which commits `wf(directive): assign testing to <role>`.
- AC2 met: the message is exactly `role already defined: reviewer`, `exitCodeForResult` gives 1, `HEAD` and
  `dna.yaml` bytes are unchanged, and only one `reviewer` entry exists.
- Same-class sweep in touched files: `mutateEntry`'s `already exists` (`mutate.ts`, reached only with
  `--value`, see design) is a different case, addressing an existing entry with `add`. It is left generic by the design decision above.
  `mutateStringList`'s `already contains` (`team.members.<m>.roles --value reviewer`) gives a member a role
  they hold. That is not defining a role, so it is also left unchanged.
- No pending amendments (approver): no approved spec, DL or other element was edited.

### review (independent)

- **Verdict: approve with fixes.** One false sentence in design: it said
  `dna add team.roles.reviewer` (no `--value`) gets the generic `already exists` text; it exits `2`
  with `missing required argument: --value`, and the generic text (exit `1`) needs `--value x`.
  Corrected above, with both commands.
- **Observation (not a defect of this task):** role uniqueness is case-sensitive. `entry.name === name`
  in `mutateCollection` and `uniquelyNamed` both compare exactly, so `Reviewer` beside `reviewer` is
  accepted as a new role.
