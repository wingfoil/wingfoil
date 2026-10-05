Feature: P5.2.3 (US-2-11) - MCP Tools (state management)
  As the agent, I want to submit deliverables and update workflow state via MCP Tools so I
  record decisions without manual intervention.

  Background:
    Given a running WingFoil MCP server
    And a deliverable "task-101" has "status: draft"

  Scenario: Submit a deliverable through an MCP tool
    When the agent invokes the MCP tool "memory.submit" for "task-101"
    Then "task-101" transitions to "status: pending"
    And the change is committed to git with the agent as author

  Scenario: MCP tool state changes are validated against the type machine
    Given "task-101" has "status: approved"
    When the agent invokes "memory.submit" for "task-101"
    And type "task" has no "submit" edge from approved
    Then the tool returns error "illegal transition approved -> (none) for type 'task'"
    And the state is unchanged

  Scenario: Error - invoking a tool with a missing required argument
    When the agent invokes "memory.approve" without a "reason"
    Then the tool returns error "missing required argument: reason"
