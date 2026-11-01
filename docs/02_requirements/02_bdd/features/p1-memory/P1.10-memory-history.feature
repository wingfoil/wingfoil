Feature: P1.10 (US-5-08) - wingfoil memory history
  As Casey, I want to query a document's audit trail so I see who decided what, when, why,
  and what changed.

  Background:
    Given an initialized WingFoil project
    And a Memory document "decision-12" has 3 recorded state transitions

  Scenario: View the full audit trail of a document
    When I run "wingfoil memory history decision-12"
    Then the output lists 3 entries in chronological order
    And each entry shows author, ISO-8601 timestamp, state change, and reason
    And the query returns in under 1 second

  Scenario: Error - history for a non-existent document
    When I run "wingfoil memory history decision-999"
    Then the command exits with code 1 and message "document not found: decision-999"

  Scenario: Edge - document with a single creation event
    Given a Memory document "decision-30" was just created with no further changes
    When I run "wingfoil memory history decision-30"
    Then the output lists exactly 1 entry describing the creation

  Scenario: Edge - an unrelated document whose frontmatter does not parse
    Given another Memory document's frontmatter is not valid YAML
    When I run "wingfoil memory history decision-12"
    Then the output lists 3 entries in chronological order
    And a warning "W_MEMORY_UNREADABLE" names the other document by its repository-relative path

  Scenario: Edge - a revision whose frontmatter does not parse
    Given one recorded revision of "decision-12" has frontmatter that is not valid YAML
    When I run "wingfoil memory history decision-12"
    Then the command exits with code 0 and lists every entry
    And that revision's entry has no state and names why it could not be read
    And a warning "W_MEMORY_UNREADABLE" names the document and the commit

  Scenario: Short reference - a type prefix and a number names the element
    Given a Memory document "dl-001-pick-a-storage-layout-for-exports" of a type whose id_pattern is "dl-{n}-{slug}"
    When I run "wingfoil memory history dl-1"
    Then the command exits with code 0 and the history's id is "dl-001-pick-a-storage-layout-for-exports"

  Scenario: Short reference - a unique prefix of the full id names the element
    Given a Memory document "dl-001-pick-a-storage-layout-for-exports"
    When I run "wingfoil memory history dl-001-pick"
    Then the command exits with code 0 and the history's id is "dl-001-pick-a-storage-layout-for-exports"

  Scenario: Error - a short reference matching several elements is ambiguous
    Given Memory documents "patch-v0.3.1" and "patch-v0.3.2"
    When I run "wingfoil memory history patch-v0.3"
    Then the command exits with code 1 and message "ambiguous reference: patch-v0.3 matches 2 elements"
    And both full ids are listed in id order and nothing is written
