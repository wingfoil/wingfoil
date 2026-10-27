# e2e-smoke report

Written by `scripts/e2e-smoke.cjs --report` — the executable form of `.wingfoil/workflows/custom/e2e-smoke.yaml`
(`dl-023`, `dl-099` §3). The gate hard-rejects: a FAIL blocks `release-submit`.

- Command: `wingfoil (the packed candidate, installed into a throwaway prefix)`
- Expected version: `0.3.0`
- Expected commit: `d3826aab5a392429f7c6f8423752277e380cb098`
- Templates: Scrum, Kanban
- Agent run: `agent execute` through the fake adapter `custom/fake` in a fresh project per template (spec-016 §2.7)
- Journey 4: `docs/examples/06-workflow-approval/run.sh` in a fresh project per template (task-242)

Result: **PASS** (82/82 checks ok)

| # | Result | Check | Detail |
|---|--------|-------|--------|
| 1 | ok | wingfoil --help | exit 0 |
| 2 | ok | wingfoil --version = 0.3.0 (d3826aab5a392429f7c6f8423752277e380cb098) | match |
| 3 | ok | [Scrum] wingfoil init --template Scrum | exit 0, tree clean |
| 4 | ok | [Scrum] wingfoil dna show --format json | exit 0, tree clean |
| 5 | ok | [Scrum] wingfoil dna show --no-such-option | exit 2, tree clean |
| 6 | ok | [Scrum] wingfoil memory approve --format json | exit 2, tree clean |
| 7 | ok | [Scrum] wingfoil dna set project.name --value WingFoil smoke | exit 0, tree clean |
| 8 | ok | [Scrum] wingfoil memory add --type task --title Approved task --format json | exit 0, tree clean |
| 9 | ok | [Scrum] wingfoil memory submit task-001-approved-task --format json | exit 0, tree clean |
| 10 | ok | [Scrum] wingfoil memory approve task-001-approved-task --reason smoke: no approver bound --format json | exit 1, tree clean |
| 11 | ok | [Scrum] wingfoil dna add team.members --value WingFoil Smoke --entry-email smoke@wingfoil.invalid --entry-roles approver | exit 0, tree clean |
| 12 | ok | [Scrum] wingfoil memory approve task-001-approved-task --reason smoke: approve --format json | exit 0, tree clean |
| 13 | ok | [Scrum] wingfoil memory submit task-001-approved-task --format json | exit 1, tree clean |
| 14 | ok | [Scrum] wingfoil memory add --type task --title Rejected task --format json | exit 0, tree clean |
| 15 | ok | [Scrum] wingfoil memory submit task-002-rejected-task --format json | exit 0, tree clean |
| 16 | ok | [Scrum] wingfoil memory reject task-002-rejected-task --reason smoke: reject --format json | exit 0, tree clean |
| 17 | ok | [Scrum] wingfoil memory add --type task --title Deprecated task --format json | exit 0, tree clean |
| 18 | ok | [Scrum] wingfoil memory deprecate task-003-deprecated-task --reason smoke: deprecate --format json | exit 0, tree clean |
| 19 | ok | [Scrum] wingfoil dna show --format json | exit 0, tree clean |
| 20 | ok | [Scrum] wingfoil memory search task-001-approved-task --status approved --format json | exit 0, tree clean |
| 21 | ok | [Scrum] wingfoil memory history task-001-approved-task --format json | exit 0, tree clean |
| 22 | ok | [Scrum] wingfoil memory search task-002-rejected-task --status draft --format json | exit 0, tree clean |
| 23 | ok | [Scrum] wingfoil memory history task-002-rejected-task --format json | exit 0, tree clean |
| 24 | ok | [Scrum] wingfoil memory search task-003-deprecated-task --status deprecated --format json | exit 0, tree clean |
| 25 | ok | [Scrum] wingfoil memory history task-003-deprecated-task --format json | exit 0, tree clean |
| 26 | ok | [Scrum] wingfoil directives list --format json | exit 0, tree clean |
| 27 | ok | [Scrum] wingfoil paths config --list --format json | exit 0, tree clean |
| 28 | ok | [Scrum] wingfoil workflow list --format json | exit 0, tree clean |
| 29 | ok | [Scrum] wingfoil workflow start sw-life-cycle --format json | exit 0, tree clean |
| 30 | ok | [Scrum] wingfoil workflow finalize sw-life-cycle-1-plan --format json | exit 0, tree clean |
| 31 | ok | [Scrum] wingfoil workflow finalize sw-life-cycle-1-plan --format json | exit 0, tree clean |
| 32 | ok | [Scrum] wingfoil workflow adopt sw-life-cycle-1-plan --plan --format json | exit 0, tree clean |
| 33 | ok | [Scrum/agent] wingfoil init --template Scrum | exit 0, tree clean |
| 34 | ok | [Scrum/agent] wingfoil memory add --type task --title Agent run --format json | exit 0, tree clean |
| 35 | ok | [Scrum/agent] commit .wingfoil/agents/custom/fake.yaml, test/fixtures/agents/fake-agent.cjs | commit ok, tree clean |
| 36 | ok | [Scrum/agent] wingfoil dna add team.agents --value Fake Agent --entry-email fake-agent@example.com --entry-executes_as developer --entry-adapter fake | exit 0, tree clean |
| 37 | ok | [Scrum/agent] wingfoil agent execute --element task:task-001-agent-run --role developer | exit 0, tree clean |
| 38 | ok | [Scrum/agent] one agent: record commit for task-001-agent-run/adhoc/1 | the only one, changing only docs/runs/task-001-agent-run.jsonl |
| 39 | ok | [Scrum/agent] wingfoil agent show task-001-agent-run/adhoc/1 --format json | exit 0, tree clean |
| 40 | ok | [Scrum/agent] wingfoil agent list --past --format json | exit 0, tree clean |
| 41 | ok | [Scrum/agent] the fake agent read the session Resource for task-001-agent-run/adhoc/1 | read wingfoil://session/developer/task:task-001-agent-run/<the run's state_ref> from the wingfoil server |
| 42 | ok | [Scrum/journey] bash docs/examples/06-workflow-approval/run.sh | exit 0, 17 wingfoil commands, OK: Journey 4: a rule, a workflow, a submitted deliverable, a routed approval, a checkpoint, the workflow ended |
| 43 | ok | [Kanban] wingfoil init --template Kanban | exit 0, tree clean |
| 44 | ok | [Kanban] wingfoil dna show --format json | exit 0, tree clean |
| 45 | ok | [Kanban] wingfoil dna show --no-such-option | exit 2, tree clean |
| 46 | ok | [Kanban] wingfoil memory approve --format json | exit 2, tree clean |
| 47 | ok | [Kanban] wingfoil dna set project.name --value WingFoil smoke | exit 0, tree clean |
| 48 | ok | [Kanban] wingfoil memory add --type task --title Approved task --format json | exit 0, tree clean |
| 49 | ok | [Kanban] wingfoil memory submit task-001-approved-task --format json | exit 0, tree clean |
| 50 | ok | [Kanban] wingfoil memory approve task-001-approved-task --reason smoke: no approver bound --format json | exit 1, tree clean |
| 51 | ok | [Kanban] wingfoil dna add team.members --value WingFoil Smoke --entry-email smoke@wingfoil.invalid --entry-roles approver | exit 0, tree clean |
| 52 | ok | [Kanban] wingfoil memory approve task-001-approved-task --reason smoke: approve --format json | exit 0, tree clean |
| 53 | ok | [Kanban] wingfoil memory submit task-001-approved-task --format json | exit 1, tree clean |
| 54 | ok | [Kanban] wingfoil memory add --type task --title Rejected task --format json | exit 0, tree clean |
| 55 | ok | [Kanban] wingfoil memory submit task-002-rejected-task --format json | exit 0, tree clean |
| 56 | ok | [Kanban] wingfoil memory reject task-002-rejected-task --reason smoke: reject --format json | exit 0, tree clean |
| 57 | ok | [Kanban] wingfoil memory add --type task --title Deprecated task --format json | exit 0, tree clean |
| 58 | ok | [Kanban] wingfoil memory deprecate task-003-deprecated-task --reason smoke: deprecate --format json | exit 0, tree clean |
| 59 | ok | [Kanban] wingfoil dna show --format json | exit 0, tree clean |
| 60 | ok | [Kanban] wingfoil memory search task-001-approved-task --status approved --format json | exit 0, tree clean |
| 61 | ok | [Kanban] wingfoil memory history task-001-approved-task --format json | exit 0, tree clean |
| 62 | ok | [Kanban] wingfoil memory search task-002-rejected-task --status draft --format json | exit 0, tree clean |
| 63 | ok | [Kanban] wingfoil memory history task-002-rejected-task --format json | exit 0, tree clean |
| 64 | ok | [Kanban] wingfoil memory search task-003-deprecated-task --status deprecated --format json | exit 0, tree clean |
| 65 | ok | [Kanban] wingfoil memory history task-003-deprecated-task --format json | exit 0, tree clean |
| 66 | ok | [Kanban] wingfoil directives list --format json | exit 0, tree clean |
| 67 | ok | [Kanban] wingfoil paths config --list --format json | exit 0, tree clean |
| 68 | ok | [Kanban] wingfoil workflow list --format json | exit 0, tree clean |
| 69 | ok | [Kanban] wingfoil workflow start sw-life-cycle --format json | exit 0, tree clean |
| 70 | ok | [Kanban] wingfoil workflow finalize sw-life-cycle-1-plan --format json | exit 0, tree clean |
| 71 | ok | [Kanban] wingfoil workflow finalize sw-life-cycle-1-plan --format json | exit 0, tree clean |
| 72 | ok | [Kanban] wingfoil workflow adopt sw-life-cycle-1-plan --plan --format json | exit 0, tree clean |
| 73 | ok | [Kanban/agent] wingfoil init --template Kanban | exit 0, tree clean |
| 74 | ok | [Kanban/agent] wingfoil memory add --type task --title Agent run --format json | exit 0, tree clean |
| 75 | ok | [Kanban/agent] commit .wingfoil/agents/custom/fake.yaml, test/fixtures/agents/fake-agent.cjs | commit ok, tree clean |
| 76 | ok | [Kanban/agent] wingfoil dna add team.agents --value Fake Agent --entry-email fake-agent@example.com --entry-executes_as developer --entry-adapter fake | exit 0, tree clean |
| 77 | ok | [Kanban/agent] wingfoil agent execute --element task:task-001-agent-run --role developer | exit 0, tree clean |
| 78 | ok | [Kanban/agent] one agent: record commit for task-001-agent-run/adhoc/1 | the only one, changing only docs/runs/task-001-agent-run.jsonl |
| 79 | ok | [Kanban/agent] wingfoil agent show task-001-agent-run/adhoc/1 --format json | exit 0, tree clean |
| 80 | ok | [Kanban/agent] wingfoil agent list --past --format json | exit 0, tree clean |
| 81 | ok | [Kanban/agent] the fake agent read the session Resource for task-001-agent-run/adhoc/1 | read wingfoil://session/developer/task:task-001-agent-run/<the run's state_ref> from the wingfoil server |
| 82 | ok | [Kanban/journey] bash docs/examples/06-workflow-approval/run.sh | exit 0, 17 wingfoil commands, OK: Journey 4: a rule, a workflow, a submitted deliverable, a routed approval, a checkpoint, the workflow ended |

## Repository checks on the candidate (workflow reads)

*Hand-written by the qa agent of `e2e-smoke-rel-v0.3.1-plan` (approver ruling D2, 2026-10-27), not by
`scripts/e2e-smoke.cjs`.* Run with the code build (`node dist/cli.js --version` → `0.3.0 (d3826aab…)`; the workflow
reads run on the code build while the pinned 0.3.0 cannot read this repository's workflows, `bug-414`) on the candidate
`d3826aab`, before and after the gate run.

| Command | Exit | Result |
|---|---|---|
| `node dist/cli.js workflow list --all --format json` (clean tree, before the gate) | 0 | 27 workflows; 65 diagnostics, **0 errors**: `W_WORKFLOW_UNBOUND_TOKEN` 65 (warnings) |
| `node dist/cli.js workflow show <name> --format json`, each of the 27 (after the gate) | 0 (27/27) | **0 errors** each; the 65 repository-wide warnings plus one `W_UNCOMMITTED_INPUTS` naming this report, untracked until its commit |
| `node dist/cli.js workflow status` | 0 | open workflows 3; pending approvals 1; ungated elements 33 |
| `node dist/cli.js workflow status --format json` | 0 | `open` 3, `pendingApprovals` 1, `ungated` 33, `diagnostics` 65 |

Other checks, from the S1–S5 run on `05d34a98` (the candidate's tree but for the plan's Execution Notes,
`git diff --name-only 05d34a98 d3826aab` → the plan; log `gate-e2e031.log` of the phase): the smoke on the code build
82 ok / 0 not ok; examples `docs/examples/01`–`06` exit 0 each; `npm run check:mcp` exit 0 (pinned 0.3.0 with the three
declared `bug-414` read failures, the build under development with none); `npx jest --coverage` 506 suites / 8928
tests, coverage 99.37 / 97.51 / 98.18 / 99.73; `test/docs` 29 suites / 321 tests; typecheck, lint, `docs:api`,
governance, `check:audit`, `llms.txt` exit 0; `npm pack --dry-run` 552 files. The candidate was re-cut once in this
phase: `check:audit` failed on `499d7fb2`'s tree, fixed by `task-304` (`bug-415`, merged into `release/0.3` `41556c3c`)
before the gate ran.
