Feature: P1.7 (US-2-10) - wingfoil memory approve
  As Sam, I want to approve a Memory document recording approver, timestamp, and reason
  so the review is auditable and tied to directives.

  Background:
    Given an initialized WingFoil project
    And a Memory document "task-101" exists with "status: pending"
    And the current user has the "reviewer" role

  Scenario: Approve a pending document with a reason
    When I run "wingfoil memory approve task-101 --reason 'meets standards'"
    Then the document transitions to the type's post-review approved state
    And the git commit records the approver identity, timestamp, and reason "meets standards"
    And the command exits with code 0

  Scenario: Error - approving without a reason
    When I run "wingfoil memory approve task-101"
    Then the state is unchanged
    And the command exits with code 2 and message "missing required argument: --reason"

  Scenario: Error - approver lacks authority for the type
    Given the current user does NOT hold an approver role for type "task"
    When I run "wingfoil memory approve task-101 --reason 'ok'"
    Then the state is unchanged
    And the command exits with code 1 and message "user not authorized to approve type 'task'"

  # dl-065 Q1.1 (task-162): approving an element whose `supersedes:` names another element of its
  # type fires the `waiting` edge into `superseded` on the named one, in a commit of its own.
  Scenario: Approving a superseding ADR moves the ADR it names to superseded
    Given a Memory document "adr-1" exists with "status: accepted"
    And a Memory document "adr-2" exists with "status: pending" and "supersedes: adr-1"
    And the current user holds the "approver" role
    When I run "wingfoil memory approve adr-2 --reason 'replaces adr-1'"
    Then "adr-2" transitions "pending → accepted" in a "wf(adr): approve" commit recording the approver and reason
    And "adr-1" transitions "accepted → superseded" in a following "wf(adr): finalize" commit whose reason names "adr-2"
    And the command exits with code 0

  Scenario: Error - the supersedes: field names an element that cannot be superseded
    Given a Memory document "adr-2" exists with "status: pending" and "supersedes: adr-9"
    And no Memory document "adr-9" exists
    And the current user holds the "approver" role
    When I run "wingfoil memory approve adr-2 --reason 'ok'"
    Then the state of every document is unchanged
    And the command exits with code 1
