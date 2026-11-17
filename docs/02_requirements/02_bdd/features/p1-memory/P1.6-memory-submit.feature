Feature: P1.6 (US-3-09) - wingfoil memory submit
  As Jordan, I want to submit a Memory document for approval so it moves from draft to
  pending and reaches the reviewer.

  Background:
    Given an initialized WingFoil project
    And a Memory document "task-101" exists with "status: draft"
    And the "task" type allows the transition draft -> pending

  Scenario: Submit a draft document for approval
    When I run "wingfoil memory submit task-101"
    Then the document frontmatter becomes "status: pending"
    And the transition is recorded in git
    And the command exits with code 0

  # dl-106 W1 (a), with dl-054 kept for the subject (ruling R20), task-209: the author's uncommitted
  # edits ride in the submit commit, and its body says which; a pure transition has no such line.
  Scenario: Submit carries the author's content and declares it
    Given the document "task-101" has an uncommitted edit to its body
    When I run "wingfoil memory submit task-101"
    Then the transition is recorded in git as "wf(task): submit task-101"
    And the commit body names the content it carries as "Carries content: the body"
    And the command exits with code 0

  # dl-154-an-illegal-transition-prints-none-as-its-target-replacing-dl-053-s-canonical-edge (option A, replacing dl-053), task-181: a refused verb reaches nothing from <from>, so <to> is (none).
  Scenario: Error - submitting a document whose state machine forbids the transition
    Given a Memory document "task-200" exists with "status: approved"
    And the "task" type has no "submit" edge from approved
    When I run "wingfoil memory submit task-200"
    Then the state is unchanged
    And the command exits with code 1 and message "illegal transition approved -> (none) for type 'task'"

  Scenario: Error - submitting a non-existent document
    When I run "wingfoil memory submit task-999"
    Then the command exits with code 1 and message "document not found: task-999"

  # dl-212 D1, spec-018 §2.3–§2.4 (task-334): the explicit --co-author wins over the environment, and AI-Model:
  # records what the agent reports, or not-reported.
  Scenario: A submit run in an agent's session carries the agent's trailers
    Given the committed dna.yaml declares the team.agents entries "Claude" and "Other", each with an email
    And the variable WINGFOIL_AGENT is "Claude"
    When I run "wingfoil memory submit task-101"
    Then the submit commit's final paragraph ends with "Co-Authored-By: Claude <noreply@anthropic.com>" and "AI-Model: not-reported", after its "WingFoil-Version:" line, as one paragraph
    And the command exits with code 0

  Scenario: --co-author names the signing entry over the environment
    Given the committed dna.yaml declares the team.agents entries "Claude" and "Other", each with an email
    And the variable WINGFOIL_AGENT is "Claude"
    When I run "wingfoil memory submit task-101 --co-author Other --ai-model m-1"
    Then the submit commit's final paragraph ends with "Co-Authored-By: Other <other@example.com>" and "AI-Model: m-1"
    And the command exits with code 0

  Scenario: Error - --ai-model outside an agent's session
    Given no agent marker is present
    When I run "wingfoil memory submit task-101 --ai-model m-1"
    Then the state is unchanged
    And the command exits with code 2 and message "invalid flag combination: --ai-model needs an agent context (--co-author, or a session an agent started)"
