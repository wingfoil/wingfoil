# Revised 2026-10-11 (task-235 D1, approver ruling 2026-10-11, option (a)): scenario 3's message is the
# workflow registry's (E_PHASE_ROLE_UNKNOWN, spec-003), which refuses a phase whose role dna.yaml does not
# define before any step is taken; "step role 'ghost' not defined in dna.yaml" cannot be reached through a
# repository.
# Revised 2026-10-10 (task-235, spec-016 §3.2 step 3, §3.7): the --role override scenario is added.
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

  Scenario: Error - the step declares a role not defined in DNA
    Given the step "Code Review" declares role "ghost"
    When an agent executes the "Code Review" step
    Then execution does not start
    And the message is "unknown role 'ghost' (not defined in dna.yaml)"

  Scenario: --role overrides the step's role
    Given the step "Implementation" declares role "developer"
    When an agent executes the "Implementation" step with "--role reviewer"
    Then the agent runs under role "reviewer"
    And the run keeps the step's phase
