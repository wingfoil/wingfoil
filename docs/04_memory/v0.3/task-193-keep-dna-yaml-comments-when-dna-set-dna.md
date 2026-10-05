---
id: "task-193-keep-dna-yaml-comments-when-dna-set-dna"
type: task
title: "Keep `dna.yaml`'s comments when `dna set`/`dna add` cannot edit in place, or say they were lost"
status: in-review
release: "v0.3"
kind: "fix"
priority: "medium"
tags: ["v0.3", "core", "dna"]
ref: "spec-002"
bug: ["bug-019", "bug-126"]
depends_on: ["task-169-make-directive-assign-refuse-whole-file-rewrite-unless"]
tmpl_version: 260703
---

## Description

The whole-file `dump()` fallback (`src/core/index.ts:386`) strips every comment and `[SPEC]`/`[AUTHORING]` provenance marker with no warning, for block scalars in `dna set` (`bug-019`) and for `dna add` into a collection the file does not declare yet (`insertMissingScalarPath` handles only `set-scalar`, `src/dna/edit.ts:433`; `bug-126`). v0.3's adapters need `team.agents` declared, which is exactly that path.

## Acceptance Criteria

- (red-first) `dna add team.agents …` on a `dna.yaml` with no `agents:` keeps every comment.
- (red-first) any remaining fallback prints a warning naming the file and that comments were not preserved (exit 0), on stderr and in the `--format json` warnings, through task-169's success-warning channel — or, if the approver rules for consistency with `dl-062` (backlog question Q10), is refused unless `--force`; the choice is recorded in Execution Notes and in the `dna set`/`dna add` cli-reference entries.
- (characterization) in-place edits are byte-identical outside the edited node.

## Implementation Notes

- **Size:** M · **wave:** 2 · **kind:** fix (`dl-133` Q1 (b)).
- **Implements:** spec-002; dl-081; dl-062 (same class of fallback, for `dna.yaml`).
- **Features:** P2.1.
- **Planning ruling:** Approver ruling 2026-09-30 (plan R20, Q9): same rule as `dl-062` — the whole-file rewrite is refused unless `--force`, and a forced rewrite prints a warning that comments were lost.
- **Notes:** Proposal key: C14.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

Branch `task/task-193-keep-dna-yaml-comments-when-dna-set-dna`, worktree `../.wf2-wt/task-193`, cut
from `main` at `0cf8b131`. Start `fbf3da58`; bug syncs `03362acf` (`bug-019`) and `35fbb572`
(`bug-126`), both `planned → in-progress`.

### design (architect)

**`depends_on`** (dl-015): `task-169`'s Execution Notes read. Taken from them: the success-warning
channel (`coreOk(value, commit, warnings)`, rendered by `src/cli/warning.ts`, so no CLI change here);
the `dl-062` contract shape (refuse `CONFLICT` unless `--force`; `--force` authorizes and does not
force; a rewrite on a file with no comments is refused too); the warning wording rule of its
independent review (comments "are not kept", not "were dropped"; key order not named, because the
`dump` keeps it); and its review finding 2, that `wingfoil mcp` registers no Tools before v0.4, so
`force` as a Tool input is a v0.4 concern (`spec-004` §4.3 item 5 already says "a flag such as …").

**Specs and decisions cited** (`awk '/^status:/{print $2;exit}'` on each): `spec-002`, `spec-008`
`approved`; `dl-081`, `dl-062` `ready`. The binding ruling is the plan's R20/Q9
(`release-planning-rel-v0.3-plan` line 110: "`dna.yaml` refuses the whole-file rewrite unless
`--force` (as `dl-062`)"), copied into this task's Implementation Notes. So AC2's first branch (warn
at exit 0 without a flag) is superseded by its second (refuse unless `--force`).

**Design decisions** (to confirm at review):
1. **Fix the editor first, refuse what is left.** The two bugs' reachable fallbacks are made in place in
   `src/dna/edit.ts`, so the refusal is not what a user meets on an ordinary write:
   - an absent key, with any absent parents (`insertMissingPath`): `append-items` opens the sequence
     (`  agents:` + items, `bug-126`) and `set-scalar` inserts the key line. An empty flow mapping `{}`
     is opened into a block (`paths: {}` → `paths:`). It declines on a missing index step, and on a
     parent holding any other inline value (a non-empty flow mapping, a plain scalar).
   - a block scalar (`>-`, `|`) is rewritten as one line and its continuation lines dropped
     (`bug-019`'s `project.north_star` / `project.description`), the inline comment kept at its column.
   - CRLF: a file whose every break is CRLF is edited in its LF form and written back CRLF (`bug-019`
     Notes). A mixed file is edited as before, where its LF lines allow.
   - a leading `---` already worked: characterization test, no code.
2. **The refusal** (`dnaRewriteConflict(field)`, `CONFLICT`, exit 1): `dna.yaml cannot be updated in
   place; edit <path> by hand, or pass --force to rewrite the whole file`, the `roles.yaml` wording with
   the path. It is raised **after** the schema re-validation, so a write the schema refuses stays
   `VALIDATION` (that `--force` cannot fix). Every comment-free file is refused too, like `roles.yaml`.
3. **The warning** (`DNA_REWRITE_WARNING`): task-169's text with `dna.yaml` for `roles.yaml`, since both
   go through the same `js-yaml` `dump` (`version: 1.0` → `1` holds for `dna.yaml` too).
4. **`--force` on all four write verbs** (`dna set|add|update|remove`), as one `DNA_FORCE_FLAG`. The AC
   names `set`/`add` only; `update`/`remove` reach the same `runDnaMutation` and could hit the same
   refusal, so leaving them without the flag would make that refusal's own advice ("pass --force")
   false for them.
5. **The dead fallback** `insertMissingScalarPath` (which called `setDnaValueInText`) was removed in
   refactor: the first coverage run showed its string branch never taken (`edit.ts` line 537), because
   `insertMissingPath` now handles every all-key absent path first.

**AC classification (T1).**

| AC | Class | Why |
|---|---|---|
| 1 — `dna add team.agents` with no `agents:` keeps every comment | **red-first** | reproduced on `0cf8b131`: scaffold `grep -c '#'` 18 → 0 after the command, exit 0 |
| 2 — the remaining fallback is refused unless `--force`, a forced rewrite warns (ruling R20/Q9), recorded in the cli-reference entries | **red-first** | no `--force` on the dna verbs and no refusal existed (`git grep -n -w force 0cf8b131 -- src/core/index.ts` → only `directive assign`'s) |
| 3 — in-place edits byte-identical outside the edited node | characterization | the existing editor already did this; pinned by a new end-to-end check |

### red (developer)

`f3fdbf98`:
- `test/dna/edit.test.ts`: a `task-193` block (first `team.agents` entry as a pure insertion; an
  undeclared list; `{}` parent; an absent parent inside a batch; `>-` and `|` block scalars; CRLF; the
  `---` characterization; WingFoil's own `dna.yaml` updating `project.north_star`/`description` with
  every comment kept). Two pinned declines that the bugs rule out were changed: "target key absent"
  now uses a non-empty flow-mapping parent, and the block-scalar decline case was removed.
- `test/core/dna-whole-file-rewrite.test.ts`: `CONFLICT` without `--force`; forced rewrite with the
  warning and one commit; `VALIDATION` before `CONFLICT`; `--force` on an editable file is in place
  and unwarned (all four verbs); `dna set project.north_star` on the real file; the flag on the four verbs.
- `test/cli/dna-force.integration.test.ts`: through `dist/cli.js` on a `wingfoil init --template scrum`
  project — `bug-126`'s command verbatim (comments equal, diff = only the four added lines, stderr
  empty), the byte-identity characterization (`dna set project.name`: one line changed, comment
  column kept), the refusal (exit 1, exact stderr, porcelain empty, HEAD unchanged), and `--force`
  under console/json/yaml.
- `P2.1-dna-set.feature`: three scenarios (comments survive the first `team.agents`; refused in place;
  `--force` rewrite). BDD runs as the Jest suites that mirror them (no runner, `bug-106`); the
  integration suite labels each scenario.

The test files use literal strings, so the red is assertion failures, not a compile error.
`npx jest test/dna/edit.test.ts test/core/dna-whole-file-rewrite.test.ts test/cli/dna-force.integration.test.ts`
→ **3 suites failed, 17 tests failed, 55 passed**. The characterization cases (`---`, AC3, the
`VALIDATION` ordering, `--force` on editable files) passed on first run.

### green (developer)

`183b04f7`: `src/dna/edit.ts` (`insertMissingPath`, block-scalar rewrite in `editSetScalar`, the
absent-sequence branch of `editAppendItems`, CRLF in `applyDnaEditInText`); `src/core/index.ts`
(`dnaRewriteConflict`, `DNA_REWRITE_WARNING`, `force` on `DnaSetParams`/`DnaMutationParams`,
`runDnaMutation`'s refusal and warning, `DNA_FORCE_FLAG` on the four verbs); `src/mcp/registrar.ts`
TSDoc (the dna Tools also need `force` when Tools ship); `docs/cli-reference.md` (a paragraph under
*DNA* on in-place writes, `[--force]` in the four synopses, a `--force` item in each entry, the
refusal and warning texts). Two expectations of the red tests were corrected: they guessed the inline
comment's spacing, and the editor keeps a comment at its column (`rewriteKeyLine`), the established rule.
The same three suites → 246 passed (`npm run -s build` first).

### refactor (developer)

`152d57be`: `insertMissingScalarPath` removed (decision 5) and five decline cases added for the new
branches (a missing index step, an append on an index or an existing item, an empty-mapping item, a
scalar parent). `npx jest test/dna --coverage --collectCoverageFrom=src/dna/edit.ts`: `edit.ts` 97.22 /
95.47 (stmts / branches); every uncovered line left is pre-existing (main `0cf8b131`, measured the same
way in a temporary worktree: 97.30 / 94.05). `88f0c260`: one TSDoc line.

Gates, on `152d57be` (code identical to the HEAD these notes are committed on, `88f0c260` changes a
comment), with the pending amendments in the working tree:

| Command | Result |
|---|---|
| `npm run test:coverage` | 245 suites / 4641 tests; 4639 passed, 2 perf failures under load (load average ~65, `uptime`): `test/core/query-latency.test.ts` and `test/mcp/resource-latency.test.ts`, alone → 8/8 passed. Coverage 99.08 / 96.18 / 96.19 / 99.68 (stmts / branches / funcs / lines) vs `main` 99.07 / 96.18 / 96.18 / 99.68 (the B2 gates on `07000bc0`, code-identical to `0cf8b131`, as recorded by the B3 task notes): no regression |
| `npm run -s lint` | exit 0 |
| `npm run -s docs:api` | exit 0 |
| `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| `npx tsc -p tsconfig.build.json --noEmit` | exit 0 |

`test/docs/cli-reference.test.ts` (every declared flag named in its entry) is in that run and passed.
The first coverage run, before the refactor, measured 99.03 / 96.04 / 96.20 / 99.68; the removed dead
branch and the new decline cases account for the difference.

### review (reviewer, self)

- AC1: `dna-force.integration` "bug-126" (`bug-126`'s command verbatim; comment lines equal; the hunk
  is four added lines, none removed); `edit.test` "bug-126" ×2; `dna-whole-file-rewrite` keeps
  comments on `dna set project.north_star` (`bug-019`).
- AC2: refusal — `dna-whole-file-rewrite` "without --force" (`CONFLICT`, exit 1, file and HEAD
  unchanged) and the integration refusal (exact stderr, empty porcelain); `--force` — core (warning,
  one commit) and integration under console/json/yaml (stdout = payload, warning on stderr). Recorded
  here (design 2–4), in `docs/cli-reference.md`'s `dna set`/`add`/`update`/`remove` entries, and in
  `spec-008` §6/§12 (pending amendment).
- AC3: integration "(characterization)" (one changed line, comment column kept) and `edit.test`'s
  pure-insertion helper.
- Same-class check in files touched: `grep -n -i "fall.\?back\|dump()" src/core/index.ts src/dna/edit.ts`
  → the remaining mentions are historical (`setDnaValueInText`'s own fallback, in the module header) or
  describe the forced rewrite. `runDnaMutation`'s step 6 TSDoc now describes the refusal.
- Not changed, and why: `docs/user-guide.md` §11 "Known limitations in 0.2.2" still lists `bug-126`'s
  limitation. It describes the released 0.2.2, so it is the v0.3 `user-docs` phase's to drop (candidate
  finding below), not this task's.

### Pending amendments (approver)

Edits left uncommitted in the worktree, for `memory amend`:
- `spec-008-cli-grammar` — §6 pinned refusal row and warning row for the dna verbs, §12 `--force` row,
  Revision note. Proposed `--reason`: `task-193 (ruling R20/Q9): the four dna write verbs refuse the
  whole-file rewrite of dna.yaml unless --force, as dl-062 for roles.yaml. Section 6 pins the refusal
  and the warning, section 12 lists the flag.`
- `spec-002-dna-yaml-schema` — new section *Writes keep the file's text, or are refused*, Revision
  note. Proposed `--reason`: `task-193 (bug-019, bug-126, ruling R20/Q9): a dna.yaml write is made in
  place or refused unless --force. The schema itself is unchanged.`

### Candidate findings (not filed)

- `setDnaValueInText` (`src/dna/set.ts`, exported from `src/dna/index.ts`) has no production caller
  after this task (`grep -rn "setDnaValueInText(" src` → its own definition only); `dna set` goes
  through `applyDnaEditInText`. Remove it, or keep it as a tested public helper, by decision.
- `docs/user-guide.md` §11 lists `bug-126` as a known limitation; the v0.3 `user-docs` phase should
  drop it, and the CHANGELOG list (`bug-227`) should carry this task's change.
