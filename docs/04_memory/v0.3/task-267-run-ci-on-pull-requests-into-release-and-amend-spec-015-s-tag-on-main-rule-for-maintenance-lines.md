---
id: task-267-run-ci-on-pull-requests-into-release-and-amend-spec-015-s-tag-on-main-rule-for-maintenance-lines
type: task
title: "Run CI on pull requests into release/** and amend spec-015's tag-on-main rule for maintenance lines"
status: backlog
release: "v0.3"
kind: "feature"
priority: "high"
tags: ["release", "ci"]
ref: "dl-159"
bug: []
depends_on: ["task-207-drive-e2e-smoke-through-fresh-project-use-scenario", "task-265-accept-a-release-tag-on-origin-release-x.y-matching-the-tag-s-major.minor-in-the-publish-gate"]
tmpl_version: 261006   # Orignal template version
---

## Description

`dl-159` makes `release/X.Y` a line that receives pull requests and patch tags. `.github/workflows/ci.yml` runs
on `push` to `'**'` (which already includes `release/**`) but on `pull_request` only into `main` ("the one branch
releases are cut from", its header), pinned by `test/cli/ci-workflow.test.ts` (`expect(parsed.on.pull_request)
.toEqual({ branches: ['main'] })`). Its concurrency group spares only `main` from cancellation. `spec-015`
(`approved`) §3 stage 4 ends "Triggered on a `vX.Y.Z` tag on `main`" and §4 says the tag is created "on `main`".
The npm side must also accept a tag pushed from `release/*`.

## Acceptance Criteria

- (red-first) `ci.yml` `on.pull_request.branches` is `['main', 'release/**']`; `on.push` stays `{ branches: ['**'] }`;
  `test/cli/ci-workflow.test.ts` ("triggers on a push to any branch and on a pull request to main — and on nothing
  else") is updated first.
- (red-first) The concurrency group treats a push to `refs/heads/release/*` as it treats `main` — one group per
  commit, never cancelled — pinned in `ci-workflow.test.ts`; or design records why not, and the criterion becomes
  characterization of the unchanged group.
- (characterization) The `ci.yml` header (*Trigger*, *Concurrency*) names both lines and cites `dl-159`; the
  e2e-smoke job `task-207` added runs under the same triggers with no change of its own.
- (characterization) `spec-015` §3 stage 4 and §4 amended (dated Revision note, pending amendment with its proposed
  `--reason`): a minor tag `vX.Y.0` on the pushed `main`, a patch tag on the pushed `release/X.Y`, the gate
  accepting either (`task-265`).
- (characterization) Approver's external check, recorded in Execution Notes (the agent changes no setting): GitHub
  → Settings → Environments → `npm-publish`, the deployment rule ("deployment tags are restricted to `v*`",
  `publish.yml` header step A) admits a `v0.3.1` tag regardless of its branch; npmjs.com → `wingfoil` → Trusted
  publishing keys on organisation, repository, workflow `publish.yml` and environment `npm-publish`, not on a
  branch. Expected to hold for both (neither rule names a branch); not verified here.

## Implementation Notes

- **kind:** feature · **wave:** 3, batch B9 (added on 2026-10-07 by `decision-log-ingest-rel-v0.3-parallel-release-lines-plan`).
  Size: S.
- **Implements:** `dl-159` Action A1.3; `spec-015` §3 stage 4 and §4 (amendment; `dl-074`'s pushed-ref precondition
  extended to `release/X.Y`).
- **Files:** `.github/workflows/ci.yml`, `test/cli/ci-workflow.test.ts`, `spec-015` (Revision note).
- **Order:** after `task-207` (B3, adds the smoke job to `ci.yml`) and `task-265` (the gate the amendment
  describes); last writer of `spec-015` in B9, after `task-266`.
- **Gating:** do not start before `dl-159` is `ready` (the approver ratifies it before the `v0.3.0` tag). This task
  must be in the tree `v0.3.0` is cut from: GitHub Actions runs the workflow files of the triggering commit
  (`ci.yml` for a pull request into `release/0.3`, `publish.yml` for its tag), so without it, and without `task-265`
  and `task-266`, `0.3.1` could not be built and published from `release/0.3` (which `dl-159` forbids back-merging
  into); the `v0.3.0` publish, on the `main` path, exercises the pipeline first.
- **Approver rulings (2026-10-07, at the filing of `dl-159`).** `ci.yml`'s concurrency group protects `release/*` runs from cancellation exactly as it protects `main`'s (no longer optional). The external check that the `npm-publish` environment and the npm trusted publisher accept a tag pushed from `release/*` is the approver's, at this task's review; the developer writes the exact steps in Execution Notes. Whether `npm stage approve` keeps the staged `--tag` (task-266) is checked with `npm view wingfoil dist-tags` after `0.3.0` is approved, if not settled earlier.

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: on a pass after a reject, REQUIRED (dl-098 (b)): one line per item of the previous
       reject's `Reason:` (read with `wingfoil memory history <task-id>`), each with the command that
       shows it resolved and what that command printed; then what else changed on the next pass. -->
