---
id: "task-178-add-git-conventions-directive-id-allocation-hand-rule"
type: task
title: "Add the git-conventions directive with the id-allocation hand rule and the AI attribution policy"
status: in-review
release: "v0.3"
kind: "feature"
priority: "high"
tags: ["v0.3", "process", "directives", "git", "security"]
ref: "dl-119"
bug: []
depends_on: ["task-133-bind-builtin-security-directive-role-stop-tests-pinning"]
tmpl_version: 260703
---

## Description

Three ratified git conventions, `dl-101`'s allocation rule and the attribution policy live in no directive. One `git-conventions` directive (`kind: custom`, global) states them, so every role's context carries them. The built-in `security` binding and `bug-112` are task-133's, which lands first because it is the first change to `roles.yaml` bindings.

## Acceptance Criteria

- (characterization) `.wingfoil/directives/custom/git-conventions.md` (`kind: custom`) states dl-119 clauses 1–5 with the closed prefix list of Q1 (b) (`task/ design/ ingest/ fix/ docs/ qa/ backlog/`, each with its meaning, including which prefix an ingest main uses) and a header naming `dl-024`, `dl-035`, `dl-054`, `dl-094`, in `command-baseline.md`'s citation form.
- (characterization) The same directive states dl-117's policy: AI co-authorship on every commit whose content an agent produced except `approve`/`reject` (Q1 (B)); `Co-Authored-By:` names the `dna.yaml` `team.agents` entry and an `AI-Model:` trailer carries the model id (Q2 (c)); past commits are not rewritten.
- (characterization) `roles.yaml` `global:` gains `git-conventions` (declared in `roles.yaml` only, no `scope:` frontmatter, until task-144 rules on `bug-148`); version bumped; the header's "not yet implemented" sentence about built-in templates is task-188's.
- (characterization) `sw-life-cycle.yaml` and `release-cycle.yaml` `dl-024` comments point to the directive (Q1 (b) changes the naming they describe); versions bumped.
- (characterization) `npm test` green; `directives list --role approver` shows `git-conventions`.
- (characterization) `dl-101` §1 (its Action 2): the allocation rule — fetch then scan every ref, push the `add` commit at once, re-scan before merging, cite no id before its element exists, no parallel allocation by agents — is stated in the directive, citing `dl-101`.
- (characterization) `dl-035` (E sweep, via `dl-119`'s clause "re-submitting if `main` has moved"): the directive states that a task branch merges `main` on resume after a reject and before re-submitting; task-205 declares the matching `dev-loop.yaml` action.

## Implementation Notes

- **Size:** M · **wave:** 2 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-119 (Q1 (b), Q2 (b)); dl-117 (Q1 (B), Q2 (c), Q3 (x); Actions 2, 5); dl-101 §1 (Action 2); dl-035 (rule text, E sweep).
- **Features:** P3.5, P3.7, P3.8.
- **Planning ruling:** Approver ruling 2026-09-30 (plan R20, Q8): the attribution rule reaches agents through `agent execute`'s bootstrap; the record commit is not changed.
- **Notes:** Proposal key: D02. the code half of dl-117 (Action 4, `agent execute` writes attribution per the rule) belongs to the task implementing `agent execute` (spec-016), which should `depends_on` task-178. `dl-024/035/054` stay `ready`. Depends on task-133 (same `roles.yaml` `global:` list; `bug-112`'s fix must land before any binding change). The `dl-117` code half (Action 4) is task-228's, which depends on this task.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

Branch `task/task-178-add-git-conventions-directive-id-allocation-hand-rule`, worktree
`../.wf2-wt/task-178`, cut from `main` at `0b297169` (`git merge-base HEAD main`). Start `c3429998`.
`bug: []`, so no bug status sync.

### design (architect)

**`depends_on` read (dl-015).** `task-133` (`done`): it bound `security` in `roles.yaml` `global:`
(v1.1 → 1.2) and rewrote the two live suites by property (`bug-112`), so adding a global binding is
no longer a red by itself; its `CLAUDE.md` §7 edit is the precedent for updating the global row here.

**Decisions read** (all `ready`, `awk '/^status:/{print $2;exit}'` on each file): `dl-119` (approve
`1db6be88`, Reason: Q1 (b), Q2 (b)), `dl-117` (`741bc1fa`: Q1 (B), Q2 (c), Q3 (x)), `dl-101`
(`d7608201`), `dl-111` (`a42d540e`), `dl-024`, `dl-035`, `dl-054`, `dl-094`, `dl-074`. The ratified
options are read from each approve commit (`git log --all --grep='approve dl-119' --format=%b`, same
for the others). No tech-spec governs a custom directive's text; none is missing or needs revision.

**Rulings taken here (approver to confirm).**
1. **`scope: global` in the directive's frontmatter, against AC 3's literal "no `scope:`".** AC 3
   conditions the omission on "until task-144 rules on `bug-148`". `task-144` is `done` and `bug-148`
   `closed` (`grep -n '^status:'` on both files): it ruled that every id `roles.yaml` lists in
   `global:` must declare `scope: global`, and `test/core/directives-list.test.ts` "reports no warning
   on this repository" pins it. Omitting the field would make that live test fail. All five other
   global directives declare it (`grep -l '^scope:' .wingfoil/directives/custom/*.md` → 5 files).
2. **`code-quality`'s commit bullet stays where it is** (dl-119 Relations leaves the choice to this
   task). It is the P3.8 stand-in's generic rule and `dna.yaml` maps `process.commits` to it; the new
   directive cites it rather than moving or duplicating it.
3. **dl-117 Q2 (c) leaves the `Co-Authored-By:` email open**: it fixes the name (the `team.agents`
   `name:`) and the `AI-Model:` trailer only. The directive states only that much.
4. **Same-class addition from the W2 B1 review of task-192**: a §8 rule citing `dl-111` — a
   tool-written commit is amended with `git commit --amend --no-edit --trailer …`, never by a
   paragraph after `WingFoil-Version:`. Both halves verified, not assumed:
   - in a throw-away repository (identity passed per command, clause 5),
     `git commit --amend --allow-empty --no-edit --trailer "Co-Authored-By: X <x@y>"` on a commit whose
     last paragraph is `WingFoil-Version: 0.3.0 (abc1234)` appends the line to that paragraph
     (`git log -1 --format=%B`; git 2.43.0). Without `--no-edit` the amend opens an editor, hence
     `--no-edit` in the rule;
   - `node -e` on `dist/memory/audit.js` `parseCommitReason`: with the trailer joined, the reason is
     `"multi\nline reason."`; with a separate `Co-Authored-By:` paragraph after it, the reason is
     `"multi\nline reason.\n\nWingFoil-Version: 0.3.0 (abc1234)"` — the defect the rule prevents.

**AC classification (T1).**

| AC | Class | Why |
|---|---|---|
| 1 — directive with dl-119 clauses 1–5, closed prefix list, header citing dl-024/035/054/094 | characterization | directive prose; checked by reading against dl-119 (below) |
| 2 — dl-117 policy in the directive | characterization | prose |
| 3 — `roles.yaml` `global:` ∋ `git-conventions`, version bumped | characterization, **observed red** | the extended live-roles assertion failed until the config changed |
| 4 — workflow `dl-024` comments point to the directive, versions bumped | characterization | comments |
| 5 — `npm test` green; `directives list --role approver` shows it | characterization, **observed red** | new live test failed until the directive existed |
| 6 — dl-101 §1 allocation rule, citing dl-101 | characterization | prose |
| 7 — dl-035 merge-main points | characterization | prose; the matching `dev-loop.yaml` action is task-205's |

### red (developer)

`87b11ce7`: `test/directives/schema.test.ts` (live `roles.yaml`: `global` ⊇ … `git-conventions`) and
`test/core/directives-list.test.ts` (live listing under `--role approver` has exactly one
`git-conventions` entry, `global: true`).
`npx jest test/directives/schema.test.ts test/core/directives-list.test.ts` → **2 failed, 69 passed**
(`Received: [..., "claim-evidence"]` without `git-conventions`; no `git-conventions` entry).

### green (developer)

`39885b87`:
- `.wingfoil/directives/custom/git-conventions.md` (`kind: custom`, `scope: global`, `version: "1.0"`).
  Header names `dl-024`, `dl-035`, `dl-054`, `dl-094` (plus `dl-101`, `dl-117`, `dl-111`) as where
  each rule is argued, in `command-baseline.md`'s "ratified as … this directive is where it is met"
  form. §1 branches + the closed prefix table (`task/ design/ ingest/ fix/ docs/ qa/ backlog/`, each
  with its meaning; an ingest main always uses `ingest/`) — AC 1; §2 `dl-035` merge, no rebase, the two
  sync points (after a reject, before re-submit if `main` moved) — AC 7; §3 tag on pushed `main`; §4
  `wf()` subjects and the `→` bracket (`dl-054`, `spec-004-mcp-surface-contract` §4.3); §5 identity
  per command — AC 1; §6 `dl-101` §1 items 1–5 — AC 6; §7 `dl-117` Q1 (B), Q2 (c), past commits not
  rewritten — AC 2; §8 the `dl-111` amend rule.
- `.wingfoil/roles.yaml`: `global:` + `git-conventions`, header comment, `version: 1.2 → 1.3` — AC 3.
  The header's built-in "not yet implemented" sentence is left to task-188.
- `sw-life-cycle.yaml` (`1.0 → 1.1`) and `release-cycle.yaml` (`1.1 → 1.2`): the `dl-024` comment now
  points to the directive and no longer describes `design/` as the only phase prefix — AC 4. One bump
  each over the versions on main (`git show 0b297169:<file> | grep -m1 '^version'` → 1.2, 1.0, 1.1).
- `CLAUDE.md` §3 (custom directive list) and §7 (global row; `roles.yaml` is at v1.3).
- The red test's path expectation was wrong (`.wingfoil/directives/…`); listing paths are relative to
  `.wingfoil/` (`directives/custom/git-conventions.md`), corrected in the same commit.
- `npx jest test/directives/schema.test.ts test/core/directives-list.test.ts test/core/loaders.test.ts`
  → 102 passed. `npm run build && node dist/cli.js directives list --role approver` → exit 0, six
  entries, `git-conventions` among them with `"global": true` — AC 5. `node dist/cli.js directives list`
  → `"warnings": []`.

### refactor (developer)

No code to refactor (config and prose only). Gates, run on `39885b87`, one jest process at a time:

| Command | Result |
|---|---|
| `npm test` | exit 0 — 233 suites, 4290 tests passed |
| `npm run test:coverage` | exit 0 — 4290 passed; All files 98.99 / 96.16 / 96.08 / 99.61, equal to main's recorded `a5ef0b75` figures (dev-loop plan, B1 gates) |
| `npm run lint` | exit 0 |
| `npm run docs:api` | exit 0 |
| `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| `npx tsc -p tsconfig.build.json --noEmit` | exit 0 |
| `node scripts/check-governance.cjs --base 0b297169` | exit 0, 0 findings |

No BDD feature covers a custom directive's content; `docs/cli-reference.md` untouched (no command
changed).

### review (reviewer)

Self-review against `code-review`, `traceability`, `claim-evidence`: each AC re-read against the
directive text (mapping in green above). Clause-by-clause check against `dl-119` Decision 1–5 and Q1
(b)'s list: all seven prefixes present with meanings, the ingest-main prefix stated. `dl-117`: the
approve/reject exception, the `team.agents` name, the `AI-Model:` trailer and "past commits are not
rewritten" are all in §7. `dl-101` §1 items 1–5 are in §6 in order. Every cited element id resolves
(`ls docs/04_memory/design/dls/ | grep -E 'dl-(024|035|054|067|074|079|094|101|111|117|119)-'`; spec-004
via `ls docs/04_memory/design/specs/`). No same-class drift found in the touched files.

**Pending amendments (approver):** none.
