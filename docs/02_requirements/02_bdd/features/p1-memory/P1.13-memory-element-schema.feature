Feature: P1.13 (US-0A-04) - Memory Element Schema (memory.yaml)
  As Morgan, I want to define each element type (path pattern, state machine: sequence, gates, waiting) in
  .wingfoil/memory.yaml so per-type state machines are enforced.

  Background:
    Given an initialized WingFoil project

  Scenario: Validate a well-formed element schema
    Given ".wingfoil/memory.yaml" defines type "release" with its own state machine
    When the schema is validated
    Then validation passes
    And the "release" type exposes initial state "draft"

  Scenario: A type with no explicit states uses the defaults block
    Given ".wingfoil/memory.yaml" defines type "note" without a "states" block
    When the schema is loaded
    Then type "note" uses the default machine draft -> pending -> approved
    And reject sends "note" from pending back to draft, with no "rejected" status
    And deprecate reaches deprecated from any state

  Scenario: Error - a transition references an undeclared state
    Given type "release" lists a transition target "shipped" not present in its "sequence"
    When the schema is validated
    Then validation fails
    And the error message is "transition target 'shipped' not in declared states for type 'release'"

  Scenario: Error - a type takes a name reserved for a configuration commit scope
    Given ".wingfoil/memory.yaml" defines a type named "workflow"
    When the schema is validated
    Then validation fails
    And the error message is "type name 'workflow' is reserved: wf(workflow) commits record configuration, not Memory"

  # dl-110 P1 (a) / P3 (a), delivered by task-180 (`returns`, `limits`, `memory park`); scenarios added by
  # task-205 (bug-250). A reject into a full state and holders on other branches are dl-156's (ratified
  # Q2 (i), Q1 (a)) and get their scenarios with the task that implements that ruling.

  Scenario: A declared returns edge is taken by memory park
    Given type "task" declares "returns: { in-progress: backlog }"
    And task "task-001" is "in-progress"
    When I run "wingfoil memory park task-001 --reason 'blocked on a review'"
    Then the command exits 0
    And task "task-001" is "backlog"
    And exactly one commit is written, with subject "wf(task): park task-001 [in-progress → backlog]" and the body line "Reason: blocked on a review"

  Scenario: Error - park from a state with no returns edge
    Given type "task" declares "returns: { in-progress: backlog }"
    And task "task-002" is "in-review"
    When I run "wingfoil memory park task-002 --reason 'not now'"
    Then the command exits 1
    And the error message is "illegal transition in-review -> (none) for type 'task'"
    And nothing is written

  Scenario: Error - park without a reason
    Given task "task-001" is "in-progress"
    When I run "wingfoil memory park task-001"
    Then the command exits 2
    And nothing is written

  Scenario: Error - a transition into a state at its WIP limit names the holders
    Given type "card" declares "limits: { in-progress: 1 }"
    And card "card-001" is "in-progress" and card "card-002" is "draft"
    When I run "wingfoil memory submit card-002"
    Then the command exits 1
    And the error message is "WIP limit reached for 'in-progress' on type 'card' (limit 1): held by card-001. Move one of them out of 'in-progress', then retry."
    And nothing is written

  Scenario: Error - the supersedes trigger into a state at its WIP limit is refused before anything is written
    Given type "adr" declares "limits: { superseded: 1 }"
    And adr "adr-0" is "superseded", adr "adr-1" is "accepted", and adr "adr-2" is "pending" with "supersedes: adr-1"
    When the approver runs "wingfoil memory approve adr-2 --reason 'replaces adr-1'"
    Then the command exits 1
    And the error message names "adr-0" as the holder of "superseded"
    And neither the approve commit nor the finalize commit is written, and "adr-2" is still "pending"
