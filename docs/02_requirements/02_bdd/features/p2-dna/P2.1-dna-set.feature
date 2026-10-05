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

  # task-193 (bug-019, bug-126): every DNA write keeps dna.yaml's comments, or is refused unless
  # --force authorizes the whole-file rewrite (approver ruling R20/Q9, as dl-062 for roles.yaml).
  Scenario: Comments survive adding the first entry of a collection dna.yaml does not declare yet
    Given ".wingfoil/dna.yaml" carries comments and no "agents" key under "team"
    When I run "wingfoil dna add team.agents --value claude --entry-executes_as developer,reviewer --entry-approval_authority false"
    Then every comment line of ".wingfoil/dna.yaml" is still present, in order
    And no line outside the new "agents" entry changed
    And the command exits with code 0

  Scenario: Error - dna.yaml cannot be edited in place
    Given ".wingfoil/dna.yaml" writes "paths" as a flow mapping "{ sources: [src/], runs: [docs/runs/] }"
    When I run "wingfoil dna add paths.tests --value test/"
    Then ".wingfoil/dna.yaml" is unchanged
    And the change is not committed
    And the command exits with code 1 and message "dna.yaml cannot be updated in place; edit paths.tests by hand, or pass --force to rewrite the whole file"

  Scenario: Rewrite dna.yaml as a whole file with --force
    Given ".wingfoil/dna.yaml" writes "paths" as a flow mapping "{ sources: [src/], runs: [docs/runs/] }"
    When I run "wingfoil dna add paths.tests --value test/ --force"
    Then the change is committed to git
    And stderr carries "warning: dna.yaml was rewritten as a whole file (--force): comments are not kept, and neither are quoting, flow style, blank lines, line endings or number formatting (1.0 becomes 1)"
    And the command exits with code 0
