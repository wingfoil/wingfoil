---
id: "task-209-declare-submit-commit-what-content-carries-make-templates"
type: task
title: "Declare in `submit`'s commit what content it carries, and make the templates tell the truth about `submit`"
status: in-progress
release: "v0.3"
kind: "feature"
priority: "medium"
tags: ["v0.3", "core", "memory", "audit"]
ref: "dl-106"
bug: ["bug-146", "bug-219"]
depends_on: ["task-126-declare-closed-wf-operation-grammar-bracket-set-state", "task-192-stamp-wingfoil-commit-wingfoil-version-semver-sha-pin"]
tmpl_version: 260703
---

## Description

`memory submit` sweeps uncommitted edits of the element into a commit whose subject names only the transition (`dl-106`). Ratified: keep content-carrying submit and declare it — the body names what changed (`describeDocumentChanges`). Every scaffold's placeholder comment says `submit` "replaces these placeholder comments … and fills the required frontmatter fields", which it does not (`bug-146`). **Blocked on F1** (the subject bracket).

## Acceptance Criteria

- (red-first) a submit with a body change writes a body line naming "the body"; one with frontmatter changes lists the fields; a pure transition writes no such line.
- (red-first) the subject follows the approver's F1 ruling.
- (red-first) the nine template comments (built-in `src/storage/templates.ts` and this repository's `.wingfoil/memory/templates/`) say what `add` and `submit` actually do.
- (characterization) `spec-010` and `spec-008` carry W1; `docs/cli-reference.md` states it.

## Implementation Notes

- **Size:** S · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-106 W1 (a), Action 1 (spec-010 ownership, spec-008), Action 3 (cli-reference, templates).
- **Features:** P1.6.
- **Planning ruling:** Approver ruling 2026-09-30 (plan R20, Q1): `dl-054` prevails over `dl-106` W1 (a) — `submit`'s subject keeps no transition bracket; what content the submit carries is declared in the commit body.
- **Notes:** Proposal key: C23.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

Branch `task/task-209-declare-submit-commit-what-content-carries-make-templates`, worktree
`../.wf2-wt/task-209`, cut from `main` at `ed4607a4`. Start `9984508f`; `bug-146` `2cf657ce` and
`bug-219` `663ef827` `[planned → in-progress]`.

### design (architect)

**`depends_on`** (dl-015). `task-126` (`done`): `spec-008` §2 already states that `submit` keeps no
bracket (`dl-054` over `dl-106` W1 (a), R20), and its notes say "No code change was needed" for it.
`task-192` (`done`): `commitPaths` appends the `WingFoil-Version:` paragraph itself;
`CoreResult.commit.message` stays the operation's message; tests that pin a whole body use
`STAMP_TRAILER`. Both constrain this task as designed below.

**Decisions and specs cited** (`grep -m1 '^status:'` on each): `dl-106` and `dl-054` `ready`;
`spec-008`, `spec-010` `approved`. The F1 ruling is `dl-054`'s approve (`194ff913`) and
release-planning R20 (`release-planning-rel-v0.3-plan` line 105): plain subject, content declared in
the body.

**Design.**
1. `describeSubmitContent(committed, content, target)` in `src/memory/submit.ts`: both the document
   committed at the transition's sha (`readPathAtRev(root, prepared.sha, path)`) and the working tree
   are rendered by `renderSubmitDocument`, then compared with `describeDocumentChanges` — the function
   dl-106 names. So `status` and a cleared `rejection_reason`, the submit's own fields, never count.
2. `formatMemoryCommitMessage` gains `carries?: readonly string[]`; non-empty → one body line
   `Carries content: <item>, <item>`. The key holds a space, so it is not trailer-shaped: no reader
   (`parseApproverTrailerLine`, `parseReasonBlock`, `parseVersionTrailer`, git's trailer parser) takes
   it for a trailer. Items are escaped (`\u{XXXX}` for control characters and line breaks) so a YAML
   key with a newline cannot add a body line. It is refused next to `Approver:`/`Reason:`.
3. Templates: one comment, the same wording in the built-in `memoryTemplateMd` and at the top of the
   body of the nine repository scaffolds, saying what `add` (`renderAddDocument`: `id`, `title`,
   `status`, `--tags`/`--set`) and `submit` (`renderSubmitDocument`: `status`, `rejection_reason`)
   actually do. In `task.md` the comment is inserted above `## Description`; the Execution Notes
   placeholder (task-201's) is untouched.
4. `bug-219`: (1) `adr.md`/`tech-spec.md` comment shows a full id and says a short form is not
   resolved. (2) The init-scaffold part is closed by the bug's own second alternative ("or the
   documentation states that a new project must add both by hand"): the built-in `adr`/`tech-spec`
   scaffolds carry a comment saying the starter project has neither the field nor the `superseded`
   edge and how to add both (or `deprecate` instead); `docs/cli-reference.md` says the same. No
   scaffolded `memory.yaml` machine or field changes (that would be a product decision and spec-011/
   spec-001 territory, and task-196 owns `init`'s layout in this batch). **Decision for the approver.**
5. Every repository scaffold's `tmpl_version` → `261006` (template revision date, as `task-164` did
   for `release.md`). **Decision for the approver** (task-150 changed `task.md` without bumping).

**AC classification (T1).**

| AC | Class | Why |
|---|---|---|
| 1 — body line names "the body" / lists the fields / none on a pure transition | **red-first** (body, fields); the pure-transition and `rejection_reason`-only rows are characterization | no submit commit had a body (`formatMemoryCommitMessage({op:'submit'})` → subject only) |
| 2 — subject follows F1 | **characterization** | the AC says red-first, but the subject is already plain (task-126 notes, `test/memory/commit-message.test.ts` "submit: subject only"); a red would be fabricated. Pinned again with content carried |
| 3 — nine template comments truthful | **red-first** | built-in comment promised submit "replaces these placeholder comments … and fills the required frontmatter fields" (`src/storage/templates.ts:481`); the repository scaffolds said nothing; `adr.md:7`/`tech-spec.md:7` showed short ids |
| 4 — spec-010, spec-008, cli-reference | characterization (documentation) | — |

### red (developer)

`f4d12487`: `test/memory/submit-commit-body.test.ts` (unit: `describeSubmitContent`, the `carries`
line, escaping, refusal), `test/core/memory-submit-content.test.ts` (the registered `memorySubmit` on a
temp repo, commit read with `git cat-file commit`), `test/memory/template-wording.test.ts` (built-in
and repository scaffolds), and BDD `P1.6-memory-submit.feature` scenario "Submit carries the author's
content and declares it" (run by the first case of `memory-submit-content.test.ts`).
`npx jest test/memory/template-wording.test.ts test/memory/submit-commit-body.test.ts test/core/memory-submit-content.test.ts`
→ **3 suites failed, 32 tests failed, 11 passed**. The 11 passing are the characterization rows: pure
transition, `rejection_reason`-only resubmit, plain subject, `memory history` round trip, empty
`carries`, the scaffold count, and the non-adr/tech-spec built-ins not mentioning `supersedes`.

### green (developer)

`7c155fe2`: as design 1–5, plus `docs/cli-reference.md` (`memory submit` commit; `supersedes:` full id
and the init-scaffold paragraph, Unreleased v0.3) and `docs/user-guide.md` §8.2.
`npx jest test/memory test/core/memory-submit-content.test.ts` → 604 passed.

Pending amendments (uncommitted in the worktree, see below): `spec-008` §2 paragraph "`memory submit`
declares the content it carries" + verb-table row + Revision note; `spec-010` "Document template
shape" paragraph and the `memory.submit` ownership row + Revision note.

### refactor (developer)

`be569de6`: the full run flagged `test/lint/no-signal-as-exit.test.ts` (bug-197's lint reads
`status ??` textually) on the two new fixtures' `fields.status ?? 'draft'`; the fixture field is now
`state`. No production change.

Gates, on `be569de6` with the two pending amendments in the working tree (load average 47–120: nine
agents running jest):

| Command | Result |
|---|---|
| `npm run test:coverage` | 276 suites / 5114 tests; 5113 passed, 1 failed: `test/core/query-latency.test.ts` REQ-PERF-02 p95 under load. Re-run alone (`npx jest test/core/query-latency.test.ts`, load 120) → 4/4 passed; budget not touched. An earlier run also flaked `test/mcp/resource-latency.test.ts`, 8/8 alone (with query-latency) |
| coverage (stmts / branches / funcs / lines) | branch 99.23 / 96.75 / 96.53 / 99.71; `main` `ed4607a4` (`npx jest --coverage` in a detached scratch worktree, 273 suites / 5065 tests, exit 0) 99.23 / 96.72 / 96.53 / 99.71 — no regression. `commit-message.ts`, `submit.ts` 100; `templates.ts` branches 96.15 (main 95), uncovered line 591 is not this task's |
| `npm run -s lint` | exit 0 |
| `npm run -s docs:api` | exit 0 |
| `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| `npx tsc -p tsconfig.build.json --noEmit` | exit 0 |
| `npx jest test/docs` | 70/70 (cli-reference, enumeration parity: no command, flag, exit code or type added) |
| `node scripts/check-governance.cjs --base ed4607a4` | exit 0, 0 findings |

BDD: the new P1.6 scenario runs as the first case of `test/core/memory-submit-content.test.ts`; the
existing three stay in `test/core/memory-submit.test.ts`, green unchanged.

### review (reviewer)

Evidence per AC:
- AC1: `memory-submit-content.test.ts` "a body edit is named \"the body\"", "frontmatter edits list
  every changed field", "a pure transition writes no such line", "a resubmit that only clears
  `rejection_reason` … declares nothing"; unit rows in `submit-commit-body.test.ts`.
- AC2: `memory-submit-content.test.ts` "the subject follows the F1 ruling"; `git log -1 --format=%s`
  → `wf(task): submit task-101`.
- AC3: `template-wording.test.ts` — 9 repository + 7 built-in scaffolds, `supersedes:` rows.
- AC4: the pending `spec-008`/`spec-010` amendments; `docs/cli-reference.md` `memory submit` entry;
  `npx jest test/docs` green in the full run.

Same-class sweep in files touched: `grep -rn -i "submit[^.]*\(fills\|replaces\)" docs/04_memory/design docs/*.md README.md .wingfoil`
→ only `spec-010` (fixed, pending) and decision-log/retro history that quotes the bug. The
`memorySubmitFn` TSDoc ("no body") was corrected. `spec-004` §4.3 ("subject stays plain") is still true
and is task-195's file in this batch, so it is not touched.

Self-review findings: none open.

**Pending amendments (approver)** — coordinator runs `memory amend`:
- `spec-008-cli-grammar` — `--reason "task-209 (dl-106 W1 (a), Action 1): §2 declares the submit body, one Carries content: line naming what the commit carries beyond the state move; the subject stays plain under dl-054 and ruling R20. Revision note 2026-10-06."`
- `spec-010-memory-frontmatter-schema` — `--reason "task-209 (dl-106 W1 (a), Action 1; bug-146): the template-shape paragraph no longer says submit fills fields and replaces placeholders, and the submit ownership row says which fields the verb writes and which ride in from the author. Revision note 2026-10-06."`
