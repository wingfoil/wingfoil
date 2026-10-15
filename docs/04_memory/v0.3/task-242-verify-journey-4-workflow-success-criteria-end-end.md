---
id: "task-242-verify-journey-4-workflow-success-criteria-end-end"
type: task
title: "Verify Journey 4 and the workflow success criteria end to end on a fresh project and on this repository"
status: in-progress
release: "v0.3"
kind: "feature"
priority: "medium"
tags: ["v0.3", "workflow", "verification"]
ref: "spec-017"
bug: ["bug-327-no-bdd-scenario-covers-workflow-finalize-or-the-phase-record-it-writes", "bug-328-the-e2e-smoke-drives-no-workflow-start-end-finalize-or-status"]
depends_on: ["task-199-align-wingfoil-workflows-custom-v0-3-schema-commands", "task-205-rewrite-dev-loop-yaml-v1-5-red", "task-211-add-workflow-create-workflow-remove-req-sec", "task-217-add-workflow-start-workflow-end-recording-instance-plan", "task-226-add-workflow-finalize-which-records-checkpoint-or-uncarried", "task-227-link-added-element-workflow-step-memory-add-workflow", "task-235-agent-execute-next-workflow-ref-step-key-take", "task-239-serve-wingfoil-workflows-next-wingfoil-workflows-status-production"]
tmpl_version: 260703
---

## Description

A verification task: on a fresh `init` project, Morgan's Journey 4 (directives, a workflow started, a deliverable submitted, a "human needed" line, approval routed and given, `agent execute --next` launched on the step); on this repository, the nine commands against the committed configuration, including closing the hand-started `service-ingest-rel-v0.3-listings-plan` instance the way spec-017 §12 prescribes.

## Acceptance Criteria

- (characterization) A scripted run (a `docs/examples/` self-checking script, so it can join `e2e-smoke`) passes on a fresh project: `start → next → memory add --workflow → submit → status` (human-needed line) `→ approve → next → finalize → end`.
- (characterization) On this repository at the release candidate: `workflow list --all` and `workflow show` on every workflow report zero errors; `workflow status` output is recorded in Execution Notes.
- (characterization) Journey 4 steps checked by hand with the adapter of R17, each step's command and result recorded (minor-v0.3 "manually tested end-to-end").

- (red-first, `bug-327`; added 2026-10-12 at the approver's absorption of the inherited v0.3 bugs) P4.13's feature
  file gains a scenario in which a step completed only by a record is complete after `workflow finalize`, and one for
  the refusal of an off-frontier step (`spec-017` §10, "step not on the frontier"); P4.14 gains the uncarried-approval
  case only if the approver keeps it there (asked at design). The BDD acceptance run executes them.
- (characterization, `bug-328`; added 2026-10-12, same ruling) The scripted Journey 4 run above is hooked into the
  e2e smoke's fresh-project run, so the smoke starts a workflow, reads `workflow next` and `workflow status`, records a
  step with `workflow finalize`, and ends the instance with `workflow end`, each checked for its exit code and its
  `wf()` commit.

## Implementation Notes

- **Size:** S · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** minor-v0.3 Success Criteria (workflow commands functional; `workflow next` names verb/role/element; approval routing; CLI notifications; zero-error load); spec-017 §12.
- **Features:** P4.2, P4.3, P4.4, P4.5, P4.6, P4.7, P4.8, P4.9, P4.14, P4.15, X1.1.
- **Notes:** Proposal key: A22. may be folded into the v0.3 `e2e-smoke` phase if the approver prefers; listed here so the success criterion has an owner.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

- **Handover from the approver's absorption of the inherited v0.3 bugs (2026-10-12,
  `bug-ingest-rel-v0.3-w3b6-review-findings-plan`).** This task absorbs `bug-327` (no BDD scenario covers `workflow
  finalize` or the phase record it writes; `task-226`'s review F5) and `bug-328` (the e2e smoke drives no `workflow
  start`/`end`/`finalize`/`status`); the two criteria marked 2026-10-12 above are theirs. Order inside B8: `task-282`
  (Fix B) edits `scripts/e2e-smoke.cjs` first; hook this task's script after merging its branch.

## Execution Notes

### design (developer, 2026-10-15)

Branch head at design: `1e3a5c64` (main `2de79ef9` + bug syncs + task-282 merged `--no-ff`). Code build of that
head (`npm ci && npm run build`, under the slot). No `src/` change is expected: every behaviour the ACs exercise
ships; what is new is an example script, the smoke's hook, two BDD scenario sets, config/doc text.

**Inputs read.** spec-017 (`approved`) §5.1, §5.3, §7, §8, §10, §12; dl-023, dl-099, dl-104, dl-133 `ready`;
spec-016 `approved`; P4.13/P4.14 feature files; Journey 4 (`docs/01_vision/05_journeys.md:174`); minor-v0.3
Success Criteria; `docs/examples/` (lib.sh, 03, 05, README); `scripts/e2e-smoke.cjs` and its test after
task-282; the Execution Notes of task-199, 205, 211, 217, 226, 227, 235, 239 (dl-015), 243 and 282. `grep -n
"task-242\|bug-328\|journey"` over the depends_on notes and task-243's: no handover addressed to this task;
task-282 names the hook point (after `smokeAgentRun` in `runSmoke`'s per-template loop, own function) and the
shared lines (`module.exports`, `.d.cts`, `e2e-smoke.yaml` 1.7 → 1.8, WORKFLOW.md's E2E Smoke paragraph).

**Prototype (scratch, `../devloop-kit/task-242-scratch/`, dev build of `1e3a5c64`).** A fresh `init --template
Scrum` scaffolds no workflow with an action, an approval or a `memory.add` (`cat
.wingfoil/workflows/custom/*.yaml`: `sw-life-cycle`, `scrum-delivery`, three ingests, phases without actions), so
the example creates its own. The whole sequence below ran as a bash script: exit 0, `OK:` line, 9.2 s wall
(`time`, load < 2); the same with `WINGFOIL_EXAMPLE_TEMPLATE=Kanban`: exit 0. Observed, each by its output:
`workflow start deliver` → commits `wf(plan): add deliver-1-plan`, `wf(plan): submit deliver-1-plan` (id by R18:
`{workflow}-1-plan`); `memory add … --workflow deliver-1-plan` → `wf(task): add task-001-login-form` with
trailers `WingFoil-Instance: deliver-1-plan`, `WingFoil-Step: deliver.write`; `workflow status` after submit →
`human needed: approve or reject task-001-login-form — routed to Ada Lovelace <ada@example.com>
(deliver-1-plan, deliver.write@task:task-001-login-form)`; `workflow end` before completion → exit 1 `workflow
'deliver' is not complete: current step deliver.write@task:task-001-login-form`; after approve, `workflow
finalize --step deliver.write@task:task-001-login-form` → exit 1 `step '…' is not on the frontier of
deliver-1-plan`; `workflow finalize` → empty commit `workflow: finalize deliver-1-plan
deliver.retrospective@task:task-001-login-form` with `WingFoil-Phase: deliver.retrospective completed`,
`WingFoil-Instance`, `WingFoil-Element`; `workflow end` → `wf(plan): finalize deliver-1-plan [active → done]`;
`workflow status` → `no open workflows`. Note: the finalize commit is outside the `wf()` grammar by design
(spec-017 §7.9), so "its `wf()` commit" in AC 5 reads, for finalize, as that subject plus its trailer.

**The example: `docs/examples/06-workflow-approval/run.sh`** (self-checking, sources `lib.sh`; template from
`WINGFOIL_EXAMPLE_TEMPLATE`, default `Scrum`). Command sequence, exit expected, commit asserted (`git log -1
--format=%s`) and tree clean after each writer, through a new lib.sh helper `expect_head <subject>`:
1. `init --template <T>` · `dna add team.members --value "Ada Lovelace" --entry-email ada@example.com
   --entry-roles approver` (Journey 4's Morgan: the one identity is developer and approver here, said in a comment).
2. Journey steps 1–2: `directive create --name api-style`, the rule appended and committed by hand (as example
   03), `directive assign --directive api-style --role developer`.
3. `workflow create deliver --kind main --description "…"`, then its phases written by hand and committed:
   `write` (role developer; actions `memory.add(type: task)`, `memory.submit`, `memory.approve`; `approval:
   { by_role: approver }`) and `retrospective` (role developer, no evidence: a checkpoint).
4. `workflow start deliver` → 0, HEAD `wf(plan): submit deliver-1-plan`, HEAD~1 `wf(plan): add deliver-1-plan`.
5. `workflow next --format json` → 0; `next.key` `deliver.write`, `next.role` `developer`, `next.directives`
   ids include `api-style`, `next.actions[0].token` `memory.add(type: task)` (the success criterion "names verb,
   role and element"; the element appears from step 6 on).
6. `memory add --type task --title "Login form" --workflow deliver-1-plan --format json` → 0, HEAD `wf(task):
   add task-001-login-form`, trailers `WingFoil-Instance: deliver-1-plan`, `WingFoil-Step: deliver.write`.
7. `memory submit task-001-login-form` → 0, HEAD `wf(task): submit task-001-login-form`.
8. `workflow status` (console) → 0; output holds the human-needed line above (without the parenthesis).
9. `workflow end` → 1, `is not complete`, HEAD unchanged.
10. `memory approve task-001-login-form --reason "Follows api-style"` → 0, HEAD `wf(task): approve
    task-001-login-form [pending → approved]`.
11. `workflow next --format json` → 0; `next.key` `deliver.retrospective@task:task-001-login-form`,
    `next.evidence.missing` `["record"]`, `finalizable` true.
12. `workflow finalize --step deliver.write@task:task-001-login-form` → 1, `is not on the frontier of
    deliver-1-plan`, HEAD unchanged.
13. `workflow finalize` → 0, HEAD subject above, `git show --name-only --format= HEAD` empty, `WingFoil-Phase:
    deliver.retrospective completed`.
14. `workflow end` → 0, HEAD `wf(plan): finalize deliver-1-plan [active → done]`.
15. `workflow status` → 0, `no open workflows`; `assert_clean`; `done_ok "Journey 4: …"`.
Every journey command runs through `expect_exit` (so the transcript prints `$ wingfoil …` and `[exit N]`).
`agent execute --next` is not run: it needs a terminal even with `--dry-run` (probe: `error: interactive launch
needs a terminal on stdin and stdout`, exit 1, as spec-016's `--dry-run` paragraph runs every refusal); a comment
says so and AC 3 covers it by hand.

**The smoke hook (`scripts/e2e-smoke.cjs`).** `JOURNEY_SCRIPT = join(__dirname, '..', 'docs', 'examples',
'06-workflow-approval', 'run.sh')` (from the checkout, as `AGENT_FIXTURES`: task-282 handover (2) shows
`--candidate` and `publish-staging` always run from a checkout); `smokeJourney(template, argv, env, script =
JOURNEY_SCRIPT)` with `argv = [options.command, ...commandArgs]`, called in `runSmoke` after the
`smokeAgentRun` loop, per template; `runSmoke`'s other lines, `smokeAgentRun`, `agentRunSteps` and `invoke` are
not touched. It writes a `wingfoil` shim (`#!/bin/sh` + `exec` of the quoted argv + `"$@"`, mode 755) into its
own `mkdtemp` dir, runs `bash <script>` with `PATH=<shim dir>:$PATH`, `WINGFOIL=wingfoil` and
`WINGFOIL_EXAMPLE_TEMPLATE=<template>` set over the caller's env (an inherited `WINGFOIL` never applies; PATH
avoids lib.sh's word-splitting of a path with spaces), removes the dir in `finally`. One check, label
`[<T>/journey] bash docs/examples/06-workflow-approval/run.sh` (path relative to the checkout): ok iff exit 0,
the last non-empty stdout line starts `OK: `, and the transcript's `$ wingfoil` lines hold, in order, `workflow
start`, `workflow next`, `memory add … --workflow`, `memory submit`, `workflow status`, `memory approve`,
`workflow next`, `workflow finalize`, `workflow end` (`JOURNEY_COMMANDS`); passing detail `exit 0, <n> wingfoil
commands, <the OK line>` (no sha, no path: deterministic). Failing details: `exit <n>: <the last "FAIL: " line of
stderr, else its last line>`; `no "OK: " line`; `the transcript lacks: <command>`; a spawn error as `could not
run bash: <message>`. `formatReport` gains `- Journey 4: \`docs/examples/06-workflow-approval/run.sh\` in a fresh
project per template (task-242)`. Cost: +2 × ~9 s per full run.

**BDD (bug-327).** BDD files carry no version (task-217's notes). P4.13 gains, under a `# Revised 2026-10-15
(task-242, bug-327; spec-017 §7.9, §10)` comment:
- `Scenario: A step completed only by a record is complete after workflow finalize` — Given an open workflow
  whose next step is a phase with no Memory or file evidence / When "wingfoil workflow finalize" records that
  step / Then one commit with no file change, subject "workflow: finalize <instance> <step>", carries the
  phase-record trailers / And the step's phase is reported complete / And "workflow next" reports the following
  step.
- `Scenario: Error - finalize a step that is not on the frontier` — Given an open workflow whose frontier does
  not hold the step "<key>" / When "wingfoil workflow finalize --step <key>" is run / Then nothing is committed /
  And the message is "step '<key>' is not on the frontier of <instance>".
P4.14 (only if D2 (a)): `Scenario: An approval no element carries is routed, then recorded by workflow
finalize` — Given the step's actions move no element through a gate / When the step's other evidence is
satisfied / Then "workflow status" reports "human needed: finalize <step>" routed to "Morgan" / And only an
identity holding the approver role can record it, with "wingfoil workflow finalize --reason" / And the record
carries "Approver: Morgan <email> (approver)" and the reason.

**AC classification (T1) and what the qa agent pins.**

| AC | Class | Pin |
|---|---|---|
| 1 — the scripted run passes | characterization of the CLI (prototype above passes at `1e3a5c64`); **red-first** for the script itself, which does not exist | Q1, Q2 |
| 2 — this repository: list/show zero errors, status recorded | characterization (no test row: `test/core/workflow-repository-conformance.test.ts` already pins zero errors at HEAD) | measurement in the notes (below) |
| 3 — Journey 4 by hand, R17 adapter | by hand (D6): runbook, approver runs it | none |
| 4 — BDD P4.13 (+ P4.14) | **red-first** for the feature text; characterization for the behaviour each scenario names | Q4, Q5 |
| 5 — the script hooked into the smoke | **red-first** (new script code, YAML and WORKFLOW.md text; precedent 219/243/282) | Q2, Q3 |

- **Q1** (`test/cli/e2e-smoke.test.ts`, new `describe('task-242 — the Journey 4 example …')`): `JOURNEY_SCRIPT`
  is exported, equals `join(REPO_ROOT, 'docs/examples/06-workflow-approval/run.sh')`, exists. Run it once with
  `WINGFOIL="node <DIST_CLI>"` (`spawnSync('bash', [JOURNEY_SCRIPT])`): exit 0, last stdout line starts `OK: `;
  the `$ wingfoil …` lines contain, as an ordered subsequence, the nine commands of `JOURNEY_COMMANDS` (match
  `memory add` with `--workflow deliver-1-plan`), each followed by `[exit 0]`; the stdout holds `human needed:
  approve or reject task-001-login-form — routed to Ada Lovelace <ada@example.com>`; the refusals `workflow
  end` and `workflow finalize --step deliver.write@task:task-001-login-form` are followed by `[exit 1]`.
  `docs/examples/README.md` has a table row linking `06-workflow-approval/run.sh`; `docs/user-guide.md` §7 links
  `examples/06-workflow-approval`.
- **Q2** (same file): `runSmoke` on `DIST_CLI` passes (extend the existing full-run test or a new one): per
  template the label `[<T>/journey] bash docs/examples/06-workflow-approval/run.sh` is present, ok, after the
  last `[<T>/agent] ` label and before the next template's first label; its detail starts `exit 0, ` and
  contains `OK: Journey 4`. Fault injection through `test/fixtures/smoke/wingfoil-proxy.cjs` (qa adds a kind
  `noop`: exit 0 without forwarding): `SMOKE_FAULT=noop@workflow finalize` → report not ok, last check is the
  `[Scrum/journey]` one, detail contains `FAIL:` and `workflow: finalize`; `SMOKE_FAULT=exit=1@workflow start`
  → detail contains `expected exit 0, got 1`. `smokeJourney` with stub `script`s (written to a temp dir):
  exit 0 without an `OK:` line → `no "OK: " line`; exit 1 with `FAIL: x` on stderr → detail `exit 1: FAIL: x`;
  OK but no `workflow finalize` line → `the transcript lacks: workflow finalize`; a nonexistent script path →
  a failed check, never a throw; a stub printing `OK: $WINGFOIL_EXAMPLE_TEMPLATE $(wingfoil --version)` with
  `env.WINGFOIL='false'` inherited → detail contains `OK: Kanban <version>` for template `Kanban` (the shim and
  the template are the smoke's, not inherited). `formatReport` output contains the Journey 4 line verbatim.
  Declare `JOURNEY_SCRIPT`, `JOURNEY_COMMANDS` and `smokeJourney` in `scripts/e2e-smoke.d.cts`.
- **Q3** (same file): `e2e-smoke.yaml` `version` ≥ 1.8 with a history entry naming task-242 (bug-314 style);
  `drive-cli`'s description names `docs/examples/06-workflow-approval/run.sh` and `workflow finalize`; its
  actions include `cli.run` tokens for `workflow create`, `workflow start <name>`, `workflow next`, `workflow
  status`, `workflow finalize`, `workflow end` and `memory add ... --workflow <ref>`; its three post checks
  unchanged (the existing test keeps that). WORKFLOW.md's E2E Smoke paragraph names `workflow finalize` and the
  example path.
- **Q4** (new `test/core/workflow-finalize-bdd.test.ts`, leading comment citing
  `docs/02_requirements/02_bdd/features/p4-workflow/P4.13-state-deduction.feature` sc. 4–5 and, if D2 (a),
  `P4.14-approval-routing.feature` sc. 4): the feature files contain the scenario titles above and the line
  `And the message is "step '<key>' is not on the frontier of <instance>"` (red).
- **Q5** (same file, characterization, in-process through `CORE_MODULES` `workflowStart`/`workflowNext`/
  `workflowStatus`/`workflowFinalize`, fixture with `makeTempGitRepo`/`writeFixtureFile`/`commitAll` from
  `test/storage/helpers/git-fixture`, as `test/core/workflow-finalize.test.ts` does): sc. 4 — before, the next
  step's `evidence` is `{ missing: ['record'], finalizable: true }`; after `workflowFinalize`, `HEAD~1` = before,
  `git show --name-only --format= HEAD` empty, subject `workflow: finalize <instance> <key>`, trailer
  `WingFoil-Phase` `<wf>.<phase> completed`, the phase `complete` in `workflowStatus`, `next` the following step
  (or `complete: true`). sc. 5 — `--step` off the frontier: exit 1 (`exitCodeForResult`), code `CONFLICT`, the
  exact message, HEAD unchanged (`snapshotPersistence`/`assertPersistenceUnchanged`). P4.14 sc. 4 (if D2 (a)) —
  an approval phase carrying no element: `pendingApprovals[0].awaiting.recordNeeded` true, routed to Morgan,
  `renderStatusConsole` holds `human needed: finalize <key> — routed to Morgan <…>`; a non-approver identity gets
  `memory approve`'s refusal; Morgan with `--reason` writes `Approver: Morgan <…> (approver)` and `Reason: …`.
  These overlap task-225 AC 5 / task-226 AC 1–3 on purpose: here they are the scenarios' bindings.
No new `src/` branch, so no in-process coverage row beyond Q5.

**AC 2 — commands (code build, `npm run build`):** `node dist/cli.js workflow list --all --format json` (exit,
`diagnostics` by severity and code); for each listed name `node dist/cli.js workflow show <name> --format json`
(exit, errors); `node dist/cli.js workflow status` (console, recorded) and `--format json` (counts). Preview at
`1e3a5c64`: list exit 0, 27 workflows, 0 errors, 93 warnings (87 `W_WORKFLOW_UNBOUND_TOKEN`, 6
`W_MEMORY_UNREADABLE`: the six frontmatter-less pre-dl-019 plans under `docs/05_plans/rl-v1/`, known in
bug-315); `show` on each of the 27: exit 0, 0 errors; `status` exit 0 (1.5 s): 9 open instances, all
hand-started and stuck at `capture` with no element (8 `decision-log-ingest-rel-v0.3-*-plan` — agents-md,
benchmark-cost-finding, consumer-feedback-loop, docs-showcase, file-format-key, gate-concurrency,
market-decisions, parallel-release-lines — and `service-ingest-rel-v0.3-listings-plan`), 52 ungated elements.
Per D4 the recorded run is the integrated gate head; the release-candidate re-run is a handover to e2e-smoke.

**AC 3 — runbook outline (D6; written in full in session 3, each block probed on the dev build except the
launch).** Blocks, each a paste into a terminal with the approver's identity: (0) prerequisites — `claude
--version`, the gate head's build (`npm run build`), `WF="node $PWD/dist/cli.js"`, a scratch dir outside the
repo, a `script`/`tee` transcript; (1) fresh `init --template Scrum`, approver + `team.agents` entry (`dna add
team.agents --value Claude --entry-email … --entry-executes_as developer --entry-adapter claude-code`); Journey
step 1: an ADR added/submitted/approved, `directive create` + rule committed; (2) step 2: `directive assign`,
`directives list --role developer`; (3) the `deliver` workflow (as the example), `workflow start`, `workflow
next`; (4) step 3: `memory add --workflow`, `agent execute --next` (Claude Code launched on
`deliver.write@task:…`: the approver asks it to fill the task following its directives, then quits), `agent
show <run>`, `agent list --past`; (5) step 4: `memory submit`, `workflow status` (the human-needed line); (6)
step 5: `memory approve --reason`, `memory history`; (7) step 6: the directive edited and committed, a
decision-log added; `workflow finalize`, `workflow end`, `workflow status`. The approver records per block:
the command, exit code, one-line result (the commit subject or the line asserted), plus date, `claude
--version`, `wingfoil --version` stamp and a verdict; the coordinator copies it into these notes.

**Files (expected).** New: `docs/examples/06-workflow-approval/run.sh`, `test/core/workflow-finalize-bdd.test.ts`
(qa). Changed: `docs/examples/lib.sh` (`expect_head`), `docs/examples/README.md` (row; "All five" → every
example; the row says it needs the v0.3 workflow commands), `docs/user-guide.md` §7 ("Full script:" line),
`scripts/e2e-smoke.cjs` + `.d.cts`, `test/cli/e2e-smoke.test.ts` and `test/fixtures/smoke/wingfoil-proxy.cjs`
(qa), the two feature files, `.wingfoil/workflows/custom/e2e-smoke.yaml` **1.7 → 1.8**, `.wingfoil/WORKFLOW.md`
(E2E Smoke paragraph and the drive-cli node). Not touched: `src/`, `docs/site.yaml` and `llms.txt` (the site
copies `docs/examples/` recursively, `docs/site.yaml:32`, and `llms.txt:10` links only the examples README),
`docs/cli-reference.md` (no command change). Pending amendments expected: none beyond the two bugs'
`### Retrospective` if there is more to say than "None.".

**Decisions for the approver.**
- D1 — the journey per template (a, recommended: the smoke's unit is the template; +~9 s each) or Scrum only (b).
- D2 — P4.14's uncarried-approval scenario: (a, recommended) keep it in P4.14 as sc. 4, since it is a routing case
  ("who is asked": `human needed: finalize …` routed by role) and the record's authority is REQ-SEC-03's; (b)
  drop it (it stays pinned by task-225 AC 5 / task-226 AC 3 without a scenario).
- D3 — the eight hand-started `decision-log-ingest` instances AC 2's status shows (spec-017 §12 names only the
  service-ingest one): (a, recommended) leave them open — their decision-logs are `in-discussion`, so their
  approve phase is genuinely pending — and record them; they close by hand (`wf(plan): finalize`) with their
  ratification, as D4 handles `service-ingest-rel-v0.3-listings-plan`; (b) close them in this task. The stale
  §12 instance list is bug-315's class (v0.4): a note there, not an amendment here.
- D4 — the example's name `06-workflow-approval` (recommended) or another.

**Risks.** The smoke's full run grows ~18 s (the jest full-run test and CI's `e2e-smoke` job). The smoke now
needs `bash` (CI and staging run on Ubuntu). task-246 touches no file here. If 282's 1.7 is re-bumped at the
gate, 1.8 here follows it.

### red (qa, 2026-10-15)

Red commit: `8ebe99cd` (T4 is measured from it). Files: `test/cli/e2e-smoke.test.ts` (new `describe('task-242 —
the Journey 4 example …')` + the per-template journey assertions added to the existing full-run test),
`test/core/workflow-finalize-bdd.test.ts` (new), `test/fixtures/smoke/wingfoil-proxy.cjs` (fault kind `noop`: exit 0,
no forwarding), `scripts/e2e-smoke.d.cts` (`JOURNEY_SCRIPT`, `JOURNEY_COMMANDS`, `smokeJourney(template, argv, env,
script?): SmokeCheck`, one check, never throws).

**Per AC.**
- AC 1 (red-first for the script) — Q1: `JOURNEY_SCRIPT` = `<checkout>/docs/examples/06-workflow-approval/run.sh`
  and exists; `bash` of it with `WINGFOIL="node <dist/cli.js>"`: exit 0, last non-empty stdout line `OK: …`; the
  `$ wingfoil` entries hold, in order, the nine commands each with `[exit 0]` (`memory add` with `--workflow
  deliver-1-plan`; refusals skipped); the human-needed line verbatim; `workflow end` and `workflow finalize --step
  deliver.write@task:task-001-login-form` each with `[exit 1]`; a README table row linking
  `06-workflow-approval/run.sh`; user-guide §7 links `examples/06-workflow-approval`.
- AC 5 (red-first) — Q2: `JOURNEY_COMMANDS` (nine, journey order, the third holds `--workflow`); `smokeJourney` on
  stub scripts: `no "OK: " line`; detail exactly `exit 1: FAIL: x` (the last of two FAIL lines); `the transcript
  lacks: workflow finalize`; a missing script is a failed check, no throw; with `WINGFOIL=false` and
  `WINGFOIL_EXAMPLE_TEMPLATE=Scrum` inherited and template `Kanban`, ok, label `[Kanban/journey] bash
  docs/examples/06-workflow-approval/run.sh`, detail `^exit 0, 9 wingfoil commands, OK: Kanban <version>` (both
  `$WINGFOIL` and the PATH shim answer `--version`); the `formatReport` Journey 4 line verbatim. Full runs: per
  template the `[<T>/journey]` check after the last `[<T>/agent]` label and before the next template, ok, detail
  `exit 0, …` holding `OK: Journey 4`; `noop@workflow finalize` → last check `[Scrum/journey]`, not ok, `FAIL:` and
  `/workflow:? finalize/`; `exit=1@workflow start` → `expected exit 0, got 1`. Q3: `e2e-smoke.yaml` ≥ 1.8 with
  `/1\.8 [^;]*task-242/`; drive-cli description names `docs/examples/06-workflow-approval/run.sh` and `workflow
  finalize`; actions start `cli.run(command: "<t>` for `workflow create`, `workflow start <name>`, `workflow next`,
  `workflow status`, `workflow finalize`, `workflow end`, `memory add ... --workflow <ref>`; three post checks; the
  WORKFLOW.md E2E Smoke section names `workflow finalize` and `docs/examples/06-workflow-approval/run.sh`.
- AC 4 (red-first text, characterization behaviour) — Q4: P4.13's titles become the three existing + `A step
  completed only by a record is complete after workflow finalize`, `Error - finalize a step that is not on the
  frontier`, and the line `    And the message is "step '<key>' is not on the frontier of <instance>"`; P4.14's
  fourth (and last) title `An approval no element carries is routed, then recorded by workflow finalize` (D2 (a)).
  Q5, in-process on a fixture (`workflowStart` of element-less `checklist` / `signoff`): sc. 4 — `next` evidence
  `{ missing: ['record'], finalizable: true }`, after finalize `HEAD~1` = before, no file, subject `workflow:
  finalize <instance> checklist.tick`, `WingFoil-Phase`/`WingFoil-Instance` trailers, phase `tick` `complete` in
  status, next `checklist.tock`; sc. 5 — `--step checklist.tock`: `CONFLICT`, exact message, exit 1, persistence
  unchanged; P4.14 sc. 4 — one pending approval on `signoff.review`, `recordNeeded: true`, no element, routed to
  Morgan, console `human needed: finalize signoff.review — routed to Morgan <morgan@example.invalid>`; the
  non-approver refused (`VALIDATION`, `/^user not authorized to approve/`, exit 1, nothing written); Morgan's
  record carries `Approver: Morgan <morgan@example.invalid> (approver)` / `Reason: Signed off.`, next
  `signoff.close`.
- AC 2, AC 3: no red row (design table).

**Runs (targeted, `--maxWorkers=2`).**
- `npx jest test/core/workflow-finalize-bdd.test.ts --maxWorkers=2` → 4 failed, 3 passed. The three Q5 bindings
  pass on first run (characterization); the four Q4 rows fail on the missing text (`Expected substring: "  Scenario:
  A step completed only by a record …"`; titles array lacks the two; P4.14 `titles[3]` `undefined`).
- `npx jest test/cli/e2e-smoke.test.ts --maxWorkers=2 -t 'task-242 — the Journey 4 example(?!.*\[Scrum\] a workflow
  (finalize|start))'` → 16 failed, 54 skipped. First assertion per row: `JOURNEY_SCRIPT` `undefined`; the example
  exits `127` (no file), empty transcript, no human-needed line, no refusals; README has no row; `JOURNEY_COMMANDS`
  `undefined`; `typeof smokeJourney` `"undefined"` (5 stub rows); report lacks the Journey 4 line; yaml version
  `1.7`; drive-cli description lacks the example path; WORKFLOW.md section lacks `workflow finalize`.
- **Not run (full smoke runs, per the batch rule):** the extended full-run test (`passes against the compiled CLI
  …`) and the two proxy rows (`noop@workflow finalize`, `exit=1@workflow start`). Expected red today: no
  `[<T>/journey]` label (`indexOf` −1, so `toBeGreaterThan` fails) and `report.ok` true for both faults.

**Deviation from the design, for the reviewer.** The `noop@workflow finalize` row pins `/workflow:? finalize/`, not
`workflow: finalize`: the proxy matches argv by prefix, and the design's step 12 (`workflow finalize --step …`,
exit 1 expected) runs before step 13, so a correct script fails first at step 12 with `expected exit 1, got 0:
wingfoil workflow finalize --step …`.
