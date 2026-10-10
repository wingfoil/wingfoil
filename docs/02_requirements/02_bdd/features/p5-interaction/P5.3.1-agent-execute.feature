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
