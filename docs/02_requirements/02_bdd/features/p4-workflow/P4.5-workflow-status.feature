# Revised 2026-11-24 (task-374, bug-341, bug-487, spec-017 §5.1 and §7.4): the ungated elements are counted by type
# with --full for the list, and an element whose field names an open run's iteration is held, not uncarried.
Feature: P4.5 (US-2-01) - wingfoil workflow status
  As Sam, I want to see the state of all open main workflows and pending approvals so I
  find the reviews to do.

  Background:
    Given an initialized WingFoil project
    And 2 main workflows are open with 1 pending approval among them

  Scenario: Show status of all open workflows
    When I run "wingfoil workflow status"
    Then both open workflows are listed
    And the active workflow is highlighted
    And the 1 pending approval is shown

  Scenario Outline: Status supports machine-readable formats
    When I run "wingfoil workflow status --format <format>"
    Then the output is valid <format>

    Examples:
      | format |
      | json   |
      | yaml   |

  Scenario: Edge - no open workflows
    Given no workflows are open
    When I run "wingfoil workflow status"
    Then the command exits with code 0 and message "no open workflows"

  Scenario: The ungated elements are counted by type, --full lists them
    Given 2 bugs wait at a gate that no step of an open workflow approves
    When I run "wingfoil workflow status"
    Then the output has the line "ungated elements: 2 (bug 2) — routed to <members>; --full lists them"
    And no ungated element has a line of its own
    When I run "wingfoil workflow status --full"
    Then the output has the line "ungated elements: 2" and one "human needed" line per ungated element
    And "wingfoil workflow status --format json" prints the same document with and without "--full"

  Scenario: An element whose release is an open run's iteration is held, not uncarried
    Given an open workflow "sw-life-cycle-1-plan" iterates over release "release-1", whose sprint-planning approval is pending
    And bug "bug-1-crash" waits at a gate with "release: release-1"
    When I run "wingfoil workflow status --full"
    Then bug "bug-1-crash" is listed "held by sw-life-cycle-1-plan's release release-1, no step of it approves it now"
    And it is not reported as carried by no open workflow
