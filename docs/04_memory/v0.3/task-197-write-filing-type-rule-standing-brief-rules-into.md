---
id: "task-197-write-filing-type-rule-standing-brief-rules-into"
type: task
title: "Write the filing-type rule and the standing brief's rules into the traceability directive"
status: approved
release: "v0.3"
kind: "feature"
priority: "medium"
tags: ["v0.3", "process", "directives", "traceability"]
ref: "dl-118"
bug: ["bug-186"]
depends_on: ["task-178-add-git-conventions-directive-id-allocation-hand-rule"]
tmpl_version: 260703
---

## Description

No rule chooses between bug, decision-log and directive change, and the rules task agents received in a standing brief live outside the repository. Both are traceability text. (`bug-166`, the `service` `release` field, is task-170's.)

## Acceptance Criteria

- (characterization) `traceability.md` gains dl-118 rules 1–3 with the `dl-060` example, citing `dl-118`; `bug-ingest.yaml` and `decision-log-ingest.yaml` `capture` descriptions each point at the rule (dl-118 (B)); versions bumped.
- (characterization) dl-102 §1 (a): every standing rule the v0.2/v0.2.2 dev-loop phase plans gave task agents is listed in Execution Notes with its source (plan path + heading) and its landing place: element filing → `traceability.md`; id allocation → `git-conventions.md` (`dl-101` §1, task-178); branch, worktree, merge → `git-conventions.md` (task-178). A rule left task-specific says why. The approver confirms the list at review.
- (characterization) dl-102 §3: `traceability.md` states that the orchestrating session writes out-of-band task criteria as `tech-lead` and backlog criteria as `product-owner`; no new role.

## Implementation Notes

- **Size:** S · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-118 ((B)); dl-102 (§1 (a), §3).
- **Features:** P3.5.
- **Notes:** Proposal key: D03. dl-102 §2 (build-backlog `checks.post`) is task-230; §4 (design check) is task-221.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

Branch `task/task-197-write-filing-type-rule-standing-brief-rules-into`, worktree `../.wf2-wt/task-197`,
cut from `main` at `b56e8721` (`git merge-base HEAD main`). Start `83c288c3`; `bug-186` synced
`planned → in-progress` at `94783c15`.

### design (architect)

**`depends_on` read (dl-015).** `task-178` (`done`, `grep -m1 '^status:'`). Its constraints on this
task: `git-conventions.md` carries the branch, sync, subject, identity, id-allocation and attribution
rules (§1–§8); its §6 item 5 already says agents do not allocate ids in parallel worktrees and report
the elements they propose. So this task states the *filing* rule in `traceability` and points to §6
for allocation rather than repeating it. `git-conventions.md` is `task-208`'s file in this batch: any
git-conventions text this task needs is proposed in the final report, not edited here.

**Decisions read** (all `ready`, `grep -m1 '^status:'` on each file): `dl-118` (approve `29d51e31`,
Reason: option (B), rule (c) in `traceability` plus a pointer in the two ingest `capture`
descriptions); `dl-102` (approve `a13dfc94`, Reason: option (a), the brief's rules move into
directives by subject); `dl-060` (the example); `dl-101`. `bug-186`'s approved triage (`0acf45ad`,
Reason): "task-197 writes the traceability rules: it states that a plan's release is the release
the plan serves, set by its author, and that amend keeps it reserved because the plan scaffold
declares it." No tech-spec governs a custom directive's prose or an ingest phase's `description`;
none is missing or needs revision. No ADR is touched.

**Scope boundaries.** `dl-102` §2 (the criterion check at `build-backlog`) is `task-230`'s; §4 (the
`design` criterion check) is `task-221`'s (task file, Implementation Notes). `roles.yaml` is `task-270`'s
in B4. `dl-118` (C) (type descriptions in `memory.yaml` and `init`'s scaffold) was not chosen, so
`src/storage/templates.ts` is untouched: its scaffolded `bug-ingest.yaml`/`decision-log-ingest.yaml`
carry no `capture` description (`sed -n 600,620p src/storage/templates.ts`).

**`bug-186` checked, not assumed.** `grep -n '^release' .wingfoil/memory/templates/plan.md` →
`release: ""  # optional — target release`. `amendReservedFields` (`src/core/memory-amend.ts`) keeps
`release` reserved for every type whose committed scaffold declares it. On a scratch clone (devloop
scratch dir, removed after), editing `dev-loop-rel-v0.3-plan`'s `release` and running
`node dist/cli.js memory amend dev-loop-rel-v0.3-plan --reason "scratch check"` under the approver's
identity (environment only, git-conventions §5) printed `error: refusing to amend
dev-loop-rel-v0.3-plan: the working-tree edit changes frontmatter field 'release', which an amendment
does not own — … release is assign's …`, exit 1. `release-planning.yaml`'s
`element.set_release` stamps "every included DL, bug, tech-spec, adr, task" (its line comment): never
a plan. The directive states that, per the triage Reason; the field is not renamed.

**Version.** `traceability.md` declares no `version` (`sed -n 1,10p`). The batch notes ask for one bump;
the precedent is `task-205`, which gave `testing.md` its first `version: "1.1"` (`52f61bd2`). Same
here: `version: "1.1"`. `bug-ingest.yaml` 1.1 → 1.2, `decision-log-ingest.yaml` 1.0 → 1.1. Decision for
the approver to confirm (doc-versioning says a document with no version is not given one to satisfy
the rule; the precedent and the batch notes say otherwise).

**AC classification (T1).**

| AC | Class | Why |
|---|---|---|
| 1 — `traceability.md` gains dl-118 rules 1–3 with `dl-060`, citing `dl-118`; both ingest `capture` descriptions point at it; versions bumped | red-first (document) | directive and config prose; a live test pins the citations and the two pointers, and fails until the text exists |
| 2 — every standing rule of the v0.2/v0.2.2 dev-loop plans listed with source and landing place | characterization | an inventory in these notes (below); the approver confirms it at review |
| 3 — the orchestrating session authors out-of-band criteria as `tech-lead`, backlog criteria as `product-owner`; no new role | red-first (document) | prose, pinned by the same test; "no new role" pinned against `dna.yaml` `team.roles` |
| `bug-186` (absorbed, dl-045; triage Reason) — a plan's `release` is the release it serves, set by its author; amend keeps it reserved | red-first (document) | prose, pinned by the same test |

**AC 2 — inventory of the standing rules in the v0.2 and v0.2.2 dev-loop plans.** Sources:
`docs/05_plans/rl-v1/rel-v0.2/dev-loop-rel-v0.2-plan.md` ("v0.2") and
`docs/05_plans/rl-v1/rel-v0.2.2/dev-loop-rel-v0.2.2-plan.md` ("v0.2.2"), read in full at `b56e8721`.
"Present" means the landing file states it today (checked with `grep -n` on the file named).

| # | Rule given to task agents | Source (plan + heading) | Landing place |
|---|---|---|---|
| 1 | **Element filing:** a task agent in a parallel worktree files no Memory element; it reports candidates and the orchestrating session files them | in **neither** plan (`grep -n -i 'file\|report' <both plans>` finds no such rule): it was in the out-of-repository brief, recorded by `dl-102` Context (`task-090`, approve `88e77bf4`) | **`traceability.md`**, this task (new section) |
| 2 | Id allocation: agents do not allocate ids in parallel worktrees | in **neither** plan (same `grep`); `dl-101` §1 item 5 states it | `git-conventions.md` §6 item 5 (`dl-101` §1, task-178) — present |
| 3 | Branch `task/{task.id}` cut from `main` | v0.2 §2 "Branch, worktree & merge"; v0.2.2 §1 "Per-task contract" (start) | `git-conventions.md` §1 — present |
| 4 | One worktree per task, removed after the merge | v0.2 §2 "Branch, worktree & merge"; v0.2.2 §1 | `git-conventions.md` — **not stated** (`grep -n worktree` finds only §2's "from inside its own worktree" and §5); declared as actions in `dev-loop.yaml` (`git.create_worktree`, `git.remove_worktree`). Text proposed to `task-208` in the report |
| 5 | Merge into `main` with `--no-ff` | v0.2 §2 "Branch, worktree & merge", §3.7; v0.2.2 §1 (done) | `git-conventions.md` §1 — present |
| 6 | `approve` and `finalize` committed on the task branch, before the merge | v0.2 §2 "Branch, worktree & merge", §3.7; v0.2.2 §1 (done) | **lands nowhere; contradicted twice.** `dev-loop.yaml` `done` (`sed -n 175,182p`) orders `memory.approve` → `git.merge` → `git.remove_worktree` → `element.set_state(done)`, i.e. finalize after the merge, while practice finalizes on the branch before it (`d4a2a1dc`, `4b80b0b2`, `a4808d1f` are off `main`'s first-parent line: `git log --first-parent main --format=%h | grep -c <sha>` → 0). And `git-conventions.md` §1 lists "the approver's `approve` and `reject` commits" among the commits made directly on `main`, while the task approve is on the branch (`1a276f87`, task-204's, is an ancestor of `1ea0c6e9^2`). A follow-up bug, filed by the coordinator |
| 7 | A failed or conflicted merge is aborted clean and the task goes back to `red` | v0.2 §2 (`dl-014` G4), §3.7 "Fallback" | `git-conventions.md` §2 (never force-resolved; aborted and recorded) — present; `dev-loop.yaml` `done` fallback |
| 8 | No task commit in the shared main working tree; `git branch --show-current` before every commit | v0.2.2 §1 (closing paragraph) | `git-conventions.md` — **not stated** (`grep -n show-current` → nothing). Text proposed to `task-208` in the report |
| 9 | Memory transition commits in the `wf({type}): {verb} {ids}` form | v0.2 §2 "Commits" | `git-conventions.md` §4 — present |
| 10 | `submit`'s subject carries no bracket | v0.2 §3.6; v0.2.2 §1 (review) | `git-conventions.md` §4 — present |
| 11 | `approve`/`reject` only on the approver's instruction; the agent never approves; the loop stops at review | v0.2 §2 "Commits"; v0.2.2 §1 (review, done), "Handoff" | not a directive rule: enforced by `dna.yaml` `team.agents[].approval_authority: false` and `memory approve`'s authority check (`requireApprovalAuthority`); `dev-loop.yaml` `review` `approval: { by_role: approver }`. Left there |
| 12 | Code commit subjects per phase: `test|feat|refactor({module}): {task.id} — …` | v0.2 §2 "Commits" | **not stated** in any directive (`code-quality.md` says only "conventional commit messages"). Branch, worktree and merge are `git-conventions`' subject; text proposed to `task-208` in the report |
| 13 | A linked bug's status follows the task, each change its own `wf(bug): sync` commit right after the task's, on the task branch | v0.2 §2 "`bug.sync_state`"; v0.2.2 §4 | `dev-loop.yaml` `bug.sync_state` actions (when); the `sync` verb is `dl-079`'s, which `git-conventions.md` §4 defers to. Left there |
| 14 | A decision-log a task absorbs (here `dl-045`, for `task-045`/`046`/`061`) is handed to the task explicitly at `design`, because `read_related` covers `depends_on` tasks only | v0.2 §2 "`bug.sync_state`" (closing paragraph) | **lands nowhere — a gap.** `dev-loop.yaml` `design` step (2) reads the Execution Notes of `depends_on` tasks only (`sed -n 100,118p .wingfoil/workflows/custom/dev-loop.yaml`); `dl-102` §4, task-221's check, compares each criterion with the bound directives and ratified specs, not with the decision-logs a task absorbs (task-221 AC 1, `grep -n "dl-102" docs/04_memory/v0.3/task-221-*.md`). The naming of three v0.2 tasks is task-specific; the rule is general. Candidate finding in the report |
| 15 | Phase → role table and the directives each loads | v0.2 §2 "Roles & directives" | configuration, not a rule: `dev-loop.yaml` `role:` and `roles.yaml`. Left there |
| 16 | Classify each AC (T1); characterization ACs need no red; never fabricate a red | v0.2 §3.2, §3.3; v0.2.2 §1 (design) | `testing.md` (T1) — present |
| 17 | Read every `depends_on` task's Execution Notes before `red` (`dl-015`) | v0.2 §3.2; v0.2.2 §1 (design) | `traceability.md` (`depends_on` bullet) — present; `dev-loop.yaml` `agent.read_related` |
| 18 | Verify the cited specs are `approved`; scaffold a missing spec | v0.2 §3.2; v0.2.2 §1 (design) | `dev-loop.yaml` `design` (`agent.verify_specs`, `tech-spec.approved`); `traceability.md` (a task cites its tech-spec) — present |
| 19 | `refactor` checks: coverage ≥ 80, `docs.api.*`, `lint.clean`, hard-reject | v0.2 §2 "Quality-gate checks", §3.5; v0.2.2 §1 | `dev-loop.yaml` `refactor` checks; `testing.md` (coverage) — present |
| 20 | Memory operations with the pinned build, never `npx wingfoil` | v0.2.2 Context | the `wingfoil-cli` directive, `task-270` (this batch, `dl-163`) — not this task's |
| 21 | Same-class stale description found at review is fixed in-task before approval | v0.2.2 "Execution Notes (close-out)" ("Standing rule learned") | **not stated** in `code-review.md` (`grep -n -i 'same.class'` finds only the re-review step for a rejected pass). Reviewer's rule; `code-review.md` is `task-208`'s in this batch: proposed in the report |
| 22 | Two open tasks never rewrite the same file (wave scheduling) | v0.2.2 §2 "Waves" | **stays in the phase plan**: a scheduling rule of the orchestrating session whose content (the shared-file table) is per release |
| 23 | Paths before and after `task-111` | v0.2.2 §3 | **task-specific**: one move, done |
| 24 | Known pitfalls of `task-111`/`112`/`113` | v0.2.2 §5 | **task-specific** |
| 25 | Per-task content in the task's Execution Notes; no per-task plan file | v0.2 §1 "How this plan is used per task"; v0.2.2 Context | **stays in the phase plan** (it says how the plan itself is used); the running-log half is in the task template's Execution Notes comment — present |
| 26 | Launch checklist and execution order | v0.2 §4, §5 | **task-specific** to that release |

The approver confirms this list at review (AC 2).

### red (developer)

`fbbcca04`: `test/directives/traceability.test.ts` (new) — the four new sections of `traceability.md`
(by heading), the cited `dl-118`, `dl-060` and `dl-102` full ids and that each element exists under
`docs/04_memory/`, the `git-conventions` §6 pointer, `tech-lead` / `product-owner` as declared
`dna.yaml` `team.roles` with no `orchestrator`, and both ingest `capture` descriptions naming
`traceability` and `dl-118` (working-tree registry, `loadWorkflowRegistry`).
`npx jest test/directives/traceability.test.ts` → **8 failed, 1 passed** (`traceability has no
section "## Which type a finding is filed as"` and the other three headings; `Expected substring:
"traceability"` for both captures). The one pass is the file-existence check, which held before.
Not asserted (testing T1, prose quality): the wording of rules 1–3 beyond their numbered headings;
the "versions bumped" part of AC 1 (checked by `grep -n '^version'` on the three files at review);
the AC 2 inventory, which the approver confirms by reading.

### green (developer)

`d9b47f3d`:
- `.wingfoil/directives/custom/traceability.md` → `version: "1.1"`, `**Date:** 2026-10-09`; the existing
  bullets unchanged under a new `## The traceability chain` heading; new sections *Which type a
  finding is filed as* (`dl-118` rules 1–3, the `dl-060` example, `dl-118` stays `ready` and is cited,
  misfiled elements stay as history), *Who files an element* (`dl-102` §1 (a); allocation pointed to
  `git-conventions` §6), *Who authors acceptance criteria* (`dl-102` §3), *A plan's `release`*
  (`bug-186`, per its triage Reason). The intro now says the filing rule is addressed to whoever files,
  through the two `capture` pointers, since `bug-ingest`'s `capture` runs as `developer`, which
  `roles.yaml` does not bind to `traceability` (`grep -n -A5 '^  developer:' .wingfoil/roles.yaml`).
- `bug-ingest.yaml` 1.1 → 1.2 and `decision-log-ingest.yaml` 1.0 → 1.1: the `capture` `description`
  points at the filing rule, with the one-line criterion for its own type and the other.
`npx jest test/directives/traceability.test.ts` → **9 passed**. `npx jest test/core/workflow
test/docs/workflow-md test/directives test/core/directive test/core/project-directives` → 569 passed
(the conformance counts are unchanged: descriptions are not checked).
No code changed: `git diff --stat b56e8721 -- src` prints nothing.

### refactor (developer)

Commands run on the branch at `d9b47f3d`, with this notes edit the only change in the working tree:
- `npm test` → 319 of 320 suites, **6060 passed, 1 failed**: `test/cli/dry-run.integration.test.ts`
  › `agentExecute` (`context pre-load failed: MCP server unreachable … Request timed out`), under load
  (`uptime` load average 13.89 right after). Re-run alone: `npx jest test/cli/dry-run.integration.test.ts
  -t agentExecute` → 1 passed. Not this task's (no `src/` change); a load flake.
- `npm run test:coverage` → 320 suites, **6061 passed**, exit 0; All files 99.2 statements / 97.03 branches / 97.48 functions / 99.67 lines, against 99.2 / 97.01 / 97.48 / 99.67 at the W3 B3 gate (the last coverage taken on `main`): not regressing.
- `npm run lint` → exit 0. `npm run docs:api` → exit 0. `npx tsc --noEmit -p tsconfig.json` → exit 0.
  `npx tsc -p tsconfig.build.json --noEmit` → exit 0.
- `node scripts/check-governance.cjs --base b56e8721` → "2 wf() commits …", 0 findings, exit 0.
- Main-sync (`dev-loop.yaml` v1.5 `refactor`): not run; the batch merges `main` at the gate, in merge
  order (B4 notes).

### review (reviewer, self-review)

Against `code-review`, `traceability`, `claim-evidence`:
- AC 1: the three rules and `dl-060` (`grep -n '^[123]\. \*\*' .wingfoil/directives/custom/traceability.md`
  → three lines), `dl-118` cited by full id, both pointers, versions (`grep -n '^version'` on the three
  files → `"1.1"`, `1.2`, `1.1`). Met.
- AC 2: the inventory above, 26 rows, each with a plan heading and a landing place; the rows landing
  nowhere yet (4, 8, 12, 21) are proposed to `task-208` in the final report, because
  `git-conventions.md` and `code-review.md` are its files in this batch; row 6 is a contradiction,
  reported as a candidate finding. The approver confirms the list.
- AC 3: *Who authors acceptance criteria*; no role added (`git diff b56e8721 -- .wingfoil/dna.yaml
  .wingfoil/roles.yaml` prints nothing). Met.
- `bug-186`: *A plan's `release`*, matching the triage Reason (`git show -s --format=%b 0acf45ad`).
  The amend refusal was reproduced (design). Met.
- Same class in the files touched: the old intro ("Applies to reviewers, architects, and product
  owners") no longer told the whole truth once the filing rule reaches `developer` through
  `bug-ingest`; rewritten. No other stale sentence found on re-reading the directive.
- No Memory element other than this task and the `bug-186` sync is edited: **Pending amendments
  (approver): none.**


### review fixes (independent review: approve with fixes, 2026-10-09)

1. *AC classification (testing T3).* A characterization test that fails on first run means the AC
   was red-first: AC 1, AC 3 and `bug-186` are relabelled **red-first (document)** above (task-205's
   precedent); AC 2 stays characterization. "Versions bumped" is listed as unasserted. The doc comment
   of `test/directives/traceability.test.ts` (line 7, "Characterization of directive and
   configuration text") is frozen since `red` and keeps the old label.
2. *`traceability.md`, "A plan's `release`".* One sentence names the correction path: a hand `assign`
   commit, `wf(plan): assign release vX to <id>` (`spec-003`'s verb table: `assign` writes `release` on
   any type; `spec-008` §2 gives the canonical subject `memory history` reads). No second version bump
   (one per branch, doc-versioning).
3. *Inventory rows 6 and 14 corrected.* Row 6 lands nowhere and is contradicted by both `dev-loop.yaml`
   `done`'s order and `git-conventions` §1 (follow-up bug for the coordinator). Row 14 now states the
   v0.2 plan's general rule (an absorbed decision-log is handed over at `design`) and records it as a
   gap: neither `design` step (2) nor `dl-102` §4 covers it.

### Retrospective

- The standing brief is still outside the repository in v0.3: this task's agent was briefed from
  instructions that no tracked file carries, while `dl-102` (ratified option (a)) moves such rules
  into directives. Evidence: the brief's "agents file no Memory element" rule had a tracked home only
  from the allocation side (`git-conventions` §6 item 5)
  before this task (`git grep -n -i 'files no Memory element' b56e8721` prints nothing). Proposal: the
  next wave's plan revision lists, per brief rule, the directive that states it.
- The planned AC 2 assumed the filing rule was in the dev-loop plans; it was in neither (only in the
  out-of-repository brief). Evidence: inventory row 1.
