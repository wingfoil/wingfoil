---
id: task-266-promote-with-an-explicit-npm-dist-tag-latest-only-for-the-highest-published-version-else-latest-x.y
type: task
title: "Promote with an explicit npm dist-tag: latest only for the highest published version, else latest-X.Y"
status: pending
release: "v0.3"
kind: "feature"
priority: "high"
tags: ["release", "publish", "npm"]
ref: "dl-159"
bug: []
depends_on: ["task-265-accept-a-release-tag-on-origin-release-x.y-matching-the-tag-s-major.minor-in-the-publish-gate", "task-238-publish-mcp-registry-github-actions-bound-publish-job", "task-244-publish-release-test-results-coverage"]
tmpl_version: 261006   # Orignal template version
---

## Description

`dl-159` Decision 6: a version lower than the highest published one never becomes `latest`; it is published under
`latest-X.Y`. Job `promote` names no dist-tag today: `npm stage publish ./dist-pack/*.tgz --provenance --access
public` (read at `5017321c`, pinned by `test/cli/publish-pipeline.test.ts`). npm's client already refuses the
dangerous case — `lib/commands/publish.js` throws "Cannot implicitly apply the "latest" tag because previously
published version … is higher than the new version …" when no `--tag` is given, and `npm stage publish` inherits it
(`class StagePublish extends Publish`), read in npm 11.19.0 (bundled with the `PROMOTE_NODE_VERSION` Node 24.21.0),
11.20.0 and 12.1.0 — so a `0.3.1` after `0.4.0` would fail at promote rather than publish. The task makes the
dist-tag explicit and correct in both directions, and checks that the MCP Registry listing follows the same order.

## Acceptance Criteria

- (red-first) A pure function with unit tests (a script under `scripts/`, with its `.d.cts`) chooses the dist-tag
  from the version and the list of published versions: `latest` when the version is greater (semver) than every
  published version, otherwise `latest-X.Y`. Cases: `0.3.1` over `[0.3.0]` → `latest`; `0.3.1` over
  `[0.3.0, 0.4.0]` → `latest-0.3`; `0.4.0` over `[0.3.0, 0.3.1]` → `latest`; a version already in the list or a
  prerelease → an error naming it.
- (red-first) `promote` reads the published versions (`npm view wingfoil versions --json`; a package with no
  versions is not a case here, `wingfoil` exists), runs that function, and passes the result with an explicit
  `--tag` to `npm stage publish`; `test/cli/publish-pipeline.test.ts` is updated first and asserts `--tag` is
  present and that the step hard-codes no literal `latest`. The step keeps `set +x` first and `if: ${{ !env.ACT }}`.
- (characterization) Design question, settled with a source or recorded as open: whether the `--tag` given to
  `npm stage publish` is the dist-tag the version receives on `npm stage approve`, and whether staged but
  unapproved versions count in "published" (`npm view … versions`). The finding, its source and the npm version it
  was read under go in Execution Notes (`documentation` D4); if it cannot be settled offline, the approver checks
  `npm view wingfoil dist-tags` after approving `0.3.0` and the result is recorded at release-publishing.
- (characterization) MCP Registry: how the registry marks the latest version of `io.github.wingfoil/wingfoil`
  (`server.json`, published by `task-238`'s `mcp-registry` job) is read from its documentation; if publishing a
  `0.3.x` after a `0.4.x` would advertise the older one as latest, the `mcp-registry` job gains the condition
  design picks (skip for a non-`latest` dist-tag, or a declared flag), pinned in `publish-pipeline.test.ts`;
  otherwise the Execution Notes cite the rule that makes it safe.
- (characterization) The `publish.yml` header runbook (step 6) says to read the dist-tag in `npm stage view` before
  approving and `npm view wingfoil dist-tags` after; `spec-015` §3 stage 4 is amended with a dated Revision note
  (pending amendment with its proposed `--reason`).

## Implementation Notes

- **kind:** feature · **wave:** 3, batch B9 (added on 2026-10-07 by `decision-log-ingest-rel-v0.3-parallel-release-lines-plan`).
  Size: S.
- **Implements:** `dl-159` Decision 6 and Action A1.2; `spec-015` §3 stage 4 (amendment).
- **Files:** `.github/workflows/publish.yml` (promote step, possibly the `mcp-registry` job's condition, header),
  a new `scripts/*.cjs` + `.d.cts` and its test under `test/cli/`, `test/cli/publish-pipeline.test.ts`,
  `spec-015` (§3 stage 4 Revision note).
- **Order:** after `task-265` (same file, same batch) and `task-238` (the `mcp-registry` job) and `task-244` (last
  earlier writer of `publish.yml`). Before `task-267` on `spec-015`: each adds its own Revision note.
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
