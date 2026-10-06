Feature: P1.1 (US-0A-01) - Git-Backed Storage
  As Alex, I want all project state stored in a centralized git repository — the configuration
  under .wingfoil/, the Memory documents at the paths .wingfoil/memory.yaml declares (its
  templates in .wingfoil/memory/templates/) — so I have a single, versioned source of truth from day one.

  Background:
    Given a project directory that is a git repository

  Scenario: Initialize the WingFoil storage structure
    Given the directory has no ".wingfoil/" folder
    When the WingFoil storage is initialized
    Then a ".wingfoil/" directory is created
    And it contains the subfolders "memory/", "directives/", and the files "dna.yaml", "memory.yaml", "workflows.yaml"
    And the new files are staged as a single git commit authored by the current git user

  Scenario: Persisting a pillar state file produces exactly one tracked change
    Given an initialized ".wingfoil/" structure
    When a pillar writes a state file under ".wingfoil/"
    Then the file is tracked by git
    And "git status" reports the file as a committed change with no untracked residue

  Scenario: Error - target directory is not a git repository
    Given a project directory that is NOT a git repository
    When the WingFoil storage is initialized
    Then initialization stops without creating ".wingfoil/"
    And the system returns exit code 1 with message "not a git repository: run 'git init' first"
