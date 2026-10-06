Feature: P1.4 (US-0B-04) - wingfoil memory import
  As Alex, I want to scan the project for existing docs and import them into Memory
  interactively with metadata extraction so migration friction is reduced.

  Background:
    Given an initialized WingFoil project being migrated (Journey 0b)
    And the project contains 3 existing markdown documents outside ".wingfoil/"

  Scenario: Import existing documents with extracted metadata
    When I run "wingfoil memory import" and confirm each proposed document
    Then 3 Memory files are created, each at the path its type declares in ".wingfoil/memory.yaml"
    And each imported file has frontmatter with an extracted title and a "status: draft"
    And the command exits with code 0 reporting "3 imported, 0 skipped"

  Scenario: Skipping a proposed document during interactive import
    When I run "wingfoil memory import" and reject 1 of the 3 proposed documents
    Then 2 Memory files are created
    And the command reports "2 imported, 1 skipped"

  Scenario: Error - no importable documents found
    Given the project contains no documents outside ".wingfoil/"
    When I run "wingfoil memory import"
    Then no files are created
    And the command exits with code 0 and message "no importable documents found"
