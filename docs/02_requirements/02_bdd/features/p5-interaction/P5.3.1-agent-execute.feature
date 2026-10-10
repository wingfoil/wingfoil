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

  # Fixture note: element ids are full ids (memory.yaml id_pattern), so "task:202" resolves only in a
  # fixture holding an element with that full id; the scenario keeps its meaning with such a fixture.
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
    And its bootstrap tells it to sign the commits of its work as that agent's name and email

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
