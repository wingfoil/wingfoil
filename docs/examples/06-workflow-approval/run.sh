#!/usr/bin/env bash
# Example 06 — Journey 4: encode a team rule, run a workflow on a deliverable, route its approval to the
# approver role, record a checkpoint, and close the workflow. Needs the v0.3 workflow commands.
# WINGFOIL_EXAMPLE_TEMPLATE picks the `init` template (default Scrum); the e2e smoke runs it once per template.
source "$(dirname "$0")/../lib.sh"
new_repo

# Read a field of the last command's JSON output.
last_json() { json_field "$LAST_OUTPUT" "$1"; }

step init --template "${WINGFOIL_EXAMPLE_TEMPLATE:-Scrum}"
# One identity plays every part here: the developer who writes the task, and Morgan, the approver.
step dna add team.members --value "Ada Lovelace" --entry-email ada@example.com --entry-roles approver

# Journey 4, steps 1-2: a team rule, bound to the role that must follow it.
step directive create --name api-style
printf '\n- Every HTTP endpoint is versioned under `/v<n>/`.\n' >> .wingfoil/directives/custom/api-style.md
git commit --quiet -am "docs(directive): write the api-style rule"
step directive assign --directive api-style --role developer

# A workflow: write a task and have it approved (approval routed to the approver role), then a checkpoint
# that nothing in Memory records, completed by `workflow finalize`.
step workflow create deliver --kind main --description "Deliver one task, approved by the approver role"
cat > .wingfoil/workflows/custom/deliver.yaml <<'YAML'
name: deliver
startable: true
description: "Deliver one task, approved by the approver role"
version: 1.0
phases:
  - name: write
    description: "Write the task, submit it, have it approved."
    role: developer
    actions:
      - 'memory.add(type: task)'
      - memory.submit
      - memory.approve
    approval: { by_role: approver }
  - name: retrospective
    description: "A checkpoint: completed by wingfoil workflow finalize."
    role: developer
YAML
git commit --quiet -am "chore(wingfoil): the deliver workflow's phases"

# Start it: the workflow is recorded as a plan document (two commits) and becomes the active one.
expect_exit 0 workflow start deliver
expect_head "wf(plan): submit deliver-1-plan"
assert_eq "$(git log -1 --skip=1 --format=%s)" "wf(plan): add deliver-1-plan" "the plan's add commit"

# The next step names its role, the role's directives (api-style included) and the commands of its actions.
expect_exit 0 workflow next --format json
assert_eq "$(last_json 'd.next.key')" "deliver.write" "next step"
assert_eq "$(last_json 'd.next.role')" "developer" "its role"
assert_eq "$(last_json 'd.next.directives.some(x => x.id === "api-style")')" "true" "api-style among its directives"
assert_eq "$(last_json 'd.next.actions[0].token')" "memory.add(type: task)" "its first action"

# Journey 4, step 3: the deliverable, linked to the step it belongs to.
expect_exit 0 memory add --type task --title "Login form" --workflow deliver-1-plan --format json
expect_head "wf(task): add task-001-login-form"
assert_eq "$(git log -1 --format='%(trailers:key=WingFoil-Instance,valueonly)' | head -1)" "deliver-1-plan" "instance trailer"
assert_eq "$(git log -1 --format='%(trailers:key=WingFoil-Step,valueonly)' | head -1)" "deliver.write" "step trailer"

# Journey 4, step 4: submitted for approval — the approver is told by the "human needed" line.
expect_exit 0 memory submit task-001-login-form
expect_head "wf(task): submit task-001-login-form"
expect_exit 0 workflow status
case "$LAST_OUTPUT" in
  *"human needed: approve or reject task-001-login-form — routed to Ada Lovelace <ada@example.com>"*) ;;
  *) fail "workflow status printed no human-needed line for task-001-login-form" ;;
esac

# Not done yet: ending the workflow is refused, and writes nothing.
HEAD_BEFORE=$(git rev-parse HEAD)
expect_exit 1 workflow end
assert_eq "$(git rev-parse HEAD)" "$HEAD_BEFORE" "HEAD after a refused end"

# Journey 4, step 5: the approver approves, with a reason.
expect_exit 0 memory approve task-001-login-form --reason "Follows api-style"
expect_head "wf(task): approve task-001-login-form [pending → approved]"

# The step is complete; a step that is no longer on the frontier cannot be recorded.
HEAD_BEFORE=$(git rev-parse HEAD)
expect_exit 1 workflow finalize --step deliver.write@task:task-001-login-form
assert_eq "$(git rev-parse HEAD)" "$HEAD_BEFORE" "HEAD after a refused finalize"
case "$LAST_OUTPUT" in
  *"step 'deliver.write@task:task-001-login-form' is not on the frontier of deliver-1-plan"*) ;;
  *) fail "workflow finalize --step gave no off-frontier refusal" ;;
esac

# The checkpoint is next, and only a record completes it.
expect_exit 0 workflow next --format json
assert_eq "$(last_json 'd.next.key')" "deliver.retrospective@task:task-001-login-form" "next step"
assert_eq "$(last_json 'JSON.stringify(d.next.evidence.missing)')" '["record"]' "its missing evidence"
assert_eq "$(last_json 'd.next.evidence.finalizable')" "true" "finalizable"
# With an agent in team.agents, `wingfoil agent execute --next` would launch it on this step; it needs a
# terminal, so this script does not run it.

# The record: an empty commit, outside the wf() grammar, carrying the phase-record trailers.
expect_exit 0 workflow finalize
expect_head "workflow: finalize deliver-1-plan deliver.retrospective@task:task-001-login-form"
assert_eq "$(git show --name-only --format= HEAD)" "" "files changed by the record"
assert_eq "$(git log -1 --format='%(trailers:key=WingFoil-Phase,valueonly)' | head -1)" "deliver.retrospective completed" "phase trailer"

# Every step is complete: the workflow ends, its plan moving to done.
expect_exit 0 workflow end
expect_head "wf(plan): finalize deliver-1-plan [active → done]"
expect_exit 0 workflow status
case "$LAST_OUTPUT" in *"no open workflows"*) ;; *) fail "a workflow is still open" ;; esac

assert_clean
done_ok "Journey 4: a rule, a workflow, a submitted deliverable, a routed approval, a checkpoint, the workflow ended"
