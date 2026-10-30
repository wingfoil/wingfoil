Feature: P3.4 (US-4-04) - wingfoil directives list
  As Morgan, I want to list available directives (custom + built-in) and their role
  assignments so I manage rules with visibility.

  Background:
    Given an initialized WingFoil project
    And built-in directives and 1 custom directive "no-direct-db-access" exist

  Scenario: List all directives with assignments
    When I run "wingfoil directives list"
    Then the output includes the 6 built-in directives and "no-direct-db-access"
    And each directive shows its assigned roles (or "unassigned")

  Scenario: Filter the listing by role
    Given "testing" is assigned to role "developer"
    When I run "wingfoil directives list --role developer"
    Then only directives assigned to "developer" are listed, including "testing"

  Scenario: Edge - listing when only built-ins exist
    Given no custom directives exist
    When I run "wingfoil directives list"
    Then exactly the 6 built-in directives are listed

  Scenario: Edge - a directive entry that cannot be read
    Given a symbolic link "custom/broken.md" whose target does not exist
    When I run "wingfoil directives list"
    Then the other directives are listed
    And a warning names ".wingfoil/directives/custom/broken.md" as skipped

  Scenario: Edge - a directive's scope disagrees with roles.yaml
    Given custom directive "no-direct-db-access" declares "scope: global"
    And ".wingfoil/roles.yaml" does not list "no-direct-db-access" under "global"
    When I run "wingfoil directives list"
    Then "no-direct-db-access" is listed as not global, because roles.yaml decides
    And the listing's warnings name "no-direct-db-access" and the disagreement

  Scenario: Edge - a role binding names a missing directive
    Given ".wingfoil/roles.yaml" binds "ghost-directive" to role "qa"
    And no directive file defines "ghost-directive"
    When I run "wingfoil directives list"
    Then the listing's warnings name "ghost-directive" and role "qa"
