Feature: P5.1.4 (US-0A-14) - CLI UX Improvements
  As Alex, I want clear help, formatting, and error messages so I use the CLI without
  confusion (cross-cutting).

  Background:
    Given an installed WingFoil CLI

  Scenario: Help is available for every command
    When I run "wingfoil <any-command> --help"
    Then usage, options, and at least one example are printed
    And the command exits with code 0

  # task-380 (spec-008 §8, design gate D2 (a) and D3 (a)): the help command's operands are a command path.
  Scenario: Help - the help command takes a command path
    When I run "wingfoil help memory add"
    Then the output is what "wingfoil memory add --help" prints
    And the command exits with code 0

  Scenario: Error - a help path operand that names no command is refused
    When I run "wingfoil help memory addd"
    Then the CLI exits with code 2
    And the message includes "unknown command 'addd'" and suggests "add"
    And nothing is written to stdout

  Scenario: Help - the help command's own help names its path
    When I run "wingfoil help help"
    Then the usage line is "Usage: wingfoil help [command]"
    And under a noun, "wingfoil memory help help" prints the usage line "Usage: wingfoil memory help [command]"
    And the command exits with code 0

  Scenario: Error - unknown command yields an actionable error
    When I run "wingfoil memroy add"
    Then the CLI exits with code 2
    And the message includes "unknown command 'memroy'" and suggests "memory"

  Scenario: Error - an operand beyond the one a command declares is refused
    When I run "wingfoil memory approve task-001 task-002 --reason ok"
    Then the CLI exits with code 2
    And the message is "error: wingfoil memory approve takes one positional <id> (got 2 positionals)"
    And no commit is written

  Scenario: Error - a bootstrap command refuses an operand in the same words
    When I run "wingfoil init extra"
    Then the CLI exits with code 2
    And the message is "error: wingfoil init takes no positional (got 1 positional)"
    And no commit is written

  Scenario: Error - errors use a consistent format with an exit code
    When any command fails with a user error
    Then the message follows the pattern "error: <reason>"
    And the exit code is non-zero

  Scenario: Error - a refusal has one shape under --format json, whichever layer raises it
    When I run "wingfoil --format json memroy add"
    Then the CLI exits with code 2
    And stderr is a single JSON object whose "error" is "unknown command 'memroy'"
    And whose "hint" names "memory"
    And no usage text is written

  # dl-154-an-illegal-transition-prints-none-as-its-target-replacing-dl-053-s-canonical-edge (option A, replacing dl-053), task-181: a refused verb reaches nothing from <from>, so <to> is (none).
  Scenario: Error - a refusal's details follow its error line
    Given "task-200" has "status: approved"
    When I run "wingfoil memory submit task-200"
    Then the CLI exits with code 1
    And the first line is "error: illegal transition approved -> (none) for type 'task'"
    And the next line is indented and names the document's file and why the edge is illegal
    And under "--format json" the same detail is an entry of the "details" array
