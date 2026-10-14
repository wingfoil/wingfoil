---
id: "task-244-publish-release-test-results-coverage"
type: task
title: "Publish each release's test results and coverage"
status: in-review
release: "v0.3"
kind: "feature"
priority: "medium"
tags: ["v0.3", "process", "publishing", "testing", "ci"]
ref: "dl-136"
bug: []
depends_on: ["task-134-report-source-file-coverage-so-untested-file-counts", "task-146-make-suite-result-independent-concurrent-runs-machine-load", "task-207-drive-e2e-smoke-through-fresh-project-use-scenario", "task-238-publish-mcp-registry-github-actions-bound-publish-job"]
tmpl_version: 260703
---

## Description

A release keeps no test results or coverage, so its quality claims cannot be checked. The tag's CI run produces Jest JSON classified per suite, `coverage-summary.json` and `lcov.info`; the summary lands in the repository, the full reports as Release assets.

## Acceptance Criteria

- (red-first) `jest.config.js` `coverageReporters` include `json-summary` and `lcov`; a script classifies Jest JSON into unit / integration / BDD / smoke / API-docs / lint.clean with counts and writes the Markdown summary (commit, tag, run URL, build); unit tests on a JSON fixture.
- (red-first) `publish.yml` `gate` runs the suite with coverage and `--json`, uploads the reports; the task-229 `release` job attaches them; pinned in `publish-pipeline.test.ts`.
- (characterization) `release-submit.yaml` declares the reports under `produces:`; `release-publishing.yaml` the attached assets and the committed summary path; versions bumped; `07_sequencer.md` coverage criteria point to the summary (doc-versioning bump); `spec-015` §3 amended.

## Implementation Notes

- **Size:** M · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-136 (Q1 (c), Q2 (a), Q3 (a), Q4 (a)).
- **Notes:** Proposal key: D25. The spawned `npm publish --dry-run` flake under coverage (`bug-167`) is fixed by task-146 first; this task depends on it.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.
- **Handover from the parallel-release-lines decision (2026-10-07):** `dl-159` (`in-discussion`, to be ratified before the
  `v0.3.0` tag) opens `release/X.Y` maintenance lines beside `main`: patches land on `release/X.Y` and are merged
  forward into `main` with `--no-ff`, never cherry-picked or back-merged; patch tags go on the pushed `release/X.Y`.
  `task-265` and `task-266` (B9) edit `publish.yml` after this task (chain 229 → 238 → 244 → 265 → 266): leave the
  gate's tag-on-main step and the promote `npm stage publish` line as they are apart from what this task needs. Key
  the committed summary path by version, not by branch, and do not assume the committing branch is `main` in
  `release-publishing.yaml`: a 0.3.x summary is committed on `release/0.3` and merged forward, and two lines must
  not write the same path. The `spec-015` §3 Revision note does not restate "tag on `main`".

- **Handover from wave 3 B6 (2026-10-12, W3 B6 follow-ups, `bug-ingest-rel-v0.3-w3b6-review-findings-plan` item B2;
  `task-238`'s developer notes).** This task is the last `publish.yml` writer after `task-238`. The approver runbook's
  step 8 (`sed -n 106,111p .github/workflows/publish.yml`) says a registry refusal "(a version already listed, …)
  fails only this job", but not that re-running a `mcp-registry` job that already succeeded is always refused: the
  registry accepts each version once, so "Re-run failed jobs" after a late approval must not include a succeeded
  `mcp-registry`. Add that sentence to step 8 on this task's touch of the runbook; no criterion changes.

## Execution Notes

Branch `task/task-244-publish-release-test-results-coverage`, worktree `../.wf2-wt/task-244`, cut from `main`
`32d8871b` (main past the pre-batch `db0e2752` only by the Templates DL ingest). Start `dfc6932e`. `bug: []`.

### design (developer, 2026-10-14)

- **depends_on read (dl-015).** `grep -m1 '^status'` → all four `done`. `task-134`: `jest.config.js` `roots`
  includes `src/`, so `coverage-summary.json` lists every source file (`test/lint/coverage-parity.test.ts` holds it):
  the published denominator is honest (`bug-141`, dl-136 Action 2). `task-146`: the dry-run case passed three
  `npx jest --coverage` runs; `bug-167` "not reproduced; hypothesis guarded" — the gate can run the suite under
  coverage. `task-207`: gate reports live at `docs/07_gates/rl-{release.release-line}/rel-{release.version}-<name>.md`
  (e2e-smoke report, staging-rehearsal transcript); this task follows that layout. `task-238`: last `publish.yml`
  writer before me; runbook step 8; gate `timeout-minutes: 30` sized from CI run `38166281488` (prepublishOnly 7m22s);
  the conformance suite reads workflows at HEAD; its AC 3 was deferred to release-publishing (R3), as mine is (D5).
- **Decisions and specs.** `dl-136` `ready` (Q1 (c), Q2 (a), Q3 (a), Q4 (a)); `spec-015` `approved` (§3 amended in
  session 3 as a pending amendment, no "tag on main" restated); `dl-159` `in-discussion` (handover honoured);
  `dl-010` `ready`: **no new dependency** — Jest's `--json --outputFile` and its istanbul reporters only.
  Read against the directives (dl-102 §4): no AC contradicts a ratified spec or DL. Two gaps between dl-136 and the
  ACs are decisions below (D4 staging smoke, D7 CHANGELOG link).
- **Facts the design rests on.** `grep -c coverageReporters jest.config.js` → `0`; `ls scripts/test-report.cjs` →
  absent; `grep -c upload-artifact .github/workflows/publish.yml` → `1`; `grep -c produces
  .wingfoil/workflows/custom/release-submit.yaml` → `0`; release-publishing `publish.produces` → undefined.
  Jest 30's `processResults` (`node_modules/@jest/core/build/index.js`) writes `--outputFile` with a bare
  `writeFileSync`, no `mkdir`: the JSON must go to a directory that already exists → `coverage/` (D8), which the
  coverage run creates and `.gitignore` already ignores. Classification counts on this tree (`find test -name
  "*.test.ts"` → 411; 2 latency suites run apart): `*.integration.test.ts` → 43; files citing
  `docs/02_requirements/02_bdd/features/….feature` anywhere → 34, in the header comment → 31 (D2; superseded by review F2: a `.feature` cited in any spelling → 59, see the independent review section); BDD ∩
  integration → 0; the three exact-path files cite no feature.

**Design.**
- **jest.config.js** — `coverageReporters: ['json-summary', 'lcov', 'text']` (D5): `coverage/coverage-summary.json`,
  `coverage/lcov.info` (+ `lcov-report/`), and the console table the notes cite. `collectCoverageFrom`, thresholds,
  roots untouched; the header comment names `test:report`.
- **package.json** — one new script line, `"test:report": "jest --coverage --json --outputFile=coverage/jest-results.json"`
  (beside `test:coverage`; own line, merges after 241/234/215). `prepublishOnly` unchanged.
- **scripts/test-report.cjs** (+ `scripts/test-report.d.cts`) — pure, offline, deterministic (no clock, no host
  detail; the JSON's `startTime`/`duration` never printed). Usage:
  `node scripts/test-report.cjs --results <jest.json> --coverage-summary <coverage-summary.json> --build-info <dist/build-info.json> --commit <sha> --out <summary.md> [--tag <tag>] [--run-url <url>] [--root <dir>]`
  (`--root` defaults to the cwd; absent `--tag`/`--run-url` print `n/a`). Exit `0` summary written, whatever the
  tests' verdict (the verdict is in the summary; release-submit records a red candidate too); `1` invalid input
  (unreadable/unparsable file, no `testResults` array, an assertion status outside the known set, a test file outside
  `--root`, an unreadable test source, a coverage summary without `total`, a build-info without `version`/`commit`);
  `2` usage (unknown option, missing value, missing required option, `--commit` not 40 or 64 hex digits — the
  `--expect-commit` rule of `publish-staging.cjs`). Errors on stderr as `test-report: <message>`.
  - **Classification, per test file, first rule that matches** (exported table, one home): `lint.clean` =
    `test/lint/lint-clean.test.ts`; `API-docs` = `test/docs/api-docs.test.ts`; `smoke` = `test/cli/e2e-smoke.test.ts`;
    `BDD` = the file's leading block comment (the first `/* … */` before any code) contains
    `docs/02_requirements/02_bdd/features/<path>.feature`; `integration` = name ends `.integration.test.ts`;
    `unit` = every other file. Paths relative to `--root` with `/`.
  - **Counts per class**: files, tests (assertions), passed (`passed`), failed (`failed`), skipped (`pending`,
    `skipped`, `todo`, `disabled`); plus a total row. A suite with `status: failed` and no failed assertion (it did
    not run) is listed as a failure "suite failed to run". Verdict `passed` iff no failure.
  - **Markdown** (fields per dl-136 / dl-111): `# Test results — <tag, else commit>`; a two-column field table with
    rows, in order, `Commit` (`` `<sha>` ``), `Tag`, `CI run`, `Build` (`` `<version> (<commit>)` `` from build-info,
    the `--version` form), `Result` (`passed`/`failed`); `## Suites`: one table, header
    `| Suite | Files | Tests | Passed | Failed | Skipped |`, rows `unit, integration, BDD, smoke, API-docs,
    lint.clean, total` in that order; one paragraph stating the rules above, that the latency suites
    (`test/latency-suites.cjs`) run apart, and that the staging smoke is the CI run's `stage` job (D4);
    `## Coverage`: header `| Metric | Covered | Total | % |`, rows `statements, branches, functions, lines`, the
    `total` entry's `covered`/`total`/`pct` as given; `## Failures` only when there is one: `` - `<file>` — <fullName> ``
    (or `— suite failed to run`), sorted by file then name, code-point order.
- **publish.yml** (D1 (a)). `env.REPORTS_ARTIFACT: wingfoil-test-reports` beside `TARBALL_ARTIFACT`. **gate**, in order:
  tag-on-main (untouched, dl-159), the two tag checks, `npm ci`, `npm run build`, `npm run test:report`,
  `npm run lint` (prepublishOnly's three commands, the test one with coverage + JSON: one suite run), then
  `node scripts/test-report.cjs --results coverage/jest-results.json --coverage-summary coverage/coverage-summary.json
  --build-info dist/build-info.json --commit "$GITHUB_SHA" --tag "$GITHUB_REF_NAME"
  --run-url "$GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID" --out coverage/test-results.md`,
  the dry-run, the pack, the tarball upload (still the gate's FIRST `upload-artifact`, so the existing stage/promote
  `find`s keep their meaning), and LAST the reports upload: `name: ${{ env.REPORTS_ARTIFACT }}`, `path` the four files
  `coverage/jest-results.json`, `coverage/coverage-summary.json`, `coverage/lcov.info`, `coverage/test-results.md`,
  `if-no-files-found: error`. The coverage threshold is now enforced at the tag (Q3 (a)). **release**: after the notes
  step, `actions/download-artifact` (the pinned SHA, no new action) `name: ${{ env.REPORTS_ARTIFACT }}`, `path:
  test-reports`, no `if:` (act has an artifact server); then the wait; `gh release create` names the four
  `test-reports/<file>` paths explicitly. Permissions, environments, `RELEASE_MAKE_LATEST`, stage, promote (its
  `npm stage publish` line, dl-159) and mcp-registry unchanged; `gate` timeout stays 30 (the tag run verifies it, D5).
  **Header**: gate/release lines name the reports (dl-136, task-244); runbook step 7 says the release carries the
  four reports; step 8 gains (B6 handover): "Re-running an `mcp-registry` job that succeeded is always refused — the
  registry accepts each version once — so a re-run after a late approval must not include a succeeded one (Re-run all
  jobs would)."
- **release-submit.yaml 1.2 → 1.3** — `pre-release-checks` (qa) gains two actions and a `produces` (checks unchanged):
  `'cli.run(command: "npm run test:report")'`,
  `'cli.run(command: "node scripts/test-report.cjs --results coverage/jest-results.json --coverage-summary coverage/coverage-summary.json --build-info dist/build-info.json --commit <candidate sha> --out <the produces path>")'`;
  `produces: ["docs/07_gates/rl-{release.release-line}/rel-{release.version}-test-results-candidate.md"]` (D3);
  description: the candidate's summary is the evidence `approve-release` reads.
- **release-publishing.yaml 1.6 → 1.7** — `publish` gains `produces:`
  `docs/07_gates/rl-{release.release-line}/rel-{release.version}-test-results.md` and
  `…/rel-{release.version}-coverage-summary.json`; its description: the `release` job attaches `jest-results.json`,
  `coverage-summary.json`, `lcov.info`, `test-results.md` (the tag run's, dl-136 Q3 (a)); afterwards they are fetched
  with `gh release download <tag> --pattern test-results.md --pattern coverage-summary.json` and committed at the
  produces paths on the branch the release is integrated on, merged forward like the release's other commits — keyed by
  version, so two release lines never write one path; no branch named (dl-159). `checks.post[0]` prose: "…, its
  GitHub Release created with the test reports attached and its MCP Registry listing published" (same prose check,
  task-229/238 precedent). Phase list unchanged (pinned by `staging-rehearsal.test.ts`). D7: `release-commit`'s
  description adds that the CHANGELOG section links the summary path.
- **07_sequencer.md 1.8 → 1.9** (date 2026-10-14), D6; **00_index.md** row and ranges follow
  (`test/docs/vision-index.test.ts`). **WORKFLOW.md**: the release-submit node and the publishing sub-diagram's
  `publish` node name the reports (own lines). **spec-015** §2 (`test:report`), §3 stage 1 and 5, Revision note:
  pending amendment (session 3).

**AC classification (T1) and what qa pins.** Corrected from the planning labels where the text is new (the
task-219/229/238 precedent).

| AC | Class | Why |
|---|---|---|
| 1 — `coverageReporters`; classifier script; unit tests on a JSON fixture | **red-first** | no `coverageReporters` (grep → 0), no script |
| 2 — gate runs coverage + `--json`, uploads; release attaches; pinned | **red-first** | one `upload-artifact`; no `test:report` |
| 3 — release-submit / release-publishing declare; versions; sequencer; spec-015 | **red-first** for the two YAMLs (no `produces`); **characterization** for `00_index` ↔ `07_sequencer` (`vision-index.test.ts`, existing, stays green); spec-015: pending amendment, read in review | |

qa pins (new file `test/cli/test-report.test.ts`; everything else in `test/cli/publish-pipeline.test.ts`, whose only
B7 writer is this task; plus the two existing pins named below):
1. **AC 1, config** — `require('<root>/jest.config.js').coverageReporters` `toEqual(['json-summary', 'lcov', 'text'])`;
   `package.json` `scripts['test:report']` `toBe('jest --coverage --json --outputFile=coverage/jest-results.json')`.
2. **AC 1, script API** (`scripts/test-report.d.cts`, added by red so failures are assertions or a missing module,
   not type errors): `SUITE_CLASSES` = `['unit','integration','BDD','smoke','API-docs','lint.clean']`;
   `classifySuite(relPath: string, source: string): SuiteClass` — one case per rule, precedence (an exact-path file
   whose header cites a feature stays its exact class; a `.integration.test.ts` with a feature header is `BDD`), a
   feature path cited only after the header → not BDD, a fixture string → not BDD;
   `summarizeResults(results: unknown, root: string, readSource: (relPath: string) => string): ResultsSummary`
   (`{ classes: Record<SuiteClass, ClassCounts>, total: ClassCounts, failures: readonly { file: string; test: string | null }[], passed: boolean }`,
   `ClassCounts = { files, tests, passed, failed, skipped }`) — counts per class and total, the four skipped
   statuses, a suite that failed to run (`test: null`), an unknown status → throws, a path outside root → throws;
   `coverageTotals(summary: unknown): CoverageTotals` (`{ statements, branches, functions, lines }` each
   `{ covered, total, pct }`) — throws without `total`;
   `formatSummary(results, coverage, meta: { commit: string; tag?: string; runUrl?: string; build: string }): string`
   — the layout above: title, the five field rows in order with `n/a` for an absent tag/run URL, the suites table
   header and row order, the coverage rows, `## Failures` present only on a failure, sorted; the rule paragraph
   contains each rule's path; **determinism**: the same results with `testResults` shuffled and every
   `startTime`/`endTime`/`duration` changed → byte-identical output, and no `\d{4}-\d{2}-\d{2}` date in it.
   Fixture: a synthetic Jest 30 `--json` file in `test/fixtures/test-report/` (field names of `FormattedTestResults`
   in `@jest/test-result`'s typings) with one file per class, a failed, a pending and a todo assertion and a suite
   that failed to run; sources come through `readSource`. **No fixture file may end in `.test.ts`** (testMatch would
   collect it); CLI cases build their tree in an `mkdtemp` root.
3. **AC 1, CLI** (spawn `node scripts/test-report.cjs`): writes `--out` and exits 0 (also for a red results file);
   exit 2 + `test-report:` for an unknown option, a missing `--results`/`--commit`/`--out`, a short `--commit`;
   exit 1 for an unreadable results file and a results file with no `testResults`.
4. **AC 2** (`publish-pipeline.test.ts`): the gate order test becomes `git merge-base --is-ancestor "$GITHUB_SHA"
   origin/main`, the two `check-release-tag.cjs` calls, `npm ci`, `npm run build`, `npm run test:report`,
   `npm run lint`, `node scripts/test-report.cjs`, `npm publish --dry-run --ignore-scripts`, `npm pack
   --ignore-scripts --pack-destination`; the three middle commands equal `pkg.scripts.prepublishOnly.split(' && ')`
   with `npm test` → `npm run test:report` (parity with ci.yml's prepublishOnly stays derived, not restated); the
   classify step's `run` contains each argument listed in the design; two gate uploads, the tarball first, the
   reports last with `name: ${{ env.REPORTS_ARTIFACT }}`, `env.REPORTS_ARTIFACT === 'wingfoil-test-reports'`, `path`
   = the four `coverage/` files, `if-no-files-found: error`; release: order notes → reports download (same name,
   `path: test-reports`, no `if`) → wait → create, and the create `run` contains the four `test-reports/` files;
   stage and promote download only `TARBALL_ARTIFACT`; header names `dl-136` and `task-244`; runbook step 8 matches
   `/succeeded/`, `/always refused/`, `/accepts each version once/`. **Existing pin to update**:
   `test/cli/ci-workflow.test.ts:111` (`publishGate` contains `npm run prepublishOnly`) → contains `npm ci`,
   `npm run build`, `npm run test:report`, `npm run lint`. The tag-on-main step and the promote `npm stage publish`
   line stay covered by their existing tests, unchanged.
5. **AC 3** (`publish-pipeline.test.ts`, new describe): `release-submit.yaml` `version >= 1.3` and its header
   history names `1.3` and `task-244` (bug-314 form); `pre-release-checks.actions` `toEqual` the two `cli.run`
   strings above; `.produces` `toEqual` the candidate path; `checks.pre` unchanged. `release-publishing.yaml`
   `version >= 1.7` + history; `publish.produces` `toEqual` the two paths; its description contains the four asset
   names and `gh release download`, and does not match `/\bmain\b/`; `release-commit` description names the summary
   path (D7). Every new produces path contains `{release.version}` and no branch name (`main`, `release/`).
   `07_sequencer.md` `**Version:** 1.9` and its v0.3 and v0.4 coverage criteria name
   `rel-{version}-test-results.md` (D6). **Existing pins to update** in
   `test/core/workflow-repository-conformance.test.ts`: the checkpoint list drops `release-submit.pre-release-checks`
   and `release-publishing.publish` (30 → 28; title gains "28 from task-244: …"), and the unbound-check row of
   `release-publishing` `phases[3].checks.post[0]` takes the new prose.

**Files I expect to touch (session 3).** `jest.config.js`, `package.json` (one line), `scripts/test-report.cjs`
(new; the `.d.cts` comes from red), `.github/workflows/publish.yml`, `.wingfoil/workflows/custom/release-submit.yaml`
(1.3), `.wingfoil/workflows/custom/release-publishing.yaml` (1.7), `.wingfoil/WORKFLOW.md`,
`docs/01_vision/07_sequencer.md` (1.9), `docs/01_vision/00_index.md`; uncommitted: `spec-015` (pending amendment).
Not touched: `bindings.yaml` (the new actions use the bound `cli.run`), `.gitignore` (`coverage/` already ignored),
`e2e-smoke.yaml` (its report is task-207's).

**Decisions for the approver** (recommendation first).
- **D1 gate shape — (a)** split prepublishOnly into `npm run build` / `npm run test:report` / `npm run lint`: one
  suite run, the same command release-submit's candidate run uses (dl-136 Q3 rationale); costs spec-015 §2/§3 text and
  two existing pins. (b) keep `npm run prepublishOnly` and add a coverage run: the suite twice (~7 min more on a
  30-min timeout). (c) an env var read by `scripts/run-tests.cjs`: prepublishOnly stays literal, but the behaviour is
  implicit and not expressible as a no-shell `cli.run` (dl-090 Q3 (a)) for the candidate.
- **D2 BDD rule — header comment** (31 files): "citing" read as the file's declared subject; the literal "anywhere"
  rule (34) adds `test/release-health/measure.test.ts` (a fixture string, false positive) and two files with one BDD
  block (`test/core/context.test.ts`, `test/core/memory-add-date-author.test.ts`), which stay unit.
- **D3 candidate evidence — summary only** at `…-test-results-candidate.md`; the tag run's summary and
  `coverage-summary.json` are the committed record (Q1 (c)). Alternatives: also the candidate's coverage JSON; nothing
  committed.
- **D4 staging smoke — a fixed line** pointing to the run's `stage` job (and the committed staging-rehearsal
  transcript); not in the ACs. Alternative: `--transcript` in the stage step and a fifth asset (changes the pinned
  stage command).
- **D5 coverageReporters exactly `['json-summary', 'lcov', 'text']`**: Jest's default `clover` and `json`
  (`coverage-final.json`, 680K) have no reader (`grep -rn "coverage-final\|clover" scripts test src` → nothing);
  `text` keeps the console table. Alternative: the AC's two added to the defaults.
- **D6 07_sequencer** — the v0.3 and v0.4 coverage criteria point to the summary; v0.1/v0.2 (released before
  dl-136) keep their text with "(no published summary: before dl-136)".
- **D7 CHANGELOG link** (dl-136 Decision, in no AC) — **in-task**: one sentence in `release-commit`'s description,
  same file and bump. Alternative: a follow-up element.
- **D8 report location — `coverage/`** (exists after the coverage run, ignored); `test-reports/` would need a
  `mkdir` and a `.gitignore` line.

**Deferred (ruling D5, as task-238 R3)** — to v0.3 release-publishing, on the `v0.3.0` tag run: the gate's duration
under coverage against `timeout-minutes: 30`; the release job's same-run artifact download with `contents: write`
only; the four assets on the Release; the artifact retention against the 30-day re-run window. Local runs of the
classifier on a real Jest JSON (session 3): `bash ../devloop-kit/waitslot.sh && npm run test:report -- --maxWorkers=2`
(dl-170), then the script on its output.

### red (qa)

Red commit `2d6f836a` (T4 is measured from it). Test files and fixtures only; nothing under `scripts/`,
`.github/`, `jest.config.js`, `package.json` or `.wingfoil/`.

**Files.** New: `test/cli/test-report.test.ts`, `test/fixtures/test-report/jest-results.json` (synthetic Jest 30
`--json`, `FormattedTestResults` field names: seven files, one per class plus a second unit file; a failed, a
pending, a todo, a skipped and a disabled assertion; `test/cli/e2e-smoke.test.ts` failed to run),
`test/fixtures/test-report/coverage-summary.json`. Edited: `test/cli/publish-pipeline.test.ts` (the gate-order
test, plus two new describes), `test/cli/ci-workflow.test.ts` (the `publishGate` pin at :111),
`test/core/workflow-repository-conformance.test.ts` (checkpoint list 30 → 28 and its title; the
`release-publishing` `phases[3].checks.post[0]` unbound row).

**Interface without the `.d.cts`.** The design has red add `scripts/test-report.d.cts`; this red's scope excludes
`scripts/`, so the test declares the design's interface locally (`TestReportModule`) and `require`s the script
inside each test: a missing script fails each test on `Cannot find module`, never the file, and the CLI cases fail
on their exit-code / `^test-report: ` assertions. The `.d.cts` stays for green (it is not a test file).

**Per AC.**
- **AC 1 (red-first)** — `test-report.test.ts`: `jest.config.js coverageReporters are exactly json-summary, lcov
  and text (ruling D5)`; `package.json declares test:report …`; `classifySuite` (SUITE_CLASSES order; the three
  exact paths, also with a feature header; BDD by leading block comment; `.integration.test.ts` with a feature
  header → BDD; without → integration; a feature cited after the header → unit; in a fixture string → unit;
  else unit); `summarizeResults` (per-class and total counts with the four skipped statuses; failures incl. the
  suite that failed to run as `test: null`; a green run; throws on an unknown status, a file outside the root,
  no `testResults`); `coverageTotals` (the `total` entry's covered/total/pct; throws without `total`);
  `formatSummary` (title by tag / by commit; Commit, Tag, CI run, Build, Result rows in order, `n/a`; the Suites
  table header and row order with counts; the rule paragraph names each rule's path, `test/latency-suites.cjs`
  and the `` `stage` `` job; the Coverage table; `## Failures` sorted, absent on green; determinism:
  shuffled `testResults`/assertions and changed timings → byte-identical, no date); the CLI (writes `--out`, exit
  0 on a red results file; exit 2 + `test-report:` for an unknown option, missing `--results`/`--commit`/`--out`,
  a short `--commit`; exit 1 + `test-report:` for an unreadable results file and one with no `testResults`).
- **AC 2 (red-first)** — `publish-pipeline.test.ts`: `gate asserts tag-on-main + tag↔version, then build,
  test:report, lint, the summary, …` (updated) and describe `test reports (task-244)`: `REPORTS_ARTIFACT`; the
  three steps equal prepublishOnly's split with `npm test` → `npm run test:report`; the classify step's seven
  arguments; two uploads, tarball first, reports last with the four files and `if-no-files-found: error`;
  stage/promote download the tarball only; release order notes → download (`path: test-reports`, no `if:`) →
  wait → create; create names the four `test-reports/` files; header names `dl-136`, `task-244`; runbook step 8
  `succeeded` / `always refused` / `accepts each version once`. `ci-workflow.test.ts`: the publish gate contains
  `npm ci`, `npm run build`, `npm run test:report`, `npm run lint`. The tag-on-main and promote pins are untouched.
- **AC 3 (red-first for the YAMLs and the sequencer; characterization for `00_index` ↔ `07_sequencer`)** —
  describe `release workflows declare the test reports (task-244)`: release-submit ≥ 1.3 with `1.3` and
  `task-244` on its version line (bug-314); `pre-release-checks` actions `toEqual` the design's two `cli.run`
  strings and `produces` the candidate path; its six pre checks unchanged (passes now: characterization);
  release-publishing ≥ 1.7 + history; `publish.produces` the two paths; its description names the four assets
  and `gh release download`, no `\bmain\b`; its post check is the new prose; `release-commit` names `CHANGELOG`
  and `rel-{release.version}-test-results.md` (D7); every declared test-results/coverage produces path holds
  `{release.version}` and no branch; `07_sequencer.md` ≥ 1.9, v0.3/v0.4 coverage criteria name a
  `rel-…-test-results.md` summary, v0.1/v0.2 carry `(no published summary: before dl-136)` (D6).
  Conformance (reads HEAD): checkpoint list without `release-submit.pre-release-checks` and
  `release-publishing.publish`; the post-check row's new prose. `test/docs/vision-index.test.ts`: existing,
  unchanged, green now (characterization; it fails if the sequencer moves without `00_index.md`).

**Run.** `npx jest test/cli/test-report.test.ts test/cli/publish-pipeline.test.ts test/cli/ci-workflow.test.ts
test/core/workflow-repository-conformance.test.ts test/docs/vision-index.test.ts --maxWorkers=2` → 4 suites
failed, 1 passed; 59 failed, 88 passed (147 tests). Per file: `test-report.test.ts` 38 failed / 0 passed (the two config
tests on `Received: undefined`; the module tests on `Cannot find module …/scripts/test-report.cjs`; the CLI tests on
`Expected: 0|2, Received: 1` or `Expected pattern: /^test-report: /m`); `publish-pipeline.test.ts` 18 failed / 48
passed (e.g. `Expected: "wingfoil-test-reports" Received: undefined`, `Expected: >= 1003 Received: 1002`,
`Expected: >= 1009 Received: 1008`); `ci-workflow.test.ts` 1 failed / 14 passed (`ArrayContaining ["npm ci",
"npm run build", "npm run test:report", "npm run lint"]`); `workflow-repository-conformance.test.ts` 2 failed / 13
passed (checkpoints `+ Received + 2`; the unbound row `- Expected - 1 + Received + 1`); `vision-index.test.ts` 13
passed. `npx eslint` on the four test files → clean.

**Review send-back (2026-10-14), red commit `38580877`** (T4 for these rows is measured from it), in
`test/cli/test-report.test.ts` only. F1, describe `the verdict: Jest success and suite-level failures (review F1)`:
`success: false` with no failed assertion is not passed (`Expected: false, Received: true`); the summary's Result
reads failed for it (`Expected: "failed", Received: "passed"`); a failed suite whose assertions all passed is listed
and not as "suite failed to run" (`expect(…test).not.toBeNull()`, `Received: null`; the design names no other
label, so only "listed, not that label" is pinned); `success: true` with no failure is passed (characterization,
green). The two existing green-run rows now set `success: true`. F2 (ruling D2's wording, a `.feature` named
anywhere in the header comment): a bare `P5.1.4-cli-ux.feature` header citation and a relative
`p5-interaction/P5.1.4-cli-ux.feature` one are BDD (`Expected: "BDD", Received: "unit"`); a bare name after the
header stays unit (characterization, green). No live-repo count is pinned. Run: `npx jest
test/cli/test-report.test.ts --maxWorkers=2` → 5 failed, 40 passed (45).

**Send-back F4 (approver ruling, 2026-10-14), red commit `b6002ee3`**: `test/cli/publish-pipeline.test.ts` row
`states each value and its sources … in the header` (describe `job timeouts (task-238) — dl-057 (b)`) pins the
gate's `timeout-minutes` at 45 (was 30); the header check is unchanged (it reads `gate 45` once the header says so).
Run: `npx jest test/cli/publish-pipeline.test.ts --maxWorkers=2` → 1 failed (`Expected: 45, Received: 30`), 65 passed.

### green (developer, 2026-10-14)

Approver rulings D1–D8 as recommended (`w3-b7-notes.md`, 2026-10-14). Commits `c73905ba` (the implementation) and
`ac25373a` (two of my own lines that red's regexes read on one line: runbook step 8's "accepts each version once" was
wrapped across two comment lines, and the v0.3/v0.4 sequencer criteria put the summary path on a continuation line;
both rewritten, no red file touched).
- `jest.config.js` `coverageReporters: ['json-summary', 'lcov', 'text']`; `package.json` `test:report` (one line).
- `scripts/test-report.cjs` + `scripts/test-report.d.cts` (the `.d.cts` matches red's local `TestReportModule`;
  qa may not write under `scripts/`). Red's readings honoured: `formatSummary` takes `summarizeResults`' output; a
  suite that failed to run is 1 file, 0 tests, `failed` 0, and is listed as `suite failed to run`; Commit and Build
  cells in backticks; the CLI's exit 0/1/2 with `test-report:` on stderr.
- `publish.yml`: `env.REPORTS_ARTIFACT`; gate steps `npm run build` / `npm run test:report` / `npm run lint`, the
  classifier (`run: >-`, one line once folded), the reports upload as the gate's last step; release downloads
  `test-reports` (the pinned `download-artifact`, written `- uses:` first so the pin table's line form holds) and
  `gh release create` names the four files; header (gate, release, runbook 7 and 8, the timeout paragraph says gate
  now runs the suite with coverage and that the v0.3.0 tag run checks 30 minutes, ruling D5).
- `release-submit.yaml` 1.3, `release-publishing.yaml` 1.7 (history on each version line), `07_sequencer.md` 1.9
  (date 2026-10-14) and `00_index.md` (row, Last indexed), `WORKFLOW.md` (the release-submit node and the publishing
  `publish` node only).
- Red → green: `npx jest test/cli/test-report.test.ts test/cli/publish-pipeline.test.ts test/cli/ci-workflow.test.ts
  test/core/workflow-repository-conformance.test.ts test/docs/vision-index.test.ts test/cli/run-tests.test.ts
  test/cli/staging-rehearsal.test.ts test/docs/workflow-md.test.ts test/cli/publish-secrets.test.ts
  test/cli/test-no-identity.test.ts --maxWorkers=2` at `c73905ba` → 204/206 (the two lines above); after
  `ac25373a`, `npx jest test/cli/publish-pipeline.test.ts test/docs/vision-index.test.ts --maxWorkers=2` → 79/79.
  Red's 59 failures → 0.

### refactor (developer, 2026-10-14)

| Command | Result |
|---|---|
| `bash ../devloop-kit/waitslot.sh && npm run test:report -- --maxWorkers=2` at `ac25373a` (07:59–08:23Z, load 6.9 at start; log `devloop-kit/task-244-test-report.log`) — the full suite with coverage AND this task's own reports | 410 suites, 7467 tests, 1 failed: `test/docs/name-resolvability.test.ts` on `spec-015…\|path\|test-results.md`, a backticked bare file name in my uncommitted spec-015 amendment; unbackticked → `npx jest test/docs/name-resolvability.test.ts --maxWorkers=2` 11/11. Coverage **99.32 / 97.23 / 97.98 / 99.71**, equal to the B6 baseline in every column. `coverage/jest-results.json` written (6,163,869 bytes), `coverage-summary.json` 38,673, `lcov.info` 302,439 |
| `node scripts/test-report.cjs --results coverage/jest-results.json --coverage-summary coverage/coverage-summary.json --build-info dist/build-info.json --commit "$(git rev-parse HEAD)" --out coverage/test-results.md` on that real run | exit 0; unit 333 files / 6343 tests (1 failed, the one above), integration 43 / 542, BDD 31 / 545, smoke 1 / 35, API-docs 1 / 1, lint.clean 1 / 1, total 410 / 7467; coverage rows equal the console table; Build `0.2.2 (ac25373a…)`; `## Failures` lists the one failure. The counts match the design's (43 integration, 31 BDD); review F2 changes them to 37 integration, 59 BDD (independent review section) |
| `npm run lint` | exit 0 |
| `bash ../devloop-kit/waitslot.sh && npm run docs:api && npm run typecheck` | exit 0, exit 0 |
| `node scripts/check-governance.cjs --base db0e2752` | 0 findings |
| `node scripts/lint-claims.cjs --base db0e2752` | warn-only; in this file the two "unchanged" lines of the design and red notes (plan statements; established by the T4 and dl-159 greps below) |

The spec-015 pending amendment was in the working tree for every run above. No `src/` change, so coverage could not
move by this task; the run-dependent `memory-transition.ts:468/:560` branches landed covered in this run.

### self-review (developer, 2026-10-14)

- **AC 1** met: config and script, `test-report.test.ts` 38/38. **AC 2** met: `publish-pipeline.test.ts` and
  `ci-workflow.test.ts` green. **AC 3** met: both YAMLs, versions, sequencer + index (`vision-index.test.ts`),
  conformance at HEAD (28 checkpoints); spec-015 §2/§3 + Revision note as a pending amendment.
- **T4:** `git log --first-parent --no-merges --format=%h 2d6f836a..HEAD -- test/cli/test-report.test.ts
  test/fixtures/test-report/jest-results.json test/fixtures/test-report/coverage-summary.json
  test/cli/publish-pipeline.test.ts test/cli/ci-workflow.test.ts test/core/workflow-repository-conformance.test.ts`
  → empty.
- **dl-159 handover:** `git diff 32d8871b HEAD -- .github/workflows/publish.yml | grep -nE "^[-+].*(merge-base|stage
  publish|Tag commit is on main)"` → nothing (tag-on-main step and promote line untouched); `git diff 32d8871b HEAD --
  .github/workflows/publish.yml .wingfoil docs/01_vision | grep -E "^\+" | grep -E "\bmain\b"` → nothing, and the
  same on the spec-015 diff → nothing: no added line names `main`, the Revision note included. Positive case: the
  produces paths carry `{release.version}` (pinned by `every new produces path is keyed by {release.version}`).
- **Same-class sweep in touched files:** every `uses:` keeps the `- uses: <action>@<sha> # <tag>` line form (the pin
  table passes); no new action, no secret (`grep -n "secrets\." .github/workflows/publish.yml` → nothing); no
  latency token in publish.yml (`run-tests.test.ts` green).
- **Unasserted (deferred by ruling D5 to v0.3 release-publishing):** the gate's duration with coverage against 30
  minutes; the release job's same-run download with `contents: write` only; the four assets on the Release (the Jest
  JSON is ~6 MB); artifact retention against the 30-day re-run window. Recorded in the publish.yml header.

### Pending amendments (approver)

- `spec-015-packaging-publishing` (§2 `test:report`, §3 stage 1 and stage 5, Revision 2026-10-14):
  `--reason "task-244 (dl-136 Q1 (c), Q2 (a), Q3 (a); approver ruling D1 (a) 2026-10-14): §2 declares test:report, the suite once with coverage and Jest's JSON into coverage/; §3 stage 1 runs prepublishOnly's three commands as three steps with the test one as test:report, writes the Markdown summary with scripts/test-report.cjs and uploads the four reports as a second artifact; stage 5 attaches them to the GitHub Release. Revision note added; prepublishOnly itself is unchanged."`

### Retrospective

- Two red failures after green were my own line wrapping: a regex on one line meets a sentence wrapped across two
  comment lines. Writing a pinned phrase on one line from the start would have saved a round.
- The full coverage run doubled as this task's own acceptance: `npm run test:report` produced the real inputs the
  classifier then summarised, and it caught a dangling backticked name in the uncommitted spec amendment, which a
  targeted run would have missed.

### independent review (2026-10-14) and fixes (developer)

Independent review: approve with fixes. F1 and F2 done here; F4/F5 wait for the approver's ruling (not touched).
qa send-back red `38580877` (`test/cli/test-report.test.ts`: 5 red rows + 2 characterization; its two existing
green-run rows now set `success: true`, the fixture's top-level `success` being false); T4 for that file is measured
from it. Fix commit `a402e4c4` (`scripts/test-report.cjs`, `scripts/test-report.d.cts`).
- **F1.** `summarizeResults` returns `passed` only with no failure AND `results.success !== false`: Jest's `success`
  is false on a reporter error, which a missed coverage threshold is, and no assertion records it; the summary's
  Result then reads `failed`. A suite with `status: failed` whose assertions all passed (an error in a hook such as
  `afterAll`) is a failure with `test: 'suite error outside its tests'`, printed `` - `<file>` — suite error outside
  its tests ``; `suite failed to run` (`test: null`) stays for a suite with no assertion at all. The rule paragraph
  the summary prints says the result is failed also when Jest reports the run unsuccessful with no failure.
- **F2.** BDD = the leading block comment cites a `.feature` file in any spelling (full path, relative path, bare
  name): `/[\w./-]*\w\.feature\b/`; a citation after the header still does not count. The printed rule, the script
  header and the `.d.cts` say so. spec-015's amendment states no BDD rule (`grep -n "BDD" ` on its diff → only the
  class list), so it is unchanged by F2.
- **Live count, recomputed** with the classifier over `git ls-files "test/*.test.ts"` minus `test/latency-suites.cjs`
  (410 files): unit 311, integration 37, BDD 59, smoke 1, API-docs 1, lint.clean 1 (was 333 / 43 / 31 under the
  full-path rule). The 28 new BDD files cite their features by bare name or relative path (sampled: `measure.test.ts`
  → `P1.2-versioning-audit-trail.feature`, `query-latency.test.ts` → `P1.5-memory-search.feature`,
  `directives/schema.test.ts` → `p3-directives/P3.5-project-directives.feature`); 6 of them were integration.
- **Runs.** `npx jest test/cli/test-report.test.ts --maxWorkers=2` → 45/45 (send-back red: 5 failed, 40 passed).
  `npm run lint` → exit 0. No full run (scripts/ is outside `collectCoverageFrom`).
- **T4.** `git log --first-parent --no-merges --format=%h 38580877..HEAD -- test/cli/test-report.test.ts` → empty;
  `git log --first-parent --no-merges --format=%h 2d6f836a..HEAD --` on the other five red files → empty; on
  `test/cli/test-report.test.ts` from `2d6f836a` it lists only `38580877`, the qa agent's send-back.
