---
id: "task-219-define-release-candidate-staging-rehearsal-phase-recut-reentry"
type: task
title: "Define the release candidate: staging rehearsal as a phase, re-cut re-entry, no-identity suite before the tag"
status: done
release: "v0.3"
kind: "feature"
priority: "high"
tags: ["v0.3", "process", "release-gate", "workflow-config"]
ref: "dl-099"
bug: []
depends_on: ["task-207-drive-e2e-smoke-through-fresh-project-use-scenario"]
tmpl_version: 260703
---

## Description

v0.2's gates found defects only when they ran. A candidate is any commit proposed for a tag; both checks run on each; the rehearsal becomes a declared phase. v0.2.2 showed the CI gate job runs without a git identity, which a local run does not reproduce.

## Acceptance Criteria

- (characterization) `release-publishing.yaml` gains `staging-rehearsal` before `tag` (role `qa`, action `npm run publish:staging`, `produces:` the transcript, `checks.post` on its closing line); version bumped; loads with zero errors.
- (characterization) `release-cycle.yaml` states that a re-cut candidate re-enters e2e-smoke and the rehearsal; version bumped.
- (red-first) a script (e.g. `npm run test:no-identity`) runs the full suite with no git identity (`GIT_CONFIG_GLOBAL`/`GIT_CONFIG_NOSYSTEM` pointed away, empty `HOME`), and `release-submit.yaml` `pre-release-checks` declares it; a test proves the script's environment has no `user.email` (`git config user.email` exits 1 inside it).
- (characterization) `spec-015` (the rehearsal's place in the release) amended with a Revision note; `dl-023` gains a dated note pointing to dl-099.
- (characterization) `.wingfoil/WORKFLOW.md` draws `staging-rehearsal`; task-148's phase-name test stays green.

## Implementation Notes

- **Size:** S · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-099 §1, §2, Actions 2–3, v0.2.2 carry-over (full `npx jest` with no git identity pre-tag).
- **Features:** P4.1.
- **Notes:** Proposal key: D10.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.
- **Handover from the parallel-release-lines decision (2026-10-07):** `dl-159` (`in-discussion`, to be ratified before the
  `v0.3.0` tag) opens `release/X.Y` maintenance lines beside `main`: patches land on `release/X.Y` and are merged
  forward into `main` with `--no-ff`, never cherry-picked or back-merged; patch tags go on the pushed `release/X.Y`.
  The `tag` phase's `pre: ["on-branch-is-main", …]` and `git.tag(…, on: main)` become a parametric base branch later
  (`dl-159` A2.4, deferred to the v0.3 retrospective and `patch-v0.3.1`). Write the `staging-rehearsal` phase, the
  re-cut re-entry rule and the no-identity check in terms of the candidate commit and the release's integration
  branch, not `main` by name, so A2.4 changes one parameter; the `spec-015` Revision note this task adds does not
  restate "tag on `main`" (`task-267` amends §3/§4 in B9).
- **Handover from wave 3 B3 (2026-10-09, `task-207`'s review; W3 B3 follow-ups).** The gate binding
  `e2e-smoke-passed` (`.wingfoil/workflows/bindings.yaml`: `run: [node, scripts/e2e-smoke.cjs, --report, "{report}"]`)
  passes no `--expect-version` / `--expect-commit` and no `-- <command>`, so the script runs whatever `wingfoil` is
  on PATH and the report does not prove the candidate tarball (`dl-099` §1): bind the candidate's stamp. A command
  after `--` must be an absolute path: the script runs each step in a throwaway directory, so `node
  scripts/e2e-smoke.cjs -- node dist/cli.js` fails (`task-207`'s review), while `task-207`'s own run with `-- node
  "$PWD/dist/cli.js"` exited 0, 54/54 `ok` (its Execution Notes).

## Execution Notes

Branch `task/task-219-define-release-candidate-staging-rehearsal-phase-recut-reentry`, worktree
`../.wf2-wt/task-219`, cut from `main` `b56e8721` (W3 B4). Start `0a26aed8`.

### design (architect)

**`depends_on` read (dl-015).** `task-207` is `done` (`grep -m1 '^status' docs/04_memory/v0.3/task-207-*.md`).
Its notes and the B3-gate handover above: the `e2e-smoke-passed` binding passes no stamp and no command, and a
command after `--` must be an absolute path. `ci.yml`'s `e2e-smoke` job already packs, installs into a
throwaway prefix and passes `--expect-version` / `--expect-commit "$GITHUB_SHA"`; the binding had no source
for a commit (spec-003 Layer 3 placeholders are token arguments or element fields, and no element holds a
sha), so the script derives the stamp from the candidate itself: `--candidate`.

**Specs.** `spec-015` is `approved` (`grep -m1 '^status'`). No other spec changes: the new phase produces a
file (evidence), so it is no checkpoint, and its check is bound, so spec-017 §12's warning counts do not move.

**Findings that shaped the design.**
- The candidate is "any commit proposed for a version tag" (`dl-099` §1), and the version bump commit is
  that commit — but `tag` made the release commit and the tag in one phase, so a rehearsal "before tag"
  would have rehearsed a pre-bump commit. The release commit becomes its own phase, `release-commit`, so the
  order is `release-commit → staging-rehearsal → tag → publish → mark-released` (v0.2.2 did exactly this by
  plan: S2 release commit, S3 rehearsal, S5 tag; `release-publishing-rel-v0.2.2-plan`). Decision for the
  approver (D1).
- A rehearsal transcript committed after the run would itself be "a commit after the checks". Rule chosen:
  `tag` tags the candidate the transcript names, not the tip; evidence-only commits do not re-cut (D2).
- `staging-rehearsal-passed` is bound, not prose: `node scripts/publish-staging.cjs --check-transcript
  <path>` checks the closing line `[publish:staging] staged <name>@<version> and smoke passed` and that the
  smoke's `--version` line named a full sha (the run had `--expect-commit`); it prints that sha. The
  transcript is written by a new `--transcript <path>` option (the script's own lines; npm/Verdaccio output
  is not in it).
- dl-159 handover: the new phase text, the re-cut rule and the no-identity check name the candidate and the
  release's integration branch, never `main` (`test/cli/staging-rehearsal.test.ts` asserts it); `tag`'s
  existing `on-branch-is-main` / `on: main` are left for `dl-159` A2.4. The spec-015 Revision note does not
  restate "tag on `main`".
- `dl-023` already carries the dated note pointing to `dl-099` (2026-10-09, B3 follow-ups,
  `grep -n "Note (2026-10-09" docs/04_memory/design/dls/dl-023*.md`); its last sentence says the rehearsal and
  re-entry are `task-219`'s "(`backlog`)": amended to name what this task delivers (pending amendment).

**AC classification (T1).** Corrected from the planning labels where the behaviour did not exist yet.

| AC | Class | Why |
|---|---|---|
| 1 — `staging-rehearsal` phase | **red-first** (planned: characterization) | the phase, the transcript writer and its check did not exist; `test/cli/staging-rehearsal.test.ts` |
| 2 — `release-cycle` re-cut re-entry | **red-first** (planned: characterization) | new declared text, pinned by the same suite |
| 3 — `test:no-identity` + `release-submit` declares it | red-first | as planned; `test/cli/test-no-identity.test.ts` |
| 4 — spec-015 Revision note; dl-023 note | documentation | pending amendments (approver) |
| 5 — WORKFLOW.md draws it; task-148's test green | characterization | `test/docs/workflow-md.test.ts` passes unchanged |
| handover — gate binding binds the candidate's stamp | red-first | `test/cli/e2e-smoke-candidate.test.ts` |

### red

`6da49957`: three new suites. `npx jest test/cli/test-no-identity.test.ts test/cli/staging-rehearsal.test.ts
test/cli/e2e-smoke-candidate.test.ts` → **3 suites failed, 16 tests failed / 16**; `test-no-identity` fails to
load (`Cannot find module '../../scripts/test-no-identity.cjs'`).

### green

`8bdfe680`:
- `scripts/test-no-identity.cjs` + `package.json` `test:no-identity`: `GIT_CONFIG_GLOBAL` = the null device,
  `GIT_CONFIG_NOSYSTEM=1`, a throwaway empty `HOME`, `GIT_AUTHOR_*` / `GIT_COMMITTER_*` / `EMAIL` dropped
  (the v0.2.2 S3 command), then `scripts/run-tests.cjs` with the caller's args.
- `scripts/publish-staging.cjs`: `--transcript`, `--check-transcript`, `stagingPassedLine` (the one source of
  the closing line), `checkTranscript`.
- `scripts/e2e-smoke.cjs`: `--candidate` (`prepareCandidate` over injected effects: clean tree or exit 1, pack,
  install into a throwaway prefix, smoke that absolute bin with version + `HEAD`); the report names the
  candidate, not the temp path, so it stays byte-deterministic.
- Config: `release-publishing.yaml` 1.4, `release-cycle.yaml` 1.3, `release-submit.yaml` 1.2
  (`tests.no-identity`), `bindings.yaml` 1.3 (`e2e-smoke-passed` gets `--candidate`; `staging-rehearsal-passed`
  and `tests.no-identity` bound). `.wingfoil/WORKFLOW.md`: the publishing node, a dashed re-cut edge, the
  candidate paragraph, a `release-publishing` sub-diagram.
- Pins moved with the contract: `test/cli/e2e-smoke.test.ts` (binding argv), `test/docs/community-health.test.ts`
  (the bump files are now named by `release-commit`).
`6742a549`: `test/core/workflow-repository-conformance.test.ts` — the three release-publishing warning paths
move to `phases[2]`/`phases[3]`; checkpoints 26 → 27 (`release-publishing.release-commit`). Zero errors.

### refactor — gates (load average 70–90 throughout: 10 parallel agents)

| Command | Result |
|---|---|
| `npm run test:no-identity` (AC 3, the full suite with no identity) | 322 suites / 6078 tests: 6076 passed, 2 failed — `test/core/query-latency.test.ts`, `test/mcp/resource-latency.test.ts` (p95 budgets, load 77). Re-run alone: `npm run -s test:no-identity -- test/core/query-latency.test.ts test/mcp/resource-latency.test.ts --runInBand` → 8/8 |
| `npm run test:coverage` | 6075/6078; the 3 failures are `test/lint/coverage-parity.test.ts`, `spawnSync … ETIMEDOUT` (load 90); re-run alone `npx jest test/lint/coverage-parity.test.ts` → 6/6. Coverage 99.2 / 97.03 / 97.48 / 99.67 (main at the B3 gate, `gate-w3b3-cov.log`: 99.2 / 97.01 / 97.48 / 99.67) |
| `npm run lint`; `npx tsc --noEmit -p tsconfig.json`; `npx tsc -p tsconfig.build.json --noEmit`; `npm run docs:api` | exit 0 each |
| `node scripts/check-governance.cjs --base b56e8721` | 1 wf() commit checked, 0 findings, exit 0 |
| real `--candidate` run, scratch clone of `6742a549` (`git clone --local`, `npm ci`, `node scripts/e2e-smoke.cjs --candidate --report …`) | exit 0 in 6 m 08 s; **54/54 ok**; `ok wingfoil --version = 0.2.2 (6742a549…) — match`; no `wingfoil-candidate-*` left in the temp dir |
| `node scripts/e2e-smoke.cjs --candidate` in this (dirty) worktree | exit 1, "the working tree is not clean …" before packing |
| `node scripts/publish-staging.cjs --check-transcript docs/07_gates/none.md` | exit 1, "no rehearsal transcript at …" |

Not run: `npm run publish:staging` (a real rehearsal and its transcript) — it starts Verdaccio and publishes
to it; the batch notes reserve anything that publishes for the approver.

### review (self, reviewer)

- AC 1: `release-publishing.yaml` 1.4, phase `staging-rehearsal` before `tag`, role `qa`, `cli.run(command:
  "npm run publish:staging -- …")`, `produces:` the transcript, `checks.post: staging-rehearsal-passed(…)`;
  zero errors (conformance suite). AC 2: `release-cycle.yaml` 1.3 description and the `e2e-smoke` / `publishing`
  phase texts. AC 3: script, test, `release-submit.yaml` 1.2 + binding; the no-identity run above. AC 4: pending
  amendments below. AC 5: WORKFLOW.md; `test/docs/workflow-md.test.ts` green.
- Same-class sweep in touched files: every place naming the tag phase as the bump's owner
  (`grep -rn "tag phase" test SECURITY.md docs/user-guide.md CONTRIBUTING.md`) → only `community-health.test.ts`,
  fixed.

### review fixes (2026-10-10, independent review: approve with fixes)

Red `04a2b9c6` (`npx jest test/cli/test-no-identity.test.ts test/cli/staging-rehearsal.test.ts
test/cli/e2e-smoke-candidate.test.ts` → 8 failed, 19 passed); green `78f6954f`; `c1627619` widens one new
regex that stopped at the dot in `e2e-smoke.cjs` (a test defect, not a behaviour change).
1. `noIdentityEnv` also drops `GIT_CONFIG_PARAMETERS`, `GIT_CONFIG_COUNT`, `GIT_CONFIG_KEY_<n>`,
   `GIT_CONFIG_VALUE_<n>` (the reviewer's probe resolved `user.email` through both), and `GIT_CONFIG_GLOBAL`
   names a throwaway file with `user.useConfigOnly = true` (outside the empty `HOME`), so no commit passes
   on an auto-detected identity. Tests: one per channel, and a commit in a fresh repository refused.
2. `tag`: its description and the action's comment say `on: main` names the branch; the commit tagged is the
   one `staging-rehearsal-passed` prints.
3. D3 written down in `release-cycle.yaml`, `WORKFLOW.md` and the spec-015 note: the release commit does not
   re-cut; on the first candidate the rehearsal's smoke stands as its e2e-smoke run. "Both checks run on it"
   removed (`grep -n "Both checks" .wingfoil/WORKFLOW.md .wingfoil/workflows/custom/*.yaml` → nothing).
4. spec-017 §12's checkpoint list: pending amendment below.
5. `scripts/e2e-smoke.cjs`: an error after the run (e.g. an unwritable report) is `error: <msg>` at exit 2,
   cleanup still in `finally`; `node scripts/e2e-smoke.cjs --report /dev/null/x.md -- /nonexistent` → exit 2,
   `error: EEXIST: file already exists, mkdir '/dev/null'`.

Gates on `c1627619`: the task suites (`npx jest` over the 8 suites this task touched) 147/147; `npm run lint`
and `npm run typecheck` exit 0; `node scripts/check-governance.cjs --base b56e8721` 0 findings;
`npm run test:no-identity` (now with `useConfigOnly`) **322 suites / 6083 tests, all passed** (load 41–44).

### Pending amendments (approver)

- `spec-015-packaging-publishing` (§3 paragraph + Revision 2026-10-09):
  `--reason "task-219 (dl-099 §1-§2): §3 states the staging rehearsal's place in the release - the staging-rehearsal phase runs publish:staging on the release candidate with --expect-commit and --transcript, --check-transcript is its check and prints the commit tagged, the release commit does not re-cut the candidate (the rehearsal's smoke stands as its first e2e-smoke run), and a re-cut candidate re-enters both checks. Revision note added."`
- `spec-017-workflow-commands-and-state-deduction` (§12 *Checkpoints* + Revision 2026-10-10; record after 216's and 222's):
  `--reason "task-219: §12's checkpoint list re-measured - release-publishing.release-commit is a new checkpoint, and end-of-life.deprecate and e2e-smoke.gate, evidence-bearing since earlier changes, leave the list; 27 phases, as the conformance test pins. Revision note added."`
- `dl-023-init-cli-e2e-smoke-gate` (the 2026-10-09 note's last sentence):
  `--reason "task-219: the 2026-10-09 note named the staging rehearsal and the candidate re-entry as task-219's with its backlog status; it now names what task-219 delivers, so the note does not go stale with the task's state."`

### Retrospective

- The planning labelled AC 1/2 characterization, but the phase did not exist: config that does not yet exist
  is red-first (evidence: the red run, 16/16 failing).
- A "rehearsal before tag" was impossible while one phase both made the release commit and tagged it; the
  B3 handover was the first place that asked for the candidate's stamp (`git show b56e8721:.wingfoil/workflows/custom/release-publishing.yaml`).
- Under load 70–90 three timing-sensitive suites failed and passed alone (table above).
