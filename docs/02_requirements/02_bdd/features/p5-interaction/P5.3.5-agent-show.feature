Feature: P5.3.5 - wingfoil agent show <run-id>
  As Morgan, I want to print one recorded agent run and the commit that added it, so I can see
  what an agent did on a step — its role, agent, exit status, duration and token counts — and
  trace the record back to its commit.

  Contract: spec-016-agent-execution §6 (command), §4.2 (record), §4.3 (run id), §5.1 (baseline
  HEAD, declared). Decision: dl-135 point 4 and Action 3. Fit tests:
  test/core/agent-show.test.ts and test/cli/agent-show.integration.test.ts (task-220).

  Background:
    Given an initialized WingFoil project whose dna.yaml declares "paths.runs: [docs/runs/]"
    And the run "task-042-login-form/red/1" is recorded in "docs/runs/task-042-login-form.jsonl"
    And the record was committed as "agent: record task-042-login-form/red/1"

  Scenario: Show a recorded run
    When I run "wingfoil agent show task-042-login-form/red/1"
    Then the output has one "key: value" line per record field, in the record's key order
    And the token counts are the four lines "tokens.input", "tokens.output", "tokens.cache_read" and "tokens.cache_write"
    And the last line is "commit: <sha>", where <sha> is the "agent: record task-042-login-form/red/1" commit
    And the command exits with code 0

  Scenario: Show a recorded run as JSON
    When I run "wingfoil agent show task-042-login-form/red/1 --format json"
    Then the output is one JSON object with the keys "baseline", "run" and "commit"
    And "baseline.rev" is "HEAD" and "baseline.commit" is the sha HEAD names
    And "run" is the record as the run log holds it
    And "commit" is the sha of the "agent: record task-042-login-form/red/1" commit

  Scenario: Error - malformed run id
    When I run "wingfoil agent show task-042-login-form"
    Then the command exits with code 2 and message "invalid run id \"task-042-login-form\", expected <element-id>/<phase>/<n>"
    And nothing is read from the project

  Scenario: Error - unknown run id
    When I run "wingfoil agent show task-042-login-form/red/2"
    Then the command exits with code 1 and message "run not found: task-042-login-form/red/2"

  Scenario: Edge - the run is only in the working tree
    Given the run "task-042-login-form/red/2" is appended to "docs/runs/task-042-login-form.jsonl" and not committed
    When I run "wingfoil agent show task-042-login-form/red/2"
    Then the command exits with code 1 and message "run not found: task-042-login-form/red/2"
    And a "hint:" line says the working tree's run log holds the run and HEAD does not
