---
id: "dl-099-release-gates-run-on-every-candidate-on-a-fresh-project"
type: decision-log
title: "Once-per-release gates found real defects only when they ran; the staging rehearsal and e2e-smoke become declared checks on every release candidate, driving a freshly initialised project through every verb"
status: ready
context: "retrospective"
release: "v0.3"
contributor: ""
credit: ""
tmpl_version: 260703
---

## Context

Filed by the v0.2 retrospective (`retro-v0.2`), from its finding on where v0.2's gates sit and
what they could see. The approver ruled on 2026-09-28 that the staging rehearsal and e2e-smoke run
on every release candidate, and that gates exercise a freshly initialised project, not only
WingFoil's own configuration. This decision is taken together with the three open e2e-smoke bugs,
`bug-132`, `bug-133` and `bug-134`.

### What each gate found

The v0.2 retrospective classified the provenance of all 129 bugs filed in the v0.2 era, at
`a20b346c`, from each bug's own text. The per-task `dev-loop` review gate found 47. The gates that
run once per release found fewer, but every one of them that ran found something real:

- the first real staging run, `task-077-first-real-staging-run`: 6 bugs, 3 of them `high`
  (`bug-056`, `bug-057`, `bug-058`, `bug-059`, `bug-060`, `bug-061`);
- the `user-docs` phase probe: 7 (`bug-074`, `bug-126` to `bug-131`);
- the `e2e-smoke` phase audit: 3, all about the smoke itself (`bug-132`, `bug-133`, `bug-134`);
- the first real `publish.yml` run: 2 (`bug-135`, `bug-136`).

Two `high` release blockers came from none of these. `bug-076` (`memory approve` commits whatever
is on disk) and `bug-077` (`memory history --follow` reports the template's commit) were found by
using the v0.2 verbs outside this repository. They could not appear here, because the verbs cannot
run against this repository's own Memory (`bug-075`).

### What the gates actually exercised

- **The staging rehearsal is declared in no workflow.**
  `git grep -liE 'staging|verdaccio' a20b346c -- docs/self/.wingfoil/workflows/custom/` prints
  nothing. The same pattern over `docs/04_memory/design/` finds 16 files, among them
  `adr-009`, `spec-015` and `dl-056`. In v0.2 it ran because people wrote it in:
  - `task-077`, owned by the task `dl-056` asked for;
  - `release-publishing-rel-v0.2-plan` *Step 6*, once for `0.2.0` and again for `0.2.1`.

  The rehearsal passed for `0.2.0`, and the first real publish then failed on `bug-135`. The
  rehearsal does not exercise `promote`: `publish.yml` skips it under `act` by design.
- **e2e-smoke does initialise fresh projects, but drives half the verbs.** `scripts/e2e-smoke.cjs`
  runs `wingfoil init --template <T>` for each entry of `SMOKE_TEMPLATES` (`Scrum`, `Kanban`), then
  the step list in `smokeSteps`. That list contains `submit` and never `approve`, `reject`,
  `deprecate` or `history`: `git show a20b346c:scripts/e2e-smoke.cjs | grep -c "'approve'"` → `0`
  (the same for `'reject'`, `'history'` and `'deprecate'`), against `1` for `'submit'`. Those are the
  verbs `bug-076` and `bug-077` lived in.
- **What it does run, it checks shallowly.** It asserts only exit 0 (`bug-132`), and it never
  re-loads what a command wrote (`bug-133`). So the stock Kanban scaffold passed `workflow list`
  while including its delivery sub-workflow by file path. That defect was later reproduced on
  `wingfoil@0.2.1` and filed as `bug-144`, with `workflow list` never resolving `include` as
  `bug-145`.
- **It ran once.** `e2e-smoke` is a single phase of `release-cycle.yaml`, before `submit`. Nothing
  re-runs it when the candidate changes.

## Decision

### 1. A release candidate is defined, and both checks run on each one

A **release candidate** is any commit proposed for a version tag. A candidate is re-cut whenever a
commit lands after the checks ran. v0.2 had two: `0.2.0`, tagged and never published (`bug-135`),
and `0.2.1`. On every candidate:

- **the staging rehearsal** (`npm run publish:staging`) runs, and its transcript is recorded;
- **e2e-smoke** runs against the candidate's packed tarball, not the working tree.

A candidate that has not passed both is not tagged.

### 2. The staging rehearsal becomes a declared phase

`release-publishing.yaml` gains a `staging-rehearsal` phase before its tag step. The phase has
role `qa`, action `npm run publish:staging`, `produces` the transcript, and a `checks.post` on its
closing line. A rehearsal that depends on someone remembering it is a plan convention, not a gate.

### 3. e2e-smoke drives a fresh project through a use scenario, not a command list

For every template `init` supports, the smoke:

- walks one element of each built-in state-machine shape through `add → submit → approve`, one
  `reject`, one `deprecate`, and `memory history` on each;
- re-loads every file a command wrote, through its own loader (`bug-133`);
- asserts the exact exit code the CLI contract (`spec-005`) specifies, including 1 and 2 (`bug-132`);
- checks the working tree is clean after every mutation, as it already does;
- declares its report under `produces:` (`bug-134`).

### 4. Earlier and more often: cadence options

The approver chooses how often the checks run *before* the candidate.

- **(a) Candidate only.** This is the minimum §1 requires.
- **(b) Also at every `dev-loop` wave boundary.** It catches a defect while the task that caused it
  is fresh, at the cost of one run per wave. The staging rehearsal took 34 s for `0.2.1`.
- **(c) On every push to `main`, in CI**, once `dl-103`'s CI exists. This is the earliest option,
  and it puts both checks where no agent can skip them.

**Recommendation: (a) now, with the smoke part of (c) as soon as `dl-103`'s CI lands.** The
rehearsal stays at (a), because it starts a local registry.

## Rationale

- v0.2's evidence is that a gate finds defects in proportion to how often, and how deeply, it runs.
  The staging and publish runs found high-severity defects in their first real execution. The two
  release blockers sat in verbs the smoke never called.
- The verbs cannot run on this repository until `bug-075` closes, and even after that its
  hand-authored configuration is not what a user gets from `init`. A freshly initialised project is
  the only fixture that matches what users receive.
- Tying the checks to the *candidate* rather than to the release closes the gap `bug-135` fell
  through: whatever lands after a check has not been checked.
- Deepening the smoke absorbs `bug-132`, `bug-133` and `bug-134` into one amended contract instead
  of three separate patches.

## Actions

1. **Ratify, choosing the cadence in §4.** Owner: approver. The choice goes in the approve commit's
   `Reason:`.
2. **Amend `.wingfoil/workflows/custom/release-publishing.yaml`** (the `staging-rehearsal`
   phase) and **`e2e-smoke.yaml`** (scenario, re-validation, exact exit codes, `produces:`), with
   version bumps. **Amend `release-cycle.yaml`** so a re-cut candidate re-enters both checks.
3. **Amend `spec-015-packaging-publishing`** where it describes the rehearsal's place in the
   release, and **`dl-023-init-cli-e2e-smoke-gate`**'s gate description by a note pointing here.
4. **Schedule `bug-132`, `bug-133` and `bug-134`** with the smoke rewrite; they close with it.
5. **Tasks are derived by v0.3 `release-planning` (`build-backlog`)**, not created here.

## Relations

- **Origin:** `retro-v0.2`, the finding on gate placement.
- **Amends, on ratification:** `e2e-smoke.yaml`, `release-publishing.yaml`, `release-cycle.yaml`;
  `spec-015` (rehearsal placement).
- **Builds on:** `dl-023-init-cli-e2e-smoke-gate` (the smoke gate and its warn-to-hard-reject
  staging); `dl-056-first-real-publishing-run` (the first rehearsal, owned by a task).
- **Absorbs:** `bug-132`, `bug-133`, `bug-134`.
- **Related:** `dl-103-governance-enforced-outside-the-agent` (the CI that hosts option (c));
  `dl-076-toolchain-divergence-unexercised-until-tag`; `bug-075`; `bug-144`, `bug-145`.
- **Traceability:** REQ-SYS-09 (distribution as an npm package), REQ-INT-04 (CLI exit-code
  contract).
- **Amended by** `dl-133-fix-task-tail` (2026-09-29, v0.3 planning): the smoke and the mechanical user-doc checks also run at every wave end.

**Note (2026-10-10, approver ruling on `task-219` D2; W3 B4 follow-ups, `bug-ingest-rel-v0.3-w3b4-review-findings-plan`).**
§1's "a candidate is re-cut whenever a commit lands after the checks ran" does not count commits that only record
evidence: a commit whose changes are all gate reports, rehearsal transcripts, Memory transitions or plans
(`docs/07_gates/`, `docs/04_memory/`, `docs/05_plans/`) does not re-cut the candidate. The version tag goes on the
commit the rehearsal transcript names (`staging-rehearsal-passed` prints it; `release-publishing.yaml` 1.4, phase
`tag`), not on the tip that records the transcript. `task-219` delivered the rehearsal phase, the transcript and its
check; the pre-check that only evidence paths changed between the candidate and the tip is
`bug-312-nothing-checks-before-tagging-that-only-evidence-paths-changed-between-the-rehearsed-candidate-and-the-branch-tip`
(`triaged`, v0.3). The Decision above is otherwise unchanged.
