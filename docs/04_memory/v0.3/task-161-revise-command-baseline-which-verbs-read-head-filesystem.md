---
id: "task-161-revise-command-baseline-which-verbs-read-head-filesystem"
type: task
title: "Revise `command-baseline`: which verbs read HEAD, the filesystem-effect exception, the workflow-read exception, and its audience"
status: done
release: "v0.3"
kind: "feature"
priority: "high"
tags: ["v0.3", "core", "directives", "docs"]
ref: "dl-084"
bug: []
depends_on: ["task-128-allocate-element-ids-highest-number-ref-across-folder"]
tmpl_version: 260703
wave: "w1"
---

## Description

One directive revision for the `dl-080` family. `docs/cli-reference.md` says every command reads config "as committed at HEAD", false for `memory search` and the MCP Resources (`dl-084`); `command-baseline`/`claim-evidence` reach only agents bound by this repository's roles and must state their audience, with `spec-006` §6 normative (`dl-085`); five source sites cite `dl-086` as `in-discussion` while `command-baseline.md:39` says "There is no third category of read" (`dl-086`). R15 declares the workflow/agent read commands a HEAD-reading exception to `dl-084` (A) and `spec-006` §6 item 4.

## Acceptance Criteria

- (characterization) `command-baseline.md` states the filesystem-effect category (with the TOCTOU residual named as a limit and `bug-108` still owed to HEAD), the R15 exception, task-128's allocator baseline, and its audience; `claim-evidence.md` states its audience; both `version:` bumped.
- (characterization) `spec-006` §6 and `spec-008` list which verbs read HEAD and which the working tree; `docs/cli-reference.md` matches (its parity gate green).
- (red-first) a test enumerates the source sites citing `dl-086` and fails if one still says `in-discussion` (or the citations drop the status word).
- (characterization) `command-baseline.md` names `spec-006` §6 as the normative text (dl-085 (B)); (C) is not done.
- (characterization) `spec-006` §6 gains, as a dated Revision note, the sentence declaring the `HEAD`-read exception (R15) for `workflow status|list|show`, `agent list|show` and the two v0.3 workflow Resources — the one owner of that sentence (task-204 and task-240 depend on this task).

## Implementation Notes

- **Size:** S · **wave:** 1 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-084 (A)+(D delivered by task-095); dl-085 (A)+(B); dl-086 (adopt); R15 exception; spec-006 §6; spec-008; dl-085 (B) — `spec-006` §6 named normative; spec-006 §6 R15 sentence (single owner for task-204 and task-240).
- **Features:** P3.5.
- **Notes:** Proposal key: C35. Merged with the `dl-085`/`dl-086` half of task-191 and the R15-sentence ACs of task-204 and task-240. task-191 (claim-evidence falsifiability, determinism) follows on the same `claim-evidence.md`.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

Branch `task/task-161-revise-command-baseline-which-verbs-read-head-filesystem`, worktree
`../.wf2-wt/task-161`, started at `8e8943e7` (`wf(task): start … [backlog → in-progress]`). `bug: []`,
so no bug syncs.

### design (architect)

**`depends_on` read (dl-015).** `task-128` (`done`): its AC 5 already added *Declared baselines* to
`command-baseline` with the `memory add` counter as the first entry, and moved the directive to a
`**Version:** 1.1` body line because a `version:` frontmatter key makes `directives list` warn
`unknown field(s) ignored`. Nothing it deferred lands here; the counter entry is kept unchanged, so
this task's "allocator baseline" AC is a characterization of `task-128`'s text.

**Rulings read** (approve commits, `git log --grep=<dl> -- docs/04_memory/design/dls/`):
- `dl-084` `2985b0ee`: (A) + (D); (D) delivered by `task-095`; fix cli-reference and `spec-008`; E3
  (MCP Tool) to v0.4.
- `dl-085` `ae6f5a28`: (A) + (B); `spec-006` §6 normative, directive points to it; audience in both
  directives; (C) declined for `command-baseline`.
- `dl-086` `593d7fc3`: adopt as proposed; amend "no third category"; `bug-108` stays owed to `HEAD`;
  TOCTOU named as a limit, not a defence.
- R15 (`release-planning-rel-v0.3-plan` § rulings): `workflow status|next|list|show`, `agent
  list|show` and the two v0.3 workflow Resources read `HEAD`; `W_UNCOMMITTED_INPUTS` when the working
  tree differs.

**Specs.** `spec-006`, `spec-008`, `spec-016`, `spec-017` are `approved`
(`grep -h '^status:' docs/04_memory/design/specs/spec-0{06,08,16,17}-*.md` → four `approved`).
`spec-006` and `spec-008` are edited (pending amendments, below); tech-specs carry no `version:`
(`dl-047`), so each gets a dated Revision note.

**Versions (doc-versioning V1).** `command-baseline` declares `**Version:** 1.1` → bumped to `1.2`,
date `2026-10-01`, same body-line form. `claim-evidence` declares no version
(`grep -n -i version .wingfoil/directives/custom/claim-evidence.md` → nothing), so by V1 it is not
given one; the AC's "both `version:` bumped" is met for the one that declares a version only.

**The five sites.** The plan counted five TSDoc sites citing `dl-086` as `in-discussion`; at `8e8943e7`
`grep -rn "dl-086" src` shows the status word at two (`src/core/memory-transition.ts`,
`src/storage/memory-path.ts`); the other three (`src/core/confinement.ts`, `src/storage/confinement.ts`
twice, `src/core/write-guard.ts`) cite `dl-086` without a status. Per the plan's "Surprise 3" the fix
drops the status word rather than writing `ready`, which would go stale the same way.

**AC classification (T1).**

| AC | Class | Why |
|---|---|---|
| 1 — `command-baseline` filesystem-effect category, TOCTOU, `bug-108`, R15, allocator, audience; `claim-evidence` audience; version | characterization (directive) | no behaviour; the allocator part already holds |
| 2 — `spec-006` §6 and `spec-008` list HEAD vs working-tree verbs; cli-reference matches, parity gate green | characterization (docs) | the parity gate already passes; prose only |
| 3 — a test enumerates the `dl-086` sites and fails on `in-discussion` | **red-first** | two sites carry it at `8e8943e7` |
| 4 — `command-baseline` names `spec-006` §6 normative; (C) not done | characterization | prose |
| 5 — `spec-006` §6 R15 sentence as a dated Revision note | characterization | prose; pending amendment |

### red (developer)

`ca9af025`: `test/docs/dl-086-citations.test.ts` walks `src/` and `test/` (sorted), records every
`dl-086` occurrence with the rest of its sentence (wrapped TSDoc lines joined), and asserts (a) the
five guard files still cite it, so the check cannot pass by having nothing to check, and (b) no
citation's sentence says `in-discussion`.
`npx jest test/docs/dl-086-citations.test.ts` → **1 failed, 1 passed of 2**; the failure lists
`src/core/memory-transition.ts:291` and `src/storage/memory-path.ts:90`.

### green (developer)

`e942e8e9`: the two sites drop `(`in-discussion`)` and, in the same sentence, stop calling the read a
departure from `command-baseline` — it is now the directive's declared filesystem-effect read. Same
class in a file the citation search led to: `src/core/confinement.ts`'s *Baseline* paragraph said
"a departure from the `command-baseline` directive's read half … the decision-log filed from them";
it now names `dl-086` as ratified. Comment lines only:
`git diff 8e8943e7 HEAD -- src | grep -E "^[+-][^+-]" | grep -vE "^[+-]\s*\*"` → nothing.
`npx jest test/docs/dl-086-citations.test.ts` → 2 passed.

`f85c67a9` (directives):
- `command-baseline` 1.2: new *Who this reaches, and which text is normative* (`spec-006` §6
  normative, (B); audience, (A); (C) declined); *There is no third category of read* becomes *Two
  baselines for a gating read — and no third* (the `dl-086` category, what it does not license, the
  TOCTOU residual as a limit, `bug-108` still owed to `HEAD`); the `dl-084` bullet records (A)+(D)
  instead of "`in-discussion`"; new *Declared `HEAD` reads* table with the R15 row; *Declared
  baselines* (`task-128`) unchanged; Revision 1.2 note. Cited symbols exist:
  `grep -rln <symbol> src` for `requireConfinedTarget`, `resolveConfinedMemoryPath`,
  `requireInspectableTarget`, `lstatSync`, `realpathSync` → each found.
- `claim-evidence`: new *Who this reaches* ((A); (C) left open for this one, `dl-085` Action 3).
  "No spec states this rule": `grep -ln claim-evidence docs/04_memory/design/specs/*.md` →
  `spec-011`, `spec-012`, which only list the file.
- `node dist/cli.js directives list --role developer` loads both; its only warnings are the existing
  `unknown field(s) ignored: scope` on `claim-evidence`, `doc-versioning`, `security-secrets`
  (`task-144`'s scope).

`e4387dab` (`docs/cli-reference.md`, *Git side effects*): the false "A command reads WingFoil's
configuration … as committed at `HEAD`" becomes three bullets (writing commands read `HEAD`;
read-only commands and the MCP Resources read the working tree, with the `add`/`search` example of
`dl-084` E1; the write guards look at the disk) and names `directive remove` / `bug-108` as the
exception. `memory search --type` does not validate the type (`memorySearchFn` filters
`match.type === type`), so the example says "searches the documents that same working copy declares",
not "lists the type".

Baselines read from the code: `grep -n "AtHead\|loadMemoryYaml(\|loadDnaYaml(\|loadRolesYaml(\|loadDirectives(" src/core/*.ts src/mcp/*.ts`
— `memory-transition.ts`, `memory-add-type.ts`, `memory-amend.ts`, `approval-authority.ts`,
`directive-assign.ts` read at `HEAD`; `dnaShowFn`, `pathsFn`, `memorySearchFn`, `memoryHistoryFn`,
`directivesListFn`, `workflowList` (`wrapReadOnly(loadWorkflowsYaml)`), `src/mcp/*-resource.ts` and
`src/mcp/prompt.ts` read the working tree; `runDnaMutation` reads `loadDnaYaml` only after
`requireUnmodifiedTarget(root, DNA_YAML_PATH)`; `directiveCreateFn` checks `documentExists` on disk;
`directiveRemoveFn` resolves the name with `loadDirectives` (working tree, `bug-108`).

### Pending amendments (approver)

Edited in the worktree, **not committed** (Wave 1 rule: approved tech-specs go through `memory amend`):

- `spec-006-core-domain-api` — `--reason "Section 6 is named the normative text (dl-085 B), item 4 becomes the working-tree rule for reads that gate nothing (dl-084 A), item 5 adds the filesystem-effect read (dl-086, adopted) with bug-108 owed to HEAD and the TOCTOU residual named as a limit, item 6 is the single R15 sentence declaring the HEAD reads of workflow status, next, list, show, agent list, show and the two v0.3 workflow Resources, and a table lists which operation reads which baseline, per task-161."`
- `spec-008-cli-grammar` — `--reason "The new section 11 lists which baseline each command reads, per dl-084 (A, D) Action 2 and approver ruling R15, applying spec-006 section 6 per command, per task-161."`

### refactor (developer)

`8578e665`: the `dl-084` (D) sentence in `command-baseline` said the refusal names the *committed*
`memory.yaml`; the refusal actually reads `unknown memory type '<t>' (not defined in memory.yaml)` and
adds that the working tree's change is not committed only when the working tree defines the type
(`uncommittedType`, `src/core/memory-add-type.ts`). Directive and `spec-008` §11 now say that.

Gates, run with the two pending amendments in the working tree, on `8578e665`'s code:

| Command | Result |
|---|---|
| `npm run test:coverage` (`jest --coverage`, the suite `npm test` runs) | exit 0; 178 suites / 2972 tests passed; 98.82 / 95.06 / 94.44 / 99.52 |
| `npm run -s lint` | exit 0 |
| `npm run -s docs:api` | exit 0 |
| `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| `npx tsc -p tsconfig.build.json --noEmit` | exit 0 |
| `npx jest test/docs` (incl. `cli-reference.test.ts`, the parity gate) | 3 suites / 6 tests passed |

Coverage cannot regress: the `src/` diff since `8e8943e7` is comment lines only (command in *green*).
BDD: no `.feature` covers the directive text; `grep -rln "command-baseline" docs/02_requirements/02_bdd/features`
→ nothing, so none was changed.

### review (reviewer)

- AC 1: `command-baseline` 1.2 — *Two baselines for a gating read — and no third* (filesystem-effect,
  TOCTOU as a limit, `bug-108` owed to `HEAD`), *Declared `HEAD` reads* (R15), *Declared baselines*
  (`task-128`), *Who this reaches…* (audience); `claim-evidence` *Who this reaches*. Version: only
  `command-baseline` declares one (design).
- AC 2: `spec-006` §6 table and `spec-008` §11 (pending amendments); `docs/cli-reference.md` *Git side
  effects* matches both; `cli-reference.test.ts` green.
- AC 3: `test/docs/dl-086-citations.test.ts`, red at `ca9af025`, green at `e942e8e9`.
- AC 4: `command-baseline` *Who this reaches, and which text is normative* names `spec-006` §6 as
  normative; (C) declined, nothing moved to `directives/built-in/`
  (`git diff 8e8943e7 HEAD --stat -- .wingfoil/directives/built-in` → nothing).
- AC 5: `spec-006` §6 item 6 plus its 2026-10-01 Revision note (pending amendment).

For the approver:
- **`workflow next` is in the R15 sentence** although AC 5 lists `workflow status|list|show`: R15 and
  `spec-006`'s 2026-09-30 note both name `workflowNext`, and its Resource is one of the two.
- `spec-006`'s 2026-09-30 note said §6 is "not edited before" the implementing task; build-backlog
  made this task the single owner instead, which the new Revision note records.
- `claim-evidence` has no version, so none was added (V1); the AC's "both bumped" is read that way.
- The three `dl-086` sites without a status word were left as they are; the test forbids
  `in-discussion` only, so a later `(`ready`)` would pass — dropping the word is the convention, not
  a gate.

### review (independent)

Verdict: approve with fixes (text only). Applied in `cda1e5df` (directive, cli-reference) and in the
pending amendments:

1. **The tables said the transition verbs read `HEAD`; the code decides on the working tree.**
   `prepareMemoryTransition` finds the document with `findMemoryDocumentById` (a working-tree scan),
   and `memory submit` takes the current `status` from the working-tree frontmatter
   (`grep -n "prepareMemoryTransition(root, id" src/core/index.ts` → submit, approve, reject,
   deprecate, amend). The reviewer reproduced it (HEAD `pending` + working tree `draft` → a second
   submit at exit 0). My design read `memory-transition.ts`'s `loadMemoryYamlAtHead` and took it for
   the whole verb; that was the claim-evidence slip. Now a "working tree, deviating" row in `spec-006`
   §6 and `spec-008` §11, a paragraph in `command-baseline` ("Where the shipped code still
   deviates"), and the cli-reference names both defects. The code defect is filed by the coordinator;
   no code changed here.
2. **`workflow next` gates** (`spec-017` §1.1): moved to the item-1 `HEAD` row and named in item 6 for
   completeness only; "none of these reads can refuse an operation" → "none decides from the working
   tree"; `spec-008` "never read" → "never decides the answer".
3. The source for the shipped workflow Resources keeping the working tree is `spec-017` §9, not
   `spec-006` §3.
4. `command-baseline.md:94` / `:75` offsets in `spec-016` (§5.1, Q9) and `spec-017` (§1.1, §1.2,
   OQ-10) replaced by section/bullet names, each spec with a dated Revision note (pending amendments).
   `grep -rn "command-baseline.md:[0-9]" docs/04_memory/design/specs/` → only `spec-006`'s
   2026-09-30 historical note, left as instructed. The offsets had already drifted with 1.1:
   `git show 8e8943e7:.wingfoil/directives/custom/command-baseline.md | sed -n '75p;94p'` shows
   neither quoted text.
5. `directive remove`'s referrer check (`roles.yaml` at `HEAD`) listed under `HEAD` reads; the
   lowercase "when" after a full stop in `spec-008` §11 fixed.

Re-run after the fixes: `npx jest test/docs` → 3 suites / 6 tests passed; `npm run -s lint`,
`npx tsc --noEmit -p tsconfig.json`, `npx tsc -p tsconfig.build.json --noEmit` → exit 0.

Pending amendments now: `spec-006`, `spec-008`, `spec-016`, `spec-017` (reasons in the report to
the coordinator; `spec-006`/`spec-008` as listed above, extended by points 1, 2 and 5).
