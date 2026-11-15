# Revised 2026-11-13 (task-340, dl-202 item 1, spec-002 § Role binding): human-only roles — a role an agent never
# executes, declared per role; approver is human-only without a declaration.
Feature: P2.4 (US-0A-05) - Project DNA (structured config)
  As Alex, I want a structured project map (modules, stacks, team, resource paths) in
  .wingfoil/dna.yaml so humans and agents share one anatomy.

  Background:
    Given an initialized WingFoil project

  Scenario: DNA file exists and is schema-valid after init
    When I validate ".wingfoil/dna.yaml"
    Then validation passes
    And the file declares the sections "modules", "stacks", "team", "paths"

  Scenario: Agents read DNA as the authoritative project map
    Given ".wingfoil/dna.yaml" lists module "billing"
    When an agent requests the project module map
    Then "billing" is present in the returned structure

  Scenario: Error - malformed YAML in the DNA file
    Given ".wingfoil/dna.yaml" contains invalid YAML syntax
    When the DNA is loaded
    Then loading fails
    And the system returns message "invalid DNA: YAML parse error at line <n>"

  Scenario: Error - an agent executes a role declared human-only
    Given ".wingfoil/dna.yaml" declares role "tech-lead" with "human_only: true"
    And the team.agents entry "Claude" lists "tech-lead" in "executes_as"
    When the DNA is loaded
    Then loading fails
    And the message names the agent entry "Claude" and the human-only role "tech-lead"

  Scenario: Error - an agent executes the approver role, human-only without a declaration
    Given ".wingfoil/dna.yaml" declares role "approver" with no "human_only" key
    And the team.agents entry "Claude" lists "approver" in "executes_as"
    When the DNA is loaded
    Then loading fails
    And the message names the agent entry "Claude" and the human-only role "approver"
