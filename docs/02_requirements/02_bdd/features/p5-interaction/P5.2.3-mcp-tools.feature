Feature: P5.2.3 (US-2-11) - MCP Tools (state management)
  As the agent, I want to submit deliverables and update workflow state via MCP Tools so I
  advance my own work without manual intervention, while an approval, a rejection or an
  amendment stays the approver's (the Tools for them refuse).

  Background:
    Given a running WingFoil MCP server
    And a deliverable "task-101" has "status: draft"

  Scenario: Submit a deliverable through an MCP tool
    When the agent invokes the MCP tool "memory.submit" for "task-101"
    Then "task-101" transitions to "status: pending"
    And the change is committed to git with the agent's "Co-Authored-By:" and "AI-Model:" trailers

  # dl-154-an-illegal-transition-prints-none-as-its-target-replacing-dl-053-s-canonical-edge (option A, replacing dl-053), task-181: a refused verb reaches nothing from <from>, so <to> is (none).
  Scenario: MCP tool state changes are validated against the type machine
    Given "task-101" has "status: approved"
    When the agent invokes "memory.submit" for "task-101"
    And type "task" has no "submit" edge from approved
    Then the tool returns error "illegal transition approved -> (none) for type 'task'"
    And the state is unchanged

  # W1-R2, spec-018 §3.2 (cp-003): every MCP call is an agent context, so the approver-gated verbs are listed
  # Tools whose every call refuses. The marker list the message goes on to name is not pinned here: an MCP call is
  # marked by spec-018 §1 row 5, the MCP Tools channel, whose phrase is "the call came through the MCP server".
  Scenario Outline: Error - an approver-gated Tool refuses in an agent context
    Given "task-101" has "status: pending"
    When the agent invokes the MCP tool "<tool>" for "task-101" with a "reason"
    Then the tool returns an error starting "E_AGENT_CONTEXT: 'memory <verb>' needs the approver and does not run in an agent's session"
    And the state is unchanged
    And no commit is written

    Examples:
      | tool           | verb    |
      | memory.approve | approve |
      | memory.reject  | reject  |
      | memory.amend   | amend   |

  Scenario: Error - invoking a tool with a missing required argument
    When the agent invokes "memory.approve" without a "reason"
    Then the tool returns error "missing required argument: reason"
