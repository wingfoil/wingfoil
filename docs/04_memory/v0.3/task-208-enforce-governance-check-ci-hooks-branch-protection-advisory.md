---
id: "task-208-enforce-governance-check-ci-hooks-branch-protection-advisory"
type: task
title: "Enforce the governance check in CI, with hooks, branch protection and the advisory lints"
status: in-progress
release: "v0.3"
kind: "feature"
priority: "high"
tags: ["v0.3", "process", "governance", "ci"]
ref: "dl-103"
bug: ["bug-192", "bug-218", "bug-249", "bug-307"]
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

### design (architect)

- **Depends-on notes read (dl-015).** `task-167` (the check; handover in Implementation Notes: `fetch-depth: 0`,
  a build first, exit 0/1/2, the introduction commit found on the first-parent line), `task-139` and `task-201`
  (the `claim-evidence` falsifiability clause and the `code-review` "Claims are re-run" section, which the
  lint complements). The ratified options: `git log --grep '^wf(decision-log): approve dl-103'` → (A)+(C), (B)
  a convenience, policy (i); `dl-097` → (a) now, (b) warn-only once `dl-103`'s CI exists; `dl-139` → (a);
  `dl-099` → (a), smoke part of (c) — already hosted by `ci.yml`'s `e2e-smoke` job (`task-207`;
  `grep -n "e2e-smoke:" .github/workflows/ci.yml`), so `governance.yml` does not run the smoke again.
- **Specs.** No tech-spec describes the check; `spec-008` §2 (`approved`) is the source of the verb ↔ edge
  pairing (`bug-192`) and of the `sync` citation rule (`dl-061` B.1). No spec edit is needed: the check is a
  repository script, not shipped (`spec-015`; `npm pack --dry-run` lists nothing under `scripts/`, pinned by
  `test/cli/check-governance.test.ts`).
- **Scope added in flight.** `bug-307` (approver ruling 2026-10-09, after the green of the original scope):
  main merged at `02e6fb8b`, the bug list amended at `ef70f833`, the sync at `9096314e`, then red/green.
- **Design decision — a cut-off per check.** Each rule this task adds to `scripts/check-governance.cjs`
  (`verb-edge`, `status-outside-wf`, `supersedes-pair`, `config-version`, `approval-ai-trailer`) gates only the
  commits after its own introduction: the oldest first-parent commit whose change to the script altered the
  count of the check's marker (`CHECKS`, `git log -S`). Without it, every commit since the script's own
  introduction (`fcd43569`) would be judged by rules that did not exist when it was pushed — `bug-307` alone
  counts 63 such approve/reject commits. A marker no commit brought in falls back to the script's
  introduction; `--introduced-at` sets all of them (the fixtures). On this branch:
  `node scripts/check-governance.cjs --base b56e8721` prints `later checks introduced at: verb-edge 7840a0c6…,
  … approval-ai-trailer c501a7d4…`; on `main` it will be the merge commit.
- **AC classification (testing directive), corrected:**

  | AC | class | why |
  |----|-------|-----|
  | 1 `governance.yml` | red-first (was characterization) | the file did not exist: `git ls-tree --name-only b56e8721 .github/workflows/` → `ci.yml dependency-check.yml publish.yml scorecard.yml` |
  | 2 tracked hooks | red-first (was characterization) | `git ls-tree b56e8721 .githooks` printed nothing, while `git ls-tree b56e8721 .github` lists the `workflows` tree |
  | 3 claim lint | red-first | new script |
  | 4 `code-review.md` policy (i) | characterization (documentation) | a directive line, checked by `grep` below |
  | 5 branch protection + `service` | approver, in session | a GitHub setting; not this agent's (see the report) |
  | bug-192, bug-218, bug-249, bug-307, dl-139 (a) | red-first | new rules |

### red

- `30183b3f`: `npx jest test/cli/check-governance-enforcement.test.ts test/cli/governance-workflow.test.ts
  test/cli/git-hooks.test.ts test/cli/lint-claims.test.ts test/validation/config-version.test.ts
  test/lint/version-bump.test.ts` → `Tests: 51 failed, 24 passed, 75 total` (the 24 passing are the
  "accepts" cases, which pass on the old script by construction, and the pre-existing version-bump cases).
  `lint-claims.test.ts` failed to load (module absent).
- `a4123b61` (`bug-307`): `npx jest test/cli/check-governance-enforcement.test.ts -t "bug-307|per-check"` →
  `3 failed, 3 passed` (the CHECKS roster, the finding, the cut-off).
- Main-sync in red (dev-loop v1.5): `git log --oneline b56e8721..main` printed nothing at red, so there was
  nothing to merge; its positive case is the same command later, which listed the four bug-307 triage commits
  that `02e6fb8b` merged.

### green

- `7840a0c6` — `.github/workflows/governance.yml` (push/PR to `main`, `contents: read`, SHA-pinned actions
  identical to `ci.yml`, `fetch-depth: 0`, `npm ci` → `npm run build` → range from
  `github.event.pull_request.base.sha` or `github.event.before`, full history when that is unreachable →
  the check → the claim lint, warn-only); `.githooks/pre-push` (mode `100755`: `git ls-files --stage
  .githooks`); `scripts/lint-claims.cjs` (+ `npm run lint:claims`); the four later checks; `isVersionIncrease`
  in `src/validation`, now also used by the pending gate `test/lint/helpers/version-bump.ts` (a downgrade or
  a re-quoting fails it, and a branch bump is credited only when it is an increase).
- `52135112` — `git-conventions` 1.3 → 1.4, new §9 (CI, branch protection, opt-in hook with
  `git config core.hooksPath .githooks`); `code-review` gains policy (i):
  `grep -n "No gated transition by an unattended run" .wingfoil/directives/custom/code-review.md` → one line.
- `c501a7d4` — `approval-ai-trailer` (`bug-307`): any `Co-Authored-By:` or `AI-Model:` line on an `approve` or
  `reject` is a `body` finding; other verbs keep them.
- Rule details worth a reviewer's eye: `approve`/`start` need a forward edge, `start` not into the last state,
  `finalize` the forward edge into it, `reject` a `gates` reject edge; a hop that is a reject edge and no
  forward edge under any other verb needs a body token resolving to a `wf(…): reject` commit; a named document
  gone at `HEAD` is compared from `git cat-file --batch` reads of the commit and its parent; `dl-139` reads
  `.md` files under the content roots of the `memory.yaml` committed at each non-merge commit, follows renames
  (`-M`), counts a document only when its `type:` is a type of that file, flags a creation, never a deletion;
  `config-version` compares the merge-base of `--base` with `HEAD` and puts the finding on the range's last
  commit touching the file.

### refactor

- Gates (run with the working tree as committed at `c501a7d4`, then the fixes below re-run):
  - `npm test` → `Tests: 3 failed, 6125 passed, 6128 total`: `check-governance.test.ts` (its "conforming"
    approve carried `Co-Authored-By:` — now a `bug-307` finding; the fixture uses `Signed-off-by:` instead,
    keeping its point, a reason followed by a trailer paragraph), `git-log-readers.test.ts` (two `git show`
    calls in `lint-claims.cjs` not in the `${rev}:${path}` shape), and `query-latency.test.ts` (REQ-PERF-02
    under the batch's load; alone: `npx jest test/core/query-latency.test.ts` → `4 passed`). Fixed at
    `d3598d68`; `npx jest test/lint/git-log-readers.test.ts test/cli/check-governance.test.ts
    test/cli/lint-claims.test.ts` → `52 passed`. Final full run: see review.
  - `npm run test:coverage` → All files `99.19 | 96.99 | 97.48 | 99.66` against the W3 B3 gate's
    `99.2 | 97.01 | 97.48 | 99.67` (`grep "^All files" ../devloop-kit/gate-w3b3-cov.log`): the drop was
    `src/validation/config-version.ts` line 45; `3067b12a` covers it (`npx jest --coverage
    --collectCoverageFrom=src/validation/config-version.ts test/validation/config-version.test.ts` →
    `100 | 100 | 100 | 100`).
  - `npm run lint` → exit 0; `npm run docs:api` → exit 0; `npx tsc --noEmit -p tsconfig.json` → exit 0;
    `npx tsc -p tsconfig.build.json --noEmit` → exit 0.
  - `node scripts/check-governance.cjs --base b56e8721` → first line `governance check: 8 wf() commits … and 7
    other commits`, `gated: 0 findings on 0 commits`, exit 0 (13 s).
- Main-sync as refactor's last action: `git log --oneline HEAD..main` printed nothing; its positive case is
  `git log --oneline b56e8721..main`, which lists the four bug-307 commits `02e6fb8b` merged.
- Claim-lint false positives, measured once: `node scripts/lint-claims.cjs --base 1ce84a54` (the W3 B3 range) →
  `claim lint: 17 warnings in 11 files (warn-only), 59 files read`; most are normative spec prose
  ("unchanged" in `spec-005`/`spec-006`) and notes that say a file is "unchanged" without the diff.

### review (self, reviewer)

- **What the new rules say about `main`'s gated history** (measured on a detached worktree at `b56e8721`, with
  the markers absent so every new check fell back to the script's introduction `fcd43569`):
  `node scripts/check-governance.cjs --root <wt> --base fcd43569 --json` (38 min under the batch's load) →
  1757 `wf()` commits and 669 other commits read; **0** `verb-edge`, **0** `status-outside-wf`, **0**
  `supersedes-pair` findings; one gated finding of an existing rule (below). The zero for `dl-139` is
  cross-checked by a second command: no non-merge, non-`wf()` commit of `fcd43569..b56e8721` has a `^[-+]status:`
  line under `docs/04_memory` or `docs/05_plans` (a loop over `git show --format= <c> -- docs/04_memory
  docs/05_plans | grep -cE '^[-+]status:'`), while the same grep on the `wf()` sync `9096314e` counts `2`. The
  zero for the `sync` citation has no positive case on `main`: `git log --format='%h %s' fcd43569..b56e8721 |
  grep -cE "wf\(bug\): sync .*(in-review → in-progress)"` → `0`; the fixture tests are its positive cases.
  `bug-307`'s 63 violating commits are its own count. So the cut-off matters for `bug-307`, and keeps the
  others safe from history they did not see.
- **A pre-existing gated finding on `main`** (not this task's rules): `d818c0dd` `wf(task): amend task-152-… [backlog
  → backlog]`, "the bracket declares backlog → backlog, the frontmatter went in-progress → backlog". A push
  range does not include it, but `governance.yml`'s whole-history fallback (unreachable `before`) would fail on
  it. Reported to the coordinator, not filed.

### review (self, reviewer)

- **AC 1** — `test/cli/governance-workflow.test.ts` (10 tests): triggers exactly push/PR to `main`, `contents:
  read`, no job permissions, `fetch-depth: 0`, `persist-credentials: false`, the step order, the range source,
  the check binding and the lint warn-only, no credential, Node/runner/pins equal to `ci.yml`;
  `test/cli/workflow-action-pins.test.ts` passes over the new file.
- **AC 2** — `test/cli/git-hooks.test.ts` (5 tests): `100755` in the index, the same script with `--base`,
  `sh -n`, a real run on a push that adds nothing (exit 0, `governance check: 0 wf() commits`), and
  `git config core.hooksPath .githooks` in `git-conventions` §9.
- **AC 3** — `test/cli/lint-claims.test.ts` (6 tests): the five warnings of `test/fixtures/claim-lint/flagged.md`
  by line and kind, none on `clean.md`, GitHub annotations with exit 0, exit 2 on bad usage, and `--base`
  limited to added lines of Memory documents.
- **AC 4** — `grep -n "No gated transition by an unattended run" .wingfoil/directives/custom/code-review.md` →
  one line, citing `dl-103` §2 (i).
- **AC 5** — not done here: the approver's (branch protection requiring the `governance` check, then a
  `service` element, `kind: setting`, `verify:` a `gh api` command, through `service-ingest`).
- **bug-192, bug-218, bug-249, dl-139 (a), bug-307** — `test/cli/check-governance-enforcement.test.ts`
  (20 `it`, 26 cases); `bug-249`'s pending half in `test/lint/version-bump.test.ts` (3 new cases) and
  `test/validation/config-version.test.ts`.
- Same-class sweep in files touched: every `git log` and `git show` of the two scripts passes
  `test/lint/git-log-readers.test.ts` (fixed at `d3598d68`); every new commit read through
  `requireCommitName`.
- Final full run after the fixes: see the line below.
- `npm test` at `3067b12a` → `Test Suites: 324 passed, 324 total`, `Tests: 6132 passed, 6132 total`, exit 0.

### Retrospective

- A rule added to a running check needs its own cut-off: without one, `bug-307`'s rule would have failed 63
  commits pushed before it existed (evidence: the bug's own count; the per-check markers in `CHECKS`).
- A whole-history run took 38 min under nine parallel agents (`measure.time`, `real 38m24s`), against task-167's
  ~6 min: CI only takes it when a push has no reachable `before`.
