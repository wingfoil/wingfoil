Feature: P1.2 (US-0A-02) - Versioning & Audit Trail
  As Morgan, I want every change (Memory, DNA, Directives, Workflow) tracked via git
  with author, timestamp, and commit message so the audit trail is complete without
  manual effort.

  Background:
    Given an initialized WingFoil project with a configured git user

  Scenario: Every state change records author and timestamp
    Given a Memory document "task-101" exists
    When its frontmatter "status" changes from "draft" to "pending"
    Then a git commit is created for the change
    And the commit records the author identity and an ISO-8601 timestamp
    And the commit message references the document id "task-101" and the new state "pending"

  Scenario: Audit trail completeness across pillars
    Given changes were made to DNA, a directive, and a workflow file
    When the audit trail for the project is queried
    Then 100% of those changes are attributable to an author and a timestamp
    And no change is reported as "unknown author"

  Scenario: Error - committing a change with no configured git identity
    Given the git user name and email are not configured
    When a state change is attempted
    Then the change is not committed
    And the system returns exit code 1 with message "git identity not configured (user.name/user.email)"

  # REQ-STATE-10 (US-6-12, task-222): process conformance, the Determinism Index's component P
  # (dl-131), computed from the audit trail and the configuration alone — the release-health
  # catalogue's P01–P07 (docs/08_health/metrics.yaml). Measured by scripts/release-health/measure.cjs
  # (task-231); exercised by test/release-health/measure.test.ts.
  @REQ-STATE-10
  Scenario: Process conformance names every failing item
    Given a commit range whose head carries the WingFoil configuration
    And the range holds one malformed "wf(task): approve" commit with no "Approver:" line
    When the process conformance of the range is computed
    Then each check reports the number of items checked and the number that fail
    And the well-formed-commit check reports exactly that commit as failing, by its sha
    And no other check reports a failure

  @REQ-STATE-10
  Scenario Outline: Process conformance names an injected defect of kind <kind>
    Given a commit range whose head carries the WingFoil configuration, with no failing item on any check
    And the range holds one injected defect: <defect>
    When the process conformance of the range is computed
    Then the <check> check reports exactly that defect as its one failing item
    And no other check reports a failure

    Examples:
      | kind | defect                                                                          | check                          |
      | 2    | a status change that is not an edge of its type's state machine                | legal-transition (P02)         |
      | 3    | a phase recorded complete whose produces artifact is absent at the head        | produces-present (P03)         |
      | 4    | a task citing a feature id that resolves to nothing                            | traceability (P04)             |
      | 5    | a phase run in the same session as a phase its distinct_from names             | roles and separation (P05)     |

  @REQ-STATE-10
  Scenario: Process conformance is byte-identical on a rerun
    Given a commit range and the configuration at its head
    When the process conformance of the range is computed twice
    Then the two reports are byte-identical
