# Revised 2026-11-24 (task-374, bug-359, spec-017 §7.6): show takes any instance plan's id and names its workflow.
Feature: P4.7 (US-0A-19) - wingfoil workflow show
  As Alex, I want to display a workflow's details (phases, steps, directives, Memory
  structure) so I understand how it is composed.

  Background:
    Given an initialized WingFoil project
    And a workflow "release-cycle" is defined with phases and steps

  Scenario: Show a workflow's structure
    When I run "wingfoil workflow show release-cycle"
    Then the output lists each phase, its steps, the role directives, and the Memory elements

  Scenario: Show resolves include() composition
    Given "release-cycle" includes the sub "dev-loop"
    When I run "wingfoil workflow show release-cycle"
    Then the included sub "dev-loop" is shown nested under its phase

  Scenario: Error - showing an unknown workflow
    When I run "wingfoil workflow show ghost"
    Then the command exits with code 1 and message "unknown workflow: ghost"

  Scenario: Show names the workflow of an instance plan's id
    Given "old-1-plan" is a closed instance plan of "release-cycle"
    When I run "wingfoil workflow show old-1-plan --format json"
    Then the command exits with code 0 and shows the workflow "release-cycle"
    And the output names "old-1-plan" an instance of "release-cycle" that is not open
