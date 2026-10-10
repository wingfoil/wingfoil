# Revised 2026-10-10 (task-235, spec-016 §3.2 step 3, §3.7): the --role override scenario is added, and a
# note says where scenario 3's message comes from. Earlier scenarios are unchanged.
Feature: P5.3.2 (US-2-07) - Agent Role Selection per Step
  As the system, I want to route the agent to the correct role based on the current
  workflow step so the right directives apply for the phase.

  Background:
    Given an initialized WingFoil project
    And the workflow step "Code Review" declares role "reviewer"

  Scenario: Role is selected from the current step
    When an agent executes the "Code Review" step
    Then the agent runs under role "reviewer"
    And reviewer directives are loaded

  Scenario: Different step selects a different role
    Given the step "Implementation" declares role "developer"
    When an agent executes the "Implementation" step
    Then the agent runs under role "developer"

  # Note (task-235): the workflow registry already refuses a phase whose role dna.yaml does not define
  # (E_PHASE_ROLE_UNKNOWN, spec-003), against the same committed dna.yaml, so through the CLI execution stops
  # at that load error; agent execute's own check gives this message for a step deduced without it.
  Scenario: Error - the step declares a role not defined in DNA
    Given the step "Code Review" declares role "ghost"
    When an agent executes the "Code Review" step
    Then execution does not start
    And the message is "step role 'ghost' not defined in dna.yaml"

  Scenario: --role overrides the step's role
    Given the step "Implementation" declares role "developer"
    When an agent executes the "Implementation" step with "--role reviewer"
    Then the agent runs under role "reviewer"
    And the run keeps the step's phase
