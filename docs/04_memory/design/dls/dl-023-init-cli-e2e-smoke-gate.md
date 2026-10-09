---
id: "dl-023-init-cli-e2e-smoke-gate"
type: decision-log
title: "Standing fresh-init + CLI end-to-end smoke gate before release-submit"
status: ready
context: "process"
release: "v0.2"
tmpl_version: 260703
---

## Context

`retro-v0.1` (T5/T7 dispositions) traces two related v0.1 gaps to a single missing safety net.

**(a) `init` scaffolds config that fails its own schemas.** `bug-005-init-scaffold-fails-schema-validation`
(critical) found that `wingfoil init` (any template) writes a `dna.yaml` that fails
`spec-002-dna-yaml-schema`'s own `DnaYaml` Zod schema and a `memory.yaml` whose types carry no
`id_pattern` — so `dna show`, `dna set`, `paths`, and `memory add` all error immediately, exit `1`, on
a freshly-initialized project. It was caught only by luck, at the very **last** task of the release
(`task-032-readme-cli-quickstart`), during manual real-CLI verification of the README quick-start
walkthrough — not by any automated check. `bug-006-init-directive-scaffold-schema-invalid` (still
`open`) is the same class of defect one layer down: the directive-template generator omits `id`,
`type: directive`, and `title`, so `wingfoil directives list` errors `E_VALIDATION` on a fresh project.

**(b) The CLI is the least-tested layer.** Three polish bugs escaped to release regardless
(`bug-001-cli-version-flag`, `bug-002-cli-error-stack-dump`, `bug-003-cli-integration-dist-race`, all
now `closed`), and `task-006`/`task-007` (dual-interface shared core, npm distribution) discovered that
commander v15 is ESM-only and therefore untestable under the project's CommonJS Jest runtime
(`bug-007-commander-esm-jest-untestable`, `open`, deferred to v0.2) — so CLI wiring is excluded from
automated coverage and "only ever verified by hand."

**Root cause, common to both:** nothing in the release workflow ever ran a real `wingfoil init` end-to-
end and then exercised the scaffolded project through the CLI surface as a standing, repeatable gate.
Scaffold/schema drift and CLI-wiring regressions were only ever caught by whichever task happened to
touch that area manually — in `bug-005`'s case, almost not at all.

## Decision

Add a standing **fresh-init + CLI end-to-end smoke gate**
run every release, before `release-submit`:

- It runs a real `wingfoil init` (each supported template: Scrum, Kanban) into a throwaway directory,
  then drives the scaffolded project through the CLI surface — `dna show`, `dna set`, `memory add`,
  `memory submit`, `paths`, `directives list`, at minimum — asserting **correct exit codes** per
  `spec-005-cli-command-contract` and **schema-valid scaffolded artifacts**: `dna.yaml`, `memory.yaml`,
  and the directive `.md` files must each round-trip through their own loaders/Zod schemas
  (`spec-002-dna-yaml-schema` and the memory/directives equivalents), not merely "look right."
- Implemented as a new `e2e-smoke.yaml` sub-workflow (`kind: sub`, `element: release`), wired into
  `release-cycle.yaml` immediately before `release-submit` — either as its own phase or as a
  `release-submit` pre-check; the config task that ratifies this decides the exact wiring shape.
- **Staged rollout**, same posture as `dl-013`'s docs-gate B-DECISION (`retro-v0.1` Actions): the gate
  starts as `warn` (reports failures, does not block) and flips to hard-reject once it runs green for a
  release, so the gate doesn't itself become a bootstrap blocker.
- Does **not** duplicate the existing bug records. `bug-004`, `bug-005`, `bug-006`, and `bug-007`
  remain their own defects with their own fixes/dispositions; this DL is the **process gate** that
  would have caught `bug-005`/`bug-006` at release time and would continue to catch their class of
  regression going forward — it does not resolve any of them by itself.

## Rationale

- **A black-box safety net at exactly the boundary v0.1 left untested.** Every other v0.1 test layer
  (unit, BDD) exercises code paths directly; nothing exercised "a user runs `init` then uses the CLI"
  as a single scenario — which is precisely how `bug-005` slipped through 32 tasks undetected.
- **Would have caught `bug-005` at `release-submit`, not at the last task.** The gate turns "caught by
  luck during README verification" into "caught deterministically, every release, before submit."
- **Complements, doesn't compete with, `bug-007`'s fix.** `bug-007` is a white-box (in-process,
  in-Jest) fix for CLI testability; this gate is a black-box (real subprocess, real filesystem) check
  that still has value even once `bug-007` lands — it's the only layer that exercises the actual
  `init`-scaffolded artifacts a real user would get.
- **Determinism and quality.** The tool's core promise is that it can bootstrap a valid project
  (P5.1.1); that must be verified automatically every release, not left to whichever task happens to
  touch the CLI by hand (REQ-SYS-07 / REQ-STATE-09 — explicit declared checks over inferred diligence).
- **Trade-off considered.** A new release gate carries its own maintenance cost (fixtures, a throwaway
  init target, cross-platform subprocess spawning) against the cost of shipping a tool whose `init`
  can't produce a schema-valid project. v0.1 already demonstrated the risk is real and not
  hypothetical, so the gate was chosen over leaving this to manual diligence; the staged warn→reject
  rollout bounds the near-term cost.

## Actions

- [ ] Ratify this decision (owner: approver), as part of the `retro-v0.1` bootstrap DL batch.
- [ ] On `ready`, as config task(s): (1) author `e2e-smoke.yaml` (`kind: sub`, `element: release`,
  `produces:` a smoke-test report); (2) wire it into `release-cycle.yaml` before `release-submit`;
  (3) start it in `warn` mode; flip to hard-reject once a release runs it clean (coordinate the
  warn→reject staging record with `dl-013`, per `retro-v0.1`'s B-DECISION action).
- [ ] Note explicitly in the gate's own docs that it complements, and does not replace or close,
  `bug-004`, `bug-005`, `bug-006`, or `bug-007` — each keeps its own lifecycle.
- [ ] Cross-reference from `bug-006`'s Execution Notes once the gate exists, so re-opening `bug-006`'s
  fix can use the gate to verify it.

> **Implemented out-of-flow in the v0.1→v0.2 config-bootstrap** (branch `design/config_bootstrap_v0.2`; see `docs/05_plans/rl-v1/rel-v0.1/retrospective-and-config-bootstrap-plan.md`). `release: v0.2` — already delivered; no further task derivation by v0.2 `build-backlog`.

## Staging record — 2026-09-28

The approver placed this record here, as the `retro-v0.1` B-DECISION action allowed: *"Record the
B-DECISION … choice here or on `dl-013`/`dl-023`"*. The ruling was made at S5.2 of
`e2e-smoke-rel-v0.2-plan`.

- **The B-DECISION chosen is Option 2, staged.** Each new gate warns on failure until it runs green for
  a release, and then it hard-rejects. `e2e-smoke.yaml` states this in its own description and in its
  `gate` phase.
- **The docs-gate half is already closed.** `dev-loop.yaml` `refactor` `checks.post` has enforced
  `docs.api.*` as a hard reject since `task-062-typedoc-tsdoc-backfill` closed its ramp, as the inline
  comment on that key records. Nothing is left to stage there.
- **Smoke gate, v0.2.** v0.2 is the first release in which the `e2e-smoke` phase runs, so it ran in
  **warn**. The gate report was **PASS**: the smoke exited 0 with 20/20 `ok` on both templates, after
  `task-107` closed `bug-029`. The approver approved the `gate` phase on 2026-09-28.
- **The flip to hard-reject happens in v0.3.** The approver ruled on 2026-09-28 (S5.1): from v0.3 on, a
  failing `e2e-smoke` gate **blocks** `release-submit`. v0.2 stays in warn, having passed.
  `e2e-smoke.yaml` still describes the staged posture ("warn … until green for a release, then flip").
  Its `gate` text must be amended to state hard-reject **before v0.3's `e2e-smoke` phase runs**. That
  amendment edits the same file as `bug-134`'s `produces:` fix and rides with it, behind a task
  (plan H8), so `bug-134` carries it.
- **Smoke gate, v0.2.2 — hard-reject, brought forward.** v0.2.2 is a patch released before v0.3, so
  the ruling above did not name it. At D1 of `e2e-smoke-rel-v0.2.2-plan` the approver ruled on
  2026-09-29 that v0.2.2 already runs in **hard-reject**: v0.2 ran green, and that meets the flip
  condition of the staged posture. The gate report was **PASS**, so the ruling blocked nothing. The run
  had 20/20 `ok` on the smoke, 5/5 `docs/examples`, and `check:mcp` passing on the first run of the
  `mcp-registration` phase. The approver approved the `gate` phase on 2026-09-29. From here on a failing
  `e2e-smoke` gate blocks `release-submit`. The `e2e-smoke.yaml` text amendment still rides with
  `bug-134`.
- **`produces:` — yes.** At S5.3 the approver ruled that `e2e-smoke.yaml` gains the smoke-test report
  that Actions item (1) asked for. The change is carried by `bug-134-e2e-smoke-yaml-declares-no-produces`
  (`triaged`), and it is made behind a task, not inline.

**Note (2026-10-09, `dl-099` Action 3; W3 B3 follow-ups, `bug-ingest-rel-v0.3-w3b3-review-findings-plan`).** The gate
this decision describes is extended by `dl-099-release-gates-run-on-every-candidate-on-a-fresh-project` (`ready`),
which this note points to as its Action 3 asks. Read the Decision above together with it: the smoke runs on every
release candidate, against the candidate's packed tarball rather than the working tree (`dl-099` §1); it drives each
template through a use scenario — every built-in machine shape through `add → submit → approve`, one `reject`, one
`deprecate`, `memory history` on each — re-loading what each command wrote and asserting exact exit codes,
including 1 and 2 (`dl-099` §3); it declares its report under `produces:` (§3); and its smoke part also runs in CI
on every push (§4 (c), ratified with (a)). `task-207` delivered the smoke side in v0.3 (`e2e-smoke.yaml` 1.4, the
gate hard-rejecting at `severity: reject` in `workflows/bindings.yaml`, the report under `docs/07_gates/`, a CI
job in `.github/workflows/ci.yml`; `bug-132`, `bug-133`, `bug-134` closed). The staging rehearsal of `dl-099` §2 and
the candidate re-entry are `task-219`'s (`backlog`). The minimum command list of the Decision above stays a floor,
not the scenario.
