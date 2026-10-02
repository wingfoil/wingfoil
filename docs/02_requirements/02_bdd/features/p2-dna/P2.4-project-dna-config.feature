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
