Feature: P4.19 (US-0A-11) - Template Expansion
  As Alex, I want the selected template to auto-generate phases, directives, and Memory
  sections so I avoid manual configuration.

  Background:
    Given a new project being initialized with WingFoil
    And the "Scrum" reference template is selected

  Scenario: Expansion generates the full configuration set
    When the template is expanded
    Then workflow phases, role directives, and Memory sections are generated together
    And the generated artifacts are committed to git

  # dl-066 option 1: a step carries no directive reference of its own; its directives are the ones
  # roles.yaml binds to its role (spec-003 Phase.role). Reworded for P4.19's v0.4 scope.
  Scenario: Expansion is internally consistent
    When the template is expanded
    Then every generated workflow step's role is bound in "roles.yaml" only to directives that also exist
    And every Memory type a generated workflow step names also exists
    And there are no dangling references

  Scenario: Error - expansion target already contains a conflicting workflow
    Given ".wingfoil/workflows.yaml" already defines a phase with the same name
    When the template is expanded
    Then expansion aborts without overwriting
    And the message is "expansion conflict: phase '<name>' already exists"
