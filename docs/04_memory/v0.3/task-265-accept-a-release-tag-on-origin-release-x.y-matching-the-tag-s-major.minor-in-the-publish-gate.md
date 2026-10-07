---
id: task-265-accept-a-release-tag-on-origin-release-x.y-matching-the-tag-s-major.minor-in-the-publish-gate
type: task
title: "Accept a release tag on origin/release/X.Y matching the tag's major.minor in the publish gate"
status: pending
release: "v0.3"
kind: "feature"
priority: "high"
tags: ["release", "publish", "ci"]
ref: "dl-159"
bug: []
depends_on: ["task-244-publish-release-test-results-coverage", "task-238-publish-mcp-registry-github-actions-bound-publish-job", "task-229-create-github-release-once-npm-has-version-sweep"]
tmpl_version: 261006   # Orignal template version
---

## Description

`dl-159` opens a maintenance line `release/X.Y` beside `main` and puts a patch tag `vX.Y.Z` on the pushed
`release/X.Y`. The `publish.yml` gate refuses such a tag: its step "Tag commit is on main (dl-024)" runs
`git merge-base --is-ancestor "$GITHUB_SHA" origin/main` (read at `5017321c`), and a fix on `release/0.3` reaches
`main` only by the later merge forward. The gate must accept a tag whose commit is on `origin/main` **or** on
`origin/release/X.Y`, where `X.Y` is the tag's own major.minor, and keep refusing everything else (a tag cut on a
`design/*` or `task/*` branch, or a `v0.4.1` on `release/0.3`), which is what `dl-024` decision 2 and `adr-009`
clause 1 rely on.

## Acceptance Criteria

- (red-first) The decision is a pure, offline function with unit tests — in `scripts/check-release-tag.cjs`
  (present since `task-115`, possibly extended by `task-238`), or a sibling script if design prefers — that maps a
  release tag to the remote refs it may sit on: `v0.3.1` → `origin/main`, `origin/release/0.3`; it refuses a tag
  that is not `vX.Y.Z` (`RELEASE_TAG`) with the existing message.
- (red-first) A fixture-repository test (a throw-away repository with a bare `origin`, identity passed per command,
  `git-conventions` §5) runs the gate's check and asserts: a tag on a commit of `origin/main` passes; `v0.3.1` on a
  commit only on `origin/release/0.3` passes; `v0.4.1` on that same commit fails (major.minor mismatch); a commit
  only on a `design/*` branch fails; with no `origin/release/0.3` at all the check falls back to `origin/main`
  alone and still passes or fails on it. A failure names every ref it checked.
- (red-first) `publish.yml` `gate` runs that check as **one** step (renamed to name both lines and cite `dl-159`),
  fetching `main` and, when it exists on the remote, `release/X.Y` with `--no-tags`; `test/cli/publish-pipeline.test.ts`
  ("gate asserts tag-on-main + tag↔version, …", the assertion on
  `git merge-base --is-ancestor "$GITHUB_SHA" origin/main`) is updated first to pin the new step, and still pins
  its position before the version check, `npm ci` and `prepublishOnly`.
- (characterization) The `publish.yml` header (the *Trigger* paragraph, runbook step 5, and the `act` note "The
  gate's "tag is on main" check …") states both lines. `spec-015` §4 is amended by `task-267` (same batch), which
  this task's Execution Notes name.
- (characterization) Post-merge, approver: the `v0.3.0` publish run's gate passes on the `main` path; the run
  URL is recorded in this task's Execution Notes at release-publishing.

## Implementation Notes

- **kind:** feature · **wave:** 3, batch B9 (added on 2026-10-07 by `decision-log-ingest-rel-v0.3-parallel-release-lines-plan`;
  B9 is the last batch of v0.3, after B8 and before `release-submit`). Size: S.
- **Implements:** `dl-159` Decision 4 and Action A1.1; `dl-024` decision 2, `dl-074`, `adr-009` clause 1 (kept).
- **Files:** `.github/workflows/publish.yml` (gate step + header), `scripts/check-release-tag.cjs` and
  `scripts/check-release-tag.d.cts` (or a sibling script), `test/cli/check-release-tag.test.ts`,
  `test/cli/publish-pipeline.test.ts`.
- **Order:** after `task-229`, `task-238` and `task-244`, the earlier writers of `publish.yml` (chain 229 → 238 →
  244); `task-238` may change `check-release-tag.cjs` (lightweight-tag refusal). First of B9: `task-266` and
  `task-267` depend on it.
- **Gating:** do not start before `dl-159` is `ready` (the approver ratifies it before the `v0.3.0` tag). This task
  must be in the tree `v0.3.0` is cut from: GitHub Actions runs the `publish.yml` of the tagged commit, so without
  it `0.3.1` could not be published from `release/0.3` (which `dl-159` forbids back-merging into); the `v0.3.0`
  publish, on the `main` path, exercises it first.

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: on a pass after a reject, REQUIRED (dl-098 (b)): one line per item of the previous
       reject's `Reason:` (read with `wingfoil memory history <task-id>`), each with the command that
       shows it resolved and what that command printed; then what else changed on the next pass. -->
