---
id: "task-139-extend-documentation-doc-versioning-testing-directives-ratified-clauses"
type: task
title: "Extend the documentation, doc-versioning and testing directives with the ratified clauses"
status: done
release: "v0.3"
kind: "feature"
priority: "high"
tags: ["v0.3", "process", "directives", "governance"]
ref: "dl-120"
bug: []
depends_on: []
tmpl_version: 260703
wave: "w1"
---

## Description

Five documentation rules (citations, resolvable references, transient facts, premises, gate↔rule) and the two testing rules (a guard says exactly what it asserts; an environment-dependent fix ships an invariant check) live only in decision-logs. `doc-versioning` assumes a `version:` that no tech-spec, ADR, DL or task carries. Write them into the stand-in directives, marked WingFoil-specific so they survive the P3.8 stand-in reconciliation.

## Acceptance Criteria

- (characterization) `.wingfoil/directives/custom/documentation.md` carries D1–D5 exactly as `dl-120` Decision states them, each citing its element, inside a section marked WingFoil-specific (dl-120 Q1 (a)); `grep -c "dl-120" documentation.md` ≥ 1.
- (characterization) `doc-versioning.md` carries V1 = `dl-047` option 1: the bump applies where a document declares `version:`/`**Version:**`; an `approved`/`accepted` Memory element edited in place records a dated `**Revision (date) — reason, per <element>.**` note instead.
- (characterization) `testing.md` carries T1 and T2 (T2 in form (a): an invariant check the normal suite runs), marked WingFoil-specific, citing `dl-121`.
- (characterization) `claim-evidence.md` *How a claim is recorded* gains a one-line pointer to D1; `code-quality.md` and `testing.md` each point at the gate that enforces them (D5: `lint.clean`, `typecheck.clean` once task-173 lands — name task-173's task id, not a future tense).
- (characterization) `npx wingfoil directives list --role developer` (worktree build) lists the edited directives with no new warning; `npm test` green.
- (characterization) `dl-075` (E sweep): `documentation.md`'s citation clause (dl-120 D1) states the rule — cite a symbol, heading, key path or quotation, pin the commit for moving state; bare line offsets stay legal only in notes; existing citations are fixed on touch — and cites `dl-075`.

## Implementation Notes

- **Size:** S · **wave:** 1 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-120 (Q1 (a), Q2 (a)); dl-047 (option 1); dl-121 (Q1 (a), Q2 = dl-120 Q1 (a)); dl-075 (citation form, E sweep: absorbed into dl-120 clause 1).
- **Features:** P3.5.
- **Notes:** Proposal key: D01. `dl-034` stays `ready` (cited). dl-120 Action 4 (close bug-040/bug-045 as absorbed) is superseded by gate 2, which triaged both as v0.3 fixes: bug-040 is task-188's, bug-045 is task-184's. This task is the single owner of the directive text of `dl-047` (V1), `dl-120` and `dl-121` (T1/T2); task-183 and task-184 carry their checks and named instances.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

Branch `task/task-139-extend-documentation-doc-versioning-testing-directives-ratified-clauses`,
worktree `../.wf2-wt/task-139`, cut from `main` at `c43221c4`; start `2933eb63`. No linked bugs, no
`depends_on`.

### design (architect)

**Decisions read.** All six cited decision-logs are `ready`
(`awk '/^status:/{print FILENAME": "$2}' docs/04_memory/design/dls/dl-{047,075,120,121,034,044}-*.md`
→ `ready` ×6). The options taken are in the approve commits' `Reason:`:
`dl-120` (`a2690231`) Q1 (a) and Q2 (a); `dl-121` (`646db1e5`) Q1 (a), with (b) a later addition;
`dl-047` (`8e7e1e44`) option 1; `dl-075` (`0cf643ff`) (A) composed with (B), existing citations fixed on
touch. No tech-spec is cited, so there is no spec to check or revise.

**Version bumps.** None of the five edited directives declares a version
(`grep -c -E '^\*\*Version:\*\*|^version:'` over `documentation.md doc-versioning.md testing.md
code-quality.md claim-evidence.md` → `0` each). V1, written by this task, scopes the bump rule to
documents that declare one, so none is added. A frontmatter `version:` would also warn
(`unknown field(s) ignored`) until task-144 declares the key. If a version is wanted, the body
`**Version:** x · **Date:** y` form that `command-baseline.md` uses would be the one to take.

**Placement.** Each new section sits at the end of its stand-in, before the `> Source` line. The P3.8
stand-in blockquote is left alone: task-188 (`bug-040`) rewrites it.

**AC classification (T1).** Every AC is documentation or verification. No behaviour is new, so there
is no red phase and no test is added (testing directive: never fabricate a red).

| AC | Class | Evidence (after `7e35b175`) |
|---|---|---|
| 1 — D1–D5 in `documentation.md`, WingFoil-specific, each citing its element | characterization | section *WingFoil-specific clauses (`dl-120`)*; `grep -c "dl-120" documentation.md` → `2` |
| 2 — V1 = `dl-047` option 1 in `doc-versioning.md` | characterization | section *Scope of the bump rule (`dl-047`, option 1)*: the bump applies where `version:`/`**Version:**` is declared; `approved`/`accepted` elements get `**Revision (YYYY-MM-DD) — reason, per <element>.**` |
| 3 — T1, T2 (form (a)) in `testing.md`, WingFoil-specific, citing `dl-121` | characterization | section *WingFoil-specific clauses (`dl-121`)*; `grep -c "dl-121" testing.md` → `3` |
| 4 — `claim-evidence` → D1; `code-quality` and `testing` → gates | characterization | `claim-evidence.md` *How a claim is recorded* first line names D1; `code-quality.md` "Lint clean" names `lint.clean`, `npm run lint`, `test/lint/lint-clean.test.ts`; `testing.md` names `tests.coverage(min: 80)` and `typecheck.clean`, delivered by `task-173-add-whole-project-typecheck-clean-gate-control-character` |
| 5 — `directives list --role developer` with no new warning; `npm test` green | verification | see refactor |
| 6 — D1 states the `dl-075` rule and cites it | characterization | D1 names symbol, heading, key path or quotation, the commit pin for moving state, offsets only in notes, fix on touch, citing `dl-075` and `0cf643ff` |

**D3 applied to this task's own text.** The `typecheck.clean` pointer in `testing.md` is a transient
fact: it holds until task-173 lands. D3 says the remover's acceptance criteria must include rewriting
it, and task-173's do not. A one-line AC is therefore added to task-173. That task is `backlog`, past
its first state, so the edit is left uncommitted (see *Pending amendments*).

### red / green (developer)

No red: there is no red-first AC. Green is the directive commit `7e35b175`
(`docs(directives): …`, 5 files, `+82 −3`, `.wingfoil/directives/custom/` only).

### refactor (developer)

Run with the task-173 amendment uncommitted in the tree.

- `node dist/cli.js directives list --role developer` (after `npm run build`), before and after the
  edits: exit `0`, stdout identical and stderr identical (`diff` of the saved outputs prints
  nothing). The 8 directives listed include all five edited ones. The 3 warnings are the pre-existing
  `unknown field(s) ignored: scope` on `claim-evidence.md`, `doc-versioning.md` and
  `security-secrets.md`; no new warning. Frontmatter is unchanged in every edited file.
- `npx jest` → `Test Suites: 166 passed, 166 total`, `Tests: 2759 passed, 2759 total`.
- `npm run test:coverage` → All files `98.73 | 94.58 | 94.01 | 99.49`. No source file changed, so
  coverage cannot move. Twice in this run, under load from parallel worktrees, one test failed:
  `test/cli/publish-secrets.test.ts`, "publishes (dry run) the tarball the step names…". It expected
  `+ wf-fixture@1.0.0` and received an empty string. Alone, `npx jest --coverage
  test/cli/publish-secrets.test.ts` → `24 passed`. It is reported as a candidate flake, not fixed
  here.
- `npm run lint` → exit `0`; `npm run docs:api` → exit `0`; `npx tsc --noEmit -p tsconfig.json` →
  exit `0`; `npx tsc -p tsconfig.build.json --noEmit` → exit `0`.
- BDD: the task touches no command or feature scenario. P3.5's scenarios are about directive
  mechanics, not directive text.

### review (reviewer, self)

- Every AC was checked against the committed text with the greps above.
- D1–D5, T1 and T2 follow the Decision wording of `dl-120` and `dl-121`. Changes are limited to
  sentence splitting and to naming the precedents.
- T2 names its shape concretely: `scripts/check-lockfile-pins.cjs`, run by
  `test/cli/check-lockfile-pins.test.ts`. Both files exist (`ls` of both succeeds).
- The `code-quality` pointer cites `test/lint/lint-clean.test.ts` and `npm run lint` (`eslint .`,
  `package.json` `scripts.lint`). Both exist.
- V1 states facts that can be checked. The templates without a version key:
  `grep -c '^version:' .wingfoil/memory/templates/*.md` → `0` for adr, bug, decision-log, service,
  task and tech-spec, and `1` for plan, release and release-line. `memory amend` with `amendable`:
  `.wingfoil/memory.yaml`.
- Not edited: `command-baseline.md` (task-161/144), and the stand-in blockquotes (task-188).

### review (independent)

The verdict was "approve with fixes". Seven findings were raised, all in files this task touched,
and all are fixed. Findings 1–6 are in `bd22d554`. Finding 7 is in the uncommitted task-173 edit.

1. `doc-versioning.md` V1 had `release` among its examples. It is dropped: the `version:` of a
   `release` or `release-line` names the release (`"v0.3"`), not a revision of the document, and the
   text now says so.
2. V1 also said "directives that carry a `**Version:**` line". That named a form, and the approver
   ruled on 2026-10-01 that a directive's version is the frontmatter key (task-144 AC, `6ae8e57a`).
   It was also a transient fact with no remover (D3). It now reads "directives that declare one".
3. V1's second bullet now adds that an `adr` is not edited in place: it is `amendable: false`, and a
   changed decision is a new ADR (`dl-108` A3).
4. In `testing.md`, the coverage pointer implied that the gate asserts non-regression. It now reads
   "Gate (80% floor only)", names `jest.config.js` `coverageThreshold`, and states that
   non-regression is checked by hand at `refactor`.
5. In `claim-evidence.md`, the durable-prose bullet now pins the commit only "when the cited state
   may move", matching D1 and `dl-075` (A)+(B).
6. In V1, `<element>` is now "e.g. the decision-log, bug or task, an approver ruling or a plan".
7. The task-173 amendment also says the rewritten pointer does not claim that `refactor` declares
   `typecheck.clean` before task-221 lands.

Re-run after `bd22d554`:
- `node dist/cli.js directives list --role developer`: exit `0`, stdout and stderr identical to the
  pre-task run;
- `npx jest test/core/directives-list.test.ts test/core/context.test.ts test/core/loaders.test.ts
  test/core/project-directives.test.ts test/directives` → `7 passed` suites, `188 passed` tests;
- `npm run lint`, `npx tsc --noEmit -p tsconfig.json` and `npx tsc -p tsconfig.build.json --noEmit`
  → exit `0`.

### Pending amendments (approver)

- `task-173-add-whole-project-typecheck-clean-gate-control-character`: one AC is added. When the gate
  runs, task-173 rewrites `testing.md`'s `typecheck.clean` pointer, which task-139 wrote naming
  task-173. Proposed `--reason`:
  "task-139 wrote a pointer in the testing directive naming this task as the deliverer of the typecheck.clean gate. Under dl-120 D3 the element that ends a transient fact must carry its rewrite, so this task gains the acceptance criterion that rewrites the pointer once the gate runs, without claiming that refactor declares the gate before task-221 lands."
