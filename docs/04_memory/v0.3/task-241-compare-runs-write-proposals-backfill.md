---
id: "task-241-compare-runs-write-proposals-backfill"
type: task
title: "Compare runs, write proposals and backfill the v0.1 and v0.2 baselines"
status: approved
release: "v0.3"
kind: "feature"
priority: "medium"
tags: ["v0.3", "process", "release-health", "scripts"]
ref: "dl-089"
bug: ["bug-344-the-release-health.measure-binding-passes-neither-any-node-nor-max-workers-to-measure.cjs", "bug-332-a-test-imports-ajv-which-package.json-does-not-declare"]
depends_on: ["task-231-measure-git-history-process-conformance-external-metrics", "task-232-measure-build-test-coverage-example-latency-install-metrics", "task-233-measure-static-memory-metrics-including-fix-share"]
tmpl_version: 260703
---

## Description

`compare.cjs` classifies every metric against the previous run (re-measuring like-for-like across catalogue versions), evaluates floors, settles the previous proposals and writes `RH-<version>-NN` proposals for untracked findings; the two baselines are produced so v0.3 compares against two real runs.

## Acceptance Criteria

- (red-first) improved/stable/regressed/new/not-comparable with dl-089's tolerances; a cross-version comparison re-measures the previous point; three-run trend shown; unit-tested.
- (red-first) `propose` searches Memory for a tracking element before proposing; G07/G10/G14 and Q01/Q02-at-tag breaches are flagged for immediate `bug-ingest` (§5).
- (characterization) v0.1 measured at `5b16ab61`, v0.2 at `v0.2.1`; both reports committed under `docs/08_health/` (`paths.health`); the provisional v0.2 table in dl-089 §7 is compared and differences explained.

## Implementation Notes

- **Size:** M · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-089 §3, §4, §5, §7.
- **Features:** P4.1.
- **Notes:** Proposal key: D18.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

- **Handover from wave 3 B5 (2026-10-11, W3 B5 follow-ups, `bug-ingest-rel-v0.3-w3b5-review-findings-plan` item 12;
  `task-231`'s independent review, finding F7).** Measured on `main` at `29b8406a`; no criterion changes. With
  `--previous <rev>`, `measure.cjs` writes placeholders in the report's `previous` object: `release` is the string
  `--previous <rev>` and `report` is `(none: named by --previous)` (`sed -n 967,968p
  scripts/release-health/measure.cjs`), while `docs/08_health/release-health.schema.json` documents `report` as the
  "Repository-relative path of the previous JSON report" (`grep -n "Repository-relative path" docs/08_health/release-health.schema.json`)
  and its `type: string` accepts either. `compare.cjs`, the reader of `previous`, decides how it treats such a run
  (no previous report to settle proposals against) and the schema either allows `report: null` with a `basis`
  (`report` or `--previous`) or the script writes the version the revision carries.

- **Handover (2026-10-11, W3 B5 gate: five minor inaccuracies in `measure.cjs` found by `task-231`'s independent
  review, finding F8).** Measured on `main` at `29b8406a`; no criterion changes. Settle each where the report or
  `compare.cjs` reads it:
  - `--at <rev>` on a commit that carries no tag is labelled `basis: 'released-transition'` even when it is not the
    commit of the release's `released` transition (`grep -n "released-transition" scripts/release-health/measure.cjs`,
    lines 943 and 955).
  - P01, P02 and P05 count the commits they cannot check inside `checked`/`items` (the review's v0.2.2 run: P02
    checked 529, of which 121 unchecked); the definition question is `dl-173`'s.
  - G08 with no judged commit is reported `measured` with `conforming_share: null` (line 534), against the header's
    rule that a share with no item is `not-measurable`.
  - P04 resolves an element id by prefix, so `dl-117` matches any `dl-117-*` (line 726).
  - `UNCHECKABLE_RE` (line 613) depends on the exact wording of a `check-governance.cjs` message.

- **Handover from wave 3 B6 (2026-10-12, W3 B6 follow-ups, `bug-ingest-rel-v0.3-w3b6-review-findings-plan` item B1;
  `task-232`'s independent review).** This task absorbs `bug-344`: the binding `release-health.measure`
  (`sed -n 103p .wingfoil/workflows/bindings.yaml`) runs `measure.cjs --release {release}` with neither
  `--any-node` nor `--max-workers`. Off Node 22.12.0 (`publish.yml` `NODE_VERSION`; this machine runs `v22.21.0`)
  every toolchain metric is then `not-measurable` (`sed -n 1446,1448p scripts/release-health/measure.cjs`), so
  `dl-089` §5's immediate-bug rule can never fire for them; on 22.12.0 the two jest runs use jest's default workers
  against `dl-170`'s interim rule (`sed -n 1466p scripts/release-health/measure.cjs`). The binding either declares
  how the step runs under the pinned Node or admits `--any-node` (recorded in the report), and passes
  `--max-workers 2`; the bindings test and `release-health.yaml`'s step description follow. Also from `task-232`'s
  review, for `compare.cjs`: Q17 (like G15 and E01–E05) is a reading at run time, not at the point, so a changed
  value between two reports is not a regression (`dl-089` §1); `dl-173` holds the catalogue question.

- **Handover from the approver's absorption of the inherited v0.3 bugs (2026-10-12,
  `bug-ingest-rel-v0.3-w3b6-review-findings-plan`).** This task also absorbs `bug-332`:
  `test/release-health/measure.test.ts:22` imports `ajv/dist/2020`, which `package.json` does not declare (`grep -n
  '"ajv"' package.json` → no match; `npm ls ajv` → only through `@modelcontextprotocol/sdk`). Declare `ajv` in
  `devDependencies` at the major the test uses (8), with the lockfile, sequenced with `task-234`'s `package.json`
  edit (`homepage`) so the two do not conflict.

## Execution Notes

### design (developer, 2026-10-13)

- **Start.** Branch `task/task-241-compare-runs-write-proposals-backfill` cut from `main` `db0e2752` (`git log
  --oneline db0e2752..HEAD` → `a7999dc7` start, `4c4790ad` bug-344 sync, `c65aff87` bug-332 sync).
- **depends_on read (dl-015).** `task-231` (`done`): `measure.cjs`'s history half, the measurement point (`--at`, else
  the highest own tag, else the `[… → released]` commit), the window (`--previous`, else the most recent earlier
  report under `paths.health`, else the whole history), the report schema; its review left F7 and F8 to this task.
  `task-232` (`done`): the toolchain half, `--any-node` (each toolchain entry then records `raw.node` and
  `raw.node_pinned`), `--max-workers`, Q17 read at run time (`raw.resolved_from`); one real run took 19 min 46 s.
  `task-233` (`done`): the static half; a point with no root `.wingfoil/dna.yaml` leaves Q05, Q07–Q10, Q16
  `not-measurable` (its F1); the history half took 23 min 29 s over 4106 commits with `--no-toolchain`. None of the
  three wrote a report into `docs/08_health/` (`ls docs/08_health/` → `metrics.yaml release-health.schema.json
  report-layout.md`).
- **Decisions cited.** `grep -m1 '^status' docs/04_memory/design/dls/dl-{089,133,170}-*.md` → `ready`; `dl-173` and
  `dl-167` → `in-discussion`. No tech-spec governs `scripts/release-health/` (`grep -rln "scripts/release-health"
  docs/04_memory/design/specs/` → nothing): the contract is `dl-089` §1, §3–§5, §7, the catalogue (version 2), the
  schema and `report-layout.md`. Nothing here changes a `dl-173` definition (G08, G09, G15, P02/P05, P03, Q15, Q09,
  Q08's count, Q17's catalogue entry, Q12's fixture, the backfill rule): `measureAttribution`, `declaredVerbs`,
  `measureBranches`, `uncheckedCommits`, `producesPresent` and the static-half readers stay as they are, and
  `metrics.yaml` is not edited.
- **One contradiction with a ratified DL, sanctioned by bug-344:** `dl-089` §6 says the scripts "run with the
  pipeline's pinned Node". The bound step will pass `--any-node` (bug-344's second option, approver ruling D3): off
  the pin each toolchain entry records `node` and `node_pinned`, and `compare.cjs` flags it. Recommendation: no
  amendment of `dl-089` beyond, optionally, a dated note (approver's call).

#### Design — `scripts/release-health/compare.cjs` (new, with `compare.d.cts`)

- **CLI.** `node scripts/release-health/compare.cjs --release <vX.Y[.Z]> [--report <json>] [--out <md>] [--root <dir>]
  [--no-remeasure] [--offline] [--no-toolchain] [--any-node] [--max-workers <n>]`. `--report` defaults to
  `<paths.health>/release-health-<release>.json`, `--out` to the same path with `.md`. The last four go to a
  re-measurement only. Exit 0: the Markdown report is written, its path on stdout; one stderr line
  `release-health compare: immediate bug-ingest: <id> …` per immediate finding with no tracking element. Exit 2
  (message on stderr, prefix `release-health compare: `): unknown or malformed argument, missing `--release`, a report
  file missing or not valid against `release-health.schema.json` (ajv `ajv/dist/2020`, both reports), the report's
  `release.version` ≠ `--release`, its `catalogue_version` ≠ the catalogue's `version`, a previous report named by
  `previous.report` absent on disk, a previous report with a newer catalogue, an invalid catalogue
  (`validateCatalogue`), a failing Memory search. No exit 1: the binding is an action, not a check. No clock, no
  randomness; every list in catalogue order or sorted. It runs no `git` itself (a re-measurement goes through
  `measureRelease`), so `test/lint/git-log-readers.test.ts`'s roster is unchanged.
- **API** (exported, typed in `compare.d.cts`): `classifyMetric(def, current, previous, defaults)` (pure);
  `evaluateFloor(id, entry)` → `'held' | 'breached' | null`; `compareReports({ catalogue, current, previous, history,
  remeasure })` → `Promise<Comparison>`; `propose(comparison, { search, memoryYaml })`; `parseProposals(markdown)`;
  `settle(previousProposals, retroText, comparison)`; `renderReport(comparison)` → string; `compareRelease(root,
  options)` (the I/O wrapper); `main(argv)` → `Promise<number>`. A row of `Comparison.rows` is `{ id, name, kind,
  previous, value, raw, verdict, floor, flags }`.
- **Verdict per metric (`dl-089` §3), first rule that applies:**
  1. catalogue `status: retired` → verdict `null`, flag `retired`;
  2. current entry `not-comparable` → `not-comparable` (its reason as flag);
  3. current entry `not-measurable` → verdict `null`, floor `null`, flag `not-measurable: <reason>`;
  4. `kind: info` → `info` (no comparison);
  5. a reading at run time — `RUN_TIME_READINGS = [G15, Q17, E01–E05]` declared in `compare.cjs` (the measure
     header's own list; Q17 handover; `dl-173` items 3 and 9 hold the catalogue side) → trend verdict
     `not-comparable`, flag `run-time reading`; a floor is still evaluated (rule 9);
  6. `direction: pending` → `pending`;
  7. no previous report (`previous: null`, or `basis: '--previous'`), or the previous entry absent or not measured →
     `new`;
  8. otherwise compare each component in `COMPONENTS[id]` (declared in `compare.cjs`, one `[path, unit, direction]`
     per compared part; floors included, so every non-info metric has one): `share` → absolute difference in
     percentage points against the tolerance (default 2pp); `relative` → |Δ| / |previous| against the tolerance
     (default 10 %), previous 0 → any change is beyond it; `boolean` → equal stable, false→true improved, true→false
     regressed. **Strictly more than the tolerance moves the verdict** (exactly 2.00pp or 10 % is `stable`). A
     component `null` on either side is skipped with flag `partial: <path>` (G08's `conforming_share: null`, F8
     item 3); all skipped → `not-comparable`. Combined: any regressed → `regressed`; else any improved → `improved`;
     else `stable`. Tolerances are read from the catalogue (`defaults.tolerance`, a metric's own `tolerance` when
     present, `Npp` or `N%`); a malformed one is exit 2.
  9. floors: `FLOORS[id](value)` declared in `compare.cjs` (G01, G05, G06, G10, Q10, Q11 `=== 100`; G07, G14, Q09,
     P01–P05 `=== 0`; G08 `conforming_share === 100` (skipped when null) and `approve_reject_with_ai === 0`; G15 both
     counts 0; Q01, Q17, P07 `true`; Q02 `failing` and `disabled` 0; Q04 every module `>= 90`; Q07 both counts 0; Q08
     `unused_runtime_dependencies === 0`; Q12 `< 1000`; Q20 `>= 0`) → `held | breached`.
  Flags also carry `small-sample` (the current entry's `small_sample`), `unchecked <n>` / `unresolved <n>` (P01, P02,
  P05, P03 raw; F8 item 2 is shown, not redefined) and `node <v> (pinned <p>)` when a toolchain entry has
  `raw.node_pinned`.
- **Findings (`dl-089` §4):** every `breached` floor (small sample or not) and every `regressed` metric of
  `kind: trend` without `small-sample`; a held floor that regressed is not a finding. **Immediate** (`§5`): the
  catalogue's `immediate_bug: true` (G07, G10, G14, Q01, Q02), Q01 and Q02 only when `measurement_point.basis` is
  `published-tag` (`AT_TAG_ONLY` in `compare.cjs`).
- **Like-for-like (`§3`):** previous `catalogue_version` < current → `remeasure(previousReport)`, by default
  `measureRelease(root, { release: prev.release.version, at: prev.measurement_point.ref, previous:
  prev.previous?.commit, …pass-through flags })`; the stored previous report is never rewritten. Success → the
  header says `re-measured like-for-like: yes`. Failure or `--no-remeasure` → `no (<reason>)`; ids in a later
  `changes[].redefined` are `not-comparable` (flag `redefined in catalogue v<N>, not re-measured`), ids in a later
  `added` are `new`, the rest compare with the stored values.
- **Trend (`§3`):** the runs are the `release-health-v*.json` files under `paths.health` with a version ≤ the current
  one, sorted with `compareVersions`; with three or more, the `## Trend` section lists each metric's last three
  stored values (`v0.1: … · v0.2: … · v0.3: …`, a catalogue version mark where they differ); with fewer, one line
  `fewer than three runs (<n>): no trend yet`.
- **Propose (`§4`), inside `compare.cjs`:** for each finding in catalogue order, `search(<id>)` — by default `node
  <repo>/dist/cli.js memory search <id> --format json` at the repository's working tree (whether it is tracked
  *now*); a tracking element is a match of type `bug`, `task`, `decision-log` or `change-proposal` whose status is
  neither the last state of its type's `sequence` in `.wingfoil/memory.yaml` nor `deprecated` (so a `ready` DL, a
  `done` task, a `closed` bug do not track). Tracked → `- <id> — tracked: <element id> (<status>; <command>)`, every
  match sorted by id. Untracked → a proposal `RH-<version>-NN` (NN two digits from 01, in finding order):
  `### RH-<version>-NN — <metric id> <metric name>` then `- Finding:`, `- Evidence:` (values, raw, the failing
  items), `- Proposed element: bug` for a breached floor, `decision-log` for a regressed trend, `- Proposed target
  release: v<X>.<Y+1>`, and `- Immediate: file through bug-ingest in this run (dl-089 §5)` when immediate. The
  propose phase (facilitator, `agent.execute`) reviews the section and files the immediate bugs.
- **Settle the previous proposals (`§4`):** `parseProposals` reads the previous report's `.md` (same name as its
  `previous.report`); no `.md` → nothing to settle (stated). Dispositions come from `retro-<previous version>`'s
  `## Release health` section, a table row whose first cell is the RH id, second its outcome (`retrospective.yaml`
  `additional-points`: covered | element | restated | superseded, or declined), third the element id. `element` →
  `adopted and effective` when the linked metric's verdict is `improved` or its floor went breached → held, else
  `adopted, no effect yet`; `covered`, `restated`, `superseded` → `superseded`; `declined`, no row, or no retro →
  `not adopted` (the last two with `no disposition recorded`; `dl-167` decides who disposes for a patch, untouched).
- **The Markdown** follows `report-layout.md` (header table, Summary, Comparison, Trend, Findings, Proposals,
  Previous proposals, Improvements); `renderReport` is pure, two runs on the same inputs are byte-identical.

#### Handovers settled

- **F7 (`previous` placeholders).** `measure.cjs` writes `previous: { release, commit, report, basis }`: from a
  report, `basis: 'report'`, `release` its version, `report` its path; with `--previous <rev>`, `basis: '--previous'`,
  `release: '<rev>'` as given, `report: null`. Schema: `previous` requires the four, `report` is `string | null`,
  `basis` ∈ {`report`, `--previous`}, and `report` is a string when `basis` is `report`. `compare.cjs` treats a
  `--previous` run as having no previous report: every metric `new`, the header names the revision, nothing to settle.
- **F8.** (1) `--at <rev>`: `basis` is `published-tag` when the rev is a tag, `released-transition` only when it is
  the commit the release's `[… → released]` scan finds, else `revision` (new schema enum value); `compare.cjs` shows
  the basis in its header. (2) P01/P02/P05 `unchecked` inside `checked` is `dl-173` item 4: not redefined; shown as a
  flag. (3) G08 `conforming_share: null`: read by `compare.cjs` as a skipped component, never 0 and never a breach;
  `measureAttribution` untouched (`dl-173` item 1). (4) P04: a link resolves when it is an exact element id, or a
  short id `<prefix>-<n>` (nothing after the number) carried by exactly one element; a longer partial id
  (`dl-117-ai`) or an ambiguous short id fails, named. (5) `UNCHECKABLE_RE`: no code change (`uncheckedCommits` is
  `dl-173` item 4's); the coupling to `check-governance.cjs`'s two messages is pinned by tests — P02's exists
  (`measure.test.ts:635`), P05's is added.
- **bug-344.** `bindings.yaml` 1.8 → 1.9: `release-health.measure: { run: [node, scripts/release-health/measure.cjs,
  --release, "{release}", --any-node, --max-workers, "2"], … }` and `release-health.compare` the same with
  `compare.cjs` (its flags reach a re-measurement); the comment states the Node rule: the step measures under the Node
  that runs it, `--any-node` recording `node`/`node_pinned` in every toolchain entry; to measure under the pin, run
  the same vector under `n -d exec <NODE_VERSION>`; `--max-workers 2` is `dl-170`'s interim rule.
  `release-health.yaml` 1.0 → 1.1: the measure step's description says the same; compare's says run-time readings
  are not compared and a cross-version comparison re-measures; propose's says `compare.cjs` drafts the Proposals
  section and the facilitator reviews it and files the immediate bugs. `.wingfoil/WORKFLOW.md`: the release-health
  paragraph only. `report-layout.md`: the proposal entry format, the disposition row read back from the retro, the
  `--previous` header line, the run-time flag.
- **Q17 (task-232's review):** rule 5 above; a Q17 `false` is still a breached floor, so a finding.
- **bug-332.** `package.json` `devDependencies` gains `"ajv": "^8.20.0"` (the hoisted version: `npm ls ajv` →
  `ajv@8.20.0` through the SDK, per bug-332), with `package-lock.json` changing only `packages[""].devDependencies`
  (`git diff package-lock.json` checked; `test/cli/lockfile-peer-overrides.test.ts` and
  `test/cli/check-lockfile-pins.test.ts` run). `compare.cjs` itself validates with it. `task-234` writes `homepage`
  after this merges (own line).

#### AC classification and what the qa agent pins

| AC | Class | Why |
|---|---|---|
| 1 — five verdicts, tolerances, cross-version re-measure, three-run trend | red-first | `ls scripts/release-health/` → no `compare.cjs` |
| 2 — Memory search before proposing; immediate-bug flags | red-first | same |
| 3 — v0.1 at `5b16ab61`, v0.2 at `v0.2.1`, committed, dl-089 §7 compared | by-hand (developer, session 3) + red-first guard test | the two runs are heavy gates (ruling D3), not red's |
| F7, F8 (1), (4), P05 unchecked (F8 (5)) | red-first, except P05 unchecked: characterization | new behaviour in `measure.cjs`; P05's message already matches |
| bug-344 (bound vectors) | red-first | `sed -n 103,104p .wingfoil/workflows/bindings.yaml` → neither flag |
| bug-332 (`ajv` declared, major 8) | red-first | `grep -c '"ajv"' package.json` → 0 |

- Test files (all new, under `test/release-health/`; fixtures as JSON reports under
  `test/release-health/fixtures/compare/`, each valid against the amended schema; Q09 skips `fixtures/`, and no stub
  may invent stderr, `test/lint/no-fabricated-stderr`). `jest.setTimeout(60_000)` only where a test measures.
  - **`compare.test.ts`** (AC 1): `classifyMetric` cases — share +2.00pp `stable`, +2.01pp `improved` (direction up);
    relative +10 % `stable`, +10.1 % `regressed` (direction down); previous 0 → current 1 `regressed` (G07); boolean
    true→false `regressed`, false→true `improved`; a multi-component metric with one part improved and one regressed
    → `regressed` (G03); G08 `conforming_share: null` → flag `partial: conforming_share`, verdict from the other part;
    `pending` (G12); `info` (E04 changed); run-time readings G15/Q17/E05 changed → `not-comparable` + flag `run-time
    reading`, Q17 `false` still `floor: breached`; current not-measurable → `null` + flag with the reason; previous
    not-measurable → `new`; D01 `not-comparable`; a catalogue `tolerance: 5pp` override honoured. `evaluateFloor` for
    each `FLOORS` entry (held and breached). **Table guards:** `FLOORS` ids = the catalogue's non-retired `kind:
    floor` ids; `COMPONENTS` ids = its non-retired, non-info, non-pending ids (read from `docs/08_health/metrics.yaml`).
    `compareReports`: `previous: null` → all `new`; `basis: '--previous'` → all `new`; a previous report at catalogue
    1 with a fixture catalogue at version 3 (copy of `metrics.yaml`, `changes` v3 redefining G02 and adding one
    metric): `remeasure` stub called once with the previous report → its values used, header flag yes; `remeasure`
    throwing → G02 `not-comparable` (flag names v3), the added id `new`, G01 compared with the stored value. Trend:
    three fixture runs → each metric's three values; two runs → `fewer than three runs (2)`. `renderReport` twice →
    byte-identical; section headings in `report-layout.md`'s order. `main` in a temp root (`.wingfoil/dna.yaml` with
    `paths.health`, the catalogue, the schema, two fixture reports with no finding): exit 0 and the path on stdout;
    exit 2 with the exact message for a missing `--release`, an unknown flag, a schema-invalid report, a version
    mismatch, a catalogue-version mismatch.
  - **`propose.test.ts`** (AC 2): `propose` with a stub `search` and a fixture `memory.yaml` — an open bug match →
    tracked, cited with its status, no RH; a `ready` DL, a `done` task, a `closed` bug → untracked → `RH-v0.2-01`,
    `RH-v0.2-02` in finding order with the five fields, element `bug` for a floor, `decision-log` for a trend, target
    `v0.3`; the stub is called once per finding, with the metric id, before any RH is numbered. Immediate: a G07,
    G10 or G14 breach → immediate at any basis; Q01/Q02 breach → immediate at `published-tag`, not at
    `released-transition`; a regressed small-sample trend → no finding, no proposal; stderr names each untracked
    immediate finding. `parseProposals` reads back what `renderReport` wrote. `settle`: `element` + linked metric
    improved → `adopted and effective`; not moved → `adopted, no effect yet`; `superseded`/`covered`/`restated` →
    `superseded`; `declined` → `not adopted`; no row or no retro → `not adopted` + `no disposition recorded`.
  - **`measure-followups.test.ts`** (F7, F8, on `measure.test.ts`'s fixture helpers or a copy): `--previous <rev>` →
    `previous` = `{ release: '<rev>', commit, report: null, basis: '--previous' }`; a report found under
    `paths.health` → `basis: 'report'` with its path; both reports valid against the schema (ajv); `--at` an untagged
    non-transition commit → `basis: 'revision'`, `--at` the transition commit → `released-transition`, `--at` a tag →
    `published-tag`; P04 `ref: dl-117` with one `dl-117-*` element resolves, `dl-117-ai` fails named, a short id two
    elements carry fails named; P05 counts a commit before `dna.yaml` existed `unchecked` (characterization).
    `measure.test.ts:334` expects `released-transition` for `--at h.point`: if `h.point` is not the fixture's
    transition commit, red updates that expectation to `revision` (red may edit it; I will not).
  - **`bindings-and-deps.test.ts`** (bug-344, bug-332): the two vectors exactly as above; `bindings.yaml`
    `version` ≥ 1.9 with a history entry naming task-241 and bug-344 (bug-314 "≥" rule); `release-health.yaml` ≥ 1.1
    likewise; `package.json` `devDependencies.ajv` matches `^\^8\.` and equals `package-lock.json`
    `packages[""].devDependencies.ajv`; `require('ajv/package.json').version` starts with `8.`.
  - **`baselines.test.ts`** (AC 3 guard, red until session 3 commits the reports): `docs/08_health/
    release-health-v0.1.json` and `-v0.2.json` exist and validate; `measurement_point.commit` equals `git rev-parse
    5b16ab61` / `git rev-parse v0.2.1^{commit}`, bases `released-transition` / `published-tag`; v0.2's `previous` is
    `{ release: 'v0.1', report: 'docs/08_health/release-health-v0.1.json', basis: 'report' }`; `catalogue_version`
    2; every measured toolchain entry carries `raw.node_pinned` (the `--any-node` record, ruling D3); `compareReports`
    on the two (`remeasure` not called: same catalogue) returns one row per catalogue metric.

#### Baseline runs (AC 3, ruling D3; session 3, after refactor, with the final `measure.cjs`)

- In the worktree, `npm ci`, then under the slot (`bash ../devloop-kit/waitslot.sh`): `npm run build` (`measure.cjs`
  loads `dist/`), then, one at a time, foreground, nothing else running in the worktree:
  1. `node scripts/release-health/measure.cjs --release v0.1 --any-node --max-workers 2 --offline` — point resolved
     by the script: no `v0.1*` tag (`git tag --list` → `v0.2.0 v0.2.1 v0.2.2`), so `5b16ab61` `wf(release): approve
     minor-v0.1 [releasing → released]`, the only such subject (`git log --format='%h %s' | grep 'minor-v0.1' | grep
     '→ released]'`); `previous: null`, window the whole history (`git rev-list --count 5b16ab61` → 440). Expected
     ~10–15 min (history ~4 min, then `npm ci`, build, lint, test and coverage of that tree; no `typecheck` or
     `test:latency` script there, so those parts are not-measurable).
  2. `node scripts/release-health/measure.cjs --release v0.2 --any-node --max-workers 2 --offline` — point `v0.2.1`
     (`published-tag`; `v0.2.2` is another release's version), previous the v0.1 report just written, window
     `5b16ab61..v0.2.1` (`git rev-list --count` → 1657). Expected ~25–35 min.
  Reports at `docs/08_health/release-health-v0.1.json` and `-v0.2.json` (the default `--out`), committed together
  (`docs(health): task-241 — v0.1 and v0.2 baseline reports`). Each run's command, duration, load before and after,
  and exit code go in the notes. A run that fails for a reason of the script is fixed and re-run only with the
  approver's OK (each once).
- **What the points can measure.** Neither point has a root `.wingfoil/` (`git ls-tree -r --name-only 5b16ab61 |
  grep -E '\.wingfoil/(dna|memory)\.yaml'` → `docs/self/.wingfoil/…` and a test fixture only; same at `v0.2.1`). So
  Q05, Q07–Q10, Q13–Q16, Q18–Q20 are not-measurable with the reason (task-233 F1), G05 and G12 have no `paths.sources`,
  P02/P05 count every commit unchecked, and **G07 would count every commit as an unknown identity** (`team.members`
  read from an absent `dna.yaml`: `sed -n 618,628p scripts/release-health/measure.cjs`), a false breach that
  `compare.cjs` would flag as an immediate bug. Decision A below.
- **dl-089 §7.** After the runs, `compareReports` on v0.2 against v0.1 (`--no-remeasure`; Markdown in the devloop kit
  scratch), and a table in the notes: id · §7 v0.1 · measured v0.1 · §7 v0.2 (2nd half, `5269223d`) · measured v0.2
  · why they differ (window: §7 reads v0.2's second half at `5269223d`, before the last three phases, the runs read
  the whole `5b16ab61..v0.2.1`; G08 redefined in catalogue v2; the not-measurable metrics above; Q03/Q04 read at
  another tree than §7's).

#### Files and versions

`scripts/release-health/compare.cjs` and `compare.d.cts` (new); `measure.cjs` (F7 `previousRun`, F8 (1)
`measurementPoint`, F8 (4) P04 `resolves.element`, G07 per decision A, header) and `measure.d.cts`;
`docs/08_health/release-health.schema.json`, `report-layout.md`, `release-health-v0.1.json`, `release-health-v0.2.json`;
`.wingfoil/workflows/bindings.yaml` 1.8 → 1.9; `.wingfoil/workflows/custom/release-health.yaml` 1.0 → 1.1;
`.wingfoil/WORKFLOW.md` (release-health paragraph); `package.json` (one `devDependencies` line), `package-lock.json`.
Not touched: `metrics.yaml`, `check-governance.cjs`, `src/`, `docs/cli-reference.md` (no command). Pending amendments
(session 3): the `### Retrospective` of bug-344 and bug-332.

#### Decisions for the approver (recommendation first)

- **A — G07 at a point with no root `.wingfoil/dna.yaml`:** (a) `not-measurable` with the reason, as task-233 F1 did
  for the static half (in-task, one fixture test in `measure-followups.test.ts`); (b) read the configuration where it
  was (`docs/self/.wingfoil/`) at such points, which would make G05, G07, G08, G12 and the static half measurable at
  v0.1/v0.2 — that is `dl-173` item 11's question, out of this task. Recommended (a), and (b) noted on `dl-173`.
  Without either, both baselines report G07 = every commit.
- **B — baselines `--offline`:** a backfill read today would record today's stars, downloads and npm answer (E01–E05,
  Q17) as v0.1's and v0.2's; offline they are not-measurable with the reason. Recommended `--offline`.
- **C — commit the two JSON reports only;** the v0.2 comparison Markdown stays in scratch: a committed
  `release-health-v0.2.md` would carry `RH-v0.2-NN` proposals that no retrospective will dispose of (v0.2's ran).
- **D — `schema_version` stays 1** although `previous.basis` becomes required and `measurement_point.basis` gains
  `revision`: no report is committed yet (`ls docs/08_health/*.json` → none). Alternative: 2.
- **E — `compare.cjs` writes the Proposals section** (search + RH drafts) and the propose phase reviews it, instead of
  the facilitator writing it from nothing; `report-layout.md` and `release-health.yaml` say so.
- **F — proposal element type** `bug` for a breached floor, `decision-log` for a regressed trend; target the next
  minor. **G — settlement mapping** of the retro outcomes as above. **H — floors also get a trend verdict** from
  `COMPONENTS` (findings still only from a breach). **I — run-time readings** (G15, Q17, E01–E05) never compared,
  declared in `compare.cjs` until `dl-173` puts it in the catalogue.

### red (qa, 2026-10-13)

- **Red commit `01aae1a9`** (T4 is measured from it). Files: `test/release-health/compare.test.ts`,
  `propose.test.ts`, `measure-followups.test.ts`, `bindings-and-deps.test.ts`, `baselines.test.ts`,
  `helpers/compare-api.ts` (the contract below, shared readers), `fixtures/compare/release-health-v0.{1,2,3}.json`
  (sorted keys, catalogue order, no clock; v0.1 → v0.2 → v0.3 hold every floor and regress no trend), and
  `measure.test.ts:334` (expects `basis: 'revision'`: the history fixture's point carries no `[… → released]`
  transition, F8 (1)).
- **How the module is reached.** `compare.cjs` is `require`d inside each test (`loadCompare()`), so a missing
  module fails each test on `expect(error).toBeNull()` naming `Cannot find module …/compare.cjs`, not the suite on a
  compile error; the CLI tests spawn it (`node compare.cjs`, today exit 1 ≠ 0/2).
- **Contract the tests hold `compare.cjs` to** (`helpers/compare-api.ts`, from the design's API; where the design
  left a shape open, this is the choice made): exports `classifyMetric`, `evaluateFloor`, `compareReports`,
  `propose`, `parseProposals`, `settle`, `renderReport`, `FLOORS` and `COMPONENTS` (plain objects keyed by id),
  `RUN_TIME_READINGS` (array). `classifyMetric` returns at least `{ verdict, floor, flags: string[] }`;
  `compareReports({ catalogue, current, previous, history, remeasure })` — `history` holds every run ≤ the current
  one, the current included — resolves to `{ rows }`, a row `{ id, previous, value, verdict, floor, flags, … }`;
  the header facts (re-measured yes/no, the `--previous` revision) are read from `renderReport`'s Markdown;
  `propose(comparison, { search, memoryYaml })` returns (or resolves to) a comparison that `renderReport` renders
  with the Proposals section; `search(id)` returns the parsed `memory search --format json` object
  `{ query, matches }`; `memoryYaml` is the parsed object; `parseProposals` returns `[{ id, metric, … }]`;
  `settle` returns one `{ id, settled, … }` per previous proposal, in order, the text `no disposition recorded`
  somewhere in the entry when it applies.
- **Per AC.**

| AC / item | Class | Tests | Fails today on |
|---|---|---|---|
| 1 | red-first | compare.test.ts: classifyMetric (14), evaluateFloor (30), table guards (3), compareReports two runs (3), like-for-like (2), trend (2), renderReport (2), CLI (7) | `loadCompare` → `Cannot find module …/compare.cjs`; CLI: `Expected: 0`/`2`, `Received: 1` |
| F7 (schema) | red-first | compare.test.ts: fixture v0.2, v0.3 validate | ajv: `/previous must NOT have additional properties` (`basis`) |
| 2 | red-first | propose.test.ts: search (5), immediate (5), parseProposals (1), settle (2), CLI stderr (1) | `Cannot find module`; CLI: no `immediate bug-ingest: G07` line |
| 3 | red-first guard (runs by hand, session 3) | baselines.test.ts (9) | `expect(existsSync(…release-health-v0.1.json)).toBe(true)` → `false` |
| 3 / ruling C | characterization | baselines.test.ts: no comparison Markdown tracked | passes |
| F8 (1) | red-first | measure-followups.test.ts: `--at` bases; measure.test.ts:334 | `basis: 'released-transition'` received for a plain commit |
| F7 | red-first | measure-followups.test.ts: `--previous`, report under paths.health | `release: '--previous <sha>'`, `report: '(none: named by --previous)'`; no `basis` |
| A | red-first | measure-followups.test.ts: G07 with no `team.members` | `status: 'measured'` received |
| F8 (4) | red-first | measure-followups.test.ts: P04 | `failing: 0` received, expected 2 |
| F8 (5) | characterization | measure-followups.test.ts: P05 `unchecked: 1` | passes |
| bug-344 | red-first | bindings-and-deps.test.ts: two vectors, versions | vectors lack `--any-node --max-workers 2`; `1.8` < 1.9, `1` < 1.1 |
| bug-332 | red-first + characterization | bindings-and-deps.test.ts | `devDependencies.ajv` undefined; installed ajv 8 passes |

- **Run** (`npx jest <files> --maxWorkers=2`): compare 66 failed / 2 passed (fixture v0.1 valid, the v3 catalogue
  fixture valid); propose 14 / 0; bindings-and-deps 5 / 1; baselines 9 / 1; measure-followups 5 / 1;
  measure.test.ts 1 / 65 (only :334). Lint (`npx eslint` on the files) and a typecheck of the seven test files
  (`tsc` on a scratch tsconfig extending `tsconfig.json`) clean.
- **Notes for green.** Each Q09-visible place (comments, `describe`/`it` titles) names only existing elements; the
  fixture ids (`dl-300-solo`, `bug-301-…`) are string data. The CLI temp roots copy this repository's
  `.wingfoil/memory.yaml` and the live `metrics.yaml` and schema; propose's CLI test runs the real search through
  `dist/cli.js` (built by the jest global setup) in a repository with no Memory document.
- **Not pinned (ambiguous in the design, for the coordinator):** E05 as a run-time reading — the design's test list
  says `not-comparable`, but E01–E05 are `kind: info` and rule 4 (`info`) precedes rule 5; E04 is pinned `info`,
  E05 left out. The exact wording of the exit-2 messages: pinned as the `release-health compare: ` prefix plus the
  named argument, file or versions. The trend's catalogue-version mark and `--no-remeasure` are not pinned.
- **Send-back (2026-10-13, independent review F1–F4, coordinator's choice of options): red commit `566a282b`.**
  Red-first rows, each failing on today's head `dbf9c419` (`npx jest <files> --maxWorkers=2`): F1 — `propose.test.ts`:
  the two tracked rows now expect the line labelled `candidate` beside the element id and its status (received
  `- G07 — tracked: bug-301-… (open; …)`), and a spawned run with G07 = 3 and an open, unrelated DL mentioning G07
  still writes one `release-health compare: immediate bug-ingest: G07 …` line naming the DL (received no line);
  F2 — `propose.test.ts`: a row `| RH-v0.1-01 | G07 | element: bug-400 |` settles `not adopted` with a note
  `unrecognised outcome "G07"` (received note `undefined`), `declined` carries no such note; F3 — new
  `compare-remeasure.test.ts`: `compareRelease`'s default re-measurement, with `measureRelease` replaced by a
  recording stub (`jest.doMock`), receives `at` = the previous point's commit when its `ref` is `main` (received
  `at: "main"`); F4 — `compare.test.ts`: a catalogue G02 `tolerance: "5"` and `tolerance: "5%"` (share-only) exit 2
  naming G02 and the value (received exit 0). Counts: compare 68 passed / 2 failed, propose 12 / 4,
  compare-remeasure 0 / 1. Lint and the scratch typecheck clean.
- **Send-back (2026-10-13, approver ruling (a), partial v0.1 baseline accepted): red commit `faf55b09`.** At
  `5b16ab61` `npm ci` exits EUSAGE, so the committed v0.1 report has Q01–Q04, Q11, Q12, Q17 all `not-measurable`
  with `raw.node_pinned: null`. `baselines.test.ts` now splits the toolchain row: v0.1 asserts `raw.node_pinned`
  present (null allowed) on every toolchain entry, measured or not; the v0.2 assertions are unchanged.
  `npx jest test/release-health/baselines.test.ts --maxWorkers=2` → 10 passed, 10 total.

### green (developer, 2026-10-13)

- Approver rulings of 2026-10-13 (`w3-b7-notes.md`): A (a), B `--offline`, C JSON only, D `schema_version` 1, E–I as
  designed; the dl-089 §6 note is a follow-up, not this task's. The baselines are taken after the independent review
  and its fixes, so `baselines.test.ts` (9 tests) is the one red left red at this stop.
- `6a13df3d` `feat(release-health)`: `scripts/release-health/compare.cjs` + `compare.d.cts` (the contract of
  `test/release-health/helpers/compare-api.ts`); `measure.cjs` F7 (`previous.basis`, `report: null` with
  `--previous`), F8 (1) (`releasedTransition`, basis `revision`), F8 (4) (P04 exact or unique short id, an ambiguous
  one named with its carriers), ruling A (G07 `not-measurable` with no `team.members`); `measure.d.cts`; the schema
  (`previous.basis` required, `report` string | null by basis, `measurement_point.basis` + `revision`);
  `bindings.yaml` 1.8 → 1.9 and `release-health.yaml` 1.0 → 1.1 (bug-344); `package.json` `"ajv": "^8.20.0"`, the
  lockfile changing only its root entry (`git diff db0e2752 HEAD --stat -- package-lock.json` → 1 insertion; bug-332).
- Red → green: `npx jest test/release-health/compare test/release-health/propose test/release-health/measure-followups
  test/release-health/bindings-and-deps --maxWorkers=2` → `Tests: 94 passed, 94 total` (red: 90 failed of 94);
  `npx jest test/release-health --maxWorkers=2` → `Tests: 9 failed, 220 passed, 229 total`, the 9 being
  `baselines.test.ts`.
- Choices red left open: E01–E05 are `info` (rule 4 precedes rule 5) and also carry the `run-time reading` flag; the
  exit-2 messages name the argument, file or both versions after the `release-health compare: ` prefix; the trend
  marks a run measured with another catalogue `(catalogue vN)`; `--no-remeasure` takes the failure path with the
  reason `not run (--no-remeasure)`. A metric no `COMPONENTS` entry names (a future catalogue's) is compared by its
  value's shape (number relative, boolean, object every key) in the catalogue's direction.

### refactor (developer, 2026-10-13)

- `85edf8af` `docs(release-health)`: `report-layout.md` says compare drafts the Proposals section (ruling E), the
  proposal entry format, the flags, the `--previous` and re-measure header lines, and the retrospective's
  disposition table the next run reads back (ruling G); `.wingfoil/WORKFLOW.md`, the release-health paragraph
  (compare.cjs, the bound `--any-node --max-workers 2`) and one stale clause of the bindings paragraph ("scripts still
  to be written", same class). The first full run found that a wrapped line of `report-layout.md` began `## Release
  health`, which `test/release-health/catalogue.test.ts` read as a section heading (`Tests: 1 failed`); rewrapped,
  `npx jest test/release-health/catalogue` → `26 passed`.
- Gates, under the dl-170 slot (`waitslot.sh`), `--maxWorkers=2`:
  - `npm test` at `6a13df3d` + the docs (14:13–14:35, load 12.8 → 17.1) → `Tests: 10 failed, 7514 passed, 7524 total`:
    the 9 of `baselines.test.ts` and the layout heading above, fixed in `85edf8af`.
  - `npm run test:coverage` at `85edf8af` (15:29–15:46, load 4.6 → 7.8) → `Tests: 9 failed, 7515 passed, 7524 total`,
    the 9 of `baselines.test.ts` only; All files 99.32 / 97.22 / 97.98 / 99.71 against the B6 baseline 99.32 / 97.23 /
    97.98 / 99.71: branches −0.01 is the run-dependent `src/core/memory-transition.ts` (`… | 468,560` uncovered in
    this run's table); no change under `src/` or `jest.config.js` (`git diff --stat db0e2752 HEAD -- src
    jest.config.js` → empty; `scripts/` is outside `collectCoverageFrom`).
  - `npm run lint` → 0; `npm run docs:api` → 0; `npx tsc --noEmit -p tsconfig.json` → 0;
    `npx tsc -p tsconfig.build.json --noEmit` → 0.
  - `node scripts/check-governance.cjs --base db0e2752` → `3 wf() commits`, no gated finding;
    `node scripts/lint-claims.cjs --base db0e2752` → 0 warnings.
- BDD: no scenario covers release-health's compare (`grep -rln "compare.cjs\|release-health.compare"
  docs/02_requirements/02_bdd/features/` → nothing); none required by the ACs. No CLI command: `docs/cli-reference.md`
  not concerned.
- T4: `git log --first-parent --no-merges --format=%h 01aae1a9..HEAD -- <red's test files, helper, fixtures,
  measure.test.ts>` → empty.

### self-review (developer, 2026-10-13)

- AC 1 met: `compare.test.ts` (tolerance edges, the five verdicts, re-measure success and failure, three-run trend,
  render order and byte identity, the CLI exits) passes.
- AC 2 met: `propose.test.ts` (one search per finding in catalogue order before numbering, tracking by type and open
  state, RH entries, immediate flags by basis, settlement mapping, stderr line) passes.
- AC 3 not yet met, by ruling: the two baseline runs follow the independent review. They will be, each once, under
  the slot, after `npm run build`:
  `node scripts/release-health/measure.cjs --release v0.1 --any-node --max-workers 2 --offline` then
  `node scripts/release-health/measure.cjs --release v0.2 --any-node --max-workers 2 --offline`, the reports at
  `docs/08_health/release-health-v0.{1,2}.json`, and the dl-089 §7 comparison in these notes.
- F7, F8 (1), (4), (5), ruling A, bug-344, bug-332: `measure-followups.test.ts`, `bindings-and-deps.test.ts` pass.
- `dl-173`'s definitions untouched: `git diff db0e2752 HEAD -- scripts/release-health/measure.cjs | grep -nE
  "^[-+].*(measureAttribution|declaredVerbs|measureBranches|uncheckedCommits|producesPresent|UNCHECKABLE_RE)"` →
  nothing; `docs/08_health/metrics.yaml` unchanged (`git diff --stat db0e2752 HEAD -- docs/08_health/metrics.yaml` →
  empty).
- Same class in the files touched: the WORKFLOW.md bindings clause above. `compare.cjs` spawns no git
  (`grep -nE "'git'|execFile" scripts/release-health/compare.cjs` → nothing), so `test/lint/git-log-readers.test.ts`
  needs no new entry (`git diff --stat db0e2752 HEAD -- test/lint/` → empty).

### independent review (2026-10-13) and fixes (developer)

- Verdict APPROVE WITH FIXES; qa send-back red `566a282b` (F1–F4; T4 for `compare.test.ts`, `propose.test.ts` and
  the new `compare-remeasure.test.ts` is measured from it).
- `00b9b105` `fix(release-health)`:
  - F1: a Memory search match is listed as a `candidate tracker` the propose phase confirms or replaces, never
    "tracked"; every immediate finding is written to stderr, with its proposal or its candidates.
  - F2: a disposition outcome outside covered | element | restated | superseded | declined is not adopted, noted
    `unrecognised outcome "<x>"`.
  - F3: the default re-measurement runs `measureRelease` at `measurement_point.commit` (`measure.cjs` now required
    at load, so the stub of `compare-remeasure.test.ts` reaches it).
  - F4: a metric `tolerance` that is neither `<N>pp` nor `<N>%`, or in a unit none of its declared parts compares,
    exits 2 naming the metric and the value (checked for every metric before any comparison).
  - F5: `report-layout.md`'s measurement-point line names `revision`. `report-layout.md`, `WORKFLOW.md` and
    `release-health.yaml` (no second bump: one per file per branch) say "candidate".
  - F6: bug-344's pending `### Retrospective` reworded (the test pins the bound vectors; a new script flag still
    meets no test); the review note on `git-log-readers` now carries its commands.
- `npx jest test/release-health --maxWorkers=2` at `00b9b105` → `Tests: 9 failed, 225 passed, 234 total` (the 9:
  `baselines.test.ts`, before the reports); `npm run lint` → 0; `npx tsc --noEmit -p tsconfig.json` → 0;
  `npm run docs:api` → 0. No full coverage run: nothing under `src/` or `jest.config.js` changed (`git diff --stat
  db0e2752 HEAD -- src jest.config.js` → empty).

#### Baselines (AC 3; approver rulings A, B, C, D3)

- Each run once, under the slot (`waitslot.sh`), after `npm run build` (exit 0), from the worktree at `00b9b105`:
  - `node scripts/release-health/measure.cjs --release v0.1 --any-node --max-workers 2 --offline` — slot 16:03:51,
    load 8.8; exit 0 in 38 s. Point `5b16ab61` (`released-transition`), `previous: null`, window 440 commits (399
    non-merge).
  - `node scripts/release-health/measure.cjs --release v0.2 --any-node --max-workers 2 --offline` — slot 16:05:12,
    load 4.0 → 4.0; exit 0 in 488 s. Point `v0.2.1` = `9833e00a` (`published-tag`), previous the v0.1 report
    (`basis: report`), window 1453 non-merge commits.
  - No worktree left: `git worktree list | grep -c release-health` → 0 after each.
  - Committed JSON only: `c37b0e29` `docs(health)`.
- **v0.1's toolchain half did not run:** `npm ci` at `5b16ab61` exits `EUSAGE` under the running npm 11.6.2 — the
  lockfile of that tree is not in sync with its `package.json` as npm resolves it today (`git show
  5b16ab61:package.json`/`package-lock.json` into a scratch directory, `npm ci --dry-run --ignore-scripts` →
  `npm error code EUSAGE` … `lock file's @emnapi/wasi-threads@1.2.2 does not satisfy @emnapi/wasi-threads@1.2.3`).
  So Q01–Q04, Q11, Q12, Q17 are `not-measurable` with that reason, each still recording `raw.node` and
  `raw.node_pinned: null` (no `publish.yml` there). Not measured under npm 10.9 (the pinned Node's), which may
  resolve it differently (bug-056's class).
- **Send-back to the qa agent (T4: a red test that no correct implementation can pass):** `baselines.test.ts` "v0.1:
  catalogue version 2; every measured toolchain entry records node_pinned" asserts `toolchain.length > 0` measured
  entries; at `5b16ab61` none can be measured (above). `npx jest test/release-health --maxWorkers=2` at `c37b0e29` →
  `Tests: 1 failed, 233 passed, 234 total`, that one. The other eight baseline tests pass.
- **dl-089 §7 compared** (the provisional table read v0.2's second half at `5269223d`; the runs read the whole
  `5b16ab61..v0.2.1` window; values from `docs/08_health/release-health-v0.{1,2}.json`):

| id | §7 v0.1 | measured v0.1 | §7 v0.2 (2nd half) | measured v0.2 | why they differ |
|---|---|---|---|---|---|
| G01 | 100 % | 94.99 % (379/399) | 100 % | 100 % (1453/1453) | v0.1: the run counts the inception commits before the conventional form (whole history from the first commit) |
| G02 | 48 % | 43.86 % (175/399) | 82 % | 41.36 % (601/1453) | v0.2: the whole window, not the second half; trailer-only bodies excluded |
| G03 median / p90 | 23 / 206 | 25 / 295 | 23 / 249 | 25 / 224 | window; binary files excluded; nearest-rank p90 |
| G04 share > 72 | 56 % | 53.88 % | 82 % | 77.63 % | window (the second half alone was longer) |
| G05 | 100 % | not-measurable | 99 % | not-measurable | no `paths.sources` at either point (no root `dna.yaml`) |
| G06 | 52/52 | 53/53 | 100/100 | 210/211 (1 failing) | window boundary; v0.2's whole window holds one approval with no evidence |
| G07 | 0 | not-measurable | 902 | not-measurable | ruling A: no `team.members` at the points |
| G08 | 15 % | `conforming_share` null (65 before the rule) | 75 % | null (847 before the rule) | redefined in catalogue v2 (dl-117): no commit is judged before its ratification |
| G09 | 38 % | 16.5 % (34/206) | 40 % | 0.23 % (2/876) | the verb list is the measuring build's (no `audit.ts` grammar then), `dl-173` item 2 |
| G10 | 100 % | 100 % (153/153) | 48 % | 70.62 % (411/582) | window: the second half concentrated the ASCII arrows |
| G12 | 6 % | not-measurable | 26 % | not-measurable | no `paths.sources` |
| Q03 stmts / branches | — | not-measurable | 98.6 % / 94.0 % | 98.58 % / 94.03 % | agrees (v0.1: `npm ci` refused, above) |
| Q04 `memory/audit` branches | — | not-measurable | 64.7 % | 64.7 % (22/34) | agrees |
| Q06 `src/` | — | not-measurable | 0.15 % | not-measurable | no `paths.sources` |
| Q08 unused runtime deps | — | not-measurable | 1 | not-measurable | no `paths.sources` |
| Q13 closure ratio | — | not-measurable | 35 % (44/124) | not-measurable | no root `memory.yaml` at the points |

- Beyond §7, v0.2's run breaches the floors G06 (99.53 %, 210/211), G10 (70.62 %, 411/582), G14 (29 blocking
  findings, all in test fixtures of the secret scanner such as `test/validation/secret-scan.test.ts`: the scanner
  reads test diffs), G15 (1 stale remote branch, a live reading), Q04 (`src/memory/audit.ts` 64.7 %), P01 (297
  failing of 876), P02 (15 of 1453) and P05 (137 of 211); Q01 is not-measurable at `v0.2.1` (no `typecheck`
  script). v0.1's run breaches P01 (61 failing of 206) and G01 (94.99 %, 379/399). `compare.cjs` on the
  two (`--no-remeasure`, Markdown in `../devloop-kit/task-241-scratch/`, not committed) names G10 and G14 as immediate,
  each with `task-241` as its only candidate tracker — F1's case. Nothing is filed from the backfill (approver).

#### Close-out (developer, 2026-10-13)

- The partial v0.1 baseline is accepted by the approver's ruling (a) (`w3-b7-notes.md`): at `5b16ab61` `npm ci`
  exits `EUSAGE` under npm 11.6.2, so the toolchain metrics are not-measurable there; the follow-up is filed by the
  coordinator. qa send-back `faf55b09` (`baselines.test.ts`: v0.1 asserts `raw.node_pinned` on all seven toolchain
  entries, measured or not).
- `npx jest test/release-health --maxWorkers=2` at `4796d441` → `Tests: 234 passed, 234 total`.
- T4: `git log --first-parent --no-merges --format=%h 01aae1a9..HEAD -- test/release-health/` → `faf55b09`,
  `566a282b`: both qa send-backs (the v0.1 baseline test; review F1–F4); no commit of mine touches red's files.
- re-review (2026-10-13): APPROVE.

### Pending amendments (approver)

- `bug-344` (uncommitted): `### Retrospective` replaces "None." with one item. Proposed `--reason`: "Retrospective item
  for bug-344, written by task-241 while fixing it: the binding predated the flags its script gained, and no test
  held the bound vector to them."
- `bug-332` (uncommitted): `### Retrospective` replaces "None." with one item. Proposed `--reason`: "Retrospective item
  for bug-332, written by task-241 while fixing it: a dependency used only through hoisting is invisible until the
  other package's tree changes."

### Retrospective

- A background wait for the slot that dies (a monitor's deadline) loses its FIFO ticket, and a duplicate waiter
  queued meanwhile would rerun the same gate: one gate script per task, started once, with no deadline shorter than
  the queue.
- A wrapped prose line beginning `## ` is a heading to every reader of the layout: the layout test caught it, a
  reviewer would not have.
- A Memory search is a substring match: run on this repository it named task-241 itself as the "tracker" of the
  G10 and G14 breaches (review F1). A mechanical search can propose candidates, never conclude that a finding is
  tracked.
- A backfill at an old point depends on today's registry: the v0.1 lockfile is refused by npm 11.6.2 (`EUSAGE`), so a
  red test that assumed some toolchain metric measurable there could not pass; such assumptions about historical
  trees need checking before red.
- The baselines took 38 s and 488 s, far under the 10–15 and 25–35 min the design estimated: with no root
  configuration at either point the static half and most of the history half have little to read.
