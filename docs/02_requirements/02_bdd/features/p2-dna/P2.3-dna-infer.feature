Feature: P2.3 (US-0B-03) - wingfoil dna infer
  As Morgan, I want dna infer to scan the codebase and propose a DNA structure that I
  approve or refine so the DNA reflects real modules and stacks.

  Background:
    Given an initialized WingFoil project being migrated (Journey 0b)
    And the codebase contains Python sources and a "pyproject.toml"

  Scenario: Propose DNA from codebase, human approves
    When I run "wingfoil dna infer" and approve the proposal
    Then ".wingfoil/dna.yaml" is updated with detected language "python"
    And the proposal was shown for review before being written
    And the command exits with code 0

  Scenario: Human refines the proposal before saving
    When I run "wingfoil dna infer" and edit the proposed module list before approving
    Then the saved DNA reflects my edited module list, not the raw proposal

  Scenario: Error - inference on an empty or unreadable codebase
    Given the project has no detectable source files
    When I run "wingfoil dna infer"
    Then no DNA changes are written
    And the command exits with code 1 and message "could not infer DNA: no recognizable sources found"
