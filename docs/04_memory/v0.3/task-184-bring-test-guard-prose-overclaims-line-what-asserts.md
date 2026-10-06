---
id: "task-184-bring-test-guard-prose-overclaims-line-what-asserts"
type: task
title: "Bring the test guard prose that overclaims in line with what it asserts (T1 instances)"
status: in-review
release: "v0.3"
kind: "fix"
priority: "medium"
tags: ["v0.3", "core", "directives", "tests"]
ref: "dl-121"
bug: ["bug-045", "bug-096", "bug-194"]
depends_on: ["task-139-extend-documentation-doc-versioning-testing-directives-ratified-clauses"]
tmpl_version: 260703
---

## Description

`dl-121` T1: a guard says exactly what it asserts; task-139 writes the rule into `testing.md`. Two named instances: module docs of `production-registry.test.ts:5-8`, `parity.test.ts:16-20`, `read-only-agent-channel.test.ts:12-14` still describe a read-only registry (`bug-045`); `test/cli/derived-option-namespace.test.ts:217-220` claims `--version` is absent from `program.options`, and `src/core/index.ts:342` shows the retired `dna set version 2` grammar (`bug-096`).

## Acceptance Criteria

- (red-first) the `--version` comment's claim is replaced by an assertion of the measured fact (or removed); the other prose is corrected to what the assertions check.

## Implementation Notes

- **Size:** S · **wave:** 2 · **kind:** fix (`dl-133` Q1 (b)).
- **Implements:** dl-121 T1 (named instances; the directive text is task-139).
- **Notes:** Proposal key: C40.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

Branch `task/task-184-bring-test-guard-prose-overclaims-line-what-asserts`, worktree
`../.wf2-wt/task-184`, cut from `main` at `02fd6102`. Start `e165ade9`; bug syncs `[planned →
in-progress]` `189adaf1` (bug-045), `716f24a7` (bug-096), `f723417f` (bug-194).

### design (architect)

**`depends_on` read (dl-015).** `task-139` is `done` (`awk '/^status:/{print $2;exit}'` on its file
→ `done`). It wrote T1 into `.wingfoil/directives/custom/testing.md` (section *WingFoil-specific
clauses (`dl-121`)*) and names this task as the owner of the named instances. T1 allows either fix:
narrow the prose, or widen the assertions.

**Specs.** `spec-004`, `spec-006` and `spec-008` are `approved`; `dl-121` is `ready` (same `awk`).

**Scope.** Three bugs. `bug-045` and `bug-096` are prose (the task Description). `bug-194` was
absorbed at the W1 B3 triage (`bug-ingest-rel-v0.3-w1b3-review-findings-plan`, triage table), after
the ACs were written. Its Expected Behavior is a widening: one shared snapshot used by every "writes
nothing" assertion on a write path. Done that way, rather than by narrowing ~60 titles.

**AC classification.**

| AC / bug | Class | Why |
|---|---|---|
| AC (`--version` claim → assertion of the measured fact) | **characterization** (planned red-first) | The fact exists: `program.options` holds `--version`. An assertion of it passes on first run, so a red would be fabricated. Efficacy is shown by mutation instead (green section). |
| AC (other prose corrected to what the assertions check) | documentation | Titles, module docs, one `src` comment. |
| bug-194 (widened writes-nothing assertions) | **characterization** | The verbs already write nothing. Every converted assertion passed on first run. Efficacy is shown by the helper's own suite, which plants each kind of write. |

### red

No red-first AC, so there is no `test(…): failing test` commit. The one failure seen while converting
was my own fixture-ordering error. In `memory-submit.test.ts` AC1 (`bare n/a`), `submitWith()` seeds
and commits inside the call, so the snapshot taken before it saw the seed commit as `HEAD moved`. Fixed
by seeding before the snapshot. No verb wrote anything.

### green

- `b3e8436d` — `test/storage/helpers/persistence-snapshot.ts`: `snapshotPersistence(root, paths?)` /
  `assertPersistenceUnchanged(root, snapshot, label?)`. It compares the bytes of listed files and of
  every file `git status` lists (so a dirty fixture is allowed and a rewrite of an already-dirty file
  is caught), plus `status --porcelain --untracked-files=all --ignored`, `HEAD` (`''` when unborn),
  its symbolic target, and `for-each-ref`. `test/mcp/helpers/channel-enumeration.ts` delegates to it,
  keeping its clean-tree precondition and its `channel-enumeration:` messages. Its own suite,
  `test/storage/persistence-snapshot.test.ts` (11 tests), plants each kind of write over a dirty
  fixture and over an unborn branch.
- `4975599f` — 59 writes-nothing sites in 30 files (core + CLI) now take the snapshot before the call
  and assert it after, alongside their existing checks. Located with
  `grep -rn -i "writes nothing\|wrote nothing\|writing nothing\|persists nothing\|nothing written\|nothing is written\|nothing was written\|overwrites nothing\|commits nothing" test/core test/cli`,
  restricted to `it`/`describe` titles (61 hits), then read one by one. Excluded, with the reason:
  - `test/cli/success-warnings.test.ts:119` (stderr) and `program.integration.test.ts` `mcp` case
    (stdout) are not about the repository;
  - `memory-add-confinement.test.ts:115` and `memory-add-symlink-target.test.ts:145` claim "nothing
    *outside the project root*", and `readdirSync(outside)` asserts exactly that;
  - `test/memory/entry.test.ts:96` is storage-layer, not core/CLI, and task-259 (B4b) edits that file.
    It is left for whoever widens next.
- `033b12d3` — prose:
  - `production-registry`, `parity` and `read-only-agent-channel`: the module docs no longer say
    "zero mutating ops", and the titles name the property, not a roster. The rosters are the arrays
    compared. Parity's "no mutating op is a Resource" check had 12 hand-listed `not.toContain` lines.
    They omitted `dna/add|remove|update` and listed `memory/approve` twice. That check is now derived
    from `CORE_MODULES` with `deriveVerb`.
  - **Unasserted (T1):** "a mutating Tool call rejected on an illegal transition, identical to the
    CLI" (task-016's AC case). `grep -rn "callTool" test` finds only synthetic or stubbed ops for
    that case, and the production server registers no Tool. The module doc now says so instead of
    "awaits task-018+". To be filed as a bug at the gate (coordinator).
  - `derived-option-namespace`: both comments claimed `--version` is absent from `program.options`.
    The test now asserts `globals.has('--version') === true` and `globals.has('--help') === false`,
    and adds only `help`/`--help` by hand. Its two writes-nothing cases use the shared snapshot.
  - `dna-set.test.ts` title: `dna set nonsense.at.any.depth --value value` (the dl-082 grammar).
  - `src/core/index.ts` step 7 comment (the only `src` edit, within the block task-189 must not
    touch): rewritten in the current grammar, with the measurement.
    `node dist/cli.js dna set version --value 2` on a fresh `init --template scrum` repo printed
    `error: E_VALIDATION version (.wingfoil/dna.yaml): Invalid input: expected number, received string`
    and exited `1`. `git status --porcelain` was empty and `git log` held only the init commit.
    The old spelling `dna set version 2` exits `2` (one positional only).

**Mutation check (bug-096 item 2).** I commented out `program.version(readBuildStamp())`
(`src/cli/program.ts:147`) and ran `npx jest test/cli/derived-option-namespace.test.ts -t invariant`.
Result: 1 failed (`Expected: true, Received: false` on `globals.has('--version')`). Before this task,
the hand-added `--version` kept the invariant green under that mutation. The file was then restored
(`git diff --stat src/cli/program.ts` → empty).

### refactor

With the two pending amendments present (uncommitted) in the working tree:

- `npm run test:coverage` → 271 suites, **5025 tests passed**. All files: statements 99.13, branches
  96.39, functions 96.53, lines 99.69. Not regressing: `git diff 02fd6102 -- src` changes only
  comment lines (`… | grep "^[+-] " | grep -v "^[+-] \*" | wc -l` → `0`), so no `src` line changed
  coverage.
- `npm test` → exit 0, 271 suites, 5025 tests passed.
- `npm run lint` → clean. `npx tsc --noEmit -p tsconfig.json` and
  `npx tsc -p tsconfig.build.json --noEmit` → clean. `npm run docs:api` → exit 0.
- `node scripts/check-governance.cjs --base 02fd6102` → exit 0 (0 findings).

### review (self, code-review directive)

- Both ACs are met (table above, with evidence). The three bugs are addressed: bug-045 (prose and
  the derived Resource check), bug-096 (items 1–4: comment and measured assertion, hand-listed
  `version` removed, present-tense grammar, §1 → §2 citation), bug-194 (shared helper, 59 sites).
- Same-class fixes in files I touched: the parity `not.toContain` roster (derived), the third parity
  comment (lines 169-172 in the bug), and the task-history comment in read-only-agent-channel. The
  long task-history comment in parity's first production test is history ("task-X adds Y"), not a
  claim about the current set, and is kept.

### Pending amendments (approver)

- `spec-008-cli-grammar`: §9 cited "§1's precedence rule"; it now cites §1 for placement and §2 for
  `--version` precedence ("all three working as specified"). The second 2026-09-24 Revision note says
  the same thing ("§1 gives a global precedence"); it is left as written and corrected in the appended
  2026-10-06 Revision note (review fix 2). Proposed `--reason`:
  "Correct the citation behind §9's second outcome: §1 gives a global's placement, §2's --version row
  gives its precedence (bug-096, task-184). No rule changed."
- `task-093-dna-mutation-surface-add-remove-update` (dated Correction note appended; the notes said
  `--version` is outside `program.options`). Proposed `--reason`: "Record that --version is in
  program.options, as measured by task-184 (bug-096); the earlier notes are kept as written."

### review fixes (independent review: APPROVE WITH FIXES)

1. **bug-194, the whole class.** The first pass followed title phrases ("writes nothing" and the
   like). Refusal tests worded differently still checked only `HEAD` or one file. The same conversion
   is now applied wherever a test checks that state did not change:
   - a positive `toBe(<var>)` on a line that reads `HEAD` (`head(`, `'HEAD'`, `rev-parse`), with the
     variable captured in the test and not also used in a `not.toBe(<var>)`;
   - the per-file helpers `expectUnchanged(before…)` (memory-wip-limits) and
     `expectNothingWritten(before…)` (memory-amend);
   - the `usageError` helper in dna-quoted-path-segments;
   - by hand: the "state unchanged" CLI scenarios in `program.integration` (memory submit sc.2,
     approve sc.2 and sc.3, reject sc.2, sc.3 and REQ-SEC-03, deprecate sc.3) and
     directive-inventory-baseline's AC5 `--role` refusal.

   Every case the reviewer named is converted: the 6 listed files, the 8 single tests, and the 6 in
   files I had already touched. In the memory-park bug-076 guard, the generated snapshot preceded the
   fixture edit and failed on it, so it was moved after the edit. No converted test found a write.

   Counts (`toBe(before` vs `assertPersistenceUnchanged(` per file in `test/core` + `test/cli`):

   | Point | Files with `toBe(before` | `toBe(before` | `assertPersistenceUnchanged(` in those files |
   |---|---|---|---|
   | before the fixes (`32660984`) | 60 | 188 | 53 |
   | after | 60 | 188 | 206 |

   Across all of `test/core` + `test/cli`, `assertPersistenceUnchanged(` went from 59 (`033b12d3`) to
   212.

   What remains unconverted, with the reason:
   - the `toBe(before` checks still outside a snapshot are `directive-assign.test.ts` AC4 (`:182`)
     and `--force … CAN edit` (`:678`). Both are successes that compare the written file with an
     expected edit of `before`;
   - every other unconverted `toBe(<var>)` on a `HEAD` line is a success path that commits, so
     "nothing persisted" does not apply;
   - `memory-add-confinement` / `memory-add-symlink-target` "outside the project root" assert exactly
     their claim on the outside directory;
   - `test/memory/entry.test.ts:96` stays unconverted because task-259 edits that file;
   - `memory-supersede`'s git-failure-between-commits case keeps the approve commit by design.
2. **spec-008 pending amendment.** The second 2026-09-24 Revision note is restored as it was. The
   correction now sits in the new 2026-10-06 Revision note, which names that note. §9 reads "all
   three working as specified" and is re-wrapped. Both amendments remain uncommitted.
3. **parity nit.** The derived `not.toContain` loop is removed, because the exact Resources list
   already excludes every mutating op. The cross-check `expect(tools).toHaveLength(<registry
   mutates: true count>)` is kept.

The task-016 case (a real `CORE_MODULES` mutating Tool refusing an illegal transition) is to be filed
as a bug at the gate.

Gates after the fixes, with both amendments in the working tree:
- `npm test`: exit 0, 271 suites, 5025 tests;
- `npm run lint`: clean;
- `npx tsc --noEmit -p tsconfig.json` and `npx tsc -p tsconfig.build.json --noEmit`: clean;
- `npm run docs:api`: exit 0;
- `node scripts/check-governance.cjs --base 02fd6102`: exit 0, 0 findings.

**Second review fix (focused re-review).** Nine more refusal tests checked only one file, a file's
continued existence or the `dna.yaml` text, and took no snapshot. They now do:
- `directive-create` AC3 path-traversal names;
- `directive-remove`: the six built-ins, the alphabetically first role, the `global` binding, and the
  missing git identity;
- `directive-inventory-baseline` AC4;
- the built-in refusal in `program.integration`;
- the bare dotted name in `dna-quoted-path-segments`;
- the schema-refused `--force` case in `dna-whole-file-rewrite`.

The rule actually applied across both passes: **every test in `test/core` and `test/cli` that drives
a write-path operation into a refusal (`ok: false`, exit `1`/`2`, a thrown `UsageError`), or into a
no-op success, and checks any file, `HEAD` or `dna.yaml` text afterwards, takes `snapshotPersistence`
before the operation and asserts `assertPersistenceUnchanged` after it.** Titles and wording are not
the criterion.

The scan that checks the rule is in the scratchpad, not the repo. It lists every `it`/`test` block
that has a refusal marker (`.ok).toBe(false)`, `status).toBe(1|2)`, `toBeInstanceOf(UsageError)` or
`rejects.toThrow`) and a file check (`readFileSync`, `existsSync`, `dnaText(`, `readRoles(`, `head(`,
`rev-parse`, `readFile(` or `customDirectiveNames`), but no `snapshotPersistence`. The same pass also
converted:
- `journey-0a`'s `dna set` refusal (before its successful `dna add`);
- `program.integration`'s "still assigned" removal;
- `directive-create`'s missing `--name`;
- `memory-submit`'s re-review ruling 1;
- `memory-transition-head-baseline`'s restore-hint refusals, snapshotted before the refusal and
  checked before the restore.

**Final count: 4** remaining, all excluded with a reason:
- `test/cli/mcp-registration.test.ts:156`, `:161`, `:167` are the `check:mcp` script, which runs on
  no write path;
- `test/core/memory-supersede.test.ts:315` keeps the approve commit by design (a git failure between
  the two commits).

`test/memory/entry.test.ts:96` sits outside the scan's directories and stays for task-259.

After this pass, the affected suites (9 suites, 221 tests), `npm run lint` and
`npx tsc --noEmit -p tsconfig.json` all pass.

The task stays `in-review`.
