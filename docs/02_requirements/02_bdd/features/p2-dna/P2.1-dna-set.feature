Feature: P2.1 (US-0A-08) - wingfoil dna set
  As Alex, I want to define/update project DNA so modules, stacks, and team are
  recorded in .wingfoil/dna.yaml.

  Background:
    Given an initialized WingFoil project

  Scenario: Set a DNA field
    When I run "wingfoil dna set project.license --value MIT"
    Then ".wingfoil/dna.yaml" contains "license: MIT" under "project"
    And the change is committed to git
    And the command exits with code 0

  Scenario: Update an existing DNA field
    Given ".wingfoil/dna.yaml" has "license: MIT" under "project"
    When I run "wingfoil dna set project.license --value Apache-2.0"
    Then the value becomes "Apache-2.0"

  Scenario: Error - a path that does not resolve is refused, never created
    When I run "wingfoil dna set tech_stack.language --value python"
    Then ".wingfoil/dna.yaml" is unchanged
    And the change is not committed
    And the command exits with code 1 and message "unknown DNA field 'tech_stack.language': 'tech_stack' is not declared under the dna.yaml schema"

  Scenario: Error - a path that names a collection is refused by this verb
    When I run "wingfoil dna set stacks.technologies --value TypeScript"
    Then ".wingfoil/dna.yaml" is unchanged
    And the change is not committed
    And the command exits with code 1 and message "'stacks.technologies' does not hold a single value: reach it with `dna add|remove|update stacks.technologies --value <v>` (dl-081)"

  Scenario: Error - invalid dotted key path
    When I run "wingfoil dna set ..language python"
    Then ".wingfoil/dna.yaml" is unchanged
    And the command exits with code 2 and message "invalid key path: '..language'"
