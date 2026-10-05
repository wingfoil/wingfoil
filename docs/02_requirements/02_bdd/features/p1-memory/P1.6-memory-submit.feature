Feature: P1.6 (US-3-09) - wingfoil memory submit
  As Jordan, I want to submit a Memory document for approval so it moves from draft to
  pending and reaches the reviewer.

  Background:
    Given an initialized WingFoil project
    And a Memory document "task-101" exists with "status: draft"
    And the "task" type allows the transition draft -> pending

  Scenario: Submit a draft document for approval
    When I run "wingfoil memory submit task-101"
    Then the document frontmatter becomes "status: pending"
    And the transition is recorded in git
    And the command exits with code 0

  Scenario: Error - submitting a document whose state machine forbids the transition
    Given a Memory document "task-200" exists with "status: approved"
    And the "task" type has no "submit" edge from approved
    When I run "wingfoil memory submit task-200"
    Then the state is unchanged
    And the command exits with code 1 and message "illegal transition approved -> (none) for type 'task'"

  Scenario: Error - submitting a non-existent document
    When I run "wingfoil memory submit task-999"
    Then the command exits with code 1 and message "document not found: task-999"
