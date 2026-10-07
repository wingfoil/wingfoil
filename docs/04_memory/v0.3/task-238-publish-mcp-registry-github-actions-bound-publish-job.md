---
id: "task-238-publish-mcp-registry-github-actions-bound-publish-job"
type: task
title: "Publish to the MCP Registry from GitHub Actions, bound every publish job in time, and fix the publish runbook"
status: backlog
release: "v0.3"
kind: "fix"
priority: "high"
tags: ["v0.3", "process", "publishing", "mcp", "visibility"]
ref: "dl-130"
bug: ["bug-060", "bug-173", "bug-174"]
depends_on: ["task-229-create-github-release-once-npm-has-version-sweep"]
tmpl_version: 260703
---

## Description

The first registry publish was refused (403): the registry's OAuth app cannot see the `wingfoil` org. Authenticating with `mcp-publisher login github-oidc` from this repository's workflow grants `io.github.wingfoil/*`. The runbook misses where npm's Staged Packages tab is and the automated-review state; the `act` recipe does not work from a worktree.

## Acceptance Criteria

- (red-first) an `mcp-registry` job runs only after `promote` **and** once the version is live on npm (the registry validates the npm package's `mcpName`; same wait as task-229), with `id-token: write` scoped to that job; `mcp-publisher` downloaded at a pinned version with a checksum check; pinned in `publish-pipeline.test.ts`.
- (characterization) `mcp-publisher validate` passes on `server.json` (output in Execution Notes).
- (characterization) post-merge, approver: after the next publish, `curl "https://registry.modelcontextprotocol.io/v0/servers?search=io.github.wingfoil/wingfoil"` lists the version; the listing is registered as a `service` (`kind: listing`) via `service-ingest`.
- (characterization) bug-174: the runbook (publish.yml header step 6 and `release-publishing.yaml` `publish` description) names the account menu → Staged Packages, the automated-review state that precedes Approve, and `npx -y npm@<version> stage approve <id>` for npm ≥ 11.15.0.
- (characterization) bug-060: the `act` recipe states it cannot run from a git worktree and why.
- (red-first) A test parses `.github/workflows/publish.yml` and asserts every job under `jobs:` (the new `release` and `mcp-registry` jobs included) has a positive integer `timeout-minutes`; the values and their source (task-077's measured table: gate 15, stage 20, promote 30, re-sized for `promote`'s environment wait) are in the header comment (dl-057 (b), from proposal E2).
- (red-first) dl-057 (d): either `scripts/check-release-tag.cjs` refuses a lightweight tag (`git cat-file -t "refs/tags/$GITHUB_REF_NAME"` = `tag`, tested on a fixture repo holding one lightweight and one annotated tag), or — if the v0.2.x run logs show checkout makes the check moot — `spec-015` §4 drops "annotated" through a dated Revision note (then this criterion is characterization); the Execution Notes cite the v0.2.2 run log (from proposal E2).

## Implementation Notes

- **Size:** M · **wave:** 3 · **kind:** fix (`dl-133` Q1 (b)).
- **Implements:** dl-130 step 2; dl-093 point 6; dl-057 (b) option 1 and (d) — merged from proposal E2 (approve `0924712d`; task-078 AC12).
- **Features:** P5.2.1.
- **Planning ruling:** Approver ruling 2026-09-30 (plan R20, Q3): the registry job waits for the version to be live on npm with a bounded poll (`npm view wingfoil@<version>`, a declared timeout), not with a second environment approval.
- **Notes:** Proposal key: D24 (merged: E2). Merged with proposal E2 (`dl-057` (b)/(d)): both edit `.github/workflows/publish.yml`. `npm run check:mcp` and the existing publish-pipeline tests stay green; `act` is not required.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.
- **Handover from the parallel-release-lines decision (2026-10-07):** `dl-159` (`in-discussion`, to be ratified before the
  `v0.3.0` tag) opens `release/X.Y` maintenance lines beside `main`: patches land on `release/X.Y` and are merged
  forward into `main` with `--no-ff`, never cherry-picked or back-merged; patch tags go on the pushed `release/X.Y`.
  `task-265` (B9) extends `scripts/check-release-tag.cjs`, or a sibling, with the line check (`origin/main` or
  `origin/release/X.Y`, `X.Y` from the tag): keep the lightweight-tag refusal its own exported function and leave
  the gate's "Tag commit is on main" a single step `task-265` replaces. `task-266` (B9) decides whether the
  `mcp-registry` job skips or flags a version that is not `latest`, so the listing never advertises a 0.3.x over a
  0.4.x: give the job one `if:` it can extend, record in Execution Notes what you read about how the Registry marks
  a server's latest version, and wait for the exact version on npm, not `wingfoil@latest`. Do not hard-code `latest`
  anywhere in the job.

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
