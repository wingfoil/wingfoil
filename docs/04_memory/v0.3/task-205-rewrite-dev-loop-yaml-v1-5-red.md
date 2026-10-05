---
id: "task-205-rewrite-dev-loop-yaml-v1-5-red"
type: task
title: "Rewrite `dev-loop.yaml` as v1.5: `red` by `qa`, executor independence, the reject bug-sync, parking and the main-sync on resume"
status: backlog
release: "v0.3"
kind: "feature"
priority: "high"
tags: ["v0.3", "workflow", "dev-loop", "governance"]
ref: "dl-134"
bug: []
depends_on: ["task-133-bind-builtin-security-directive-role-stop-tests-pinning", "task-180-add-memory-park-declared-returns-edge-optional-per", "task-199-align-wingfoil-workflows-custom-v0-3-schema-commands"]
tmpl_version: 260703
---

## Description

The rulings that reshape `dev-loop`: `red` moves to role `qa` (black-box, and it also writes characterization tests, `dl-134` Q1 (a)); `green` `distinct_from: [red]`, `refactor` `mode: resume`, `review` `distinct_from: [red, green, refactor]`; `tests.unchanged(since: red)` declared on `green`/`refactor` (evaluated from v1.0); a fourth `bug.sync_state` so a review reject moves the absorbed bug back with the task (`dl-061` A.1); `park` keeps the branch, removes the worktree and syncs bugs `in-progress → planned` (`dl-110` P2); a resumed task merges `main` into its branch before re-submitting (`dl-035`). The rules that are not configuration go to the `testing` directive and `roles.yaml`.

## Acceptance Criteria

- (red-first) A test loads `dev-loop.yaml` v1.5 and asserts: `red.role == qa`, the three `distinct_from`/`mode` declarations above, `tests.unchanged(since: red)` in `green` and `refactor` `checks.post`, and zero load errors (task-199's test stays green).
- (red-first) `dl-061` A.1: after a `review` reject, `workflow next` reports the fallback step and a `bug.sync_state` manual action whose expected subject is `wf(bug): sync <bug> [in-review → in-progress]`; the sync's placement needs no schema change (spec-003 `fallback` has no `actions`), and where it lands (e.g. first action of `red`, idempotent on a first pass) is recorded in the header comment.
- (characterization) `dl-061` B.1/C.1: the header comment states that a sync crossing a `gates` reject edge cites the approver's reject sha, and that the reject procedure emits both commits; the same text is handed to v0.3's `user-docs` `align-agent-docs` for `CLAUDE.md` §5.1 (recorded in Execution Notes).
- (characterization) `testing` directive: the §2 freeze (files `red` touched, Q2 (a)), the §1 black-box rule for `qa` and Q1 (a); `roles.yaml` binds `code-quality`, `testing`, `determinism` to `reviewer` in addition to its own; both with `version:` bumps; `bug-112`'s de-pinned tests stay green.
- (characterization) `dev-loop.yaml` `version: 1.5` with the header history line; `WORKFLOW.md`'s dev-loop diagram shows `red` under `qa`.
- (characterization) `dl-035` (E sweep): after a reject, the resume path declares the action that merges `main` into the task branch before re-submit, citing `dl-035` (the rule text is task-178's).

## Implementation Notes

- **Size:** M · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-134 §1–§5, Actions 2, 4, 5 (config half); dl-061 A.1, B.1, C.1; dl-110 P2; dl-035 (config half, E sweep); spec-003 § Execution independence worked example.
- **Features:** P4.1, P4.15.
- **Notes:** Proposal key: A19. The stop-the-line `start.checks.pre` (`dl-133` Q4 (i)) and the other v0.3 gates (`dl-044`, `dl-097`, `dl-098`, `dl-102` §4, `dl-115`, `dl-116`) are task-221's single v1.6 revision, after this task. Coordinate with task-139 (`testing.md` T1/T2) on the same file. `dl-133`'s `kind` field is task-150.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.
- **Handover from wave 2 B2 (2026-10-05, `bug-248`).** As the next writer of `.wingfoil/directives/custom/testing.md`, add one line pointing to `security-secrets` S1 (fixtures that look like secrets are built at runtime, `task-182`), as `dl-073` Action 3 asks.

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
