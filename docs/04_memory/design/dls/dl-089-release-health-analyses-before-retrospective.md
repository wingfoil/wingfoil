---
id: "dl-089-release-health-analyses-before-retrospective"
type: decision-log
title: "Two standing release-health analyses — git history and project quality — run before every retrospective, each compared against the previous run and ending in improvement proposals"
status: ready
context: "process"
release: "v0.3"
contributor: "Roberto Pompermaier <robypomper@gmail.com>"
credit: "Drafted outside the repository from the approver's 2026-09-28 release-health analysis; revised and filed during the v0.2 retrospective"
tmpl_version: 260703
---

## Context

The retrospective sub-workflow learns from one kind of source. `retrospective.yaml` (version 1.1),
`explore` phase, mines "the `## Execution Notes` of every Memory document in the release scope", as
`retro-v0.1` did. That captures what somebody **noticed**. It cannot capture what nobody noticed.

On 2026-09-28 the approver ran two ad-hoc analyses on `main` at `5269223d`
(`Merge branch 'qa/e2e-smoke-v0.2'`), outside any workflow:

1. **A git-history analysis.** Every commit is measured per window: inception, v0.1, v0.1
   retrospective and v0.2 set-up, v0.2 first half, v0.2 second half. The measures are subject
   format, body presence, commit size, author identity, AI attribution trailers, `wf()` verb
   grammar, bracket arrows and merge shape.
2. **A project-quality analysis.** It covers build, typecheck, lint and the full suite with
   coverage, then complexity, duplication, import cycles and layering. It also covers the
   dependency footprint, a CLI and MCP smoke run on a fresh project, the runnable examples,
   requirements-to-tests traceability, and the state of the bug and decision-log backlogs.

Between them they surfaced conditions that no Execution Note, review gate or e2e smoke had recorded.
Each figure below states its definition and the commit it was measured at, because every figure
grows with history.

- **Author identity.** From 2026-09-17 the author identity of new commits is
  `probe@example.invalid`, which is not a `team.members` entry in `dna.yaml`. At `5269223d`, 112
  `wf(…): approve` commits whose `Approver:` line names the approver carry that author. The command
  loops over `git log --grep='^wf(.*): approve ' --format='%H %ae'` and keeps bodies matching
  `^Approver:.*Roberto`. This decision-log does not rule on the cause or the remedy. It only makes
  the condition a measured metric (G07).
- **Bracket drift.** From 2026-09-22 hand-written `wf()` subjects switch from `→` to ASCII `->`
  inside the transition bracket. The first ASCII bracket is `1269e6b9`, at 16:22:32. At
  `a20b346c`, `git log --format=%s 20e8271..a20b346c | grep '^wf(' | grep -oE -- '\[[^]]*(->|→)[^]]*\]'`
  finds 198 ASCII brackets against 430 Unicode ones. `src/memory/audit.ts`'s `BRACKET_RE` matches
  only `→`. `dl-079-wf-commit-verbs-outside-the-declared-grammar` was added at 16:45:04 the same
  day (`4865a23c`) and does not record the drift. On this repository every Memory operation is
  hand-written (`bug-075`), so this is format drift in hand-written commits, not evidence that a
  tool was bypassed.
- **Coverage where it matters most.** At `5269223d`, `src/memory/audit.ts` has the lowest branch
  coverage in the project: 64.7%, under a global 94.0%.
- **Dependency footprint.** `@anthropic-ai/sdk` is a runtime dependency imported nowhere in `src/`.
  `grep -rn anthropic src/` returns nothing, while the same grep over `package.json` finds it. It is
  about 10 MB of a 46 MB consumer install, against `dl-010-minimal-dependencies`.
- **Backlog trend.** At `5269223d`, 124 bugs had been opened in the v0.2 window and 44 closed.
  75 of those still open carried no `release`, and 28 of 86 decision-logs were `in-discussion`.

They also measured what went **well**, with figures the retrospective could not otherwise state:

- conventional subjects at 100% since v0.1;
- commit bodies up from 48% (v0.1) to 82% (v0.2 second half);
- the median commit size stable at 21–23 lines while throughput rose from 81 to 150 commits per
  active day;
- 2,417 passing tests;
- 0.15% duplication in `src/`;
- no dangling process-id reference in code.

Two structural facts make a one-off analysis insufficient:

- **The trend is the finding.** "82% of commits have a body" says little. "48% → 68% → 82%" says the
  rule works. A single reading of an identity metric is alarming, while its per-window sequence
  locates the day it started. Without a stored previous run, every analysis starts from zero and can
  only describe a state.
- **The project cannot yet read its own audit trail with its own tool.** `bug-075` keeps every
  Memory operation on this repository manual, and every measurement is a `git log`/`grep` exercise.
  A scripted, repeatable measurement is the only reliable reading of the history until the
  configuration moves to the repository root.

This decision does not measure the project's north star, the Determinism Index defined in
`docs/01_vision/01_product-brief.md`, and it asserts nothing about whether that index has been
measured. What a release-health run measures is whether governance holds from one release to the
next, on the project that builds it.

## Decision

### 1. A new sub-workflow, `release-health`, runs before the retrospective

`release-cycle.yaml` gains a `release-health` phase between `publishing` and `retrospective`. It runs
on every release, including one whose publishing phase is skipped, as v0.1's was (`dl-018`).

**The measurement point** is the tree a run measures. It is immutable, so a run can always be
reproduced:

- **the tag of the version actually published** (`dl-024`, `dl-074`), when publishing ran. A tag
  whose publish failed is **not** a measurement point. For v0.2 the point is `v0.2.1`, not `v0.2.0`,
  which was tagged and never published (`bug-135`);
- **otherwise**, the commit on `main` carrying the release's `released` transition.

The workflow has three phases:

```yaml
name: release-health
kind: sub
description: >-
  Measure the release with two fixed metric catalogues — git history and project quality — compare
  every metric with the previous release's run, and turn each regression or breached floor into an
  improvement proposal for the retrospective. Not a release gate: the release has already shipped.
version: 1.0
element: release

phases:
  - name: measure
    description: >-
      Run both analyses at the release's measurement point with the pinned toolchain; write the
      machine-readable report. Read-only on the repository under measurement.
    role: qa
    actions:
      - 'script.run("scripts/release-health/measure.cjs --release {release.version}")'
    produces:
      - "{health-dir}/release-health-{release.version}.json"
    checks:
      post: ["every catalogue metric has a value or an explicit not-measurable reason"]

  - name: compare
    description: >-
      Load the previous release's report, classify every metric as improved / stable / regressed /
      new / not-comparable, evaluate floors, and settle the previous run's proposals.
    role: facilitator
    actions:
      - 'script.run("scripts/release-health/compare.cjs --release {release.version}")'
    produces:
      - "{health-dir}/release-health-{release.version}.md"
    checks:
      post: ["every regressed metric and every breached floor has a finding"]

  - name: propose
    description: >-
      For each finding, check whether a bug or decision-log already tracks it; write an improvement
      proposal only for what is untracked. Proposals are input to the retrospective's
      additional-points gate, where the approver disposes of them.
    role: facilitator
    produces:
      - "## Proposals section of release-health-{release.version}.md"
```

`retrospective.yaml` changes accordingly:

- `explore` reads the health report alongside the Execution Notes;
- `additional-points` presents its proposals to the approver;
- the `retro-{release.version}` decision-log gains a `## Release health` section, holding the
  comparison table and the disposition of every proposal.

**Two things this YAML depends on and does not settle.**

- **`script.run(…)` has no binding.** No workflow token has one today, because no workflow engine
  executes `actions:`. The decision-log that the v0.2 retrospective files on which command each
  `actions:` and `checks:` token corresponds to owns that question. Until it is ratified, the two
  scripts are run by hand, like every other action.
- **`{health-dir}` is open.** The options are:
  - **(A)** `docs/06_health/` at the repository root, next to `docs/05_plans/`. The `plan` type
    already resolves there, and the location survives moving the configuration to the root.
  - **(B)** under the Memory root. That ties the reports to the Memory path patterns, which are
    about to move.

  Recommended: **(A)**, declared in `dna.yaml` `paths:`. The draft's `docs/self/docs/05_health/`
  is not an option, because it would reuse the `05_` prefix `docs/05_plans/` already holds.

### 2. Two versioned metric catalogues

The metrics are fixed in a catalogue, `{health-dir}/metrics.yaml`, not chosen per run. Each metric
has:

- a stable id;
- a definition precise enough to reimplement;
- a **scope**;
- a **kind**;
- where relevant, a direction and a tolerance.

Scopes:

- **`window`** — measured over the commits reachable from this release's measurement point and not
  from the previous one. History metrics are per release, never cumulative.
- **`snapshot`** — measured on the tree at the measurement point.

Kinds:

- **`floor`** — a condition that must always hold. A breach is a finding regardless of the trend.
- **`trend`** — compared with the previous run in a declared direction.
- **`info`** — reported for context, with no verdict.

Initial catalogue, version 1:

| id | Metric | Scope | Kind | Measures a decision from |
|---|---|---|---|---|
| G01 | Share of non-merge subjects in conventional form | window | floor 100% | |
| G02 | Share of non-merge commits with a body | window | trend ↑ | |
| G03 | Lines changed per non-merge commit: median, p90, share > 500 | window | trend ↓ | |
| G04 | Subject length: mean, share > 72 characters | window | trend ↓ | the `wf()` subject grammar |
| G05 | Share of code commits (`src/`, `test/`) citing a task or bug id | window | floor 100% | traceability directive |
| G06 | Approve and reject commits carrying `Approver:` and `Reason:` | window | floor 100% | `dl-067` |
| G07 | Commits whose author or committer is not a `team.members` entry, or uses an RFC 2606 reserved domain | window | floor 0 | REQ-SEC-01, REQ-SEC-03 |
| G08 | AI attribution: share of commits with a trailer, distinct trailer strings | window | trend per policy | — (no attribution policy yet) |
| G09 | Share of `wf()` commits using a verb outside the declared grammar | window | trend ↓ | `dl-079` |
| G10 | Share of `wf()` brackets using the canonical arrow | window | floor 100% | `dl-054`, `dl-079` |
| G11 | Back-merges per task branch | window | info | `dl-035` |
| G12 | Share of code commits that also touch `docs/` | window | trend per rule | — (no rule yet) |
| G13 | Share of `wf()` commits; commits per active day | window | info | |
| G14 | Secrets detected by the project's own scanner in the window's diffs | window | floor 0 | `spec-007` |
| G15 | Unmerged remote branches older than the release; Memory ids allocated twice across branches | snapshot | floor 0 | `dl-024` |
| Q01 | Build, typecheck (`tsconfig.json`), lint | snapshot | floor pass | |
| Q02 | Tests: total, failing, disabled | snapshot | floor 0 failing, 0 disabled | |
| Q03 | Coverage (statements, branches, functions, lines), `index.ts` included | snapshot | trend ↑ | `bug-021` |
| Q04 | Branch coverage of the critical modules: `memory/audit`, `memory/commit-message`, `memory/state-machine` | snapshot | floor 90% | `dl-011` |
| Q05 | Functions above complexity 15; functions above 80 lines | snapshot | trend ↓ | |
| Q06 | Duplication share in `src/` and `test/` (clones ≥ 8 lines) | snapshot | trend ↓ | |
| Q07 | Import cycles; imports that bypass `src/core` and that no element records as a deviation | snapshot | floor 0 | `spec-006` §1 |
| Q08 | Unused runtime dependencies; consumer install size | snapshot | floor 0 / trend ↓ | `dl-010` |
| Q09 | Process-id references in `src/` and `test/` that resolve to no Memory element (fixtures excluded) | snapshot | floor 0 | |
| Q10 | SARD requirements in the release's scope cited by at least one test | snapshot | floor 100% | |
| Q11 | `docs/examples` scripts executed and passing | snapshot | floor 100% | `dl-013` |
| Q12 | CLI latency p95 for the standard command set on a 40-element fixture | snapshot | floor < 1,000 ms | REQ-PERF-02 |
| Q13 | Bugs opened and closed in the window; open by severity; open with no release | window + snapshot | trend: closure ratio ↑, unassigned ↓ | `dl-016` |
| Q14 | Decision-logs `in-discussion`: count and median age | snapshot | trend ↓ | `dl-016` |
| Q15 | Share of bugs opened in the window that are document divergences | window | trend ↓ | |
| Q16 | Memory volume (words, median per type); comment-line ratio in `src/` | snapshot | info | |
| Q17 | The documented install command resolves to the documented version | snapshot | floor pass | `dl-013` (user documentation) |
| D01 | Determinism Index: equivalence of two independent runs of the benchmark project, same specs + WingFoil config, different agents | snapshot | trend ↑ | product brief (north star) |

**D01 and the benchmark (added 2026-09-28, approver ruling).** D01 measures the north star defined
in `docs/01_vision/01_product-brief.md`, the Determinism Index. It is measured in the project's
benchmark repository. That repository is recorded in this repository as an external-state element of
the type `dl-088-a-memory-type-for-state-that-lives-outside-the-repository` proposes (`svc-…`), with
its name and URL. The approver ruled that the rule keeping benchmark material out of this repository
concerns the benchmark's **content**, not its existence.

- **In `measure`**, every release-health run also runs the benchmark with the WingFoil build just
  published for the release being measured, and records D01's result.
- **In the report**, D01 carries its value, the definition of "equivalent" used, the WingFoil build,
  the benchmark's own commit, and the date of the run. They are written as data, not as a link, so
  the value is readable from this repository.
- D01 is compared with the previous run like every other metric. Its first value is expected from
  v0.3's release-health run, once the `service` type exists and the benchmark is registered.

**D01's rules, as set by the approver at the v0.2 retrospective gate (2026-09-28).**

- **Where the criterion lives.** The measurable criterion for "substantially equivalent" is defined
  **in this decision-log**, before D01's first run. The product brief states the goal: two
  independent runs "produce substantially equivalent software". It gives no criterion.
- **Which releases.** D01 runs on **major and minor releases only**. A patch release reports D01 as
  `not-comparable`, and the next minor compares with the previous minor.
- **When.** D01 runs **after `release-publishing`**, because it needs the published build, and before
  `retrospective`.

**The equivalence criterion (proposed; ratified with this decision).** Two runs are compared on the
benchmark's own versioned acceptance scenarios. Those scenarios are held by the benchmark and pinned
by its commit in the report.

- **The value.** D01 is the share of scenarios whose verdict (pass or fail) is the **same** on both
  runs' outputs, reported as `agreeing / total`.
- **The threshold.** "Substantially equivalent" holds when D01 is at or above **90%** and **both runs
  pass every scenario marked critical**.
- **The comparison.** The trend is compared minor to minor. A drop of more than the catalogue's
  default tolerance is a finding, like any other trend metric.
- **Alternatives for the approver**, if the proposal is not taken:
  - a stricter threshold (95% or 100%);
  - adding structural similarity of the outputs, which measures form rather than behaviour;
  - reporting the value without a threshold for the first two runs, to calibrate before judging.

Adding, removing or redefining a metric bumps the catalogue version and requires a decision-log.
Metrics are never dropped silently: a retired metric stays in the catalogue, marked `retired` with
the release that retired it.

### 3. Every run compares itself with the previous run

`compare` loads the most recent earlier report and classifies each metric:

- **improved** — moved in the declared direction by more than the tolerance;
- **stable** — within the tolerance;
- **regressed** — moved against the declared direction by more than the tolerance;
- **new** — no previous value;
- **not-comparable** — the definition changed and the baseline could not be recomputed.

Default tolerances are 2 percentage points for shares, and 10% relative for counts, sizes and
durations. The catalogue may override them per metric. When a window holds fewer than 30 relevant
items the metric is flagged `small-sample`. A regression on it is reported but proposes nothing on
its own.

**Like-for-like comparison.** If the previous report was produced with an older catalogue version,
`compare` re-measures the previous measurement point with the current catalogue instead of comparing
across definitions. Every metric is derived from git at an immutable commit, so the previous
release can always be measured again. The stored previous report stays as it was, for audit.

**Trend depth.** When three or more runs exist, the report shows each metric's last three values. A
slow drift inside the tolerance of every single step then stays visible. G04 moved 56% → 70% → 74%
→ 82% across the v0.1 and v0.2 windows at `5269223d`.

### 4. Findings become proposals, and proposals are followed up

A **finding** is any breached floor, and any regressed trend metric outside `small-sample`. For each
finding, `propose` records the evidence: the metric values and the commits or files behind them. It
then searches Memory for an element that already tracks the finding:

- **tracked** — it cites the element and proposes nothing new;
- **untracked** — it writes a proposal ready for the retrospective's Dispositions table, with the
  finding, the evidence, a proposed element type and a proposed target release.

Each proposal carries an id, `RH-{release.version}-NN`. The next run settles every proposal of the
previous run:

- **adopted and effective** — the linked metric improved;
- **adopted, no effect yet** — the linked element exists, but the metric did not move;
- **not adopted** — the approver rejected or deferred it in the retrospective;
- **superseded** — another decision covered it.

This closes a loop the retrospective leaves open today: it records what was decided, but nothing
checks whether the decision changed anything. Improvements are reported with the same care. Where
an improvement follows an adopted proposal or a ratified decision-log, the report names it, so the
retrospective can answer "what worked" with evidence.

### 5. Not a gate, with two exceptions

`release-health` blocks nothing, because the release has already been published. It feeds the
retrospective. There are two exceptions, where waiting for the next retrospective would let the
damage grow:

- a breach of **G07** (identity), **G14** (secrets) or **G10** (canonical arrow) is filed as a bug
  immediately, through `bug-ingest`, in the same run;
- a breach of **Q01** or **Q02** at a published tag is filed the same way, since it means the
  published artefact was built from a red tree.

### 6. Reproducibility of the measurement itself

- The scripts live in `scripts/release-health/`, next to the existing release scripts, and are
  versioned with the code they measure.
- They run with the pipeline's pinned Node version (`publish.yml` `env.NODE_VERSION`) from
  `npm ci`. The report records the Node version, the npm version and the lockfile hash.
- They are read-only on the repository. They measure in a throw-away worktree at the measurement
  point, and they **never write git configuration**. `git config` inside a worktree writes to the
  configuration shared by every worktree of the repository. Any identity a measurement needs goes
  through `git -c` or environment variables, inside a temporary directory.
- The report stores raw counts next to every percentage, so any value can be recomputed by hand.

### 7. Baseline

v0.1 is backfilled at `5b16ab61` (`wf(release): approve minor-v0.1 [releasing → released]`). v0.2 is
measured at `v0.2.1`. So the first scripted run can compare v0.2 against v0.1 like-for-like, and v0.3
against v0.2.

The scripts do not exist yet, so the v0.2 retrospective measures by hand, at `v0.2.1`, with the
catalogue as its checklist. The 2026-09-28 analysis at `5269223d` precedes the release's last three
phases, and serves only as a provisional reading. Its values, v0.2 second-half window against v0.1:

| id | v0.1 | v0.2 (2nd half) | Verdict |
|---|---|---|---|
| G01 | 100% | 100% | floor held |
| G02 | 48% | 82% | improved |
| G03 median / p90 | 23 / 206 | 23 / 249 | stable / regressed (p90) |
| G04 share > 72 | 56% | 82% | regressed |
| G05 | 100% | 99% | floor breached (1 commit) |
| G06 | 52/52 | 100/100 | floor held |
| G07 | 0 | 902 | floor breached |
| G08 | 15% | 75% | policy pending |
| G09 | 38% | 40% | stable |
| G10 | 100% | 48% | floor breached |
| G12 | 6% | 26% | rule pending |
| Q03 statements / branches | — | 98.6% / 94.0% | new |
| Q04 `memory/audit` branches | — | 64.7% | floor breached |
| Q06 `src/` | — | 0.15% | new |
| Q08 unused runtime deps | — | 1 (10 MB of 46 MB) | floor breached |
| Q13 closure ratio | — | 35% (44/124) | new |

## Rationale

- **It measures what the Execution Notes cannot.** Every condition listed under Context was outside
  what any agent reported. The retrospective's `explore` phase mines testimony, and this adds
  instruments. Neither replaces the other.
- **Comparison is what makes a measurement actionable.** A fixed catalogue, stored reports and
  like-for-like recomputation turn isolated snapshots into a trend. The trend separates three cases:
  "a rule that works" (G02), "a convention that drifts" (G04, G09, G10) and "an accident with a
  start date" (G07).
- **Proposals are only useful if they are followed up.** Settling the previous run's proposals is
  the cheapest way to learn whether a retrospective decision changed anything.
- **Before the retrospective, not inside it.** The report must exist before `explore` starts, so the
  friction inventory and the measurements meet at `additional-points`. A separate sub-workflow
  keeps the measurement independent of the facilitator, and lets it run on demand without starting
  a retrospective.
- **Not a gate, because the release has shipped.** A gate at that point would block nothing. Its
  weight comes from filing the safety floors immediately, and from the retrospective disposing of
  every proposal.

Alternatives considered:

- **(a) Add both analyses as actions of `retrospective.explore`.** Rejected. It ties the measurement
  to the retrospective's facilitator and schedule, and it mixes testimony with instruments in one
  output.
- **(b) Run the analyses continuously in CI on every push.** Deferred, not rejected. It is the
  natural next step once CI runs on push; today `.github/workflows/` holds only `publish.yml`. The
  catalogue's floors are exactly the checks such a job would enforce. It does not remove the need
  for a per-release comparison.
- **(c) Keep them ad hoc, run when someone suspects a problem.** Rejected. That is how the identity
  condition stayed unseen from 2026-09-17 until 2026-09-28, and ad-hoc runs cannot be compared with
  each other.
- **(d) Put the reports in Memory as a new element type.** Deferred. A report is generated, not
  authored, and has no lifecycle to govern. If a later release wants approval on the report itself,
  a `health-report` type can be added then.

**Trade-offs.**

- **Cost.** The quality analysis runs the full test suite with coverage, about 205 s on the
  reference machine, plus the linters and the smoke. A run costs minutes, not seconds.
- **Maintenance.** The catalogue adds a maintenance duty. A metric whose definition goes stale
  produces noise, which is why changes go through a decision-log and retired metrics stay visible.
- **Calibration.** Tolerances are initial guesses and will need one or two releases of calibration.

## Actions

- [ ] Ratify or amend this decision, including option (A)/(B) for `{health-dir}` (owner: approver).
- [ ] Task: `scripts/release-health/measure.cjs` and `compare.cjs`, implementing catalogue v1, with
  tests on a fixture repository. The commands the v0.2 retrospective uses by hand are the starting
  point.
- [ ] Task: `{health-dir}/metrics.yaml` (catalogue v1), the report templates (`.json` schema and `.md`
  layout), and the `dna.yaml` `paths:` entry for `{health-dir}`.
- [ ] Config: add `release-health.yaml`; wire it into `release-cycle.yaml` before `retrospective`;
  extend `retrospective.yaml`'s `explore` and `additional-points`, and the `retro-*` capture, with a
  `## Release health` section. Each workflow file bumps its `version`.
- [ ] Backfill v0.1 at `5b16ab61` and measure v0.2 at `v0.2.1` with the scripts, so that the v0.3
  run starts with two comparable baselines.
- [ ] The `align-agent-docs` phase (`dl-025`) records, in the agent-facing documentation, where the
  reports live and that the scripts must never write git configuration.

## Relations

- **Extends:** `retrospective.yaml` and its explore/additional-points structure (`dl-019`, `retro-v0.1`);
  `release-cycle.yaml`.
- **Follows the staging model of:** `dl-023-init-cli-e2e-smoke-gate` (a standing phase with a produced
  report), without its warn → reject staging, since this phase blocks nothing.
- **Measures decisions from:** `dl-010` (Q08), `dl-011` (Q04), `dl-016` (Q13, Q14), `dl-024` and
  `dl-035` (G11, G15), `dl-054` and `dl-079` (G09, G10), `dl-067` (G06), `spec-006` §1 (Q07),
  `spec-007` (G14), REQ-PERF-02 (Q12).
- **Depends on:** the workflow-token binding decision-log filed in the same retrospective, which
  decides what `script.run` means.
- **Works around, until the configuration moves to the root:** `bug-075` — the scripts read git and
  files directly, because the Memory verbs cannot read this repository's Memory.
- **Id allocation:** the draft circulated outside the repository as `dl-087`. It was free at its
  measurement point `5269223d`, where `git ls-tree -r --name-only 5269223d --
  docs/self/docs/04_memory/design/dls/ | grep -c dl-087` gives `0`. By the time the draft was filed,
  `main` had assigned `dl-087` to `dl-087-publish-through-npm-staged-publishing`, added at
  `a567a987`. It was first filed as `dl-088` (`1c586896`, `d4c8f220`). The next free number
  across every ref, checked by the all-refs loop, was `dl-088` at that moment. A parallel session then
  pushed its own `dl-088`, for the external-state Memory type, on a branch that was later withdrawn.
  This element was the unpushed one, so it was renumbered to `dl-089` before any merge. The
  external-state decision was re-filed by the v0.2 retrospective as
  `dl-088-a-memory-type-for-state-that-lives-outside-the-repository`, which is the id this document
  cites.
- **Amended by** `dl-133-fix-task-tail` (2026-09-29, v0.3 planning): the catalogue gains the fix-share metrics; and by `dl-131-determinism-index-scope`: D01 is the Index's outcome component, and the process-conformance measures join the catalogue.

**Note (2026-10-15, approver triage of the W3 B7 follow-ups, item E4; `bug-ingest-rel-v0.3-w3b7-review-findings-plan`).**
§6 says the scripts "run with the pipeline's pinned Node version (`publish.yml` `env.NODE_VERSION`)". The bound
command lines do not: `release-health.measure` and `release-health.compare` pass `--any-node` (and `--max-workers 2`,
`dl-170`'s interim rule) since `bindings.yaml` 1.9 (`task-241`, `bug-344`, approver ruling D3 of 2026-10-12; `sed -n
107,113p .wingfoil/workflows/bindings.yaml`). With it, the toolchain metrics (Q01-Q04, Q11, Q12, Q17) are measured
under the Node that runs the step, each entry recording `node` and `node_pinned`, instead of `not-measurable`
(`scripts/release-health/measure.cjs` header, line 39); measuring under the pin means running the same vector under
`n -d exec <NODE_VERSION>`. This repository's host has only Node v22.21.0 against the pinned 22.12.0, and both
baselines (`docs/08_health/release-health-v0.1.json`, `-v0.2.json`) were measured that way. The approver asked for
this note on 2026-10-13 (`task-241`'s rulings, item I). For ratification with the next amendment of this decision:
§6 keeps the pinned Node as the rule and names `--any-node` as a recorded exception, or the binding runs the step
under the pin. The Decision above is unchanged.
