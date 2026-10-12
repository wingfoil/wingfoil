---
id: "task-238-publish-mcp-registry-github-actions-bound-publish-job"
type: task
title: "Publish to the MCP Registry from GitHub Actions, bound every publish job in time, and fix the publish runbook"
status: done
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

Branch `task/task-238-publish-mcp-registry-github-actions-bound-publish-job`, worktree `../.wf2-wt/task-238`, cut
from `main` `0671d035` (W3 B6). Start `19f82747`; bug syncs `d822a5bd` (bug-060), `58a40f43` (bug-173),
`12d3c2fb` (bug-174).

### design (architect)

**`depends_on` read (dl-015).** `task-229` is `done` (`grep -m1 '^status' docs/04_memory/v0.3/task-229-*.md`).
Its notes bear on this task in four places: the reusable `scripts/wait-npm-version.cjs` (exact version, never
`@latest`; E401/E403 fail at once; each call bounded); the `release` job's poll bounds (330 min inside
`timeout-minutes: 345`, below the hosted runner's 6 h job cap) with recovery by "Re-run failed jobs"; the
`act` skips (`if: ${{ !env.ACT }}`); and `release-publishing.yaml` 1.5, whose `publish.checks.post[0]` prose is
pinned by `test/core/workflow-repository-conformance.test.ts`, so extending that same prose keeps spec-017 §12's
counts. Its spec-015 §3 stage 5 amendment is on main (`grep -n "^5\. \*\*release\*\*"
docs/04_memory/design/specs/spec-015-packaging-publishing.md` → line 174).

**Specs and decisions.** `spec-015` is `approved`, `dl-130` `ready` (Q1–Q4 (a)), `dl-057` `ready`, `dl-093`
`ready`, `adr-011` `accepted`; `dl-159` is `in-discussion`: its handover is honoured, not implemented
(`grep -m1 '^status'` on each). No BDD scenario covers publishing (`grep -rli "mcp registry\|publish.yml"
docs/02_requirements/02_bdd/features` → nothing).

**What the Registry needs (read 2026-10-11 from `modelcontextprotocol/registry` at tag `v1.8.1`).**
- `docs/modelcontextprotocol-io/github-actions.mdx`: OIDC is the recommended CI route — `permissions:
  id-token: write`, then `mcp-publisher login github-oidc` and `mcp-publisher publish`; its example installs
  the binary from `releases/latest` with no checksum, which this task does not copy.
- `internal/api/handlers/v0/auth/github_oidc.go` `buildPermissions`: an OIDC token is granted
  `io.github.<repository_owner>/*`. The owner of this repository is the organisation `wingfoil`, so the token
  carries `io.github.wingfoil/*` with no OAuth app in between: that is bug-173's fix.
- `docs/modelcontextprotocol-io/package-types.mdx`: for npm, ownership is `mcpName` in the published
  `package.json`, so the registry publish can only succeed once npm serves the version (hence the wait).
- **How the Registry marks "latest" (dl-159 handover, for task-266):** `versioning.mdx` — "the MCP Registry
  will attempt to parse its version as a semantic version string for sorting purposes, and will mark the
  version as "latest" if appropriate"; a non-semver version is always marked latest, and a prerelease
  published after its release is not. So a semver `0.3.x` published after `0.4.0` sorts below it and is not
  marked latest by the Registry itself; whether to skip such a publish anyway stays task-266's call.

**Design.**
- **D1 — `mcp-registry` job, `needs: promote`, its own bounded wait.** Same wait as `release`
  (`node scripts/wait-npm-version.cjs "$GITHUB_REF_NAME" --timeout-minutes 330 --interval-seconds 60`,
  `timeout-minutes: 345`). It does not need `release`: a missing CHANGELOG section must not block the listing,
  and the two jobs poll in parallel. `permissions: { contents: read, id-token: write }` on this job alone
  besides `promote`; no `environment:` (the npm approval already gates "live on npm", which the wait reads).
- **D2 — one job-level `if:` for task-266:** `if: ${{ needs.promote.result == 'success' }}` — redundant with
  `needs` today, written so task-266 appends its "is this the newest version" clause to one expression. No
  `latest` anywhere in the job (pinned).
- **D3 — `mcp-publisher` pinned and checksum-verified.** Job env `MCP_PUBLISHER_VERSION: '1.8.1'` and
  `MCP_PUBLISHER_SHA256` = the `mcp-publisher_linux_amd64.tar.gz` line of the release's
  `registry_1.8.1_checksums.txt`; the step downloads that exact asset with `curl -fsSL` into
  `$RUNNER_TEMP`, runs `sha256sum --check --strict` before extracting, and extracts only `mcp-publisher`.
  The SHA is frozen in the test like the action pins, so a version moved without redoing the lookup fails.
- **D4 — order:** install → `mcp-publisher validate server.json` → wait → `login github-oidc` → `publish
  server.json`. Validation runs before the hours of polling, like the CHANGELOG extraction in `release`
  (task-229 D2); `validate` does not need the npm version to exist (checked: a copy of `server.json` with
  version `9.9.9` validates, see AC 2). The wait, login and publish are skipped under `act` (no OIDC issuer).
- **D5 — `timeout-minutes` on every job:** gate 15, stage 20, promote 30 (task-077's table, `docs/04_memory/
  v0.2/task-077-first-real-staging-run.md` "Suggested `timeout-minutes`"), release and mcp-registry 345.
  "Re-sized for promote's environment wait": the v0.2.2 run shows the wait is **outside** the job's run
  time — `gh api repos/wingfoil/wingfoil/actions/runs/36627583940/jobs` → promote `created_at`
  20:39:07Z, `started_at` 20:40:58Z (after the `npm-publish` approval), `completed_at` 20:41:14Z — so 30
  minutes bounds 16 s of work and is not raised for human latency. Measured on the same run: gate 1m22s,
  stage 42s (v0.2.1 run `36402219753`: gate 1m46s, stage 37s, promote 17s after a 1m37s wait). Decision for
  the approver (D5). *Review (F1, 2026-10-11): gate raised to 30, see "review fixes".* The reviewer confirmed
  the wait from the deployment: `6744965514` statuses waiting 20:39:08Z → queued 20:40:56Z → in_progress
  20:40:59Z, job start 20:40:58Z.
- **D6 — dl-057 (d): the check is NOT moot; option 1.** The v0.2.2 gate log (`gh api
  repos/wingfoil/wingfoil/actions/jobs/109608425923/logs`) shows `actions/checkout` (fetch-depth 0) run
  `git fetch … origin +refs/heads/*:refs/remotes/origin/* +refs/tags/*:refs/tags/*`, `* [new tag] v0.2.2 ->
  v0.2.2`, then `git rev-parse refs/tags/v0.2.2^{commit}` and check out `refs/tags/v0.2.2`: the local tag ref is
  the remote one, so its object type is the pushed tag's (the stage job, depth 1, fetches `+refs/tags/v0.2.2:
  refs/tags/v0.2.2` too, job `109608986921`). Locally `git cat-file -t v0.2.2` → `tag` (v0.2.0, v0.2.1 too).
  So `scripts/check-release-tag.cjs` gains an exported `checkAnnotatedTag(tag, objectType)` and
  `tagObjectType(root, tag)` (`git cat-file -t refs/tags/<tag>`), run by a **new, separate** gate step
  `node scripts/check-release-tag.cjs --annotated "$GITHUB_REF_NAME"` — separate because the existing
  invocation also runs where no tag exists (`test/cli/publish-metadata.test.ts` spawns it on this tree), and so
  "Tag commit is on main" stays one untouched step for task-265. spec-015 §4 keeps "annotated" and records that
  the gate enforces it (pending amendment).
- **D7 — runbook (bug-174, bug-060, bug-173).** Step 6 names the account menu → Staged Packages, the
  "automated review" state that comes first, and `npx -y npm@<version> stage approve <stage-id>`; a new step 8
  explains the `mcp-registry` job and its re-run recovery, after task-229's step 7; the `act` section says it
  cannot run from a `git worktree` (`.git` is a file naming a host path the container does not mount) and to
  clone first. `release-publishing.yaml` 1.5 → 1.6: the `publish` description carries the same npm wording
  and names the registry job; `checks.post[0]` prose gains "and its MCP Registry listing published" (same
  prose check, counts unchanged; conformance pin updated).
- **Not done here:** AC 3 (R3, approver ruling 2026-10-11) — deferred to v0.3's release-publishing; handover
  below.

**AC classification (T1).** Corrected from the planning labels where the text or config is new — each row
names the grep that shows it (task-219/task-229 precedent).

| AC | Class | Why |
|---|---|---|
| 1 — `mcp-registry` job after promote + npm wait, `id-token: write` scoped, pinned + checksummed `mcp-publisher` | red-first | new job; `test/cli/publish-pipeline.test.ts` (shape, and the install step run with a fake `curl`) |
| 2 — `mcp-publisher validate` passes on `server.json` | characterization | behaviour of the existing file; output recorded below (R2) |
| 3 — registry `curl` + `service` `kind: listing` | deferred (R3) | post-merge, approver; handover |
| 4 — bug-174 runbook + `publish` description | **red-first** (planned: characterization) | the wording does not exist (`grep -n "account menu\|automated review" .github/workflows/publish.yml .wingfoil/workflows/custom/release-publishing.yaml` → nothing) |
| 5 — bug-060 `act` from a worktree | **red-first** (planned: characterization) | `grep -n worktree .github/workflows/publish.yml` → nothing |
| 6 — `timeout-minutes` on every job | red-first | only `release` declares one (`grep -n "^    timeout-minutes" .github/workflows/publish.yml` → line 239) |
| 7 — dl-057 (d) lightweight-tag refusal | red-first | the run log shows the check is meaningful (D6); `test/cli/check-release-tag.test.ts` on a fixture repo |

**Evidence for AC 2 (R2).** `mcp-publisher` 1.8.1 (`gh release download v1.8.1 -R modelcontextprotocol/registry
-p registry_1.8.1_checksums.txt -p mcp-publisher_linux_amd64.tar.gz`, i.e.
https://github.com/modelcontextprotocol/registry/releases/download/v1.8.1/mcp-publisher_linux_amd64.tar.gz) into
`../.wf2-wt/devloop-kit/task-238-scratch/mcp-publisher-v1.8.1/` (not in the repository, not on PATH).
`sha256sum --ignore-missing -c registry_1.8.1_checksums.txt` → `mcp-publisher_linux_amd64.tar.gz: OK`
(`a06c9096dcb9727c13555b6be26c7effa707b01f06a4c561ba7a3635443cf2cc`); `./mcp-publisher --version` →
`mcp-publisher 1.8.1 (commit: f52dc8525a441a3abf5fedc9912152d95af5aab1, built: 2026-08-06T23:36:13Z)`. On a copy
of this branch's `server.json` (`0.2.2`): `mcp-publisher validate` → `Validating against
https://registry.modelcontextprotocol.io...` / `✅ server.json is valid`, exit 0 (also with the explicit path
argument). With every version rewritten to `9.9.9`: the same output, exit 0 — validation does not read npm.
Registry state on 2026-10-11T19:47Z: `curl -s
"https://registry.modelcontextprotocol.io/v0/servers?search=io.github.wingfoil/wingfoil"` →
`{"servers":[],"metadata":{"count":0}}`.

### red (qa)

`27fa78cd`: `test/cli/publish-pipeline.test.ts` — the job chain gains `mcp-registry` (`needs: promote`); the
`id-token: write` case now names promote and mcp-registry as the only holders; the gate order gains
`check-release-tag.cjs --annotated`; new blocks `mcp-registry job (task-238)` (the `if:`, step order, the wait
equal to release's, the pinned version + SHA-256 frozen as `MCP_PUBLISHER`, act skips, no secret/environment,
runbook step 8 after step 7, and the install step executed with bash and a fake `curl` serving a locally built
archive: match → only the binary unpacked; mismatch → non-zero, nothing unpacked), `job timeouts (task-238)`
(every job a positive integer ≤ 360; the header names `<job> <minutes>` for each job, and task-077, dl-057),
`publish runbook (task-238)` (step 6 and the `publish` phase description for bug-174; the `act` worktree caveat
for bug-060). `test/cli/check-release-tag.test.ts` — `checkAnnotatedTag` cases, and a fixture repository
(`makeTempGitRepo`, `tag.gpgSign false`) holding the lightweight `v0.0.1` and the annotated `v0.0.2`:
`tagObjectType` → `commit` / `tag` / `undefined`, and the `--annotated` CLI spawned in that checkout → exit 0 /
1 / 1. `test/core/workflow-repository-conformance.test.ts` — the `publish` post-check prose names the listing.
`npx jest test/cli/publish-pipeline.test.ts test/cli/check-release-tag.test.ts
test/core/workflow-repository-conformance.test.ts --maxWorkers=2` → **3 suites failed; 25 failed, 51 passed /
76**. One new case passed in red for an empty reason: "fails before unpacking when the archive does not match"
ran `exit 99` (no install step yet); in green it runs the real step (it passes with the step's
`sha256sum --check --strict` refusing, `existsSync(<runner-temp>/mcp-publisher)` false).

### green (developer)

`0848c5e5`:
- `.github/workflows/publish.yml`: `mcp-registry` job (D1–D4); `timeout-minutes` 15 / 20 / 30 on gate, stage,
  promote (D5); gate step `Tag is annotated (spec-015 §4, dl-057 (d))` after the version check, "Tag commit is
  on main" untouched (D6); header — the stage list, a *Job timeouts* section, runbook step 6 rewritten and step
  8 added, the `act` worktree caveat (D7).
- `scripts/check-release-tag.cjs` (+ `.d.cts`): `checkAnnotatedTag`, `tagObjectType` (`execFileSync('git',
  ['-C', root, 'cat-file', '-t', 'refs/tags/<tag>'])`, no shell), `--annotated <tag>` mode on `process.cwd()`;
  the version-check mode behaves as before (`npx jest test/cli/publish-metadata.test.ts` green, incl. "passes on this repository").
- `.wingfoil/workflows/custom/release-publishing.yaml` 1.5 → 1.6 (history line in the `version:` comment):
  `publish` description and `agent.execute` comment name the `mcp-registry` job and the npm wording;
  `checks.post[0]` "…, its GitHub Release created and its MCP Registry listing published" (still one prose
  check: `npx jest test/core/workflow-repository-conformance.test.ts` green with spec-017 §12's counts as they were). `.wingfoil/WORKFLOW.md`'s publish node.
- After green: `npx jest` over publish-pipeline, check-release-tag, workflow-repository-conformance,
  publish-secrets, publish-metadata, version-bump, git-log-readers, wait-npm-version → **8 suites, 245/245**;
  then `test/docs/workflow-md.test.ts`, `ci-workflow`, `service-verify-sweep`, `publish-release-scripts-edges`,
  `pack-ignore-scripts`, `presentation` → **6 suites, 59/59**. The conformance suite reads at HEAD, so it
  passed only once the yaml was committed (before the commit: 1 failure, the old prose at HEAD).
- Red's files untouched since red: `git log --first-parent --no-merges 27fa78cd..HEAD --
  test/cli/publish-pipeline.test.ts test/cli/check-release-tag.test.ts
  test/core/workflow-repository-conformance.test.ts` → empty.

### refactor (developer)

`483084a8`: two `--annotated` edges in `test/cli/publish-release-scripts-edges.test.ts` (red's files are frozen):
a missing operand → exit 1 `no release tag given`, and a tag name carrying `;echo injected` → exit 1 `not
found`, nothing on stdout (git gets one argument, no shell). 6/6. `scripts/` is outside `collectCoverageFrom`
(`src/**/*.ts`, `jest.config.js`), so no coverage figure moves.

### review (self, reviewer)

- **AC 1:** `jobs.mcp-registry` has `needs: promote`, `if: ${{ needs.promote.result == 'success' }}`,
  `permissions: { contents: read, id-token: write }` (with promote, the only `id-token` holders), job env
  `MCP_PUBLISHER_VERSION: '1.8.1'` / `MCP_PUBLISHER_SHA256`, and steps install (`curl … releases/download/v${…}/
  mcp-publisher_linux_amd64.tar.gz`, `sha256sum --check --strict`, then `tar` of the binary only) → validate →
  wait (exactly the release job's poll) → `login github-oidc` → `publish server.json`. Pinned by the
  `mcp-registry job (task-238)` block, the install step executed for real with a fake `curl`.
- **AC 2:** characterization, evidence in design (R2): `mcp-publisher validate` exit 0 on `server.json`.
- **AC 3:** deferred (R3); handover below.
- **AC 4:** step 6 of the header and the `publish` description name the account menu → Staged Packages, the
  "automated review" state, and `npx -y npm@<version> stage approve <stage-id>` (npm ≥ 11.15.0). Pinned by
  `publish runbook (task-238)`.
- **AC 5:** the `act` section says it cannot run from a `git worktree` because `.git` is a file naming a host
  path the container does not mount, and to `git clone` first. Pinned.
- **AC 6:** every job has a positive integer `timeout-minutes` ≤ 360 (gate 30 after review F1, stage 20,
  promote 30, release 345, mcp-registry 345), each stated in the header with its source (task-077's table, CI
  run `38166281488` for the gate, the v0.2.2 timings, the approval-before-start evidence). Pinned by `job timeouts (task-238)`.
- **AC 7:** option 1: the gate step `node scripts/check-release-tag.cjs --annotated "$GITHUB_REF_NAME"`; the
  v0.2.2 run log is cited in design (D6). Pinned on a fixture repository with one lightweight and one annotated
  tag.
- **Handover (dl-159):** no `latest` / `releases/latest` / `--latest` in the job (pinned); one job-level `if:`;
  the wait is for the exact version; the lightweight-tag refusal is its own exported function and CLI mode;
  `git diff 0671d035 HEAD -- .github/workflows/publish.yml | grep -nE "^[-+].*(merge-base|Tag commit is on main)"`
  → nothing, so the "Tag commit is on main" step is untouched. What the Registry does with "latest" is recorded in design.
- **Unasserted (testing T1):** that the real registry accepts the OIDC login and the publish for
  `io.github.wingfoil` (read from the registry source, not run — nothing that publishes); that GitHub starts
  promote's timeout only after the environment approval (inferred from `started_at` on two runs, not from a
  timeout firing); the real download from github.com in CI (the URL form is the one used for the local
  download in AC 2).
- **Same-class sweep in touched files:** every checkout sets `persist-credentials: false` and every
  `setup-node` `package-manager-cache: false` (`publish-secrets.test.ts`, publish-pipeline green); no new
  `uses:` (the four-action pin table passes); no secret read (`grep -n "secrets\." .github/workflows/publish.yml`
  → nothing).

### AC 3 handover (approver, v0.3 release-publishing — ruling R3)

After the v0.3.0 tag's run, once the `mcp-registry` job is green:
1. `curl -s "https://registry.modelcontextprotocol.io/v0/servers?search=io.github.wingfoil/wingfoil"` must list
   `io.github.wingfoil/wingfoil` at the tag's version (on 2026-10-11 it answered `{"servers":[],"metadata":
   {"count":0}}`). If the job failed with a 403, the OIDC grant did not cover the organisation: reopen
   `bug-173` with the job log.
2. Register the listing through `service-ingest`: a `service` element, `kind: listing`, naming
   `io.github.wingfoil/wingfoil` on registry.modelcontextprotocol.io, `owner_role: approver`, with `verify:`
   the `curl` above (the version check by eye or `--jq`-equivalent), so `services.verify-sweep` lists it from
   then on (dl-130 Action 4, dl-088).
3. Record the outcome in the release-publishing phase plan's Execution Notes with the date and command.

### review fixes (2026-10-11, independent review: approve with fixes; D1, D5, D6 judged sound)

Red `806bc57a` (`npx jest test/cli/publish-pipeline.test.ts --maxWorkers=2` → 2 failed, 45 passed / 47); green
`bb41e2ca`.
- **F1:** gate `timeout-minutes` 15 → 30. task-077's table predates the suite's growth: ci.yml's packaging-gate
  step "prepublishOnly gate — build, test, lint" took 7m22s in CI run `38166281488` (`gh api
  repos/wingfoil/wingfoil/actions/runs/38166281488/jobs` → step 19:02:04Z–19:09:26Z, job 19:01:48Z–19:09:44Z),
  against v0.2.2's 1m22s gate. The header cites that run beside task-077's table; spec-015's timeout paragraph
  says gate is sized from CI (pending amendment). The test pins 30 and the run id.
- **F2:** the credential paragraph says `id-token: write` is held by promote and mcp-registry.
- **F3:** the OAuth-app cause of the 403 is written as `bug-173`'s suspected, unverified cause in `publish.yml`'s
  header, spec-015's Revision note and §3 stage 6, and the spec `--reason`; the OIDC grant is cited from registry
  v1.8.1 `github_oidc.go` `buildPermissions`. Same-class sweep: `grep -rn "OAuth" .github/workflows/publish.yml
  .wingfoil/workflows/custom/release-publishing.yaml docs/04_memory/design/specs/spec-015-packaging-publishing.md`
  → only the hedged lines and "no OAuth app in between". This task's Description (planning text) still states
  the cause; left as written at planning.
- **F4:** the main-sync merge is `e0372b42` (the gates table is corrected).
- **F5:** the install step declares `shell: bash`, so GitHub runs it with `-eo pipefail`, the flags the test uses;
  pinned by a new case.
- **F6:** bugs 060, 173, 174 gain a `### Retrospective`; 173 and 174 get their triage notes. They are edits to
  amendable Memory elements past their first state: uncommitted, listed under *Pending amendments*. The
  reviewer's optional follow-up 4 ("only package maintainers see Staged Packages") was not added: no source
  establishes it (bug-174 records only the account-menu location).
- Gates after the fixes: the 19 suites that read `publish.yml` or the touched files → 404/404; `npm run lint`,
  `npx tsc --noEmit -p tsconfig.json` exit 0. No `src/` or `scripts/` change, so the earlier full coverage run
  stands.

### Pending amendments (approver)

- `spec-015-packaging-publishing` (§1a, §3 stage 6 + job timeouts, §4 annotated tag, Revision 2026-10-11):
  `--reason "task-238 (dl-130 step 2, dl-057 (b) and (d), bug-173): §3 gains stage 6, the mcp-registry job - after promote it installs a pinned mcp-publisher whose archive is checked against a SHA-256 in the workflow, validates server.json, waits until npm serves the exact version because the registry reads the published mcpName, then logs in with the workflow's GitHub OIDC token (io.github.wingfoil/*, no OAuth app, which bug-173 suspects refused the manual publish) and publishes; §1a points to it instead of a manual approver step. §3 states that every job declares timeout-minutes, and §4 that the gate refuses a lightweight tag, since the v0.2.2 gate log shows checkout fetching the pushed tag refs. Revision note added."`

- `bug-060-act-recipe-unusable-from-git-worktree`, `bug-173-the-first-mcp-registry-publish-is-refused-the-wingfoil-organization-namespace-is-not-granted-to-its-owner`, `bug-174-the-publish-runbook-does-not-say-where-npm-s-staged-packages-tab-is-nor-that-an-automated-review-precedes-approve` (review F6, dl-115 Q2 (a)) — one `memory amend` each:
  - bug-060: `--reason "task-238 review F6 (dl-115 Q2 (a)): the bug gains its ### Retrospective subsection - none beyond its finding, a one-line caveat carried by task-238 once a task next touched publish.yml."`
  - bug-173: `--reason "task-238 review F6 (dl-115 Q2 (a)): the Triage & Execution Notes placeholder is filled with the triage (e4859473) and the v0.3 planning (3e9a73b3) that absorbed the bug into task-238, which publishes over GitHub OIDC whatever the unverified OAuth-app cause was; the bug gains its ### Retrospective subsection."`
  - bug-174: `--reason "task-238 review F6 (dl-115 Q2 (a)): the Triage & Execution Notes placeholder is filled with the triage (78b941cb) and the v0.3 planning (3e9a73b3) that absorbed the bug into task-238, which rewrote runbook step 6 and the publish phase description; the bug gains its ### Retrospective subsection."`
- spec-015's `--reason` above already reflects review F1/F3 (the gate's timeout from CI; the OAuth-app cause as bug-173's suspicion).

### Gates (dl-170 interim rule: one heavy gate at a time via `waitslot.sh`, `--maxWorkers=2`)

| Command | Result |
|---|---|
| `npm run test:coverage -- --maxWorkers=2` at `483084a8` (whole suite, 2026-10-11 19:55–20:07Z, load 3.3 → 9.8) | **382 suites, 7089 tests, all passed**; coverage 99.3 / 97.22 / 97.93 / 99.7 (stmts / branches / funcs / lines), equal to main at the B5 gate (`devloop-kit/gate-w3b5-cov2.log`: 99.3 / 97.22 / 97.93 / 99.7) |
| `npm run lint`; `npm run docs:api` | exit 0 each |
| `npx tsc --noEmit -p tsconfig.json`; `npx tsc -p tsconfig.build.json --noEmit` (after the main-sync) | exit 0 each |
| main-sync (refactor's last action): `git merge --no-ff main` → `e0372b42` (amended with the §7 trailers; `e253e072` before the amend, same tree) (4 Memory files of task-232/233 and bug-329/331, none of this task's) | then the 7 touched suites → 214/214 |
| `node scripts/check-governance.cjs --base 0671d035` | 0 findings, exit 0 |
| `node scripts/lint-claims.cjs --base 0671d035` | 0 warnings, exit 0 |

The spec-015 pending amendment was in the working tree for every run above.

### Retrospective

- Two ACs labelled characterization (bug-174, bug-060) were wording that did not exist: red-first again, the
  third task in a row (task-219, task-229) where planning called new text "characterization".
- dl-057 (d) had waited since v0.2 on "does checkout keep the tag object?"; the answer was already in the
  v0.2.2 run log (`fetch … +refs/tags/*:refs/tags/*`). Reading the existing run logs settled it in one command.
- One red case passed for an empty reason (no step yet → `exit 99` ≠ 0); recorded rather than fabricated into
  a red, and it passes for the real reason in green.
- The conformance suite reads workflows at HEAD: an uncommitted yaml change looks like a regression until it is
  committed — expected, but easy to misread mid-green.
