# Revised 2026-10-15 (task-242, bug-327; spec-017 §7.9, §10): sc. 4 and sc. 5 cover `workflow finalize`, the
# phase record it writes for a step no Memory or file evidence can complete, and its off-frontier refusal.
Feature: P4.13 (US-1-02) - Workflow State Deduction (from Memory)
  As the system, I want workflow state deduced from Memory file existence and frontmatter,
  validated against the type's allowed states, so no separate state index file is needed.

  Background:
    Given an initialized WingFoil project with no ".wingfoil/state/" index

  Scenario: Deduce task progress from frontmatter
    Given a "task" file has frontmatter "status: in-progress"
    When workflow state is computed
    Then that task is reported as being implemented
    And the result is derived only from the Memory file, not a separate index

  Scenario: Deduced state is validated against the type machine
    Given a "release" file has frontmatter "status: releasing"
    And "releasing" is a valid state for type "release"
    When workflow state is computed
    Then the release is reported in the "releasing" phase

  Scenario: Error - frontmatter holds a state illegal for the type
    Given a "task" file has frontmatter "status: releasing"
    And "releasing" is not a valid state for type "task"
    When workflow state is computed
    Then the file is flagged invalid
    And the message is "invalid state 'releasing' for type 'task' in <file>"

  Scenario: A step completed only by a record is complete after workflow finalize
    Given an open workflow whose next step is a phase with no Memory or file evidence
    When "wingfoil workflow finalize" records that step
    Then one commit with no file change, subject "workflow: finalize <instance> <step>", carries the phase-record trailers
    And the step's phase is reported complete
    And "workflow next" reports the following step

  Scenario: Error - finalize a step that is not on the frontier
    Given an open workflow whose frontier does not hold the step "<key>"
    When "wingfoil workflow finalize --step <key>" is run
    Then nothing is committed
    And the message is "step '<key>' is not on the frontier of <instance>"
