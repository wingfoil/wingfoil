---
id: "bug-130-no-verb-unassigns-the-directive-that-remove-requires-unassigned"
type: bug
title: "`directive remove` refuses an assigned directive, but no command unassigns one — the only way out is a hand edit of `roles.yaml`"
status: triaged
severity: "low"
release-origin: "v0.2"
release: "v0.4"
feature: "P3.2"
contributor: ""
credit: ""
tmpl_version: 260703
---

## Summary

`directive remove <name>` correctly refuses a directive still bound to a role (REQ-SEC-07). The CLI
offers `directive assign` but nothing to undo it, so retiring a custom directive cannot be done with
WingFoil commands alone.

## Steps to Reproduce

1. A throwaway repository: `git init`, a git identity, then `wingfoil init --template Scrum`, with
`wingfoil` = `node dist/cli.js` built from branch `docs/user-docs-v0.2` at `79a76d6e`.
2. `wingfoil directive create --name api-style`, then `wingfoil directive assign --directive api-style --role developer`.
3. `wingfoil directive remove api-style` → `error: cannot remove 'api-style': still assigned to role 'developer'`, exit `1`.
4. Delete the line from `.wingfoil/roles.yaml` **without** committing → the same refusal (configuration is read at `HEAD`).
5. Commit the edit → `directive remove api-style` succeeds.

## Expected Behavior

A verb that removes an assignment — e.g. `directive unassign --directive <n> --role <r>` — committing
`wf(directive): unassign <n> from <r>`, symmetric with `assign`.

## Actual Behavior

Hand edit plus a hand commit whose message follows no WingFoil convention, which `memory history`-style
auditing cannot attribute to an operation.

## Notes

- Arguably a missing feature rather than a defect: triage may turn it into a decision-log on the
  directive command surface (P3.2 / spec-006 §3).
- Documented as a workaround in `docs/user-guide.md` §6.2, `docs/cli-reference.md` and
  `docs/examples/03-directives-per-role`.

## Triage & Execution Notes

- capture (bug-ingest, `bug-ingest-rel-v0.2-user-docs-findings-plan`): found during the v0.2
  `user-docs` phase probe (`user-docs-rel-v0.2-plan`, *Execution Notes → Findings*); proposed severity
  **low**. `release: ""` — scheduling belongs to `release-planning`.
