Feature: P1.11 (US-0A-03) - Memory Entries (git-backed)
  As Alex, I want a .wingfoil/memory/ store holding versioned documents and artifacts so
  I can record decisions from day one.

  Background:
    Given an initialized WingFoil project

  Scenario: Memory store is ready after initialization
    When I inspect the project structure
    Then a ".wingfoil/memory/" directory exists
    And it is tracked by git

  Scenario: Each Memory entry is individually versioned
    Given a Memory document "decision-1" exists
    When its content is modified and saved
    Then the change is captured as a distinct git commit for that file
    And prior versions remain retrievable from git history

  Scenario: Error - writing a Memory entry to a path outside the project root
    When a process attempts to write a Memory entry to "/tmp/decision-x.md"
    Then the write is refused
    And the system returns message "Memory entries must reside within the project root"
