Feature: P2.5 (US-0A-22) - wingfoil paths [category]
  As Alex, I want to query project resource paths by category with drill-down and
  multiple output formats so I confirm all resources are mapped for agent navigation.

  Background:
    Given an initialized WingFoil project
    And DNA maps "sources" to "src/" and "tests" to "tests/"

  Scenario: List paths for a category
    When I run "wingfoil paths sources --list"
    Then the output contains "src/"
    And the command exits with code 0

  Scenario Outline: Output formats are supported
    When I run "wingfoil paths sources --format <format>"
    Then the output is valid <format>

    Examples:
      | format  |
      | console |
      | json    |
      | yaml    |

  Scenario: Query the run-log category of a freshly initialized project
    # spec-016 §4.1: `runs` is the sixth category, holding exactly one directory; `wingfoil init`
    # scaffolds it as docs/runs/.
    Given a project initialized with "wingfoil init"
    When I run "wingfoil paths runs"
    Then the output contains "docs/runs/"
    And the command exits with code 0

  Scenario: a project-specific category is served with no warning
    # spec-002 Categories: a project may add its own category, an ordered list of directories like the
    # declared ones; it is validated as such and served with no unknown-field warning (bug-316, task-312).
    # The write verbs still address only the declared categories (dl-081).
    Given DNA maps the project-specific category "extras" to "notes/"
    When I run "wingfoil paths extras"
    Then the output contains "notes/"
    And no warning is printed
    And the command exits with code 0

  Scenario: Error - querying an undefined category
    When I run "wingfoil paths governance"
    And no "governance" category is mapped in DNA
    Then the command exits with code 1 and message "no paths mapped for category 'governance'"
