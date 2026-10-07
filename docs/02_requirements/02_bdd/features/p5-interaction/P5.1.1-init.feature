Feature: P5.1.1 (US-0A-06) - wingfoil init
  As Alex, I want to initialize WingFoil on a new project via an interactive wizard with
  template selection so I configure the project in minutes without editing YAML.

  Background:
    Given a project directory that is a git repository
    And no ".wingfoil/" structure exists yet

  Scenario: Initialize with the wizard and a selected template
    When I run "wingfoil init" and select the "Scrum" template through the wizard
    Then a complete ".wingfoil/" structure is created (dna, memory, directives, workflows, agents)
    And no manual YAML editing was required
    And the command exits with code 0

  Scenario: Initialize non-interactively via flag
    When I run "wingfoil init --template Kanban"
    Then the project is initialized with the "Kanban" template without prompting

  Scenario: Error - initializing an already-initialized project
    Given a ".wingfoil/" structure already exists
    When I run "wingfoil init"
    Then nothing is overwritten
    And the command exits with code 1 and message "WingFoil already initialized (to change its configuration, edit the files under .wingfoil/ and commit them, or use the wingfoil dna and wingfoil directive commands)"
