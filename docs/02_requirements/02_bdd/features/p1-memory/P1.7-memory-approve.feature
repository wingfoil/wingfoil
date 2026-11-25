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

  Scenario: A short reference is accepted and the commit names the full id
    Given a Memory document "dl-002-pick-a-storage-engine" exists with "status: in-discussion"
    And the current user holds the "approver" role
    When I run "wingfoil memory approve dl-2 --reason 'agreed'"
    Then the commit subject is "wf(decision-log): approve dl-002-pick-a-storage-engine [in-discussion → ready]"
    And no word of the commit message equals "dl-2"
    And the command exits with code 0

  # dl-212 D1, spec-018 §1, §3 (task-333): an approval is never recorded from an agent's session, whoever the
  # git identity is; the session is refused before its authority is judged.
  Scenario Outline: Error - an approval is refused in an agent's session
    Given the current user holds the "approver" role
    And the session is marked by <marker>
    When I run "wingfoil memory approve task-101 --reason 'ok'"
    Then the state is unchanged
    And no commit is written
    And the command exits with code 1 and message "E_AGENT_CONTEXT: 'memory approve' needs the approver and does not run in an agent's session (<listed>): an approval is recorded only from the approver's own session, never from an agent's (dl-212)"
    And the hint is "run 'memory approve' yourself, from a terminal no agent started — not through an agent's shell"

    Examples:
      | marker                                 | listed                          |
      | the variable WINGFOIL_AGENT, even empty | WINGFOIL_AGENT is set           |
      | the option --co-author Claude           | --co-author was given           |
      | the variable CLAUDE_CODE_CHILD_SESSION  | CLAUDE_CODE_CHILD_SESSION is set |
      | the variable CODEX_SANDBOX              | CODEX_SANDBOX is set            |

  Scenario: CLAUDECODE alone does not mark an agent's session
    Given the current user holds the "approver" role
    And the variable CLAUDECODE is "1" and no agent marker is present
    When I run "wingfoil memory approve task-101 --reason 'ok'"
    Then the document transitions to the type's post-review approved state
    And the commit carries no "Co-Authored-By:" and no "AI-Model:" line
    And the command exits with code 0

  Scenario: Error - a reason that states nothing
    # spec-008 §2's sixth case (bug-498): a placeholder left in a copied command, or text with no word.
    When I run "wingfoil memory approve task-101 --reason '<the reply>'"
    Then the command exits with code 2 and message "invalid flag value: --reason must state a reason: it holds no word, or only a <placeholder>"
    And nothing is written
    When I run "wingfoil memory approve task-101 --reason '...'"
    Then the command exits with code 2 with the same message, and nothing is written
