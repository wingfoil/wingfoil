---
id: "task-209-declare-submit-commit-what-content-carries-make-templates"
type: task
title: "Declare in `submit`'s commit what content it carries, and make the templates tell the truth about `submit`"
status: backlog
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

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
