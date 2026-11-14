# Revised 2026-11-13 (task-338, spec-016 §2.4, §2.6 and §3.3 step 14, spec-018 §1.1 and §6 T-22; dl-180 invocation
# (c), dl-168 Q1 (b), bug-369, bug-370): the --agent scenario's attribution step is reworded to the new
# {attribution_line}; the CLI the agent runs, WINGFOIL_AGENT for the spawned agent only, the record commit without an
# agent trailer, --co-author refused, and the per-clone session salt are added. Earlier scenarios are unchanged.
# Revised 2026-11-11 (task-339, spec-016 §2.2, §3.3 step 14 and --dry-run; dl-223 (b), Action 3): the headless
# posture of the run's role is added. It is implemented by test/cli/agent-execute-permissions.integration.test.ts.
# Earlier scenarios are unchanged.
# Revised 2026-11-08 (task-335, spec-016 §3.1, §3.2 steps 1 and 7, §3.3 steps 4, 12, 14, 15 and 18, §3.5, §3.7;
# dl-181, dl-183, dl-171, bug-392): the headless work run, the launch-kind flags, the waiting-step refusal, the
# time bound and the dry run without a terminal are added. They are implemented by
# test/cli/agent-execute-launch-kind, -headless, -awaiting and -dry-run-terminal.integration.test.ts. Earlier
# scenarios are unchanged.
# Revised 2026-10-10 (task-235, spec-016 §3.1, §3.2 steps 1 and 6, §3.7; ruling R16; dl-135 point 3): the
# --workflow and --step scenarios, the recorded step and mode scenario, and the v0.4 --resume scenario
# (tagged @v0.4: --resume is not registered in v0.3, so it is refused as an unknown option, exit 2) are added.
# Earlier scenarios are unchanged.
# Revised 2026-10-09 (task-228, spec-016 §3.1, §3.3, §4; dl-114 Action 2, dl-135 Action 3): the run
# record scenarios, the --agent scenario and the attribution step are added; scenario 2's fixture note
# says element ids are full ids. Scenarios 1 and 3 are unchanged; "ready within 30 seconds" is read as
# spec-016 §3.3's launch point (the spawn), not as the agent's own start-up.
Feature: P5.3.1 (US-1-03) - wingfoil agent execute [--next]
  As Alex, I want to launch the agent with auto-loaded context, resolving role and element
  from the current step with --next, so I start work with pre-loaded context.

  Background:
    Given an initialized WingFoil project
    And the active workflow's next step targets element "task:101" with role "developer"

  Scenario: Launch agent resolving role and element from the step
    When I run "wingfoil agent execute --next"
    Then the agent starts with role "developer" and element "task:101"
    And DNA, Memory, and directives for that role are pre-loaded
    And the agent is ready within 30 seconds of launch

  # Fixture note: "task:202" needs a fixture holding an element of type task with that full id; the scenario may also
  # be written "task:task-202", a short reference (0.3.2, spec-008 §7) that resolves a "task-202-..." element. The run
  # records the full id.
  Scenario: Explicit element override
    When I run "wingfoil agent execute --element task:202"
    Then the agent starts targeting element "task:202" regardless of the next step

  Scenario: Error - --next with no actionable step
    Given the active workflow has no next step
    When I run "wingfoil agent execute --next"
    Then no agent is launched
    And the command exits with code 1 and message "no next step to execute"

  Scenario: Every spawned run is recorded in the element's run log
    Given dna.yaml declares the run log under paths.runs
    When I run "wingfoil agent execute --element task:202 --role developer"
    And the agent exits with code 0
    Then one record is appended to the run log of "task:202", in execution mode "fresh"
    And it is committed alone as "agent: record <run-id>"
    And the command exits with code 0 and writes nothing on stdout

  Scenario: A run that fails is still recorded
    When I run "wingfoil agent execute --element task:202 --role developer"
    And the agent exits with code 3
    Then the run's record holds exit status 3
    And the command exits with code 1 and message "agent exited 3; run <run-id> recorded"

  Scenario: A run ended by a signal is still recorded
    When I run "wingfoil agent execute --element task:202 --role developer"
    And agent execute receives SIGTERM while the agent runs
    Then the agent receives SIGTERM
    And the run's record holds exit status "signal:SIGTERM"

  Scenario: Choose which agent runs with --agent
    Given dna.yaml declares two agents with an adapter that execute as "developer"
    When I run "wingfoil agent execute --element task:202 --role developer --agent <second agent>"
    Then the second agent is launched
    And its bootstrap names that agent's name and email as the co-author the wingfoil commands write on its commits
    And it tells the agent to pass "--ai-model" to them, to add the trailers itself only to a commit it writes with git commit, and never to run an approve, reject or amend

  Scenario: The run record names the step it ran, in mode fresh
    Given the next step is phase "implement" of workflow "loop", and the phase allows modes "fresh" and "resume"
    When I run "wingfoil agent execute --next"
    Then the record's workflow is "loop", its phase "implement", and its mode "fresh"
    And its run id is "<element-id>/implement/1"
    And no warning is printed about the mode

  Scenario: Take the next step of a named workflow with --workflow
    Given two workflows are open, and "delivery" is not the one started last
    When I run "wingfoil agent execute --workflow delivery"
    Then the agent starts on the next step of the most recently started open "delivery" instance

  Scenario: Take one of several ready steps with --step
    Given the frontier of instance "delivery-1" holds the steps "loop.implement@task:203" and "loop.implement@task:204"
    When I run "wingfoil agent execute --workflow delivery-1 --step loop.implement@task:204"
    Then the agent starts on element "task:204", not on the first step
    And this is the argv "wingfoil workflow next" prints for that step's agent binding

  Scenario: Error - --step names no step of the frontier
    When I run "wingfoil agent execute --workflow delivery-1 --step loop.review@task:203"
    Then no agent is launched
    And the command exits with code 1 and message "step 'loop.review@task:203' is not on the frontier of delivery-1"

  @v0.4
  Scenario: Error - --resume on a phase that allows only fresh runs
    Given the next step's phase declares no "mode", so it allows only "fresh"
    When I run "wingfoil agent execute --next --resume <run-id>"
    Then no agent is launched
    And the command exits with code 1 and says the phase does not allow mode "resume"

  Scenario: The headless work run launches without a terminal
    When I run "wingfoil agent execute --element task:202 --headless --format json"
    Then the agent is launched with the adapter's headless arguments, its stdin not connected
    And stdout is exactly one document {"run": <record>}, whose result is "n/a"
    And the summary line is a notice on stderr

  Scenario: A flag that contradicts the phase's launch kind prints a warning
    Given the next step's phase declares "launch: interactive"
    When I run "wingfoil agent execute --next --headless"
    Then the agent is launched headless
    And stderr has the line "warning: phase 'loop.implement' declares launch: interactive; launching headless (--headless)"

  Scenario: Error - --headless with --interactive
    When I run "wingfoil agent execute --next --headless --interactive"
    Then no agent is launched
    And the command exits with code 2 and message "invalid flag combination: --headless cannot be combined with --interactive"

  Scenario: Error - an adapter without a headless launch
    Given the agent's adapter declares no "launch.headless"
    When I run "wingfoil agent execute --element task:202 --headless"
    Then no agent is launched
    And the command exits with code 1 and message "adapter 'fake-no-headless' declares no headless launch"

  Scenario: Error - --next on a step that only waits for an approval
    Given the active workflow's next step waits for the approver to approve or reject "task:202"
    When I run "wingfoil agent execute --next"
    Then no agent is launched
    And the command exits with code 1 and the message is the line "wingfoil workflow next" prints for that step

  Scenario: A run that outlives --timeout is stopped and still recorded
    Given the agent waits until a signal ends it
    When I run "wingfoil agent execute --element task:202 --headless --timeout 1s"
    Then the agent receives SIGTERM
    And the run is recorded with exit_status "signal:SIGTERM"
    And the command exits with code 1 and message "agent timed out after 1s; run <run-id> recorded"

  Scenario: A dry run needs no terminal
    Given the agent's adapter requires a terminal and stdin and stdout are not terminals
    When I run "wingfoil agent execute --element task:202 --dry-run"
    Then no agent is launched and the launch plan is printed
    And stderr has the line "warning: interactive launch needs a terminal on stdin and stdout: a run without --dry-run is refused here"
    And the command exits with code 0

  Scenario: A headless launch takes the posture of its role
    Given the agent's adapter declares "launch.headless.permissions" as a map with a "reviewer" entry and a "default" entry
    When I run "wingfoil agent execute --element task:202 --role reviewer --headless --dry-run --format json"
    Then the launch plan's "launch" is {"kind": "headless", "permissions": <the reviewer entry>}
    And with "--role developer", a role the map does not name, its "permissions" is the "default" entry
    And a run without "--dry-run" launches the agent with the reviewer entry after the adapter's headless arguments

  Scenario: The agent's wingfoil is the build that launched it
    Given another "wingfoil" is on the PATH of the shell that runs agent execute
    When I run "wingfoil agent execute --element task:202 --role developer"
    Then the agent's bootstrap names "wingfoil" and the version and commit of the build that launched it
    And inside the agent's shell "wingfoil --version" and "$WINGFOIL_CLI --version" print that version and commit
    And the shim is gone once agent execute exits

  Scenario: The spawned agent carries WINGFOIL_AGENT, and the run record carries no agent trailer
    Given agent execute runs in a Claude Code session, with CLAUDE_CODE_CHILD_SESSION set
    When I run "wingfoil agent execute --element task:202 --role developer"
    Then the agent's environment has WINGFOIL_AGENT set to the selected team.agents entry's name
    And the post-run lookups run without WINGFOIL_AGENT
    And the "agent: record <run-id>" commit has no Co-Authored-By or AI-Model trailer

  Scenario: Error - agent execute takes no --co-author
    When I run "wingfoil agent execute --element task:202 --role developer --co-author Claude"
    Then no agent is launched
    And the command exits with code 2 and message "unknown option '--co-author'"

  Scenario: The assigned session id hashes the clone's salt, not its path
    Given the agent's adapter declares "session.id: assign"
    When I run "wingfoil agent execute --element task:202 --role developer" twice
    Then the first run creates the session salt in the git directory and the second reuses it
    And each record's session is the version 5 UUID of the salt and the run id, whatever the repository's path
    And a run from a linked worktree of the clone uses the same salt
