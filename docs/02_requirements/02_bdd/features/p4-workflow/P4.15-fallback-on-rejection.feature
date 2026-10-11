# Revised 2026-10-10 (task-225, spec-017 §4.8, §5.2, Consequences): after a reject `workflow status` /
# `workflow next` report the fallback step as current, `reentered: true`, with the reject commit and the
# declared set_state; the element has memory.yaml's reject target (sc. 1 v0.3 note, sc. 2). An unknown
# fallback step is a load-time error of the workflow files (E_PHASE_FALLBACK_STEP_UNKNOWN), not a refused
# reject: `memory reject` reads no workflow (sc. 3). dev-loop.done's fallback (a failed merge) is reported only.
Feature: P4.15 (US-4-12) - Fallback on Rejection
  As Morgan, I want a rejection to jump to a fallback step in the same workflow and
  optionally set a new document state so rejections are handled gracefully.

  Background:
    Given an initialized WingFoil project
    And a review step declares "fallback: { step: red, set_state: in-progress }"
    And a deliverable "task-101" is at the review step

  # v0.3 note: WingFoil does not apply set_state; `memory reject` writes memory.yaml's reject target. This
  # fixture keeps the reject target (task: in-review -> in-progress) equal to set_state, so the scenario holds;
  # a differing set_state is a load warning (W_PHASE_FALLBACK_STATE_MISMATCH) and is applied by the engine from v1.0.
  Scenario: Reject jumps to the fallback step and sets state
    When "task-101" is rejected at the review step
    Then the workflow position moves to step "red"
    And "task-101" frontmatter becomes "status: in-progress"

  Scenario: Reject without set_state keeps the document state
    Given the review step declares "fallback: { step: red }" with no set_state
    When "task-101" is rejected
    Then the workflow position moves to step "red"
    And "task-101" has the reject target's state

  Scenario: Error - fallback references a step not in the workflow
    Given the review step declares "fallback: { step: ghost }"
    When I run "wingfoil workflow list"
    Then the workflow files fail validation with exit code 1
    And the message is "fallback step 'ghost' not found in workflow"
