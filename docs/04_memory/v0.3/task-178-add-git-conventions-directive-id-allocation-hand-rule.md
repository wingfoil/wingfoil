---
id: "task-178-add-git-conventions-directive-id-allocation-hand-rule"
type: task
title: "Add the git-conventions directive with the id-allocation hand rule and the AI attribution policy"
status: in-progress
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

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
