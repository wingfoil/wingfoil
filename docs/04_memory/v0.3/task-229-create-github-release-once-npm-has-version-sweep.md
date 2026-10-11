---
id: "task-229-create-github-release-once-npm-has-version-sweep"
type: task
title: "Create a GitHub Release once npm has the version, and sweep service verifies before publishing"
status: approved
release: "v0.3"
kind: "feature"
priority: "high"
tags: ["v0.3", "process", "publishing", "ci", "visibility"]
ref: "dl-130"
bug: []
depends_on: ["task-219-define-release-candidate-staging-rehearsal-phase-recut-reentry"]
tmpl_version: 260703
---

## Description

A release reaches npm and nowhere else. A `publish.yml` job creates the Release with the version's CHANGELOG section. **Since adr-011, `promote` only stages the version**; the ratified premise "after promote = npm has it" no longer holds, so the job must wait for the version to be live.

## Acceptance Criteria

- (red-first) a `release` job `needs: promote`, `contents: write` on that job alone, which refuses to create the Release until `npm view wingfoil@<version> version` returns the version (a bounded poll, or an environment the approver approves after the npm stage approval — design picks and records); pinned in `publish-pipeline.test.ts`.
- (red-first) the notes are extracted from `CHANGELOG.md`'s section for the version by a script with unit tests (missing section → fail).
- (characterization) `release-publishing.yaml` `publish.checks.pre` declares the service verify sweep (severity `warn`, dl-130 Q3 (a)); a script lists every `service` element's `verify:` for the approver to run and record (the agent never runs third-party-account commands).
- (characterization) `spec-015` §3 amended (Revision note); `publish.yml` header runbook updated.

## Implementation Notes

- **Size:** M · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-130 step 1 (Q1 (a)), step 4 (Q3 (a)); spec-015 §3 amendment.
- **Planning ruling:** Approver ruling 2026-09-30 (plan R20, Q3): the job waits for the version to be live on npm with a bounded poll (`npm view wingfoil@<version>`, a declared timeout such as 24 h, then a readable failure), not with a second environment approval.
- **Notes:** Proposal key: D23. Q4 (a) (backfilled Release for v0.2.1 only) is already done: `svc-010-github-release-v0.2.1`.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.
- **Handover from the parallel-release-lines decision (2026-10-07):** `dl-159` (`in-discussion`, to be ratified before the
  `v0.3.0` tag) opens `release/X.Y` maintenance lines beside `main`: patches land on `release/X.Y` and are merged
  forward into `main` with `--no-ff`, never cherry-picked or back-merged; patch tags go on the pushed `release/X.Y`.
  `task-265` (gate: a tag on `origin/main` or `origin/release/X.Y`) and `task-266` (promote: an explicit `--tag`,
  `latest` only for the highest published version, else `latest-X.Y`) edit `publish.yml` after this task, in B9. Do
  not hard-code that the GitHub Release is the repository's latest (a forced `--latest` / `make_latest: true`):
  leave one place `task-266` can set from the same rule. The live-on-npm poll checks the exact version (`npm view
  wingfoil@<version> version`), never `wingfoil@latest`, which a `latest-X.Y` publish does not move. The CHANGELOG
  extraction works on a `release/X.Y` tree that lacks later minors' sections. The `spec-015` §3 Revision note does
  not restate "tag on `main`".

## Execution Notes

Branch `task/task-229-create-github-release-once-npm-has-version-sweep`, worktree `../.wf2-wt/task-229`, cut
from `main` `30b268a3` (W3 B5). Start `aa001e69`.

### design (architect)

**`depends_on` read (dl-015).** `task-219` is `done` (`grep -m1 '^status' docs/04_memory/v0.3/task-219-*.md`).
Its notes bear on this task in three places: `release-publishing.yaml` is at 1.4 with the `publish` phase at
`phases[3]` (`checks.pre: ["tests.passing"]`, one prose `post`); the conformance suite lists
`phases[3].checks.post[0]` as an unbound warning, so a **bound** check added to `publish` leaves spec-017 §12's
counts unchanged; the spec-015 Revision notes of `task-219`/`task-254` set the form (dated, task id, "Edited in
place: no supersede, no state change, no `version:` bump (`dl-047`)").

**Specs and decisions.** `spec-015` is `approved`; `dl-130` is `ready`, ratified with Q1 (a), Q3 (a) (its
approve commit's `Reason:`, `git log -1 --format=%B --grep="approve dl-130"`). `dl-159` is `in-discussion`: its
handover is honoured, not implemented (below). No BDD scenario covers publishing
(`grep -rli "github release\|publish" docs/02_requirements/02_bdd/features` → nothing).

**Design.**
- **D1 — the wait is a bounded poll inside the `release` job, capped at the runner's limit, not 24 h.** The
  planning ruling (R20, Q3) asks for a bounded poll with "a declared timeout such as 24 h". A GitHub-hosted job
  runs for at most 6 hours ("Each job in a workflow can run for up to 6 hours of execution time",
  https://docs.github.com/en/actions/reference/limits, read 2026-10-10), so a 24 h poll in one job cannot exist.
  Declared values: `--timeout-minutes 330 --interval-seconds 60`, job `timeout-minutes: 345`, so the script
  fails with its own readable message before GitHub kills the job. If the approver approves the staged version
  later than that, the recovery is **Re-run failed jobs** on the same run (up to 30 days after it,
  https://docs.github.com/en/actions/how-tos/manage-workflow-runs/re-run-workflows-and-jobs): `promote`
  succeeded and is not re-run, the `release` job polls again and creates the Release. Written in the header
  runbook. Decision for the approver.
- **D2 — order inside the job:** the notes are extracted first, so a missing CHANGELOG section fails at once,
  not after hours of polling; then the poll; then `gh release create "$GITHUB_REF_NAME" --verify-tag --title
  "$GITHUB_REF_NAME" --notes-file …`. The poll and the create are skipped under `act` (`if: ${{ !env.ACT }}`,
  as promote's stage step): `act` stages nothing, so a local run would poll for 5.5 h.
- **D3 — `latest` is not hard-coded (dl-159 handover).** The job env `RELEASE_MAKE_LATEST: ''` is the one
  place `task-266` sets from its dist-tag rule; the create step passes `--latest=<value>` only when it is
  non-empty, otherwise gh's default applies ("automatic based on date and version", `gh release create --help`,
  gh 2.45.0).
- **D4 — the poll checks the exact version:** `npm view wingfoil@<version> version`, never `wingfoil@latest`;
  live = exit 0 and stdout equal to the version. The script is a reusable `scripts/wait-npm-version.cjs`, since
  `task-238`'s `mcp-registry` job needs "the same wait".
- **D5 — the CHANGELOG extraction** (`scripts/changelog-section.cjs <X.Y.Z>`) finds the one `## [X.Y.Z]` heading
  (escaped: `0.2.1` never matches `0.2.10`) and takes the lines up to the next `## ` heading, trimmed; a missing,
  duplicated or empty section is exit 1. It reads only its own section, so it works on a `release/X.Y` tree that
  lacks later minors' sections (dl-159 handover; pinned by a case).
- **D6 — the verify sweep** (`scripts/service-verify-sweep.cjs`) reads the `service` elements **at `HEAD`**
  (command-baseline: the folder from `memory.yaml`'s `service.path` at `HEAD`, each file through `git show`),
  sorted by path, and prints a Markdown checklist of every `pending` and `active` service with its
  `owner_role` and `verify:` for the approver to run (`draft` and `deprecated` are counted, not listed). It runs
  nothing it lists. Exit 0 when every listed service has a `verify:`; 1 when one has none or a file does not
  parse (the list is still printed); 2 on a usage or repository error. Declared as `publish.checks.pre`
  `services.verify-sweep`, bound in `bindings.yaml` with `severity: warn` (dl-130 Q3 (a): reports, blocks
  nothing in its first release). **T1:** the check asserts that the list is complete, not that any service is
  healthy; that is the approver's run. **Where the results are recorded** (dl-130 step 4, "its result
  recorded"): in the release-publishing phase plan's Execution Notes, one line per service with the command and
  the date (claim-evidence). Decision for the approver (D6): the alternative, a `produces:` report under
  `docs/07_gates/`, would make `publish` evidence-bearing and move spec-017 §12's checkpoint list.
- **Not done here (scope):** `dl-130` Action 2 also asks for a `post` check that the Release exists. A bound one
  needs the full tag, which no element field holds (`release.version` is `v0.3`, `grep -n "^version"
  docs/04_memory/planning/rl-v1/minor-v0.3.md`); a prose one adds an unbound warning (spec-017 §12 counts). Left
  out and reported as a candidate finding.

**AC classification (T1).** Corrected from the planning labels where the behaviour did not exist yet (as
`task-219` did: config that does not yet exist is red-first).

| AC | Class | Why |
|---|---|---|
| 1 — `release` job, `needs: promote`, `contents: write` alone, bounded live-on-npm poll | red-first | new job and script; `test/cli/publish-pipeline.test.ts`, `test/cli/wait-npm-version.test.ts` |
| 2 — notes from the version's CHANGELOG section (missing → fail) | red-first | new script; `test/cli/changelog-section.test.ts` |
| 3 — `publish.checks.pre` sweep + listing script | **red-first** (planned: characterization) | neither the check nor the script existed (`grep -rn "verify-sweep" .wingfoil scripts` → nothing); `test/cli/service-verify-sweep.test.ts` |
| 4a — spec-015 §3 Revision note | documentation | pending amendment (approver) |
| 4b — `publish.yml` header runbook | red-first (planned: characterization) | new text, pinned in `test/cli/publish-pipeline.test.ts` |

### red (qa)

`807273ff`: `test/cli/publish-pipeline.test.ts` (the job chain gains `release`; `contents: write` on it alone; a
new `release job (task-229)` block: step order, declared poll bounds ≤ the job's `timeout-minutes` ≤ 360, notes
file, `--verify-tag`, no hard-coded `latest`, `GH_TOKEN` on the create step only, `act` skips, checkout without
persisted credentials, header runbook), and three new suites written from the ACs through the scripts' exports
and command lines: `test/cli/changelog-section.test.ts`, `test/cli/wait-npm-version.test.ts`,
`test/cli/service-verify-sweep.test.ts` (which also pins the `publish.checks.pre` entry and its binding).
`npx jest test/cli/publish-pipeline.test.ts test/cli/changelog-section.test.ts test/cli/wait-npm-version.test.ts
test/cli/service-verify-sweep.test.ts` → **4 suites failed; 10 tests failed, 22 passed / 32**; the three new
suites fail to load (`Cannot find module '../../scripts/<name>.cjs'`).

Back to red twice, for test defects green found (testing T4 — fixed in red, not in green):
- `c4537fc1`: the "create step alone" case compared step objects from two separate parses of `publish.yml`, so
  the create step was never excluded from "the other steps"; now one parse.
- `7e3fae5e`: `tsc --noEmit -p tsconfig.json` → `test/cli/changelog-section.test.ts(144,61): error TS2339:
  Property 'trim' does not exist on type 'string | NonSharedBuffer'`; the CLI helper is typed
  `SpawnSyncReturns<string>`.

### green (developer)

`47100be5`:
- `scripts/changelog-section.cjs` (+ `.d.cts`), `scripts/wait-npm-version.cjs` (+ `.d.cts`; injected clock,
  sleep and npm; the CLI requires both bounds, refuses a tag that is not `v` + `package.json`'s version),
  `scripts/service-verify-sweep.cjs` (+ `.d.cts`; reads at `HEAD`, every `git show` written `${rev}:${path}`
  as `test/lint/git-log-readers.test.ts` requires — the first draft's `` `HEAD:${path}` `` was flagged by it).
- `.github/workflows/publish.yml`: the `release` job and the header (stage list, runbook step 7, the `act`
  note).
- `release-publishing.yaml` 1.4 → 1.5 (`publish`: description, `checks.pre: ["tests.passing",
  "services.verify-sweep"]`); `bindings.yaml` 1.6 → 1.7 (`services.verify-sweep: { run: [node,
  scripts/service-verify-sweep.cjs], severity: warn }`); `.wingfoil/WORKFLOW.md`'s `release-publishing`
  diagram (the publish node).
- The conformance suite needed no change: the new check is bound, so no new `W_WORKFLOW_UNBOUND_TOKEN`, and
  `publish` stays a checkpoint (`npx jest test/core/workflow-repository-conformance.test.ts` green unchanged).
- Focused run after green: `npx jest` over the four red suites + `publish-secrets`, the conformance suite,
  `workflow-md` and `git-log-readers` → **124/124 passed**; `npm run lint` exit 0.

Real runs on this repository (read-only):
- `node scripts/service-verify-sweep.cjs` → exit 0, `# Service verify sweep — 19 services at 24fe7bc7`,
  `Not listed: 0 draft, 1 deprecated.` (svc-007).
- `node scripts/changelog-section.cjs 0.3.0` → exit 1, ``error: no section `## [0.3.0]` in the changelog``:
  expected until `release-publishing`'s `release-commit` writes it; the job fails at once if it does not.

### refactor (developer)

`24fe7bc7`: `test/cli/publish-release-scripts-edges.test.ts` (a new file, red's are frozen): CRLF changelog and a
last section reaching the end of the file, a second positional argument on both CLIs, a status outside the
service machine and non-mapping frontmatter (4/4). The scripts are outside `collectCoverageFrom` (`src/**/*.ts`,
`jest.config.js`), so they move no coverage figure.

### review (self, reviewer)

- **AC 1:** `jobs.release` has `needs: promote` and `permissions: { contents: write }`, the only job with
  write access to contents. Its steps run in order: notes, then the poll
  `node scripts/wait-npm-version.cjs "$GITHUB_REF_NAME" --timeout-minutes 330 --interval-seconds 60`
  (within `timeout-minutes: 345` ≤ 360), then `gh release create --verify-tag`. The poll waits for
  the exact version. Pinned by the `release job (task-229)` block of `test/cli/publish-pipeline.test.ts`
  and by `test/cli/wait-npm-version.test.ts`.
- **AC 2:** `scripts/changelog-section.cjs` fails on a missing, duplicated or empty section at exit 1.
  Pinned by `test/cli/changelog-section.test.ts`.
- **AC 3:** `publish.checks.pre` and the `warn` binding are pinned by `test/cli/service-verify-sweep.test.ts`.
  The script runs no `verify` command: no spawn other than `git` (`grep -n "execFileSync\|spawn"
  scripts/service-verify-sweep.cjs` → the one `git` helper).
- **AC 4:** the header runbook (stage list, step 7, `act`) is pinned. spec-015 §3 stage 5 and its Revision
  note are a pending amendment (below).
- **Handover (dl-159):**
  - no `@latest`, and no `--latest` outside `${RELEASE_MAKE_LATEST:+…}` (pinned);
  - the CHANGELOG case for a `release/X.Y` tree is pinned;
  - the spec-015 note does not say "tag on `main`" (`grep -n "on \`main\`" ` over the new note → nothing).
- **Unasserted (testing T1):**
  - that GitHub's hosted runner really caps a job at 6 h, and that "Re-run failed jobs" re-runs only the
    `release` job — cited from GitHub's documentation (design, D1), not tested;
  - the real `gh release create` and `npm view` against live services — not run (nothing that publishes).
- **Same-class sweep in touched files:** every `uses:` in the new job is one of the four pinned actions
  (the `action pins (task-113)` block passes). Every checkout sets `persist-credentials: false`
  (`publish-secrets.test.ts` passes).

### Gates (head `24fe7bc7`; dl-170 interim rule: one heavy gate at a time, load ≤ 14, `--maxWorkers=2`)

| Command | Result |
|---|---|
| `npm run test:coverage -- --maxWorkers=2` (the whole suite; 2026-10-11 15:41–15:48, load 3.7 → 3.0) | **351 suites, 6534 tests, all passed**; coverage 99.29 / 97.04 / 97.74 / 99.69 (stmts / branches / funcs / lines), the same as main at the B4 gate (`gate-w3b4-cov.log`: 99.29 / 97.04 / 97.74 / 99.69) |
| `npm run lint` | exit 0 |
| `npx tsc --noEmit -p tsconfig.json`; `npx tsc -p tsconfig.build.json --noEmit`; `npm run docs:api` | exit 0 each |
| `node scripts/check-governance.cjs --base 30b268a3` | 1 `wf()` commit checked, 0 findings, exit 0 |
| `node scripts/lint-claims.cjs --base 30b268a3` | 0 warnings, exit 0 |

Earlier full runs were killed by machine restarts, and a run at load ~160 showed a p95 failure in
`test/mcp/resource-latency.test.ts`. The idle coverage run above passed it.

### review fixes (2026-10-11, independent review: approve with fixes)

Red `bcf78a10` (`npx jest test/cli/wait-npm-version-failures.test.ts test/core/workflow-repository-conformance.test.ts`
→ 2 suites failed, 9 failed / 29); `93c276df` fixes one red test defect; green `c5770d38`.
- **F1** (dl-130 Action 2): `publish.checks.post[0]` reads "staged version approved on npm, live on the npm
  registry, and its GitHub Release created": the same prose check, so spec-017 §12's counts do not move
  (`test/core/workflow-repository-conformance.test.ts` pins the new string; still 1.5, no second bump). The
  former "candidate finding 1" is withdrawn.
- **F2:** the `agent.execute` comment names `→ release`. Same-class sweep: `grep -rn "live on the npm registry\|gate → stage → promote" .wingfoil test` → the yaml (lines 80, 84), its conformance pin, `.wingfoil/WORKFLOW.md`'s publish node and the publish-pipeline test title, each naming the release step; older task notes and the v0.2.2 plan are history.
- **F3:** `scripts/wait-npm-version.cjs` — npm that cannot be run (`status: null`, not a timeout) fails at once;
  `npm error code E401` / `npm ERR! code E403` fail at once ("waiting will not change"), told apart by npm's own
  `code` line; E404 (the staged, unapproved version), empty output, network codes and a killed call keep polling;
  each call is bounded by `NPM_VIEW_TIMEOUT_MS` (60 s, `npmView` kills with SIGKILL and reports `timedOut`).
  New suite `test/cli/wait-npm-version-failures.test.ts` (15/15), including a real hanging fake npm killed after
  300 ms and the CLI with no npm on PATH (exit 1). The red test's fake npm first had a PATH without `sleep`, so it
  exited 127 instead of hanging: fixed back in red (`93c276df`).
- **F4:** the spec-015 stage 5 text says "a missing, duplicated or empty section fails", names the job's
  ephemeral `GITHUB_TOKEN` as the holder of `contents: write`, and the E401/E403 and per-call bound; the
  `--reason` below is updated.
- Gates (targeted, dl-170: `scripts/` is outside coverage and `src/` is untouched): `npx jest` over the
  conformance, wait-npm-version (both), edges, publish-pipeline, service-verify-sweep, git-log-readers and
  workflow-md suites → 8 suites, 103/103; `npm run lint`, `npx tsc --noEmit -p tsconfig.json` exit 0;
  `check-governance.cjs --base 30b268a3` 0 findings.

### Pending amendments (approver)

- `spec-015-packaging-publishing` (§3 stage 5 + Revision 2026-10-10):
  `--reason "task-229 (dl-130 step 1, Q1 (a)): §3 gains stage 5, the GitHub Release - after promote a release job whose ephemeral GITHUB_TOKEN alone holds contents: write extracts the version's CHANGELOG section (a missing, duplicated or empty section fails), waits with a bounded poll until npm serves exactly that version, since promote only stages it (adr-011), failing at once when npm cannot be run or answers E401/E403, then creates the Release on the existing tag; the bound sits under the hosted runner's 6-hour job limit and a later approval is recovered by re-running the failed job. Revision note added."`

### Retrospective

- The planning text for AC 3 called it characterization, but neither the check nor the script existed:
  config that does not yet exist is red-first, as `task-219` found (red run: 10 of 32 failing).
- "A declared timeout such as 24 h" could not be met by one hosted job (6 h cap); the ruling's intent — a
  bounded wait with a readable failure — is kept, and the recovery is a re-run (D1).
- Two red defects were found in green (a cross-parse identity comparison, a `string | Buffer` type) and fixed
  back in red. `git log --first-parent --no-merges 7e3fae5e..HEAD -- <red's four files>` → empty.
- Machine restarts and load 160 killed three full gate runs; the dl-170 rule (one heavy gate at a time) got one
  clean run.
