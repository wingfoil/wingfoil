# Revised 2026-10-10 (task-225, spec-017 §5.3, ruling R13): in v0.3 the notification channel is the CLI
# output of `workflow status` / `workflow next`, a "human needed" line per pending approval and per element
# waiting at a gate. The "notifications enabled" setting and delivery failure (sc. 3) come with the git-hook
# delivery in v0.4 (tagged @v0.4).
Feature: X1.1 (US-2-02) - "Human Needed" Notifications
  As Morgan, I want to be notified when an approval or decision is required so I do not
  have to poll the queue manually.

  Background:
    Given an initialized WingFoil project

  Scenario: Notify on a pending approval
    Given a deliverable transitions to "status: pending" requiring approval
    When I run "wingfoil workflow status"
    Then a "human needed" line names the required action, the document id and the routed members

  Scenario: No notification when no human action is required
    Given a deliverable transitions between two automated states
    When I run "wingfoil workflow status"
    Then no "human needed" line is printed

  @v0.4
  Scenario: Error - notification delivery fails
    Given the configured notification channel is unreachable
    When a "human needed" event occurs
    Then the failure is logged with the event id
    And the message is "notification delivery failed for event <id>"
