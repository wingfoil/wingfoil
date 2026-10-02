Feature: P2.2 (US-3-03) - wingfoil dna show
  As Jordan, I want to query and display project DNA so I understand the team architecture.

  Background:
    Given an initialized WingFoil project with a populated ".wingfoil/dna.yaml"

  Scenario: Display the full DNA
    When I run "wingfoil dna show"
    Then the output includes the sections "modules", "stacks", "team", "paths"
    And the query returns in under 1 second

  Scenario: Display a single DNA subtree
    When I run "wingfoil dna show tech_stack"
    Then only the "tech_stack" subtree is printed

  Scenario: Error - requesting a non-existent key
    When I run "wingfoil dna show nonexistent_section"
    Then the command exits with code 1 and message "no DNA key named 'nonexistent_section'"
