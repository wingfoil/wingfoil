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
