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

  # dl-212 D1, spec-018 §3 (task-333): a rejection is a decision of the approver, refused in an agent's session.
  Scenario: Error - a rejection is refused in an agent's session
    Given the current user holds the "approver" role
    And the session is marked by the variables WINGFOIL_AGENT and CODEX_SANDBOX
    When I run "wingfoil memory reject task-101 --reason 'needs work'"
    Then the state is unchanged
    And no commit is written
    And the command exits with code 1 and message "E_AGENT_CONTEXT: 'memory reject' needs the approver and does not run in an agent's session (WINGFOIL_AGENT is set, CODEX_SANDBOX is set): an approval is recorded only from the approver's own session, never from an agent's (dl-212)"
