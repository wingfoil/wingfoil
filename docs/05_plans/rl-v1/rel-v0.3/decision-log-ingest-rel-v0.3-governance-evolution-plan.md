---
id: decision-log-ingest-rel-v0.3-governance-evolution-plan
type: plan
title: "Decision-log-ingest — rel-v0.3 governance evolution"
status: done
version: "1.0"
workflow: "decision-log-ingest"
phase: "rel-v0.3-governance-evolution"
element: "minor-v0.3"
release: "v0.3"
tmpl_version: 261006   # Orignal template version
---

## Context

On 2026-10-09 the approver asked for a new first-level capability in the vision, **Governance Evolution**: WingFoil
governs the evolution of a project's governance (Defined → Configured → Executed → Evaluated → Changed →
Reconfigured), through explicit mechanisms to represent, apply, verify and trace a change, the same at bootstrap
(the `wingfoil-templates` Initialization Template: User Intent → Questions → Project Definition → WingFoil
Configuration) and for the rest of the project's life. The capability must be built into the existing governance,
not beside it, and be concrete enough to be implemented and tested.

A change to the vision has a governed way in, `dl-132`'s `vision-change` with the `change-proposal` type, but
it is not built yet (`task-212`, `backlog`, v0.3 wave 3). Until it is, a vision change enters as a decision-log
(the interim `dl-132` itself describes), so this request is captured through `decision-log-ingest`
(`.wingfoil/workflows/custom/decision-log-ingest.yaml` v1.0), on branch `intake/governance-evolution` in its own
worktree, without touching `main` or the v0.3 dev-loop's branches. Memory operations use the build under
development (`npm run -s build && node dist/cli.js`).

The vision and requirements are **not** edited by this plan: an agent has no approval authority, and the edit is
the downcast the decision-log's Actions 2–3 schedule once it is ratified.

Every fact the decision-log states was checked at capture on `main` at `1ce84a54`, with the command named next
to it in its *Context*: the `init` advice (`src/core/init.ts:59`), the `wf(dna)` / `wf(directive)` subjects
and their options, the nine Memory types, the governance check skipping configuration scopes, Journey 6, the 134
configuration commits with no `wf()` among them, the v0.4 rows of the features, and the "five pillars" wording
(`grep -ci` over `README.md`, `CLAUDE.md`, the product brief and the features).

## Phases / Steps

1. **capture** (product-owner): `memory add --type decision-log` → `dl-164`, then `memory submit` →
   `in-discussion`.
2. **approve** (⛔ approver): **not run by this plan.** Approver ruling, 2026-10-09: `dl-164` is judged at the
   next release-planning (v0.4), whose `reconcile-governance` phase selects it (`where:` `type: decision-log`,
   `status: in-discussion`, `release: ""`). There Q1 (the Memory type), Q1b (declared in every scaffold), Q2 (the
   `apply` verb), Q3 (the trailer's strictness), Q4 (the place in the vision) and Q5 (the release) are ratified,
   `in-discussion → ready`, or rejected to `draft`.

## Handoff

- **Approver:** Q1–Q5 and the ratification, at v0.4 `release-planning`'s `reconcile-governance`; the release
  stamp (`assign`).
- **Agent:** capture and its fact checks; after ratification, the vision and requirements downcast (Actions 2–3)
  through `vision-change` if `task-212` has landed, otherwise under a task derived by v0.4 `build-backlog`.
- **Merge:** the branch is handed to the session that merges onto `main` (fast-forward after a rebase and an id
  collision check), as the intake branches are.
- **Completion criteria:** `dl-164` captured `in-discussion` (capture only, approver ruling 2026-10-09); this plan
  `active → done`. The ratification is v0.4 release-planning's, not this plan's.

## Execution Notes

- **capture done (2026-10-09)** — `dl-164`, `in-discussion`. Recommendations stated: Q1 (b) a
  `governance-change` type (`draft → in-analysis → accepted → applied → verified`); Q1b in every scaffold; Q2 (i)
  a new verb `apply`; Q3 (A) warn-first ratchet; Q4 (a) a sixth pillar P6, features P6.1–P6.7; Q5 (x) v0.4 for
  the vision, requirements, configuration and coherence check, the CLI surface scheduled by v0.4 planning. Its
  *Verification* section maps the approver's five verifiable points to tests.
- **scope reduced to capture (2026-10-09)** — approver ruling: the decision-log is judged at the next
  release-planning, so this plan does not stay open until then; it closes at capture (`active → done`).
