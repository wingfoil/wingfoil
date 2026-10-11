Feature: P4.9 (US-6-11) - wingfoil workflow remove
  As Morgan, I want to remove a custom workflow after verifying it is not included
  elsewhere so I deprecate obsolete processes safely.

  Background:
    Given an initialized WingFoil project
    And a custom workflow "arch-review" exists

  Scenario: Remove an unreferenced custom workflow
    Given "arch-review" is not included by any other workflow
    When I run "wingfoil workflow remove arch-review"
    Then the workflow file is deleted and the removal is committed
    And the command exits with code 0

  Scenario: Error - removing a workflow still included elsewhere
    Given "arch-review" is included by "release-cycle"
    When I run "wingfoil workflow remove arch-review"
    Then the workflow is not removed
    And the command exits with code 1 and message "cannot remove 'arch-review': included by 'release-cycle'"

  Scenario: Error - removing a built-in workflow template
    When I run "wingfoil workflow remove release-cycle"
    Then the workflow is not removed
    And the command exits with code 1 and message "built-in workflows cannot be removed"

  Scenario: Error - removing a workflow with an open instance
    Given "arch-review" is not included by any other workflow
    And an instance "arch-review-1-plan" of "arch-review" is open
    When I run "wingfoil workflow remove arch-review"
    Then the workflow is not removed
    And the command exits with code 1 and message "cannot remove 'arch-review': open instance arch-review-1-plan"
