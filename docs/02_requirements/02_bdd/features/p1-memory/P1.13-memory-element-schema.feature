Feature: P1.13 (US-0A-04) - Memory Element Schema (memory.yaml)
  As Morgan, I want to define each element type (path pattern, state machine: sequence, gates, waiting) in
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

  # dl-110 P1 (a) / P3 (a), delivered by task-180 (`returns`, `limits`, `memory park`); scenarios 5-9 added
  # by task-205 (bug-250). Scenarios 10-11 are dl-156's (ratified Q2 (i), Q1 (a)), added by task-274: a
  # reject into a full state is not refused, and a holder on another branch counts.

  Scenario: A declared returns edge is taken by memory park
    Given type "task" declares "returns: { in-progress: backlog }"
    And task "task-001" is "in-progress"
    When I run "wingfoil memory park task-001 --reason 'blocked on a review'"
    Then the command exits 0
    And task "task-001" is "backlog"
    And exactly one commit is written, with subject "wf(task): park task-001 [in-progress → backlog]" and the body line "Reason: blocked on a review"

  Scenario: Error - park from a state with no returns edge
    Given type "task" declares "returns: { in-progress: backlog }"
    And task "task-002" is "in-review"
    When I run "wingfoil memory park task-002 --reason 'not now'"
    Then the command exits 1
    And the error message is "illegal transition in-review -> (none) for type 'task'"
    And nothing is written

  Scenario: Error - park without a reason
    Given task "task-001" is "in-progress"
    When I run "wingfoil memory park task-001"
    Then the command exits 2
    And nothing is written

  Scenario: Error - a transition into a state at its WIP limit names the holders
    Given type "card" declares "limits: { in-progress: 1 }"
    And card "card-001" is "in-progress" and card "card-002" is "draft"
    When I run "wingfoil memory submit card-002"
    Then the command exits 1
    And the error message is "WIP limit reached for 'in-progress' on type 'card' (limit 1): held by card-001. Move one of them out of 'in-progress', then retry. The holders are counted at HEAD and on every local and remote-tracking branch that changed them since it forked from HEAD, so the count depends on which refs were last fetched; a holder another branch records is moved out on that branch."
    And nothing is written

  Scenario: Error - the supersedes trigger into a state at its WIP limit is refused before anything is written
    Given type "adr" declares "limits: { superseded: 1 }"
    And adr "adr-0" is "superseded", adr "adr-1" is "accepted", and adr "adr-2" is "pending" with "supersedes: adr-1"
    When the approver runs "wingfoil memory approve adr-2 --reason 'replaces adr-1'"
    Then the command exits 1
    And the error message names "adr-0" as the holder of "superseded"
    And neither the approve commit nor the finalize commit is written, and "adr-2" is still "pending"

  Scenario: A reject into a state at its WIP limit is not refused
    Given type "task" declares "limits: { in-progress: 1 }" and the gate "in-review: { reject: in-progress }"
    And task "task-001" is "in-progress" and task "task-002" is "in-review"
    When the approver runs "wingfoil memory reject task-002 --reason 'tests missing'"
    Then the command exits 0
    And exactly one commit is written, with subject "wf(task): reject task-002 [in-review → in-progress]"
    And tasks "task-001" and "task-002" are both "in-progress", above the limit of 1, and nothing was refused

  Scenario: Error - a holder committed only on another branch counts toward the WIP limit
    Given type "card" declares "limits: { in-progress: 1 }"
    And no card is "in-progress" on the current branch, and card "card-003" is "in-progress" only on branch "task/other"
    And card "card-002" is "draft"
    When I run "wingfoil memory submit card-002"
    Then the command exits 1
    And the error message is "WIP limit reached for 'in-progress' on type 'card' (limit 1): held by card-003. Move one of them out of 'in-progress', then retry. The holders are counted at HEAD and on every local and remote-tracking branch that changed them since it forked from HEAD, so the count depends on which refs were last fetched; a holder another branch records is moved out on that branch."
    And nothing is written

  # bug-360 (REQ-SEC-06), added by task-313 (approver design gate 2026-10-30, D6 (b)): a type's `path` is one
  # relative path, refused at load when it holds a `..` segment or is absolute, so no `memory add` can be
  # pointed out of the folder the pattern names.

  Scenario: Error - a type path that holds a '..' segment or is absolute is refused at load
    Given ".wingfoil/memory.yaml" defines type "bug" with path "docs/memory/bug/../../outside/{id}.md"
    When the schema is validated
    Then validation fails, at "types.bug.path"
    And the error message is:
      """
      path "docs/memory/bug/../../outside/{id}.md" holds a '.' or '..' segment
      """
    And with path "/tmp/abs/{id}.md" instead, validation fails at "types.bug.path" with the error message:
      """
      path "/tmp/abs/{id}.md" must be a relative path
      """
