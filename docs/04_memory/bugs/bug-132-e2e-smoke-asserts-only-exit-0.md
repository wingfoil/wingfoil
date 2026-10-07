---
id: "bug-132-e2e-smoke-asserts-only-exit-0"
type: bug
title: "The dl-023 smoke asserts only exit 0, so `drive-cli`'s \"exit-codes match spec-005\" check is never exercised for exit 1 or 2"
status: in-review
severity: "low"
release-origin: "v0.2"
release: "v0.3"
feature: "P5.1"
contributor: ""
credit: ""
tmpl_version: 260703
---

## Summary

`e2e-smoke.yaml`'s `drive-cli` phase declares the post-check *"exit-codes match
spec-005-cli-command-contract"*. `spec-005` defines three exit codes (0 success, 1 domain failure,
2 usage error), but `scripts/e2e-smoke.cjs` only ever asserts that a happy-path command exits 0.

## Steps to Reproduce

1. `grep -n "exit-codes match" docs/self/.wingfoil/workflows/custom/e2e-smoke.yaml` shows the
   `drive-cli` post-check.
2. `sed -n '/^function commandCheck/,/^}/p' scripts/e2e-smoke.cjs` shows that every step fails
   unless it exits 0 (`run.status !== 0`). No step expects a non-zero code.
3. `node -e "const {smokeSteps}=require('./scripts/e2e-smoke.cjs'); console.log(smokeSteps('Scrum').map(s=>s.args.join(' ')).join('\\n'))"`
   lists eight steps, all happy paths.

## Expected Behavior

The smoke exercises at least one exit-1 case and one exit-2 case in a freshly initialised project, and
asserts the code, so a regression in the exit-code contract fails the release gate.

## Actual Behavior

An exit-code regression that affects only failure paths (for example, a domain failure mapped to 2, or a
usage error mapped to 1) passes the smoke.

## Notes

- Natural candidates, verified in `e2e-smoke-rel-v0.2-plan` H2:
  - `memory approve` in a scaffolded project exits **1**, with `user not authorized to approve
    type 'task'`, because no approver identity is bound (REQ-SEC-03, working as designed). This is an
    *expected* failure step, never a happy path.
  - An unknown option or a missing argument exits **2**.
- `docs/examples/05-ci-json-exit-codes/run.sh` already asserts 0, 1 and 2. It runs in the
  `e2e-smoke` phase as step S2b, but it is not part of the script that the publish pipeline reuses.
- H1 of the same plan: `scripts/e2e-smoke.cjs` is reused verbatim by `scripts/publish-staging.cjs`
  (`spec-015` §3 stage 3). Widening it widens the publish gate too.
- The step shape added by `task-107` (`capture` / `expect`) carries no expected exit code yet. A
  field such as `exit: 1` is the obvious extension.

## Triage & Execution Notes

- capture: found by the v0.2 `e2e-smoke` phase delta audit (`e2e-smoke-rel-v0.2-plan` §3.2 and its
  Execution Notes, 2026-09-25), filed under `bug-ingest-rel-v0.2-e2e-smoke-findings-plan` on
  2026-09-28. Proposed severity is `low`, because the gate is staged (`warn` until a release runs it
  green) and the gap is measured and recorded. `release` is left empty: the approver's decision of
  2026-09-22 authorises the gaps other than G1 to the next release.
