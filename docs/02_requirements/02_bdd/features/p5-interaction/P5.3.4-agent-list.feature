Feature: P5.3.4 - wingfoil agent list [--past] [--waiting]
  As Morgan, I want to list the agent runs recorded on the project and the workflow steps waiting
  for an agent, so I can see what agents have done and what they can take next, without reading
  the run log or the workflow state by hand.

  Contract: spec-016-agent-execution §5 (command), §4.5 (reading the log), §5.1 (baseline HEAD,
  declared); spec-017 §1.2 (W_UNCOMMITTED_INPUTS), §1.3 (frontier order), §6.3 (agentRole).
  Decision: dl-135 points 1 and 4, Action 3. Fit tests: test/core/agent-list.test.ts and
  test/cli/agent-list.integration.test.ts (task-240).

  Background:
    Given an initialized WingFoil project whose dna.yaml declares "paths.runs: [docs/runs/]"
    And dna.yaml lists the agents "Zed" (adapter "zed") and "Amy" (adapter "amy") executing as "developer", in that order
    And no agent executes as "qa"

  Scenario: Past runs, ordered by element and then by record
    Given "docs/runs/task-b.jsonl" holds the runs "task-b/red/1" then "task-b/design/1", committed
    And "docs/runs/task-a.jsonl" holds the run "task-a/green/1", committed after them
    When I run "wingfoil agent list --past"
    Then the output lists "task-a/green/1", "task-b/red/1", "task-b/design/1" in that order
    And each run is one line "<id>  <role>  <agent>  <exit_status>  <duration>  <tokens>"
    And the tokens are "<input>/<output>", or "not-reported" when the agent reported neither
    And the command exits with code 0

  Scenario: No past runs
    Given the run log holds no run of element "task:task-z"
    When I run "wingfoil agent list --past --element task:task-z"
    Then the output is "no past runs"
    And the command exits with code 0

  Scenario: Steps waiting for an agent
    Given two open workflow instances whose frontiers hold parallel steps
    And one frontier step's role is "qa"
    When I run "wingfoil agent list --waiting"
    Then only the steps whose role is "developer" are listed, in frontier order
    And each step is one line "<step key>  <role>  <agents>", the agents "Zed, Amy" in dna.yaml order

  Scenario Outline: Both sections without a section flag, or with both
    When I run "wingfoil agent list <flags>"
    Then the output has the past section, then the waiting section
    And "--format json" prints one object with the keys "baseline", "past", "waiting" and "diagnostics"

    Examples:
      | flags              |
      |                    |
      | --past --waiting   |

  Scenario: Error - --active is not in this release
    When I run "wingfoil agent list --active"
    Then the command exits with code 2 and message "unknown option '--active'"

  Scenario: Edge - a run log changed only in the working tree
    Given the run "task-a/green/2" is appended to "docs/runs/task-a.jsonl" and not committed
    When I run "wingfoil agent list --past"
    Then "task-a/green/2" is not listed
    And a "warning:" line names "W_UNCOMMITTED_INPUTS" and "docs/runs/task-a.jsonl", once
    And the command exits with code 0

  Scenario: Edge - no run log declared
    Given dna.yaml declares no "paths.runs"
    When I run "wingfoil agent list --past"
    Then the output is "no past runs"
    And a "warning:" line says "dna.yaml declares no run log (paths.runs)"
    And the command exits with code 0

  Scenario: Error - a committed run log that is not valid
    Given "docs/runs/task-1.jsonl" holds the committed line "not json"
    When I run "wingfoil agent list"
    Then the command exits with code 1 and message "run log docs/runs/task-1.jsonl: line 1 is not a valid run record: not JSON"
