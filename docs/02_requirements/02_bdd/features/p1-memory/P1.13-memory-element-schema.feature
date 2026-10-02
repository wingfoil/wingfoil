Feature: P1.13 (US-0A-04) - Memory Element Schema (memory.yaml)
  As Morgan, I want to define each element type (path pattern, states, transitions) in
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
