# Revised 2026-10-10 (task-225, spec-017 §5.1, §5.3, ruling R13): sc. 1 is P4.14's role routing, reported on
# the "human needed" line; sc. 3's message is P4.14 sc. 3's in v0.3. Decision-type routing (sc. 2) and the
# "notifications enabled" setting come with the v0.4 delivery (tagged @v0.4).
Feature: X1.2 (US-2-03) - Notification Routing
  As Morgan, I want notifications routed by role or decision type so I receive only the
  alerts that pertain to me.

  Background:
    Given an initialized WingFoil project
    And DNA defines "Morgan" as "approver" and "Casey" as "stakeholder"

  Scenario: Route an approval notification to the role holder
    Given an approval requires the "approver" role
    When the notification is routed
    Then it is delivered to "Morgan"
    And it is NOT delivered to "Casey"

  @v0.4
  Scenario: Route by decision type to a specific person
    Given a "budget" decision type is routed to "Casey"
    When a "budget" decision notification is produced
    Then it is delivered to "Casey"

  Scenario: Error - no recipient matches the routing rule
    Given an approval requires a role with no assigned member
    When I run "wingfoil workflow status"
    Then the approval is routed to nobody and the command exits with code 0
    And the message is "no approver found for role '<role>' in dna.yaml"
