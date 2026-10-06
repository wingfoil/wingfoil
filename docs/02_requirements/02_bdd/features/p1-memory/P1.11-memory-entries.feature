Feature: P1.11 (US-0A-03) - Memory Entries (git-backed)
  As Alex, I want a Memory store holding versioned documents and artifacts, each document
  at the path its type declares in .wingfoil/memory.yaml, so I can record decisions from day one.

  Background:
    Given an initialized WingFoil project

  # task-259 (bug-256): documents live at their declared paths, resolved against the project root
  # (task-017, task-172); only the type templates sit in ".wingfoil/memory/templates/".
  Scenario: Memory store is ready after initialization
    When I inspect the project structure
    Then ".wingfoil/memory.yaml" declares a path inside the project root for every Memory type
    And ".wingfoil/memory/templates/" holds the template of every type that declares one
    And both are tracked by git

  Scenario: Each Memory entry is individually versioned
    Given a Memory document "decision-1" exists
    When its content is modified and saved
    Then the change is captured as a distinct git commit for that file
    And prior versions remain retrievable from git history

  Scenario: Error - writing a Memory entry to a path outside the project root
    When a process attempts to write a Memory entry to "/tmp/decision-x.md"
    Then the write is refused
    And the system returns message "Memory entries must reside within the project root"
