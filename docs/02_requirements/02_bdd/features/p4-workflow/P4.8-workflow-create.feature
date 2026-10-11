Feature: P4.8 (US-6-02) - wingfoil workflow create
  As Morgan, I want to create a custom workflow file (flag-based; interactive creation is post-v0.3)
  so I add a new phase without editing YAML by hand.

  Background:
    Given an initialized WingFoil project

  Scenario: Create a custom workflow via flags
    When I run "wingfoil workflow create arch-review --kind main"
    Then a workflow file "arch-review" is created under ".wingfoil/workflows/custom/"
    And it is referenced by the main ".wingfoil/workflows.yaml"
    And the command exits with code 0

  Scenario: In-flight tasks are unaffected by a new workflow
    Given a task is in progress under "release-cycle"
    When I create the custom workflow "arch-review"
    Then the in-progress task continues under "release-cycle" unchanged

  Scenario: Error - creating a workflow with a duplicate name
    Given a workflow "arch-review" already exists
    When I run "wingfoil workflow create arch-review --kind main"
    Then no file is overwritten
    And the command exits with code 1 and message "workflow already exists: arch-review"
