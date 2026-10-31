# Case study: WingFoil develops WingFoil

WingFoil manages its own development: the decisions, rules, roles and states of this repository are WingFoil
elements, and every change of state is a git commit WingFoil writes or reads. This page shows how that works and what
the four measurements of that history found, at v0.1, v0.2, v0.3 and v0.3.1. Every figure on it is read from a
committed release-health report:
[`release-health-v0.1.json`](08_health/release-health-v0.1.json),
[`release-health-v0.2.json`](08_health/release-health-v0.2.json),
[`release-health-v0.3.json`](08_health/release-health-v0.3.json) and
[`release-health-v0.3.1.json`](08_health/release-health-v0.3.1.json); each comes with the metric's definition from the
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
- **Two builds, each with its job.** The operations that write a `wf()` commit run on the build compiled from the
  checkout (`npm run build`, then `node dist/cli.js <command>`); the read commands and the MCP server run on a
  published, pinned build, installed as the devDependency `wingfoil-released` in [`package.json`](../package.json)
  (`dl-095`), so they answer as the version users have. The
  [`wingfoil-cli`](../.wingfoil/directives/custom/wingfoil-cli.md) directive says which build runs which command.
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
one; a **snapshot** metric reads the tree at the point. The v0.1 and v0.2 reports were measured by `task-241`, as a
backfill, in a throw-away worktree, offline; the v0.3 and v0.3.1 reports were measured by the `release-health` phase of
their own release, and each has a comparison with its previous release, [`release-health-v0.3.md`](08_health/release-health-v0.3.md)
and [`release-health-v0.3.1.md`](08_health/release-health-v0.3.1.md):

| Release | Measurement point | Basis | Previous run | Toolchain |
|---|---|---|---|---|
| v0.1 (minor-v0.1) | `5b16ab61`, the commit approving `minor-v0.1` as released | released-transition | none: every metric is new; the window is the whole history | Node and npm of the measuring machine |
| v0.2 (minor-v0.2) | the tag `v0.2.1` at `9833e00a`, the version published on npm | published-tag | v0.1, report `release-health-v0.1.json` | Node and npm of the measuring machine |
| v0.3 (minor-v0.3) | the tag `v0.3.0` at `cc31d7a8`, the version published on npm | published-tag | v0.2, report `release-health-v0.2.json` | Node v22.12.0, npm 10.9.0 |
| v0.3.1 (patch-v0.3.1) | the tag `v0.3.1` at `870bd440`, the version published on npm | published-tag | v0.3, report `release-health-v0.3.json` | Node v22.12.0, npm 10.9.0 |

**v0.1 is a partial baseline.** At `5b16ab61`, `npm ci` refuses the lockfile under the npm of the measuring machine,
so none of the toolchain metrics (build, tests, coverage, examples, latency, install) could be measured there. The
patch 0.2.2 has no report: the backfill measured v0.1 and v0.2 only. **v0.3.1 is a patch**: the two metrics that
need the Determinism Index's benchmark runs (D01 and P06) are measured on major and minor releases only, so the
report records them as not comparable there, and its window is short (a metric over fewer than thirty items is
flagged `small_sample` in the report, as the catalogue defines).

## Figures

Every metric measured in at least one of the four reports, in catalogue order. *Kind* is the catalogue's: a **floor**
must always hold, a **trend** is compared with the previous run in its direction, **info** is reported for context.

| id | Metric | Definition | Scope | Kind | v0.1 at 5b16ab61 | v0.2 at v0.2.1 (9833e00a) | v0.3 at v0.3.0 (cc31d7a8) | v0.3.1 at v0.3.1 (870bd440) |
|---|---|---|---|---|---|---|---|---|
| G01 | Conventional subjects | Share of non-merge commits whose subject is in conventional form (`type(scope): text` or `wf(type): verb ids`). | window | floor (100%) | 94.99 % (379/399) | 100 % (1453/1453) | 100 % (5591/5591) | 100 % (727/727) |
| G02 | Commit bodies | Share of non-merge commits with a non-empty body (trailer lines excluded). | window | trend (up) | 43.86 % (175/399) | 41.36 % (601/1453) | 37.81 % (2114/5591) | 58.32 % (424/727) |
| G03 | Commit size | Lines added plus deleted per non-merge commit (`git show --numstat`, binary files excluded) — median, p90, and the share above 500. | window | trend (down) | median 25 lines, p90 295; 5.51 % over 500 (22 of 399 commits) | median 25 lines, p90 224; 2.34 % over 500 (34 of 1453 commits) | median 9 lines, p90 114; 1.68 % over 500 (94 of 5591 commits) | median 2 lines, p90 83; 1.1 % over 500 (8 of 727 commits) |
| G04 | Subject length | Subject length in characters of non-merge commits — mean, and the share above 72. | window | trend (down) | mean 94.16 characters; 53.88 % over 72 (215/399) | mean 99.71 characters; 77.63 % over 72 (1128/1453) | mean 115.9 characters; 87.07 % over 72 (4868/5591) | mean 103.16 characters; 77.03 % over 72 (560/727) |
| G05 | Code commits citing an id | Share of non-merge commits touching `paths.sources` or `paths.tests` whose subject or body cites a task or bug id. | window | floor (100%) | not measurable: no relevant commit in the window (total: 0) | not measurable: no relevant commit in the window (total: 0) | 99.87 % (775/776) | 97.96 % (48/49) |
| G06 | Approval evidence | Approve and reject `wf()` commits carrying an `Approver:` line and a non-blank `Reason:` block, as a count over all approve and reject commits. | window | floor (100%) | 100 % (53/53) | 99.53 % (210/211) | 100 % (769/769) | 100 % (83/83) |
| G07 | Unknown identities | Commits whose author or committer is not a `team.members` entry of `dna.yaml` at the measurement point, or uses an RFC 2606 reserved domain. | window | floor (0) | not measurable: no team.members at the measurement point (no .wingfoil/dna.yaml there, or it declares no team.members): no identity can be judged | not measurable: no team.members at the measurement point (no .wingfoil/dna.yaml there, or it declares no team.members): no identity can be judged | 22 failing of 5908 checked | 0 failing of 769 checked |
| G08 | AI attribution conformance | Share of commits carrying an AI attribution trailer that follow the attribution rule of the git-conventions directive §7 (dl-117 Q1 (B), Q2 (c)): `Co-Authored-By:` names a `dna.yaml` `team.agents` entry and an `AI-Model:` trailer is present; plus the number of approve and reject commits carrying any AI attribution trailer (must be 0), and the distinct trailer strings as context. Commits older than the rule's ratification are counted apart and never judged. | window | floor (100% conforming, 0 approve/reject with AI attribution) | no commit judged (0): 65 commits predate the rule; 0 approve or reject commits carry an AI trailer | no commit judged (0): 847 commits predate the rule; 0 approve or reject commits carry an AI trailer | 58.3 % conforming (2373/4070); 31 commits predate the rule; 94 approve or reject commits carry an AI trailer | 99.77 % conforming (425/426); 0 commits predate the rule; 0 approve or reject commits carry an AI trailer |
| G09 | Verbs outside the grammar | Share of `wf()` commits whose verb is not in the declared grammar (`MEMORY_OPERATIONS`, src/memory/audit.ts, at the measurement point). | window | trend (down) | 16.5 % (34/206) | 0.23 % (2/876) | 0.23 % (9/3894) | 0 % (0/526) |
| G10 | Canonical arrow | Share of `wf()` transition brackets using the canonical arrow `→`. | window | floor (100%) | 100 % (153/153) | 70.62 % (411/582) | 99.96 % (2438/2439) | 100 % (360/360) |
| G11 | Back-merges | Merges of `main` into a `task/*` branch, per task branch merged in the window. | window | info | 0 per task branch (0 back-merges, 33 task branches merged) | 1.23 per task branch (92 back-merges, 75 task branches merged) | 0.27 per task branch (48 back-merges, 180 task branches merged) | 0 per task branch (0 back-merges, 15 task branches merged) |
| G12 | Code commits touching docs | Share of non-merge commits touching `paths.sources` that also touch `docs/`. | window | trend (pending) | not measurable: no relevant commit in the window (total: 0) | not measurable: no relevant commit in the window (total: 0) | 29.32 % (78/266) | 31.25 % (5/16) |
| G13 | Flow volume | Share of `wf()` commits among non-merge commits; non-merge commits per active day (a day with at least one commit, author date). | window | info | 51.63 % `wf()` (206/399); 30.69 commits per active day (13 active days) | 60.29 % `wf()` (876/1453); 111.77 commits per active day (13 active days) | 69.67 % `wf()` (3895/5591); 266.24 commits per active day (21 active days) | 72.49 % `wf()` (527/727); 72.7 commits per active day (10 active days) |
| G14 | Secrets in diffs | Findings of the project's own secret scanner (spec-007 patterns) over the window's diffs. | window | floor (0) | 0 blocking, 0 warnings | 29 blocking, 1 warning | 8 blocking, 1 warning | 12 blocking, 0 warnings |
| G15 | Stale branches and duplicate ids | Unmerged remote branches older than the release; Memory ids allocated twice across branches (the duplicate-id scan of dl-101 Action 4). | snapshot | floor (0) | 0 stale branches, 0 duplicate ids (read at run time, 31 refs) | 1 stale branch, 0 duplicate ids (read at run time, 31 refs) | 2 stale branches, 0 duplicate ids (read at run time, 25 refs) | 0 stale branches, 0 duplicate ids (read at run time, 25 refs) |
| G16 | Tool-signed flow commits | Share of `wf()` commits carrying the `WingFoil-Version:` trailer in their trailing trailer paragraph — separates tool-written from hand-written drift in G09 and G10. | window | info | 0 of 206 flow commits | 0 of 876 flow commits | 37.65 % (1466/3894 flow commits) | 81.94 % (431/526 flow commits) |
| Q01 | Build, typecheck, lint | `npm run build`, `npm run typecheck` (tsconfig.json) and `npm run lint` exit 0. | snapshot | floor (pass) | not measurable: npm ci failed (exit 1): npm error code EUSAGE | not measurable: package.json at the measurement point has no `typecheck` script | build, typecheck and lint pass | build, typecheck and lint pass |
| Q02 | Tests | `npm test`: total, failing and disabled (skipped or todo) tests. | snapshot | floor (0 failing, 0 disabled) | not measurable: npm ci failed (exit 1): npm error code EUSAGE | 2418 tests, 0 failing, 0 disabled | 8355 tests, 0 failing, 0 disabled | 8928 tests, 0 failing, 0 disabled |
| Q03 | Coverage | `npm run test:coverage` totals — statements, branches, functions, lines — every file under `paths.sources` included, `index.ts` too. | snapshot | trend (up) | not measurable: npm ci failed (exit 1): npm error code EUSAGE | statements 98.58 %, branches 94.03 %, functions 98.94 %, lines 99.41 % | statements 99.34 %, branches 97.4 %, functions 98.03 %, lines 99.71 % | statements 99.37 %, branches 97.51 %, functions 98.18 %, lines 99.73 % |
| Q04 | Critical-module branch coverage | Branch coverage of src/memory/audit.ts, src/memory/commit-message.ts and src/memory/state-machine.ts. | snapshot | floor (90%) | not measurable: npm ci failed (exit 1): npm error code EUSAGE | `src/memory/audit.ts` 64.7 % (22/34); `src/memory/commit-message.ts` 100 % (43/43); `src/memory/state-machine.ts` 93.75 % (45/48) | `src/memory/audit.ts` 100 % (65/65); `src/memory/commit-message.ts` 100 % (93/93); `src/memory/state-machine.ts` 96.2 % (76/79) | `src/memory/audit.ts` 100 % (65/65); `src/memory/commit-message.ts` 100 % (93/93); `src/memory/state-machine.ts` 96.2 % (76/79) |
| Q05 | Complexity | Functions in `paths.sources` above cyclomatic complexity 15; functions above 80 lines. | snapshot | trend (down) | not measurable: dna.yaml at the measurement point declares no paths.sources (no .wingfoil/dna.yaml there: measure at a commit that has one, with --at) | not measurable: dna.yaml at the measurement point declares no paths.sources (no .wingfoil/dna.yaml there: measure at a commit that has one, with --at) | 36 functions over the complexity limit, 19 over the length limit | 41 functions over the complexity limit, 20 over the length limit |
| Q06 | Duplication | Duplicated-line share in `paths.sources` and `paths.tests`, clones of at least 8 lines. | snapshot | trend (down) | not measurable: no code line under paths.sources or paths.tests at the measurement point | not measurable: no code line under paths.sources or paths.tests at the measurement point | 0.21 % of source lines duplicated, 6.93 % of test lines | 0.2 % of source lines duplicated, 7.14 % of test lines |
| Q07 | Cycles and layering | Import cycles in `paths.sources`; imports that bypass src/core and that no element records as a deviation. | snapshot | floor (0) | not measurable: dna.yaml at the measurement point declares no paths.sources (no .wingfoil/dna.yaml there: measure at a commit that has one, with --at) | not measurable: dna.yaml at the measurement point declares no paths.sources (no .wingfoil/dna.yaml there: measure at a commit that has one, with --at) | 2 import cycles, 6 layering bypasses (0 recorded deviations) | 2 import cycles, 3 layering bypasses (3 recorded deviations) |
| Q08 | Dependency footprint | Runtime dependencies imported nowhere in `paths.sources` (floor 0); consumer install size of the packed tarball (trend down). | snapshot | floor (0 unused runtime dependencies) | not measurable: dna.yaml at the measurement point declares no paths.sources (no .wingfoil/dna.yaml there: measure at a commit that has one, with --at) | not measurable: dna.yaml at the measurement point declares no paths.sources (no .wingfoil/dna.yaml there: measure at a commit that has one, with --at) | 0 unused runtime dependencies; install size 20330347 bytes | 0 unused runtime dependencies; install size 22190954 bytes |
| Q09 | Dangling process ids | Process-id references (task, bug, dl, adr, spec, svc ids) in `paths.sources` and `paths.tests` that resolve to no Memory element, fixtures excluded. | snapshot | floor (0) | not measurable: dna.yaml at the measurement point declares no paths.sources (no .wingfoil/dna.yaml there: measure at a commit that has one, with --at) | not measurable: dna.yaml at the measurement point declares no paths.sources (no .wingfoil/dna.yaml there: measure at a commit that has one, with --at) | 8 dangling references of 4678 | 8 dangling references of 4953 |
| Q10 | Requirements cited by tests | Share of the SARD requirements in the release's `requirements:` scope cited by at least one test under `paths.tests`. | snapshot | floor (100%) | not measurable: dna.yaml at the measurement point declares no paths.tests (no .wingfoil/dna.yaml there: measure at a commit that has one, with --at) | not measurable: dna.yaml at the measurement point declares no paths.tests (no .wingfoil/dna.yaml there: measure at a commit that has one, with --at) | 75 % (9/12) | not measurable: the requirements: scope of patch-v0.3.1 (docs/04_memory/design/dls/retro-v0.3.md) names no REQ id at the point |
| Q11 | Runnable examples | Share of docs/examples scripts executed and passing. | snapshot | floor (100%) | not measurable: npm ci failed (exit 1): npm error code EUSAGE | 100 % (5/5 scripts) | 100 % (6/6 scripts) | 100 % (6/6 scripts) |
| Q12 | CLI latency | p95 of the standard command set on the 40-element fixture (`npm run test:latency`), with the load average of the run; a loaded run is recorded as not-measurable. | snapshot | floor (< 1,000 ms) | not measurable: npm ci failed (exit 1): npm error code EUSAGE | not measurable: package.json at the measurement point has no `test:latency` script | 260 ms, the slowest total p95 of the three commands timed | 479 ms, the slowest total p95 of the three commands timed |
| Q13 | Bug flow | Bugs added and closed in the window; open bugs by severity; open bugs with no `release` at the measurement point. Verdicts on the closure ratio (closed / added) and on the unassigned count. | window+snapshot | trend (up) | not measurable: memory.yaml at the point declares no bug type | not measurable: memory.yaml at the point declares no bug type | 263 bugs added, 213 closed (80.99 %); 18 open without a release | 15 bugs added, 6 closed (40 %); 1 open without a release |
| Q14 | Open decision-logs | Decision-logs in `in-discussion` at the measurement point — count and median age in days since their `add` commit. | snapshot | trend (down) | not measurable: memory.yaml at the point declares no decision-log type | not measurable: memory.yaml at the point declares no decision-log type | 36 decision-logs in discussion; median age 9.34 days | 31 decision-logs in discussion; median age 11.35 days |
| Q15 | Document divergences | Share of bugs added in the window that are document divergences (dl-116's definition: the behaviour is correct or not at issue, and the defect is a document contradicted by the code or another document). Classified mechanically from the fix: a bug is a divergence when the non-merge commits of the task(s) whose `bug:` list names it change no executable line under `paths.sources` — every changed line there is blank or a comment. A bug with no fix task at the measurement point is counted unclassified, beside the share. | window | trend (down) | not measurable: memory.yaml at the point declares no bug type | not measurable: memory.yaml at the point declares no bug type | 41.73 % (58/139 classified bugs) | 33.33 % (1/3 classified bugs) |
| Q16 | Memory volume | Words in Memory documents, median per type; comment-line ratio in `paths.sources`. | snapshot | info | not measurable: no .wingfoil/memory.yaml at the measurement point; dna.yaml at the measurement point declares no paths.sources (no .wingfoil/dna.yaml there: measure at a commit that has one, with --at) | not measurable: no .wingfoil/memory.yaml at the measurement point; dna.yaml at the measurement point declares no paths.sources (no .wingfoil/dna.yaml there: measure at a commit that has one, with --at) | comment lines 43.82 % of non-blank lines; median words per document: adr 902.5, bug 397, change-proposal 1115, decision-log 961, plan 1064, release 431.5, release-line 1163, service 318, task 2344, tech-spec 4413 | comment lines 43.39 % of non-blank lines; median words per document: adr 902.5, bug 394.5, change-proposal 1115, decision-log 918, plan 1233.5, release 483, release-line 1163, service 318, task 2437, tech-spec 4413 |
| Q18 | Fix share | Share of the release's tasks (`release:` equal to the release) whose `kind` is `fix` (dl-133 Q1 (b)); v0.1 and v0.2 are backfilled by the heuristic name-or-`bug:`. | window | trend (down) | not measurable: memory.yaml at the point declares no task type | not measurable: memory.yaml at the point declares no task type | 38.41 % (63/164 tasks) | 26.67 % (4/15 tasks) |
| Q19 | Tasks added after commit-backlog | Tasks of the release added after its `commit-backlog` commit, split fix / feature, with the fix share. | window | trend (down) | not measurable: memory.yaml at the point declares no task type | not measurable: memory.yaml at the point declares no task type | 43 tasks added after commit-backlog (23 fix, 20 feature); fix share 53.49 % | 1 tasks added after commit-backlog (1 fix, 0 feature); fix share 100 % |
| Q20 | Bug net flow | Bugs moved to a terminal state (`closed` or `deprecated`) in the window minus bugs added in the window. | window | floor (>= 0) | not measurable: memory.yaml at the point declares no bug type | not measurable: memory.yaml at the point declares no bug type | -50 (213 closed or deprecated of 263 added) | -9 (6 closed or deprecated of 15 added) |
| P01 | Well-formed flow commits | `wf(...)` commits whose subject and body are well-formed per the commit grammar: a declared verb, the `[from → to]` bracket, `Approver:` line and non-blank `Reason:` block wherever the verb requires them. | window | floor (0 failing) | 61 failing of 206 checked | 297 failing of 876 checked | 104 failing of 3894 checked, 0 unchecked | 0 failing of 526 checked, 0 unchecked |
| P02 | Legal transitions | Status changes in the window that are not a legal transition of their type's state machine in `memory.yaml` (REQ-STATE-01). | window | floor (0 failing) | 0 failing of 399 checked, 206 unchecked | 15 failing of 1453 checked, 876 unchecked | 0 failing of 5591 checked, 0 unchecked | 0 failing of 727 checked, 0 unchecked |
| P03 | Produces present | Phases recorded as complete in the window (workflow deduction, spec-017) whose `produces:` artifacts are absent at the measurement point. | window | floor (0 failing) | 0 failing of 0 checked | 0 failing of 0 checked | 10 failing of 50 checked | 3 failing of 33 checked |
| P04 | Traceability chain | Broken links of the chain feature → user story → BDD scenario → REQ → task, for the elements touched in the window. | window | floor (0 failing) | 0 failing of 0 checked | 0 failing of 0 checked | 13 failing of 2032 checked | 8 failing of 1126 checked |
| P05 | Roles and separation of duties | Phases run in the window by an actor that does not hold the phase's declared role, or by the same actor where the workflow requires distinct ones (`distinct_from`, dl-134), read from the run log (`paths.runs`) and the commits. | window | floor (0 failing) | 0 failing of 53 checked, 53 unchecked | 137 failing of 211 checked, 216 unchecked | 1 failing of 1298 checked, 59 unchecked | 0 failing of 293 checked, 0 unchecked |
| P07 | Byte-identical recomputation | Computing P01–P06 twice on the same commit range and configuration yields byte-identical results. | window | floor (pass) | pass: 2 runs, byte-identical | pass: 2 runs, byte-identical | pass: 2 runs, byte-identical | pass: 2 runs, byte-identical |
| E01 | GitHub stars | Stargazers of the repository (`gh api repos/{owner}/{repo}` `stargazers_count`). | snapshot | info | not measurable: offline run (--offline): the external snapshot was not read | not measurable: offline run (--offline): the external snapshot was not read | 0 | 0 |
| E02 | GitHub forks | Forks of the repository (`forks_count`). | snapshot | info | not measurable: offline run (--offline): the external snapshot was not read | not measurable: offline run (--offline): the external snapshot was not read | 0 | 0 |
| E03 | GitHub watchers | Watchers of the repository (`subscribers_count`). | snapshot | info | not measurable: offline run (--offline): the external snapshot was not read | not measurable: offline run (--offline): the external snapshot was not read | 0 | 0 |
| E04 | 14-day traffic | Views and clones over the last 14 days, total and unique (`gh api repos/{owner}/{repo}/traffic/views` and `/traffic/clones`). | snapshot | info | not measurable: offline run (--offline): the external snapshot was not read | not measurable: offline run (--offline): the external snapshot was not read | views 20 (5 unique), clones 739 (172 unique) | views 21 (4 unique), clones 541 (143 unique) |
| E05 | npm downloads | Downloads of the `wingfoil` package over the last week and month (`https://api.npmjs.org/downloads/point/last-week/wingfoil`, `last-month`). | snapshot | info | not measurable: offline run (--offline): the external snapshot was not read | not measurable: offline run (--offline): the external snapshot was not read | 193 last week, 775 last month | 404 last week, 1179 last month |

## What the figures say

- **Commit form holds, with one gap at the start.** G01 is 94.99 % at v0.1 because the window starts at the first
  commit, before the conventional form was adopted; it is 100 % at v0.2, v0.3 and v0.3.1.
- **Approval evidence.** G06 holds at v0.1 (53/53), v0.3 (769/769) and v0.3.1 (83/83); at v0.2 one approval of 211
  carries no evidence (210/211), and the report names that commit.
- **The canonical arrow.** G10 drops to 70.62 % at v0.2 (411/582): many transition brackets of that release were
  written by hand with an ASCII `->` instead of `→`. It is back to 99.96 % at v0.3 (2438/2439) and 100 % at v0.3.1
  (360/360).
- **AI attribution.** G08 judged no commit at v0.1 and v0.2, since 65 and 847 commits predate the rule. At v0.3 it
  judges 4070 commits and 58.3 % conform (2373/4070), and 94 approve or reject commits carry an AI trailer, which the
  floor allows none of; at v0.3.1, 99.77 % conform (425/426) and no approve or reject commit carries one.
- **Secrets in diffs.** G14 finds 29 blocking findings at v0.2, 8 at v0.3 and 12 at v0.3.1. They are not leaked
  secrets: the scanner reads diffs, and at v0.2 most are the fake keys in its own test file,
  `test/validation/secret-scan.test.ts`; the rest are in a bug report about that fixture, another test and a phase
  plan. The report's `failing` list gives the v0.3 findings by path and pattern: two `private-key-pem` findings in
  `test/core/builtin-template-secret-scan.test.ts`, a test of the scanner; four `generic-api-key-assignment` findings, in
  `src/core/builtin-integrity.ts`, `src/workflow/deduce.ts`, `test/core/stop-the-line-open.test.ts` and a task document;
  and two `dotenv-style-secret-line` findings, in `src/agent/launch.ts` and `.github/workflows/scorecard.yml`. At v0.3.1
  all twelve are `generic-api-key-assignment` findings, in two phase plans, in bug reports (`bug-402`'s own file) and in
  the v0.3 comparison. `bug-402` records that these two generic patterns flag ordinary code; the report does not classify
  the `private-key-pem` fixture or the workflow finding, so this page does not either. The report lists each finding
  with its commit and pattern.
- **Process conformance (P).** P01 counts malformed flow commits, and its causes differ by release (each commit's
  reasons are in the report's `failing` list):
  - at v0.1, 61 failing: 34 use a verb the grammar does not declare (in 27 of them an element id sits where the verb
    should be, as in `wf(task): task-024 design …`), 26 are `submit` subjects carrying a transition bracket, which `submit` must not have, and 1 approval carries an AI
    co-author trailer; none uses the ASCII arrow, which G10's full share at v0.1 agrees with;
  - at v0.2, 297 failing: 165 write the bracket with the ASCII `->`, 92 are approvals or rejections carrying an AI
    co-author trailer (21 of them also with the ASCII bracket), 57 are `submit` subjects carrying a bracket, and 4
    have another defect;
  - at v0.3, 104 failing: 94 are approvals or rejections carrying an AI co-author trailer, 9 use a verb the grammar
    does not declare, and 1 writes the bracket with the ASCII arrow;
  - at v0.3.1, none of the 526 flow commits checked fails.

  P02 finds 15 status changes at v0.2 that the commit subject does not name, such as a task's start moving its bug, and
  none at v0.3 or v0.3.1. P05 finds 137 approve, reject and finalize commits at v0.2 whose `Approver:` line names the approver but whose author is the
  placeholder identity `<probe@example.invalid>` (`Probe` in `git log`), the same one in all of them (`dl-094`); one
  such commit remains at v0.3, and none at v0.3.1. P03 and P04 checked no item at v0.1 and v0.2, so they said nothing
  then; at v0.3 they find 10 and 13 failing, and at v0.3.1 3 and 8: phases recorded as complete whose `produces:`
  artifacts are absent at the point (P03), and references of the traceability chain that do not resolve (P04). P07
  passes at all four: computing the P metrics twice gives byte-identical results.
- **Quality.** The tests pass with none disabled at v0.2 (2418 tests, Q02), v0.3 (8355) and v0.3.1 (8928); coverage is
  high (Q03: statements 98.58 %, 99.34 % and 99.37 %); all the runnable examples pass (Q11); the build, typecheck and
  lint pass at v0.3 and v0.3.1 (Q01). The critical module `src/memory/audit.ts`, below the 90 % branch floor at v0.2
  with 64.7 % (Q04), is at 100 % at v0.3 and v0.3.1.
- **Structure and traceability floors still breached.** At v0.3.1 Q07 finds 2 import cycles and 3 layering bypasses
  (6 bypasses at v0.3), and Q09 finds 8 dangling references to process ids at v0.3 and at v0.3.1, against floors of
  0. Q10, the share of requirements cited by tests, is 75 % at v0.3 (9/12) against a floor of 100 %, over a sample the
  report flags as small; v0.3.1 could not measure it.
- **Bug flow.** Q13 counts 263 bugs added and 213 closed at v0.3 (a closure ratio of 80.99 %), and 15 added and 6
  closed at v0.3.1; Q20 reports a net flow of -50 at v0.3 and -9 at v0.3.1 against a floor of 0, so more bugs were added
  than reached a terminal state in both windows.
- **Volume.** At v0.2, v0.3 and v0.3.1 more than half of the non-merge commits are `wf()` commits (G13: 60.29 %,
  69.67 % and 72.49 %): most of the history is the governance record itself.
- **Reach.** E01–E03 (stars, forks, watchers) are 0 at v0.3 and v0.3.1; E05 reads 193 npm downloads in the last week
  before v0.3 was measured and 404 before v0.3.1.

The findings of the v0.3 and v0.3.1 runs were proposed by their `release-health` phase, in the comparison files named
in *How it was measured*; none of the findings of the v0.1 and v0.2 backfill was filed as a new element from it, and the
workflow proposes them at the next run.

## Not measurable yet

Every metric that none of the four reports could measure, with each report's own reason. A metric that some reports
measured and others could not shows the reason in its [Figures](#figures) cell, as `not measurable: …`.

| id | Metric | v0.1 | v0.2 | v0.3 | v0.3.1 |
|---|---|---|---|---|---|
| Q17 | Install command | npm ci failed (exit 1): npm error code EUSAGE | offline run (--offline): npm view was not run | docs/user-guide.md states no version (a bold **X.Y.Z**) for its install command | docs/user-guide.md states no version (a bold **X.Y.Z**) for its install command |
| D01 | Determinism Index — outcome equivalence (O) | needs D01's two benchmark runs with the build just published (dl-089 §2, dl-131); no run of this script performs them | needs D01's two benchmark runs with the build just published (dl-089 §2, dl-131); no run of this script performs them | needs D01's two benchmark runs with the build just published (dl-089 §2, dl-131); no run of this script performs them | a patch release: D01 is measured on major and minor releases only (dl-089 §2) |
| P06 | Flow sequence between two runs | needs D01's two benchmark runs with the build just published (dl-089 §2, dl-131); no run of this script performs them | needs D01's two benchmark runs with the build just published (dl-089 §2, dl-131); no run of this script performs them | needs D01's two benchmark runs with the build just published (dl-089 §2, dl-131); no run of this script performs them | a patch release: P06 is measured with D01, on major and minor releases only |

The causes of the `not measurable` cells, grouped:

- **No configuration at the root (v0.1 and v0.2).** At both points the configuration was under `docs/self/`, so the
  script found no `paths.sources`, no `team.members` and no Memory types: G05, G07, G12, Q05–Q10, Q13–Q16 and
  Q18–Q20.
- **The v0.1 toolchain.** `npm ci` refused the v0.1 lockfile, and v0.2 had no `typecheck` or `test:latency` script:
  Q01, Q12, and Q17 at v0.1 (at v0.2 it waits on the offline run, below).
- **Offline runs.** The external snapshot (stars, forks, watchers, traffic, downloads) is a reading at run time; the
  offline backfill of v0.1 and v0.2 did not read it, since it would record today's values as the past's: E01–E05, and
  Q17 at v0.2. The v0.3 and v0.3.1 runs read it.
- **The install command.** Q17 reads the version in `docs/user-guide.md`'s install command, which states none, at v0.3
  and v0.3.1.
- **The requirements scope.** Q10 at v0.3.1 reads the requirements the release's scope names, and the scope of that
  patch names none.
- **The Determinism Index outcome.** D01 and P06 need two independent benchmark runs with the build just published;
  the benchmark is the `service` element `svc-020`, and no release has run it yet. At v0.3.1 a patch is not
  compared at all.

## Reproduce

From the repository root, with the dependencies installed and the build in `dist/`:

```bash
npm ci && npm run build
node scripts/release-health/measure.cjs --release v0.1 --any-node --max-workers 2 --offline
node scripts/release-health/measure.cjs --release v0.2 --any-node --max-workers 2 --offline
node scripts/release-health/measure.cjs --release v0.3
node scripts/release-health/measure.cjs --release v0.3.1
```

Each run writes `docs/08_health/release-health-<version>.json`; `git diff` against the committed reports shows what
changed. The v0.1 and v0.2 lines are the backfill's (offline, any Node); the v0.3 and v0.3.1 lines run under the Node
22.12.0 the script pins, and read the external snapshot. A history metric reads the same commits and gives the same value; a toolchain metric
depends on the Node and npm of the machine, and a run-time reading (G15, E01–E05) on the branches and the services
present when it runs.

