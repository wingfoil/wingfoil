Feature: P5.2.1 (US-1-07) - MCP Resources (DNA + Memory)
  As the agent, I want to efficiently fetch DNA entries and Memory documents read-only via
  MCP Resources so I have pre-loaded project context.

  Background:
    Given a running WingFoil MCP server for an initialized project

  Scenario: Fetch a Memory document as an MCP resource
    When the agent requests the resource for Memory document "decision-12"
    Then the document content and metadata are returned
    And the response is produced in under 1 second

  Scenario: Resources are read-only
    When the agent attempts to write through the MCP Resources interface
    Then the write is refused
    And the server returns error "resources are read-only"

  # spec-019 §6, T-15, T-16 (cp-003): the build's capabilities document, read without reading the project.
  Scenario: Read the capabilities document as an MCP resource
    When the agent reads the resource "wingfoil://capabilities"
    Then the server returns one content entry with MIME type "application/json"
    And its text is the JSON "wingfoil capabilities --format json" prints from the same build, without the final newline

  Scenario: Error - a write to the capabilities resource is refused
    When the agent attempts to write through the resource "wingfoil://capabilities"
    Then the write is refused
    And the server returns error "resources are read-only"

  Scenario: Error - requesting a non-existent resource
    When the agent requests the resource for "decision-999"
    Then the server returns error "resource not found: decision-999"
