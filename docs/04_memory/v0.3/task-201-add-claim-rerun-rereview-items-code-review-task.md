---
id: "task-201-add-claim-rerun-rereview-items-code-review-task"
type: task
title: "Add the claim re-run and re-review items to code-review and the task template"
status: in-progress
release: "v0.3"
kind: "feature"
priority: "medium"
tags: ["v0.3", "process", "directives", "review"]
ref: "dl-097"
bug: []
depends_on: ["task-191-add-absence-claim-falsifiability-clause-claim-evidence-reword"]
tmpl_version: 260703
---

## Description

Unverified claims and repeated reject classes reached review in v0.2. The reviewer's checklist gains both items; the task template names the per-item answer the implementer writes on a re-review. The dev-loop `checks.pre` entries are task-221.

## Acceptance Criteria

- (characterization) `code-review.md` gains (i) "re-run each state claim of the review-ready summary; every absence claim shows its positive case" (dl-097 (a)); (ii) the re-review procedure of dl-098 §1 (re-verify each previous `Reason:` item by command, then search the new pass for the same class; one line per item in the verdict's `Reason:`), reading the previous reason through `memory history` (dl-098 (a)).
- (characterization) `.wingfoil/memory/templates/task.md` Execution Notes placeholder names the required review-stage entry: one line per previous `Reason:` item with its command (dl-098 (b)); `tmpl_version` handled per the template convention.
- (characterization) `claim-evidence.md` states dl-098 §3 (the clause applies to every sentence written in response to a reject).

## Implementation Notes

- **Size:** S · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-097 (a) (directive half); dl-098 ((a)+(b), §3).
- **Features:** P3.5, P4.14.
- **Notes:** Proposal key: D06.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

### design (architect)

**Dependencies (dl-015).** `task-191` is `done` (`grep -m1 '^status:' docs/04_memory/v0.3/task-191-*.md`
→ `status: done`). Its notes: it wrote dl-097 §1 (the falsifiability clause) into `claim-evidence.md`,
so this task does not re-add it; and it applied doc-versioning to directives with no `version:` field
(not given one). Same here: `grep -n "^version:" .wingfoil/directives/custom/*.md` → only
`git-conventions.md` and `command-baseline.md` (the positive case: the pattern matches a declared
version), none in `code-review.md` or `claim-evidence.md`. So **no version bump** on either file,
although the batch notes say "bump once each" (doc-versioning: "A document that declares no version
is not given one") — decision for the approver below.

**Sources.** `dl-097` and `dl-098` are `ready` (`grep -H -m1 '^status:' docs/04_memory/design/dls/dl-09{7,8}-*.md`
→ two `ready`). Ratified options, read from the approve commits (`git log --grep='dl-09[78]' --grep='^wf(decision-log): approve' --all-match`):
dl-097 (`ae393dc0`) "(a) a review-gate checklist item plus a checks.pre … and (b) a warn-only CI job";
dl-098 (`b956ad6d`) "(a) plus (b)". No tech-spec is cited by the ACs; none edited. The dev-loop
`review.checks.pre` entries are `task-221`'s (its AC 1 names dl-097 (a) and dl-098), not touched here.

**Facts the directive text relies on, checked:**
- `memory submit` removes `rejection_reason`: `grep -n "rejection_reason" src/memory/submit.ts` →
  line 11 "`rejection_reason` by removing the key".
- `memory history` exposes a reject's `Reason:` block: `node dist/cli.js memory history task-093-dna-mutation-surface-add-remove-update | jq '[.entries[]|select(.operation=="reject")]|length'`
  → `2`; the `jq … | last | .reason` form in the directive prints the `3570de87` reason ("Sent back for
  one defect the reviewer found …"), on the code version and on the pinned 0.2.1 build alike
  (`npm run -s wingfoil -- memory history …`); on a task never rejected (this one) it prints `null`.
- The figures cited in `claim-evidence`: `git log 20e8271..a20b346c --grep='^wf(task): reject' --format=%s | sed -E 's/^wf\(task\): reject ([^ ,]+).*/\1/' | sort | uniq -c | awk '$1>1'`
  → four tasks (034, 054, 072, 093); `git log -1 --format=%B 527fefab | grep -o "reintroduced the defect[^.]*"`
  and `git log -1 --format=%B 304d1632 | grep -io "replacement for the sentence[^.]*"` each print the
  quoted phrase (the two "inside the passage written to fix it" instances).
- Only one copy of the template placeholder exists: `grep -rn "rejection reasons and what changed" --include=*.md --include=*.ts --include=*.yaml .`
  (excluding `docs/04_memory/v0*`) → `.wingfoil/memory/templates/task.md:41` and the dl-098 quote of it;
  `src/storage/templates.ts` has no task Execution Notes text (`grep -n "rejection reasons" src/storage/templates.ts` → nothing,
  while the same grep over the template hits line 41 — positive case). So the built-in scaffold is not affected.

**tmpl_version convention.** spec-010 defines `tmpl_version` as the template's `YYMMDD` build stamp
identifying the template revision; the precedent is `63745534` (task-164), which moved
`release.md` from `261002` to `261005` with its content change. `task.md` → `261006` (today). Note that
`task-150` (`94ddf015`) and `task-114` changed `task.md` without moving it from `260703`.

**AC classification.**

| AC | Class | Why |
|---|---|---|
| 1 — `code-review.md` gains dl-097 (a) and the dl-098 §1 re-review procedure via `memory history` | characterization (directive text) | no behaviour; the directive loader already reads the file |
| 2 — task template placeholder names the per-item review entry; `tmpl_version` | characterization (template text) | `memory add` copies the template verbatim; no code path changes |
| 3 — `claim-evidence.md` states dl-098 §3 | characterization (directive text) | no behaviour |

No red-first AC, so no failing-test commit (testing directive: never fabricate a red). No test in the
repo pins directive or template prose (precedent: task-191); evidence is the greps below and the loader run.

### red

None: all three ACs are characterization (above).

### green — `ba2b26a8`

- `code-review.md`: checklist names "claims re-run"; new section *Claims are re-run before the verdict*
  (dl-097 (a): re-run each state claim of the review-ready summary; every absence claim shows its
  positive case; the `checks.pre` is the workflow's declaration, dl-097 Action 3); new section
  *Re-review: the previous reject is checked first* (dl-098 §1 steps 1–2, read through `memory history`
  per §2 (a) with a runnable `jq` form, the implementer's lines per §2 (b) as checklist not evidence,
  one line per item in the verdict's `Reason:` — written within the dl-067 shape rules).
- `claim-evidence.md`: new section *Sentences written in response to a reject* (dl-098 §3), before
  *Why this is written down*.
- `.wingfoil/memory/templates/task.md`: the `review:` line of the Execution Notes comment now states the
  REQUIRED per-item entry (dl-098 (b)); `tmpl_version: 261006`.

### refactor (gates, at `ba2b26a8`)

- `npm test` → 273 suites, 5065 tests passed.
- `npm run test:coverage` → 273/5065 passed; All files 99.23 stmts / 96.72 branches / 96.53 funcs /
  99.71 lines. No source or test change (`git diff --stat ed4607a4 -- src test` → empty), so coverage
  cannot regress against main.
- `npm run lint`, `npm run docs:api`, `npx tsc --noEmit -p tsconfig.json`,
  `npx tsc -p tsconfig.build.json --noEmit` → exit 0 each.
- `node scripts/check-governance.cjs --base ed4607a4` → exit 0, "gated: 0 findings".
- `npm run build && node dist/cli.js directives list --role reviewer | jq -r '.entries[].frontmatter.id'`
  → exit 0, lists `claim-evidence` and `code-review` (the loader parses both edited files).
- No CLI command/help, exit code, Memory type/state or MCP surface touched (no parity amendment); no
  BDD scenario covers directive prose (P3.5/P4.14 features describe loading and the gate, not this text).

### review (self, reviewer)

| AC | Status | Evidence |
|---|---|---|
| 1 (i) | met | `grep -n "re-run\|positive case" .wingfoil/directives/custom/code-review.md` → section *Claims are re-run before the verdict* (line 31); before: `git show ed4607a4:.wingfoil/directives/custom/code-review.md \| grep -ciE "claim\|re-review\|previous"` → `0`, the same pattern over the new file hits line 22 (positive case) |
| 1 (ii) | met | `grep -n "Re-review\|memory history" .wingfoil/directives/custom/code-review.md` → lines 43, 48, 51 (steps 1–4: read via history, re-verify by command, same-class search, one line per item) |
| 2 | met | `grep -n "dl-098\|tmpl_version" .wingfoil/memory/templates/task.md` → line 17 `tmpl_version: 261006`, line 41 the REQUIRED review entry |
| 3 | met | `grep -n "dl-098" .wingfoil/directives/custom/claim-evidence.md` → line 88 (*Sentences written in response to a reject*); `git show ed4607a4:.wingfoil/directives/custom/claim-evidence.md \| grep -c dl-098` → `0`, while `grep -c dl-097` over the same blob is non-zero (positive case) |

Same-class sweep in the files touched: every factual sentence added names its source or was checked
above (submit clearing `rejection_reason`, history JSON shape, the dl-098 figures). The template
comment contains no `## Execution Notes` literal (w3-b1 line-anchor hazard):
`grep -c "## Execution Notes" .wingfoil/memory/templates/task.md` → `1` (the heading itself).

Pending amendments (approver): none — directives and templates are config, committed here.

Decisions for the approver:
- No `version:` added to `code-review.md` / `claim-evidence.md` (they declare none; doc-versioning).
- `task.md` `tmpl_version` 260703 → 261006 per the `release.md` precedent; task-209 (merging before
  this task) edits the same template's comments and may also move `tmpl_version`: at the gate, keep
  one stamp (the later date) and both comment edits.
