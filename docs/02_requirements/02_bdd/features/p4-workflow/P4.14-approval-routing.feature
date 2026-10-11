# Revised 2026-10-10 (task-225, spec-017 §5.1, Consequences): routing is reported by `workflow status` /
# `workflow next`, never recorded (sc. 1); sc. 3's routing failure is reported on the approval
# (`routedTo: []`, `routingError`) and the command exits 0. Authority stays with the approver role: a routed
# member without it is flagged W_APPROVAL_ROLE_WITHOUT_AUTHORITY.
Feature: P4.14 (US-4-07) - Approval Routing (role-based from DNA)
  As Morgan, I want to define approvers by role or person from .wingfoil/dna.yaml so
  approvals route without hardcoding emails.

  Background:
    Given an initialized WingFoil project
    And DNA defines member "Morgan" with role "approver"
    And a step declares "approval: { by_role: approver }"

  Scenario: Route a pending approval to the role holder
    When a deliverable reaches the approval step
    Then the approval request is routed to "Morgan"
    And "Morgan" is reported as the responsible approver

  Scenario: Route by explicit person overrides role routing
    Given the step declares "approval: { by_person: Casey }"
    When a deliverable reaches the approval step
    Then the approval request is routed to "Casey"

  Scenario: Error - the approval role has no member in DNA
    Given no DNA member holds the role "approver"
    When a deliverable reaches the approval step
    Then routing fails
    And the message is "no approver found for role 'approver' in dna.yaml"
