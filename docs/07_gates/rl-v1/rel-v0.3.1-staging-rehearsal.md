[publish:staging] Verdaccio up on http://localhost:4873/
[publish:staging]   ok   wingfoil --help — exit 0
[publish:staging]   ok   wingfoil --version = 0.3.1 (870bd4406f3b9bba5ecde7a5f8198b80c2a98583) — match
[publish:staging]   ok   [Scrum] wingfoil init --template Scrum — exit 0, tree clean
[publish:staging]   ok   [Scrum] wingfoil dna show --format json — exit 0, tree clean
[publish:staging]   ok   [Scrum] wingfoil dna show --no-such-option — exit 2, tree clean
[publish:staging]   ok   [Scrum] wingfoil memory approve --format json — exit 2, tree clean
[publish:staging]   ok   [Scrum] wingfoil dna set project.name --value WingFoil smoke — exit 0, tree clean
[publish:staging]   ok   [Scrum] wingfoil memory add --type task --title Approved task --format json — exit 0, tree clean
[publish:staging]   ok   [Scrum] wingfoil memory submit task-001-approved-task --format json — exit 0, tree clean
[publish:staging]   ok   [Scrum] wingfoil memory approve task-001-approved-task --reason smoke: no approver bound --format json — exit 1, tree clean
[publish:staging]   ok   [Scrum] wingfoil dna add team.members --value WingFoil Smoke --entry-email smoke@wingfoil.invalid --entry-roles approver — exit 0, tree clean
[publish:staging]   ok   [Scrum] wingfoil memory approve task-001-approved-task --reason smoke: approve --format json — exit 0, tree clean
[publish:staging]   ok   [Scrum] wingfoil memory submit task-001-approved-task --format json — exit 1, tree clean
[publish:staging]   ok   [Scrum] wingfoil memory add --type task --title Rejected task --format json — exit 0, tree clean
[publish:staging]   ok   [Scrum] wingfoil memory submit task-002-rejected-task --format json — exit 0, tree clean
[publish:staging]   ok   [Scrum] wingfoil memory reject task-002-rejected-task --reason smoke: reject --format json — exit 0, tree clean
[publish:staging]   ok   [Scrum] wingfoil memory add --type task --title Deprecated task --format json — exit 0, tree clean
[publish:staging]   ok   [Scrum] wingfoil memory deprecate task-003-deprecated-task --reason smoke: deprecate --format json — exit 0, tree clean
[publish:staging]   ok   [Scrum] wingfoil dna show --format json — exit 0, tree clean
[publish:staging]   ok   [Scrum] wingfoil memory search task-001-approved-task --status approved --format json — exit 0, tree clean
[publish:staging]   ok   [Scrum] wingfoil memory history task-001-approved-task --format json — exit 0, tree clean
[publish:staging]   ok   [Scrum] wingfoil memory search task-002-rejected-task --status draft --format json — exit 0, tree clean
[publish:staging]   ok   [Scrum] wingfoil memory history task-002-rejected-task --format json — exit 0, tree clean
[publish:staging]   ok   [Scrum] wingfoil memory search task-003-deprecated-task --status deprecated --format json — exit 0, tree clean
[publish:staging]   ok   [Scrum] wingfoil memory history task-003-deprecated-task --format json — exit 0, tree clean
[publish:staging]   ok   [Scrum] wingfoil directives list --format json — exit 0, tree clean
[publish:staging]   ok   [Scrum] wingfoil paths config --list --format json — exit 0, tree clean
[publish:staging]   ok   [Scrum] wingfoil workflow list --format json — exit 0, tree clean
[publish:staging]   ok   [Scrum] wingfoil workflow start sw-life-cycle --format json — exit 0, tree clean
[publish:staging]   ok   [Scrum] wingfoil workflow finalize sw-life-cycle-1-plan --format json — exit 0, tree clean
[publish:staging]   ok   [Scrum] wingfoil workflow finalize sw-life-cycle-1-plan --format json — exit 0, tree clean
[publish:staging]   ok   [Scrum] wingfoil workflow adopt sw-life-cycle-1-plan --plan --format json — exit 0, tree clean
[publish:staging]   ok   [Scrum/agent] wingfoil init --template Scrum — exit 0, tree clean
[publish:staging]   ok   [Scrum/agent] wingfoil memory add --type task --title Agent run --format json — exit 0, tree clean
[publish:staging]   ok   [Scrum/agent] commit .wingfoil/agents/custom/fake.yaml, test/fixtures/agents/fake-agent.cjs — commit ok, tree clean
[publish:staging]   ok   [Scrum/agent] wingfoil dna add team.agents --value Fake Agent --entry-email fake-agent@example.com --entry-executes_as developer --entry-adapter fake — exit 0, tree clean
[publish:staging]   ok   [Scrum/agent] wingfoil agent execute --element task:task-001-agent-run --role developer — exit 0, tree clean
[publish:staging]   ok   [Scrum/agent] one agent: record commit for task-001-agent-run/adhoc/1 — the only one, changing only docs/runs/task-001-agent-run.jsonl
[publish:staging]   ok   [Scrum/agent] wingfoil agent show task-001-agent-run/adhoc/1 --format json — exit 0, tree clean
[publish:staging]   ok   [Scrum/agent] wingfoil agent list --past --format json — exit 0, tree clean
[publish:staging]   ok   [Scrum/agent] the fake agent read the session Resource for task-001-agent-run/adhoc/1 — read wingfoil://session/developer/task:task-001-agent-run/<the run's state_ref> from the wingfoil server
[publish:staging]   ok   [Scrum/journey] bash docs/examples/06-workflow-approval/run.sh — exit 0, 17 wingfoil commands, OK: Journey 4: a rule, a workflow, a submitted deliverable, a routed approval, a checkpoint, the workflow ended
[publish:staging]   ok   [Kanban] wingfoil init --template Kanban — exit 0, tree clean
[publish:staging]   ok   [Kanban] wingfoil dna show --format json — exit 0, tree clean
[publish:staging]   ok   [Kanban] wingfoil dna show --no-such-option — exit 2, tree clean
[publish:staging]   ok   [Kanban] wingfoil memory approve --format json — exit 2, tree clean
[publish:staging]   ok   [Kanban] wingfoil dna set project.name --value WingFoil smoke — exit 0, tree clean
[publish:staging]   ok   [Kanban] wingfoil memory add --type task --title Approved task --format json — exit 0, tree clean
[publish:staging]   ok   [Kanban] wingfoil memory submit task-001-approved-task --format json — exit 0, tree clean
[publish:staging]   ok   [Kanban] wingfoil memory approve task-001-approved-task --reason smoke: no approver bound --format json — exit 1, tree clean
[publish:staging]   ok   [Kanban] wingfoil dna add team.members --value WingFoil Smoke --entry-email smoke@wingfoil.invalid --entry-roles approver — exit 0, tree clean
[publish:staging]   ok   [Kanban] wingfoil memory approve task-001-approved-task --reason smoke: approve --format json — exit 0, tree clean
[publish:staging]   ok   [Kanban] wingfoil memory submit task-001-approved-task --format json — exit 1, tree clean
[publish:staging]   ok   [Kanban] wingfoil memory add --type task --title Rejected task --format json — exit 0, tree clean
[publish:staging]   ok   [Kanban] wingfoil memory submit task-002-rejected-task --format json — exit 0, tree clean
[publish:staging]   ok   [Kanban] wingfoil memory reject task-002-rejected-task --reason smoke: reject --format json — exit 0, tree clean
[publish:staging]   ok   [Kanban] wingfoil memory add --type task --title Deprecated task --format json — exit 0, tree clean
[publish:staging]   ok   [Kanban] wingfoil memory deprecate task-003-deprecated-task --reason smoke: deprecate --format json — exit 0, tree clean
[publish:staging]   ok   [Kanban] wingfoil dna show --format json — exit 0, tree clean
[publish:staging]   ok   [Kanban] wingfoil memory search task-001-approved-task --status approved --format json — exit 0, tree clean
[publish:staging]   ok   [Kanban] wingfoil memory history task-001-approved-task --format json — exit 0, tree clean
[publish:staging]   ok   [Kanban] wingfoil memory search task-002-rejected-task --status draft --format json — exit 0, tree clean
[publish:staging]   ok   [Kanban] wingfoil memory history task-002-rejected-task --format json — exit 0, tree clean
[publish:staging]   ok   [Kanban] wingfoil memory search task-003-deprecated-task --status deprecated --format json — exit 0, tree clean
[publish:staging]   ok   [Kanban] wingfoil memory history task-003-deprecated-task --format json — exit 0, tree clean
[publish:staging]   ok   [Kanban] wingfoil directives list --format json — exit 0, tree clean
[publish:staging]   ok   [Kanban] wingfoil paths config --list --format json — exit 0, tree clean
[publish:staging]   ok   [Kanban] wingfoil workflow list --format json — exit 0, tree clean
[publish:staging]   ok   [Kanban] wingfoil workflow start sw-life-cycle --format json — exit 0, tree clean
[publish:staging]   ok   [Kanban] wingfoil workflow finalize sw-life-cycle-1-plan --format json — exit 0, tree clean
[publish:staging]   ok   [Kanban] wingfoil workflow finalize sw-life-cycle-1-plan --format json — exit 0, tree clean
[publish:staging]   ok   [Kanban] wingfoil workflow adopt sw-life-cycle-1-plan --plan --format json — exit 0, tree clean
[publish:staging]   ok   [Kanban/agent] wingfoil init --template Kanban — exit 0, tree clean
[publish:staging]   ok   [Kanban/agent] wingfoil memory add --type task --title Agent run --format json — exit 0, tree clean
[publish:staging]   ok   [Kanban/agent] commit .wingfoil/agents/custom/fake.yaml, test/fixtures/agents/fake-agent.cjs — commit ok, tree clean
[publish:staging]   ok   [Kanban/agent] wingfoil dna add team.agents --value Fake Agent --entry-email fake-agent@example.com --entry-executes_as developer --entry-adapter fake — exit 0, tree clean
[publish:staging]   ok   [Kanban/agent] wingfoil agent execute --element task:task-001-agent-run --role developer — exit 0, tree clean
[publish:staging]   ok   [Kanban/agent] one agent: record commit for task-001-agent-run/adhoc/1 — the only one, changing only docs/runs/task-001-agent-run.jsonl
[publish:staging]   ok   [Kanban/agent] wingfoil agent show task-001-agent-run/adhoc/1 --format json — exit 0, tree clean
[publish:staging]   ok   [Kanban/agent] wingfoil agent list --past --format json — exit 0, tree clean
[publish:staging]   ok   [Kanban/agent] the fake agent read the session Resource for task-001-agent-run/adhoc/1 — read wingfoil://session/developer/task:task-001-agent-run/<the run's state_ref> from the wingfoil server
[publish:staging]   ok   [Kanban/journey] bash docs/examples/06-workflow-approval/run.sh — exit 0, 17 wingfoil commands, OK: Journey 4: a rule, a workflow, a submitted deliverable, a routed approval, a checkpoint, the workflow ended
[publish:staging] staged wingfoil@0.3.1 and smoke passed
