---
id: "task-208-enforce-governance-check-ci-hooks-branch-protection-advisory"
type: task
title: "Enforce the governance check in CI, with hooks, branch protection and the advisory lints"
status: backlog
release: "v0.3"
kind: "feature"
priority: "high"
tags: ["v0.3", "process", "governance", "ci"]
ref: "dl-103"
bug: ["bug-192", "bug-218"]
depends_on: ["task-139-extend-documentation-doc-versioning-testing-directives-ratified-clauses", "task-167-build-governance-check-over-pushed-wf-commits", "task-201-add-claim-rerun-rereview-items-code-review-task"]
tmpl_version: 260703
---

## Description

`governance.yml` runs task-167 on push/PR to `main`; a tracked hook directory runs the same script locally; branch protection makes it binding. The claim-shape lint (dl-097 (b)) runs warn-only;

## Acceptance Criteria

- (characterization) `.github/workflows/governance.yml` on push and pull_request to `main`, SHA-pinned, read-only permissions; a test pins trigger and steps.
- (characterization) a tracked hooks directory (`core.hooksPath` opt-in, documented in `git-conventions.md`) runs the same script.
- (red-first) the claim lint flags a state-claim phrase with no command in the same item, and an empty-output block with no positive case; warn-only (exit 0 with annotations); fixtures.
- (characterization) `code-review.md` states policy (i): no gated transition by an unattended run.
- (characterization) approver, in session: branch protection on `main` requiring the check, recorded as a `service` element through `service-ingest` (`kind: setting`, `verify:` a `gh api` command).

## Implementation Notes

- **Size:** M · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-103 §1 (A)+(C) with (B), §2 (i); dl-097 (b) warn-only lint; dl-099 §4 (c) host.
- **Features:** P4.14.
- **Planning ruling:** Approver ruling 2026-09-30 (plan R19): `dl-103` §2 (iii), signed approvals, is out of v0.3 (v0.4 at the earliest, possibly v1.0).
- **Notes:** Proposal key: D22. dl-103 §2 (iii) signed approvals was to be "evaluated at v0.3 planning"; the plan records no evaluation — the approver should rule (recommend: defer to v0.4) at commit-backlog. The config version-bump check (`bug-143`) is task-183's `test/lint/` suite, which `governance.yml` runs with the rest of the suite.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.
- **Handover from wave 1 B2 (2026-10-02, `task-167`'s independent review).** `scripts/check-governance.cjs` needs `fetch-depth: 0` (in a shallow clone the introduction commit is not found and every fetched commit is gated) and `npm ci && npm run build` first (it loads `dist/`, exit 2 without it). Its introduction commit is computed as the first-parent commit that added the script, the merge `fcd43569` on `main`, so no `--introduced-at` is needed. Exit codes: 0 history only, 1 a gated finding, 2 failure to run. A full-history run takes about 6 minutes; a push range is cheap. Open follow-ups that change what it checks: `bug-192` (verb/edge pairing) and `dl-139` (status changes outside `wf()` commits).
- **dl-139 ratified (2026-10-02), option (a).** The check also fails a gated commit that is not a `wf()` operation yet changes a Memory document's `status`; it lands with this task, together with `bug-192`.

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
