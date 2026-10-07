# Revised 2026-10-07 (task-218): scenarios 1-2 read "the agent initializes" as spec-016 §3.1 does —
# WingFoil assembles and validates the context at HEAD and proves the MCP server serves it before the
# agent is spawned (spec-016 §3.3 steps 7 and 11). That an interactive agent then fetches it is the
# agent's behaviour; the fake adapter's optional fetch asserts it is fetchable. Scenario 3 is unchanged.
Feature: P5.4.3 (US-1-04) - Agent Context Pre-Loading
  As the agent, I want DNA, Memory, and directives auto-fetched based on role and task so
  I initialize with full context without manual requests.

  Background:
    Given an initialized WingFoil project
    And an agent is launched for element "task:101" under role "developer"

  Scenario: Pre-load context within the time budget
    When the agent initializes
    Then WingFoil has assembled and validated DNA, relevant Memory, and role directives at HEAD
    And the MCP server registered for the agent has served that context before the agent is spawned
    And pre-loading completes in under 30 seconds

  Scenario: Pre-loaded context is scoped to role and task
    When the agent initializes
    Then the context the MCP server serves holds only Memory relevant to "task:101" and directives for "developer"

  Scenario: Error - a required context source is unavailable
    Given the MCP server is unreachable
    When the agent initializes
    Then initialization aborts before any task work begins
    And the message is "context pre-load failed: MCP server unreachable"
