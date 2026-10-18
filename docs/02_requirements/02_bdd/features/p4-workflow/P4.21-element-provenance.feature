Feature: P4.21 - Element provenance (workflow adopt, rekey, transfer)
  As Morgan, I want to record which workflow step an existing element counts as created by, remap the
  records of a renamed step and move an element's ownership to another step, each as an audited commit,
  so that a project whose history predates the engine, or whose workflows change, starts and stays on
  the engine at the step it has really reached.

  Decision: dl-187 (rules 1–7, D1–D5); order of use on WingFoil's own repository: dl-186. Change:
  cp-002. Requirement: REQ-STATE-11. `adopt` and `rekey` ship in v0.3.1, `transfer` in v0.4.

  Background:
    Given an initialized WingFoil project with the main workflow "sw-life-cycle"
    And the instance "sw-life-cycle-1-plan" was started with "wingfoil workflow start sw-life-cycle"
    And the release-line "rl-v1" was added before the instance started, with no "WingFoil-Step" linkage
    And the instance's next step is "sw-life-cycle.seed-first-release-line", which adds a "release-line"

  Scenario: Adopt one existing element into the step that creates its type
    When I run "wingfoil workflow adopt sw-life-cycle-1-plan --step sw-life-cycle.seed-first-release-line --element release-line:rl-v1 --reason 'created by hand before the engine'"
    Then one empty commit is written with the subject "workflow: adopt sw-life-cycle-1-plan sw-life-cycle.seed-first-release-line release-line:rl-v1"
    And the commit carries the trailers "WingFoil-Instance", "WingFoil-Step" and "WingFoil-Adopted: release-line:rl-v1" and a "Reason:" block
    And the file of "rl-v1" is unchanged
    And "wingfoil workflow next sw-life-cycle-1-plan" no longer reports "sw-life-cycle.seed-first-release-line"
    And the command exits with code 0

  Scenario: Propose the adoptions of an instance without writing
    When I run "wingfoil workflow adopt sw-life-cycle-1-plan --plan"
    Then the output lists, in id order, every step blocked on a creation and the candidate elements its declared rules match
    And "sw-life-cycle.seed-first-release-line" is listed with the single candidate "release-line:rl-v1"
    And no commit is written
    And the command exits with code 0

  Scenario: Apply the proposed adoptions, one commit per step
    Given "wingfoil workflow adopt sw-life-cycle-1-plan --plan" lists 2 steps with a single candidate each
    When I run "wingfoil workflow adopt sw-life-cycle-1-plan --plan --apply --reason 'adoption of the pre-engine state'" as the approver
    Then 2 "workflow: adopt" commits are written, one per step
    And the command exits with code 0

  Scenario: Re-running an adoption already recorded is a no-op
    Given "release-line:rl-v1" was adopted into "sw-life-cycle.seed-first-release-line"
    When I run "wingfoil workflow adopt sw-life-cycle-1-plan --plan --apply --reason 'again'" as the approver
    Then no commit is written for "sw-life-cycle.seed-first-release-line"
    And the command exits with code 0

  Scenario: Rekey the records of a renamed step
    Given "release-line:rl-v1" was adopted into "sw-life-cycle.seed-first-release-line"
    And the phase "seed-first-release-line" was renamed "seed-release-line" in "sw-life-cycle"
    When I run "wingfoil workflow rekey sw-life-cycle-1-plan --from sw-life-cycle.seed-first-release-line --to sw-life-cycle.seed-release-line --reason 'phase renamed'" as the approver
    Then one empty commit is written with the subject "workflow: rekey sw-life-cycle-1-plan sw-life-cycle.seed-first-release-line sw-life-cycle.seed-release-line"
    And the commit records the mapping from the old key to the new one
    And "wingfoil workflow next sw-life-cycle-1-plan" does not report "sw-life-cycle.seed-release-line"
    And the command exits with code 0

  Scenario: Records naming a step that no longer exists are reported as orphans
    Given "release-line:rl-v1" was adopted into "sw-life-cycle.seed-first-release-line"
    And the phase "seed-first-release-line" was renamed "seed-release-line" and no rekey was recorded
    When I run "wingfoil workflow adopt sw-life-cycle-1-plan --plan"
    Then the output lists the adoption of "release-line:rl-v1" as an orphan of the unknown key "sw-life-cycle.seed-first-release-line"
    And "sw-life-cycle.seed-release-line" is listed with the single candidate "release-line:rl-v1"

  Scenario: Error - an element already owned by a step
    Given "release-line:rl-v1" was adopted into "sw-life-cycle.seed-first-release-line"
    When I run "wingfoil workflow adopt other-instance-plan --step sw-life-cycle.seed-first-release-line --element release-line:rl-v1 --reason 'x'"
    Then the command exits with code 1 and message "release-line:rl-v1 is already owned by sw-life-cycle-1-plan sw-life-cycle.seed-first-release-line; move it with workflow transfer"
    And no commit is written

  Scenario: Error - an element of another type than the step adds
    When I run "wingfoil workflow adopt sw-life-cycle-1-plan --step sw-life-cycle.seed-first-release-line --element task:task-042-login-form --reason 'x'"
    Then the command exits with code 1 and message "sw-life-cycle.seed-first-release-line adds a release-line, not a task"
    And no commit is written

  Scenario: Error - several candidates and no element named
    Given two release-lines "rl-v1" and "rl-v2" match the step's declared rules
    When I run "wingfoil workflow adopt sw-life-cycle-1-plan --step sw-life-cycle.seed-first-release-line --reason 'x'"
    Then the command exits with code 1 and message "2 candidates for sw-life-cycle.seed-first-release-line (release-line:rl-v1, release-line:rl-v2); name one with --element"
    And no commit is written

  Scenario: Error - an element that does not exist
    When I run "wingfoil workflow adopt sw-life-cycle-1-plan --step sw-life-cycle.seed-first-release-line --element release-line:rl-v9 --reason 'x'"
    Then the command exits with code 1 and message "document not found: rl-v9"
    And no commit is written

  Scenario: Error - the bulk operations need the approver
    When a member without the "approver" role runs "wingfoil workflow adopt sw-life-cycle-1-plan --plan --apply --reason 'x'"
    Then the command exits with code 1 and message "user not authorized to apply adoptions in bulk"
    And no commit is written

  Scenario: Edge - an adoption cannot pass a gate
    Given the step "release-line-cycle.approve" waits for "rl-v1" to leave the gate state "planning"
    And "rl-v1" is still "planning"
    When "release-line:rl-v1" is adopted into "sw-life-cycle.seed-first-release-line"
    Then "release-line-cycle.approve" still awaits the approver's "memory approve rl-v1"
