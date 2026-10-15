# Case study: WingFoil develops WingFoil

WingFoil manages its own development: the decisions, rules, roles and states of this repository are WingFoil
elements, and every change of state is a git commit WingFoil writes or reads. This page shows how that works and what
the first two measurements of that history found. Every figure on it is read from a committed release-health report,
[`release-health-v0.1.json`](08_health/release-health-v0.1.json) or
[`release-health-v0.2.json`](08_health/release-health-v0.2.json); each comes with the metric's definition from the
catalogue [`metrics.yaml`](08_health/metrics.yaml) and the point it was measured at. The floors breached are shown as
they were measured.

## How this repository is governed

- **The configuration** is WingFoil's own, at the repository root: [`.wingfoil/dna.yaml`](../.wingfoil/dna.yaml)
  (modules, stacks, team and roles), [`.wingfoil/memory.yaml`](../.wingfoil/memory.yaml) (the element types and their
  state machines), [`.wingfoil/roles.yaml`](../.wingfoil/roles.yaml) (which directive binds which role) and
  [`.wingfoil/workflows.yaml`](../.wingfoil/workflows.yaml) (the lifecycle, from inception to the end of life).
- **The Memory** — releases, tasks, bugs, decision-logs, ADRs, tech-specs, plans and services — lives under
  [`docs/04_memory/`](04_memory/) and [`docs/05_plans/`](05_plans/), one Markdown file per element, its state in its
  frontmatter.
- **One commit per state change.** Each change of state is a commit whose subject names the type, the verb, the ids
  and the transition, such as `wf(task): approve <id> [in-review → approved]`; approvals and rejections also carry an
  `Approver:` line and a `Reason:` block. `wingfoil memory history <id>` reads them back.
- **A pinned build** of WingFoil runs these operations: the published package, installed as the devDependency
  `wingfoil-released` in [`package.json`](../package.json) (`dl-095`), so the repository is governed by a released
  WingFoil, not by the code under development.
- **The approver is a human.** The AI agents work as `developer`, `qa`, `reviewer` and `architect`, and never hold
  approval authority: every gate is crossed by the `approver` role.
- **Separate sessions for separate duties.** In the [`dev-loop`](../.wingfoil/workflows/custom/dev-loop.yaml)
  workflow the failing tests are written in `red` by a separate `qa` agent, and the review is independent of the work
  it judges. The workflow declares this with `distinct_from` on two phases (`dl-134`): `green` is `distinct_from:
  [red]`, and `review` is `distinct_from: [red, green, refactor]`. That the design also runs in a session of its own
  is how this repository practises it, not something the workflow declares.
- **At v0.1 and v0.2, the configuration lived elsewhere.** Until `task-111` moved it to the root, during the development of 0.2.2,
  it was kept under `docs/self/`, where the release-health script, which reads `.wingfoil/` at the root, does not look. That is
  why most of the static and Memory metrics below are not measurable at either point.

## How it was measured

The release-health workflow (`dl-089-release-health-analyses-before-retrospective`) measures every metric of the
catalogue at one point per release, with
[`scripts/release-health/measure.cjs`](../scripts/release-health/measure.cjs), and compares the result with the
previous release. A **window** metric reads the commits reachable from this release's point and not from the previous
one; a **snapshot** metric reads the tree at the point. The two reports on this page were measured by `task-241`, in
a throw-away worktree, offline:

| Release | Measurement point | Basis | Previous run | Toolchain |
|---|---|---|---|---|
| v0.1 (minor-v0.1) | `5b16ab61`, the commit approving `minor-v0.1` as released | released-transition | none: every metric is new; the window is the whole history | Node and npm of the measuring machine |
| v0.2 (minor-v0.2) | the tag `v0.2.1` at `9833e00a`, the version published on npm | published-tag | v0.1, report `release-health-v0.1.json` | Node and npm of the measuring machine |

**v0.1 is a partial baseline.** At `5b16ab61`, `npm ci` refuses the lockfile under the npm of the measuring machine,
so none of the toolchain metrics (build, tests, coverage, examples, latency, install) could be measured there. The
patch 0.2.2 has no report: the backfill measured v0.1 and v0.2 only.

## Figures

Every metric measured in at least one of the two reports, in catalogue order. *Kind* is the catalogue's: a **floor**
must always hold, a **trend** is compared with the previous run in its direction, **info** is reported for context.

| id | Metric | Definition | Scope | Kind | v0.1 at 5b16ab61 | v0.2 at v0.2.1 (9833e00a) |
|---|---|---|---|---|---|---|
| G01 | Conventional subjects | Share of non-merge commits whose subject is in conventional form (`type(scope): text` or `wf(type): verb ids`). | window | floor (100%) | 94.99 % (379/399) | 100 % (1453/1453) |
| G02 | Commit bodies | Share of non-merge commits with a non-empty body (trailer lines excluded). | window | trend (up) | 43.86 % (175/399) | 41.36 % (601/1453) |
| G03 | Commit size | Lines added plus deleted per non-merge commit (`git show --numstat`, binary files excluded) — median, p90, and the share above 500. | window | trend (down) | median 25 lines, p90 295; 5.51 % over 500 (22 of 399 commits) | median 25 lines, p90 224; 2.34 % over 500 (34 of 1453 commits) |
| G04 | Subject length | Subject length in characters of non-merge commits — mean, and the share above 72. | window | trend (down) | mean 94.16 characters; 53.88 % over 72 (215/399) | mean 99.71 characters; 77.63 % over 72 (1128/1453) |
| G06 | Approval evidence | Approve and reject `wf()` commits carrying an `Approver:` line and a non-blank `Reason:` block, as a count over all approve and reject commits. | window | floor (100%) | 100 % (53/53) | 99.53 % (210/211) |
| G08 | AI attribution conformance | Share of commits carrying an AI attribution trailer that follow the attribution rule of the git-conventions directive §7 (dl-117 Q1 (B), Q2 (c)): `Co-Authored-By:` names a `dna.yaml` `team.agents` entry and an `AI-Model:` trailer is present; plus the number of approve and reject commits carrying any AI attribution trailer (must be 0), and the distinct trailer strings as context. Commits older than the rule's ratification are counted apart and never judged. | window | floor (100% conforming, 0 approve/reject with AI attribution) | no commit judged (0): 65 commits predate the rule; 0 approve or reject commits carry an AI trailer | no commit judged (0): 847 commits predate the rule; 0 approve or reject commits carry an AI trailer |
| G09 | Verbs outside the grammar | Share of `wf()` commits whose verb is not in the declared grammar (`MEMORY_OPERATIONS`, src/memory/audit.ts, at the measurement point). | window | trend (down) | 16.5 % (34/206) | 0.23 % (2/876) |
| G10 | Canonical arrow | Share of `wf()` transition brackets using the canonical arrow `→`. | window | floor (100%) | 100 % (153/153) | 70.62 % (411/582) |
| G11 | Back-merges | Merges of `main` into a `task/*` branch, per task branch merged in the window. | window | info | 0 per task branch (0 back-merges, 33 task branches merged) | 1.23 per task branch (92 back-merges, 75 task branches merged) |
| G13 | Flow volume | Share of `wf()` commits among non-merge commits; non-merge commits per active day (a day with at least one commit, author date). | window | info | 51.63 % `wf()` (206/399); 30.69 commits per active day (13 active days) | 60.29 % `wf()` (876/1453); 111.77 commits per active day (13 active days) |
| G14 | Secrets in diffs | Findings of the project's own secret scanner (spec-007 patterns) over the window's diffs. | window | floor (0) | 0 blocking, 0 warnings | 29 blocking, 1 warning |
| G15 | Stale branches and duplicate ids | Unmerged remote branches older than the release; Memory ids allocated twice across branches (the duplicate-id scan of dl-101 Action 4). | snapshot | floor (0) | 0 stale branches, 0 duplicate ids (read at run time, 31 refs) | 1 stale branch, 0 duplicate ids (read at run time, 31 refs) |
| G16 | Tool-signed flow commits | Share of `wf()` commits carrying the `WingFoil-Version:` trailer in their trailing trailer paragraph — separates tool-written from hand-written drift in G09 and G10. | window | info | 0 of 206 flow commits | 0 of 876 flow commits |
| Q02 | Tests | `npm test`: total, failing and disabled (skipped or todo) tests. | snapshot | floor (0 failing, 0 disabled) | not measurable: npm ci failed (exit 1): npm error code EUSAGE | 2418 tests, 0 failing, 0 disabled |
| Q03 | Coverage | `npm run test:coverage` totals — statements, branches, functions, lines — every file under `paths.sources` included, `index.ts` too. | snapshot | trend (up) | not measurable: npm ci failed (exit 1): npm error code EUSAGE | statements 98.58 %, branches 94.03 %, functions 98.94 %, lines 99.41 % |
| Q04 | Critical-module branch coverage | Branch coverage of src/memory/audit.ts, src/memory/commit-message.ts and src/memory/state-machine.ts. | snapshot | floor (90%) | not measurable: npm ci failed (exit 1): npm error code EUSAGE | `src/memory/audit.ts` 64.7 % (22/34); `src/memory/commit-message.ts` 100 % (43/43); `src/memory/state-machine.ts` 93.75 % (45/48) |
| Q11 | Runnable examples | Share of docs/examples scripts executed and passing. | snapshot | floor (100%) | not measurable: npm ci failed (exit 1): npm error code EUSAGE | 100 % (5/5 scripts) |
| P01 | Well-formed flow commits | `wf(...)` commits whose subject and body are well-formed per the commit grammar: a declared verb, the `[from → to]` bracket, `Approver:` line and non-blank `Reason:` block wherever the verb requires them. | window | floor (0 failing) | 61 failing of 206 checked | 297 failing of 876 checked |
| P02 | Legal transitions | Status changes in the window that are not a legal transition of their type's state machine in `memory.yaml` (REQ-STATE-01). | window | floor (0 failing) | 0 failing of 399 checked, 206 unchecked | 15 failing of 1453 checked, 876 unchecked |
| P03 | Produces present | Phases recorded as complete in the window (workflow deduction, spec-017) whose `produces:` artifacts are absent at the measurement point. | window | floor (0 failing) | 0 failing of 0 checked | 0 failing of 0 checked |
| P04 | Traceability chain | Broken links of the chain feature → user story → BDD scenario → REQ → task, for the elements touched in the window. | window | floor (0 failing) | 0 failing of 0 checked | 0 failing of 0 checked |
| P05 | Roles and separation of duties | Phases run in the window by an actor that does not hold the phase's declared role, or by the same actor where the workflow requires distinct ones (`distinct_from`, dl-134), read from the run log (`paths.runs`) and the commits. | window | floor (0 failing) | 0 failing of 53 checked, 53 unchecked | 137 failing of 211 checked, 216 unchecked |
| P07 | Byte-identical recomputation | Computing P01–P06 twice on the same commit range and configuration yields byte-identical results. | window | floor (pass) | pass: 2 runs, byte-identical | pass: 2 runs, byte-identical |

## What the figures say

- **Commit form holds, with one gap at the start.** G01 is 94.99 % at v0.1 because the window starts at the first
  commit, before the conventional form was adopted; at v0.2 it is 100 %.
- **Approval evidence.** G06 holds at v0.1 (53/53); at v0.2 one approval of 211 carries no evidence (210/211), and the
  report names that commit.
- **The canonical arrow.** G10 drops to 70.62 % at v0.2 (411/582): many transition brackets of that release were
  written by hand with an ASCII `->` instead of `→`.
- **Secrets in diffs.** G14 finds 29 blocking findings at v0.2. They are not leaked secrets: the scanner reads test
  diffs, and most are the fake keys in its own test file, `test/validation/secret-scan.test.ts`; the rest are in a bug
  report about that fixture, another test and a phase plan. The report lists each with its commit and pattern.
- **Process conformance (P).** P01 counts malformed flow commits, and its causes differ by release (each commit's
  reasons are in the report's `failing` list):
  - at v0.1, 61 failing: 34 use a verb the grammar does not declare (in 27 of them an element id sits where the verb
    should be, as in `wf(task): task-024 design …`), 26 carry no transition bracket, and 1 approval carries an AI
    co-author trailer; none uses the ASCII arrow, which G10's full share at v0.1 agrees with;
  - at v0.2, 297 failing: 165 write the bracket with the ASCII `->`, 92 are approvals or rejections carrying an AI
    co-author trailer (21 of them also with the ASCII bracket), 57 are `submit` subjects with no bracket, and 4
    have another defect.
  P02 finds 15 status changes at v0.2 that the commit subject does not name, such as a task's start moving its bug.
  P05 finds 137 approve, reject and finalize commits at v0.2 whose `Approver:` line names the approver but whose author is the
  placeholder identity `<probe@example.invalid>` (`Probe` in `git log`), the same one in all of them (`dl-094`). P03 and P04 checked
  no item at either point, so they say nothing yet. P07 passes at both: computing
  the P metrics twice gives byte-identical results.
- **Quality at v0.2.** The 2418 tests pass with none disabled (Q02), coverage is high (Q03), all the runnable
  examples pass (Q11), and one critical module, `src/memory/audit.ts`, is below the 90 % branch floor at 64.7 % (Q04).
- **Volume.** At v0.2 more than half of the non-merge commits are `wf()` commits (G13): most of the history is the
  governance record itself.

None of these findings was filed as a new element from this backfill; the release-health workflow proposes them at
the next run.

## Not measurable yet

Every metric that neither report could measure, with the report's own reason.

| id | Metric | v0.1 | v0.2 |
|---|---|---|---|
| G05 | Code commits citing an id | no relevant commit in the window (total: 0) | no relevant commit in the window (total: 0) |
| G07 | Unknown identities | no team.members at the measurement point (no .wingfoil/dna.yaml there, or it declares no team.members): no identity can be judged | no team.members at the measurement point (no .wingfoil/dna.yaml there, or it declares no team.members): no identity can be judged |
| G12 | Code commits touching docs | no relevant commit in the window (total: 0) | no relevant commit in the window (total: 0) |
| Q01 | Build, typecheck, lint | npm ci failed (exit 1): npm error code EUSAGE | package.json at the measurement point has no `typecheck` script |
| Q05 | Complexity | dna.yaml at the measurement point declares no paths.sources (no .wingfoil/dna.yaml there: measure at a commit that has one, with --at) | dna.yaml at the measurement point declares no paths.sources (no .wingfoil/dna.yaml there: measure at a commit that has one, with --at) |
| Q06 | Duplication | no code line under paths.sources or paths.tests at the measurement point | no code line under paths.sources or paths.tests at the measurement point |
| Q07 | Cycles and layering | dna.yaml at the measurement point declares no paths.sources (no .wingfoil/dna.yaml there: measure at a commit that has one, with --at) | dna.yaml at the measurement point declares no paths.sources (no .wingfoil/dna.yaml there: measure at a commit that has one, with --at) |
| Q08 | Dependency footprint | dna.yaml at the measurement point declares no paths.sources (no .wingfoil/dna.yaml there: measure at a commit that has one, with --at) | dna.yaml at the measurement point declares no paths.sources (no .wingfoil/dna.yaml there: measure at a commit that has one, with --at) |
| Q09 | Dangling process ids | dna.yaml at the measurement point declares no paths.sources (no .wingfoil/dna.yaml there: measure at a commit that has one, with --at) | dna.yaml at the measurement point declares no paths.sources (no .wingfoil/dna.yaml there: measure at a commit that has one, with --at) |
| Q10 | Requirements cited by tests | dna.yaml at the measurement point declares no paths.tests (no .wingfoil/dna.yaml there: measure at a commit that has one, with --at) | dna.yaml at the measurement point declares no paths.tests (no .wingfoil/dna.yaml there: measure at a commit that has one, with --at) |
| Q12 | CLI latency | npm ci failed (exit 1): npm error code EUSAGE | package.json at the measurement point has no `test:latency` script |
| Q13 | Bug flow | memory.yaml at the point declares no bug type | memory.yaml at the point declares no bug type |
| Q14 | Open decision-logs | memory.yaml at the point declares no decision-log type | memory.yaml at the point declares no decision-log type |
| Q15 | Document divergences | memory.yaml at the point declares no bug type | memory.yaml at the point declares no bug type |
| Q16 | Memory volume | no .wingfoil/memory.yaml at the measurement point; dna.yaml at the measurement point declares no paths.sources (no .wingfoil/dna.yaml there: measure at a commit that has one, with --at) | no .wingfoil/memory.yaml at the measurement point; dna.yaml at the measurement point declares no paths.sources (no .wingfoil/dna.yaml there: measure at a commit that has one, with --at) |
| Q17 | Install command | npm ci failed (exit 1): npm error code EUSAGE | offline run (--offline): npm view was not run |
| Q18 | Fix share | memory.yaml at the point declares no task type | memory.yaml at the point declares no task type |
| Q19 | Tasks added after commit-backlog | memory.yaml at the point declares no task type | memory.yaml at the point declares no task type |
| Q20 | Bug net flow | memory.yaml at the point declares no bug type | memory.yaml at the point declares no bug type |
| D01 | Determinism Index — outcome equivalence (O) | needs D01's two benchmark runs with the build just published (dl-089 §2, dl-131); no run of this script performs them | needs D01's two benchmark runs with the build just published (dl-089 §2, dl-131); no run of this script performs them |
| P06 | Flow sequence between two runs | needs D01's two benchmark runs with the build just published (dl-089 §2, dl-131); no run of this script performs them | needs D01's two benchmark runs with the build just published (dl-089 §2, dl-131); no run of this script performs them |
| E01 | GitHub stars | offline run (--offline): the external snapshot was not read | offline run (--offline): the external snapshot was not read |
| E02 | GitHub forks | offline run (--offline): the external snapshot was not read | offline run (--offline): the external snapshot was not read |
| E03 | GitHub watchers | offline run (--offline): the external snapshot was not read | offline run (--offline): the external snapshot was not read |
| E04 | 14-day traffic | offline run (--offline): the external snapshot was not read | offline run (--offline): the external snapshot was not read |
| E05 | npm downloads | offline run (--offline): the external snapshot was not read | offline run (--offline): the external snapshot was not read |

The causes, grouped:

- **No configuration at the root.** At both points the configuration was under `docs/self/`, so the script found no
  `paths.sources`, no `team.members` and no Memory types: G05, G07, G12, Q05–Q10, Q13–Q16 and Q18–Q20.
- **The v0.1 toolchain.** `npm ci` refused the v0.1 lockfile, and v0.2 had no `typecheck` or `test:latency` script:
  Q01, Q12, and Q17 at v0.1 (at v0.2 it waits on the offline run, below).
- **Offline runs.** The external snapshot (stars, forks, watchers, traffic, downloads) is a reading at run time; an
  offline backfill does not read it, since it would record today's values as the past's: E01–E05, and Q17 at v0.2.
- **The Determinism Index outcome.** D01 and P06 need two independent benchmark runs with the build just published;
  the benchmark is the `service` element `svc-020`, and no release has run it yet.

v0.3 is expected to be the first release measured with its configuration at the root (0.2.2, the first built that way, has no report), so most of this table should
become measurable at its release-health run. That is an expectation, not a measurement.

## Reproduce

From the repository root, with the dependencies installed and the build in `dist/`:

```bash
npm ci && npm run build
node scripts/release-health/measure.cjs --release v0.1 --any-node --max-workers 2 --offline
node scripts/release-health/measure.cjs --release v0.2 --any-node --max-workers 2 --offline
```

Each run writes `docs/08_health/release-health-<version>.json`; `git diff` against the committed reports shows what
changed. A history metric reads the same commits and gives the same value; a toolchain metric depends on the Node and
npm of the machine, and a run-time reading (G15) on the branches present when it runs.
