Feature: P1.8 (US-4-11) - wingfoil memory reject
  As Morgan, I want to reject a document so it reverts to draft for rework with feedback.

  Background:
    Given an initialized WingFoil project
    And a Memory document "task-101" exists with "status: pending"

  Scenario: Reject a pending document with feedback
    When I run "wingfoil memory reject task-101 --reason 'tests missing'"
    Then the document frontmatter becomes "status: draft"
    And the git commit records the rejecter identity, timestamp, and reason "tests missing"
    And the command exits with code 0

  # dl-154-an-illegal-transition-prints-none-as-its-target-replacing-dl-053-s-canonical-edge (option A, replacing dl-053), task-181: a refused verb reaches nothing from <from>, so <to> is (none).
  Scenario: Error - rejecting a document that is not pending
    Given the document "task-101" has "status: draft"
    When I run "wingfoil memory reject task-101 --reason 'x'"
    Then the state is unchanged
    And the command exits with code 1 and message "illegal transition draft -> (none) for type 'task'"

  Scenario: Error - rejecting without a reason
    When I run "wingfoil memory reject task-101"
    Then the state is unchanged
    And the command exits with code 2 and message "missing required argument: --reason"

  Scenario: Error - rejecter lacks approval authority for the type
    Given the current user does NOT hold an approver role for type "task"
    When I run "wingfoil memory reject task-101 --reason 'ok'"
    Then the state is unchanged
    And the command exits with code 1 and message "user not authorized to approve type 'task'"
