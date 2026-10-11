Feature: P4.3 (US-0A-17) - wingfoil workflow end
  As Alex, I want to close the active (or named) main workflow so the active context is
  cleared or restored.

  Background:
    Given an initialized WingFoil project
    And the main workflow "release-cycle" is active

  Scenario: End the active workflow
    Given every step of "release-cycle" is complete
    When I run "wingfoil workflow end"
    Then "release-cycle" is closed
    And the active workflow context is cleared
    And the command exits with code 0

  Scenario: Ending a named workflow restores the previous active context
    Given "report-bug" was started after "release-cycle" and is active
    And every step of "report-bug" is complete
    When I run "wingfoil workflow end report-bug"
    Then "report-bug" is closed
    And "release-cycle" becomes the active context again

  Scenario: Error - ending when no workflow is active
    Given no workflow is active
    When I run "wingfoil workflow end"
    Then the command exits with code 1 and message "no active workflow to end"

  Scenario: Error - ending a workflow that is not complete
    Given the step "release-cycle.ship" of "release-cycle" is not complete
    When I run "wingfoil workflow end"
    Then "release-cycle" stays open
    And the command exits with code 1 and message "workflow 'release-cycle' is not complete: current step release-cycle.ship@release:minor-v1"
    And a hint names "wingfoil memory deprecate" as the way to abandon it
