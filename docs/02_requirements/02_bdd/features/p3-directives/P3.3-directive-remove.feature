Feature: P3.3 (US-6-07) - wingfoil directive remove
  As Morgan, I want to remove a custom directive after verifying it is not referenced
  elsewhere so configuration stays clean during workflow evolution.

  Background:
    Given an initialized WingFoil project
    And a custom directive "legacy-rule" exists

  Scenario: Remove an unreferenced custom directive
    # dl-066 option 1: a workflow step reaches directives only through its role (spec-003 Phase.role),
    # so roles.yaml is the only referrer source a directive has.
    Given "legacy-rule" is not assigned to any role
    When I run "wingfoil directive remove legacy-rule"
    Then the directive file is deleted
    And the removal is committed to git
    And the command exits with code 0

  Scenario: Error - removing a directive still referenced
    Given "legacy-rule" is assigned to role "developer"
    When I run "wingfoil directive remove legacy-rule"
    Then the directive is not removed
    And the command exits with code 1 and message "cannot remove 'legacy-rule': still assigned to role 'developer'"

  Scenario: Error - removing a built-in directive
    When I run "wingfoil directive remove testing"
    Then the directive is not removed
    And the command exits with code 1 and message "built-in directives cannot be removed"
