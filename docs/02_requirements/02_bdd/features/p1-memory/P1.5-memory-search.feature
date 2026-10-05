Feature: P1.5 (US-1-08) - wingfoil memory search
  As Alex, I want to query Memory by keyword and metadata so I find relevant decisions
  without scanning all documents.

  Background:
    Given an initialized WingFoil project
    And Memory contains a document titled "API design" tagged "architecture"

  Scenario: Find a decision by keyword
    When I run "wingfoil memory search api"
    Then the results include the document titled "API design"
    And the query returns in under 1 second

  Scenario: Filter results by metadata tag
    When I run "wingfoil memory search --tag architecture"
    Then every returned document has the tag "architecture"

  Scenario: Error - query with no matches
    When I run "wingfoil memory search nonexistentkeyword"
    Then zero results are returned
    And the command exits with code 0 and message "no documents matched the query"

  Scenario: Edge - a Memory file that cannot be read
    Given a Memory file "task-002-broken.md" whose frontmatter is not valid YAML
    When I run "wingfoil memory search api"
    Then the results include the document titled "API design"
    And the command exits with code 0
    And a warning "W_MEMORY_UNREADABLE" names the file by its repository-relative path

  Scenario: Edge - a file that is not a Memory element
    Given a Markdown file under a Memory directory with no frontmatter "id" or "type"
    When I run "wingfoil memory search"
    Then that file is not among the results
    And every returned document has an "id" and a "type"
