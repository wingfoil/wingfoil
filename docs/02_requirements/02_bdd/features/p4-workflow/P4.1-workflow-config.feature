# Revised 2026-11-13 (task-340, dl-202 item 2, spec-003 § Diagnostics): an agent action under a role no agent executes
# is reported where the configuration is read.
Feature: P4.1 (US-0A-15) - Project Workflow (configuration)
  As Morgan, I want to define workflow structure (phases -> steps -> atomic actions) with
  kind main/sub in .wingfoil/workflows.yaml so I model the team process.

  Background:
    Given an initialized WingFoil project

  Scenario: Load a valid workflow configuration
    Given ".wingfoil/workflows.yaml" declares a workflow "release-cycle" with kind "main"
    When the workflow configuration is loaded
    Then "release-cycle" is registered as an independently startable main workflow

  Scenario: A sub workflow is include-only
    Given a workflow "dev-loop" declares kind "sub"
    When the configuration is loaded
    Then "dev-loop" is NOT listed as independently startable

  Scenario: Error - a workflow declares an unknown kind
    Given a workflow declares "kind: hybrid"
    When the configuration is validated
    Then validation fails
    And the message is "invalid workflow kind 'hybrid' (allowed: main, sub)"

  Scenario: Warning - an agent action under a role no agent executes
    Given a workflow phase "deploy" declares role "tech-lead" and the action "agent.execute"
    And no team.agents entry with an adapter lists "tech-lead" in "executes_as"
    When the configuration is validated
    Then validation passes
    And the warning "W_WORKFLOW_AGENT_ROLE_UNEXECUTED" names the phase "deploy" and the role "tech-lead"
