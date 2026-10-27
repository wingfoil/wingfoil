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

  # task-236 (B1 handover from task-196's review): init checks every built-in adapter manifest it ships
  # before writing anything, the task-177 schema as a built-in (REQ-SEC-10) and then the spec-007 secret
  # scan; a failure refuses the whole init.
  Scenario Outline: Error - a built-in adapter manifest fails the pre-write check
    Given the built-in adapter manifest "claude-code" that WingFoil ships <defect>
    When I run "wingfoil init --template Scrum"
    Then nothing is written and no commit is made
    And the command exits with code 1 and a message starting "<message>"

    Examples:
      | defect                                         | message                                                                          |
      | has a key the manifest schema does not declare | built-in adapter template integrity check failed: claude-code                    |
      | carries a private-key header                   | built-in adapter template secret scan failed: claude-code (private-key-pem, line |

  # task-296 (bug-400): the scaffold init writes is a configuration the 0.3 workflow engine can drive — every
  # phase names a role, and the phases that add Memory declare it, so a workflow is not completed by
  # `wingfoil workflow finalize` records alone.
  Scenario Outline: The scaffold's workflows can be driven by the workflow commands
    Given I ran "wingfoil init --template <template>"
    When I run "wingfoil workflow start sw-life-cycle" and then "wingfoil workflow next"
    Then the next step names the role "product-owner"
    When I record every step with "wingfoil workflow finalize" while "wingfoil workflow next" names one
    Then the finalize of "<template-slug>-delivery.plan" exits with code 1 and message "phase '<template-slug>-delivery.plan' completes from its evidence: produces"
    And the workflow is not complete until a task is added with "wingfoil memory add --type task --workflow sw-life-cycle-1-plan"

    Examples:
      | template | template-slug |
      | Scrum    | scrum         |
      | Kanban   | kanban        |
