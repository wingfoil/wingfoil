Feature: P5.1.5 (US-0A-23) - wingfoil capabilities
  As Morgan, I want to print the file formats my WingFoil build reads, its commands and the capabilities it
  provides with `wingfoil capabilities` so that I know, before I install a template pack, whether this build can
  run it; an agent reads the same document as the MCP Resource `wingfoil://capabilities`.

  Spec: spec-019 (§1, §2, §3; T-3, T-9, T-11, T-12). Change: cp-003. The MCP Resource's scenarios are in
  `P5.2.1-mcp-resources.feature`.

  Background:
    Given a WingFoil build installed as the "wingfoil" command

  Scenario: Print the capabilities document as JSON
    When I run "wingfoil capabilities --format json" from the root of an initialized WingFoil project
    Then stdout is one JSON document whose top-level keys are "format", "wingfoil", "formats", "commands" and "capabilities", in that order
    And stderr is empty
    And the command exits with code 0

  Scenario: The YAML output parses to the JSON document
    When I run "wingfoil capabilities --format json" and "wingfoil capabilities --format yaml" from the same directory
    Then both commands exit with code 0
    And the YAML output parses to the document the JSON output holds

  Scenario: The same output outside a git repository
    Given a directory outside every git repository, holding no WingFoil project
    When I run "wingfoil capabilities --format json" from that directory and from the root of an initialized WingFoil project
    Then both commands exit with code 0
    And the two outputs are equal, byte for byte

  Scenario: Error - an operand is refused
    When I run "wingfoil capabilities extra"
    Then the command exits with code 2 and message "error: wingfoil capabilities takes no positional (got 1 positional)"
