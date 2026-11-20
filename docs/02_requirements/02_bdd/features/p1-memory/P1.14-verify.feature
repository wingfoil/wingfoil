Feature: P1.14 (US-4-14) - wingfoil verify
  As Morgan, I want CI to check every pushed commit range with `wingfoil verify --base <rev>` so that a forged
  approval, an approval without authority or a status changed outside a Memory operation fails the build (exit 1)
  instead of reaching the audit trail unnoticed.

  Spec: spec-020 (AC-13; §4.4, §4.7, §4.9, §5.1, §7, §8; T-1, T-8, T-9, T-17, T-24, T-28). Change: cp-003.
  Requirements: REQ-SEC-02, REQ-SEC-03. T-1 is the nominal scenario the BDD index's coverage rule asks of every file.

  Background:
    Given a throwaway git repository holding an initialized WingFoil project
    And "team.members" holds one approver "Ada Approver <approver@example.invalid>" and one developer "Dev Developer <developer@example.invalid>"
    And a task "task-1" was added and submitted with the Memory verbs, so it is committed with "status: pending"
    And the last commit of that history is called BASE

  Scenario: Error - a forged approval fails the check
    # spec-020 T-8: bug-496's reproduction, a hand commit by someone outside team.members.
    Given a hand commit authored by "Stranger <stranger@example.invalid>", who is not in "team.members", with the subject "wf(task): approve task-1 [pending → backlog]"
    And its body holds the line "Approver: Nobody <nobody@example.invalid> (approver)" and a "Reason:" line
    And the commit moves "task-1" from "status: pending" to "status: backlog"
    When I run "wingfoil verify --base BASE --format json"
    Then the report has exactly two findings, both of check "authority"
    And their messages are "the author <stranger@example.invalid> holds no approver role in team.members (dl-094)" and "the Approver: line names <nobody@example.invalid>, but <stranger@example.invalid> authored the commit (dl-094)"
    And the report has no finding of check "state"
    And the command exits with code 1

  Scenario: Error - a status changed outside a Memory operation fails the check
    # spec-020 T-9 and §4.7: a hand edit with any other subject (bug-496's second case).
    Given a hand commit with the subject "docs: tidy" that changes "task-1" from "status: pending" to "status: backlog"
    When I run "wingfoil verify --base BASE --format json"
    Then the report has exactly one finding, of check "status-outside-wf"
    And its message is "<path>: its status went pending → backlog in a commit that is not a wf() Memory operation (dl-139)", where <path> is the repository-relative path of "task-1"
    And the command exits with code 1

  Scenario: Error - an approval carrying an agent trailer fails the check
    # spec-020 T-17 and §4.9 (spec-018 §4): one finding per agent-trailer line of a commit with an Approver: line.
    Given a hand commit authored by the approver with the subject "wf(task): approve task-1 [pending → backlog]", moving "task-1" from "status: pending" to "status: backlog"
    And its body holds "Approver: Ada Approver <approver@example.invalid> (approver)", a "Reason:" line, two "Co-Authored-By:" lines and one "AI-Model:" line
    When I run "wingfoil verify --base BASE --format json"
    Then the report has exactly three findings of check "approval-agent-trailer", with the messages:
      | message                                                                                                                                                   |
      | an approval commit (it has an Approver: line) carries no agent trailer (spec-018 §4, git-conventions §7), yet it has a Co-Authored-By: line                |
      | an approval commit (it has an Approver: line) carries no agent trailer (spec-018 §4, git-conventions §7), yet it has a Co-Authored-By: line (occurrence 2) |
      | an approval commit (it has an Approver: line) carries no agent trailer (spec-018 §4, git-conventions §7), yet it has an AI-Model: line                     |
    And the command exits with code 1

  Scenario: Findings before the introduction are history
    # spec-020 T-24 and §5.1: --introduced-at <rev> makes <rev> and its ancestors history.
    Given the forged approval of "Error - a forged approval fails the check" is committed as BAD
    When I run "wingfoil verify --introduced-at BAD^ --format json"
    Then the findings of BAD are gated, "verdict" is "fail" and the command exits with code 1
    When I run "wingfoil verify --introduced-at BAD --format json"
    Then the findings of BAD are listed under "history", none is gated, "verdict" is "pass" and the command exits with code 0

  Scenario: The report under json and yaml
    # spec-020 T-28 on T-6's repository, without --base: §7 (the report and the structured stderr) and §8.
    Given a hand commit authored by the developer with the subject "wf(task): approve task-1 [pending → backlog]", whose "Approver:" line names the approver
    When I run "wingfoil verify --format json"
    Then stdout holds only the report, with the keys "head", "base", "introducedAt", "checks", "commits", "findings", "stateUnchecked" and "verdict" in that order, and "verdict" is "fail"
    And stderr holds the document {"warning": "W_VERIFY_WHOLE_HISTORY: …"} on its own line, then the document {"error": "E_VERIFY_FINDINGS: …"}
    And the command exits with code 1
    When I run "wingfoil verify --format yaml"
    Then the YAML report parses to the JSON report
    And stderr holds the same warning and error, each as one YAML document opened by "---" and closed by "..."
    And the command exits with code 1

  Scenario: A range written by the verbs passes
    # spec-020 T-1: the nominal case; the approver-gated verbs run from the approver's own session.
    Given the commits after BASE were written only by "wingfoil memory add", "memory submit", "memory approve", "memory reject", "memory park", "memory amend", "memory deprecate" and an approval-phase "workflow finalize"
    When I run "wingfoil verify --base BASE --format json"
    Then the report has no finding and "verdict" is "pass"
    And the command exits with code 0
